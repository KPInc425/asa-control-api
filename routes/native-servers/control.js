import { NativeServerManager } from "../../services/server-manager.js";
import { requireRead, requireWrite } from "../../middleware/auth.js";
import logger from "../../utils/logger.js";
import autoUpdateService from "../../services/auto-update-service.js";

const serverManager = new NativeServerManager();

export default async function controlRoutes(fastify, options) {
  // Start native server or cluster
  fastify.post(
    "/api/native-servers/:name/start",
    {
      preHandler: [requireWrite],
      schema: {
        params: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: { success: { type: "boolean" }, message: { type: "string" } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params;
        const servers = await serverManager.listServers();
        const cluster = servers.find((s) => s.type === "cluster" && s.name === name);

        if (cluster) {
          serverManager.startCluster(name).catch((error) => {
            fastify.log.error(`Background cluster start failed for ${name}:`, error);
          });
          return { success: true, message: `Cluster ${name} start initiated. Check server status for progress.` };
        } else {
          (async () => {
            try {
              const updateResult = await Promise.race([
                autoUpdateService.runUpdateOnStart(name),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error("SteamCMD check timed out (30s)")), 30000)
                ),
              ]);
              if (updateResult?.success && !updateResult?.skipped) {
                fastify.log.info(`Update-on-start triggered for ${name}; delaying server start until update flow completes`);
                return;
              }
            } catch (updateError) {
              fastify.log.warn(`Update-on-start failed for ${name} (SteamCMD may be down), proceeding with direct start: ${updateError.message}`);
            }
            try {
              await serverManager.start(name);
            } catch (startError) {
              fastify.log.error(`Background server start failed for ${name}:`, startError);
            }
          })();
          return { success: true, message: `Server ${name} start initiated. Check server status for progress.` };
        }
      } catch (error) {
        fastify.log.error(`Error initiating native server start for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // Stop native server or cluster
  fastify.post(
    "/api/native-servers/:name/stop",
    {
      preHandler: [requireWrite],
      schema: {
        params: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: { success: { type: "boolean" }, message: { type: "string" } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params;
        const servers = await serverManager.listServers();
        const cluster = servers.find((s) => s.type === "cluster" && s.name === name);
        if (cluster) {
          return await serverManager.stopCluster(name);
        }
        return await serverManager.stop(name);
      } catch (error) {
        fastify.log.error(`Error stopping native server ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // Restart native server or cluster
  fastify.post(
    "/api/native-servers/:name/restart",
    {
      preHandler: [requireWrite],
      schema: {
        params: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: { success: { type: "boolean" }, message: { type: "string" } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params;
        const servers = await serverManager.listServers();
        const cluster = servers.find((s) => s.type === "cluster" && s.name === name);
        if (cluster) {
          return await serverManager.restartCluster(name);
        }
        return await serverManager.restart(name);
      } catch (error) {
        fastify.log.error(`Error restarting native server ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // Check if native server is running
  fastify.get(
    "/api/native-servers/:name/running",
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
            properties: { success: { type: "boolean" }, running: { type: "boolean" } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params;
        const running = await serverManager.isRunning(name);
        return { success: true, running };
      } catch (error) {
        fastify.log.error(`Error checking running status for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );
}
