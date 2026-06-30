import path from "path";
import fs from "fs/promises";
import { requirePermission } from "../../../middleware/auth.js";
import logger from "../../../utils/logger.js";
import { ServerProvisioner } from "../../../services/server-provisioner.js";
import { createServerManager } from "../../../services/server-manager.js";
import {
  createJob,
  updateJob,
  addJobProgress,
} from "../../../services/job-manager.js";

export default async function clusterCrudRoutes(fastify) {
  const provisioner = new ServerProvisioner();

  // Create cluster (direct)
  fastify.post(
    "/api/provisioning/create-cluster",
    {
      preHandler: requirePermission("write"),
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            serverCount: { type: "number" },
            basePort: { type: "number" },
            maps: { type: "array", items: { type: "string" } },
            maxPlayers: { type: "number" },
            adminPassword: { type: "string" },
            serverPassword: { type: "string" },
            clusterPassword: { type: "string" },
            harvestMultiplier: { type: "number" },
            xpMultiplier: { type: "number" },
            tamingMultiplier: { type: "number" },
            foreground: { type: "boolean" },
            disableBattleEye: { type: "boolean" },
            gameType: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const {
          name,
          description = "",
          serverCount = 1,
          basePort = 7777,
          maps = [],
          maxPlayers = 70,
          adminPassword = "admin123",
          serverPassword = "",
          clusterPassword = "",
          harvestMultiplier = 3.0,
          xpMultiplier = 3.0,
          tamingMultiplier = 5.0,
          foreground = false,
          disableBattleEye = false,
          gameType = "ark",
        } = request.body;

        if (!name) {
          return reply.status(400).send({
            success: false,
            message: "Cluster name is required",
          });
        }
        if (serverCount < 1 || serverCount > 10) {
          return reply.status(400).send({
            success: false,
            message: "Server count must be between 1 and 10",
          });
        }
        const clusterConfig = {
          name,
          description,
          serverCount,
          basePort,
          maps: maps.length > 0 ? maps : Array(serverCount).fill("TheIsland"),
          maxPlayers,
          adminPassword,
          serverPassword,
          clusterPassword,
          harvestMultiplier,
          xpMultiplier,
          tamingMultiplier,
          disableBattleEye,
          gameType,
        };
        // Check if SteamCMD is installed before creating cluster
        const steamCmdStatus = await provisioner.checkSteamCmdAvailability();
        if (!steamCmdStatus.success) {
          return reply.status(400).send({
            success: false,
            message:
              "SteamCMD is not installed. Please initialize the system before creating a cluster.",
            details: steamCmdStatus.message,
          });
        }
        const result = await provisioner.createCluster(
          clusterConfig,
          foreground,
        );
        return {
          success: true,
          message: `Cluster ${name} created successfully with ${serverCount} servers`,
          data: result,
        };
      } catch (error) {
        logger.error("Failed to create cluster:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to create cluster",
        });
      }
    },
  );

  // Cluster creation with job/progress system
  fastify.post(
    "/api/provisioning/clusters",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      const io = fastify.io;
      const clusterConfig = request.body;
      logger.info(
        "[ROUTE] Received cluster creation request:",
        JSON.stringify(clusterConfig, null, 2),
      );
      logger.info("Creating cluster with config:", {
        name: clusterConfig.name,
        serverCount: clusterConfig.serverCount,
        basePort: clusterConfig.basePort,
      });
      const job = createJob("create-cluster", {
        clusterName: clusterConfig.name,
      });
      logger.info(`Created job ${job.id} for cluster creation`);

      // Check if SteamCMD is installed before starting cluster creation job
      try {
        const steamCmdStatus = await provisioner.checkSteamCmdAvailability();
        if (!steamCmdStatus.success) {
          updateJob(job.id, {
            status: "failed",
            error:
              "SteamCMD is not installed. Please initialize the system before creating a cluster.",
            details: steamCmdStatus.message,
          });
          return reply.status(400).send({
            success: false,
            message:
              "SteamCMD is not installed. Please initialize the system before creating a cluster.",
            details: steamCmdStatus.message,
            jobId: job.id,
          });
        }
      } catch (error) {
        updateJob(job.id, {
          status: "failed",
          error: "Failed to check system requirements",
        });
        return reply.status(500).send({
          success: false,
          message: "Failed to check system requirements",
          jobId: job.id,
        });
      }

      // Respond immediately with job ID
      reply.send({ success: true, jobId: job.id });
      // Start cluster creation in background
      (async () => {
        try {
          addJobProgress(job.id, "Starting cluster creation...");
          if (io) {
            io.emit("job-progress", {
              jobId: job.id,
              status: "running",
              progress: 5,
              message: "Starting cluster creation...",
            });
          }
          // Progress callback with actual progress calculation
          let currentStep = 0;
          const totalSteps = 5; // validation, directory creation, server installation, config creation, finalization
          const progressCb = (msg) => {
            currentStep++;
            const progress = Math.min(
              Math.round((currentStep / totalSteps) * 100),
              95,
            ); // Cap at 95% until completion
            addJobProgress(job.id, msg);
            if (io) {
              io.emit("job-progress", {
                jobId: job.id,
                status: "running",
                progress: progress,
                message: msg,
              });
            }
          };
          provisioner.setProgressCallback(progressCb);
          logger.info(
            `Starting cluster creation for job ${job.id}: ${clusterConfig.name}`,
          );
          const result = await provisioner.createCluster(
            clusterConfig,
            clusterConfig.foreground || false,
          );
          updateJob(job.id, { status: "completed", result });
          if (io) {
            io.emit("job-progress", {
              jobId: job.id,
              status: "completed",
              progress: 100,
              message: "Cluster created successfully!",
              result,
            });
          }
          logger.info(
            `Cluster creation completed for job ${job.id}: ${clusterConfig.name}`,
          );
        } catch (err) {
          logger.error(`Cluster creation failed for job ${job.id}:`, err);
          updateJob(job.id, { status: "failed", error: err.message });
          if (io) {
            io.emit("job-progress", {
              jobId: job.id,
              status: "failed",
              progress: 0,
              message: `Cluster creation failed: ${err.message}`,
              error: err.message,
            });
          }
        }
      })();
    },
  );

  // Import cluster config from uploaded JSON
  fastify.post(
    "/api/provisioning/clusters/import",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        const data = await request.file();
        if (!data) {
          return reply.status(400).send({
            success: false,
            message: "No file uploaded",
          });
        }
        let configContent = "";
        for await (const chunk of data.file) {
          configContent += chunk.toString();
        }
        let clusterConfig;
        try {
          clusterConfig = JSON.parse(configContent);
        } catch (err) {
          return reply.status(400).send({
            success: false,
            message: "Invalid JSON in uploaded file",
          });
        }
        if (!clusterConfig.name) {
          return reply.status(400).send({
            success: false,
            message: "Cluster config must include a name",
          });
        }
        // Check if cluster already exists
        const clusterPath = path.join(
          provisioner.clustersPath,
          clusterConfig.name,
        );
        try {
          await fs.access(clusterPath);
          return reply.status(409).send({
            success: false,
            message: `Cluster with name '${clusterConfig.name}' already exists`,
          });
        } catch {
          // Not found, continue
        }
        // Provision the new cluster
        try {
          const result = await provisioner.createCluster(clusterConfig, false);
          return reply.send({
            success: true,
            message: `Cluster '${clusterConfig.name}' imported successfully`,
            data: result,
          });
        } catch (err) {
          return reply.status(500).send({
            success: false,
            message: `Failed to import cluster: ${err.message}`,
          });
        }
      } catch (error) {
        logger.error("Failed to import cluster config:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to import cluster config",
        });
      }
    },
  );

  // List clusters
  fastify.get(
    "/api/provisioning/clusters",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        const clusters = await provisioner.listClusters();
        const serverManager = createServerManager();

        // Add server status for each cluster
        const clustersWithStatus = await Promise.all(
          clusters.map(async (cluster) => {
            if (cluster.config && cluster.config.servers) {
              const serversWithStatus = await Promise.all(
                cluster.config.servers.map(async (server) => {
                  try {
                    // Always try to get real-time status
                    const isRunning = await serverManager.isRunning(
                      server.name,
                    );
                    return {
                      ...server,
                      status: isRunning ? "running" : "stopped",
                      lastStatusCheck: new Date().toISOString(),
                    };
                  } catch (error) {
                    logger.warn(
                      `Failed to get status for server ${server.name}:`,
                      error,
                    );
                    return {
                      ...server,
                      status: "unknown",
                      lastStatusCheck: new Date().toISOString(),
                      statusError: error.message,
                    };
                  }
                }),
              );

              return {
                ...cluster,
                config: {
                  ...cluster.config,
                  servers: serversWithStatus,
                },
              };
            }
            return cluster;
          }),
        );

        return {
          success: true,
          clusters: clustersWithStatus,
        };
      } catch (error) {
        logger.error("Failed to list clusters:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to list clusters",
        });
      }
    },
  );

  // Get cluster details
  fastify.get(
    "/api/provisioning/clusters/:clusterName",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        const { clusterName } = request.params;
        const clusters = await provisioner.listClusters();
        const cluster = clusters.find((c) => c.name === clusterName);
        if (!cluster) {
          return reply.status(404).send({
            success: false,
            message: `Cluster "${clusterName}" not found`,
          });
        }
        // Get server status for each server in the cluster
        const serverManager = createServerManager();
        const serversWithStatus = [];
        if (cluster.config && cluster.config.servers) {
          for (const server of cluster.config.servers) {
            try {
              const isRunning = await serverManager.isRunning(server.name);
              serversWithStatus.push({
                ...server,
                status: isRunning ? "running" : "stopped",
              });
            } catch (error) {
              logger.warn(
                `Failed to get status for server ${server.name}:`,
                error,
              );
              serversWithStatus.push({
                ...server,
                status: "unknown",
              });
            }
          }
        }
        return {
          success: true,
          cluster: {
            ...cluster,
            servers: serversWithStatus,
          },
        };
      } catch (error) {
        logger.error(
          `Failed to get cluster details for ${request.params.clusterName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to get cluster details",
        });
      }
    },
  );

  // Export cluster config as downloadable JSON
  fastify.get(
    "/api/provisioning/clusters/:clusterName/export",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        const { clusterName } = request.params;
        const clusterPath = path.join(provisioner.clustersPath, clusterName);
        const configPath = path.join(clusterPath, "cluster.json");
        let configContent;
        try {
          configContent = await fs.readFile(configPath, "utf8");
        } catch (err) {
          logger.warn(`Cluster config not found for export: ${clusterName}`);
          return reply.status(404).send({
            success: false,
            message: `Cluster config not found for ${clusterName}`,
          });
        }
        reply.header("Content-Type", "application/json");
        reply.header(
          "Content-Disposition",
          `attachment; filename="${clusterName}-cluster.json"`,
        );
        return reply.send(configContent);
      } catch (error) {
        logger.error(
          `Failed to export cluster config for ${request.params.clusterName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to export cluster config",
        });
      }
    },
  );

  // Delete cluster
  fastify.delete(
    "/api/provisioning/clusters/:clusterName",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        const { clusterName } = request.params;
        const { backupSaved = true, deleteFiles = true } = request.query;

        logger.info(`Deleting cluster: ${clusterName}`, {
          backupSaved,
          deleteFiles,
        });

        const result = await provisioner.deleteCluster(clusterName, {
          backupSaved: backupSaved === "true",
          deleteFiles: deleteFiles === "true",
        });

        return {
          success: true,
          message: `Cluster ${clusterName} deleted successfully`,
          data: result,
        };
      } catch (error) {
        logger.error(
          `Failed to delete cluster ${request.params.clusterName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );
}
