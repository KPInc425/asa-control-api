import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../../../utils/logger.js";
import {
  getAllServerConfigs,
  deleteServerConfig,
} from "../../database.js";

/**
 * Cluster deletion operations
 */
export class ClusterDeletion {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Delete a cluster and all its servers
   */
  async deleteCluster(clusterName, options = {}) {
    const { force = false, backup = true } = options;
    const clusterPath = path.join(this.parent.clustersPath, clusterName);

    try {
      logger.info(
        `Deleting cluster: ${clusterName} (force: ${force}, backup: ${backup})`,
      );

      // DB-native: Find all servers in the DB with this clusterId/clusterName
      const dbConfigs = getAllServerConfigs();
      const serversInCluster = dbConfigs.filter((config) => {
        try {
          const serverConfig = JSON.parse(config.config_data);
          return (
            serverConfig.clusterId === clusterName ||
            serverConfig.clusterName === clusterName ||
            (serverConfig.config &&
              (serverConfig.config.clusterId === clusterName ||
                serverConfig.config.clusterName === clusterName))
          );
        } catch {
          return false;
        }
      });
      if (serversInCluster.length === 0) {
        throw new Error(
          `Cluster "${clusterName}" does not exist in the database`,
        );
      }

      // Create backup if requested
      if (backup) {
        logger.info(`Creating backup before deleting cluster: ${clusterName}`);
        try {
          await this.parent.backupCluster(clusterName);
          logger.info(`Backup created for cluster: ${clusterName}`);
        } catch (backupError) {
          if (!force) {
            throw new Error(
              `Failed to create backup for cluster "${clusterName}": ${backupError.message}`,
            );
          }
          logger.warn(
            `Backup failed for cluster ${clusterName}, but continuing due to force flag:`,
            backupError,
          );
        }
      }

      // Delete all servers in the DB for this cluster
      for (const config of serversInCluster) {
        try {
          const serverConfig = JSON.parse(config.config_data);
          if (serverConfig.serverPath && existsSync(serverConfig.serverPath)) {
            await this.parent.deleteDirectoryManually(serverConfig.serverPath);
          }
        } catch {}
        deleteServerConfig(config.name);
      }

      // Optionally, clean up the cluster directory if it exists
      if (existsSync(clusterPath)) {
        await this.parent.deleteDirectoryManually(clusterPath);
      }

      logger.info(`Cluster ${clusterName} deleted successfully (DB-native)`);
      return {
        success: true,
        message: `Cluster "${clusterName}" deleted successfully`,
        backedUp: backup,
      };
    } catch (error) {
      logger.error(`Failed to delete cluster ${clusterName}:`, error);
      throw error;
    }
  }
}
