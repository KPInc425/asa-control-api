import { readFile, writeFile, access, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import logger from "../../utils/logger.js";

export class ConfigFilesModule {
  constructor(service) {
    this.service = service;
  }

  /**
   * Create default config files if they don't exist
   */
  async ensureDefaultConfigs(serverName) {
    const serverInfo = await this.service.findServerConfigPath(serverName);
    if (!serverInfo) {
      throw new Error(`Server ${serverName} not found in any location`);
    }

    const configDirPath = serverInfo.path;

    // Create directory if it doesn't exist
    if (!existsSync(configDirPath)) {
      await this.service.createDirectory(configDirPath);
    }

    // Default Game.ini content
    const defaultGameIni = `[/script/shootergame.shootergamemode]
MaxPlayers=70
ServerPassword=
ServerAdminPassword=admin123
AllowThirdPersonPlayer=True
AlwaysNotifyPlayerLeft=True
AlwaysNotifyPlayerJoined=True
ServerCrosshair=True
ServerForceNoHUD=False
ShowMapPlayerLocation=True
EnablePvPGamma=False
AllowFlyerCarryPvE=True
`;

    // Default GameUserSettings.ini content
    const defaultGameUserSettings = `[ServerSettings]
ServerPassword=
ServerAdminPassword=admin123
MaxPlayers=70
ReservedPlayerSlots=0
AllowThirdPersonPlayer=True
AlwaysNotifyPlayerLeft=True
AlwaysNotifyPlayerJoined=True
ServerCrosshair=True
ServerForceNoHUD=False
ShowMapPlayerLocation=True
EnablePvPGamma=False
AllowFlyerCarryPvE=True
`;

    const configsToCreate = [
      { fileName: "Game.ini", content: defaultGameIni },
      { fileName: "GameUserSettings.ini", content: defaultGameUserSettings },
    ];

    for (const config of configsToCreate) {
      const filePath = join(configDirPath, config.fileName);
      if (!existsSync(filePath)) {
        try {
          await writeFile(filePath, config.content, "utf8");
          logger.info(
            `Created default ${config.fileName} for server ${serverName}: ${filePath}`,
          );
        } catch (error) {
          logger.error(
            `Failed to create default ${config.fileName} for server ${serverName}:`,
            error,
          );
        }
      }
    }
  }

  /**
   * Get config file contents for a specific server
   */
  async getConfigFile(serverName, fileName = "GameUserSettings.ini") {
    console.log(
      `[getConfigFile] Called with serverName: ${serverName}, fileName: ${fileName}`,
    );
    try {
      const serverInfo = await this.service.findServerConfigPath(serverName);
      if (!serverInfo) {
        throw new Error(`Server ${serverName} not found in any location`);
      }

      const filePath = join(serverInfo.path, fileName);

      // Check if file exists
      try {
        await access(filePath);
      } catch (error) {
        if (error.code === "ENOENT") {
          logger.info(`Config file not found: ${filePath}`);

          // Only create Game.ini if GameUserSettings.ini already exists
          if (fileName === "Game.ini") {
            const gameUserSettingsPath = join(
              serverInfo.path,
              "GameUserSettings.ini",
            );
            try {
              await access(gameUserSettingsPath);
              await this.createDefaultConfigFile(serverInfo, fileName);
            } catch (gameUserSettingsError) {
              throw new Error(
                `Cannot create Game.ini without GameUserSettings.ini for server ${serverName}`,
              );
            }
          } else {
            throw new Error(
              `Config file not found: ${fileName} for server ${serverName}`,
            );
          }

          // Try to access the file again after creation
          try {
            await access(filePath);
          } catch (secondError) {
            logger.error(
              `Failed to create or access config file: ${filePath}`,
              secondError,
            );
            throw new Error(
              `Config file not found and could not be created: ${fileName} for server ${serverName}`,
            );
          }
        } else {
          throw error;
        }
      }

      const content = await readFile(filePath, "utf8");
      logger.info(`Config file read: ${filePath}`);

      return {
        success: true,
        content,
        filePath,
        fileName,
        serverName,
        configPath: serverInfo.path,
        serverType: serverInfo.type,
        clusterName: serverInfo.clusterName,
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        logger.warn(
          `Config file not found for server ${serverName}: ${fileName}`,
        );
        throw new Error(
          `Config file not found: ${fileName} for server ${serverName}`,
        );
      }

      logger.error(
        `Error reading config file ${fileName} for server ${serverName}:`,
        error,
      );
      throw new Error(`Failed to read config file: ${error.message}`);
    }
  }

  /**
   * Create a single default config file
   */
  async createDefaultConfigFile(serverInfo, fileName) {
    const configDirPath = serverInfo.path;

    // Create directory if it doesn't exist
    if (!existsSync(configDirPath)) {
      await this.service.createDirectory(configDirPath);
    }

    // Default Game.ini content
    const defaultGameIni = `[/script/shootergame.shootergamemode]
MaxPlayers=70
ServerPassword=
ServerAdminPassword=admin123
AllowThirdPersonPlayer=True
AlwaysNotifyPlayerLeft=True
AlwaysNotifyPlayerJoined=True
ServerCrosshair=True
ServerForceNoHUD=False
ShowMapPlayerLocation=True
EnablePvPGamma=False
AllowFlyerCarryPvE=True
`;

    // Default GameUserSettings.ini content
    const defaultGameUserSettings = `[ServerSettings]
ServerPassword=
ServerAdminPassword=admin123
MaxPlayers=70
ReservedPlayerSlots=0
AllowThirdPersonPlayer=True
AlwaysNotifyPlayerLeft=True
AlwaysNotifyPlayerJoined=True
ServerCrosshair=True
ServerForceNoHUD=False
ShowMapPlayerLocation=True
EnablePvPGamma=False
AllowFlyerCarryPvE=True
`;

    const content =
      fileName === "Game.ini" ? defaultGameIni : defaultGameUserSettings;
    const filePath = join(configDirPath, fileName);

    try {
      await writeFile(filePath, content, "utf8");
      logger.info(
        `Created default ${fileName} for server ${serverInfo.serverName}: ${filePath}`,
      );
    } catch (error) {
      logger.error(
        `Failed to create default ${fileName} for server ${serverInfo.serverName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Update config file contents for a specific server
   */
  async updateConfigFile(
    serverName,
    content,
    fileName = "GameUserSettings.ini",
  ) {
    try {
      const serverInfo = await this.service.findServerConfigPath(serverName);
      if (!serverInfo) {
        throw new Error(`Server ${serverName} not found in any location`);
      }

      const filePath = join(serverInfo.path, fileName);

      // Validate the file path is within the allowed directory
      this.service.validateConfigPath(filePath);

      await writeFile(filePath, content, "utf8");
      logger.info(`Config file updated: ${filePath}`);

      return {
        success: true,
        message: `Config file ${fileName} updated successfully for server ${serverName}`,
        filePath,
        fileName,
        serverName,
        configPath: serverInfo.path,
        serverType: serverInfo.type,
        clusterName: serverInfo.clusterName,
      };
    } catch (error) {
      logger.error(
        `Error updating config file ${fileName} for server ${serverName}:`,
        error,
      );
      throw new Error(`Failed to update config file: ${error.message}`);
    }
  }

  /**
   * List available config files for a server
   */
  async listConfigFiles(serverName) {
    logger.info(`[listConfigFiles] serverName: ${serverName}`);
    try {
      const serverInfo = await this.service.findServerConfigPath(serverName);
      if (!serverInfo) {
        logger.warn(
          `[listConfigFiles] Server ${serverName} not found in any location`,
        );
        return {
          success: true,
          files: [],
          serverName,
          path: null,
          defaultFiles: this.service.defaultConfigFiles,
          message: "Server not found",
        };
      }

      const configDirPath = serverInfo.path;
      logger.info(`[listConfigFiles] configDirPath: ${configDirPath}`);

      try {
        await access(configDirPath);
      } catch (error) {
        if (error.code === "ENOENT") {
          logger.info(
            `[listConfigFiles] Config directory not found for server ${serverName}`,
          );
          return {
            success: true,
            files: [],
            serverName,
            path: configDirPath,
            defaultFiles: this.service.defaultConfigFiles,
            message: "No config directory found",
          };
        } else {
          throw error;
        }
      }

      const files = await readdir(configDirPath);
      logger.info(
        `[listConfigFiles] Files in configDirPath: ${files.join(", ")}`,
      );
      const configFiles = files.filter(
        (file) =>
          file.endsWith(".ini") ||
          file.endsWith(".cfg") ||
          file.endsWith(".json"),
      );
      logger.info(
        `[listConfigFiles] Filtered config files: ${configFiles.join(", ")}`,
      );

      return {
        success: true,
        files: configFiles,
        serverName,
        path: configDirPath,
        defaultFiles: this.service.defaultConfigFiles,
        serverType: serverInfo.type,
        clusterName: serverInfo.clusterName,
      };
    } catch (error) {
      logger.error(`[listConfigFiles] Error: ${error.message}`);
      throw new Error(`Failed to list config files: ${error.message}`);
    }
  }
}
