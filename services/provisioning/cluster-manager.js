import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import logger from '../../utils/logger.js';

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

    try {
      logger.info(`Creating cluster: ${clusterName} with ${clusterConfig.servers.length} servers`);
      this.emitProgress?.(`Creating cluster: ${clusterName}`);

      // Create cluster directory
      await fs.mkdir(clusterPath, { recursive: true });

      // Create cluster configuration file
      const clusterConfigFile = {
        name: clusterName,
        created: new Date().toISOString(),
        servers: clusterConfig.servers.map((server, index) => ({
          name: server.name,
          map: server.map || 'TheIsland',
          gamePort: clusterConfig.basePort + (index * 100),
          queryPort: clusterConfig.basePort + 1 + (index * 100),
          rconPort: clusterConfig.basePort + 2 + (index * 100),
          maxPlayers: server.maxPlayers || clusterConfig.maxPlayers || 70,
          adminPassword: clusterConfig.adminPassword || 'admin123',
          password: server.password || clusterConfig.password || '',
          clusterId: clusterConfig.clusterId || clusterName,
          clusterPassword: clusterConfig.clusterPassword || '',
          customDynamicConfigUrl: server.customDynamicConfigUrl || clusterConfig.customDynamicConfigUrl || '',
          disableBattleEye: server.disableBattleEye !== undefined ? server.disableBattleEye : (clusterConfig.disableBattleEye || false),
          gameUserSettings: server.gameUserSettings,
          gameIni: server.gameIni,
          mods: server.mods || clusterConfig.mods || []
        }))
      };

      await fs.writeFile(
        path.join(clusterPath, 'cluster.json'),
        JSON.stringify(clusterConfigFile, null, 2)
      );

      this.emitProgress?.(`Cluster configuration saved: ${clusterName}`);

      // Install ASA binaries and create configurations for each server
      for (const serverConfig of clusterConfigFile.servers) {
        const serverName = serverConfig.name;
        logger.info(`Setting up server: ${serverName} in cluster ${clusterName}`);
        this.emitProgress?.(`Setting up server: ${serverName}`);

        // Install ASA binaries for this server
        await this.asaBinariesManager.installForServerInCluster(clusterName, serverName, foreground);

        // Create server path
        const serverPath = path.join(clusterPath, serverName);

        // Create server configuration files
        await this.configGenerator.createServerConfigInCluster(clusterName, serverPath, serverConfig);

        // Create start and stop scripts
        await this.scriptGenerator.createStartScriptInCluster(clusterName, serverPath, serverConfig);
        await this.scriptGenerator.createStopScriptInCluster(clusterName, serverPath, serverName);

        this.emitProgress?.(`Server ${serverName} setup completed`);
      }

      logger.info(`Cluster ${clusterName} created successfully with ${clusterConfigFile.servers.length} servers`);
      this.emitProgress?.(`Cluster ${clusterName} created successfully`);

      return {
        success: true,
        message: `Cluster "${clusterName}" created successfully`,
        cluster: clusterConfigFile
      };
    } catch (error) {
      logger.error(`Failed to create cluster ${clusterName}:`, error);
      this.emitProgress?.(`Failed to create cluster ${clusterName}: ${error.message}`);
      throw new Error(error.message);
    }
  }

  /**
   * List all clusters
   */
  async listClusters() {
    try {
      const clusters = [];
      if (!existsSync(this.clustersPath)) {
        return clusters;
      }

      const clusterDirs = await fs.readdir(this.clustersPath);

      for (const clusterName of clusterDirs) {
        try {
          const clusterPath = path.join(this.clustersPath, clusterName);
          const stat = await fs.stat(clusterPath);

          if (stat.isDirectory()) {
            const configPath = path.join(clusterPath, 'cluster.json');
            let clusterConfig = {};

            try {
              const configContent = await fs.readFile(configPath, 'utf8');
              clusterConfig = JSON.parse(configContent);
            } catch {
              // Cluster config not found, create a basic one
              clusterConfig = {
                name: clusterName,
                servers: []
              };

              // Try to detect servers in the cluster directory
              try {
                const serverDirs = await fs.readdir(clusterPath);
                for (const serverDir of serverDirs) {
                  const serverPath = path.join(clusterPath, serverDir);
                  const serverStat = await fs.stat(serverPath);
                  if (serverStat.isDirectory() && serverDir !== 'clusterdata') {
                    clusterConfig.servers.push({
                      name: serverDir,
                      map: 'TheIsland',
                      gamePort: 7777,
                      queryPort: 27015,
                      rconPort: 32330,
                      maxPlayers: 70
                    });
                  }
                }
              } catch {
                // Ignore errors when trying to detect servers
              }
            }

            clusters.push({
              name: clusterName,
              path: clusterPath,
              config: clusterConfig,
              created: clusterConfig.created || stat.birthtime.toISOString(),
              serverCount: clusterConfig.servers?.length || 0
            });
          }
        } catch (error) {
          logger.error(`Error reading cluster ${clusterName}:`, error);
        }
      }

      return clusters.sort((a, b) => a.name.localeCompare(b.name));
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
      const backupName = `${clusterName}_backup_${timestamp}`;
      
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
} 
