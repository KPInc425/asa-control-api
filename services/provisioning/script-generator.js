import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../../utils/logger.js";
import config from "../../config/index.js";
import { gameFor, gameRegistry } from "../../games/index.js";

/**
 * Script Generator
 * Handles generation of start and stop scripts for servers
 */
export class ScriptGenerator {
  constructor(basePath, clustersPath, serversPath, gameType = "ark") {
    this.basePath = basePath;
    this.clustersPath = clustersPath;
    this.serversPath = serversPath;
    this.gameType = gameType;
    this.emitProgress = null;
  }

  /**
   * Set progress callback for real-time feedback
   */
  setProgressCallback(cb) {
    this.emitProgress = cb;
  }

  /**
   * Create startup script for a standalone server
   */
  async createStartScript(serverPath, serverConfig) {
    try {
      await gameRegistry.ensureBuiltins();

      const gameType = serverConfig.gameType || this.gameType || "ark";
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

        // Get final mod list using database-based logic
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

      const configsPath = path.join(serverPath, "configs");
      const savesPath = path.join(serverPath, "saves");
      const logsPath = path.join(serverPath, "logs");

      // Get final mod list using database-based logic
      const { NativeServerManager } = await import("../server-manager.js");
      const serverManager = new NativeServerManager();
      const finalMods = await serverManager.getFinalModListForServer(
        serverConfig.name,
      );

      // Add mods parameter if mods are configured
      const modsArg =
        finalMods && finalMods.length > 0
          ? ` -mods=${finalMods.join(",")}`
          : "";

      // Add BattleEye flag
      const battleEyeArg = serverConfig.disableBattleEye ? " -NoBattleEye" : "";

      // Add custom URL if provided
      const customUrl = serverConfig.customDynamicConfigUrl || "";
      const customUrlArg = customUrl
        ? `?customdynamicconfigurl=\"${customUrl}\"`
        : "";

      // Only use -UseDynamicConfig if a custom dynamic config URL is actually provided
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
   * Create stop script for a standalone server
   */
  async createStopScript(serverPath, serverName) {
    try {
      await gameRegistry.ensureBuiltins();

      // Try to determine game type from server-config.json, fall back to instance default
      let gameType = this.gameType || "ark";
      try {
        const configPath = path.join(serverPath, "server-config.json");
        const configContent = await fs.readFile(configPath, "utf8");
        const parsed = JSON.parse(configContent);
        if (parsed.gameType) gameType = parsed.gameType;
      } catch {
        // No config file found, use fallback
      }

      const adapter = gameFor(gameType);

      // Delegate to game adapter for non-ARK games
      if (adapter.id !== "ark") {
        logger.info(
          `Delegating stop script creation to adapter: ${adapter.id}`,
        );
        const scriptContent = await adapter.buildStopScript({
          binaryName: adapter.binaryName,
          processNames: adapter.processNames,
        });
        await fs.writeFile(path.join(serverPath, "stop.bat"), scriptContent);
        logger.info(
          `Stop script created for server: ${serverName} via adapter: ${adapter.id}`,
        );
        return;
      }

      // Create PowerShell script for stopping the server
      const psScript = `# Stop script for ${serverName}
$processes = Get-Process -Name 'ArkAscendedServer' -ErrorAction SilentlyContinue
$found = $false

foreach ($proc in $processes) {
    try {
        $cmdLine = (Get-WmiObject -Class Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
        if ($cmdLine -like "*SessionName=${serverName}*" -or $cmdLine -like "*${serverName}*") {
            Write-Host "Stopping process $($proc.Id) for server ${serverName}"
            Stop-Process -Id $proc.Id -Force
            Write-Host "${serverName} stopped successfully"
            $found = $true
            break
        }
    } catch {
        continue
    }
}

if (-not $found) {
    Write-Host "No running process found for server ${serverName}"
}`;

      // Create batch file that calls the PowerShell script
      const stopScript = `@echo off

echo Stopping ${serverName}...

REM Call PowerShell script to stop the server
powershell -ExecutionPolicy Bypass -File "%~dp0stop_${serverName}.ps1"

echo Stop script completed for ${serverName}.
pause`;

      // Write both files
      await fs.writeFile(
        path.join(serverPath, `stop_${serverName}.ps1`),
        psScript,
      );
      await fs.writeFile(path.join(serverPath, "stop.bat"), stopScript);

      logger.info(`Stop script created for server: ${serverName}`);
    } catch (error) {
      logger.error(`Failed to create stop script for ${serverName}:`, error);
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
      const gameType = serverConfig.gameType || this.gameType || "ark";
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
        this.emitProgress?.(`Start script created for server: ${serverName}`);
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

      // Check if server directory exists
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

      // Check if binaries directory exists
      try {
        await fs.access(binariesPath);
        logger.info(`Binaries directory exists: ${binariesPath}`);
      } catch (error) {
        logger.error(`Binaries directory does not exist: ${binariesPath}`);
        throw new Error(`Binaries directory does not exist: ${binariesPath}`);
      }

      // Use the actual base path from the environment or config
      const basePath =
        process.env.NATIVE_BASE_PATH || config.server.native.basePath;
      const clustersPath =
        process.env.NATIVE_CLUSTERS_PATH || path.join(basePath, "clusters");
      const clusterDataPath = path.join(
        clustersPath,
        clusterName,
        "clusterdata",
      );

      // Create clusterdata directory for shared cluster data
      await fs.mkdir(clusterDataPath, { recursive: true });

      // Use customDynamicConfigUrl if provided
      const customUrl = serverConfig.customDynamicConfigUrl || "";
      const customUrlArg = customUrl
        ? `?customdynamicconfigurl=\"${customUrl}\"`
        : "";

      // Get final mod list using database-based logic
      const { NativeServerManager } = await import("../server-manager.js");
      const serverManager = new NativeServerManager();
      const finalMods =
        await serverManager.getFinalModListForServer(serverName);

      // Add mods parameter if mods are configured
      const modsArg =
        finalMods && finalMods.length > 0
          ? ` -mods=${finalMods.join(",")}`
          : "";

      // Add BattleEye flag based on cluster configuration
      const battleEyeArg = serverConfig.disableBattleEye ? " -NoBattleEye" : "";

      // Build the query string for the server parameters (without passwords)
      // NOTE: Port, QueryPort, and RCONPort are passed as command-line args
      // because ASA ignores them in the URL query string
      let queryParams = [
        `SessionName=${serverName}`,
        `RCONEnabled=True`,
        `WinLivePlayers=${serverConfig.maxPlayers}`,
      ];

      // Only add server password if it's not empty (admin password is in config file)
      if (serverConfig.password || serverConfig.serverPassword) {
        queryParams.push(
          `ServerPassword=${serverConfig.password || serverConfig.serverPassword}`,
        );
      }

      if (customUrl) {
        queryParams.push(`customdynamicconfigurl=\"${customUrl}\"`);
      }
      const queryString = queryParams.join("?");

      // Only use -UseDynamicConfig if a custom dynamic config URL is actually provided
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
      this.emitProgress?.(`Start script created for server: ${serverName}`);
    } catch (error) {
      logger.error(
        `[createStartScriptInCluster] Failed to create start script for ${serverConfig.name} in cluster ${clusterName}:`,
        error,
      );
      this.emitProgress?.(
        `Failed to create start script for server: ${serverConfig.name}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Create stop script for a server in cluster
   */
  async createStopScriptInCluster(clusterName, serverPath, serverName) {
    try {
      await gameRegistry.ensureBuiltins();

      // Try to determine game type from server-config.json, fall back to instance default
      let gameType = this.gameType || "ark";
      try {
        const configPath = path.join(serverPath, "server-config.json");
        const configContent = await fs.readFile(configPath, "utf8");
        const parsed = JSON.parse(configContent);
        if (parsed.gameType) gameType = parsed.gameType;
      } catch {
        // No config file found, use fallback
      }

      const adapter = gameFor(gameType);

      // Delegate to game adapter for non-ARK games
      if (adapter.id !== "ark") {
        logger.info(
          `Delegating cluster stop script creation to adapter: ${adapter.id}`,
        );
        const scriptContent = await adapter.buildStopScript({
          binaryName: adapter.binaryName,
          processNames: adapter.processNames,
        });
        await fs.writeFile(path.join(serverPath, "stop.bat"), scriptContent);
        logger.info(
          `Stop script created for server: ${serverName} in cluster ${clusterName} via adapter: ${adapter.id}`,
        );
        return;
      }

      // Create PowerShell script for stopping the server
      const psScript = `# Stop script for ${serverName}
$processes = Get-Process -Name 'ArkAscendedServer' -ErrorAction SilentlyContinue
$found = $false

foreach ($proc in $processes) {
    try {
        $cmdLine = (Get-WmiObject -Class Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
        if ($cmdLine -like "*SessionName=${serverName}*" -or $cmdLine -like "*${serverName}*") {
            Write-Host "Stopping process $($proc.Id) for server ${serverName}"
            Stop-Process -Id $proc.Id -Force
            Write-Host "${serverName} stopped successfully"
            $found = $true
            break
        }
    } catch {
        continue
    }
}

if (-not $found) {
    Write-Host "No running process found for server ${serverName}"
}`;

      // Create batch file that calls the PowerShell script
      const stopScript = `@echo off

echo Stopping ${serverName} in cluster ${clusterName}...

REM Call PowerShell script to stop the server
powershell -ExecutionPolicy Bypass -File "%~dp0stop_${serverName}.ps1"

echo Stop script completed for ${serverName}.
pause`;

      // Write both files
      await fs.writeFile(
        path.join(serverPath, `stop_${serverName}.ps1`),
        psScript,
      );
      await fs.writeFile(path.join(serverPath, "stop.bat"), stopScript);

      logger.info(
        `Stop script created for server: ${serverName} in cluster ${clusterName}`,
      );
    } catch (error) {
      logger.error(
        `Failed to create stop script for ${serverName} in cluster ${clusterName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Regenerate start script for a specific server
   */
  async regenerateServerStartScript(serverName) {
    try {
      logger.info(
        `[regenerateServerStartScript] Regenerating start script for server: ${serverName}`,
      );
      // Find the server in clusters
      const clusters = await this.listClusters();
      let serverConfig = null;
      let clusterName = null;
      for (const cluster of clusters) {
        if (cluster.config && cluster.config.servers) {
          const server = cluster.config.servers.find(
            (s) => s.name === serverName,
          );
          if (server) {
            serverConfig = server;
            clusterName = cluster.name;
            break;
          }
        }
      }
      if (!serverConfig) {
        // Try to find the server config in the DB and check for clusterId/clusterName
        const allServerConfigs =
          typeof getAllServerConfigs === "function"
            ? getAllServerConfigs()
            : [];
        let dbConfig = allServerConfigs.find((cfg) => {
          try {
            const parsed = JSON.parse(cfg.config_data);
            return parsed.name === serverName;
          } catch {
            return false;
          }
        });
        let foundClusterId = null;
        if (dbConfig) {
          try {
            const parsed = JSON.parse(dbConfig.config_data);
            foundClusterId =
              parsed.clusterId ||
              parsed.clusterName ||
              (parsed.config &&
                (parsed.config.clusterId || parsed.config.clusterName));
            serverConfig = parsed;
            clusterName = foundClusterId || null;
          } catch {}
        }
      }
      // Fallback: scan clusters and servers directories for start.bat
      if (!serverConfig) {
        const { parseStartBat } =
          await import("../../utils/parse-start-bat.js");
        // Scan clusters
        if (this.clustersPath && existsSync(this.clustersPath)) {
          const clusterDirs = await fs.readdir(this.clustersPath);
          for (const cName of clusterDirs) {
            const clusterPath = path.join(this.clustersPath, cName);
            if (
              !existsSync(clusterPath) ||
              !(await fs.stat(clusterPath)).isDirectory()
            )
              continue;
            const serverDirs = await fs.readdir(clusterPath);
            for (const sDir of serverDirs) {
              const serverPath = path.join(clusterPath, sDir);
              if (
                !existsSync(serverPath) ||
                !(await fs.stat(serverPath)).isDirectory()
              )
                continue;
              const startBatPath = path.join(serverPath, "start.bat");
              if (existsSync(startBatPath)) {
                try {
                  const parsed = await parseStartBat(startBatPath);
                  if (parsed.name === serverName) {
                    logger.warn(
                      `[regenerateServerStartScript] Fallback: found server on disk not in DB or cluster config: ${parsed.name} (cluster: ${cName})`,
                    );
                    serverConfig = parsed;
                    clusterName = cName;
                    break;
                  }
                } catch (e) {
                  logger.warn(
                    `[regenerateServerStartScript] Failed to parse start.bat for fallback server in cluster ${cName}: ${e.message}`,
                  );
                }
              }
            }
            if (serverConfig) break;
          }
        }
        // Scan serversPath for standalone servers
        if (!serverConfig && this.serversPath && existsSync(this.serversPath)) {
          const serverDirs = await fs.readdir(this.serversPath);
          for (const sDir of serverDirs) {
            const serverPath = path.join(this.serversPath, sDir);
            if (
              !existsSync(serverPath) ||
              !(await fs.stat(serverPath)).isDirectory()
            )
              continue;
            const startBatPath = path.join(serverPath, "start.bat");
            if (existsSync(startBatPath)) {
              try {
                const parsed = await parseStartBat(startBatPath);
                if (parsed.name === serverName) {
                  logger.warn(
                    `[regenerateServerStartScript] Fallback: found standalone server on disk not in DB or cluster config: ${parsed.name}`,
                  );
                  serverConfig = parsed;
                  clusterName = null;
                  break;
                }
              } catch (e) {
                logger.warn(
                  `[regenerateServerStartScript] Failed to parse start.bat for fallback standalone server: ${e.message}`,
                );
              }
            }
          }
        }
      }
      if (!serverConfig) {
        logger.warn(
          `[regenerateServerStartScript] Server config not found for: ${serverName}`,
        );
        throw new Error(
          `Server "${serverName}" not found in any cluster, DB, or on disk.`,
        );
      }
      logger.info(
        `[regenerateServerStartScript] Found server in cluster: ${clusterName}`,
      );
      logger.info(
        `[regenerateServerStartScript] Server config: ${JSON.stringify(serverConfig, null, 2)}`,
      );
      // Get the server path
      const serverPath = clusterName
        ? path.join(this.clustersPath, clusterName, serverName)
        : path.join(this.serversPath, serverName);
      // Regenerate start script
      if (clusterName) {
        await this.createStartScriptInCluster(
          clusterName,
          serverPath,
          serverConfig,
        );
      } else {
        await this.createStartScript(serverPath, serverConfig);
      }
      logger.info(
        `[regenerateServerStartScript] Regenerating start script at path: ${serverPath}`,
      );
      logger.info(
        `[regenerateServerStartScript] Start script regenerated for server: ${serverName}`,
      );
      return {
        success: true,
        message: `Start script regenerated for ${serverName}`,
      };
    } catch (error) {
      logger.error(
        `[regenerateServerStartScript] Failed to regenerate start script for ${serverName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Regenerate start scripts for all servers in all clusters
   */
  async regenerateAllClusterStartScripts() {
    try {
      const clusters = await this.listClusters();
      const results = [];

      for (const cluster of clusters) {
        if (cluster.config && cluster.config.servers) {
          for (const server of cluster.config.servers) {
            try {
              await this.regenerateServerStartScript(server.name);
              results.push({
                serverName: server.name,
                clusterName: cluster.name,
                success: true,
                message: `Start script regenerated for ${server.name}`,
              });
            } catch (error) {
              logger.error(
                `Failed to regenerate start script for ${server.name}:`,
                error,
              );
              results.push({
                serverName: server.name,
                clusterName: cluster.name,
                success: false,
                message: `Failed to regenerate start script: ${error.message}`,
              });
            }
          }
        }
      }

      return {
        success: true,
        message: "All start scripts regenerated",
        results: results,
      };
    } catch (error) {
      logger.error("Failed to regenerate all start scripts:", error);
      throw error;
    }
  }

  /**
   * Helper method to list clusters (needed for regeneration)
   */
  async listClusters() {
    try {
      const clusters = [];
      if (!existsSync(this.clustersPath)) {
        return clusters;
      }

      const clusterDirs = await fs.readdir(this.clustersPath);

      for (const clusterName of clusterDirs) {
        try {
          const clusterPath = path.join(this.clustersPath, clusterName);
          const stat = await fs.stat(clusterPath);

          if (stat.isDirectory()) {
            const configPath = path.join(clusterPath, "cluster.json");
            let clusterConfig = {};

            try {
              const configContent = await fs.readFile(configPath, "utf8");
              clusterConfig = JSON.parse(configContent);
            } catch {
              // Cluster config not found, use defaults
              clusterConfig = {
                name: clusterName,
                servers: [],
              };
            }

            clusters.push({
              name: clusterName,
              path: clusterPath,
              config: clusterConfig,
            });
          }
        } catch (error) {
          logger.error(`Error reading cluster ${clusterName}:`, error);
        }
      }

      return clusters;
    } catch (error) {
      logger.error("Failed to list clusters:", error);
      return [];
    }
  }

  /**
   * Update paths if they change
   */
  updatePaths(basePath, clustersPath, serversPath, gameType) {
    this.basePath = basePath;
    this.clustersPath = clustersPath;
    this.serversPath = serversPath;
    if (gameType) this.gameType = gameType;
  }
}
