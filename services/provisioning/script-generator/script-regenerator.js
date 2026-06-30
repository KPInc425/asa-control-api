import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../../../utils/logger.js";

/**
 * Script regeneration operations
 */
export class ScriptRegenerator {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Regenerate start script for a specific server
   */
  async regenerateServerStartScript(serverName) {
    try {
      logger.info(
        `[regenerateServerStartScript] Regenerating start script for server: ${serverName}`,
      );
      const clusters = await this.parent.listClusters();
      let serverConfig = null;
      let clusterName = null;
      for (const cluster of clusters) {
        if (cluster.config && cluster.config.servers) {
          const server = cluster.config.servers.find(
            (s) => s.name === serverName,
          );
          if (server) {
            serverConfig = server;
            clusterName = cluster.name;
            break;
          }
        }
      }
      if (!serverConfig) {
        const allServerConfigs =
          typeof getAllServerConfigs === "function"
            ? getAllServerConfigs()
            : [];
        let dbConfig = allServerConfigs.find((cfg) => {
          try {
            const parsed = JSON.parse(cfg.config_data);
            return parsed.name === serverName;
          } catch {
            return false;
          }
        });
        let foundClusterId = null;
        if (dbConfig) {
          try {
            const parsed = JSON.parse(dbConfig.config_data);
            foundClusterId =
              parsed.clusterId ||
              parsed.clusterName ||
              (parsed.config &&
                (parsed.config.clusterId || parsed.config.clusterName));
            serverConfig = parsed;
            clusterName = foundClusterId || null;
          } catch {}
        }
      }
      if (!serverConfig) {
        const { parseStartBat } =
          await import("../../utils/parse-start-bat.js");
        if (this.parent.clustersPath && existsSync(this.parent.clustersPath)) {
          const clusterDirs = await fs.readdir(this.parent.clustersPath);
          for (const cName of clusterDirs) {
            const clusterPath = path.join(this.parent.clustersPath, cName);
            if (
              !existsSync(clusterPath) ||
              !(await fs.stat(clusterPath)).isDirectory()
            )
              continue;
            const serverDirs = await fs.readdir(clusterPath);
            for (const sDir of serverDirs) {
              const serverPath = path.join(clusterPath, sDir);
              if (
                !existsSync(serverPath) ||
                !(await fs.stat(serverPath)).isDirectory()
              )
                continue;
              const startBatPath = path.join(serverPath, "start.bat");
              if (existsSync(startBatPath)) {
                try {
                  const parsed = await parseStartBat(startBatPath);
                  if (parsed.name === serverName) {
                    logger.warn(
                      `[regenerateServerStartScript] Fallback: found server on disk not in DB or cluster config: ${parsed.name} (cluster: ${cName})`,
                    );
                    serverConfig = parsed;
                    clusterName = cName;
                    break;
                  }
                } catch (e) {
                  logger.warn(
                    `[regenerateServerStartScript] Failed to parse start.bat for fallback server in cluster ${cName}: ${e.message}`,
                  );
                }
              }
            }
            if (serverConfig) break;
          }
        }
        if (!serverConfig && this.parent.serversPath && existsSync(this.parent.serversPath)) {
          const serverDirs = await fs.readdir(this.parent.serversPath);
          for (const sDir of serverDirs) {
            const serverPath = path.join(this.parent.serversPath, sDir);
            if (
              !existsSync(serverPath) ||
              !(await fs.stat(serverPath)).isDirectory()
            )
              continue;
            const startBatPath = path.join(serverPath, "start.bat");
            if (existsSync(startBatPath)) {
              try {
                const parsed = await parseStartBat(startBatPath);
                if (parsed.name === serverName) {
                  logger.warn(
                    `[regenerateServerStartScript] Fallback: found standalone server on disk not in DB or cluster config: ${parsed.name}`,
                  );
                  serverConfig = parsed;
                  clusterName = null;
                  break;
                }
              } catch (e) {
                logger.warn(
                  `[regenerateServerStartScript] Failed to parse start.bat for fallback standalone server: ${e.message}`,
                );
              }
            }
          }
        }
      }
      if (!serverConfig) {
        logger.warn(
          `[regenerateServerStartScript] Server config not found for: ${serverName}`,
        );
        throw new Error(
          `Server "${serverName}" not found in any cluster, DB, or on disk.`,
        );
      }
      logger.info(
        `[regenerateServerStartScript] Found server in cluster: ${clusterName}`,
      );
      logger.info(
        `[regenerateServerStartScript] Server config: ${JSON.stringify(serverConfig, null, 2)}`,
      );
      const serverPath = clusterName
        ? path.join(this.parent.clustersPath, clusterName, serverName)
        : path.join(this.parent.serversPath, serverName);
      if (clusterName) {
        await this.parent.createStartScriptInCluster(
          clusterName,
          serverPath,
          serverConfig,
        );
      } else {
        await this.parent.createStartScript(serverPath, serverConfig);
      }
      logger.info(
        `[regenerateServerStartScript] Regenerating start script at path: ${serverPath}`,
      );
      logger.info(
        `[regenerateServerStartScript] Start script regenerated for server: ${serverName}`,
      );
      return {
        success: true,
        message: `Start script regenerated for ${serverName}`,
      };
    } catch (error) {
      logger.error(
        `[regenerateServerStartScript] Failed to regenerate start script for ${serverName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Regenerate start scripts for all servers in all clusters
   */
  async regenerateAllClusterStartScripts() {
    try {
      const clusters = await this.parent.listClusters();
      const results = [];

      for (const cluster of clusters) {
        if (cluster.config && cluster.config.servers) {
          for (const server of cluster.config.servers) {
            try {
              await this.parent.regenerateServerStartScript(server.name);
              results.push({
                serverName: server.name,
                clusterName: cluster.name,
                success: true,
                message: `Start script regenerated for ${server.name}`,
              });
            } catch (error) {
              logger.error(
                `Failed to regenerate start script for ${server.name}:`,
                error,
              );
              results.push({
                serverName: server.name,
                clusterName: cluster.name,
                success: false,
                message: error.message,
              });
            }
          }
        }
      }

      return {
        success: true,
        results,
      };
    } catch (error) {
      logger.error("Failed to regenerate all cluster start scripts:", error);
      throw error;
    }
  }
}
