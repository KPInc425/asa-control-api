import { NativeServerManager } from "../../services/server-manager.js";
import { requireRead, requireWrite } from "../../middleware/auth.js";
import logger from "../../utils/logger.js";

const serverManager = new NativeServerManager();

export default async function compatibilityRoutes(fastify, options) {
  // Get all servers (compatibility endpoint)
  fastify.get(
    "/api/servers",
    {
      preHandler: [requireRead],
    },
    async (request, reply) => {
      try {
        const servers = await serverManager.listServers();
        return {
          success: true,
          servers: servers.map((server) => ({
            id: server.name,
            name: server.name,
            type: server.type || "native",
            status: server.status,
            map: server.map,
            port: server.gamePort,
            rconPort: server.rconPort,
            maxPlayers: server.maxPlayers,
            currentPlayers: server.currentPlayers || 0,
            uptime: server.uptime,
            lastStarted: server.lastStarted,
            configPath: server.configPath,
          })),
        };
      } catch (error) {
        logger.error("Failed to list servers:", error);
        return reply.status(500).send({ success: false, message: "Failed to list servers" });
      }
    },
  );
}
