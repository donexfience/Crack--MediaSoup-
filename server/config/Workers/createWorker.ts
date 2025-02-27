import os from "os";
import { types as mediasoupTypes } from "mediasoup";
import * as mediasoup from "mediasoup";
import config from "../config";

const totalThreads = os.cpus().length;

export const createWorkers = (): Promise<mediasoupTypes.Worker[]> =>
  new Promise(async (resolve, reject) => {
    let workers: mediasoupTypes.Worker[] = [];

    try {
      for (let i = 0; i < totalThreads; i++) {
        const worker: mediasoupTypes.Worker = await mediasoup.createWorker({
          rtcMinPort: config.workerSettings.rtcMinPort,
          rtcMaxPort: config.workerSettings.rtcMaxPort,
          logLevel: config.workerSettings.logLevel,
          logTags: config.workerSettings.logTags,
        });

        worker.on("died", () => {
          console.log("Worker has died");
          process.exit(1);
        });

        workers.push(worker);
      }

      resolve(workers);
    } catch (error) {
      reject(error);
    }
  });
