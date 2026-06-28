import logger from "../../utils/logger.js";
import { requireRead, requireWrite } from "../../middleware/auth.js";
import autoUpdateService, { UPDATE_STATUS } from "../../services/auto-update-service.js";
import { getAllServerUpdateConfigs } from "../../services/database.js";

export default async function statusRoutes(fastify, options) {
  // GET /api/auto-update/status - Global status
  fastify.get(
    "/api/auto-update/status",
    { preHandler: [requireRead] },
    async (request, reply) => {
      try {
        const statuses = autoUpdateService.getAllStatuses();
        const serversWithNextCheck = statuses.map((status) => {
          let nextCheck = null;
          if (status.config?.enabled && status.updatedAt) {
            const intervalMs = (status.config.checkIntervalMinutes || 60) * 60 * 1000;
            nextCheck = new Date(new Date(status.updatedAt).getTime() + intervalMs).toISOString();
          }
          return {
            serverName: status.serverName,
            gameType: status.gameType || "ark",
            status: status.status || UPDATE_STATUS.IDLE,
            lastCheck: status.updatedAt ? status.updatedAt.toISOString() : null,
            nextCheck,
            updateAvailable: status.status === UPDATE_STATUS.AVAILABLE,
            currentVersion: status.currentBuildId || null,
            latestVersion: status.latestBuildId || null,
            message: status.reason || status.error || null,
            enabled: status.config?.enabled || false,
            schedulerActive: status.schedulerActive || false,
          };
        });
        return { success: true, schedulerRunning: autoUpdateService.isRunning, servers: serversWithNextCheck };
      } catch (error) {
        logger.error("Error getting auto-update status:", error);
        return reply.status(500).send({ success: false, message: "Failed to get auto-update status", error: error.message });
      }
    },
  );

  // GET /api/auto-update/servers/:serverName/status - Per-server status
  fastify.get(
    "/api/auto-update/servers/:serverName/status",
    {
      preHandler: [requireRead],
      schema: {
        params: { type: "object", required: ["serverName"], properties: { serverName: { type: "string" } } },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        const updateStatus = autoUpdateService.getUpdateStatus(serverName);
        const config = autoUpdateService.getConfig(serverName);

        let nextCheck = null;
        if (config.enabled && updateStatus.updatedAt) {
          const intervalMs = (config.checkIntervalMinutes || 60) * 60 * 1000;
          nextCheck = new Date(new Date(updateStatus.updatedAt).getTime() + intervalMs).toISOString();
        }

        let progress = null;
        if (updateStatus.status === UPDATE_STATUS.UPDATING && updateStatus.jobId) {
          try {
            const { getJob } = await import("../../services/job-manager.js");
            const job = getJob(updateStatus.jobId);
            if (job && job.progress) {
              const latestProgress = job.progress[job.progress.length - 1];
              if (latestProgress) progress = latestProgress;
            }
          } catch (error) {
            logger.warn(`[AutoUpdateRoutes] Could not get job progress for ${serverName}:`, error.message);
          }
        }

        return {
          success: true, serverName,
          status: updateStatus.status || UPDATE_STATUS.IDLE,
          updateAvailable: updateStatus.status === UPDATE_STATUS.AVAILABLE,
          progress,
          lastCheck: updateStatus.updatedAt ? updateStatus.updatedAt.toISOString() : null,
          nextCheck, config,
        };
      } catch (error) {
        logger.error(`Error getting auto-update status for ${request.params.serverName}:`, error);
        return reply.status(500).send({ success: false, message: "Failed to get server update status", error: error.message });
      }
    },
  );

  // POST /api/auto-update/check-now - Trigger check for all servers
  fastify.post(
    "/api/auto-update/check-now",
    { preHandler: [requireRead] },
    async (request, reply) => {
      try {
        logger.info("[AutoUpdateRoutes] Triggering immediate update check for all servers");
        const configs = getAllServerUpdateConfigs();
        const enabledConfigs = configs.filter((c) => c.auto_update === 1 || c.auto_update_enabled === 1);
        autoUpdateService.checkAllServersForUpdates().catch((error) => {
          logger.error("[AutoUpdateRoutes] Error during bulk update check:", error);
        });
        return { success: true, message: `Update check started for ${enabledConfigs.length} server(s)`, checkedServers: enabledConfigs.length };
      } catch (error) {
        logger.error("Error triggering update check:", error);
        return reply.status(500).send({ success: false, message: "Failed to trigger update check", error: error.message });
      }
    },
  );
}
