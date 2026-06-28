import { NativeServerManager } from "../../services/server-manager.js";
import { requireRead } from "../../middleware/auth.js";
import {
  ServerStatus,
  DataSource,
  createServerLiveData,
} from "../../utils/statusContract.js";

const serverManager = new NativeServerManager();

export default async function statusRoutes(fastify, options) {
  // Get enhanced server status with crash detection
  fastify.get(
    "/api/native-servers/:name/status",
    {
      preHandler: [requireRead],
      schema: {
        params: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object", additionalProperties: true },
              status: { type: "object", additionalProperties: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params;
        const rawStatus = await serverManager.getServerStatus(name);

        const liveData = createServerLiveData({
          serverId: name,
          status: rawStatus.status,
          source: DataSource.PROCESS,
          players: { online: rawStatus.playerCount || 0, max: rawStatus.maxPlayers || 70 },
          performance: { uptime: rawStatus.uptime || 0, cpu: rawStatus.cpu, memory: rawStatus.memory },
          updatedAt: new Date().toISOString(),
        });

        if (rawStatus.status === "starting" || rawStatus.status === "stopping") {
          liveData.transition = {
            status: rawStatus.status,
            previousStatus: rawStatus.previousStatus,
            transitionStartedAt: rawStatus.startTime ? new Date(rawStatus.startTime).toISOString() : undefined,
          };
        }

        if (rawStatus.crashInfo) {
          liveData.crashInfo = rawStatus.crashInfo;
        }

        return { success: true, data: liveData, status: rawStatus };
      } catch (error) {
        request.log.error(`Error getting server status for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );
}
