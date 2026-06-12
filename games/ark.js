/**
 * ARK: Survival Ascended Game Adapter
 *
 * Ports all ARK-specific knowledge out of the generic services and into
 * the game adapter pattern.
 */
import { GameAdapter } from "./game-adapter.js";
import { queryRegistry } from "../services/query/index.js";
import logger from "../utils/logger.js";

export class ArkAdapter extends GameAdapter {
  get id() {
    return "ark";
  }
  get name() {
    return "ARK: Survival Ascended";
  }
  get binaryName() {
    return "ArkAscendedServer.exe";
  }
  get processNames() {
    return ["ArkAscendedServer", "ArkAscendedServer.exe"];
  }
  get steamAppId() {
    return "2430930";
  }
  get configFiles() {
    return ["Game.ini", "GameUserSettings.ini", "Engine.ini"];
  }
  get configSubPath() {
    return "Config/WindowsServer";
  }
  get defaultPorts() {
    return { game: 7777, query: 27015, rcon: 32330 };
  }

  // ARK-specific capabilities
  get canCluster() {
    return true;
  }
  get supportsSteamWorkshop() {
    return true;
  }
  get supportsRcon() {
    return true;
  }
  get supportsQuery() {
    return true;
  }

  // -----------------------------------------------------------------------
  // Config generation — ported from config-generator.js
  // -----------------------------------------------------------------------

  async generateConfigFiles(opts = {}) {
    const {
      serverName,
      map = "TheIsland",
      maxPlayers = 70,
      adminPassword,
      serverPassword,
      rconPassword,
      clusterId,
      clusterPassword,
      disableBattleEye = false,
    } = opts;

    const gameUserSettings = this._generateGameUserSettings({
      serverName,
      map,
      maxPlayers,
      adminPassword,
      serverPassword,
      rconPassword,
      clusterId,
      clusterPassword,
      disableBattleEye,
    });

    const gameIni = this._generateGameIni(opts);
    const engineIni = this._generateEngineIni(opts);

    return {
      "Game.ini": gameIni,
      "GameUserSettings.ini": gameUserSettings,
      "Engine.ini": engineIni,
    };
  }

  _generateGameUserSettings(opts) {
    const {
      serverName,
      map,
      maxPlayers,
      adminPassword,
      serverPassword,
      rconPassword,
      clusterId,
      clusterPassword,
      disableBattleEye,
    } = opts;

    const sessionName = serverName || "ASA Server";
    const settings = [
      "[/script/engine.gamesession]",
      `MaxPlayers=${maxPlayers || 70}`,
      `Port=${opts.gamePort || 7777}`,
      `QueryPort=${opts.queryPort || 27015}`,
      "",
      "[SessionSettings]",
      `SessionName=${sessionName}`,
      "",
      "[/script/shootergame.shootergamemode]",
      `ServerAdminPassword=${adminPassword || ""}`,
      `ServerPassword=${serverPassword || ""}`,
      ...(disableBattleEye ? ["bUseBattlEye=False"] : []),
      "",
      "[ServerSettings]",
      "bUseSingleplayerSettings=false",
      ...(clusterId ? [`ClusterIdOverride=${clusterId}`] : []),
      ...(clusterPassword ? [`ClusterDirOverride=${clusterPassword}`] : []),
      "",
      "[RCON]",
      "RCONEnabled=True",
      `RCONPort=${opts.rconPort || 32330}`,
      ...(rconPassword ? [`ServerAdminPassword=${rconPassword}`] : []),
      "",
    ];

    return settings.join("\n");
  }

  _generateGameIni(_opts) {
    return "[/script/shootergame.shootergamemode]\n";
  }

  _generateEngineIni(_opts) {
    return "";
  }

  // -----------------------------------------------------------------------
  // Start script — ported from script-generator.js
  // -----------------------------------------------------------------------

  async buildStartScript(opts) {
    const {
      binariesPath,
      configsPath,
      savesPath,
      logsPath,
      gamePort = 7777,
      queryPort = 27015,
      rconPort = 32330,
      maxPlayers = 70,
      adminPassword = "",
      serverPassword = "",
      rconPassword = "",
      clusterId = "",
      clusterPassword = "",
      map = "TheIsland",
      modsArg = "",
      disableBattleEye = false,
      customDynamicConfigUrl = "",
    } = opts;

    const exeRelPath = "ShooterGame/Binaries/Win64/ArkAscendedServer.exe";
    const exePath = `"${binariesPath}/${exeRelPath}"`;

    const battleEyeFlag = disableBattleEye ? " -NoBattlEye" : "";
    const modFlag = modsArg ? ` -mods=${modsArg}` : "";

    const dynamicConfigFlag = customDynamicConfigUrl
      ? ` -UseDynamicConfig=${customDynamicConfigUrl}`
      : " -UseDynamicConfig";

    let clusterFlags = "";
    if (clusterId) {
      clusterFlags = ` -clusterid=${clusterId}`;
      if (clusterPassword)
        clusterFlags += ` -ClusterPassword=${clusterPassword}`;
    }

    // Query params for the session URL
    const queryParams = [
      `Port=${gamePort}`,
      `QueryPort=${queryPort}`,
      `RCONEnabled=True`,
      `RCONPort=${rconPort}`,
      `MaxPlayers=${maxPlayers}`,
      `ServerAdminPassword=${adminPassword}`,
      `ServerPassword=${serverPassword}`,
      `RCONServerGameAdminPassword=${rconPassword}`,
      ...(disableBattleEye ? ["NoBattlEye"] : []),
    ];
    const queryString = queryParams.join("?");

    // NOTE: cluster-specific scripts also append ClusterIdOverride & ClusterDirOverride
    return [
      `@echo off`,
      `title ${opts.serverName || "ARK Server"} - ASA Server`,
      `cd /d "${binariesPath}"`,
      ``,
      `:start`,
      `${exePath} ${map}?${queryString}${modFlag}${clusterFlags}${battleEyeFlag}${dynamicConfigFlag}`,
      ``,
      `echo Restarting server...`,
      `timeout /t 5`,
      `goto start`,
    ].join("\n");
  }

  async buildStopScript(opts = {}) {
    const procNames = opts.processNames || this.processNames;
    const psName = procNames[0]; // head for PS match
    return [
      `@echo off`,
      `echo Stopping ARK server...`,
      ``,
      `:: Try graceful RCON shutdown first`,
      `echo Attempting graceful shutdown via RCON...`,
      ``,
      `:: Fallback to process kill`,
      `echo Force stopping process: ${psName}`,
      `taskkill /F /IM "${psName}.exe" 2>nul`,
      `taskkill /F /IM "${psName}" 2>nul`,
      ``,
      `echo Server stopped.`,
    ].join("\n");
  }

  // -----------------------------------------------------------------------
  // Log paths — ARK-specific
  // -----------------------------------------------------------------------

  getLogSubDirectories(options = {}) {
    return [
      'ShooterGame/Saved/Logs',
      'Saved/Logs',
      'logs',
      '.',
    ];
  }

  getLogFilePatterns() {
    return ['shootergame', 'windowsserver', 'servergame', 'crashcallstack'];
  }

  // -----------------------------------------------------------------------
  // Server browser query (EOS-based)
  // -----------------------------------------------------------------------

  async queryServer(sessionName) {
    const provider = queryRegistry.get("eos");
    if (!provider) {
      logger.warn("[ArkAdapter] EOS query provider not registered");
      return null;
    }
    return await provider.query(sessionName);
  }

  async queryServerAddress(host, port) {
    const provider = queryRegistry.get("eos");
    if (!provider) {
      logger.warn("[ArkAdapter] EOS query provider not registered");
      return null;
    }
    return await provider.queryAddress(host, port);
  }

  // -----------------------------------------------------------------------
  // Binary installation — ported from asa-binaries-manager.js
  // -----------------------------------------------------------------------

  /**
   * Return the SteamCMD script content for installing/updating ARK binaries.
   * @param {string} installDir
   * @param {string} [branch]
   * @returns {string}
   */
  buildInstallScript(installDir, branch) {
    const lines = [
      "@ShutdownOnFailedCommand 1",
      "@NoPromptForPassword 1",
      `force_install_dir "${installDir}"`,
      "login anonymous",
      `app_update ${this.steamAppId}`,
    ];
    if (branch) {
      lines.push(`-beta ${branch}`);
    }
    lines.push("quit");
    return lines.join("\n");
  }

  /**
   * Relative exe path within the install directory.
   * @returns {string}
   */
  get binaryExeRelPath() {
    return "ShooterGame/Binaries/Win64/ArkAscendedServer.exe";
  }
}

// Singleton
export const arkAdapter = new ArkAdapter();
