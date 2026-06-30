import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import logger from "../../../utils/logger.js";
import { gameFor } from "../../../games/index.js";

const execAsync = promisify(exec);

/**
 * Binary installation operations (standalone and cluster)
 */
export class BinaryInstaller {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Execute command in foreground mode with real-time output
   */
  async execForeground(command, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const { execSync } = await import("child_process");

        logger.info(`Executing command in foreground: ${command}`);
        console.log(`\n=== Executing: ${command} ===\n`);

        execSync(command, {
          stdio: "inherit",
          ...options,
        });

        console.log(`\n=== Command completed successfully ===\n`);
        logger.info("Foreground command completed successfully");
        resolve({ success: true });
      } catch (error) {
        console.log(`\n=== Command failed ===\n`);
        logger.error("Foreground command failed:", error);
        reject(error);
      }
    });
  }

  /**
   * Install ASA binaries for a specific server (standalone)
   */
  async installForServer(serverName) {
    try {
      const serverPath = path.join(this.parent.serversPath, serverName);

      logger.info(`Installing ASA binaries for server: ${serverName}`);

      const steamCmdExe = this.parent.steamCmdManager.getExecutablePath();

      const scriptPath = path.join(serverPath, "install_asa.txt");
      const adapter = gameFor(this.parent.gameType || "ark");
      const scriptContent = adapter.buildInstallScript(serverPath);

      await fs.writeFile(scriptPath, scriptContent);

      const command = `"${steamCmdExe}" +runscript "${scriptPath}"`;
      const { stdout, stderr } = await execAsync(command, { timeout: 900000 });

      if (stderr) {
        logger.warn(`SteamCMD stderr for ${serverName}: ${stderr}`);
      }

      const serverExe = path.join(serverPath, adapter.binaryExeRelPath);
      const exists = await fs
        .access(serverExe)
        .then(() => true)
        .catch(() => false);

      if (!exists) {
        logger.warn(
          `SteamCMD install failed for ${serverName}, trying fallback from global SteamCMD install...`,
        );
        await this.parent._copyFromGlobalInstall(serverPath, serverName, adapter);
      }

      await fs.unlink(scriptPath);

      logger.info(
        `ASA binaries installed successfully for server: ${serverName}`,
      );
      return { success: true };
    } catch (error) {
      logger.error(
        `Failed to install ASA binaries for server ${serverName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Install ASA binaries for a specific server in a cluster
   */
  async installForServerInCluster(clusterName, serverName, foreground = false) {
    const serverPath = path.join(this.parent.clustersPath, clusterName, serverName);
    const clusterDir = path.join(this.parent.clustersPath, clusterName);

    try {
      await fs.mkdir(clusterDir, { recursive: true });
      await fs.mkdir(serverPath, { recursive: true });
      logger.info(
        `Installing ASA binaries for server: ${serverName} in cluster ${clusterName} (foreground: ${foreground})`,
      );
      this.parent.emitProgress?.(`Created server directory: ${serverPath}`);

      const steamCmdExe = this.parent.steamCmdManager.getExecutablePath();
      const installPath = serverPath;
      const adapter = gameFor(this.parent.gameType || "ark");

      const steamCmdCommand = `"${steamCmdExe}" +force_install_dir "${installPath}" +login anonymous +app_update ${adapter.steamAppId} validate +quit`;

      if (foreground) {
        console.log(`Installing ASA binaries for ${serverName}...`);
        console.log(
          "This may take several minutes depending on your internet connection...",
        );

        const batPath = path.join(
          this.parent.clustersPath,
          clusterName,
          `install_${serverName}.bat`,
        );
        const batContent = `@echo off\n${steamCmdCommand}\n`;
        await fs.writeFile(batPath, batContent);

        await fs.access(batPath);
        logger.info(`Batch file exists at: ${batPath}`);
        logger.info(`Batch file contents:\n${batContent}`);
        logger.info(
          `Current working directory for exec: ${path.dirname(batPath)}`,
        );

        await this.execForeground(`cmd /c "${batPath}"`, {
          cwd: path.dirname(batPath),
          timeout: 900000,
        });

        await fs.unlink(batPath);
      } else {
        const batPath = path.join(
          this.parent.clustersPath,
          clusterName,
          "install_asa.bat",
        );
        const batContent = `@echo off
echo Installing ASA binaries for ${serverName}...
echo SteamCMD path: ${steamCmdExe}
echo Install path: ${installPath}

${steamCmdCommand}

echo Installation completed with exit code: %ERRORLEVEL%
if %ERRORLEVEL% NEQ 0 (
    echo SteamCMD exited with error code: %ERRORLEVEL%
    echo Checking if files were actually downloaded...
    if exist "${path.join(serverPath, adapter.binaryExeRelPath)}" (
        echo Server executable found - installation may have succeeded despite error code
        exit 0
    ) else (
        echo Server executable not found - installation failed
        exit 1
    )
) else (
    echo Installation completed successfully
    exit 0
)`;
        await fs.writeFile(batPath, batContent);

        await fs.access(batPath);
        logger.info(`Batch file exists at: ${batPath}`);
        logger.info(`Batch file contents:\n${batContent}`);
        logger.info(
          `Current working directory for exec: ${path.dirname(batPath)}`,
        );

        logger.info(`Running install batch: ${batPath}`);
        logger.info(`SteamCMD command: ${steamCmdCommand}`);

        try {
          const { stdout, stderr } = await execAsync(`cmd /c "${batPath}"`, {
            cwd: path.dirname(batPath),
            timeout: 900000,
          });

          if (stderr) {
            logger.warn(`SteamCMD stderr for ${serverName}: ${stderr}`);
          }
          if (stdout) {
            logger.info(
              `SteamCMD stdout for ${serverName}: ${stdout.substring(0, 500)}...`,
            );
          }

          const arkServerExe = path.join(serverPath, adapter.binaryExeRelPath);
          const exists = await fs
            .access(arkServerExe)
            .then(() => true)
            .catch(() => false);

          if (!exists) {
            throw new Error(
              `ASA server executable not found at ${arkServerExe} after installation`,
            );
          }

          logger.info(`ASA server executable verified at: ${arkServerExe}`);
        } catch (execError) {
          logger.error(
            `SteamCMD execution failed for ${serverName}:`,
            execError.message,
          );

          const arkServerExe = path.join(serverPath, adapter.binaryExeRelPath);
          const exists = await fs
            .access(arkServerExe)
            .then(() => true)
            .catch(() => false);

          if (exists) {
            logger.info(
              `ASA server executable found despite error, continuing: ${arkServerExe}`,
            );
          } else {
            logger.warn(
              `SteamCMD direct install failed for ${serverName}, trying fallback from global SteamCMD install...`,
            );
            await this.parent._copyFromGlobalInstall(serverPath, serverName, adapter);
          }
        } finally {
          try { await fs.unlink(batPath); } catch {}
        }
      }

      const serverExe = path.join(serverPath, adapter.binaryExeRelPath);
      const gameDir = path.dirname(path.dirname(path.dirname(serverExe)));
      const gameDirName = path.basename(gameDir);

      try {
        await fs.access(serverExe);
        logger.info(`Server executable verified: ${serverExe}`);

        const gameDirStats = await fs.stat(gameDir);
        if (gameDirStats.isDirectory()) {
          const contents = await fs.readdir(gameDir);
          logger.info(
            `${gameDirName} directory contents: ${contents.join(", ")}`,
          );
        }

        this.parent.emitProgress?.(`Binaries installed for server: ${serverName}`);
        logger.info(
          `Binaries installed for server: ${serverName} in cluster ${clusterName}`,
        );
      } catch (accessError) {
        logger.error(
          `Installation verification failed for ${serverName}:`,
          accessError,
        );
        throw new Error(
          `Server executable not found at ${serverExe} after installation`,
        );
      }
    } catch (error) {
      logger.error(
        `Failed to install ASA binaries for server ${serverName} in cluster ${clusterName}:`,
        error,
      );
      this.parent.emitProgress?.(
        `Failed to install ASA binaries for server ${serverName}: ${error.message}`,
      );

      let errorMessage = `Failed to install ASA binaries for server ${serverName}`;
      if (error.message) {
        if (error.message.includes("ENOENT")) {
          errorMessage = `Failed to access SteamCMD or create directories for server ${serverName}`;
        } else if (error.message.includes("timeout")) {
          errorMessage = `SteamCMD installation timed out for server ${serverName}. Please try again.`;
        } else if (error.message.includes("steamcmd")) {
          errorMessage = `SteamCMD installation failed for server ${serverName}. Please check if SteamCMD is properly installed.`;
        } else if (error.message.includes("executable not found")) {
          errorMessage = `Server files not found after installation for server ${serverName}. Installation may have failed.`;
        } else {
          errorMessage = error.message;
        }
      }

      logger.error(`Error details for ${serverName}:`, {
        errorCode: error.code,
        errorMessage: error.message,
        serverPath: serverPath,
        steamCmdExe: this.parent.steamCmdManager.getExecutablePath(),
      });

      throw new Error(errorMessage);
    }
  }
}
