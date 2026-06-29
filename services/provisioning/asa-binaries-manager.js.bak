import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../../utils/logger.js";
import { gameFor } from "../../games/index.js";

const execAsync = promisify(exec);

/**
 * ASA Binaries Manager
 * Handles ASA server binary installation, verification, and management
 */
export class ASABinariesManager {
  constructor(
    steamCmdManager,
    basePath,
    clustersPath,
    serversPath,
    gameType = "ark",
  ) {
    this.steamCmdManager = steamCmdManager;
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
      const serverPath = path.join(this.serversPath, serverName);

      logger.info(`Installing ASA binaries for server: ${serverName}`);

      // Use SteamCMD to install
      const steamCmdExe = this.steamCmdManager.getExecutablePath();

      // Create installation script
      const scriptPath = path.join(serverPath, "install_asa.txt");
      const adapter = gameFor(this.gameType || "ark");
      const scriptContent = adapter.buildInstallScript(serverPath);

      await fs.writeFile(scriptPath, scriptContent);

      // Run SteamCMD
      const command = `"${steamCmdExe}" +runscript "${scriptPath}"`;
      const { stdout, stderr } = await execAsync(command, { timeout: 900000 });

      if (stderr) {
        logger.warn(`SteamCMD stderr for ${serverName}: ${stderr}`);
      }

      // Verify installation
      const serverExe = path.join(serverPath, adapter.binaryExeRelPath);
      const exists = await fs
        .access(serverExe)
        .then(() => true)
        .catch(() => false);

      if (!exists) {
        // Fallback: try to copy binaries from the global SteamCMD install
        logger.warn(
          `SteamCMD install failed for ${serverName}, trying fallback from global SteamCMD install...`,
        );
        await this._copyFromGlobalInstall(serverPath, serverName, adapter);
      }

      // Clean up script
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
    const serverPath = path.join(this.clustersPath, clusterName, serverName);
    const clusterDir = path.join(this.clustersPath, clusterName);

    try {
      // Ensure cluster and server directories exist before proceeding
      await fs.mkdir(clusterDir, { recursive: true });
      await fs.mkdir(serverPath, { recursive: true });
      logger.info(
        `Installing ASA binaries for server: ${serverName} in cluster ${clusterName} (foreground: ${foreground})`,
      );
      this.emitProgress?.(`Created server directory: ${serverPath}`);

      // Use the correct SteamCMD path with proper escaping
      const steamCmdExe = this.steamCmdManager.getExecutablePath();
      const installPath = serverPath; // Install directly to server folder, not a binaries subfolder
      const adapter = gameFor(this.gameType || "ark");

      // Build the full SteamCMD command with proper error handling
      const steamCmdCommand = `"${steamCmdExe}" +force_install_dir "${installPath}" +login anonymous +app_update ${adapter.steamAppId} validate +quit`;

      if (foreground) {
        console.log(`Installing ASA binaries for ${serverName}...`);
        console.log(
          "This may take several minutes depending on your internet connection...",
        );

        // Write the .bat file
        const batPath = path.join(
          this.clustersPath,
          clusterName,
          `install_${serverName}.bat`,
        );
        const batContent = `@echo off\n${steamCmdCommand}\n`;
        await fs.writeFile(batPath, batContent);

        // Debug: Ensure batch file exists and log contents
        await fs.access(batPath); // Throws if not found
        logger.info(`Batch file exists at: ${batPath}`);
        logger.info(`Batch file contents:\n${batContent}`);
        logger.info(
          `Current working directory for exec: ${path.dirname(batPath)}`,
        );

        // Run the .bat file in foreground
        await this.execForeground(`cmd /c "${batPath}"`, {
          cwd: path.dirname(batPath),
          timeout: 900000, // 15 minute timeout
        });

        // Clean up .bat file
        await fs.unlink(batPath);
      } else {
        // Write the .bat file with better error handling
        const batPath = path.join(
          this.clustersPath,
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

        // Debug: Ensure batch file exists and log contents
        await fs.access(batPath); // Throws if not found
        logger.info(`Batch file exists at: ${batPath}`);
        logger.info(`Batch file contents:\n${batContent}`);
        logger.info(
          `Current working directory for exec: ${path.dirname(batPath)}`,
        );

        // Run the .bat file
        logger.info(`Running install batch: ${batPath}`);
        logger.info(`SteamCMD command: ${steamCmdCommand}`);

        try {
          const { stdout, stderr } = await execAsync(`cmd /c "${batPath}"`, {
            cwd: path.dirname(batPath),
            timeout: 900000, // 15 minute timeout
          });

          if (stderr) {
            logger.warn(`SteamCMD stderr for ${serverName}: ${stderr}`);
          }
          if (stdout) {
            logger.info(
              `SteamCMD stdout for ${serverName}: ${stdout.substring(0, 500)}...`,
            );
          }

          // Check if the installation was successful by looking for key files
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

          // Check if the installation actually succeeded despite the error
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
            // Fallback: try to copy binaries from the global SteamCMD install
            // This handles the case where SteamCMD's force_install_dir fails
            // (state 0x6) but the global install already has updated binaries.
            logger.warn(
              `SteamCMD direct install failed for ${serverName}, trying fallback from global SteamCMD install...`,
            );
            await this._copyFromGlobalInstall(serverPath, serverName, adapter);
          }
        } finally {
          // Clean up .bat file
          try { await fs.unlink(batPath); } catch {}
        }
      }

      // Verify installation by checking for key files
      const serverExe = path.join(serverPath, adapter.binaryExeRelPath);
      const gameDir = path.dirname(path.dirname(path.dirname(serverExe)));
      const gameDirName = path.basename(gameDir);

      try {
        await fs.access(serverExe);
        logger.info(`Server executable verified: ${serverExe}`);

        // Check if game directory exists and has content
        const gameDirStats = await fs.stat(gameDir);
        if (gameDirStats.isDirectory()) {
          const contents = await fs.readdir(gameDir);
          logger.info(
            `${gameDirName} directory contents: ${contents.join(", ")}`,
          );
        }

        this.emitProgress?.(`Binaries installed for server: ${serverName}`);
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
      this.emitProgress?.(
        `Failed to install ASA binaries for server ${serverName}: ${error.message}`,
      );

      // Provide more specific error messages
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

      // Log additional debugging information
      logger.error(`Error details for ${serverName}:`, {
        errorCode: error.code,
        errorMessage: error.message,
        serverPath: serverPath,
        steamCmdExe: this.steamCmdManager.getExecutablePath(),
      });

      throw new Error(errorMessage);
    }
  }

  /**
   * Update ASA binaries for a specific server
   */
  async updateForServer(serverName) {
    try {
      logger.info(`Updating ASA binaries for server: ${serverName}`);

      // First check if it's a cluster server
      const clusters = await this.listClusters();
      for (const cluster of clusters) {
        const server = cluster.config.servers?.find(
          (s) => s.name === serverName,
        );
        if (server) {
          // It's a cluster server, use the cluster-specific update method
          logger.info(
            `Server ${serverName} is a cluster server, using cluster update method`,
          );
          await this.installForServerInCluster(cluster.name, serverName, false);
          logger.info(`ASA binaries updated for cluster server: ${serverName}`);
          return { success: true };
        }
      }

      // If not found in clusters, try as standalone server
      logger.info(
        `Server ${serverName} not found in clusters, trying as standalone server`,
      );
      await this.installForServer(serverName);
      logger.info(`ASA binaries updated for standalone server: ${serverName}`);
      return { success: true };
    } catch (error) {
      logger.error(
        `Failed to update ASA binaries for server ${serverName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Update ASA binaries for all servers
   */
  async updateAll() {
    try {
      logger.info("Updating ASA binaries for all servers...");
      await fs.mkdir(this.serversPath, { recursive: true }); // Ensure serversPath exists
      const servers = await fs.readdir(this.serversPath);
      const results = [];

      for (const serverName of servers) {
        try {
          const serverPath = path.join(this.serversPath, serverName);
          const stat = await fs.stat(serverPath);

          if (stat.isDirectory()) {
            logger.info(`Updating server: ${serverName}`);
            await this.updateForServer(serverName);
            results.push({ server: serverName, success: true });
          }
        } catch (error) {
          logger.error(`Failed to update server ${serverName}:`, error);
          results.push({
            server: serverName,
            success: false,
            error: error.message,
          });
        }
      }

      logger.info("All server binary updates completed");
      return { success: true, results };
    } catch (error) {
      logger.error("Failed to update all server binaries:", error);
      throw error;
    }
  }

  /**
   * Verify ASA binaries installation for a server
   */
  async verifyInstallation(serverPath, serverType = "cluster") {
    try {
      const adapter = gameFor(this.gameType || "ark");
      let exePath;
      if (serverType === "cluster") {
        exePath = path.join(serverPath, adapter.binaryExeRelPath);
      } else {
        exePath = path.join(serverPath, "binaries", adapter.binaryExeRelPath);
      }

      await fs.access(exePath);
      const stats = await fs.stat(exePath);

      return {
        installed: true,
        executable: exePath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
      };
    } catch (error) {
      return {
        installed: false,
        executable: null,
        error: error.message,
      };
    }
  }

  /**
   * Helper method to list clusters (needed for updateForServer)
   */
  /**
   * Fallback: copy binaries from the global SteamCMD install when
   * force_install_dir fails (state 0x6 - cross-install conflict).
   * The global install in steamcmd/steamapps/common/ is always kept
   * up to date by SteamCMD's own update mechanism.
   */
  async _copyFromGlobalInstall(serverPath, serverName, adapter) {
    const globalInstallPath = path.join(
      this.steamCmdManager.steamCmdPath,
      "steamapps",
      "common",
      "ARK Survival Ascended Dedicated Server",
    );
    const globalExe = path.join(globalInstallPath, adapter.binaryExeRelPath);
    const globalExists = await fs
      .access(globalExe)
      .then(() => true)
      .catch(() => false);

    if (!globalExists) {
      throw new Error(
        `No global install found at ${globalInstallPath} and SteamCMD install failed for ${serverName}`,
      );
    }

    logger.info(
      `Falling back to global install at ${globalInstallPath} for ${serverName}...`,
    );

    // Copy the main executable
    const serverExe = path.join(serverPath, adapter.binaryExeRelPath);
    await fs.mkdir(path.dirname(serverExe), { recursive: true });
    await fs.copyFile(globalExe, serverExe);

    // Copy supporting DLLs from the root of the global install
    const globalRootFiles = [
      "steamclient.dll",
      "steamclient64.dll",
      "steamwebrtc.dll",
      "steamwebrtc64.dll",
      "tier0_s.dll",
      "tier0_s64.dll",
      "vstdlib_s.dll",
      "vstdlib_s64.dll",
    ];
    for (const file of globalRootFiles) {
      const srcPath = path.join(globalInstallPath, file);
      const dstPath = path.join(serverPath, file);
      try {
        await fs.copyFile(srcPath, dstPath);
      } catch {
        logger.warn(`Could not copy ${file} from global install`);
      }
    }

    // Copy the appmanifest to track the correct build ID
    const manifestSrc = path.join(
      this.steamCmdManager.steamCmdPath,
      "steamapps",
      `appmanifest_${adapter.steamAppId}.acf`,
    );
    const manifestDst = path.join(
      serverPath,
      "steamapps",
      `appmanifest_${adapter.steamAppId}.acf`,
    );
    try {
      await fs.mkdir(path.dirname(manifestDst), { recursive: true });
      await fs.copyFile(manifestSrc, manifestDst);
    } catch {
      logger.warn(`Could not copy appmanifest from global install`);
    }

    logger.info(
      `Fallback binary copy completed for ${serverName} (from global install)`,
    );
  }

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
}
