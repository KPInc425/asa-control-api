import { NativeServerManager } from "../../services/server-manager.js";
import { requireRead, requireWrite } from "../../middleware/auth.js";
import logger from "../../utils/logger.js";

const serverManager = new NativeServerManager();

export default async function stateRoutes(fastify, options) {
  // Get state debug info
  fastify.get(
    "/api/native-servers/:name/state-debug",
    {
      preHandler: [requireRead],
      schema: {
        params: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params;
        const stateDebug = serverManager.getStateDebugInfo?.(name);
        return { success: true, stateDebug };
      } catch (error) {
        logger.error(`Error getting state debug for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // Clear server state
  fastify.post(
    "/api/native-servers/:name/clear-state",
    {
      preHandler: [requireWrite],
      schema: {
        params: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params;
        serverManager.clearServerState?.(name);
        return { success: true, message: `State cleared for ${name}` };
      } catch (error) {
        logger.error(`Error clearing state for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );
}
