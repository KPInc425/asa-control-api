import fs from "fs/promises";
import path from "path";
import logger from "../../../utils/logger.js";
import { gameFor, gameRegistry } from "../../../games/index.js";

/**
 * Stop script creation (standalone and cluster)
 */
export class StopScripts {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Create stop script for a standalone server
   */
  async createStopScript(serverPath, serverName) {
    try {
      await gameRegistry.ensureBuiltins();

      let gameType = this.parent.gameType || "ark";
      try {
        const configPath = path.join(serverPath, "server-config.json");
        const configContent = await fs.readFile(configPath, "utf8");
        const parsed = JSON.parse(configContent);
        if (parsed.gameType) gameType = parsed.gameType;
      } catch {
        // No config file found, use fallback
      }

      const adapter = gameFor(gameType);

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

      const stopScript = `@echo off

echo Stopping ${serverName}...

REM Call PowerShell script to stop the server
powershell -ExecutionPolicy Bypass -File "%~dp0stop_${serverName}.ps1"

echo Stop script completed for ${serverName}.
pause`;

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
   * Create stop script for a server in cluster
   */
  async createStopScriptInCluster(clusterName, serverPath, serverName) {
    try {
      await gameRegistry.ensureBuiltins();

      let gameType = this.parent.gameType || "ark";
      try {
        const configPath = path.join(serverPath, "server-config.json");
        const configContent = await fs.readFile(configPath, "utf8");
        const parsed = JSON.parse(configContent);
        if (parsed.gameType) gameType = parsed.gameType;
      } catch {
        // No config file found, use fallback
      }

      const adapter = gameFor(gameType);

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

      const stopScript = `@echo off

echo Stopping ${serverName} in cluster ${clusterName}...

REM Call PowerShell script to stop the server
powershell -ExecutionPolicy Bypass -File "%~dp0stop_${serverName}.ps1"

echo Stop script completed for ${serverName}.
pause`;

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
}
