import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../../utils/logger.js";

/**
 * Cluster start operations
 */
export class ClusterStart {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Start a cluster (start all servers in the cluster)
   */
  async startCluster(clusterName) {
    try {
      logger.info(`Starting cluster: ${clusterName}`);
      const clusterPath = path.join(this.parent.clustersPath, clusterName);

      if (!existsSync(clusterPath)) {
        throw new Error(`Cluster "${clusterName}" does not exist`);
      }

      const configPath = path.join(clusterPath, "cluster.json");
      let clusterConfig;
      try {
        const configContent = await fs.readFile(configPath, "utf8");
        clusterConfig = JSON.parse(configContent);
      } catch {
        throw new Error(`Cluster configuration not found for "${clusterName}"`);
      }

      const results = [];

      for (const server of clusterConfig.servers || []) {
        try {
          const serverPath = path.join(clusterPath, server.name);
          const startScriptPath = path.join(serverPath, "start.bat");

          if (existsSync(startScriptPath)) {
            logger.info(
              `Starting server: ${server.name} in cluster ${clusterName}`,
            );
            results.push({
              serverName: server.name,
              success: true,
              message: `Start script available for ${server.name}`,
              scriptPath: startScriptPath,
            });
          } else {
            results.push({
              serverName: server.name,
              success: false,
              message: `Start script not found for ${server.name}`,
            });
          }
        } catch (error) {
          logger.error(`Failed to start server ${server.name}:`, error);
          results.push({
            serverName: server.name,
            success: false,
            message: error.message,
          });
        }
      }

      return {
        success: true,
        message: `Cluster "${clusterName}" start initiated`,
        results: results,
      };
    } catch (error) {
      logger.error(`Failed to start cluster ${clusterName}:`, error);
      throw error;
    }
  }
}
