import config from "../config/index.js";

import { ServerDiscoveryModule } from "./config/server-discovery.js";
import { ConfigFilesModule } from "./config/config-files.js";
import { UpdateLockModule } from "./config/update-lock.js";
import { ServerInfoModule } from "./config/server-info.js";
import { IniParserModule } from "./config/ini-parser.js";
import { FileUtilsModule } from "./config/file-utils.js";

class ConfigService {
  constructor() {
    this.updateLockPath = config.asa.updateLockPath;
    this.defaultConfigFiles = config.asa.defaultConfigFiles;

    this.serverDiscovery = new ServerDiscoveryModule(this);
    this.configFiles = new ConfigFilesModule(this);
    this.updateLock = new UpdateLockModule(this);
    this.serverInfo = new ServerInfoModule(this);
    this.iniParser = new IniParserModule(this);
    this.fileUtils = new FileUtilsModule(this);
  }

  // ── serverRootPath ──────────────────────────────────────────────
  get serverRootPath() {
    return this.serverDiscovery.serverRootPath;
  }

  // ── ServerDiscoveryModule ───────────────────────────────────────
  async findServerConfigPath(serverName) {
    return this.serverDiscovery.findServerConfigPath(serverName);
  }

  async getConfigFilePath(serverName, fileName = "GameUserSettings.ini") {
    return this.serverDiscovery.getConfigFilePath(serverName, fileName);
  }

  async getConfigDirPath(serverName) {
    return this.serverDiscovery.getConfigDirPath(serverName);
  }

  async listServers() {
    return this.serverDiscovery.listServers();
  }

  // ── ConfigFilesModule ──────────────────────────────────────────
  async ensureDefaultConfigs(serverName) {
    return this.configFiles.ensureDefaultConfigs(serverName);
  }

  async getConfigFile(serverName, fileName = "GameUserSettings.ini") {
    return this.configFiles.getConfigFile(serverName, fileName);
  }

  async createDefaultConfigFile(serverInfo, fileName) {
    return this.configFiles.createDefaultConfigFile(serverInfo, fileName);
  }

  async updateConfigFile(
    serverName,
    content,
    fileName = "GameUserSettings.ini",
  ) {
    return this.configFiles.updateConfigFile(serverName, content, fileName);
  }

  async listConfigFiles(serverName) {
    return this.configFiles.listConfigFiles(serverName);
  }

  // ── UpdateLockModule ───────────────────────────────────────────
  async getUpdateLockStatus() {
    return this.updateLock.getUpdateLockStatus();
  }

  async createUpdateLock(reason = "Manual lock") {
    return this.updateLock.createUpdateLock(reason);
  }

  async removeUpdateLock() {
    return this.updateLock.removeUpdateLock();
  }

  // ── ServerInfoModule ───────────────────────────────────────────
  async getServerInfo(serverName) {
    return this.serverInfo.getServerInfo(serverName);
  }

  // ── IniParserModule ─────────────────────────────────────────────
  parseIniContent(content) {
    return this.iniParser.parseIniContent(content);
  }

  stringifyIniContent(parsedContent) {
    return this.iniParser.stringifyIniContent(parsedContent);
  }

  // ── FileUtilsModule ─────────────────────────────────────────────
  async createDirectory(dirPath) {
    return this.fileUtils.createDirectory(dirPath);
  }

  async deleteFile(filePath) {
    return this.fileUtils.deleteFile(filePath);
  }

  validateConfigPath(filePath) {
    return this.fileUtils.validateConfigPath(filePath);
  }
}

export default new ConfigService();
