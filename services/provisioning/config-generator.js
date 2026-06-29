import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../utils/logger.js";
import { upsertServerConfig } from "./database.js";
import { gameFor } from "../games/index.js";
import { IniGenerators } from "./config-generator/ini-generators.js";
import { ConfigWriter } from "./config-generator/config-writer.js";
import { GlobalConfigManager } from "./config-generator/global-config-manager.js";
import { SettingsUpdater } from "./config-generator/settings-updater.js";

/**
 * Configuration Generator
 * Facade that delegates to specialized modules.
 */
export class ConfigGenerator {
  constructor(basePath, gameType = "ark") {
    this.basePath = basePath;
    this.gameType = gameType;
    this.serversPath = null;
    this.clustersPath = null;

    // Initialize modules
    this.iniGenerators = new IniGenerators(this);
    this.configWriter = new ConfigWriter(this);
    this.globalConfigManager = new GlobalConfigManager(this);
    this.settingsUpdater = new SettingsUpdater(this);
  }

  updatePaths(basePath, clustersPath, serversPath) {
    this.basePath = basePath;
    this.clustersPath = clustersPath;
    this.serversPath = serversPath;
  }

  setProgressCallback(cb) {
    this.emitProgress = cb;
  }

  // INI generation
  async generateGameUserSettings(serverConfig) {
    return this.iniGenerators.generateGameUserSettings(serverConfig);
  }

  async generateGameIni(serverConfig) {
    return this.iniGenerators.generateGameIni(serverConfig);
  }

  async generateEngineIni(serverConfig) {
    return this.iniGenerators.generateEngineIni(serverConfig);
  }

  // Config writing
  async createServerConfig(serverPath, serverConfig) {
    return this.configWriter.createServerConfig(serverPath, serverConfig);
  }

  async createServerConfigInCluster(clusterName, serverPath, serverConfig) {
    return this.configWriter.createServerConfigInCluster(clusterName, serverPath, serverConfig);
  }

  // Global config management
  async getFinalConfigsForServer(serverName) {
    return this.globalConfigManager.getFinalConfigsForServer(serverName);
  }

  mergeGlobalSettings(baseIni, globalIni) {
    return this.globalConfigManager.mergeGlobalSettings(baseIni, globalIni);
  }

  async getGlobalDynamicConfigUrl() {
    return this.globalConfigManager.getGlobalDynamicConfigUrl();
  }

  // Settings update
  async updateServerSettings(serverName, newSettings, options = {}) {
    return this.settingsUpdater.updateServerSettings(serverName, newSettings, options);
  }
}
