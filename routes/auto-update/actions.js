import logger from "../../utils/logger.js";
import { requireRead, requireWrite } from "../../middleware/auth.js";
import autoUpdateService, { UPDATE_STATUS } from "../../services/auto-update-service.js";

export default async function actionRoutes(fastify, options) {
  // POST /api/auto-update/servers/:serverName/run-now
  fastify.post(
    "/api/auto-update/servers/:serverName/run-now",
    {
      preHandler: [requireWrite],
      schema: {
        params: { type: "object", required: ["serverName"], properties: { serverName: { type: "string" } } },
        body: { type: "object", properties: { force: { type: "boolean", default: false } } },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        const { force = false } = request.body || {};
        logger.info(`[AutoUpdateRoutes] Manual update triggered for ${serverName} (force: ${force})`);

        const currentStatus = autoUpdateService.getUpdateStatus(serverName);
        if (currentStatus.status === UPDATE_STATUS.UPDATING) {
          return reply.status(409).send({ success: false, message: "Update already in progress for this server" });
        }
        if (currentStatus.status === UPDATE_STATUS.WARNING && !force) {
          return reply.status(409).send({ success: false, message: "Update warning countdown in progress. Use force=true to override." });
        }

        const result = await autoUpdateService.forceUpdate(serverName, { force });
        if (result.success) {
          return { success: true, message: result.message || "Update started", jobId: result.jobId || null };
        }
        return reply.status(400).send({ success: false, message: result.message || "Failed to start update" });
      } catch (error) {
        logger.error(`Error triggering update for ${request.params.serverName}:`, error);
        return reply.status(500).send({ success: false, message: "Failed to trigger update", error: error.message });
      }
    },
  );

  // POST /api/auto-update/servers/:serverName/cancel
  fastify.post(
    "/api/auto-update/servers/:serverName/cancel",
    {
      preHandler: [requireWrite],
      schema: {
        params: { type: "object", required: ["serverName"], properties: { serverName: { type: "string" } } },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        logger.info(`[AutoUpdateRoutes] Cancel update requested for ${serverName}`);
        const result = autoUpdateService.cancelUpdate(serverName);
        if (result.success) {
          return { success: true, message: result.message || "Update cancelled" };
        }
        return reply.status(400).send({ success: false, message: result.message || "No pending update to cancel" });
      } catch (error) {
        logger.error(`Error cancelling update for ${request.params.serverName}:`, error);
        return reply.status(500).send({ success: false, message: "Failed to cancel update", error: error.message });
      }
    },
  );

  // POST /api/auto-update/servers/:serverName/check
  fastify.post(
    "/api/auto-update/servers/:serverName/check",
    { preHandler: [requireRead] },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        logger.info(`[AutoUpdateRoutes] Checking for updates: ${serverName}`);
        const result = await autoUpdateService.checkForUpdates(serverName);
        return { success: true, serverName, updateAvailable: result.available || false, reason: result.reason || null, lastUpdate: result.lastUpdate || null };
      } catch (error) {
        logger.error(`Error checking updates for ${request.params.serverName}:`, error);
        return reply.status(500).send({ success: false, message: "Failed to check for updates", error: error.message });
      }
    },
  );
}
