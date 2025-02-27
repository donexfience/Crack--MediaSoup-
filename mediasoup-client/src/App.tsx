import { useEffect, useState, useRef } from "react";
import "./App.css";
import { io } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [device, setDevice] = useState<mediasoupClient.Device | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const consumerTransportRef = useRef<mediasoupClient.types.Transport | null>(
    null
  );

  useEffect(() => {
    socketRef.current = io("https://localhost:3099", {
      secure: true,
      rejectUnauthorized: false,
    });

    const mediasoupDevice = new mediasoupClient.Device({
      handlerName: "Chrome67",
    });
    setDevice(mediasoupDevice);

    socketRef.current.on("connect", async () => {
      console.log("Connected to socket server");
      setIsConnected(true);

      try {
        const routerRtpCapabilities =
          await new Promise<mediasoupClient.types.RtpCapabilities>(
            (resolve) => {
              socketRef.current?.emit("getRtpCap", (response: any) => {
                resolve(response);
              });
            }
          );

        await mediasoupDevice.load({ routerRtpCapabilities });
        console.log("Mediasoup device loaded successfully");
        socketRef.current?.emit("hello", { message: "shelsfjds" });
      } catch (error) {
        console.error("Error loading mediasoup device:", error);
      }
    });

    socketRef.current.on("connect_error", (err) => {
      console.error("Connection error:", err.message);
    });

    return () => {
      socketRef.current?.disconnect();
      console.log("Socket disconnected");
      setIsConnected(false);
      setDevice(null);
      setLocalStream(null);
    };
  }, []);

  useEffect(() => {
    console.log(remoteStream?.getTracks(), "in the  useeffectt");
    if (
      localStream &&
      videoRef.current &&
      remoteVideoRef &&
      remoteVideoRef.current
    ) {
      videoRef.current.srcObject = localStream;
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [localStream, remoteStream]);

  const handleCreateProducer = async () => {
    if (!device || !socketRef.current) return;

    try {
      console.log("Step 1: Requesting user media");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      setLocalStream(stream);
      console.log("Step 1: User media acquired successfully");

      console.log("Step 2: Emitting create-producer-transport");
      const transportParams = await new Promise<any>((resolve, reject) => {
        socketRef.current?.emit(
          "create-producer-transport",
          null,
          (error: any, response: any) => {
            console.log(
              "create-producer-transport error:",
              error,
              "response:",
              response
            );
            if (error) {
              reject(
                new Error(
                  `create-producer-transport failed: ${JSON.stringify(error)}`
                )
              );
            } else if (!response || !response.id) {
              reject(new Error("No valid transport params received"));
            } else {
              resolve(response);
            }
          }
        );
      });
      console.log("Step 2: Transport params received:", transportParams);

      console.log("Step 3: Creating send transport");
      const transport = device.createSendTransport(transportParams);
      console.log("Step 3: Send transport created:", transport);
      if (!transport) {
        throw new Error("Failed to create send transport");
      }

      transport.on("connect", async ({ dtlsParameters }, callback) => {
        try {
          console.log(
            "Step 4: Connecting transport with dtlsParameters:",
            dtlsParameters
          );
          await socketRef.current?.emitWithAck("connect-producer-transport", {
            dtlsParameters,
          });
          console.log("Step 4: Transport connect event completed");
          callback();
        } catch (error) {
          console.error("Error connecting transport:", error);
          callback();
        }
      });

      transport.on("produce", async ({ kind, rtpParameters }, callback) => {
        try {
          console.log(
            "Step 5: Producing with kind:",
            kind,
            "rtpParameters:",
            rtpParameters
          );
          const producerId = await new Promise<string>((resolve, reject) => {
            socketRef.current?.emit(
              "produce",
              { kind, rtpParameters },
              (response: any) => {
                console.log("Produce response:", response);
                if (response && response.id) {
                  resolve(response.id);
                } else {
                  reject(new Error("Invalid produce response"));
                }
              }
            );
          });
          callback({ id: producerId });
        } catch (error) {
          console.error("Error producing:", error);
        }
      });

      console.log("Step 6: Starting production");
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      console.log(videoTrack, "video track");
      console.log(audioTrack, "adu   track");

      if (videoTrack) {
        console.log("Producing video track");
        await transport.produce({ track: videoTrack });
      }
      if (audioTrack) {
        console.log("Producing audio track");
        await transport.produce({ track: audioTrack });
      }
      console.log("Step 6: Production started successfully");
    } catch (error) {
      console.error(
        "Error creating producer:",
        error instanceof Error ? `${error.message} - ${error.stack}` : error
      );
    }
  };

  const handleCreateConsumer = async () => {
    if (!device || !socketRef.current || !isConnected) return;

    try {
      // Create consumer transport
      const transportParams = await new Promise<any>((resolve, reject) => {
        socketRef.current?.emit(
          "create-consumer-transport",
          null,
          (error: any, response: any) => {
            if (error) reject(error);
            else resolve(response);
          }
        );
      });

      console.log("Consumer transport params:", transportParams);
      const consumerTransport = device.createRecvTransport(transportParams);
      consumerTransportRef.current = consumerTransport;

      consumerTransport.on("connect", async ({ dtlsParameters }, callback) => {
        try {
          await socketRef.current?.emitWithAck("connect-consumer-transport", {
            dtlsParameters,
          });
          callback();
        } catch (error) {
          console.error("Error connecting consumer transport:", error);
          callback();
        }
      });

      consumerTransport.on("connectionstatechange", (state) => {
        console.log("Consumer transport state:", state);
      });

      // Consume the stream
      const consumerParams = await new Promise<any>((resolve, reject) => {
        socketRef.current?.emit(
          "consume",
          { rtpCapabilities: device.rtpCapabilities },
          (response: any) => {
            if (response.error) reject(response.error);
            else resolve(response);
          }
        );
      });

      const consumer = await consumerTransport.consume({
        id: consumerParams.id,
        producerId: consumerParams.producerId,
        kind: consumerParams.kind,
        rtpParameters: consumerParams.rtpParameters,
      });

      const stream = new MediaStream();
      console.log(consumer.track, "ccccccccccc");

      stream.addTrack(consumer.track);
      console.log(stream, "stream got consumed");
      setRemoteStream(stream);
      console.log(remoteVideoRef, "remote video ref");

      // Resume consumer
      await socketRef.current?.emitWithAck("resume");
      console.log("Consumer created successfully");
    } catch (error) {
      console.error("Error creating consumer:", error);
    }
  };
  return (
    <>
      <div style={{ color: "red", background: "black", padding: "12px" }}>
        Socket Status: {isConnected ? "Connected" : "Disconnected"}
      </div>
      <div>
        <button onClick={handleCreateProducer} disabled={!isConnected}>
          Start Streaming
        </button>
        <button onClick={handleCreateConsumer} disabled={!isConnected}>
          Start Consuming
        </button>
      </div>
      {localStream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: "640px", height: "480px", marginTop: "20px" }}
        />
      )}
      {remoteStream && (
        <audio
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{ width: "640px", height: "480px", marginTop: "20px" }}
        />
      )}
    </>
  );
}

export default App;
