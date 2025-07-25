import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import logger from '../../utils/logger.js';
import { upsertServerConfig, getAllServerConfigs } from '../database.js';

/**
 * Cluster Manager
 * Handles all cluster-related operations: create, delete, list, start, backup, restore
 */
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
          emit(progress.message || `Installing ASA binaries for ${serverName}`, 2);
        });
        this.configGenerator.setProgressCallback?.((progress) => {
          emit(progress.message || `Writing config for ${serverName}`, 3);
        });
        this.scriptGenerator.setProgressCallback?.((progress) => {
          emit(progress.message || `Creating scripts for ${serverName}`, 4);
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
      // Get all server configs from the DB
      const dbConfigs = getAllServerConfigs();
      // Group servers by clusterId
      const clustersMap = new Map();
      for (const config of dbConfigs) {
        let serverConfig;
        try {
          serverConfig = JSON.parse(config.config_data);
        } catch {
          continue;
        }
        const clusterId = serverConfig.clusterId || 'standalone';
        if (!clustersMap.has(clusterId)) {
          clustersMap.set(clusterId, {
            name: clusterId,
            created: serverConfig.created || config.updated_at,
            servers: [],
          });
        }
        clustersMap.get(clusterId).servers.push(serverConfig);
      }
      // Convert to array and add metadata
      const clusters = Array.from(clustersMap.values()).map(cluster => ({
        name: cluster.name,
        created: cluster.created,
        serverCount: cluster.servers.length,
        config: { name: cluster.name, servers: cluster.servers },
      }));
      // Sort by name
      return clusters.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      logger.error('Failed to list clusters (DB-native):', error);
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

      // Check if cluster exists
      if (!existsSync(clusterPath)) {
        throw new Error(`Cluster "${clusterName}" does not exist`);
      }

      // Create backup if requested
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

      // Delete cluster directory
      await this.deleteDirectoryManually(clusterPath);

      logger.info(`Cluster ${clusterName} deleted successfully`);
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
    const clusterPath = path.join(this.clustersPath, clusterName);

    try {
      logger.info(`Creating backup for cluster: ${clusterName}`);

      // Check if cluster exists
      if (!existsSync(clusterPath)) {
        throw new Error(`Cluster "${clusterName}" does not exist`);
      }

      // Create backup directory structure
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      // Use dash, not _backup_
      const backupName = `${clusterName}-${timestamp}`;
      
      const backupDestination = customDestination || path.join(this.basePath, 'backups', 'clusters');
      await fs.mkdir(backupDestination, { recursive: true });

      const backupPath = path.join(backupDestination, backupName);

      // Copy cluster directory to backup location
      await this.copyDirectory(clusterPath, backupPath);

      // Create backup metadata
      const backupInfo = {
        clusterName: clusterName,
        backupName: backupName,
        created: new Date().toISOString(),
        originalPath: clusterPath,
        backupPath: backupPath,
        type: 'cluster'
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
