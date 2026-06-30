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
import archiver from "archiver";
import unzipper from "unzipper";
import os from "os";

export default async function serverRoutes(fastify) {
  const provisioner = new ServerProvisioner();

  // Update server settings
  fastify.post(
    "/api/provisioning/servers/:serverName/update-settings",
    {
      preHandler: requirePermission("write"),
      schema: {
        params: {
          type: "object",
          required: ["serverName"],
          properties: {
            serverName: { type: "string" },
          },
        },
        body: {
          type: "object",
          required: ["settings"],
          properties: {
            settings: {
              type: "object",
              properties: {
                name: { type: "string" },
                map: { type: "string" },
                gamePort: { type: "number" },
                queryPort: { type: "number" },
                rconPort: { type: "number" },
                maxPlayers: { type: "number" },
                adminPassword: { type: "string" },
                serverPassword: { type: "string" },
                clusterId: { type: "string" },
                clusterPassword: { type: "string" },
                sessionName: { type: "string" },
                disableBattleEye: { type: "boolean" },
                customDynamicConfigUrl: { type: "string" },
                gameType: { type: "string" },
              },
            },
            regenerateConfigs: { type: "boolean" },
            regenerateScripts: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        const {
          settings,
          regenerateConfigs = true,
          regenerateScripts = true,
        } = request.body;

        // Default gameType in settings if not provided
        if (settings.gameType === undefined) {
          settings.gameType = "ark";
        }

        logger.info(`Updating server settings for ${serverName}`, {
          disableBattleEye: settings.disableBattleEye,
          regenerateConfigs,
          regenerateScripts,
        });

        const result = await provisioner.updateServerSettings(
          serverName,
          settings,
          {
            regenerateConfigs,
            regenerateScripts,
          },
        );

        return {
          success: true,
          message: result.message,
          data: result,
        };
      } catch (error) {
        logger.error(
          `Failed to update server settings for ${request.params.serverName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );

  // Create individual server (async with job progress)
  fastify.post(
    "/api/provisioning/create-server",
    {
      preHandler: requirePermission("write"),
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            map: { type: "string" },
            gamePort: { type: "number" },
            queryPort: { type: "number" },
            rconPort: { type: "number" },
            maxPlayers: { type: "number" },
            adminPassword: { type: "string" },
            serverPassword: { type: "string" },
            harvestMultiplier: { type: "number" },
            xpMultiplier: { type: "number" },
            tamingMultiplier: { type: "number" },
            disableBattleEye: { type: "boolean" },
            customDynamicConfigUrl: { type: "string" },
            gameType: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const io = fastify.io;
      const {
        name,
        map = "TheIsland",
        gamePort = 7777,
        queryPort = 27015,
        rconPort = 32330,
        maxPlayers = 70,
        adminPassword = "admin123",
        serverPassword = "",
        harvestMultiplier = 3.0,
        xpMultiplier = 3.0,
        tamingMultiplier = 5.0,
        disableBattleEye = false,
        customDynamicConfigUrl = "",
        gameType = "ark",
      } = request.body;

      if (!name) {
        return reply.status(400).send({
          success: false,
          message: "Server name is required",
        });
      }

      const serverConfig = {
        name,
        map,
        gamePort,
        queryPort,
        rconPort,
        maxPlayers,
        adminPassword,
        serverPassword,
        harvestMultiplier,
        xpMultiplier,
        tamingMultiplier,
        disableBattleEye,
        customDynamicConfigUrl,
        gameType,
      };

      const job = createJob("create-server", { serverName: name });
      logger.info(`Created job ${job.id} for creating standalone server ${name}`);

      // Respond immediately with job ID
      reply.send({ success: true, jobId: job.id, message: `Server "${name}" creation started` });

      // Do the heavy work in the background
      (async () => {
        try {
          addJobProgress(job.id, `Starting server creation for ${name}...`);
          if (io) {
            io.emit("job-progress", {
              jobId: job.id,
              status: "running",
              progress: 5,
              message: `Creating server "${name}"...`,
              step: "initializing",
            });
          }

          // Set up progress callback on the provisioner
          let stepCount = 0;
          const totalSteps = 5;
          provisioner.setProgressCallback((msg) => {
            stepCount++;
            const progress = Math.min(
              Math.round((stepCount / totalSteps) * 100),
              95,
            );
            addJobProgress(job.id, msg);
            if (io) {
              io.emit("job-progress", {
                jobId: job.id,
                status: "running",
                progress,
                message: typeof msg === "string" ? msg : msg.message || JSON.stringify(msg),
                step: "creating",
              });
            }
          });

          await provisioner.createServer(serverConfig);

          updateJob(job.id, { status: "completed" });
          if (io) {
            io.emit("job-progress", {
              jobId: job.id,
              status: "completed",
              progress: 100,
              message: `Server "${name}" created successfully!`,
              step: "done",
            });
          }
          logger.info(`Job ${job.id} completed: standalone server ${name} created`);
        } catch (err) {
          logger.error(`Job ${job.id} failed: ${err.message}`);
          updateJob(job.id, { status: "failed", error: err.message });
          if (io) {
            io.emit("job-progress", {
              jobId: job.id,
              status: "failed",
              progress: 0,
              message: `Failed: ${err.message}`,
              error: err.message,
              step: "error",
            });
          }
        }
      })();
    },
  );

  // Add a server to an existing cluster (async with job progress)
  fastify.post(
    "/api/provisioning/clusters/:clusterName/servers",
    {
      preHandler: requirePermission("write"),
      schema: {
        params: {
          type: "object",
          required: ["clusterName"],
          properties: {
            clusterName: { type: "string" },
          },
        },
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            map: { type: "string" },
            gamePort: { type: "number" },
            queryPort: { type: "number" },
            rconPort: { type: "number" },
            maxPlayers: { type: "number" },
            adminPassword: { type: "string" },
            serverPassword: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { clusterName } = request.params;
        const serverConfig = request.body;

        if (!clusterName) {
          return reply.status(400).send({
            success: false,
            message: "Cluster name is required",
          });
        }

        const io = fastify.io;
        const job = createJob("add-server-to-cluster", {
          clusterName,
          serverName: serverConfig.name,
        });
        logger.info(
          `Created job ${job.id} for adding server to cluster ${clusterName}`,
        );

        // Respond immediately with job ID
        reply.send({ success: true, jobId: job.id });

        // Do the heavy work in the background
        (async () => {
          try {
            addJobProgress(
              job.id,
              `Starting server creation for ${serverConfig.name} in cluster ${clusterName}...`,
            );
            if (io) {
              io.emit("job-progress", {
                jobId: job.id,
                status: "running",
                progress: 5,
                message: `Creating server ${serverConfig.name}...`,
              });
            }

            // Set up progress callback on the cluster manager
            let stepCount = 0;
            const totalSteps = 5;
            provisioner.clusterManager.setProgressCallback((msg) => {
              stepCount++;
              const progress = Math.min(
                Math.round((stepCount / totalSteps) * 100),
                95,
              );
              addJobProgress(job.id, msg);
              if (io) {
                io.emit("job-progress", {
                  jobId: job.id,
                  status: "running",
                  progress,
                  message:
                    typeof msg === "string"
                      ? msg
                      : msg.message || JSON.stringify(msg),
                });
              }
            });

            await provisioner.clusterManager.addServerToCluster(
              clusterName,
              serverConfig,
            );

            updateJob(job.id, { status: "completed" });
            if (io) {
              io.emit("job-progress", {
                jobId: job.id,
                status: "completed",
                progress: 100,
                message: `Server "${serverConfig.name}" added to cluster "${clusterName}" successfully!`,
              });
            }
            logger.info(
              `Job ${job.id} completed: server ${serverConfig.name} added to cluster ${clusterName}`,
            );
          } catch (err) {
            logger.error(`Job ${job.id} failed: ${err.message}`);
            updateJob(job.id, { status: "failed", error: err.message });
            if (io) {
              io.emit("job-progress", {
                jobId: job.id,
                status: "failed",
                progress: 0,
                message: `Failed: ${err.message}`,
                error: err.message,
              });
            }
          }
        })();
      } catch (error) {
        logger.error(
          `Failed to add server to cluster ${request.params.clusterName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );

  // Delete individual server
  fastify.delete(
    "/api/provisioning/servers/:serverName",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        logger.info(`Deleting standalone server: ${serverName}`);

        const result = await provisioner.deleteServer(serverName);
        return {
          success: true,
          message: `Server "${serverName}" deleted successfully`,
          data: result,
        };
      } catch (error) {
        logger.error(
          `Failed to delete server ${request.params.serverName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );

  // Backup individual server
  fastify.post(
    "/api/provisioning/servers/:serverName/backup",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        const {
          destination,
          includeConfigs = true,
          includeScripts = false,
        } = request.body;

        logger.info(`Backing up server: ${serverName}`, {
          destination,
          includeConfigs,
          includeScripts,
        });

        const result = await provisioner.backupServer(serverName, {
          destination,
          includeConfigs,
          includeScripts,
        });

        return {
          success: true,
          message: `Server ${serverName} backed up successfully`,
          data: result,
        };
      } catch (error) {
        logger.error(
          `Failed to backup server ${request.params.serverName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );

  // Restore individual server
  fastify.post(
    "/api/provisioning/servers/:serverName/restore",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        const { source, targetClusterName, overwrite = false } = request.body;

        logger.info(`Restoring server: ${serverName}`, {
          source,
          targetClusterName,
          overwrite,
        });

        const result = await provisioner.restoreServer(serverName, source, {
          targetClusterName,
          overwrite,
        });

        return {
          success: true,
          message: `Server ${serverName} restored successfully`,
          data: result,
        };
      } catch (error) {
        logger.error(
          `Failed to restore server ${request.params.serverName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );

  // Restore server from backup ZIP
  fastify.post(
    "/api/provisioning/servers/:serverName/restore-backup",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        const data = await request.parts();
        let filePart = null;
        for await (const part of data) {
          if (part.type === "file" && part.fieldname === "file")
            filePart = part;
        }
        if (!filePart) {
          return reply
            .status(400)
            .send({ success: false, message: "Missing file" });
        }
        // Save uploaded ZIP to temp file
        const tmpDir = await fs.mkdtemp(
          path.join(os.tmpdir(), "server-restore-"),
        );
        const zipPath = path.join(tmpDir, "backup.zip");
        const out = await fs.open(zipPath, "w");
        for await (const chunk of filePart.file) {
          await out.write(chunk);
        }
        await out.close();
        // Extract ZIP
        await fs.mkdir(path.join(tmpDir, "extracted"));
        await new Promise((resolve, reject) => {
          const stream = fs
            .createReadStream(zipPath)
            .pipe(unzipper.Extract({ path: path.join(tmpDir, "extracted") }));
          stream.on("close", resolve);
          stream.on("error", reject);
        });
        // Find the server in clusters
        const clusters = await provisioner.listClusters();
        let targetServerPath = null;
        let targetClusterName = null;
        for (const cluster of clusters) {
          if (cluster.config && cluster.config.servers) {
            const server = cluster.config.servers.find(
              (s) => s.name === serverName,
            );
            if (server) {
              targetServerPath = path.join(
                provisioner.clustersPath,
                cluster.name,
                serverName,
              );
              targetClusterName = cluster.name;
              break;
            }
          }
        }
        if (!targetServerPath) {
          await fs.rm(tmpDir, { recursive: true, force: true });
          return reply
            .status(404)
            .send({ success: false, message: "Target server not found" });
        }
        // Overwrite saves/configs from backup
        const extractedPath = path.join(tmpDir, "extracted");
        const srcSaved = path.join(extractedPath, "ShooterGame", "Saved");
        const destSaved = path.join(targetServerPath, "ShooterGame", "Saved");
        const srcConfig = path.join(extractedPath, "ShooterGame", "Config");
        const destConfig = path.join(targetServerPath, "ShooterGame", "Config");
        // Overwrite Saved folder
        try {
          await fs.rm(destSaved, { recursive: true, force: true });
        } catch {}
        try {
          await fs.cp(srcSaved, destSaved, { recursive: true });
        } catch {}
        // Overwrite configs
        try {
          await fs.cp(srcConfig, destConfig, { recursive: true });
        } catch {}
        await fs.rm(tmpDir, { recursive: true, force: true });
        return reply.send({
          success: true,
          message: "Server saves/configs restored successfully",
        });
      } catch (error) {
        logger.error("Failed to restore server from backup:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to restore server from backup",
        });
      }
    },
  );

  // Download server backup as ZIP
  fastify.get(
    "/api/provisioning/servers/:serverName/download-backup",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        const { backup } = request.query;
        if (!backup) {
          return reply
            .status(400)
            .send({ success: false, message: "Missing backup parameter" });
        }
        // Server backups are stored in ../backups/servers/<backup>
        const backupsRoot = path.join(
          provisioner.clustersPath,
          "..",
          "backups",
          "servers",
        );
        const backupPath = path.join(backupsRoot, backup);
        // Check if backup folder exists
        try {
          await fs.access(backupPath);
        } catch {
          return reply
            .status(404)
            .send({ success: false, message: "Backup not found" });
        }
        // Set headers for ZIP download
        reply.header("Content-Type", "application/zip");
        reply.header(
          "Content-Disposition",
          `attachment; filename="${backup}.zip"`,
        );
        // Stream ZIP
        const archive = archiver("zip", { zlib: { level: 9 } });
        archive.directory(backupPath, false);
        archive.finalize();
        return reply.send(archive);
      } catch (error) {
        logger.error("Failed to download server backup:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to download server backup",
        });
      }
    },
  );

  // Update server configuration endpoint
  fastify.put(
    "/api/provisioning/servers/:serverName/update-config",
    {
      preHandler: requirePermission("write"),
      schema: {
        params: {
          type: "object",
          required: ["serverName"],
          properties: {
            serverName: { type: "string" },
          },
        },
        body: {
          type: "object",
          properties: {
            updateOnStart: { type: "boolean" },
            updateEnabled: { type: "boolean" },
            autoUpdate: { type: "boolean" },
            updateInterval: { type: "number" },
            updateSchedule: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        const config = request.body;

        await provisioner.updateServerUpdateConfig(serverName, config);

        return {
          success: true,
          message: "Update configuration saved successfully",
        };
      } catch (error) {
        logger.error(
          `Failed to update configuration for server ${request.params.serverName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to update configuration",
        });
      }
    },
  );

  // Update server with config
  fastify.post(
    "/api/provisioning/servers/:serverName/update-with-config",
    {
      preHandler: requirePermission("write"),
      schema: {
        params: {
          type: "object",
          required: ["serverName"],
          properties: {
            serverName: { type: "string" },
          },
        },
        body: {
          type: "object",
          properties: {
            config: {
              type: "object",
              properties: {
                name: { type: "string" },
                map: { type: "string" },
                gamePort: { type: "number" },
                queryPort: { type: "number" },
                rconPort: { type: "number" },
                maxPlayers: { type: "number" },
                adminPassword: { type: "string" },
                serverPassword: { type: "string" },
                clusterId: { type: "string" },
                clusterPassword: { type: "string" },
                sessionName: { type: "string" },
                disableBattleEye: { type: "boolean" },
                customDynamicConfigUrl: { type: "string" },
                gameType: { type: "string" },
              },
            },
            regenerateConfigs: { type: "boolean" },
            regenerateScripts: { type: "boolean" },
            force: { type: "boolean" },
            updateConfig: { type: "boolean" },
            background: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        const {
          config,
          force,
          updateConfig: shouldUpdateConfig,
          background,
          regenerateConfigs = true,
          regenerateScripts = true,
        } = request.body;

        logger.info(`Update for server ${serverName}`, {
          hasConfig: !!config,
          force,
          updateConfig: shouldUpdateConfig,
          background,
          regenerateConfigs,
          regenerateScripts,
        });

        // If config is provided, update server settings/config first
        if (config) {
          // Default gameType in config if not provided
          if (config.gameType === undefined) {
            config.gameType = "ark";
          }

          logger.info(`Updating server config for ${serverName}`, {
            disableBattleEye: config.disableBattleEye,
            regenerateConfigs,
            regenerateScripts,
          });

          const configResult = await provisioner.updateServerSettings(
            serverName,
            config,
            {
              regenerateConfigs,
              regenerateScripts,
            },
          );

          logger.info(
            `Server config updated for ${serverName}: ${configResult.message}`,
          );
        }

        // Then trigger binary update via SteamCMD
        logger.info(`Triggering binary update for ${serverName}`);
        const updateResult = await provisioner.updateServerBinaries(
          serverName,
          force,
        );

        return {
          success: true,
          message: `Server ${serverName} updated successfully`,
          data: {
            ...updateResult,
            configUpdated: !!config,
            background: !!background,
          },
        };
      } catch (error) {
        logger.error(
          `Failed to update server ${request.params.serverName}:`,
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
