import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import logger from '../../utils/logger.js';
import { upsertServerConfig, getAllServerConfigs, deleteServerConfig } from '../database.js';

/**
 * Cluster Manager
 * Handles all cluster-related operations: create, delete, list, start, backup, restore
 */
const inProgressBackups = new Set();

export class ClusterManager {
  constructor(basePath, clustersPath, serversPath, asaBinariesManager, configGenerator, scriptGenerator) {
    this.basePath = basePath;
    this.clustersPath = clustersPath;
    this.serversPath = serversPath;
    this.asaBinariesManager = asaBinariesManager;
    this.configGenerator = configGenerator;
    this.scriptGenerator = scriptGenerator;
    this.emitProgress = null;
  }

  /**
   * Set progress callback for real-time feedback
   */
  setProgressCallback(cb) {
    this.emitProgress = cb;
  }

  /**
   * Create a new cluster with multiple servers
   */
  async createCluster(clusterConfig, foreground = false) {
    const clusterName = clusterConfig.name;
    const clusterPath = path.join(this.clustersPath, clusterName);

    // Patch: Ensure every server has clusterId and clusterName
    if (Array.isArray(clusterConfig.servers)) {
      clusterConfig.servers = clusterConfig.servers.map(server => ({
        ...server,
        clusterId: clusterName,
        clusterName: clusterName
      }));
    }

    // Define step sequence
    const steps = [
      'Validating configuration',
      'Creating cluster directory',
      'Installing ASA binaries',
      'Writing config files',
      'Creating scripts',
      'Finalizing'
    ];
    let currentStep = 0;
    const emit = (msg, stepOverride) => {
      const step = stepOverride !== undefined ? stepOverride : currentStep;
      this.emitProgress?.({
        step,
        stepName: steps[step],
        percent: Math.round((step / (steps.length - 1)) * 100),
        message: msg
      });
    };

    try {
      emit('Validating configuration...');
      // Check required fields
      if (!clusterConfig.name || !clusterConfig.name.trim()) {
        emit('Cluster name is required', 0);
        throw new Error('Cluster name is required');
      }

      // Check name format
      if (clusterConfig.name && !/^[a-zA-Z0-9_-]+$/.test(clusterConfig.name)) {
        emit('Cluster name can only contain letters, numbers, underscores, and hyphens', 0);
        throw new Error('Cluster name can only contain letters, numbers, underscores, and hyphens');
      }

      // Check server count
      if (clusterConfig.serverCount && (clusterConfig.serverCount < 1 || clusterConfig.serverCount > 10)) {
        emit('Server count must be between 1 and 10', 0);
        throw new Error('Server count must be between 1 and 10');
      }

      // Check base port
      if (clusterConfig.basePort && (clusterConfig.basePort < 1024 || clusterConfig.basePort > 65535)) {
        emit('Base port must be between 1024 and 65535', 0);
        throw new Error('Base port must be between 1024 and 65535');
      }

      // Check if cluster already exists
      if (clusterConfig.name) {
        try {
          const clusterPath = path.join(this.clustersPath, clusterConfig.name);
          await fs.access(clusterPath);
          emit(`Cluster "${clusterConfig.name}" already exists`, 0);
          throw new Error(`Cluster "${clusterConfig.name}" already exists`);
        } catch {
          // Cluster doesn't exist, which is good
        }
      }

      // Step 1: Create cluster directory
      currentStep = 1;
      emit(`Creating cluster directory: ${clusterPath}`);
      await fs.mkdir(clusterPath, { recursive: true });

      // Patch: Build servers array with correct port logic
      const servers = clusterConfig.servers.map((server, index) => ({
        ...server,
        gamePort: server.gamePort ?? (clusterConfig.basePort + (index * 100)),
        queryPort: server.queryPort ?? (clusterConfig.basePort + 1 + (index * 100)),
        rconPort: server.rconPort ?? (clusterConfig.basePort + 2 + (index * 100)),
      }));

      // Save cluster config with correct ports
      const clusterConfigFile = {
        ...clusterConfig,
        name: clusterName,
        created: new Date().toISOString(),
        servers
      };
      // --- DB-native: upsert each server config into the DB ---
      for (const server of servers) {
        await upsertServerConfig(server.name, JSON.stringify(server));
      }
      // --- Optionally: upsert cluster metadata to DB here (future) ---
      // await upsertCluster(clusterName, JSON.stringify(clusterConfigFile));
      // --- Remove JSON file write (DB is now source of truth) ---
      // await fs.writeFile(
      //   path.join(clusterPath, 'cluster.json'),
      //   JSON.stringify(clusterConfigFile, null, 2)
      // );

      // Step 2: Install ASA binaries and create configs/scripts for each server
      for (const [i, serverConfig] of servers.entries()) {
        const serverName = serverConfig.name;
        const serverPath = path.join(clusterPath, serverName);
        // Pass progress callback to sub-managers
        this.asaBinariesManager.setProgressCallback((progress) => {
          let msg = progress && typeof progress === 'object' && 'message' in progress ? progress.message : progress;
          if (typeof msg !== 'string') {
            if (msg && typeof msg === 'object' && 'message' in msg && typeof msg.message === 'string') {
              msg = msg.message;
            } else {
              msg = JSON.stringify(msg);
            }
          }
          emit(msg || `Installing ASA binaries for ${serverName}`, 2);
        });
        this.configGenerator.setProgressCallback?.((progress) => {
          let msg = progress && typeof progress === 'object' && 'message' in progress ? progress.message : progress;
          if (typeof msg !== 'string') {
            if (msg && typeof msg === 'object' && 'message' in msg && typeof msg.message === 'string') {
              msg = msg.message;
            } else {
              msg = JSON.stringify(msg);
            }
          }
          emit(msg || `Writing config for ${serverName}`, 3);
        });
        this.scriptGenerator.setProgressCallback?.((progress) => {
          let msg = progress && typeof progress === 'object' && 'message' in progress ? progress.message : progress;
          if (typeof msg !== 'string') {
            if (msg && typeof msg === 'object' && 'message' in msg && typeof msg.message === 'string') {
              msg = msg.message;
            } else {
              msg = JSON.stringify(msg);
            }
          }
          emit(msg || `Creating scripts for ${serverName}`, 4);
        });

        // Step 2: Installing ASA binaries
        currentStep = 2;
        emit(`Installing ASA binaries for ${serverName}`);
        await this.asaBinariesManager.installForServerInCluster(clusterName, serverName, foreground);

        // Step 3: Writing config files
        currentStep = 3;
        emit(`Writing config files for ${serverName}`);
        await this.configGenerator.createServerConfigInCluster(clusterName, serverPath, serverConfig);

        // Step 4: Creating scripts
        currentStep = 4;
        emit(`Creating scripts for ${serverName}`);
        await this.scriptGenerator.createStartScriptInCluster(clusterName, serverPath, serverConfig);
        await this.scriptGenerator.createStopScriptInCluster(clusterName, serverPath, serverName);
      }

      // Step 5: Finalizing
      currentStep = 5;
      emit(`Cluster ${clusterName} created successfully!`);

      return {
        success: true,
        message: `Cluster "${clusterName}" created successfully`,
        cluster: clusterConfigFile
      };
    } catch (error) {
      emit(`Failed to create cluster: ${error.message}`);
      logger.error(`Failed to create cluster ${clusterName}:`, error);
      throw new Error(error.message);
    }
  }

  /**
   * List all clusters (DB-native)
   */
  async listClusters() {
    try {
      const clusters = [];
      if (!existsSync(this.clustersPath)) {
        return clusters;
      }
      const clusterDirs = await fs.readdir(this.clustersPath);
      // Get all DB configs for mapping
      const { getAllServerConfigs } = await import('../database.js');
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
      const { parseStartBat } = await import('../../utils/parse-start-bat.js');
      for (const clusterName of clusterDirs) {
        try {
          const clusterPath = path.join(this.clustersPath, clusterName);
          const stat = await fs.stat(clusterPath);
          if (!stat.isDirectory()) continue;
          // DB-driven: if clusterId exists in DB, use DB servers
          let clusterConfig = { name: clusterName, servers: [] };
          if (dbClusterMap[clusterName]) {
            clusterConfig.servers = dbClusterMap[clusterName];
            clusters.push({ name: clusterName, path: clusterPath, config: clusterConfig });
            continue;
          }
          // Fallback: scan for start.bat files in subdirs
          const serverDirs = await fs.readdir(clusterPath);
          const fallbackServers = [];
          for (const serverDir of serverDirs) {
            const serverPath = path.join(clusterPath, serverDir);
            if (!existsSync(serverPath) || !(await fs.stat(serverPath)).isDirectory()) continue;
            const startBatPath = path.join(serverPath, 'start.bat');
            if (existsSync(startBatPath)) {
              try {
                const parsed = await parseStartBat(startBatPath);
                fallbackServers.push(parsed);
              } catch (e) {
                logger.warn(`[ClusterManager] Fallback: failed to parse start.bat for server ${serverDir} in cluster ${clusterName}: ${e.message}`);
              }
            }
          }
          if (fallbackServers.length > 0) {
            logger.warn(`[ClusterManager] Fallback: found cluster on disk not in DB: ${clusterName} with ${fallbackServers.length} servers`);
            clusterConfig.servers = fallbackServers;
            clusters.push({ name: clusterName, path: clusterPath, config: clusterConfig, fallback: true });
          }
        } catch (error) {
          logger.error(`Error reading cluster ${clusterName}:`, error);
        }
      }
      return clusters;
    } catch (error) {
      logger.error('Failed to list clusters:', error);
      return [];
    }
  }

  /**
   * Delete a cluster and all its servers
   */
  async deleteCluster(clusterName, options = {}) {
    const { force = false, backup = true } = options;
    const clusterPath = path.join(this.clustersPath, clusterName);

    try {
      logger.info(`Deleting cluster: ${clusterName} (force: ${force}, backup: ${backup})`);

      // DB-native: Find all servers in the DB with this clusterId/clusterName
      const dbConfigs = getAllServerConfigs();
      const serversInCluster = dbConfigs.filter(config => {
        try {
          const serverConfig = JSON.parse(config.config_data);
          return (
            serverConfig.clusterId === clusterName ||
            serverConfig.clusterName === clusterName ||
            (serverConfig.config && (serverConfig.config.clusterId === clusterName || serverConfig.config.clusterName === clusterName))
          );
        } catch {
          return false;
        }
      });
      if (serversInCluster.length === 0) {
        throw new Error(`Cluster "${clusterName}" does not exist in the database`);
      }

      // Create backup if requested (optional, can be skipped or improved for DB-native)
      if (backup) {
        logger.info(`Creating backup before deleting cluster: ${clusterName}`);
        try {
          await this.backupCluster(clusterName);
          logger.info(`Backup created for cluster: ${clusterName}`);
        } catch (backupError) {
          if (!force) {
            throw new Error(`Failed to create backup for cluster "${clusterName}": ${backupError.message}`);
          }
          logger.warn(`Backup failed for cluster ${clusterName}, but continuing due to force flag:`, backupError);
        }
      }

      // Delete all servers in the DB for this cluster
      for (const config of serversInCluster) {
        try {
          // Optionally, clean up files on disk if they exist
          const serverConfig = JSON.parse(config.config_data);
          if (serverConfig.serverPath && existsSync(serverConfig.serverPath)) {
            await this.deleteDirectoryManually(serverConfig.serverPath);
          }
        } catch {}
        deleteServerConfig(config.name);
      }

      // Optionally, clean up the cluster directory if it exists
      if (existsSync(clusterPath)) {
        await this.deleteDirectoryManually(clusterPath);
      }

      logger.info(`Cluster ${clusterName} deleted successfully (DB-native)`);
      return {
        success: true,
        message: `Cluster "${clusterName}" deleted successfully`,
        backedUp: backup
      };
    } catch (error) {
      logger.error(`Failed to delete cluster ${clusterName}:`, error);
      throw error;
    }
  }

  /**
   * Start a cluster (start all servers in the cluster)
   */
  async startCluster(clusterName) {
    try {
      logger.info(`Starting cluster: ${clusterName}`);
      const clusterPath = path.join(this.clustersPath, clusterName);

      // Check if cluster exists
      if (!existsSync(clusterPath)) {
        throw new Error(`Cluster "${clusterName}" does not exist`);
      }

      // Read cluster configuration
      const configPath = path.join(clusterPath, 'cluster.json');
      let clusterConfig;
      try {
        const configContent = await fs.readFile(configPath, 'utf8');
        clusterConfig = JSON.parse(configContent);
      } catch {
        throw new Error(`Cluster configuration not found for "${clusterName}"`);
      }

      const results = [];

      // Start each server in the cluster
      for (const server of clusterConfig.servers || []) {
        try {
          const serverPath = path.join(clusterPath, server.name);
          const startScriptPath = path.join(serverPath, 'start.bat');

          if (existsSync(startScriptPath)) {
            logger.info(`Starting server: ${server.name} in cluster ${clusterName}`);
            // Note: This would typically use a process manager or child_process.spawn
            // For now, we'll just indicate the script is available
            results.push({
              serverName: server.name,
              success: true,
              message: `Start script available for ${server.name}`,
              scriptPath: startScriptPath
            });
          } else {
            results.push({
              serverName: server.name,
              success: false,
              message: `Start script not found for ${server.name}`
            });
          }
        } catch (error) {
          logger.error(`Failed to start server ${server.name}:`, error);
          results.push({
            serverName: server.name,
            success: false,
            message: error.message
          });
        }
      }

      return {
        success: true,
        message: `Cluster "${clusterName}" start initiated`,
        results: results
      };
    } catch (error) {
      logger.error(`Failed to start cluster ${clusterName}:`, error);
      throw error;
    }
  }

  /**
   * Backup a cluster
   */
  async backupCluster(clusterName, customDestination = null) {
    if (inProgressBackups.has(clusterName)) {
      throw new Error(`Backup already in progress for cluster "${clusterName}"`);
    }
    inProgressBackups.add(clusterName);
    const clusterPath = path.join(this.clustersPath, clusterName);
    try {
      logger.info(`Creating backup for cluster: ${clusterName}`);
      if (!existsSync(clusterPath)) {
        throw new Error(`Cluster "${clusterName}" does not exist`);
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `${clusterName}-${timestamp}`;
      const backupDestination = customDestination || path.join(this.basePath, 'backups', 'clusters');
      await fs.mkdir(backupDestination, { recursive: true });
      const backupPath = path.join(backupDestination, backupName);
      await fs.mkdir(backupPath, { recursive: true });

      // Patch: Only backup ShooterGame/Saved/* for each server
      const serverDirs = await fs.readdir(clusterPath);
      for (const serverDir of serverDirs) {
        const serverPath = path.join(clusterPath, serverDir);
        const stat = await fs.stat(serverPath);
        if (!stat.isDirectory()) continue;
        const savedPath = path.join(serverPath, 'ShooterGame', 'Saved');
        if (existsSync(savedPath)) {
          const destSaved = path.join(backupPath, serverDir, 'ShooterGame', 'Saved');
          // Only copy the latest 5 .ark files
          await fs.mkdir(destSaved, { recursive: true });
          const entries = await fs.readdir(savedPath, { withFileTypes: true });
          // Filter for .ark files only
          const arkFiles = entries.filter(e => e.isFile() && e.name.endsWith('.ark'));
          // Get stats and sort by mtime descending
          const arkFilesWithStats = await Promise.all(
            arkFiles.map(async e => {
              const filePath = path.join(savedPath, e.name);
              const stat = await fs.stat(filePath);
              return { name: e.name, mtime: stat.mtime, path: filePath };
            })
          );
          arkFilesWithStats.sort((a, b) => b.mtime - a.mtime);
          // Take only the latest 5
          const latestArkFiles = arkFilesWithStats.slice(0, 5);
          for (const file of latestArkFiles) {
            await fs.copyFile(file.path, path.join(destSaved, file.name));
          }
        }
      }

      // Create backup metadata
      const backupInfo = {
        clusterName: clusterName,
        backupName: backupName,
        created: new Date().toISOString(),
        originalPath: clusterPath,
        backupPath: backupPath,
        type: 'cluster',
        note: 'Only ShooterGame/Saved/* was backed up for each server.'
      };
      await fs.writeFile(
        path.join(backupPath, 'backup-info.json'),
        JSON.stringify(backupInfo, null, 2)
      );
      logger.info(`Cluster backup created: ${backupPath}`);
      return {
        success: true,
        message: `Cluster "${clusterName}" backed up successfully`,
        backupPath: backupPath,
        backupName: backupName
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
    const clusterPath = path.join(this.clustersPath, clusterName);

    try {
      logger.info(`Restoring cluster: ${clusterName} from ${sourcePath}`);

      // Check if source backup exists
      if (!existsSync(sourcePath)) {
        throw new Error(`Backup source does not exist: ${sourcePath}`);
      }

      // Check if cluster already exists
      if (existsSync(clusterPath)) {
        throw new Error(`Cluster "${clusterName}" already exists. Delete it first or choose a different name.`);
      }

      // Copy backup to cluster location
      await this.copyDirectory(sourcePath, clusterPath);

      // Remove backup metadata file from restored cluster
      const backupInfoPath = path.join(clusterPath, 'backup-info.json');
      if (existsSync(backupInfoPath)) {
        await fs.unlink(backupInfoPath);
      }

      logger.info(`Cluster restored: ${clusterName}`);
      return {
        success: true,
        message: `Cluster "${clusterName}" restored successfully`,
        clusterPath: clusterPath
      };
    } catch (error) {
      logger.error(`Failed to restore cluster ${clusterName}:`, error);
      throw error;
    }
  }

  /**
   * Copy directory recursively
   */
  async copyDirectory(source, destination) {
    try {
      await fs.mkdir(destination, { recursive: true });
      const entries = await fs.readdir(source, { withFileTypes: true });

      for (const entry of entries) {
        const sourcePath = path.join(source, entry.name);
        const destPath = path.join(destination, entry.name);

        if (entry.isDirectory()) {
          await this.copyDirectory(sourcePath, destPath);
        } else {
          await fs.copyFile(sourcePath, destPath);
        }
      }
    } catch (error) {
      logger.error(`Failed to copy directory from ${source} to ${destination}:`, error);
      throw error;
    }
  }

  /**
   * Delete directory manually with retry logic
   */
  async deleteDirectoryManually(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await this.deleteDirectoryManually(fullPath);
        } else {
          await fs.unlink(fullPath);
        }
      }

      await fs.rmdir(dirPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Validate cluster configuration
   */
  async validateClusterConfig(config) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check required fields
    if (!config.name || !config.name.trim()) {
      validation.valid = false;
      validation.errors.push('Cluster name is required');
    }

    // Check name format
    if (config.name && !/^[a-zA-Z0-9_-]+$/.test(config.name)) {
      validation.valid = false;
      validation.errors.push('Cluster name can only contain letters, numbers, underscores, and hyphens');
    }

    // Check server count
    if (config.serverCount && (config.serverCount < 1 || config.serverCount > 10)) {
      validation.valid = false;
      validation.errors.push('Server count must be between 1 and 10');
    }

    // Check base port
    if (config.basePort && (config.basePort < 1024 || config.basePort > 65535)) {
      validation.valid = false;
      validation.errors.push('Base port must be between 1024 and 65535');
    }

    // Check if cluster already exists
    if (config.name) {
      try {
        const clusterPath = path.join(this.clustersPath, config.name);
        await fs.access(clusterPath);
        validation.valid = false;
        validation.errors.push(`Cluster "${config.name}" already exists`);
      } catch {
        // Cluster doesn't exist, which is good
      }
    }

    return validation;
  }

  /**
   * Update paths if they change
   */
  updatePaths(basePath, clustersPath, serversPath) {
    this.basePath = basePath;
    this.clustersPath = clustersPath;
    this.serversPath = serversPath;
  }

  async listClusterBackups(clusterName) {
    try {
      const backups = [];
      const backupsPath = path.join(this.basePath, 'backups', 'clusters');
      logger.info(`[listClusterBackups] Checking backupsPath: ${backupsPath}`);
      if (!existsSync(backupsPath)) {
        logger.warn(`[listClusterBackups] backupsPath does not exist: ${backupsPath}`);
        return backups;
      }
      const backupDirs = await fs.readdir(backupsPath);
      logger.info(`[listClusterBackups] Found backupDirs: ${JSON.stringify(backupDirs)}`);
      for (const backupDir of backupDirs) {
        // Match clusterName-... (not requiring _backup_)
        if (!backupDir.startsWith(clusterName + '-')) continue;
        try {
          const backupPath = path.join(backupsPath, backupDir);
          const stat = await fs.stat(backupPath);
          if (stat.isDirectory()) {
            const backupInfoPath = path.join(backupPath, 'backup-info.json');
            let backupInfo = {
              clusterName,
              backupName: backupDir,
              created: stat.birthtime.toISOString(),
              backupPath,
              size: stat.size,
              type: 'cluster',
              hasMetadata: false
            };
            if (existsSync(backupInfoPath)) {
              try {
                const infoContent = await fs.readFile(backupInfoPath, 'utf8');
                Object.assign(backupInfo, JSON.parse(infoContent), { hasMetadata: true });
              } catch {}
            }
            backups.push(backupInfo);
          }
        } catch (error) {
          logger.error(`Error reading cluster backup ${backupDir}:`, error);
        }
      }
      logger.info(`[listClusterBackups] Returning ${backups.length} backups for cluster ${clusterName}`);
      return backups.sort((a, b) => new Date(b.created) - new Date(a.created));
    } catch (error) {
      logger.error('Failed to list cluster backups:', error);
      return [];
    }
  }
} 
