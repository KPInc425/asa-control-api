import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { requirePermission } from "../../middleware/auth.js";
import logger from "../../utils/logger.js";
import config from "../../config/index.js";
import { ServerProvisioner } from "../../services/server-provisioner.js";

export default async function configRoutes(fastify) {
  const provisioner = new ServerProvisioner();

  // Get update status for all servers
  fastify.get(
    "/api/provisioning/update-status-all",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        const clusters = await provisioner.listClusters();
        const allServers = [];

        for (const cluster of clusters) {
          if (cluster.config && cluster.config.servers) {
            for (const server of cluster.config.servers) {
              try {
                const updateStatus = await provisioner.checkServerUpdateStatus(
                  server.name,
                );
                const updateConfig = await provisioner.getServerUpdateConfig(
                  server.name,
                );

                allServers.push({
                  serverName: server.name,
                  clusterName: cluster.name,
                  status: updateStatus,
                  config: updateConfig,
                });
              } catch (error) {
                logger.warn(
                  `Failed to get update status for server ${server.name}:`,
                  error,
                );
                allServers.push({
                  serverName: server.name,
                  clusterName: cluster.name,
                  status: {
                    needsUpdate: false,
                    reason: "Error checking update status",
                    error: error.message,
                  },
                  config: null,
                });
              }
            }
          }
        }

        return {
          success: true,
          data: allServers,
        };
      } catch (error) {
        logger.error("Failed to get update status for all servers:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to get update status for all servers",
        });
      }
    },
  );

  // Get start script for a server
  fastify.get(
    "/api/provisioning/start-script/:serverName",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        logger.info(
          `[start-script endpoint] Fetching start script for server: ${serverName}`,
        );
        // Find the server in clusters
        const clusters = await provisioner.listClusters();
        let serverConfig = null;
        let clusterName = null;
        let serverPath = null;
        for (const cluster of clusters) {
          if (cluster.config && cluster.config.servers) {
            const server = cluster.config.servers.find(
              (s) => s.name === serverName,
            );
            if (server) {
              serverConfig = server;
              clusterName = cluster.name;
              serverPath = path.join(
                provisioner.clustersPath,
                clusterName,
                serverName,
              );
              break;
            }
          }
        }
        if (!serverConfig) {
          // Try standalone servers
          serverPath = path.join(provisioner.serversPath, serverName);
        }
        const startScriptPath = path.join(serverPath, "start.bat");
        logger.info(
          `[start-script endpoint] Resolved start.bat path: ${startScriptPath}`,
        );
        try {
          const startScript = await fs.readFile(startScriptPath, "utf8");
          logger.info(
            `[start-script endpoint] Read start.bat, content length: ${startScript.length}`,
          );
          return {
            success: true,
            data: {
              serverName,
              clusterName,
              scriptPath: startScriptPath,
              content: startScript,
            },
          };
        } catch (error) {
          logger.error(
            `[start-script endpoint] Failed to read start.bat at ${startScriptPath}:`,
            error,
          );
          if (error.code === "ENOENT") {
            return reply.status(404).send({
              success: false,
              message: `Start script not found for server "${serverName}" at ${startScriptPath}`,
            });
          }
          throw error;
        }
      } catch (error) {
        logger.error(
          `[start-script endpoint] Failed to get start script for ${request.params.serverName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to get start script",
        });
      }
    },
  );

  // Regenerate start scripts for all servers
  fastify.post(
    "/api/provisioning/regenerate-start-scripts",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        // Robust path resolution for clustersPath
        const clustersPath =
          process.env.NATIVE_CLUSTERS_PATH ||
          (config.server &&
            config.server.native &&
            config.server.native.clustersPath) ||
          (config.server &&
          config.server.native &&
          config.server.native.basePath
            ? path.join(config.server.native.basePath, "clusters")
            : null);
        if (!clustersPath) {
          logger.error("Missing clustersPath in configuration.");
          return reply.status(500).send({
            success: false,
            message: "Server configuration error: clustersPath is not set.",
          });
        }
        const clusters = await provisioner.listClusters();
        const results = [];

        for (const cluster of clusters) {
          if (cluster.config && cluster.config.servers) {
            for (const server of cluster.config.servers) {
              try {
                await provisioner.regenerateServerStartScript(server.name);
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
                  message: `Failed to regenerate start script: ${error.message}`,
                });
              }
            }
          }
        }

        return {
          success: true,
          message: "Start script regeneration completed",
          data: results,
        };
      } catch (error) {
        logger.error("Failed to regenerate start scripts:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to regenerate start scripts",
        });
      }
    },
  );

  // Regenerate INI configs from global settings for all servers (one-time fix)
  fastify.post(
    "/api/provisioning/regenerate-global-configs",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        const clustersPath =
          process.env.NATIVE_CLUSTERS_PATH ||
          (config.server &&
            config.server.native &&
            config.server.native.clustersPath) ||
          (config.server &&
          config.server.native &&
          config.server.native.basePath
            ? path.join(config.server.native.basePath, "clusters")
            : null);
        if (!clustersPath) {
          return reply.status(500).send({
            success: false,
            message: "clustersPath is not set",
          });
        }

        // Read global configs
        const globalConfigsPath = path.join(
          clustersPath,
          "..",
          "global-configs",
          "ark",
        );
        let globalGameIni = null;
        let globalGameUserSettings = null;
        try {
          globalGameIni = await fs.readFile(
            path.join(globalConfigsPath, "Game.ini"),
            "utf8",
          );
        } catch {
          // No global Game.ini
        }
        try {
          globalGameUserSettings = await fs.readFile(
            path.join(globalConfigsPath, "GameUserSettings.ini"),
            "utf8",
          );
        } catch {
          // No global GameUserSettings.ini
        }

        // Read exclusions
        const exclusionsPath = path.join(
          clustersPath,
          "..",
          "config-exclusions.json",
        );
        let excludedServers = [];
        try {
          excludedServers = JSON.parse(
            await fs.readFile(exclusionsPath, "utf8"),
          ).excludedServers || [];
        } catch {
          // No exclusions file
        }

        const results = [];
        const clusters = await fs.readdir(clustersPath);

        for (const clusterName of clusters) {
          const clusterPath = path.join(clustersPath, clusterName);
          const stat = await fs.stat(clusterPath).catch(() => null);
          if (!stat || !stat.isDirectory()) continue;

          const serverDirs = await fs.readdir(clusterPath);
          for (const serverName of serverDirs) {
            const serverPath = path.join(clusterPath, serverName);
            const sStat = await fs.stat(serverPath).catch(() => null);
            if (!sStat || !sStat.isDirectory()) continue;

            if (excludedServers.includes(serverName)) {
              results.push({
                serverName,
                clusterName,
                skipped: true,
                message: "Excluded from global configs",
              });
              continue;
            }

            const configDir = path.join(
              serverPath,
              "ShooterGame",
              "Saved",
              "Config",
              "WindowsServer",
            );
            if (!existsSync(configDir)) {
              results.push({
                serverName,
                clusterName,
                skipped: true,
                message: "Config directory not found",
              });
              continue;
            }

            try {
              let wroteAny = false;
              if (globalGameIni) {
                await fs.writeFile(
                  path.join(configDir, "Game.ini"),
                  globalGameIni,
                );
                wroteAny = true;
              }
              if (globalGameUserSettings) {
                await fs.writeFile(
                  path.join(configDir, "GameUserSettings.ini"),
                  globalGameUserSettings,
                );
                wroteAny = true;
              }
              results.push({
                serverName,
                clusterName,
                success: true,
                message: wroteAny
                  ? "Global configs applied"
                  : "No global configs found to apply",
              });
            } catch (error) {
              logger.error(
                `Failed to write configs for ${serverName}:`,
                error,
              );
              results.push({
                serverName,
                clusterName,
                success: false,
                message: error.message,
              });
            }
          }
        }

        return {
          success: true,
          message: "Global config regeneration completed",
          data: results,
        };
      } catch (error) {
        logger.error("Failed to regenerate global configs:", error);
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );

  // Update all servers with configuration
  fastify.post(
    "/api/provisioning/update-all-servers-with-config",
    {
      preHandler: requirePermission("write"),
      schema: {
        body: {
          type: "object",
          properties: {
            force: { type: "boolean" },
            updateConfig: { type: "boolean" },
            skipDisabled: { type: "boolean" },
            background: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const {
          force = false,
          updateConfig = true,
          skipDisabled = true,
          background = false,
        } = request.body;

        const clusters = await provisioner.listClusters();
        const results = [];

        for (const cluster of clusters) {
          if (cluster.config && cluster.config.servers) {
            for (const server of cluster.config.servers) {
              try {
                // Check if updates are enabled for this server
                if (skipDisabled) {
                  const updateConfig = await provisioner.getServerUpdateConfig(
                    server.name,
                  );
                  if (!updateConfig.updateEnabled) {
                    results.push({
                      serverName: server.name,
                      success: false,
                      reason: "Updates disabled",
                    });
                    continue;
                  }
                }

                if (background) {
                  // Start background update
                  provisioner
                    .updateServerBinaries(server.name, force)
                    .catch((error) => {
                      logger.error(
                        `Background update failed for server ${server.name}:`,
                        error,
                      );
                    });
                  results.push({
                    serverName: server.name,
                    success: true,
                    reason: "Background update started",
                  });
                } else {
                  // Perform immediate update
                  await provisioner.updateServerBinaries(server.name, force);
                  results.push({
                    serverName: server.name,
                    success: true,
                    reason: "Update completed",
                  });
                }
              } catch (error) {
                results.push({
                  serverName: server.name,
                  success: false,
                  reason: error.message,
                });
              }
            }
          }
        }

        return {
          success: true,
          message: `Update process completed for ${results.length} servers`,
          data: results,
        };
      } catch (error) {
        logger.error("Failed to update all servers:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to update all servers",
        });
      }
    },
  );
}
