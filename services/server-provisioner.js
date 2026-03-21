import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { existsSync, statSync } from 'fs';
import os from 'os';
import { createWriteStream } from 'fs';
import https from 'https';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import { SteamCmdManager } from './provisioning/steam-cmd-manager.js';
import { SystemInfo } from './provisioning/system-info.js';
import { ASABinariesManager } from './provisioning/asa-binaries-manager.js';
import { ConfigGenerator } from './provisioning/config-generator.js';
import { ScriptGenerator } from './provisioning/script-generator.js';
import { ClusterManager } from './provisioning/cluster-manager.js';
import { ServerManager } from './provisioning/server-manager.js';

const execAsync = promisify(exec);

/**
 * Server Provisioning Service (Refactored)
 * Main orchestrator that delegates to specialized managers
 */
export class ServerProvisioner {
  constructor() {
    logger.info(`ServerProvisioner constructor - NATIVE_BASE_PATH env: ${process.env.NATIVE_BASE_PATH}`);
    logger.info(`ServerProvisioner constructor - config.server.native.basePath: ${config.server.native.basePath}`);
    
    this.basePath = config.server.native.basePath || process.env.NATIVE_BASE_PATH || 'C:\\ARK';
    logger.info(`ServerProvisioner constructor - final basePath: ${this.basePath}`);
    
    // Updated paths for separate binary architecture
    this.serversPath = process.env.NATIVE_SERVERS_PATH || (config.server && config.server.native && config.server.native.serversPath) || (config.server && config.server.native && config.server.native.basePath ? path.join(config.server.native.basePath, 'servers') : null);
    this.clustersPath = process.env.NATIVE_CLUSTERS_PATH || (config.server && config.server.native && config.server.native.clustersPath) || (config.server && config.server.native && config.server.native.basePath ? path.join(config.server.native.basePath, 'clusters') : null);
    if (!this.serversPath || !this.clustersPath) {
      logger.error('ServerProvisioner: Missing serversPath or clustersPath in configuration.');
    }

    // Initialize managers
    this.steamCmdManager = new SteamCmdManager(this.basePath);
    this.systemInfo = new SystemInfo(this.basePath, this.clustersPath, this.serversPath);
    this.asaBinariesManager = new ASABinariesManager(this.steamCmdManager, this.basePath, this.clustersPath, this.serversPath);
    this.configGenerator = new ConfigGenerator(this.basePath);
    this.scriptGenerator = new ScriptGenerator(this.basePath, this.clustersPath, this.serversPath);
    this.clusterManager = new ClusterManager(this.basePath, this.clustersPath, this.serversPath, this.asaBinariesManager, this.configGenerator, this.scriptGenerator);
    this.serverManager = new ServerManager(this.basePath, this.clustersPath, this.serversPath, this.asaBinariesManager, this.configGenerator, this.scriptGenerator);
    
    // Update paths in sub-managers
    this.configGenerator.updatePaths(this.basePath, this.clustersPath, this.serversPath);
    
    // Update legacy properties for compatibility
    this.steamCmdPath = this.steamCmdManager.getInstallationPath();
    this.steamCmdExe = this.steamCmdManager.getExecutablePath();
    this.autoInstallSteamCmd = config.server.native.autoInstallSteamCmd !== false;
    this.emitProgress = null;
    this.latestBuildCache = {
      buildId: null,
      checkedAt: 0
    };

    logger.info(`ServerProvisioner initialized successfully`);
    logger.info(`Servers path: ${this.serversPath}`);
    logger.info(`Clusters path: ${this.clustersPath}`);
    logger.info(`SteamCMD path: ${this.steamCmdPath}`);
  }

  /**
   * Execute command in foreground mode with real-time output
   */
  async execForeground(command, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const { execSync } = await import('child_process');
        
        logger.info(`Executing command in foreground: ${command}`);
        console.log(`\n=== Executing: ${command} ===\n`);
        
        execSync(command, {
          stdio: 'inherit',
          ...options
        });
        
        console.log(`\n=== Command completed successfully ===\n`);
        logger.info('Foreground command completed successfully');
        resolve({ success: true });
      } catch (error) {
        console.log(`\n=== Command failed ===\n`);
        logger.error('Foreground command failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Create necessary directories
   */
  async createDirectories() {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      await fs.mkdir(this.serversPath, { recursive: true });
      await fs.mkdir(this.clustersPath, { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'steamcmd'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'backups'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'backups', 'servers'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'backups', 'clusters'), { recursive: true });
      logger.info('All directories created successfully');
    } catch (error) {
      logger.error('Failed to create directories:', error);
      throw error;
    }
  }

  /**
   * Initialize the provisioner
   */
  async initialize() {
    try {
      logger.info('Initializing ServerProvisioner...');
      
      // Create necessary directories
      await this.createDirectories();
      
      // Ensure SteamCMD is available
      await this.ensureSteamCmd();
      
      logger.info('ServerProvisioner initialized successfully');
      return { success: true, message: 'ServerProvisioner initialized' };
    } catch (error) {
      logger.error('Failed to initialize ServerProvisioner:', error);
      throw error;
    }
  }

  /**
   * Set progress callback for real-time feedback
   */
  setProgressCallback(cb) {
    this.emitProgress = cb;
    // Pass progress callback to all managers
    this.asaBinariesManager?.setProgressCallback(cb);
    this.scriptGenerator?.setProgressCallback(cb);
    this.clusterManager?.setProgressCallback(cb);
    this.serverManager?.setProgressCallback(cb);
  }

  // ========================================
  // STEAMCMD DELEGATIONS
  // ========================================

  async checkSteamCmdAvailability() {
    return await this.steamCmdManager.checkAvailability();
  }

  async isSteamCmdInstalled() {
    return await this.steamCmdManager.isInstalled();
  }

  async installSteamCmd(foreground = false) {
    return await this.steamCmdManager.install(foreground);
  }

  async findExistingSteamCmd() {
    return await this.steamCmdManager.findExisting();
  }

  async ensureSteamCmd() {
    return await this.steamCmdManager.ensure();
  }

  // ========================================
  // ASA BINARIES DELEGATIONS
  // ========================================

  async checkASABinariesAvailability() {
    return await this.asaBinariesManager.checkAvailability ? 
           await this.asaBinariesManager.checkAvailability() : 
           await this.systemInfo.checkASABinariesInstalled();
  }

  async installASABinaries(foreground = false) {
    // Legacy method - for compatibility, install for first server if any exist
    const servers = await this.listServers();
    if (servers.length > 0) {
      return await this.asaBinariesManager.installForServer(servers[0].name);
    }
    throw new Error('No servers found. Create a server first.');
  }

  async ensureASABinaries() {
      return await this.installASABinaries();
  }

  async updateASABinaries() {
    return await this.asaBinariesManager.updateAll();
  }

  async installASABinariesForServer(serverName) {
    return await this.asaBinariesManager.installForServer(serverName);
  }

  async installASABinariesForServerInCluster(clusterName, serverName, foreground = false) {
    return await this.asaBinariesManager.installForServerInCluster(clusterName, serverName, foreground);
  }

  async updateServerBinaries(serverName) {
    return await this.asaBinariesManager.updateForServer(serverName);
  }

  async updateAllServerBinaries() {
    return await this.asaBinariesManager.updateAll();
  }

  // ========================================
  // CONFIGURATION DELEGATIONS
  // ========================================

  async createServerConfig(serverPath, serverConfig) {
    return await this.configGenerator.createServerConfig(serverPath, serverConfig);
  }

  async createServerConfigInCluster(clusterName, serverPath, serverConfig) {
    return await this.configGenerator.createServerConfigInCluster(clusterName, serverPath, serverConfig);
  }

  async getFinalConfigsForServer(serverName) {
    return await this.configGenerator.getFinalConfigsForServer(serverName);
  }

  async updateServerSettings(serverName, newSettings, options = {}) {
    return await this.configGenerator.updateServerSettings(serverName, newSettings, options);
  }

  // ========================================
  // SCRIPT GENERATION DELEGATIONS
  // ========================================

  async createStartScript(serverPath, serverConfig) {
    return await this.scriptGenerator.createStartScript(serverPath, serverConfig);
  }

  async createStopScript(serverPath, serverName) {
    return await this.scriptGenerator.createStopScript(serverPath, serverName);
  }

  async createStartScriptInCluster(clusterName, serverPath, serverConfig) {
    return await this.scriptGenerator.createStartScriptInCluster(clusterName, serverPath, serverConfig);
  }

  async createStopScriptInCluster(clusterName, serverPath, serverName) {
    return await this.scriptGenerator.createStopScriptInCluster(clusterName, serverPath, serverName);
  }

  async regenerateServerStartScript(serverName) {
    return await this.scriptGenerator.regenerateServerStartScript(serverName);
  }

  async regenerateAllClusterStartScripts() {
    return await this.scriptGenerator.regenerateAllClusterStartScripts();
  }

  // ========================================
  // SERVER MANAGEMENT DELEGATIONS
  // ========================================

  async createServer(serverConfig) {
    return await this.serverManager.createServer(serverConfig);
  }

  async listServers() {
    return await this.serverManager.listServers();
  }

  async deleteServer(serverName) {
    return await this.serverManager.deleteServer(serverName);
  }

  async backupServer(serverName, options = {}) {
    return await this.serverManager.backupServer(serverName, options);
  }

  async restoreServer(serverName, sourcePath, options = {}) {
    return await this.serverManager.restoreServer(serverName, sourcePath, options);
  }

  async listServerBackups() {
    return await this.serverManager.listServerBackups();
  }

  // ========================================
  // CLUSTER MANAGEMENT DELEGATIONS
  // ========================================

  async createCluster(clusterConfig, foreground = false) {
    return await this.clusterManager.createCluster(clusterConfig, foreground);
  }

  async listClusters() {
    return await this.clusterManager.listClusters();
  }

  async deleteCluster(clusterName, options = {}) {
    return await this.clusterManager.deleteCluster(clusterName, options);
  }

  async startCluster(clusterName) {
    return await this.clusterManager.startCluster(clusterName);
  }

  async backupCluster(clusterName, customDestination = null) {
    return await this.clusterManager.backupCluster(clusterName, customDestination);
  }

  async restoreCluster(clusterName, sourcePath) {
    return await this.clusterManager.restoreCluster(clusterName, sourcePath);
  }

  async validateClusterConfig(config) {
    return await this.clusterManager.validateClusterConfig(config);
  }

  async listClusterBackups(clusterName) {
    return await this.clusterManager.listClusterBackups(clusterName);
  }

  // ========================================
  // SYSTEM INFO DELEGATIONS
  // ========================================

  async getSystemInfo() {
    return await this.systemInfo.getSystemInfo();
  }

  formatBytes(bytes, decimals = 2) {
    return this.systemInfo.formatBytes(bytes, decimals);
  }

  // ========================================
  // UPDATE CONFIGURATION METHODS
  // ========================================

  /**
   * Get server update configuration
   */
  async getServerUpdateConfig(serverName) {
    try {
      // Try to get from database first
      const { getServerUpdateConfig } = await import('../services/database.js');
      const dbConfig = getServerUpdateConfig(serverName);
      
      if (dbConfig) {
        return {
          serverName,
          clusterName: dbConfig.cluster_name,
          updateOnStart: dbConfig.update_on_start === 1,
          lastUpdate: dbConfig.last_update,
          updateEnabled: dbConfig.update_enabled === 1,
          autoUpdate: dbConfig.auto_update === 1,
          updateInterval: dbConfig.update_interval || 24,
          updateSchedule: dbConfig.update_schedule
        };
      }
      
      // Default configuration if not found in database
      return {
        serverName,
        clusterName: null,
        updateOnStart: true, // Default to true
        lastUpdate: null,
        updateEnabled: true, // Default to true
        autoUpdate: false, // Default to false
        updateInterval: 24, // Default to 24 hours
        updateSchedule: null
      };
    } catch (error) {
      logger.error(`Error getting update config for server ${serverName}:`, error);
      // Return default configuration on error
      return {
        serverName,
        clusterName: null,
        updateOnStart: true,
        lastUpdate: null,
        updateEnabled: true,
        autoUpdate: false,
        updateInterval: 24,
        updateSchedule: null
      };
    }
  }

  /**
   * Update server update configuration
   */
  async updateServerUpdateConfig(serverName, config) {
    try {
      const { upsertServerUpdateConfig } = await import('../services/database.js');
      
      const updateData = {
        serverName,
        clusterName: config.clusterName || null,
        updateOnStart: config.updateOnStart ? 1 : 0,
        updateEnabled: config.updateEnabled ? 1 : 0,
        autoUpdate: config.autoUpdate ? 1 : 0,
        updateInterval: config.updateInterval || 24,
        updateSchedule: config.updateSchedule || null
      };
      
      upsertServerUpdateConfig(updateData);
      logger.info(`Update configuration saved for server ${serverName}`);
      
      return { success: true, message: 'Update configuration saved successfully' };
    } catch (error) {
      logger.error(`Error updating configuration for server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Check if server needs update
   */
  async checkServerUpdateStatus(serverName) {
    try {
      const config = await this.getServerUpdateConfig(serverName);
      
      if (!config.updateEnabled) {
        return {
          needsUpdate: false,
          reason: 'Updates disabled',
          lastUpdate: config.lastUpdate
        };
      }

      const latestBuildId = await this.getLatestAsaBuildId();
      const localBuildId = await this.getInstalledAsaBuildId(serverName);

      if (latestBuildId && localBuildId && latestBuildId !== localBuildId) {
        return {
          needsUpdate: true,
          reason: `Steam build ${latestBuildId} is newer than installed build ${localBuildId}`,
          lastUpdate: config.lastUpdate,
          currentBuildId: localBuildId,
          latestBuildId,
          updateInterval: config.updateInterval,
          updateOnStart: config.updateOnStart,
          updateEnabled: config.updateEnabled
        };
      }
      
      // Fallback when build IDs are unavailable: use the configured update cadence.
      if (config.autoUpdate && config.lastUpdate) {
        const lastUpdate = new Date(config.lastUpdate);
        const now = new Date();
        const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceUpdate >= config.updateInterval) {
          return {
            needsUpdate: true,
            reason: `Auto-update due (${Math.floor(hoursSinceUpdate)}h since last update)`,
            lastUpdate: config.lastUpdate,
            currentBuildId: localBuildId,
            latestBuildId,
            updateInterval: config.updateInterval,
            updateOnStart: config.updateOnStart,
            updateEnabled: config.updateEnabled
          };
        }
      }
      
      return {
        needsUpdate: false,
        reason: latestBuildId && localBuildId
          ? `Installed build ${localBuildId} matches Steam build ${latestBuildId}`
          : 'Up to date',
        lastUpdate: config.lastUpdate,
        currentBuildId: localBuildId,
        latestBuildId,
        updateInterval: config.updateInterval,
        updateOnStart: config.updateOnStart,
        updateEnabled: config.updateEnabled
      };
    } catch (error) {
      logger.error(`Error checking update status for server ${serverName}:`, error);
      return {
        needsUpdate: false,
        reason: 'Error checking update status',
        lastUpdate: null,
        error: error.message
      };
    }
  }

  async getLatestAsaBuildId() {
    const cacheTtlMs = 5 * 60 * 1000;
    if (this.latestBuildCache.buildId && (Date.now() - this.latestBuildCache.checkedAt) < cacheTtlMs) {
      return this.latestBuildCache.buildId;
    }

    try {
      const steamCmdExe = this.steamCmdManager.getExecutablePath();
      const command = `"${steamCmdExe}" +login anonymous +app_info_update 1 +app_info_print 2430930 +quit`;
      const { stdout } = await execAsync(command, {
        timeout: 120000,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      });
      const buildId = this.extractBuildId(stdout);

      if (buildId) {
        this.latestBuildCache = {
          buildId,
          checkedAt: Date.now()
        };
      }

      return buildId;
    } catch (error) {
      logger.warn(`Failed to fetch latest Steam build ID for ASA: ${error.message}`);
      return this.latestBuildCache.buildId;
    }
  }

  async getInstalledAsaBuildId(serverName) {
    try {
      const serverPath = await this.getServerInstallPath(serverName);
      if (!serverPath) {
        return null;
      }

      const manifestCandidates = [
        path.join(serverPath, 'steamapps', 'appmanifest_2430930.acf'),
        path.join(serverPath, 'appmanifest_2430930.acf')
      ];

      for (const candidate of manifestCandidates) {
        if (existsSync(candidate)) {
          const contents = await fs.readFile(candidate, 'utf8');
          const buildId = this.extractBuildId(contents);
          if (buildId) {
            return buildId;
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to read installed build ID for ${serverName}: ${error.message}`);
      return null;
    }
  }

  extractBuildId(rawText) {
    if (!rawText) {
      return null;
    }

    const matches = [...rawText.matchAll(/"buildid"\s+"(\d+)"/g)];
    if (matches.length === 0) {
      return null;
    }

    return matches[matches.length - 1][1];
  }

  async getServerInstallPath(serverName) {
    const standaloneServers = await this.listServers();
    const standalone = standaloneServers.find((server) => server.name === serverName);
    if (standalone?.path) {
      return standalone.path;
    }

    const clusters = await this.listClusters();
    for (const cluster of clusters) {
      const clusterServer = cluster?.servers?.find((server) => server.name === serverName);
      if (clusterServer?.serverPath) {
        return clusterServer.serverPath;
      }
      if (clusterServer) {
        return path.join(this.clustersPath, cluster.name, serverName);
      }
    }

    return null;
  }

  /**
   * Update server binaries and mark last update time
   */
  async updateServerBinaries(serverName, force = false) {
    try {
      logger.info(`Starting binary update for server ${serverName}${force ? ' (forced)' : ''}`);
      
      // Update the binaries
      await this.asaBinariesManager.updateForServer(serverName);
      
      // Update the last update time in database
      const { updateServerLastUpdate } = await import('../services/database.js');
      updateServerLastUpdate(serverName);
      
      logger.info(`Binary update completed for server ${serverName}`);
      return { success: true, message: 'Server binaries updated successfully' };
    } catch (error) {
      logger.error(`Error updating binaries for server ${serverName}:`, error);
      throw error;
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Download file from URL
   */
  async downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(destination);
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(destination).catch(() => {}); // Clean up on error
          reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
        file.on('error', (err) => {
          file.close();
          fs.unlink(destination).catch(() => {}); // Clean up on error
          reject(err);
        });
      }).on('error', (err) => {
        file.close();
        fs.unlink(destination).catch(() => {}); // Clean up on error
        reject(err);
      });
    });
  }
} 
