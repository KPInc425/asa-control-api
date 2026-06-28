import { NativeServerManager } from "../../services/server-manager.js";
import { requireRead, requireWrite } from "../../middleware/auth.js";
import logger from "../../utils/logger.js";
import { getServerConfig, deleteServerConfig } from "../../services/database.js";

const serverManager = new NativeServerManager();

export default async function crudRoutes(fastify, options) {
  // Get all native server configurations
  fastify.get(
    "/api/native-servers",
    { preHandler: [requireRead] },
    async (request, reply) => {
      try {
        const servers = await serverManager.listServers();
        return { success: true, servers };
      } catch (error) {
        fastify.log.error("Error listing native servers:", error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // Add or update native server configuration
  fastify.post(
    "/api/native-servers",
    {
      preHandler: [requireWrite],
      schema: {
        body: {
          type: "object",
          required: ["name", "config"],
          properties: {
            name: { type: "string" },
            config: {
              type: "object",
              properties: {
                serverPath: { type: "string" },
                mapName: { type: "string" },
                gamePort: { type: "number" },
                queryPort: { type: "number" },
                rconPort: { type: "number" },
                serverName: { type: "string" },
                maxPlayers: { type: "number" },
                serverPassword: { type: "string" },
                adminPassword: { type: "string" },
                mods: { type: "array", items: { type: "string" } },
                additionalArgs: { type: "string" },
                disableBattleEye: { type: "boolean" },
                customDynamicConfigUrl: { type: "string" },
              },
            },
          },
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
        const { name, config } = request.body;
        if (!config.serverPath) {
          return reply.status(400).send({ success: false, message: "Server path is required" });
        }
        await serverManager.addServerConfig(name, config);
        logger.info(`Native server configuration added/updated: ${name}`);
        return { success: true, message: `Server configuration for ${name} saved successfully` };
      } catch (error) {
        fastify.log.error("Error adding native server configuration:", error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // Get native server configuration
  fastify.get(
    "/api/native-servers/:name/config",
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
            properties: { success: { type: "boolean" }, config: { type: "object" } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params;
        const serverConfig = getServerConfig(name);
        if (!serverConfig) {
          return reply.status(404).send({ success: false, message: `Server configuration not found: ${name}` });
        }
        const config = JSON.parse(serverConfig.config_data);
        if (config.adminPassword && (!config.rconPassword || config.rconPassword !== config.adminPassword)) {
          config.rconPassword = config.adminPassword;
          logger.info(`Updated RCON password to match admin password for server ${name}`);
        }
        return { success: true, config };
      } catch (error) {
        fastify.log.error(`Error getting native server configuration for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // Delete native server configuration
  fastify.delete(
    "/api/native-servers/:name",
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
        if (await serverManager.isRunning(name)) {
          await serverManager.stop(name);
        }
        deleteServerConfig(name);
        logger.info(`Native server configuration deleted: ${name}`);
        return { success: true, message: `Server configuration for ${name} deleted successfully` };
      } catch (error) {
        fastify.log.error(`Error deleting native server configuration for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // Get native server stats
  fastify.get(
    "/api/native-servers/:name/stats",
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
            properties: { success: { type: "boolean" }, stats: { type: "object" } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params;
        const stats = await serverManager.getStats(name);
        return { success: true, stats };
      } catch (error) {
        fastify.log.error(`Error getting native server stats for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );
}
