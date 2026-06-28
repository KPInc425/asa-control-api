import logger from "../utils/logger.js";
import {
  DEFAULT_CONFIG,
  UPDATE_STATUS,
  WARNING_RECHECK_INTERVAL_MS,
} from "./auto-update-constants.js";
import { saveServerUpdateHistory } from "./database.js";

/**
 * Warning countdown logic for the Auto-Update Service.
 */
export class AutoUpdateWarning {
  /**
   * @param {import('./auto-update-service.js').AutoUpdateService} service
   */
  constructor(service) {
    this.service = service;
  }

  /**
   * Initiate the update process — either start warning countdown or update directly.
   * @param {string} serverName
   * @param {Object} options
   */
  async initiateUpdate(serverName, options = {}) {
    const config = this.service.getConfig(serverName);

    if (this.service.pendingUpdates.has(serverName)) {
      logger.warn(
        `[AutoUpdateService] Update already in progress for ${serverName}`,
      );
      return { success: false, message: "Update already in progress" };
    }

    if (!options.force) {
      const playerState = await this.service.getPlayerConnectionState(serverName);
      if (playerState.hasPlayers) {
        await this.startWarningCountdown(serverName, {
          ...options,
          initialPlayerCount: playerState.count,
        });
        return {
          success: true,
          message: `Warning countdown started for ${playerState.count} connected player(s)`,
        };
      }
    }

    return await this.service.performUpdate(serverName, options);
  }

  /**
   * Start the warning countdown before an update.
   * @param {string} serverName
   * @param {Object} options
   */
  async startWarningCountdown(serverName, options = {}) {
    const config = this.service.getConfig(serverName);
    const warningMinutes =
      config.warningMinutes || DEFAULT_CONFIG.warningMinutes;
    const sortedWarningMinutes = [...warningMinutes].sort((a, b) => b - a);
    const maxWarningMinutes = Math.max(...sortedWarningMinutes, 0);
    const startedAt = new Date();
    const deadlineAt = new Date(
      startedAt.getTime() + maxWarningMinutes * 60 * 1000,
    );

    logger.info(
      `[AutoUpdateService] Starting warning countdown for ${serverName}: ${sortedWarningMinutes.join(", ")} minutes`,
    );

    this.service.setStatus(serverName, UPDATE_STATUS.WARNING, {
      warningMinutes: sortedWarningMinutes,
      startedAt,
      deadlineAt,
      playersDetectedAtStart: options.initialPlayerCount ?? null,
    });

    this.service.cancelWarnings(serverName);

    const timers = [];

    for (const minutes of sortedWarningMinutes) {
      const delayMs = (maxWarningMinutes - minutes) * 60 * 1000;
      const timer = setTimeout(async () => {
        await this.sendWarningNotification(serverName, minutes, { deadlineAt });
      }, delayMs);
      timers.push(timer);
    }

    const recheckTimer = setInterval(async () => {
      try {
        await this.handleWarningPhaseRecheck(serverName, options, deadlineAt);
      } catch (error) {
        logger.warn(
          `[AutoUpdateService] Warning recheck failed for ${serverName}:`,
          error.message,
        );
      }
    }, WARNING_RECHECK_INTERVAL_MS);
    timers.push(recheckTimer);

    const updateDelayMs = maxWarningMinutes * 60 * 1000;
    const updateTimer = setTimeout(async () => {
      await this.service.performUpdate(serverName, {
        ...options,
        playerStateAtExecution:
          await this.service.getPlayerConnectionState(serverName),
      });
    }, updateDelayMs);
    timers.push(updateTimer);

    this.service.warningTimers.set(serverName, timers);

    if (maxWarningMinutes > 0) {
      await this.sendWarningNotification(serverName, maxWarningMinutes, {
        deadlineAt,
      });
    }

    return { success: true, firstWarning: maxWarningMinutes };
  }

  /**
   * Recheck player state during warning phase — skip to update if server becomes empty.
   */
  async handleWarningPhaseRecheck(serverName, options, deadlineAt) {
    if (
      !this.service.warningTimers.has(serverName) ||
      this.service.pendingUpdates.has(serverName)
    ) {
      return;
    }

    const playerState = await this.service.getPlayerConnectionState(serverName);
    const now = new Date();

    this.service.setStatus(serverName, UPDATE_STATUS.WARNING, {
      ...this.service.getUpdateStatus(serverName),
      deadlineAt,
      lastPlayerCheckAt: now,
      playersConnected: playerState.count,
    });

    if (!playerState.hasPlayers) {
      logger.info(
        `[AutoUpdateService] ${serverName} is empty during warning phase, proceeding immediately`,
      );
      this.service.cancelWarnings(serverName);

      try {
        await this.service.sendInGameBroadcast(
          serverName,
          "[AUTO-UPDATE] Server is now empty. Applying update immediately.",
        );
      } catch (error) {
        logger.debug(
          `[AutoUpdateService] Empty-server broadcast skipped for ${serverName}: ${error.message}`,
        );
      }

      await this.service.performUpdate(serverName, {
        ...options,
        startedEarlyBecauseEmpty: true,
        playerStateAtExecution: playerState,
      });
    }
  }

  /**
   * Send a warning notification to players.
   * @param {string} serverName
   * @param {number} minutesRemaining
   */
  async sendWarningNotification(serverName, minutesRemaining, context = {}) {
    logger.info(
      `[AutoUpdateService] Sending ${minutesRemaining}min warning for ${serverName}`,
    );

    const config = this.service.getConfig(serverName);
    const message = `[AUTO-UPDATE] Server will restart for update in ${minutesRemaining} minute${minutesRemaining !== 1 ? "s" : ""}. Please save your progress!`;

    this.service.emit("auto-update:warning", {
      serverName,
      minutesRemaining,
      message,
      timestamp: new Date(),
    });

    saveServerUpdateHistory(serverName, {
      eventType: "warning",
      status: "in_progress",
      message,
      details: {
        minutesRemaining,
        deadlineAt: context.deadlineAt?.toISOString?.() || null,
      },
    });

    if (this.service.notificationService) {
      try {
        const rconConfig = await this.service.getServerRconConfig(serverName);
        await this.service.notificationService.sendUpdateWarning(
          serverName,
          minutesRemaining,
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
          `[AutoUpdateService] NotificationService warning failed:`,
          error,
        );
      }
    } else {
      if (config.notifyInGame) {
        try {
          await this.service.sendInGameBroadcast(serverName, message);
        } catch (error) {
          logger.error(
            `[AutoUpdateService] Failed to send in-game broadcast:`,
            error,
          );
        }
      }

      if (config.notifyDiscord) {
        try {
          await this.service.discordService.sendNotification({
            type: "server_status",
            serverName,
            message: `⚠️ ${message}`,
            timestamp: new Date(),
            data: { status: "updating", minutesRemaining },
          });
        } catch (error) {
          logger.error(
            `[AutoUpdateService] Failed to send Discord notification:`,
            error,
          );
        }
      }
    }
  }

  /**
   * Cancel pending warning timers for a server.
   * @param {string} serverName
   */
  cancelWarnings(serverName) {
    const timers = this.service.warningTimers.get(serverName);
    if (timers) {
      timers.forEach((timer) => clearTimeout(timer));
      this.service.warningTimers.delete(serverName);
      logger.info(`[AutoUpdateService] Cancelled warnings for ${serverName}`);
    }
  }
}
