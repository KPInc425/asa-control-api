import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../../../utils/logger.js";
import { gameFor } from "../../../games/index.js";

const execAsync = promisify(exec);

/**
 * Binary update operations
 */
export class BinaryUpdater {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Update ASA binaries for a specific server
   */
  async updateForServer(serverName) {
    try {
      logger.info(`Updating ASA binaries for server: ${serverName}`);

      const clusters = await this.parent.listClusters();
      for (const cluster of clusters) {
        const server = cluster.config.servers?.find(
          (s) => s.name === serverName,
        );
        if (server) {
          logger.info(
            `Server ${serverName} is a cluster server, using cluster update method`,
          );
          await this.parent.installForServerInCluster(cluster.name, serverName, false);
          logger.info(`ASA binaries updated for cluster server: ${serverName}`);
          return { success: true };
        }
      }

      logger.info(
        `Server ${serverName} not found in clusters, trying as standalone server`,
      );
      await this.parent.installForServer(serverName);
      logger.info(`ASA binaries updated for standalone server: ${serverName}`);
      return { success: true };
    } catch (error) {
      logger.error(
        `Failed to update ASA binaries for server ${serverName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Update ASA binaries for all servers
   */
  async updateAll() {
    try {
      logger.info("Updating ASA binaries for all servers...");
      await fs.mkdir(this.parent.serversPath, { recursive: true });
      const servers = await fs.readdir(this.parent.serversPath);
      const results = [];

      for (const serverName of servers) {
        try {
          const serverPath = path.join(this.parent.serversPath, serverName);
          const stat = await fs.stat(serverPath);

          if (stat.isDirectory()) {
            logger.info(`Updating server: ${serverName}`);
            await this.updateForServer(serverName);
            results.push({ server: serverName, success: true });
          }
        } catch (error) {
          logger.error(`Failed to update server ${serverName}:`, error);
          results.push({
            server: serverName,
            success: false,
            error: error.message,
          });
        }
      }

      logger.info("All server binary updates completed");
      return { success: true, results };
    } catch (error) {
      logger.error("Failed to update all server binaries:", error);
      throw error;
    }
  }
}
