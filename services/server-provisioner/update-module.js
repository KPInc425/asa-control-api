import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../../utils/logger.js";

const execAsync = promisify(exec);

/**
 * Update configuration and build ID management module
 */
export class UpdateModule {
  constructor(service) {
    this.service = service;
  }

  /**
   * Every server the suite manages, read from the server_configs table.
   *
   * The update manager used to walk listClusters(), which only ever contains
   * cluster.json files under clusters/. Every real server here is a
   * server_configs row whose install lives in servers/, so the walk found
   * nothing: the UI said "No servers found" and "Update All" reported
   * "0 servers". The DB row is the source of truth (see /api/servers).
   */
  async listUpdateTargets() {
    const { getAllServerConfigs } = await import("../database.js");
    const rows = getAllServerConfigs();
    const targets = [];

    for (const row of rows) {
      let cfg = {};
      try {
        cfg = JSON.parse(row.config_data || "{}");
      } catch (error) {
        logger.warn(
          `Update targets: unreadable config_data for ${row.name}: ${error.message}`,
        );
      }

      const serverPath = cfg.serverPath || null;
      if (!serverPath) {
        logger.warn(
          `Update targets: ${row.name} has no serverPath in its config, skipping`,
        );
        continue;
      }

      targets.push({
        serverName: row.name,
        gameType: row.game_type || cfg.gameType || "ark",
        serverPath,
        map: cfg.map || null,
        clusterId: cfg.clusterId || cfg.clusterName || null,
        gamePort: cfg.gamePort ?? null,
      });
    }

    return targets.sort((a, b) => a.serverName.localeCompare(b.serverName));
  }

  /**
   * Get server update configuration
   */
  async getServerUpdateConfig(serverName) {
    try {
      const { getServerUpdateConfig } = await import("../database.js");
      const dbConfig = getServerUpdateConfig(serverName);

      if (dbConfig) {
        return {
          serverName,
          clusterName: dbConfig.cluster_name,
          updateOnStart: dbConfig.update_on_start === 1,
          lastUpdate: dbConfig.last_update,
          updateEnabled: dbConfig.update_enabled === 1,
          autoUpdate: dbConfig.auto_update === 1,
          updateInterval: dbConfig.update_interval || 24,
          updateSchedule: dbConfig.update_schedule,
        };
      }

      return {
        serverName,
        clusterName: null,
        updateOnStart: true,
        lastUpdate: null,
        updateEnabled: true,
        autoUpdate: false,
        updateInterval: 24,
        updateSchedule: null,
      };
    } catch (error) {
      logger.error(`Error getting update config for server ${serverName}:`, error);
      return {
        serverName,
        clusterName: null,
        updateOnStart: true,
        lastUpdate: null,
        updateEnabled: true,
        autoUpdate: false,
        updateInterval: 24,
        updateSchedule: null,
      };
    }
  }

  /**
   * Update server update configuration
   */
  async updateServerUpdateConfig(serverName, config) {
    try {
      const { upsertServerUpdateConfig } = await import("../database.js");

      const updateData = {
        serverName,
        clusterName: config.clusterName || null,
        updateOnStart: config.updateOnStart ? 1 : 0,
        updateEnabled: config.updateEnabled ? 1 : 0,
        autoUpdate: config.autoUpdate ? 1 : 0,
        updateInterval: config.updateInterval || 24,
        updateSchedule: config.updateSchedule || null,
      };

      upsertServerUpdateConfig(updateData);
      logger.info(`Update configuration saved for server ${serverName}`);

      return {
        success: true,
        message: "Update configuration saved successfully",
      };
    } catch (error) {
      logger.error(`Error updating configuration for server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Check if server needs update
   */
  async checkServerUpdateStatus(serverName) {
    try {
      const config = await this.getServerUpdateConfig(serverName);

      if (!config.updateEnabled) {
        return {
          needsUpdate: false,
          reason: "Updates disabled",
          lastUpdate: config.lastUpdate,
        };
      }

      const latestBuildId = await this.getLatestAsaBuildId();
      const localBuildId = await this.getInstalledAsaBuildId(serverName);

      if (latestBuildId && localBuildId && latestBuildId !== localBuildId) {
        return {
          needsUpdate: true,
          reason: `Steam build ${latestBuildId} is newer than installed build ${localBuildId}`,
          lastUpdate: config.lastUpdate,
          currentBuildId: localBuildId,
          latestBuildId,
          updateInterval: config.updateInterval,
          updateOnStart: config.updateOnStart,
          updateEnabled: config.updateEnabled,
        };
      }

      if (config.autoUpdate && config.lastUpdate) {
        const lastUpdate = new Date(config.lastUpdate);
        const now = new Date();
        const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);

        if (hoursSinceUpdate >= config.updateInterval) {
          return {
            needsUpdate: true,
            reason: `Auto-update due (${Math.floor(hoursSinceUpdate)}h since last update)`,
            lastUpdate: config.lastUpdate,
            currentBuildId: localBuildId,
            latestBuildId,
            updateInterval: config.updateInterval,
            updateOnStart: config.updateOnStart,
            updateEnabled: config.updateEnabled,
          };
        }
      }

      // An install with no appmanifest cannot be compared to Steam, and
      // reporting "Up to date" for it is how a stale server stays stale.
      const buildKnown = Boolean(latestBuildId && localBuildId);
      return {
        needsUpdate: false,
        unknownBuild: !buildKnown,
        reason: buildKnown
          ? `Installed build ${localBuildId} matches Steam build ${latestBuildId}`
          : !latestBuildId
            ? "Could not read Steam build info"
            : "Installed build unknown: no Steam manifest in this install (an update repairs it)",
        lastUpdate: config.lastUpdate,
        currentBuildId: localBuildId,
        latestBuildId,
        updateInterval: config.updateInterval,
        updateOnStart: config.updateOnStart,
        updateEnabled: config.updateEnabled,
      };
    } catch (error) {
      logger.error(`Error checking update status for server ${serverName}:`, error);
      return {
        needsUpdate: false,
        reason: "Error checking update status",
        lastUpdate: null,
        error: error.message,
      };
    }
  }

  async getLatestAsaBuildId() {
    const cacheTtlMs = 5 * 60 * 1000;
    if (
      this.service.latestBuildCache.buildId &&
      Date.now() - this.service.latestBuildCache.checkedAt < cacheTtlMs
    ) {
      return this.service.latestBuildCache.buildId;
    }

    // Fast path: a plain HTTPS read takes ~1s where steamcmd app_info_print
    // takes 15-30s and blocks the status endpoint. steamcmd stays the fallback
    // so the suite still answers when the mirror is down.
    const fromMirror = await this.getLatestAsaBuildIdFromMirror();
    if (fromMirror) {
      this.service.latestBuildCache = { buildId: fromMirror, checkedAt: Date.now() };
      return fromMirror;
    }

    try {
      const steamCmdExe = this.service.steamCmdManager.getExecutablePath();
      const command = `"${steamCmdExe}" +login anonymous +app_info_update 1 +app_info_print 2430930 +quit`;
      const { stdout } = await execAsync(command, {
        timeout: 120000,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      });
      const buildId = this.extractBuildId(stdout);

      if (buildId) {
        this.service.latestBuildCache = {
          buildId,
          checkedAt: Date.now(),
        };
      }

      return buildId;
    } catch (error) {
      logger.warn(`Failed to fetch latest Steam build ID for ASA: ${error.message}`);
      return this.service.latestBuildCache.buildId;
    }
  }

  async getLatestAsaBuildIdFromMirror() {
    try {
      const response = await fetch("https://api.steamcmd.net/v1/info/2430930", {
        signal: AbortSignal.timeout(8000),
        headers: { accept: "application/json" },
      });
      if (!response.ok) return null;
      const payload = await response.json();
      const buildId =
        payload?.data?.["2430930"]?.depots?.branches?.public?.buildid ?? null;
      return buildId ? String(buildId) : null;
    } catch (error) {
      logger.debug(`Steam build mirror unavailable: ${error.message}`);
      return null;
    }
  }

  async getInstalledAsaBuildId(serverName) {
    try {
      const serverPath = await this.getServerInstallPath(serverName);
      if (!serverPath) {
        return null;
      }

      const manifestCandidates = [
        path.join(serverPath, "steamapps", "appmanifest_2430930.acf"),
        path.join(serverPath, "appmanifest_2430930.acf"),
      ];

      for (const candidate of manifestCandidates) {
        if (existsSync(candidate)) {
          const contents = await fs.readFile(candidate, "utf8");
          const buildId = this.extractBuildId(contents);
          if (buildId) {
            return buildId;
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to read installed build ID for ${serverName}: ${error.message}`);
      return null;
    }
  }

  extractBuildId(rawText) {
    if (!rawText) {
      return null;
    }

    const matches = [...rawText.matchAll(/"buildid"\s+"(\d+)"/g)];
    if (matches.length === 0) {
      return null;
    }

    return matches[matches.length - 1][1];
  }

  async getServerInstallPath(serverName) {
    // The DB row is authoritative: its serverPath is what the start script and
    // the process scan use, and it survives the server living outside
    // clusters/ (all of ours do).
    try {
      const { getServerConfig } = await import("../database.js");
      const row = getServerConfig(serverName);
      if (row?.config_data) {
        const cfg = JSON.parse(row.config_data);
        if (cfg.serverPath) {
          return cfg.serverPath;
        }
      }
    } catch (error) {
      logger.warn(
        `Could not read serverPath for ${serverName} from the database: ${error.message}`,
      );
    }

    const standaloneServers = await this.service.listServers();
    const standalone = standaloneServers.find((server) => server.name === serverName);
    if (standalone?.path) {
      return standalone.path;
    }

    const clusters = await this.service.listClusters();
    for (const cluster of clusters) {
      const clusterServer = cluster?.servers?.find(
        (server) => server.name === serverName,
      );
      if (clusterServer?.serverPath) {
        return clusterServer.serverPath;
      }
      if (clusterServer) {
        return path.join(this.service.clustersPath, cluster.name, serverName);
      }
    }

    return null;
  }

  /**
   * Update server binaries and mark last update time
   */
  async updateServerBinaries(serverName, force = false) {
    try {
      logger.info(
        `Starting binary update for server ${serverName}${force ? " (forced)" : ""}`,
      );

      const previousBuildId = await this.getInstalledAsaBuildId(serverName).catch(
        () => null,
      );

      // The install dir comes from the DB row. Deriving it from serversPath/<name>
      // silently points steamcmd at a directory that is not the running install.
      const serverPath = await this.getServerInstallPath(serverName);
      if (!serverPath) {
        throw new Error(
          `No install path registered for ${serverName}; refusing to run steamcmd`,
        );
      }

      await this.service.asaBinariesManager.updateForServer(serverName, serverPath);

      const { updateServerLastUpdate } = await import("../database.js");
      updateServerLastUpdate(serverName);

      // steamcmd writes the appmanifest as part of the update, so this also
      // repairs installs that had none and gives the caller something to verify.
      const installedBuildId = await this.getInstalledAsaBuildId(serverName).catch(
        () => null,
      );

      logger.info(
        `Binary update completed for server ${serverName}: ${previousBuildId || "unknown"} -> ${installedBuildId || "unknown"}`,
      );
      return {
        success: true,
        previousBuildId,
        installedBuildId,
        message: "Server binaries updated successfully",
      };
    } catch (error) {
      logger.error(`Error updating binaries for server ${serverName}:`, error);
      throw error;
    }
  }
}
