import logger from "../utils/logger.js";
import {
  UPDATE_STATUS,
  SAVE_RETRY_COUNT,
  SAVE_RETRY_DELAY_MS,
  STARTUP_VERIFY_TIMEOUT_MS,
  STARTUP_VERIFY_INTERVAL_MS,
} from "./auto-update-constants.js";
import {
  createJob,
  updateJob,
  addJobProgress,
} from "./job-manager.js";
import {
  updateServerLastUpdate,
  updateLastAppliedTime,
  saveServerUpdateHistory,
} from "./database.js";

/**
 * Update execution pipeline for the Auto-Update Service.
 */
export class AutoUpdateExecutor {
  /**
   * @param {import('./auto-update-service.js').AutoUpdateService} service
   */
  constructor(service) {
    this.service = service;
  }

  /**
   * Perform the actual server update (creates job, delegates to executeUpdate).
   * @param {string} serverName
   * @param {Object} options
   */
  async performUpdate(serverName, options = {}) {
    logger.info(`[AutoUpdateService] Starting update for ${serverName}`);

    if (this.service.pendingUpdates.has(serverName)) {
      logger.warn(
        `[AutoUpdateService] Update already in progress for ${serverName}`,
      );
      return { success: false, message: "Update already in progress" };
    }

    this.service.cancelWarnings(serverName);

    const job = createJob("auto-update", {
      serverName,
      options,
      startedAt: new Date().toISOString(),
    });

    const updatePromise = this.executeUpdate(serverName, options, job.id);
    this.service.pendingUpdates.set(serverName, updatePromise);

    try {
      return await updatePromise;
    } finally {
      this.service.pendingUpdates.delete(serverName);
    }
  }

  /**
   * Execute the 6-step update workflow.
   * @param {string} serverName
   * @param {Object} options
   * @param {string} jobId
   */
  async executeUpdate(serverName, options, jobId) {
    const config = this.service.getConfig(serverName);
    const steps = [
      "Preparing update",
      "Saving world data",
      "Stopping server",
      "Updating server binaries",
      "Starting server",
      "Verifying startup",
    ];

    let currentStep = 0;

    const emitProgress = (message, percent) => {
      addJobProgress(jobId, { message, percent });
      this.service.emit("auto-update:progress", {
        serverName,
        step: currentStep,
        totalSteps: steps.length,
        message,
        percent,
        timestamp: new Date(),
      });
    };

    this.service.setStatus(serverName, UPDATE_STATUS.UPDATING, {
      jobId,
      startedAt: new Date(),
    });
    this.service.emit("auto-update:starting", {
      serverName,
      jobId,
      timestamp: new Date(),
    });

    try {
      // Step 1: Prepare
      currentStep = 1;
      emitProgress(steps[0], 10);
      logger.info(`[AutoUpdateService] ${serverName}: ${steps[0]}`);

      if (this.service.notificationService) {
        try {
          const rconConfig = await this.service.getServerRconConfig(serverName);
          await this.service.notificationService.sendUpdateStarting(serverName, {
            rconConfig,
            channels: {
              rcon: config.notifyInGame,
              discord: config.notifyDiscord,
              socket: true,
            },
          });
        } catch (error) {
          logger.warn(
            `[AutoUpdateService] Failed to send update starting notification:`,
            error,
          );
        }
      } else if (config.notifyInGame) {
        try {
          await this.service.sendInGameBroadcast(
            serverName,
            "[AUTO-UPDATE] Server update starting NOW. The server will restart shortly.",
          );
        } catch (error) {
          logger.warn(
            `[AutoUpdateService] Failed to send final warning:`,
            error,
          );
        }
      }

      // Step 2: Save world
      currentStep = 2;
      emitProgress(steps[1], 20);
      logger.info(`[AutoUpdateService] ${serverName}: ${steps[1]}`);

      try {
        await this.saveWorldDataWithRetry(serverName);
        logger.info(`[AutoUpdateService] ${serverName}: World data saved`);
      } catch (error) {
        logger.warn(
          `[AutoUpdateService] ${serverName}: Failed to save world (may be offline):`,
          error.message,
        );
      }

      // Step 3: Stop server
      currentStep = 3;
      emitProgress(steps[2], 35);
      logger.info(`[AutoUpdateService] ${serverName}: ${steps[2]}`);

      await this.service.stopServer(serverName);
      logger.info(`[AutoUpdateService] ${serverName}: Server stopped`);

      // Step 4: Update binaries
      currentStep = 4;
      emitProgress(steps[3], 50);
      logger.info(`[AutoUpdateService] ${serverName}: ${steps[3]}`);

      await this.service
        ._provisionerFor(this.service._gameTypeFor(serverName))
        .updateServerBinaries(serverName);
      logger.info(`[AutoUpdateService] ${serverName}: Binaries updated`);

      updateServerLastUpdate(serverName);
      updateLastAppliedTime(serverName);

      // Step 5: Start server
      if (config.autoRestart) {
        currentStep = 5;
        emitProgress(steps[4], 80);
        logger.info(`[AutoUpdateService] ${serverName}: ${steps[4]}`);

        await this.service.startServer(serverName);
        logger.info(`[AutoUpdateService] ${serverName}: Server started`);

        // Step 6: Verify startup
        currentStep = 6;
        emitProgress(steps[5], 95);
        logger.info(`[AutoUpdateService] ${serverName}: ${steps[5]}`);

        await this.service.verifyServerStartup(serverName);
      }

      // Complete
      emitProgress("Update completed successfully", 100);

      this.service.setStatus(serverName, UPDATE_STATUS.COMPLETED, {
        completedAt: new Date(),
        jobId,
      });

      updateJob(jobId, {
        status: "completed",
        result: { success: true, completedAt: new Date().toISOString() },
      });

      this.service.emit("auto-update:completed", {
        serverName,
        jobId,
        timestamp: new Date(),
      });

      try {
        saveServerUpdateHistory(serverName, {
          eventType: "complete",
          status: "success",
          message: "Update completed successfully",
          details: {
            jobId,
            playersOnlineAtExecution:
              options.playerStateAtExecution?.count ?? null,
            startedEarlyBecauseEmpty: !!options.startedEarlyBecauseEmpty,
          },
        });
      } catch (historyError) {
        logger.warn(
          `[AutoUpdateService] Failed to save update history:`,
          historyError,
        );
      }

      if (this.service.notificationService) {
        try {
          const rconConfig = await this.service.getServerRconConfig(serverName);
          await this.service.notificationService.sendUpdateCompleted(
            serverName,
            {
              rconConfig,
              channels: {
                rcon: config.notifyInGame,
                discord: config.notifyDiscord,
                socket: true,
              },
            },
          );
        } catch (error) {
          logger.error(
            `[AutoUpdateService] Failed to send completion notification:`,
            error,
          );
        }
      } else if (config.notifyDiscord) {
        try {
          await this.service.discordService.sendNotification({
            type: "server_start",
            serverName,
            message: `✅ Server update completed successfully and server is back online.`,
            timestamp: new Date(),
            data: { status: "online" },
          });
        } catch (error) {
          logger.error(
            `[AutoUpdateService] Failed to send completion notification:`,
            error,
          );
        }
      }

      logger.info(
        `[AutoUpdateService] ${serverName}: Update completed successfully`,
      );
      return { success: true, jobId };
    } catch (error) {
      logger.error(
        `[AutoUpdateService] ${serverName}: Update failed at step ${currentStep}:`,
        error,
      );

      this.service.setStatus(serverName, UPDATE_STATUS.FAILED, {
        error: error.message,
        failedStep: currentStep,
        failedAt: new Date(),
      });

      updateJob(jobId, { status: "failed", error: error.message });

      this.service.emit("auto-update:failed", {
        serverName,
        jobId,
        error: error.message,
        phase: steps[currentStep - 1] || "unknown",
        timestamp: new Date(),
      });

      try {
        saveServerUpdateHistory(serverName, {
          eventType: "error",
          status: "failed",
          message: error.message,
          details: {
            jobId,
            failedStep: currentStep,
            phase: steps[currentStep - 1] || "unknown",
          },
        });
      } catch (historyError) {
        logger.warn(
          `[AutoUpdateService] Failed to save failure history:`,
          historyError,
        );
      }

      if (this.service.notificationService) {
        try {
          const rconConfig = await this.service.getServerRconConfig(serverName);
          await this.service.notificationService.sendUpdateFailed(
            serverName,
            error.message,
            {
              rconConfig,
              channels: {
                rcon: config.notifyInGame,
                discord: config.notifyDiscord,
                socket: true,
              },
            },
          );
        } catch (notifyError) {
          logger.error(
            `[AutoUpdateService] Failed to send error notification:`,
            notifyError,
          );
        }
      } else if (config.notifyDiscord) {
        try {
          await this.service.discordService.sendErrorNotification(
            serverName,
            error,
            "Auto-update process",
          );
        } catch (notifyError) {
          logger.error(
            `[AutoUpdateService] Failed to send error notification:`,
            notifyError,
          );
        }
      }

      if (currentStep > 3 && config.autoRestart) {
        try {
          logger.info(
            `[AutoUpdateService] ${serverName}: Attempting to restart server after failed update`,
          );
          await this.service.startServer(serverName);
        } catch (restartError) {
          logger.error(
            `[AutoUpdateService] ${serverName}: Failed to restart server:`,
            restartError,
          );
        }
      }

      throw error;
    }
  }

  async saveWorldData(serverName) {
    try {
      const serverConfig = await this.service.getServerRconConfig(serverName);
      if (!serverConfig) {
        throw new Error(`No RCON config found for ${serverName}`);
      }
      const rconService = (await import("./rcon.js")).default;
      await rconService.saveWorld(serverName, serverConfig);
      logger.info(`[AutoUpdateService] World saved for ${serverName}`);
    } catch (error) {
      logger.error(
        `[AutoUpdateService] Failed to save world for ${serverName}:`,
        error,
      );
      throw error;
    }
  }

  async saveWorldDataWithRetry(serverName) {
    let lastError = null;
    for (let attempt = 1; attempt <= SAVE_RETRY_COUNT; attempt += 1) {
      try {
        await this.saveWorldData(serverName);
        return;
      } catch (error) {
        lastError = error;
        logger.warn(
          `[AutoUpdateService] Save attempt ${attempt}/${SAVE_RETRY_COUNT} failed for ${serverName}: ${error.message}`,
        );
        if (attempt < SAVE_RETRY_COUNT) {
          await this.service.delay(SAVE_RETRY_DELAY_MS);
        }
      }
    }
    throw lastError || new Error(`Failed to save world for ${serverName}`);
  }
}
