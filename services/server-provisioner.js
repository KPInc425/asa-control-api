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
