import { readdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import config from "../../config/index.js";
import logger from "../../utils/logger.js";

export class ServerInfoModule {
  constructor(service) {
    this.service = service;
  }

  get serverRootPath() {
    return config.asa.serverRootPath;
  }

  /**
   * Get server information including config status
   */
  async getServerInfo(serverName) {
    logger.info(`[getServerInfo] serverName: ${serverName}`);
    try {
      const serverInfo = await this.service.findServerConfigPath(serverName);
      if (!serverInfo) {
        throw new Error(`Server ${serverName} not found in any location`);
      }

      const serverPath =
        serverInfo.type === "standalone"
          ? join(this.serverRootPath, serverName)
          : join(
              this.serverRootPath,
              "cluster",
              serverInfo.clusterName,
              serverName,
            );

      logger.info(`[getServerInfo] serverPath: ${serverPath}`);
      const configDirPath = serverInfo.path;
      logger.info(`[getServerInfo] configDirPath: ${configDirPath}`);

      const { access } = await import("fs/promises");
      await access(serverPath);
      let configExists = false;
      let configFiles = [];
      try {
        await access(configDirPath);
        configExists = true;
        const files = await readdir(configDirPath);
        logger.info(
          `[getServerInfo] Files in configDirPath: ${files.join(", ")}`,
        );
        configFiles = files.filter(
          (file) =>
            file.endsWith(".ini") ||
            file.endsWith(".cfg") ||
            file.endsWith(".json"),
        );
        logger.info(
          `[getServerInfo] Filtered config files: ${configFiles.join(", ")}`,
        );
      } catch (error) {
        if (error.code === "ENOENT") {
          logger.info(
            `[getServerInfo] Config directory not found for server ${serverName}`,
          );
          configExists = false;
          configFiles = [];
        } else {
          throw error;
        }
      }

      // Look up game_type from database
      let gameType = "ark";
      try {
        const { getServerConfig } = await import("../database.js");
        const dbRow = getServerConfig(serverName);
        if (dbRow && dbRow.game_type) {
          gameType = dbRow.game_type;
        }
      } catch (dbError) {
        // DB unavailable — fall back to ARK default
        logger.warn(
          `[getServerInfo] DB lookup failed for ${serverName}: ${dbError.message}`,
        );
      }

      return {
        success: true,
        serverName,
        serverPath,
        configPath: configDirPath,
        configExists,
        configFiles,
        defaultFiles: this.service.defaultConfigFiles,
        hasGameIni: configFiles.includes("Game.ini"),
        hasGameUserSettings: configFiles.includes("GameUserSettings.ini"),
        serverType: serverInfo.type,
        clusterName: serverInfo.clusterName,
        gameType,
      };
    } catch (error) {
      logger.error(`[getServerInfo] Error: ${error.message}`);
      if (error.code === "ENOENT") {
        throw new Error(`Server ${serverName} not found`);
      }
      throw new Error(`Failed to get server info: ${error.message}`);
    }
  }
}
