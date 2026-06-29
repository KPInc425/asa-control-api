import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../utils/logger.js";

const execAsync = promisify(exec);

/**
 * Update configuration and build ID management module
 */
export class UpdateModule {
  constructor(service) {
    this.service = service;
  }

  /**
   * Get server update configuration
   */
  async getServerUpdateConfig(serverName) {
    try {
      const { getServerUpdateConfig } = await import("../services/database.js");
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
      const { upsertServerUpdateConfig } = await import("../services/database.js");

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

      return {
        needsUpdate: false,
        reason:
          latestBuildId && localBuildId
            ? `Installed build ${localBuildId} matches Steam build ${latestBuildId}`
            : "Up to date",
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

      await this.service.asaBinariesManager.updateForServer(serverName);

      const { updateServerLastUpdate } = await import("../services/database.js");
      updateServerLastUpdate(serverName);

      logger.info(`Binary update completed for server ${serverName}`);
      return { success: true, message: "Server binaries updated successfully" };
    } catch (error) {
      logger.error(`Error updating binaries for server ${serverName}:`, error);
      throw error;
    }
  }
}
