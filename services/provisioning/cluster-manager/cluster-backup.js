import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../../utils/logger.js";

const inProgressBackups = new Set();

/**
 * Cluster backup and restore operations
 */
export class ClusterBackup {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Backup a cluster, keeping only the main save and N most recent backups per server
   * @param {string} clusterName
   * @param {string|null} customDestination
   * @param {object} options - { maxBackupsPerServer: number }
   */
  async backupCluster(clusterName, customDestination = null, options = {}) {
    const maxBackupsPerServer = options.maxBackupsPerServer ?? 2;
    if (inProgressBackups.has(clusterName)) {
      throw new Error(
        `Backup already in progress for cluster "${clusterName}"`,
      );
    }
    inProgressBackups.add(clusterName);
    const clusterPath = path.join(this.parent.clustersPath, clusterName);
    try {
      logger.info(`Creating backup for cluster: ${clusterName}`);
      if (!existsSync(clusterPath)) {
        throw new Error(`Cluster "${clusterName}" does not exist`);
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupName = `${clusterName}-${timestamp}`;
      const backupDestination =
        customDestination || path.join(this.parent.basePath, "backups", "clusters");
      await fs.mkdir(backupDestination, { recursive: true });
      const backupPath = path.join(backupDestination, backupName);
      await fs.mkdir(backupPath, { recursive: true });

      // Only backup ShooterGame/Saved/* for each server
      const serverDirs = await fs.readdir(clusterPath);
      for (const serverDir of serverDirs) {
        const serverPath = path.join(clusterPath, serverDir);
        const stat = await fs.stat(serverPath);
        if (!stat.isDirectory()) continue;
        const savedPath = path.join(serverPath, "ShooterGame", "Saved");
        if (existsSync(savedPath)) {
          const destSaved = path.join(
            backupPath,
            serverDir,
            "ShooterGame",
            "Saved",
          );
          await fs.mkdir(destSaved, { recursive: true });
          const entries = await fs.readdir(savedPath, { withFileTypes: true });
          const arkFiles = entries.filter(
            (e) => e.isFile() && e.name.endsWith(".ark"),
          );
          const arkFilesWithStats = await Promise.all(
            arkFiles.map(async (e) => {
              const filePath = path.join(savedPath, e.name);
              const stat = await fs.stat(filePath);
              return { name: e.name, mtime: stat.mtime, path: filePath };
            }),
          );
          arkFilesWithStats.sort((a, b) => b.mtime - a.mtime);
          const mainSave = arkFilesWithStats.find((f) =>
            /^[^.]+\.ark$/i.test(f.name),
          );
          const backupSaves = arkFilesWithStats
            .filter((f) => !/^[^.]+\.ark$/i.test(f.name))
            .slice(0, maxBackupsPerServer);
          const filesToCopy = [mainSave, ...backupSaves].filter(Boolean);
          for (const file of filesToCopy) {
            await fs.copyFile(file.path, path.join(destSaved, file.name));
          }
        }
      }

      const backupInfo = {
        clusterName: clusterName,
        backupName: backupName,
        created: new Date().toISOString(),
        originalPath: clusterPath,
        backupPath: backupPath,
        type: "cluster",
        note: `Only ShooterGame/Saved/* was backed up for each server. Main save + up to ${maxBackupsPerServer} backup saves per server.`,
        maxBackupsPerServer,
      };
      await fs.writeFile(
        path.join(backupPath, "backup-info.json"),
        JSON.stringify(backupInfo, null, 2),
      );
      logger.info(`Cluster backup created: ${backupPath}`);
      return {
        success: true,
        message: `Cluster "${clusterName}" backed up successfully`,
        backupPath: backupPath,
        backupName: backupName,
      };
    } catch (error) {
      logger.error(`Failed to backup cluster ${clusterName}:`, error);
      throw error;
    } finally {
      inProgressBackups.delete(clusterName);
    }
  }

  /**
   * Restore a cluster from backup
   */
  async restoreCluster(clusterName, sourcePath) {
    const clusterPath = path.join(this.parent.clustersPath, clusterName);

    try {
      logger.info(`Restoring cluster: ${clusterName} from ${sourcePath}`);

      if (!existsSync(sourcePath)) {
        throw new Error(`Backup source does not exist: ${sourcePath}`);
      }

      if (existsSync(clusterPath)) {
        throw new Error(
          `Cluster "${clusterName}" already exists. Delete it first or choose a different name.`,
        );
      }

      await this.parent.copyDirectory(sourcePath, clusterPath);

      const backupInfoPath = path.join(clusterPath, "backup-info.json");
      if (existsSync(backupInfoPath)) {
        await fs.unlink(backupInfoPath);
      }

      logger.info(`Cluster restored: ${clusterName}`);
      return {
        success: true,
        message: `Cluster "${clusterName}" restored successfully`,
        clusterPath: clusterPath,
      };
    } catch (error) {
      logger.error(`Failed to restore cluster ${clusterName}:`, error);
      throw error;
    }
  }

  /**
   * List cluster backups
   */
  async listClusterBackups(clusterName) {
    const backupsPath = path.join(this.parent.basePath, "backups", "clusters");
    try {
      if (!existsSync(backupsPath)) {
        return [];
      }
      const allBackups = await fs.readdir(backupsPath);
      const clusterBackups = allBackups.filter((b) =>
        b.startsWith(clusterName + "-"),
      );
      return clusterBackups.map((name) => ({
        name,
        path: path.join(backupsPath, name),
        created: name.replace(clusterName + "-", "").replace(/-/g, ":"),
      }));
    } catch (error) {
      logger.error(`Failed to list backups for cluster ${clusterName}:`, error);
      return [];
    }
  }
}
