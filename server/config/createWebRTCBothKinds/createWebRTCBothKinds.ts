import { types } from "mediasoup";
import { types as mediasoupTypes } from "mediasoup";

interface TransportResult {
  transport: types.WebRtcTransport;
  clientTransportParams: {
    id: string;
    iceParameters: types.IceParameters;
    iceCandidates: types.IceCandidate[];
    dtlsParameters: types.DtlsParameters;
  };
}

const createWebRtcTransportBothKinds = (
  router: mediasoupTypes.Router
): Promise<TransportResult> =>
  new Promise(async (resolve, reject) => {
    try {
      const transport = await router.createWebRtcTransport({
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        listenInfos: [
          {
            protocol: "udp",
            ip: "127.0.0.1",
          },
          {
            protocol: "tcp",
            ip: "127.0.0.3",
          },
        ],
      });

      const clientTransportParams = {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };

      resolve({ transport, clientTransportParams });
    } catch (error) {
      reject(error);
    }
  });

export default createWebRtcTransportBothKinds;
