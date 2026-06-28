import { NativeServerManager } from "../../services/server-manager.js";
import { requireRead, requireWrite } from "../../middleware/auth.js";
import logger from "../../utils/logger.js";

const serverManager = new NativeServerManager();

export default async function infoRoutes(fastify, options) {
  // Get cluster server info
  fastify.get(
    "/api/native-servers/:name/cluster-info",
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
            properties: { success: { type: "boolean" }, server: { type: "object" } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params;
        return await serverManager.getClusterServerInfo(name);
      } catch (error) {
        fastify.log.error(`Error getting cluster server info for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // Get cluster server start.bat
  fastify.get(
    "/api/native-servers/:name/start-bat",
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
            properties: { success: { type: "boolean" }, content: { type: "string" }, path: { type: "string" } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params;
        return await serverManager.getClusterServerStartBat(name);
      } catch (error) {
        fastify.log.error(`Error getting start.bat for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // List log files for a server
  fastify.get(
    "/api/native-servers/:name/log-files",
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
              logFiles: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" }, path: { type: "string" },
                    size: { type: "number" }, modified: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params;
        const logFiles = await serverManager.listLogFiles(name);
        return { success: true, logFiles };
      } catch (error) {
        fastify.log.error(`Error listing log files for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // Update cluster server start.bat
  fastify.put(
    "/api/native-servers/:name/start-bat",
    {
      preHandler: [requireWrite],
      schema: {
        params: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["content"],
          properties: { content: { type: "string" } },
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
        const { content } = request.body;
        return await serverManager.updateClusterServerStartBat(name, content);
      } catch (error) {
        fastify.log.error(`Error updating start.bat for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // Regenerate start.bat for a server with latest mods and config
  fastify.post(
    "/api/native-servers/:name/regenerate-start-bat",
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
        if (serverManager.regenerateServerStartScript) {
          await serverManager.regenerateServerStartScript(name);
          return { success: true, message: `Start.bat regenerated for server ${name} with latest mods and configuration` };
        } else {
          return reply.status(400).send({ success: false, message: "Start.bat regeneration is only available for native servers" });
        }
      } catch (error) {
        fastify.log.error(`Error regenerating start.bat for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // Regenerate start script for a server
  fastify.post(
    "/api/native-servers/:name/regenerate-start-script",
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
        logger.info(`Regenerating start script for server: ${name}`);
        await serverManager.regenerateServerStartScript(name);
        return { success: true, message: `Start script regenerated for ${name}` };
      } catch (error) {
        logger.error(`Error regenerating start script for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );
}
