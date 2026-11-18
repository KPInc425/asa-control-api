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

        // The setter in services/db/auto-update.js speaks snake_case column names. This
        // block used to hand it the camelCase API shape, so every key was ignored, nothing
        // was written, and the handler then read .config off an undefined return: every
        // save from the dashboard answered 500 while quietly changing nothing.
        const configUpdate = {};
        if (enabled !== undefined) configUpdate.auto_update_enabled = enabled;
        if (updates.updateOnStart !== undefined) configUpdate.update_on_start = updates.updateOnStart;
        if (updates.checkIntervalMinutes !== undefined) configUpdate.auto_update_check_interval = updates.checkIntervalMinutes;
        if (updates.warningMinutes !== undefined) configUpdate.warning_minutes = updates.warningMinutes;
        if (updates.updateIfEmpty !== undefined) configUpdate.auto_update_if_empty = updates.updateIfEmpty;
        if (updates.notifyDiscord !== undefined) configUpdate.notify_discord = updates.notifyDiscord;
        if (updates.notifySocket !== undefined) configUpdate.notify_socket = updates.notifySocket;
        if (updates.notificationTemplates !== undefined) configUpdate.notification_templates = updates.notificationTemplates;
        const notifyInGame = updates.notifyInGame !== undefined ? updates.notifyInGame : updates.notifyRcon;
        if (notifyInGame !== undefined) configUpdate.notify_rcon = notifyInGame;
        if (updates.autoRestart !== undefined) configUpdate.auto_restart = updates.autoRestart;

        if (Object.keys(configUpdate).length) {
          autoUpdateService.setConfig(serverName, configUpdate);
        }

        logger.info(`[AutoUpdateRoutes] Config updated for ${serverName}`);
        return {
          success: true,
          message: "Auto-update configuration updated successfully",
          config: autoUpdateService.getConfig(serverName),
        };
      } catch (error) {
        logger.error(`Error updating auto-update config for ${request.params.serverName}:`, error);
        return reply.status(500).send({ success: false, message: "Failed to update auto-update configuration", error: error.message });
      }
    },
  );
}
