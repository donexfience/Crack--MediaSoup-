import cors from "cors";
import express, { Router, Request, Response, Application } from "express";
import morgan from "morgan";
import { Socket } from "socket.io";
import fs from "fs";
import { Server as SocketIOServer } from "socket.io";
import {
  createServer as createHttpsServer,
  Server as HttpsServer,
} from "https";
import mediasoup, { types } from "mediasoup";
import { createWorkers } from "./config/Workers/createWorker";
import config from "./config/config";
import createWebRtcTransportBothKinds from "./config/createWebRTCBothKinds/createWebRTCBothKinds";

interface ServerOptions {
  port: number;
  routes: Router;
  apiPrefix: string;
}

export class Server {
  private readonly app: Application;
  private readonly port: number;
  private readonly routes: Router;
  private readonly apiPrefix: string;
  private httpsServer: HttpsServer;
  private io: SocketIOServer;
  private workers: types.Worker[];
  private router: types.Router;
  private theProducer: types.Producer | null;
  private clientProducerTransport: types.WebRtcTransport | null;
  private clientConsumerTransport: types.WebRtcTransport | null;
  private theConsumer: types.Consumer | null;

  constructor(configOptions: ServerOptions) {
    const { port, apiPrefix, routes } = configOptions;
    this.app = express();
    this.port = port;
    this.routes = routes;
    this.apiPrefix = apiPrefix;
    this.workers = [];
    this.router = null as any;
    this.theProducer = null;
    this.clientProducerTransport = null;
    this.clientConsumerTransport = null;
    this.theConsumer = null;

    const key = fs.readFileSync("./config/cert.key");
    const cert = fs.readFileSync("./config/cert.crt");
    const options = { key, cert };

    this.httpsServer = createHttpsServer(options, this.app);

    this.io = new SocketIOServer(this.httpsServer, {
      cors: {
        origin: ["http://localhost:5173"],
        methods: ["GET", "POST"],
        credentials: true,
      },
    });
  }

  public async start(): Promise<void> {
    console.log(`API Prefix: ${this.apiPrefix}`);
    await this.initMediaSoup();

    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(
      cors({
        origin: ["http://localhost:5173"],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        credentials: true,
        allowedHeaders: [
          "Origin",
          "X-Requested-With",
          "Content-Type",
          "Accept",
          "Authorization",
        ],
        exposedHeaders: ["Authorization"],
      })
    );
    this.app.use(morgan("tiny"));
    this.app.use(this.apiPrefix, this.routes);

    this.app.get("/", (req: Request, res: Response) => {
      res.status(201).send({
        message: `Welcome to Initial API! Endpoints available at https://localhost:${this.port}/`,
      });
    });

    this.io.on("connection", (socket: Socket) => {
      console.log(`New client connected: ${socket.id}`);

      socket.on("hello", (data) => {
        console.log("Received hello:", data);
      });

      socket.on("disconnect", () => {
        console.log(`Client disconnected: ${socket.id}`);
      });

      socket.on("getRtpCap", (ack) => {
        ack(this.router.rtpCapabilities);
      });

      socket.on("create-producer-transport", async (data, callback) => {
        console.log(
          "Received create-producer-transport from client:",
          socket.id,
          "Data:",
          data
        );
        try {
          const { transport, clientTransportParams } =
            await createWebRtcTransportBothKinds(this.router);
          this.clientProducerTransport = transport;
          console.log("Created transport params:", clientTransportParams);
          callback(null, clientTransportParams);
          console.log("Callback sent with params:", clientTransportParams);
        } catch (error) {
          console.error("Error creating producer transport:", error);
          callback({ error: "Failed to create producer transport" });
        }
      });

      socket.on("create-consumer-transport", async (data, callback) => {
        try {
          const { transport, clientTransportParams } =
            await createWebRtcTransportBothKinds(this.router);
          this.clientConsumerTransport = transport;
          callback(null, clientTransportParams);
        } catch (error) {
          console.error("Error creating consumer transport:", error);
          callback({ error: "Failed to create consumer transport" });
        }
      });

      socket.on(
        "connect-producer-transport",
        async ({ dtlsParameters }, callback) => {
          try {
            if (!this.clientProducerTransport) {
              throw new Error("No producer transport available");
            }
            await this.clientProducerTransport.connect({ dtlsParameters });
            console.log("Producer transport connected successfully");
            callback("success");
          } catch (error) {
            console.error("Error connecting producer transport:", error);
            callback({ error: "Failed to connect producer transport" });
          }
        }
      );

      socket.on(
        "connect-consumer-transport",
        async ({ dtlsParameters }, callback) => {
          try {
            if (!this.clientConsumerTransport) {
              throw new Error("No consumer transport available");
            }
            await this.clientConsumerTransport.connect({ dtlsParameters });
            callback("success");
          } catch (error) {
            console.error("Error connecting consumer transport:", error);
            callback({ error: "Failed to connect consumer transport" });
          }
        }
      );

      //start consuming

      socket.on("consume", async ({ rtpCapabilities }, callback) => {
        try {
          if (
            !this.router.canConsume({
              producerId: this.theProducer?.id || "",
              rtpCapabilities,
            })
          ) {
            throw new Error("Cannot consume");
          }

          if (!this.clientConsumerTransport || !this.theProducer) {
            throw new Error("Consumer transport or producer not available");
          }

          const consumer = await this.clientConsumerTransport.consume({
            producerId: this.theProducer.id,
            rtpCapabilities,
            paused: true,
          });

          this.theConsumer = consumer;

          callback({
            id: consumer.id,
            producerId: this.theProducer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          });

          consumer.on("transportclose", () => {
            console.log("Consumer transport closed");
          });
          consumer.on("producerclose", () => {
            console.log("Producer closed");
          });
        } catch (error) {
          console.error("Error consuming:", error);
          callback({ error: "Failed to consume" });
        }
      });

      socket.on("resume", async (callback) => {
        try {
          if (!this.theConsumer) {
            throw new Error("No consumer available");
          }
          await this.theConsumer.resume();
          callback("success");
        } catch (error) {
          console.error("Error resuming consumer:", error);
          callback({ error: "Failed to resume" });
        }
      });

      //starting producing

      socket.on("produce", async ({ kind, rtpParameters }, callback) => {
        if (!this.clientProducerTransport) {
          callback({ error: "No producer transport available" });
          return;
        }
        try {
          const producer = await this.clientProducerTransport.produce({
            kind,
            rtpParameters,
          });
          this.theProducer = producer;
          console.log(producer, "producer");
          callback({ id: producer.id });
        } catch (error) {
          console.error("Error producing:", error);
          callback({ error: "Failed to produce" });
        }
      });
    });

    this.httpsServer.listen(this.port, () => {
      console.log(`HTTPS Server running on port ${this.port}...`);
    });
  }

  private async initMediaSoup() {
    this.workers = await createWorkers();
    this.router = await this.workers[0].createRouter({
      mediaCodecs: config.routerMediaCodecs as any,
    });
  }

  public getSocketIO(): SocketIOServer {
    return this.io;
  }
}
