/**
 * Server Provisioning Service (Refactored)
 * Thin facade that delegates to focused modules.
 */
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { existsSync, statSync } from "fs";
import os from "os";
import { createWriteStream } from "fs";
import https from "https";
import logger from "../utils/logger.js";
import config from "../config/index.js";
import { SteamCmdManager } from "./provisioning/steam-cmd-manager.js";
import { SystemInfo } from "./provisioning/system-info.js";
import { ASABinariesManager } from "./provisioning/asa-binaries-manager.js";
import { ConfigGenerator } from "./provisioning/config-generator.js";
import { ScriptGenerator } from "./provisioning/script-generator.js";
import { ClusterManager } from "./provisioning/cluster-manager.js";
import { ServerManager } from "./provisioning/server-manager.js";

// Module imports
import { SteamCmdModule } from "./server-provisioner/steamcmd-module.js";
import { ASABinariesModule } from "./server-provisioner/asa-binaries-module.js";
import { ConfigModule } from "./server-provisioner/config-module.js";
import { ScriptModule } from "./server-provisioner/script-module.js";
import { ServerModule } from "./server-provisioner/server-module.js";
import { ClusterModule } from "./server-provisioner/cluster-module.js";
import { SystemInfoModule } from "./server-provisioner/system-info-module.js";
import { UpdateModule } from "./server-provisioner/update-module.js";
import { UtilsModule } from "./server-provisioner/utils-module.js";

const execAsync = promisify(exec);

/**
 * Server Provisioning Service (Refactored)
 * Main orchestrator that delegates to specialized modules
 */
export class ServerProvisioner {
  constructor(gameType = "ark") {
    logger.info(
      `ServerProvisioner constructor - NATIVE_BASE_PATH env: ${process.env.NATIVE_BASE_PATH}`,
    );
    logger.info(
      `ServerProvisioner constructor - config.server.native.basePath: ${config.server.native.basePath}`,
    );

    this.gameType = gameType;
    this.basePath =
      config.server.native.basePath || process.env.NATIVE_BASE_PATH || "C:\ARK";
    logger.info(
      `ServerProvisioner constructor - final basePath: ${this.basePath}`,
    );

    // Updated paths for separate binary architecture
    this.serversPath =
      process.env.NATIVE_SERVERS_PATH ||
      (config.server &&
        config.server.native &&
        config.server.native.serversPath) ||
      (config.server && config.server.native && config.server.native.basePath
        ? path.join(config.server.native.basePath, "servers")
        : null);
    this.clustersPath =
      process.env.NATIVE_CLUSTERS_PATH ||
      (config.server &&
        config.server.native &&
        config.server.native.clustersPath) ||
      (config.server && config.server.native && config.server.native.basePath
        ? path.join(config.server.native.basePath, "clusters")
        : null);
    if (!this.serversPath || !this.clustersPath) {
      logger.error(
        "ServerProvisioner: Missing serversPath or clustersPath in configuration.",
      );
    }

    // Initialize managers
    this.steamCmdManager = new SteamCmdManager(this.basePath);
    this.systemInfo = new SystemInfo(
      this.basePath,
      this.clustersPath,
      this.serversPath,
    );
    this.asaBinariesManager = new ASABinariesManager(
      this.steamCmdManager,
      this.basePath,
      this.clustersPath,
      this.serversPath,
    );
    this.configGenerator = new ConfigGenerator(this.basePath);
    this.scriptGenerator = new ScriptGenerator(
      this.basePath,
      this.clustersPath,
      this.serversPath,
    );
    this.clusterManager = new ClusterManager(
      this.basePath,
      this.clustersPath,
      this.serversPath,
      this.asaBinariesManager,
      this.configGenerator,
      this.scriptGenerator,
    );
    this.serverManager = new ServerManager(
      this.basePath,
      this.clustersPath,
      this.serversPath,
      this.asaBinariesManager,
      this.configGenerator,
      this.scriptGenerator,
    );

    // Update paths in sub-managers
    this.configGenerator.updatePaths(
      this.basePath,
      this.clustersPath,
      this.serversPath,
    );

    // Update legacy properties for compatibility
    this.steamCmdPath = this.steamCmdManager.getInstallationPath();
    this.steamCmdExe = this.steamCmdManager.getExecutablePath();
    this.autoInstallSteamCmd =
      config.server.native.autoInstallSteamCmd !== false;
    this.emitProgress = null;
    this.latestBuildCache = {
      buildId: null,
      checkedAt: 0,
    };

    // Initialize modules
    this._steamcmd = new SteamCmdModule(this);
    this._asaBinaries = new ASABinariesModule(this);
    this._config = new ConfigModule(this);
    this._script = new ScriptModule(this);
    this._server = new ServerModule(this);
    this._cluster = new ClusterModule(this);
    this._systemInfo = new SystemInfoModule(this);
    this._update = new UpdateModule(this);
    this._utils = new UtilsModule(this);

    logger.info(`ServerProvisioner initialized successfully`);
    logger.info(`Servers path: ${this.serversPath}`);
    logger.info(`Clusters path: ${this.clustersPath}`);
    logger.info(`SteamCMD path: ${this.steamCmdPath}`);
  }

  // ========================================
  // UTILITY DELEGATIONS
  // ========================================

  async execForeground(command, options = {}) {
    return await this._utils.execForeground(command, options);
  }

  async createDirectories() {
    return await this._utils.createDirectories();
  }

  async initialize() {
    return await this._utils.initialize();
  }

  setProgressCallback(cb) {
    this._utils.setProgressCallback(cb);
  }

  async downloadFile(url, destination) {
    return await this._utils.downloadFile(url, destination);
  }

  // ========================================
  // STEAMCMD DELEGATIONS
  // ========================================

  async checkSteamCmdAvailability() {
    return await this._steamcmd.checkSteamCmdAvailability();
  }

  async isSteamCmdInstalled() {
    return await this._steamcmd.isSteamCmdInstalled();
  }

  async installSteamCmd(foreground = false) {
    return await this._steamcmd.installSteamCmd(foreground);
  }

  async findExistingSteamCmd() {
    return await this._steamcmd.findExistingSteamCmd();
  }

  async ensureSteamCmd() {
    return await this._steamcmd.ensureSteamCmd();
  }

  // ========================================
  // ASA BINARIES DELEGATIONS
  // ========================================

  async checkASABinariesAvailability() {
    return await this._asaBinaries.checkASABinariesAvailability();
  }

  async installASABinaries(foreground = false) {
    return await this._asaBinaries.installASABinaries(foreground);
  }

  async ensureASABinaries() {
    return await this._asaBinaries.ensureASABinaries();
  }

  async updateASABinaries() {
    return await this._asaBinaries.updateASABinaries();
  }

  async installASABinariesForServer(serverName) {
    return await this._asaBinaries.installASABinariesForServer(serverName);
  }

  async installASABinariesForServerInCluster(
    clusterName,
    serverName,
    foreground = false,
  ) {
    return await this._asaBinaries.installASABinariesForServerInCluster(
      clusterName,
      serverName,
      foreground,
    );
  }

  async updateServerBinaries(serverName) {
    return await this._update.updateServerBinaries(serverName);
  }

  async updateAllServerBinaries() {
    return await this._asaBinaries.updateAllServerBinaries();
  }

  // ========================================
  // CONFIGURATION DELEGATIONS
  // ========================================

  async createServerConfig(serverPath, serverConfig) {
    return await this._config.createServerConfig(serverPath, serverConfig);
  }

  async createServerConfigInCluster(clusterName, serverPath, serverConfig) {
    return await this._config.createServerConfigInCluster(
      clusterName,
      serverPath,
      serverConfig,
    );
  }

  async getFinalConfigsForServer(serverName) {
    return await this._config.getFinalConfigsForServer(serverName);
  }

  async updateServerSettings(serverName, newSettings, options = {}) {
    return await this._config.updateServerSettings(
      serverName,
      newSettings,
      options,
    );
  }

  // ========================================
  // SCRIPT GENERATION DELEGATIONS
  // ========================================

  async createStartScript(serverPath, serverConfig) {
    return await this._script.createStartScript(serverPath, serverConfig);
  }

  async createStopScript(serverPath, serverName) {
    return await this._script.createStopScript(serverPath, serverName);
  }

  async createStartScriptInCluster(clusterName, serverPath, serverConfig) {
    return await this._script.createStartScriptInCluster(
      clusterName,
      serverPath,
      serverConfig,
    );
  }

  async createStopScriptInCluster(clusterName, serverPath, serverName) {
    return await this._script.createStopScriptInCluster(
      clusterName,
      serverPath,
      serverName,
    );
  }

  async regenerateServerStartScript(serverName) {
    return await this._script.regenerateServerStartScript(serverName);
  }

  async regenerateAllClusterStartScripts() {
    return await this._script.regenerateAllClusterStartScripts();
  }

  // ========================================
  // SERVER MANAGEMENT DELEGATIONS
  // ========================================

  async createServer(serverConfig) {
    return await this._server.createServer(serverConfig);
  }

  async listServers() {
    return await this._server.listServers();
  }

  async deleteServer(serverName) {
    return await this._server.deleteServer(serverName);
  }

  async backupServer(serverName, options = {}) {
    return await this._server.backupServer(serverName, options);
  }

  async restoreServer(serverName, sourcePath, options = {}) {
    return await this._server.restoreServer(serverName, sourcePath, options);
  }

  async listServerBackups() {
    return await this._server.listServerBackups();
  }

  // ========================================
  // CLUSTER MANAGEMENT DELEGATIONS
  // ========================================

  async createCluster(clusterConfig, foreground = false) {
    return await this._cluster.createCluster(clusterConfig, foreground);
  }

  async listClusters() {
    return await this._cluster.listClusters();
  }

  async deleteCluster(clusterName, options = {}) {
    return await this._cluster.deleteCluster(clusterName, options);
  }

  async startCluster(clusterName) {
    return await this._cluster.startCluster(clusterName);
  }

  async backupCluster(clusterName, customDestination = null) {
    return await this._cluster.backupCluster(clusterName, customDestination);
  }

  async restoreCluster(clusterName, sourcePath) {
    return await this._cluster.restoreCluster(clusterName, sourcePath);
  }

  async validateClusterConfig(config) {
    return await this._cluster.validateClusterConfig(config);
  }

  async listClusterBackups(clusterName) {
    return await this._cluster.listClusterBackups(clusterName);
  }

  // ========================================
  // SYSTEM INFO DELEGATIONS
  // ========================================

  async getSystemInfo() {
    return await this._systemInfo.getSystemInfo();
  }

  formatBytes(bytes, decimals = 2) {
    return this._systemInfo.formatBytes(bytes, decimals);
  }

  // ========================================
  // UPDATE CONFIGURATION DELEGATIONS
  // ========================================

  async getServerUpdateConfig(serverName) {
    return await this._update.getServerUpdateConfig(serverName);
  }

  async updateServerUpdateConfig(serverName, config) {
    return await this._update.updateServerUpdateConfig(serverName, config);
  }

  async checkServerUpdateStatus(serverName) {
    return await this._update.checkServerUpdateStatus(serverName);
  }

  async getLatestAsaBuildId() {
    return await this._update.getLatestAsaBuildId();
  }

  async getInstalledAsaBuildId(serverName) {
    return await this._update.getInstalledAsaBuildId(serverName);
  }

  extractBuildId(rawText) {
    return this._update.extractBuildId(rawText);
  }

  async getServerInstallPath(serverName) {
    return await this._update.getServerInstallPath(serverName);
  }
}
