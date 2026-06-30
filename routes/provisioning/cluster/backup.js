import path from "path";
import fs from "fs/promises";
import { requirePermission } from "../../../middleware/auth.js";
import logger from "../../../utils/logger.js";
import { ServerProvisioner } from "../../../services/server-provisioner.js";
import archiver from "archiver";
import unzipper from "unzipper";
import os from "os";

export default async function backupRoutes(fastify) {
  const provisioner = new ServerProvisioner();

  // Backup cluster saved data
  fastify.post(
    "/api/provisioning/clusters/:clusterName/backup",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        const { clusterName } = request.params;
        const {
          destination,
          saves = true,
          configs = true,
          logs = true,
          mods = true,
        } = request.body;

        logger.info(`Backing up cluster: ${clusterName}`, {
          destination,
          saves,
          configs,
          logs,
          mods,
        });

        const result = await provisioner.backupCluster(
          clusterName,
          destination,
          { saves, configs, logs, mods },
        );

        return {
          success: true,
          message: `Cluster ${clusterName} backed up successfully`,
          data: result,
        };
      } catch (error) {
        logger.error(
          `Failed to backup cluster ${request.params.clusterName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );

  // Restore cluster saved data
  fastify.post(
    "/api/provisioning/clusters/:clusterName/restore",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        const { clusterName } = request.params;
        const {
          source,
          saves = true,
          configs = true,
          logs = true,
          mods = true,
        } = request.body;

        logger.info(`Restoring cluster: ${clusterName}`, {
          source,
          saves,
          configs,
          logs,
          mods,
        });

        const result = await provisioner.restoreCluster(clusterName, source, {
          saves,
          configs,
          logs,
          mods,
        });

        return {
          success: true,
          message: `Cluster ${clusterName} restored successfully`,
          data: result,
        };
      } catch (error) {
        logger.error(
          `Failed to restore cluster ${request.params.clusterName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );

  // Restore cluster from backup ZIP
  fastify.post(
    "/api/provisioning/clusters/restore-backup",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        const data = await request.parts();
        let filePart = null;
        let targetClusterName = null;
        for await (const part of data) {
          if (part.type === "file" && part.fieldname === "file")
            filePart = part;
          if (part.type === "field" && part.fieldname === "targetClusterName")
            targetClusterName = part.value;
        }
        if (!filePart || !targetClusterName) {
          return reply.status(400).send({
            success: false,
            message: "Missing file or targetClusterName",
          });
        }
        // Save uploaded ZIP to temp file
        const tmpDir = await fs.mkdtemp(
          path.join(os.tmpdir(), "cluster-restore-"),
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
        // Read cluster-config.json from extracted
        const extractedPath = path.join(tmpDir, "extracted");
        const configPath = path.join(extractedPath, "cluster-config.json");
        let backupConfig;
        try {
          const configContent = await fs.readFile(configPath, "utf8");
          backupConfig = JSON.parse(configContent);
        } catch {
          await fs.rm(tmpDir, { recursive: true, force: true });
          return reply.status(400).send({
            success: false,
            message: "Invalid or missing cluster-config.json in backup",
          });
        }
        // Check if target cluster exists
        const targetClusterPath = path.join(
          provisioner.clustersPath,
          targetClusterName,
        );
        let targetExists = false;
        try {
          await fs.access(targetClusterPath);
          targetExists = true;
        } catch {
          targetExists = false;
        }
        if (targetExists) {
          // Validate cluster name and server names/count
          const targetConfigPath = path.join(targetClusterPath, "cluster.json");
          let targetConfig;
          try {
            const targetContent = await fs.readFile(targetConfigPath, "utf8");
            targetConfig = JSON.parse(targetContent);
          } catch {
            await fs.rm(tmpDir, { recursive: true, force: true });
            return reply.status(400).send({
              success: false,
              message: "Target cluster config not found or invalid",
            });
          }
          if (backupConfig.name !== targetConfig.name) {
            await fs.rm(tmpDir, { recursive: true, force: true });
            return reply.status(400).send({
              success: false,
              message: "Cluster name in backup does not match target",
            });
          }
          const backupServers = (backupConfig.servers || [])
            .map((s) => s.name)
            .sort();
          const targetServers = (targetConfig.servers || [])
            .map((s) => s.name)
            .sort();
          if (
            backupServers.length !== targetServers.length ||
            !backupServers.every((v, i) => v === targetServers[i])
          ) {
            await fs.rm(tmpDir, { recursive: true, force: true });
            return reply.status(400).send({
              success: false,
              message:
                "Server names/count in backup do not match target cluster",
            });
          }
          // Overwrite saves/configs for matching servers
          for (const serverName of backupServers) {
            const src = path.join(extractedPath, serverName);
            const dest = path.join(targetClusterPath, serverName);
            // Overwrite Saved folder
            const srcSaved = path.join(src, "ShooterGame", "Saved");
            const destSaved = path.join(dest, "ShooterGame", "Saved");
            try {
              await fs.rm(destSaved, { recursive: true, force: true });
            } catch {}
            try {
              await fs.cp(srcSaved, destSaved, { recursive: true });
            } catch {}
            // Optionally overwrite configs (Game.ini, etc.)
            const srcConfig = path.join(src, "ShooterGame", "Config");
            const destConfig = path.join(dest, "ShooterGame", "Config");
            try {
              await fs.cp(srcConfig, destConfig, { recursive: true });
            } catch {}
          }
          await fs.rm(tmpDir, { recursive: true, force: true });
          return reply.send({
            success: true,
            message: "Cluster saves/configs restored to existing cluster",
          });
        } else {
          // Create new cluster from backup
          try {
            await fs.cp(extractedPath, targetClusterPath, { recursive: true });
          } catch (err) {
            await fs.rm(tmpDir, { recursive: true, force: true });
            return reply.status(500).send({
              success: false,
              message: "Failed to create new cluster from backup",
            });
          }
          await fs.rm(tmpDir, { recursive: true, force: true });
          return reply.send({
            success: true,
            message: "Cluster restored from backup (new cluster created)",
          });
        }
      } catch (error) {
        logger.error("Failed to restore cluster from backup:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to restore cluster from backup",
        });
      }
    },
  );

  // List available server backups
  fastify.get(
    "/api/provisioning/server-backups",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        const result = await provisioner.listServerBackups();

        return {
          success: true,
          message: "Server backups retrieved successfully",
          data: result,
        };
      } catch (error) {
        logger.error("Failed to list server backups:", error);
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );

  // List available backups for a cluster
  fastify.get(
    "/api/provisioning/cluster-backups/:clusterName",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        const { clusterName } = request.params;
        const result = await provisioner.listClusterBackups(clusterName);
        return {
          success: true,
          message: "Cluster backups retrieved successfully",
          data: result,
        };
      } catch (error) {
        logger.error("Failed to list cluster backups:", error);
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );

  // Download cluster backup as ZIP
  fastify.get(
    "/api/provisioning/clusters/:clusterName/download-backup",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        const { clusterName } = request.params;
        const { backup } = request.query;
        if (!backup) {
          return reply
            .status(400)
            .send({ success: false, message: "Missing backup parameter" });
        }
        // Backups are stored in ../backups/<backup>
        const backupsRoot = path.join(
          provisioner.clustersPath,
          "..",
          "backups",
          "clusters",
        );
        const backupPath = path.join(backupsRoot, backup);
        // Add debug log for the exact path being checked
        logger.info(`[Download Backup] Checking path: ${backupPath}`);
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
        logger.error("Failed to download cluster backup:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to download cluster backup",
        });
      }
    },
  );
}
