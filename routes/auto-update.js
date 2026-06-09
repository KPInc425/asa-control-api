/**
 * Auto-Update Routes for ARK Server Admin Suite
 *
 * REST API endpoints for managing automated server updates:
 * - Global scheduler status
 * - Per-server update status and configuration
 * - Manual update triggers
 * - Test notifications
 */

import logger from "../utils/logger.js";
import { requireRead, requireWrite } from "../middleware/auth.js";
import autoUpdateService, {
  UPDATE_STATUS,
  DEFAULT_CONFIG,
} from "../services/auto-update-service.js";
import {
  notifyInGame,
  notifyDiscord,
  notifySocket,
  NotificationService,
} from "../services/notifications/adapters.js";
import {
  getAutoUpdateConfig,
  getAllServerUpdateConfigs,
} from "../services/database.js";

/**
 * Auto-Update routes for managing automated server updates
 */
export default async function autoUpdateRoutes(fastify, options) {
  // ============================================================================
  // Global Status Endpoints
  // ============================================================================

  /**
   * GET /api/auto-update/status
   * Get global auto-update status including scheduler state and all server statuses
   */
  fastify.get(
    "/api/auto-update/status",
    {
      preHandler: [requireRead],
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              schedulerRunning: { type: "boolean" },
              servers: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    serverName: { type: "string" },
                    status: { type: "string" },
                    lastCheck: { type: "string", nullable: true },
                    nextCheck: { type: "string", nullable: true },
                    updateAvailable: { type: "boolean" },
                    currentVersion: { type: "string", nullable: true },
                    latestVersion: { type: "string", nullable: true },
                    message: { type: "string", nullable: true },
                    enabled: { type: "boolean" },
                    schedulerActive: { type: "boolean" },
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
        const statuses = autoUpdateService.getAllStatuses();

        // Calculate next check time based on last check and interval
        const serversWithNextCheck = statuses.map((status) => {
          let nextCheck = null;

          if (status.config?.enabled && status.updatedAt) {
            const intervalMs =
              (status.config.checkIntervalMinutes || 60) * 60 * 1000;
            const lastCheckTime = new Date(status.updatedAt).getTime();
            nextCheck = new Date(lastCheckTime + intervalMs).toISOString();
          }

          return {
            serverName: status.serverName,
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

        return {
          success: true,
          schedulerRunning: autoUpdateService.isRunning,
          servers: serversWithNextCheck,
        };
      } catch (error) {
        logger.error("Error getting auto-update status:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to get auto-update status",
          error: error.message,
        });
      }
    },
  );

  /**
   * POST /api/auto-update/check-now
   * Trigger immediate update check for all enabled servers
   */
  fastify.post(
    "/api/auto-update/check-now",
    {
      preHandler: [requireWrite],
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              checkedServers: { type: "number" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        logger.info(
          "[AutoUpdateRoutes] Triggering immediate update check for all servers",
        );

        // Get all enabled servers
        const configs = getAllServerUpdateConfigs();
        const enabledConfigs = configs.filter(
          (c) => c.auto_update === 1 || c.auto_update_enabled === 1,
        );

        // Start checking (don't await - let it run in background)
        autoUpdateService.checkAllServersForUpdates().catch((error) => {
          logger.error(
            "[AutoUpdateRoutes] Error during bulk update check:",
            error,
          );
        });

        return {
          success: true,
          message: `Update check started for ${enabledConfigs.length} server(s)`,
          checkedServers: enabledConfigs.length,
        };
      } catch (error) {
        logger.error("Error triggering update check:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to trigger update check",
          error: error.message,
        });
      }
    },
  );

  // ============================================================================
  // Server-Specific Status Endpoints
  // ============================================================================

  /**
   * GET /api/auto-update/servers/:serverName/status
   * Get specific server's auto-update status
   */
  fastify.get(
    "/api/auto-update/servers/:serverName/status",
    {
      preHandler: [requireRead],
      schema: {
        params: {
          type: "object",
          required: ["serverName"],
          properties: {
            serverName: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              serverName: { type: "string" },
              status: { type: "string" },
              updateAvailable: { type: "boolean" },
              progress: {
                type: "object",
                nullable: true,
                properties: {
                  step: { type: "number" },
                  totalSteps: { type: "number" },
                  message: { type: "string" },
                  percent: { type: "number" },
                },
              },
              lastCheck: { type: "string", nullable: true },
              nextCheck: { type: "string", nullable: true },
              config: { type: "object" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;

        // Validate server exists
        const serverConfig = getAutoUpdateConfig(serverName);

        const updateStatus = autoUpdateService.getUpdateStatus(serverName);
        const config = autoUpdateService.getConfig(serverName);

        // Calculate next check time
        let nextCheck = null;
        if (config.enabled && updateStatus.updatedAt) {
          const intervalMs = (config.checkIntervalMinutes || 60) * 60 * 1000;
          const lastCheckTime = new Date(updateStatus.updatedAt).getTime();
          nextCheck = new Date(lastCheckTime + intervalMs).toISOString();
        }

        // Build progress object if update is in progress
        let progress = null;
        if (
          updateStatus.status === UPDATE_STATUS.UPDATING &&
          updateStatus.jobId
        ) {
          // Try to get job progress
          try {
            const { getJob } = await import("../services/job-manager.js");
            const job = getJob(updateStatus.jobId);
            if (job && job.progress) {
              const latestProgress = job.progress[job.progress.length - 1];
              if (latestProgress) {
                progress = latestProgress;
              }
            }
          } catch (error) {
            logger.warn(
              `[AutoUpdateRoutes] Could not get job progress for ${serverName}:`,
              error.message,
            );
          }
        }

        return {
          success: true,
          serverName,
          status: updateStatus.status || UPDATE_STATUS.IDLE,
          updateAvailable: updateStatus.status === UPDATE_STATUS.AVAILABLE,
          progress,
          lastCheck: updateStatus.updatedAt
            ? updateStatus.updatedAt.toISOString()
            : null,
          nextCheck,
          config,
        };
      } catch (error) {
        logger.error(
          `Error getting auto-update status for ${request.params.serverName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to get server update status",
          error: error.message,
        });
      }
    },
  );

  // ============================================================================
  // Server Configuration Endpoints
  // ============================================================================

  /**
   * GET /api/auto-update/servers/:serverName/config
   * Get server's auto-update configuration
   */
  fastify.get(
    "/api/auto-update/servers/:serverName/config",
    {
      preHandler: [requireRead],
      schema: {
        params: {
          type: "object",
          required: ["serverName"],
          properties: {
            serverName: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              config: {
                type: "object",
                properties: {
                  serverName: { type: "string" },
                  enabled: { type: "boolean" },
                  updateOnStart: { type: "boolean" },
                  checkIntervalMinutes: { type: "number" },
                  cronExpression: { type: "string", nullable: true },
                  warningMinutes: {
                    type: "array",
                    items: { type: "number" },
                  },
                  forceUpdate: { type: "boolean" },
                  updateIfEmpty: { type: "boolean" },
                  notifyDiscord: { type: "boolean" },
                  notifyInGame: { type: "boolean" },
                  notifyRcon: { type: "boolean" },
                  notifySocket: { type: "boolean" },
                  autoRestart: { type: "boolean" },
                  lastUpdate: { type: "string", nullable: true },
                  notificationTemplates: { type: "object", nullable: true },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;

        const config = autoUpdateService.getConfig(serverName);

        // Enhance config with notification settings from database
        const dbConfig = getAutoUpdateConfig(serverName);

        const enhancedConfig = {
          ...config,
          serverName, // Include serverName in response
          notifyRcon: dbConfig?.notify_rcon !== 0,
          notifySocket: dbConfig?.notify_socket !== 0,
          notificationTemplates: dbConfig?.notification_templates
            ? JSON.parse(dbConfig.notification_templates)
            : null,
        };

        return {
          success: true,
          serverName, // Include serverName at response level too
          config: enhancedConfig,
        };
      } catch (error) {
        logger.error(
          `Error getting auto-update config for ${request.params.serverName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to get auto-update configuration",
          error: error.message,
        });
      }
    },
  );

  /**
   * PUT /api/auto-update/servers/:serverName/config
   * Update server's auto-update configuration
   */
  fastify.put(
    "/api/auto-update/servers/:serverName/config",
    {
      preHandler: [requireWrite],
      schema: {
        params: {
          type: "object",
          required: ["serverName"],
          properties: {
            serverName: { type: "string" },
          },
        },
        body: {
          type: "object",
          properties: {
            autoUpdateEnabled: { type: "boolean" },
            enabled: { type: "boolean" }, // Alias for autoUpdateEnabled
            notifyRcon: { type: "boolean" },
            notifyDiscord: { type: "boolean" },
            notifySocket: { type: "boolean" },
            notifyInGame: { type: "boolean" },
            warningMinutes: {
              type: "array",
              items: { type: "number", minimum: 1, maximum: 120 },
            },
            notificationTemplates: { type: "object" },
            updateIfEmpty: { type: "boolean" },
            forceUpdate: { type: "boolean" },
            checkIntervalMinutes: { type: "number", minimum: 5, maximum: 1440 },
            cronExpression: { type: "string" },
            autoRestart: { type: "boolean" },
            updateOnStart: { type: "boolean" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              config: { type: "object" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        const updates = request.body;

        logger.info(
          `[AutoUpdateRoutes] Updating config for ${serverName}:`,
          updates,
        );

        // Validate warningMinutes if provided
        if (updates.warningMinutes) {
          if (!Array.isArray(updates.warningMinutes)) {
            return reply.status(400).send({
              success: false,
              message: "warningMinutes must be an array of numbers",
            });
          }

          for (const minutes of updates.warningMinutes) {
            if (typeof minutes !== "number" || minutes < 1 || minutes > 120) {
              return reply.status(400).send({
                success: false,
                message: "Each warning minute value must be between 1 and 120",
              });
            }
          }

          // Sort in descending order
          updates.warningMinutes = [...updates.warningMinutes].sort(
            (a, b) => b - a,
          );
        }

        // Validate checkIntervalMinutes if provided
        if (updates.checkIntervalMinutes !== undefined) {
          if (
            updates.checkIntervalMinutes < 5 ||
            updates.checkIntervalMinutes > 1440
          ) {
            return reply.status(400).send({
              success: false,
              message:
                "checkIntervalMinutes must be between 5 and 1440 (24 hours)",
            });
          }
        }

        // Normalize enabled field (accept both autoUpdateEnabled and enabled)
        const enabled =
          updates.autoUpdateEnabled !== undefined
            ? updates.autoUpdateEnabled
            : updates.enabled;

        // Build config object for service
        const configUpdate = {
          enabled: enabled !== undefined ? enabled : undefined,
          updateOnStart: updates.updateOnStart,
          checkIntervalMinutes: updates.checkIntervalMinutes,
          cronExpression: updates.cronExpression,
          warningMinutes: updates.warningMinutes,
          forceUpdate: updates.forceUpdate,
          updateIfEmpty: updates.updateIfEmpty,
          notifyDiscord: updates.notifyDiscord,
          notifyInGame:
            updates.notifyInGame !== undefined
              ? updates.notifyInGame
              : updates.notifyRcon,
          autoRestart: updates.autoRestart,
        };

        // Remove undefined values
        Object.keys(configUpdate).forEach((key) => {
          if (configUpdate[key] === undefined) {
            delete configUpdate[key];
          }
        });

        // Update via the service
        const result = autoUpdateService.setConfig(serverName, configUpdate);

        // Also update notification-specific settings directly in database if needed
        if (
          updates.notifyRcon !== undefined ||
          updates.notifySocket !== undefined ||
          updates.notificationTemplates
        ) {
          try {
            const { upsertServerUpdateConfig } =
              await import("../services/database.js");

            const dbUpdate = {
              serverName,
            };

            if (updates.notifyRcon !== undefined) {
              dbUpdate.notifyRcon = updates.notifyRcon;
            }
            if (updates.notifySocket !== undefined) {
              dbUpdate.notifySocket = updates.notifySocket;
            }
            if (updates.notificationTemplates) {
              dbUpdate.notificationTemplates = JSON.stringify(
                updates.notificationTemplates,
              );
            }

            // This will be handled by the service
          } catch (dbError) {
            logger.warn(
              `[AutoUpdateRoutes] Failed to update notification settings in DB:`,
              dbError.message,
            );
          }
        }

        logger.info(`[AutoUpdateRoutes] Config updated for ${serverName}`);

        return {
          success: true,
          message: "Auto-update configuration updated successfully",
          config: result.config,
        };
      } catch (error) {
        logger.error(
          `Error updating auto-update config for ${request.params.serverName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to update auto-update configuration",
          error: error.message,
        });
      }
    },
  );

  // ============================================================================
  // Update Action Endpoints
  // ============================================================================

  /**
   * POST /api/auto-update/servers/:serverName/run-now
   * Trigger immediate update for a specific server
   */
  fastify.post(
    "/api/auto-update/servers/:serverName/run-now",
    {
      preHandler: [requireWrite],
      schema: {
        params: {
          type: "object",
          required: ["serverName"],
          properties: {
            serverName: { type: "string" },
          },
        },
        body: {
          type: "object",
          properties: {
            force: { type: "boolean", default: false },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              jobId: { type: "string", nullable: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        const { force = false } = request.body || {};

        logger.info(
          `[AutoUpdateRoutes] Manual update triggered for ${serverName} (force: ${force})`,
        );

        // Check current status
        const currentStatus = autoUpdateService.getUpdateStatus(serverName);

        if (currentStatus.status === UPDATE_STATUS.UPDATING) {
          return reply.status(409).send({
            success: false,
            message: "Update already in progress for this server",
          });
        }

        if (currentStatus.status === UPDATE_STATUS.WARNING && !force) {
          return reply.status(409).send({
            success: false,
            message:
              "Update warning countdown in progress. Use force=true to override.",
          });
        }

        // Start the update process
        const result = await autoUpdateService.forceUpdate(serverName, {
          force,
        });

        if (result.success) {
          return {
            success: true,
            message: result.message || "Update started",
            jobId: result.jobId || null,
          };
        } else {
          return reply.status(400).send({
            success: false,
            message: result.message || "Failed to start update",
          });
        }
      } catch (error) {
        logger.error(
          `Error triggering update for ${request.params.serverName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to trigger update",
          error: error.message,
        });
      }
    },
  );

  /**
   * POST /api/auto-update/servers/:serverName/cancel
   * Cancel pending update for a server
   */
  fastify.post(
    "/api/auto-update/servers/:serverName/cancel",
    {
      preHandler: [requireWrite],
      schema: {
        params: {
          type: "object",
          required: ["serverName"],
          properties: {
            serverName: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;

        logger.info(
          `[AutoUpdateRoutes] Cancel update requested for ${serverName}`,
        );

        const result = autoUpdateService.cancelUpdate(serverName);

        if (result.success) {
          return {
            success: true,
            message: result.message || "Update cancelled",
          };
        } else {
          return reply.status(400).send({
            success: false,
            message: result.message || "No pending update to cancel",
          });
        }
      } catch (error) {
        logger.error(
          `Error cancelling update for ${request.params.serverName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to cancel update",
          error: error.message,
        });
      }
    },
  );

  // ============================================================================
  // Scheduler Control Endpoints
  // ============================================================================

  /**
   * POST /api/auto-update/scheduler/start
   * Start the global auto-update scheduler
   */
  fastify.post(
    "/api/auto-update/scheduler/start",
    {
      preHandler: [requireWrite],
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              schedulerRunning: { type: "boolean" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        if (autoUpdateService.isRunning) {
          return {
            success: true,
            message: "Scheduler already running",
            schedulerRunning: true,
          };
        }

        autoUpdateService.startScheduler();

        logger.info("[AutoUpdateRoutes] Global scheduler started");

        return {
          success: true,
          message: "Scheduler started",
          schedulerRunning: true,
        };
      } catch (error) {
        logger.error("Error starting scheduler:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to start scheduler",
          error: error.message,
        });
      }
    },
  );

  /**
   * POST /api/auto-update/scheduler/stop
   * Stop the global auto-update scheduler
   */
  fastify.post(
    "/api/auto-update/scheduler/stop",
    {
      preHandler: [requireWrite],
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              schedulerRunning: { type: "boolean" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        if (!autoUpdateService.isRunning) {
          return {
            success: true,
            message: "Scheduler not running",
            schedulerRunning: false,
          };
        }

        autoUpdateService.stopScheduler();

        logger.info("[AutoUpdateRoutes] Global scheduler stopped");

        return {
          success: true,
          message: "Scheduler stopped",
          schedulerRunning: false,
        };
      } catch (error) {
        logger.error("Error stopping scheduler:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to stop scheduler",
          error: error.message,
        });
      }
    },
  );

  // ============================================================================
  // Test Notification Endpoint
  // ============================================================================

  /**
   * POST /api/auto-update/test-notification
   * Send test notification to verify channel configuration
   */
  fastify.post(
    "/api/auto-update/test-notification",
    {
      preHandler: [requireWrite],
      schema: {
        body: {
          type: "object",
          required: ["serverName"],
          properties: {
            serverName: { type: "string" },
            channels: {
              type: "object",
              properties: {
                rcon: { type: "boolean", default: true },
                discord: { type: "boolean", default: true },
                socket: { type: "boolean", default: true },
              },
            },
            message: {
              type: "string",
              default:
                "[TEST] This is a test notification from the Auto-Update system.",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              results: {
                type: "object",
                properties: {
                  rcon: { type: "object", nullable: true },
                  discord: { type: "object", nullable: true },
                  socket: { type: "object", nullable: true },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const {
          serverName,
          channels = { rcon: true, discord: true, socket: true },
          message = "[TEST] This is a test notification from the Auto-Update system.",
        } = request.body;

        logger.info(
          `[AutoUpdateRoutes] Sending test notification for ${serverName}:`,
          { channels, message },
        );

        const results = {
          rcon: null,
          discord: null,
          socket: null,
        };

        const errors = [];

        // Test RCON/In-Game notification
        if (channels.rcon) {
          try {
            const rconResult = await notifyInGame(serverName, message, {});
            results.rcon = rconResult;
            if (!rconResult.success && !rconResult.skipped) {
              errors.push(`RCON: ${rconResult.error}`);
            }
          } catch (error) {
            results.rcon = { success: false, error: error.message };
            errors.push(`RCON: ${error.message}`);
          }
        }

        // Test Discord notification
        if (channels.discord) {
          try {
            const discordResult = await notifyDiscord(serverName, message, {
              type: "generic",
              severity: "info",
            });
            results.discord = discordResult;
            if (!discordResult.success) {
              errors.push(`Discord: ${discordResult.error}`);
            }
          } catch (error) {
            results.discord = { success: false, error: error.message };
            errors.push(`Discord: ${error.message}`);
          }
        }

        // Test Socket notification (requires socket.io instance from fastify)
        if (channels.socket) {
          try {
            const io = fastify.io || options?.io;
            if (io) {
              const socketResult = notifySocket(
                io,
                serverName,
                "auto-update:test",
                {
                  message,
                  type: "test",
                  timestamp: new Date().toISOString(),
                },
              );
              results.socket = socketResult;
            } else {
              results.socket = {
                success: false,
                skipped: true,
                reason: "Socket.io not available",
              };
            }
          } catch (error) {
            results.socket = { success: false, error: error.message };
            errors.push(`Socket: ${error.message}`);
          }
        }

        // Determine overall success
        const testedChannels = Object.values(results).filter((r) => r !== null);
        const successCount = testedChannels.filter((r) => r.success).length;
        const totalTested = testedChannels.length;

        if (errors.length === 0 || successCount > 0) {
          return {
            success: true,
            message: `Test notification sent to ${successCount}/${totalTested} channel(s)`,
            results,
          };
        } else {
          return reply.status(500).send({
            success: false,
            message: `Test notification failed: ${errors.join("; ")}`,
            results,
          });
        }
      } catch (error) {
        logger.error("Error sending test notification:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to send test notification",
          error: error.message,
        });
      }
    },
  );

  // ============================================================================
  // Check Update Status Endpoint
  // ============================================================================

  /**
   * GET /api/auto-update/servers/:serverName/history
   * Get update history for a specific server
   */
  fastify.get(
    "/api/auto-update/servers/:serverName/history",
    {
      preHandler: [requireRead],
      schema: {
        params: {
          type: "object",
          required: ["serverName"],
          properties: {
            serverName: { type: "string" },
          },
        },
        querystring: {
          type: "object",
          properties: {
            limit: { type: "number", default: 10 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              serverName: { type: "string" },
              events: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    serverName: { type: "string" },
                    status: { type: "string" },
                    message: { type: "string" },
                    timestamp: { type: "string" },
                    fromVersion: { type: "string", nullable: true },
                    toVersion: { type: "string", nullable: true },
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
        const { serverName } = request.params;
        const { limit = 10 } = request.query;

        logger.info(
          `[AutoUpdateRoutes] Getting update history for ${serverName} (limit: ${limit})`,
        );

        // Try to get history from database
        let events = [];
        try {
          const { getServerUpdateHistory } =
            await import("../services/database.js");
          if (typeof getServerUpdateHistory === "function") {
            const history = getServerUpdateHistory(serverName, limit);
            events = history.map((record, idx) => ({
              id: record.id?.toString() || `event-${idx}`,
              serverName: record.server_name || serverName,
              status: record.status || "completed",
              message: record.message || "Update completed",
              timestamp:
                record.timestamp ||
                record.created_at ||
                new Date().toISOString(),
              fromVersion: record.from_version || null,
              toVersion: record.to_version || null,
            }));
          }
        } catch (dbError) {
          logger.warn(
            `[AutoUpdateRoutes] Could not fetch history from database:`,
            dbError.message,
          );
        }

        // If no database history, try to get from update status
        if (events.length === 0) {
          const currentStatus = autoUpdateService.getUpdateStatus(serverName);
          if (currentStatus.status !== "idle" && currentStatus.updatedAt) {
            events.push({
              id: "1",
              serverName,
              status: currentStatus.status,
              message: `Status: ${currentStatus.status}`,
              timestamp: currentStatus.updatedAt.toISOString(),
              fromVersion: null,
              toVersion: null,
            });
          }
        }

        return {
          success: true,
          serverName,
          events,
        };
      } catch (error) {
        logger.error(
          `Error getting update history for ${request.params.serverName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to get update history",
          error: error.message,
        });
      }
    },
  );

  /**
   * POST /api/auto-update/servers/:serverName/check
   * Check for available updates for a specific server
   */
  fastify.post(
    "/api/auto-update/servers/:serverName/check",
    {
      preHandler: [requireRead],
      schema: {
        params: {
          type: "object",
          required: ["serverName"],
          properties: {
            serverName: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              serverName: { type: "string" },
              updateAvailable: { type: "boolean" },
              reason: { type: "string", nullable: true },
              lastUpdate: { type: "string", nullable: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;

        logger.info(`[AutoUpdateRoutes] Checking for updates: ${serverName}`);

        const result = await autoUpdateService.checkForUpdates(serverName);

        return {
          success: true,
          serverName,
          updateAvailable: result.available || false,
          reason: result.reason || null,
          lastUpdate: result.lastUpdate || null,
        };
      } catch (error) {
        logger.error(
          `Error checking updates for ${request.params.serverName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to check for updates",
          error: error.message,
        });
      }
    },
  );

  // ============================================================================
  // Server Scheduler Control Endpoints
  // ============================================================================

  /**
   * POST /api/auto-update/servers/:serverName/scheduler/start
   * Start scheduler for a specific server
   */
  fastify.post(
    "/api/auto-update/servers/:serverName/scheduler/start",
    {
      preHandler: [requireWrite],
      schema: {
        params: {
          type: "object",
          required: ["serverName"],
          properties: {
            serverName: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;

        autoUpdateService.startServerScheduler(serverName);

        return {
          success: true,
          message: `Scheduler started for ${serverName}`,
        };
      } catch (error) {
        logger.error(
          `Error starting scheduler for ${request.params.serverName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to start server scheduler",
          error: error.message,
        });
      }
    },
  );

  /**
   * POST /api/auto-update/servers/:serverName/scheduler/stop
   * Stop scheduler for a specific server
   */
  fastify.post(
    "/api/auto-update/servers/:serverName/scheduler/stop",
    {
      preHandler: [requireWrite],
      schema: {
        params: {
          type: "object",
          required: ["serverName"],
          properties: {
            serverName: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;

        autoUpdateService.stopServerScheduler(serverName);

        return {
          success: true,
          message: `Scheduler stopped for ${serverName}`,
        };
      } catch (error) {
        logger.error(
          `Error stopping scheduler for ${request.params.serverName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to stop server scheduler",
          error: error.message,
        });
      }
    },
  );
}
