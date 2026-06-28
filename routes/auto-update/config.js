import logger from "../../utils/logger.js";
import { requireRead, requireWrite } from "../../middleware/auth.js";
import autoUpdateService from "../../services/auto-update-service.js";
import { getAutoUpdateConfig } from "../../services/database.js";

export default async function configRoutes(fastify, options) {
  // GET /api/auto-update/servers/:serverName/config
  fastify.get(
    "/api/auto-update/servers/:serverName/config",
    {
      preHandler: [requireRead],
      schema: {
        params: { type: "object", required: ["serverName"], properties: { serverName: { type: "string" } } },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        const config = autoUpdateService.getConfig(serverName);
        const dbConfig = getAutoUpdateConfig(serverName);
        const enhancedConfig = {
          ...config, serverName,
          notifyRcon: dbConfig?.notify_rcon !== 0,
          notifySocket: dbConfig?.notify_socket !== 0,
          notificationTemplates: dbConfig?.notification_templates ? JSON.parse(dbConfig.notification_templates) : null,
        };
        return { success: true, serverName, config: enhancedConfig };
      } catch (error) {
        logger.error(`Error getting auto-update config for ${request.params.serverName}:`, error);
        return reply.status(500).send({ success: false, message: "Failed to get auto-update configuration", error: error.message });
      }
    },
  );

  // PUT /api/auto-update/servers/:serverName/config
  fastify.put(
    "/api/auto-update/servers/:serverName/config",
    {
      preHandler: [requireWrite],
      schema: {
        params: { type: "object", required: ["serverName"], properties: { serverName: { type: "string" } } },
        body: {
          type: "object",
          properties: {
            autoUpdateEnabled: { type: "boolean" }, enabled: { type: "boolean" },
            notifyRcon: { type: "boolean" }, notifyDiscord: { type: "boolean" },
            notifySocket: { type: "boolean" }, notifyInGame: { type: "boolean" },
            warningMinutes: { type: "array", items: { type: "number", minimum: 1, maximum: 120 } },
            notificationTemplates: { type: "object" },
            updateIfEmpty: { type: "boolean" }, forceUpdate: { type: "boolean" },
            checkIntervalMinutes: { type: "number", minimum: 5, maximum: 1440 },
            cronExpression: { type: "string" }, autoRestart: { type: "boolean" }, updateOnStart: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        const updates = request.body;
        logger.info(`[AutoUpdateRoutes] Updating config for ${serverName}:`, updates);

        if (updates.warningMinutes) {
          if (!Array.isArray(updates.warningMinutes)) {
            return reply.status(400).send({ success: false, message: "warningMinutes must be an array of numbers" });
          }
          for (const minutes of updates.warningMinutes) {
            if (typeof minutes !== "number" || minutes < 1 || minutes > 120) {
              return reply.status(400).send({ success: false, message: "Each warning minute value must be between 1 and 120" });
            }
          }
          updates.warningMinutes = [...updates.warningMinutes].sort((a, b) => b - a);
        }

        if (updates.checkIntervalMinutes !== undefined && (updates.checkIntervalMinutes < 5 || updates.checkIntervalMinutes > 1440)) {
          return reply.status(400).send({ success: false, message: "checkIntervalMinutes must be between 5 and 1440 (24 hours)" });
        }

        const enabled = updates.autoUpdateEnabled !== undefined ? updates.autoUpdateEnabled : updates.enabled;
        const configUpdate = {
          enabled: enabled !== undefined ? enabled : undefined,
          updateOnStart: updates.updateOnStart, checkIntervalMinutes: updates.checkIntervalMinutes,
          cronExpression: updates.cronExpression, warningMinutes: updates.warningMinutes,
          forceUpdate: updates.forceUpdate, updateIfEmpty: updates.updateIfEmpty,
          notifyDiscord: updates.notifyDiscord,
          notifyInGame: updates.notifyInGame !== undefined ? updates.notifyInGame : updates.notifyRcon,
          autoRestart: updates.autoRestart,
        };
        Object.keys(configUpdate).forEach((key) => { if (configUpdate[key] === undefined) delete configUpdate[key]; });

        const result = autoUpdateService.setConfig(serverName, configUpdate);

        if (updates.notifyRcon !== undefined || updates.notifySocket !== undefined || updates.notificationTemplates) {
          try {
            const { upsertServerUpdateConfig } = await import("../../services/database.js");
            const dbUpdate = { serverName };
            if (updates.notifyRcon !== undefined) dbUpdate.notifyRcon = updates.notifyRcon;
            if (updates.notifySocket !== undefined) dbUpdate.notifySocket = updates.notifySocket;
            if (updates.notificationTemplates) dbUpdate.notificationTemplates = JSON.stringify(updates.notificationTemplates);
          } catch (dbError) {
            logger.warn(`[AutoUpdateRoutes] Failed to update notification settings in DB:`, dbError.message);
          }
        }

        logger.info(`[AutoUpdateRoutes] Config updated for ${serverName}`);
        return { success: true, message: "Auto-update configuration updated successfully", config: result.config };
      } catch (error) {
        logger.error(`Error updating auto-update config for ${request.params.serverName}:`, error);
        return reply.status(500).send({ success: false, message: "Failed to update auto-update configuration", error: error.message });
      }
    },
  );
}
