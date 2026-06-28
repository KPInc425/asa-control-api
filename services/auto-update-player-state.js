import logger from "../utils/logger.js";

/**
 * Player state and RCON operations for the Auto-Update Service.
 */
export class AutoUpdatePlayerState {
  /**
   * @param {import('./auto-update-service.js').AutoUpdateService} service
   */
  constructor(service) {
    this.service = service;
  }

  /**
   * Check if players are connected to a server.
   * @param {string} serverName
   * @returns {boolean}
   */
  async checkPlayersConnected(serverName) {
    const playerState = await this.getPlayerConnectionState(serverName);
    return playerState.hasPlayers;
  }

  /**
   * Get detailed player connection state.
   * @param {string} serverName
   */
  async getPlayerConnectionState(serverName) {
    try {
      const serverConfig = await this.service.getServerRconConfig(serverName);
      if (!serverConfig) {
        logger.warn(
          `[AutoUpdateService] No RCON config found for ${serverName}`,
        );
        return {
          hasPlayers: false,
          count: 0,
          players: [],
          checkedAt: new Date().toISOString(),
          source: "missing-rcon",
        };
      }

      const rconService = (await import("./rcon.js")).default;
      const players = await rconService.getPlayerList(
        serverName,
        serverConfig,
      );
      const hasPlayers = Array.isArray(players) && players.length > 0;

      logger.info(
        `[AutoUpdateService] ${serverName}: ${hasPlayers ? players.length : 0} players connected`,
      );
      return {
        hasPlayers,
        count: hasPlayers ? players.length : 0,
        players: Array.isArray(players) ? players : [],
        checkedAt: new Date().toISOString(),
        source: "rcon",
      };
    } catch (error) {
      logger.warn(
        `[AutoUpdateService] Failed to check players for ${serverName}:`,
        error.message,
      );
      return {
        hasPlayers: false,
        count: 0,
        players: [],
        checkedAt: new Date().toISOString(),
        source: "error",
        error: error.message,
      };
    }
  }

  /**
   * Send an in-game broadcast message via RCON.
   * @param {string} serverName
   * @param {string} message
   */
  async sendInGameBroadcast(serverName, message) {
    try {
      const serverConfig = await this.service.getServerRconConfig(serverName);
      if (!serverConfig) {
        throw new Error(`No RCON config found for ${serverName}`);
      }
      const rconService = (await import("./rcon.js")).default;
      await rconService.broadcast(serverName, message, serverConfig);
      logger.info(
        `[AutoUpdateService] Broadcast sent to ${serverName}: ${message}`,
      );
    } catch (error) {
      logger.error(
        `[AutoUpdateService] Failed to broadcast to ${serverName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get RCON configuration for a server.
   * @param {string} serverName
   * @returns {Object|null}
   */
  async getServerRconConfig(serverName) {
    try {
      const provisioner = this.service._provisionerFor(
        this.service._gameTypeFor(serverName),
      );
      const servers = await provisioner.listServers();
      const server = servers.find((s) => s.name === serverName);

      if (server && server.rconPort) {
        return {
          host: server.host || "localhost",
          port: server.rconPort,
          password: server.rconPassword || process.env.RCON_PASSWORD,
        };
      }

      const clusters = await provisioner.listClusters();
      for (const cluster of clusters) {
        if (cluster.servers) {
          const clusterServer = cluster.servers.find(
            (s) => s.name === serverName,
          );
          if (clusterServer && clusterServer.rconPort) {
            return {
              host: clusterServer.host || "localhost",
              port: clusterServer.rconPort,
              password:
                clusterServer.rconPassword || process.env.RCON_PASSWORD,
            };
          }
        }
      }

      return null;
    } catch (error) {
      logger.error(
        `[AutoUpdateService] Error getting RCON config for ${serverName}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Stop a server (RCON graceful shutdown + native stop).
   * @param {string} serverName
   */
  async stopServer(serverName) {
    try {
      try {
        const serverConfig = await this.service.getServerRconConfig(serverName);
        if (serverConfig) {
          const rconService = (await import("./rcon.js")).default;
          await rconService.sendCommand(serverConfig, "DoExit");
          await this.service.delay(5000);
        }
      } catch (rconError) {
        logger.warn(
          `[AutoUpdateService] RCON shutdown failed for ${serverName}:`,
          rconError.message,
        );
      }

      const { NativeServerManager } = await import("./native-server-manager.js");
      const nativeManager = new NativeServerManager();
      await nativeManager.stop(serverName);
      logger.info(
        `[AutoUpdateService] Server ${serverName} stop requested`,
      );
      await this.waitForRunningState(serverName, false, 30000);
    } catch (error) {
      logger.error(
        `[AutoUpdateService] Failed to stop ${serverName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Start a server via NativeServerManager.
   * @param {string} serverName
   */
  async startServer(serverName) {
    try {
      const { NativeServerManager } = await import("./native-server-manager.js");
      const nativeManager = new NativeServerManager();
      const startResult = await nativeManager.start(serverName);
      logger.info(
        `[AutoUpdateService] Server ${serverName} start requested`,
        startResult,
      );
    } catch (error) {
      logger.error(
        `[AutoUpdateService] Failed to start ${serverName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Verify server startup by waiting for running state + RCON ping.
   * @param {string} serverName
   */
  async verifyServerStartup(serverName) {
    const started = await this.waitForRunningState(
      serverName,
      true,
      STARTUP_VERIFY_TIMEOUT_MS,
    );

    if (!started) {
      throw new Error(
        `Server ${serverName} did not enter running state after update`,
      );
    }

    const serverConfig = await this.service.getServerRconConfig(serverName);
    if (!serverConfig) {
      logger.warn(
        `[AutoUpdateService] No RCON config available for startup verification on ${serverName}`,
      );
      return true;
    }

    try {
      const rconService = (await import("./rcon.js")).default;
      await rconService.sendCommand(serverConfig, "ListPlayers");
      return true;
    } catch (error) {
      logger.warn(
        `[AutoUpdateService] RCON verification failed for ${serverName}: ${error.message}`,
      );
      return true;
    }
  }

  /**
   * Poll isRunning until it matches the expected state or timeout.
   * @param {string} serverName
   * @param {boolean} shouldBeRunning
   * @param {number} timeoutMs
   */
  async waitForRunningState(serverName, shouldBeRunning, timeoutMs) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const { NativeServerManager } = await import(
          "./native-server-manager.js"
        );
        const nativeManager = new NativeServerManager();
        const isRunning = await nativeManager.isRunning(serverName);
        if (isRunning === shouldBeRunning) {
          return true;
        }
      } catch (error) {
        logger.debug(
          `[AutoUpdateService] Running state check failed for ${serverName}: ${error.message}`,
        );
      }

      await this.service.delay(STARTUP_VERIFY_INTERVAL_MS);
    }

    return false;
  }
}
