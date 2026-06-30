import fs from "fs/promises";
import path from "path";
import logger from "../../../utils/logger.js";
import config from "../../../config/index.js";
import { gameFor, gameRegistry } from "../../../games/index.js";

/**
 * Start script creation (standalone and cluster)
 */
export class StartScripts {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Create startup script for a standalone server
   */
  async createStartScript(serverPath, serverConfig) {
    try {
      await gameRegistry.ensureBuiltins();

      const gameType = serverConfig.gameType || this.parent.gameType || "ark";
      const adapter = gameFor(gameType);

      // Delegate to game adapter for non-ARK games
      if (adapter.id !== "ark") {
        logger.info(
          `Delegating start script creation to adapter: ${adapter.id}`,
        );

        const binariesPath = path.join(serverPath, "binaries");
        const configsPath = path.join(serverPath, "configs");
        const savesPath = path.join(serverPath, "saves");
        const logsPath = path.join(serverPath, "logs");

        const { NativeServerManager } = await import("../server-manager.js");
        const serverManager = new NativeServerManager();
        const finalMods = await serverManager.getFinalModListForServer(
          serverConfig.name,
        );
        const modsArg =
          finalMods && finalMods.length > 0 ? finalMods.join(",") : "";

        const scriptContent = await adapter.buildStartScript({
          serverName: serverConfig.name,
          binariesPath,
          configsPath,
          savesPath,
          logsPath,
          gamePort: serverConfig.gamePort || 7777,
          queryPort: serverConfig.queryPort || 27015,
          rconPort: serverConfig.rconPort || 32330,
          maxPlayers: serverConfig.maxPlayers || 70,
          adminPassword: serverConfig.adminPassword || "",
          serverPassword: serverConfig.serverPassword || "",
          rconPassword: serverConfig.rconPassword || "",
          clusterId: serverConfig.clusterId || "",
          clusterPassword: serverConfig.clusterPassword || "",
          map: serverConfig.map || "TheIsland",
          modsArg,
          disableBattleEye: serverConfig.disableBattleEye || false,
          customDynamicConfigUrl: serverConfig.customDynamicConfigUrl || "",
        });

        await fs.writeFile(path.join(serverPath, "start.bat"), scriptContent);
        logger.info(
          `Start script created for server: ${serverConfig.name} via adapter: ${adapter.id}`,
        );
        return;
      }

      logger.info(`Creating start script for server: ${serverConfig.name}`);

      const configsPath = path.join(
        serverPath,
        "ShooterGame",
        "Saved",
        "Config",
        "WindowsServer",
      );
      const savesPath = path.join(serverPath, "ShooterGame", "Saved", "SaveGames");
      const logsPath = path.join(serverPath, "ShooterGame", "Saved", "Logs");

      const { NativeServerManager } = await import("../server-manager.js");
      const serverManager = new NativeServerManager();
      const finalMods = await serverManager.getFinalModListForServer(
        serverConfig.name,
      );

      const modsArg =
        finalMods && finalMods.length > 0
          ? ` -mods=${finalMods.join(",")}`
          : "";

      const battleEyeArg = serverConfig.disableBattleEye ? " -NoBattleEye" : "";

      const customUrl = serverConfig.customDynamicConfigUrl || "";
      const customUrlArg = customUrl
        ? `?customdynamicconfigurl=\"${customUrl}\"`
        : "";

      const useDynamicConfigArg =
        serverConfig.customDynamicConfigUrl &&
        serverConfig.customDynamicConfigUrl.trim() !== ""
          ? " -UseDynamicConfig"
          : "";

      const startScript = `@echo off
echo Starting ${serverConfig.name}...

REM Start the ASA server with proper parameters
"${path.join(serverPath, "ShooterGame", "Binaries", "Win64", "ArkAscendedServer.exe")}" "${serverConfig.map || "TheIsland"}_WP?SessionName=${serverConfig.name}?RCONEnabled=True?WinLivePlayers=${serverConfig.maxPlayers || 70}${serverConfig.serverPassword ? `?ServerPassword=${serverConfig.serverPassword}` : ""}${customUrlArg}" -Port=${serverConfig.gamePort || 7777} -QueryPort=${serverConfig.queryPort || 27015} -RCONPort=${serverConfig.rconPort || 32330}${modsArg} -servergamelog -NotifyAdminCommandsInChat${useDynamicConfigArg}${battleEyeArg}

echo Server ${serverConfig.name} has stopped.
pause`;

      await fs.writeFile(path.join(serverPath, "start.bat"), startScript);
      logger.info(`Start script created for server: ${serverConfig.name}`);
    } catch (error) {
      logger.error(
        `Failed to create start script for ${serverConfig.name}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Create startup script for a server in cluster
   */
  async createStartScriptInCluster(clusterName, serverPath, serverConfig) {
    try {
      await gameRegistry.ensureBuiltins();

      const serverName = serverConfig.name;
      const gameType = serverConfig.gameType || this.parent.gameType || "ark";
      const adapter = gameFor(gameType);

      // Delegate to game adapter for non-ARK games
      if (adapter.id !== "ark") {
        logger.info(
          `Delegating cluster start script creation to adapter: ${adapter.id}`,
        );

        const binariesPath = path.join(serverPath, "binaries");
        const configsPath = path.join(serverPath, "configs");
        const savesPath = path.join(serverPath, "saves");
        const logsPath = path.join(serverPath, "logs");

        const { NativeServerManager } = await import("../server-manager.js");
        const serverManager = new NativeServerManager();
        const finalMods =
          await serverManager.getFinalModListForServer(serverName);
        const modsArg =
          finalMods && finalMods.length > 0 ? finalMods.join(",") : "";

        const scriptContent = await adapter.buildStartScript({
          serverName,
          binariesPath,
          configsPath,
          savesPath,
          logsPath,
          gamePort: serverConfig.gamePort || 7777,
          queryPort: serverConfig.queryPort || 27015,
          rconPort: serverConfig.rconPort || 32330,
          maxPlayers: serverConfig.maxPlayers || 70,
          adminPassword: serverConfig.adminPassword || "",
          serverPassword: serverConfig.serverPassword || "",
          rconPassword: serverConfig.rconPassword || "",
          clusterId: serverConfig.clusterId || clusterName,
          clusterPassword: serverConfig.clusterPassword || "",
          map: serverConfig.map || "TheIsland",
          modsArg,
          disableBattleEye: serverConfig.disableBattleEye || false,
          customDynamicConfigUrl: serverConfig.customDynamicConfigUrl || "",
        });

        await fs.writeFile(path.join(serverPath, "start.bat"), scriptContent);
        logger.info(
          `Start script created for server: ${serverName} in cluster: ${clusterName} via adapter: ${adapter.id}`,
        );
        this.parent.emitProgress?.(`Start script created for server: ${serverName}`);
        return;
      }

      logger.info(
        `[createStartScriptInCluster] Creating start script for server: ${serverName} in cluster: ${clusterName}`,
      );
      logger.info(`[createStartScriptInCluster] Server path: ${serverPath}`);
      logger.info(
        `[createStartScriptInCluster] Server config: ${JSON.stringify(serverConfig, null, 2)}`,
      );
      logger.info(
        `Creating start script for server: ${serverName} in cluster: ${clusterName}`,
      );
      logger.info(`Server path: ${serverPath}`);
      logger.info(`Server config mods: ${JSON.stringify(serverConfig.mods)}`);

      try {
        await fs.access(serverPath);
        logger.info(`Server directory exists: ${serverPath}`);
      } catch (error) {
        logger.error(`Server directory does not exist: ${serverPath}`);
        throw new Error(`Server directory does not exist: ${serverPath}`);
      }

      const binariesPath = path.join(
        serverPath,
        "ShooterGame",
        "Binaries",
        "Win64",
      );

      try {
        await fs.access(binariesPath);
        logger.info(`Binaries directory exists: ${binariesPath}`);
      } catch (error) {
        logger.error(`Binaries directory does not exist: ${binariesPath}`);
        throw new Error(`Binaries directory does not exist: ${binariesPath}`);
      }

      const basePath =
        process.env.NATIVE_BASE_PATH || config.server.native.basePath;
      const clustersPath =
        process.env.NATIVE_CLUSTERS_PATH || path.join(basePath, "clusters");
      const clusterDataPath = path.join(
        clustersPath,
        clusterName,
        "clusterdata",
      );

      await fs.mkdir(clusterDataPath, { recursive: true });

      const customUrl = serverConfig.customDynamicConfigUrl || "";
      const customUrlArg = customUrl
        ? `?customdynamicconfigurl=\"${customUrl}\"`
        : "";

      const { NativeServerManager } = await import("../server-manager.js");
      const serverManager = new NativeServerManager();
      const finalMods =
        await serverManager.getFinalModListForServer(serverName);

      const modsArg =
        finalMods && finalMods.length > 0
          ? ` -mods=${finalMods.join(",")}`
          : "";

      const battleEyeArg = serverConfig.disableBattleEye ? " -NoBattleEye" : "";

      let queryParams = [
        `SessionName=${serverName}`,
        `RCONEnabled=True`,
        `WinLivePlayers=${serverConfig.maxPlayers}`,
      ];

      if (serverConfig.password || serverConfig.serverPassword) {
        queryParams.push(
          `ServerPassword=${serverConfig.password || serverConfig.serverPassword}`,
        );
      }

      if (customUrl) {
        queryParams.push(`customdynamicconfigurl=\"${customUrl}\"`);
      }
      const queryString = queryParams.join("?");

      const useDynamicConfigArg =
        serverConfig.customDynamicConfigUrl &&
        serverConfig.customDynamicConfigUrl.trim() !== ""
          ? " -UseDynamicConfig"
          : "";

      const startScript = `@echo off
echo Starting ${serverName}...

REM Start the ASA server with proper parameters
      "${path.join(binariesPath, "ArkAscendedServer.exe")}" "${serverConfig.map}_WP?${queryString}" -Port=${serverConfig.gamePort} -QueryPort=${serverConfig.queryPort} -RCONPort=${serverConfig.rconPort}${modsArg} -servergamelog -NotifyAdminCommandsInChat${useDynamicConfigArg} -ClusterDirOverride=${clusterDataPath.replace(/\\/g, "\\\\")} -NoTransferFromFiltering -clusterid=${serverConfig.clusterId || clusterName}${battleEyeArg}

echo Server ${serverName} has stopped.
pause`;

      const startScriptPath = path.join(serverPath, "start.bat");
      await fs.writeFile(startScriptPath, startScript);
      logger.info(
        `[createStartScriptInCluster] Start script written to: ${startScriptPath}`,
      );
      logger.info(
        `[createStartScriptInCluster] Start script content:\n${startScript}`,
      );
      logger.info(
        `[createStartScriptInCluster] Start script content length: ${startScript.length} characters`,
      );
      logger.info(
        `[createStartScriptInCluster] BattleEye disabled: ${serverConfig.disableBattleEye || false}`,
      );
      this.parent.emitProgress?.(`Start script created for server: ${serverName}`);
    } catch (error) {
      logger.error(
        `[createStartScriptInCluster] Failed to create start script for ${serverConfig.name} in cluster ${clusterName}:`,
        error,
      );
      this.parent.emitProgress?.(
        `Failed to create start script for server: ${serverConfig.name}: ${error.message}`,
      );
      throw error;
    }
  }
}
