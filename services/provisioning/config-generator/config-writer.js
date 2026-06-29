import fs from "fs/promises";
import path from "path";
import logger from "../../utils/logger.js";
import { gameFor } from "../../games/index.js";

/**
 * Server configuration file writer (standalone and cluster)
 */
export class ConfigWriter {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Create server configuration files for standalone server
   */
  async createServerConfig(serverPath, serverConfig) {
    try {
      const configsPath = path.join(
        serverPath,
        "ShooterGame",
        "Saved",
        "Config",
        "WindowsServer",
      );
      await fs.mkdir(configsPath, { recursive: true });

      const finalConfigs = await this.parent.getFinalConfigsForServer(
        serverConfig.name,
      );

      const baseGameIni = await this.parent.generateGameIni(serverConfig);
      const baseGameUserSettings = await this.parent.generateGameUserSettings(serverConfig);
      const baseEngineIni = await this.parent.generateEngineIni(serverConfig);

      const gameIni = this.parent.mergeGlobalSettings(baseGameIni, finalConfigs.gameIni);
      const gameUserSettings = this.parent.mergeGlobalSettings(baseGameUserSettings, finalConfigs.gameUserSettings);

      await fs.writeFile(path.join(configsPath, "Game.ini"), gameIni);
      await fs.writeFile(
        path.join(configsPath, "GameUserSettings.ini"),
        gameUserSettings,
      );
      await fs.writeFile(path.join(configsPath, "Engine.ini"), baseEngineIni);

      const gameType = serverConfig.gameType || this.parent.gameType || "ark";
      const adapter = gameFor(gameType);
      const defaultPorts = adapter.defaultPorts;

      const globalDynamicConfigUrl = await this.parent.getGlobalDynamicConfigUrl();
      const effectiveDynamicConfigUrl =
        serverConfig.customDynamicConfigUrl || globalDynamicConfigUrl;

      const serverConfigFile = {
        name: serverConfig.name,
        map: serverConfig.map || "TheIsland",
        gameType: gameType,
        gamePort: serverConfig.gamePort || defaultPorts.game,
        queryPort: serverConfig.queryPort || defaultPorts.query,
        rconPort: serverConfig.rconPort || defaultPorts.rcon,
        maxPlayers: serverConfig.maxPlayers || 70,
        adminPassword: serverConfig.adminPassword || "admin123",
        serverPassword: serverConfig.serverPassword || "",
        rconPassword: serverConfig.adminPassword || "admin123",
        clusterId: serverConfig.clusterId || "",
        clusterPassword: serverConfig.clusterPassword || "",
        customDynamicConfigUrl: effectiveDynamicConfigUrl,
        disableBattleEye: serverConfig.disableBattleEye || false,
        created: new Date().toISOString(),
        binariesPath: path.join(serverPath, "ShooterGame", "Binaries", "Win64"),
        configsPath: configsPath,
        savesPath: path.join(serverPath, "ShooterGame", "Saved", "SaveGames"),
        logsPath: path.join(serverPath, "ShooterGame", "Saved", "Logs"),
        mods: serverConfig.mods || [],
      };

      await fs.writeFile(
        path.join(serverPath, "server-config.json"),
        JSON.stringify(serverConfigFile, null, 2),
      );

      logger.info(`Server configuration created for: ${serverConfig.name}`);
    } catch (error) {
      logger.error(
        `Failed to create server configuration for ${serverConfig.name}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Create server configuration files in cluster
   */
  async createServerConfigInCluster(clusterName, serverPath, serverConfig) {
    try {
      const configsPath = path.join(
        serverPath,
        "ShooterGame",
        "Saved",
        "Config",
        "WindowsServer",
      );
      const binariesPath = path.join(
        serverPath,
        "ShooterGame",
        "Binaries",
        "Win64",
      );

      await fs.mkdir(configsPath, { recursive: true });

      const finalConfigs = await this.parent.getFinalConfigsForServer(
        serverConfig.name,
      );

      const baseGameIni = await this.parent.generateGameIni(serverConfig);
      const baseGameUserSettings = await this.parent.generateGameUserSettings(serverConfig);
      const baseEngineIni = await this.parent.generateEngineIni(serverConfig);

      const gameIni = this.parent.mergeGlobalSettings(baseGameIni, finalConfigs.gameIni);
      const gameUserSettings = this.parent.mergeGlobalSettings(baseGameUserSettings, finalConfigs.gameUserSettings);

      await fs.writeFile(path.join(configsPath, "Game.ini"), gameIni);
      await fs.writeFile(
        path.join(configsPath, "GameUserSettings.ini"),
        gameUserSettings,
      );
      await fs.writeFile(path.join(configsPath, "Engine.ini"), baseEngineIni);

      const gameType = serverConfig.gameType || this.parent.gameType || "ark";
      const adapter = gameFor(gameType);
      const defaultPorts = adapter.defaultPorts;

      const globalDynamicConfigUrl = await this.parent.getGlobalDynamicConfigUrl();
      const effectiveDynamicConfigUrl =
        serverConfig.customDynamicConfigUrl || globalDynamicConfigUrl;

      const serverConfigFile = {
        name: serverConfig.name,
        map: serverConfig.map || "TheIsland",
        gameType: gameType,
        gamePort: serverConfig.gamePort || defaultPorts.game,
        queryPort: serverConfig.queryPort || defaultPorts.query,
        rconPort: serverConfig.rconPort || defaultPorts.rcon,
        maxPlayers: serverConfig.maxPlayers || 70,
        adminPassword: serverConfig.adminPassword || "admin123",
        serverPassword:
          serverConfig.password || serverConfig.serverPassword || "",
        rconPassword: serverConfig.adminPassword || "admin123",
        clusterId: serverConfig.clusterId || clusterName,
        clusterPassword: serverConfig.clusterPassword || "",
        customDynamicConfigUrl: effectiveDynamicConfigUrl,
        disableBattleEye: serverConfig.disableBattleEye || false,
        created: new Date().toISOString(),
        binariesPath: binariesPath,
        configsPath: configsPath,
        savesPath: path.join(serverPath, "ShooterGame", "Saved", "SaveGames"),
        logsPath: path.join(serverPath, "ShooterGame", "Saved", "Logs"),
        gameUserSettings: serverConfig.gameUserSettings,
        gameIni: serverConfig.gameIni,
        mods: serverConfig.mods || [],
      };

      await fs.writeFile(
        path.join(serverPath, "server-config.json"),
        JSON.stringify(serverConfigFile, null, 2),
      );

      logger.info(
        `Server configuration created for: ${serverConfig.name} in cluster ${clusterName}`,
      );
    } catch (error) {
      logger.error(
        `Failed to create server configuration for ${serverConfig.name} in cluster ${clusterName}:`,
        error,
      );
      throw error;
    }
  }
}
