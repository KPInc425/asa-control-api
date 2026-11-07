import { requirePermission } from "../middleware/auth.js";
import { readKits, writeKits, queueGrant, readResults, status } from "../services/kit-bridge.js";
import logger from "../utils/logger.js";

/**
 * Kit bridge routes.
 *
 * These do not talk to the game. They write files the KPTweaks mod reads, and read back
 * what it reports. Nothing here can grant an item on its own, and the response says so
 * rather than implying a delivery that has not happened.
 */
export default async function kitRoutes(fastify) {
  fastify.get("/api/kits", { preHandler: requirePermission("read") }, async (request, reply) => {
    try {
      return { success: true, kits: await readKits(), status: await status() };
    } catch (error) {
      logger.error("Failed to read kits:", error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  fastify.put(
    "/api/kits",
    { preHandler: requirePermission("write") },
    async (request, reply) => {
      try {
        const kits = request.body?.kits;
        if (!Array.isArray(kits)) {
          return reply.status(400).send({ success: false, message: "body.kits must be an array" });
        }
        const written = await writeKits(kits);
        return {
          success: true,
          kits: written,
          message: `${written.length} kit(s) written. The mod picks them up on its next poll.`,
        };
      } catch (error) {
        logger.error("Failed to write kits:", error);
        return reply.status(400).send({ success: false, message: error.message });
      }
    },
  );

  fastify.post(
    "/api/kits/grant",
    { preHandler: requirePermission("write") },
    async (request, reply) => {
      try {
        const { playerId, kitName } = request.body || {};
        const command = await queueGrant({ playerId, kitName, requestedBy: request.user?.username || "api" });
        return {
          success: true,
          command,
          // Stated plainly because it is true: queued is not delivered.
          message: "Queued. Delivery is confirmed only when the mod reports it in /api/kits/results.",
        };
      } catch (error) {
        logger.error("Failed to queue kit grant:", error);
        return reply.status(400).send({ success: false, message: error.message });
      }
    },
  );

  fastify.get("/api/kits/results", { preHandler: requirePermission("read") }, async (request, reply) => {
    try {
      const results = await readResults();
      return { success: true, count: results.length, results };
    } catch (error) {
      logger.error("Failed to read kit results:", error);
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  fastify.get("/api/kits/status", { preHandler: requirePermission("read") }, async (request, reply) => {
    try {
      return { success: true, ...(await status()) };
    } catch (error) {
      return reply.status(500).send({ success: false, message: error.message });
    }
  });
}
