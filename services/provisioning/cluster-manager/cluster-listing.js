import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../../utils/logger.js";

/**
 * Cluster listing and discovery operations
 */
export class ClusterListing {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * List all clusters (DB-native)
   */
  async listClusters() {
    try {
      const clusters = [];
      if (!existsSync(this.parent.clustersPath)) {
        return clusters;
      }
      const clusterDirs = await fs.readdir(this.parent.clustersPath);
      // Get all DB configs for mapping
      const { getAllServerConfigs } = await import("../database.js");
      const dbConfigs = getAllServerConfigs();
      const dbClusterMap = {};
      for (const config of dbConfigs) {
        try {
          const serverConfig = JSON.parse(config.config_data);
          const clusterId = serverConfig.clusterId || serverConfig.clusterName;
          if (clusterId) {
            if (!dbClusterMap[clusterId]) dbClusterMap[clusterId] = [];
            dbClusterMap[clusterId].push(serverConfig);
          }
        } catch {}
      }
      const { parseStartBat } = await import("../../utils/parse-start-bat.js");
      for (const clusterName of clusterDirs) {
        try {
          const clusterPath = path.join(this.parent.clustersPath, clusterName);
          const stat = await fs.stat(clusterPath);
          if (!stat.isDirectory()) continue;
          // DB-driven: if clusterId exists in DB, use DB servers
          let clusterConfig = { name: clusterName, servers: [] };
          if (dbClusterMap[clusterName]) {
            clusterConfig.servers = dbClusterMap[clusterName];
            clusters.push({
              name: clusterName,
              path: clusterPath,
              config: clusterConfig,
            });
            continue;
          }
          // Fallback: scan for start.bat files in subdirs
          const serverDirs = await fs.readdir(clusterPath);
          const fallbackServers = [];
          for (const serverDir of serverDirs) {
            const serverPath = path.join(clusterPath, serverDir);
            if (
              !existsSync(serverPath) ||
              !(await fs.stat(serverPath)).isDirectory()
            )
              continue;
            const startBatPath = path.join(serverPath, "start.bat");
            if (existsSync(startBatPath)) {
              try {
                const parsed = await parseStartBat(startBatPath);
                fallbackServers.push(parsed);
              } catch (e) {
                logger.warn(
                  `[ClusterManager] Fallback: failed to parse start.bat for server ${serverDir} in cluster ${clusterName}: ${e.message}`,
                );
              }
            }
          }
          if (fallbackServers.length > 0) {
            logger.warn(
              `[ClusterManager] Fallback: found cluster on disk not in DB: ${clusterName} with ${fallbackServers.length} servers`,
            );
            clusterConfig.servers = fallbackServers;
            clusters.push({
              name: clusterName,
              path: clusterPath,
              config: clusterConfig,
              fallback: true,
            });
          }
        } catch (error) {
          logger.error(`Error reading cluster ${clusterName}:`, error);
        }
      }
      return clusters;
    } catch (error) {
      logger.error("Failed to list clusters:", error);
      return [];
    }
  }
}
