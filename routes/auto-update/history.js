import logger from "../../utils/logger.js";
import { requireRead } from "../../middleware/auth.js";
import autoUpdateService from "../../services/auto-update-service.js";

export default async function historyRoutes(fastify, options) {
  // GET /api/auto-update/servers/:serverName/history
  fastify.get(
    "/api/auto-update/servers/:serverName/history",
    {
      preHandler: [requireRead],
      schema: {
        params: { type: "object", required: ["serverName"], properties: { serverName: { type: "string" } } },
        querystring: { type: "object", properties: { limit: { type: "number", default: 10 } } },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        const { limit = 10 } = request.query;
        logger.info(`[AutoUpdateRoutes] Getting update history for ${serverName} (limit: ${limit})`);

        let events = [];
        try {
          const { getServerUpdateHistory } = await import("../../services/database.js");
          if (typeof getServerUpdateHistory === "function") {
            const history = getServerUpdateHistory(serverName, limit);
            events = history.map((record, idx) => ({
              id: record.id?.toString() || `event-${idx}`,
              serverName: record.server_name || serverName,
              status: record.status || "completed",
              message: record.message || "Update completed",
              timestamp: record.timestamp || record.created_at || new Date().toISOString(),
              fromVersion: record.from_version || null,
              toVersion: record.to_version || null,
            }));
          }
        } catch (dbError) {
          logger.warn(`[AutoUpdateRoutes] Could not fetch history from database:`, dbError.message);
        }

        if (events.length === 0) {
          const currentStatus = autoUpdateService.getUpdateStatus(serverName);
          if (currentStatus.status !== "idle" && currentStatus.updatedAt) {
            events.push({
              id: "1", serverName, status: currentStatus.status,
              message: `Status: ${currentStatus.status}`,
              timestamp: currentStatus.updatedAt.toISOString(),
              fromVersion: null, toVersion: null,
            });
          }
        }

        return { success: true, serverName, events };
      } catch (error) {
        logger.error(`Error getting update history for ${request.params.serverName}:`, error);
        return reply.status(500).send({ success: false, message: "Failed to get update history", error: error.message });
      }
    },
  );
}
