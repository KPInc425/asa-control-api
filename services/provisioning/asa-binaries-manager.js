import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import logger from '../../utils/logger.js';
import { getAllServerConfigs } from '../database.js';

const execAsync = promisify(exec);

/**
 * ASA Binaries Manager
 * Handles ASA server binary installation, verification, and management
 */
export class ASABinariesManager {
  constructor(steamCmdManager, basePath, clustersPath, serversPath) {
    this.steamCmdManager = steamCmdManager;
    this.basePath = basePath;
    this.clustersPath = clustersPath;
    this.serversPath = serversPath;
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
        const { execSync } = await import('child_process');
        
        logger.info(`Executing command in foreground: ${command}`);
        console.log(`\n=== Executing: ${command} ===\n`);
        
        execSync(command, {
          stdio: 'inherit',
          ...options
        });
        
        console.log(`\n=== Command completed successfully ===\n`);
        logger.info('Foreground command completed successfully');
        resolve({ success: true });
      } catch (error) {
        console.log(`\n=== Command failed ===\n`);
        logger.error('Foreground command failed:', error);
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
      const binariesPath = path.join(serverPath, 'binaries');
      
      logger.info(`Installing ASA binaries for server: ${serverName}`);
      
      // Create binaries directory
      await fs.mkdir(binariesPath, { recursive: true });
      
      // Use SteamCMD to install
      const steamCmdExe = this.steamCmdManager.getExecutablePath();
      
      // Create installation script
      const scriptPath = path.join(serverPath, 'install_asa.txt');
      const scriptContent = `@ShutdownOnFailedCommand 1
@NoPromptForPassword 1
login anonymous
force_install_dir "${binariesPath}"
app_update 2430930 validate
quit`;
      
      await fs.writeFile(scriptPath, scriptContent);
      
      // Run SteamCMD
      const command = `"${steamCmdExe}" +runscript "${scriptPath}"`;
      const { stdout, stderr } = await execAsync(command, { timeout: 900000 });
      
      if (stderr) {
        logger.warn(`SteamCMD stderr for ${serverName}: ${stderr}`);
      }
      
      // Verify installation
      const serverExe = path.join(binariesPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
      const exists = await fs.access(serverExe).then(() => true).catch(() => false);
      
      if (!exists) {
        throw new Error(`ASA server executable not found at ${serverExe} after installation`);
      }
      
      // Clean up script
      await fs.unlink(scriptPath);
      
      logger.info(`ASA binaries installed successfully for server: ${serverName}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to install ASA binaries for server ${serverName}:`, error);
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
      logger.info(`Installing ASA binaries for server: ${serverName} in cluster ${clusterName} (foreground: ${foreground})`);
      this.emitProgress?.(`Created server directory: ${serverPath}`);
      
      // Use the correct SteamCMD path with proper escaping
      const steamCmdExe = this.steamCmdManager.getExecutablePath();
      const installPath = serverPath; // Install directly to server folder, not a binaries subfolder
      
      // Build the full SteamCMD command with proper error handling
      const steamCmdCommand = `"${steamCmdExe}" +force_install_dir "${installPath}" +login anonymous +app_update 2430930 validate +quit`;
      
      if (foreground) {
        console.log(`Installing ASA binaries for ${serverName}...`);
        console.log('This may take several minutes depending on your internet connection...');
        
        // Write the .bat file
        const batPath = path.join(this.clustersPath, clusterName, `install_${serverName}.bat`);
        const batContent = `@echo off\n${steamCmdCommand}\n`;
        await fs.writeFile(batPath, batContent);
        
        // Debug: Ensure batch file exists and log contents
        await fs.access(batPath); // Throws if not found
        logger.info(`Batch file exists at: ${batPath}`);
        logger.info(`Batch file contents:\n${batContent}`);
        logger.info(`Current working directory for exec: ${path.dirname(batPath)}`);
        
        // Run the .bat file in foreground
        await this.execForeground(`cmd /c "${batPath}"`, {
          cwd: path.dirname(batPath),
          timeout: 900000 // 15 minute timeout
        });
        
        // Clean up .bat file
        await fs.unlink(batPath);
      } else {
        // Write the .bat file with better error handling
        const batPath = path.join(this.clustersPath, clusterName, 'install_asa.bat');
        const batContent = `@echo off
echo Installing ASA binaries for ${serverName}...
echo SteamCMD path: ${steamCmdExe}
echo Install path: ${installPath}

${steamCmdCommand}

echo Installation completed with exit code: %ERRORLEVEL%
if %ERRORLEVEL% NEQ 0 (
    echo SteamCMD exited with error code: %ERRORLEVEL%
    echo Checking if files were actually downloaded...
    if exist "${path.join(serverPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe')}" (
        echo ASA server executable found - installation may have succeeded despite error code
        exit 0
    ) else (
        echo ASA server executable not found - installation failed
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
        logger.info(`Current working directory for exec: ${path.dirname(batPath)}`);
        
        // Run the .bat file
        logger.info(`Running install batch: ${batPath}`);
        logger.info(`SteamCMD command: ${steamCmdCommand}`);
        
        try {
          const { stdout, stderr } = await execAsync(`cmd /c "${batPath}"`, {
            cwd: path.dirname(batPath),
            timeout: 900000 // 15 minute timeout
          });
          
          if (stderr) {
            logger.warn(`SteamCMD stderr for ${serverName}: ${stderr}`);
          }
          if (stdout) {
            logger.info(`SteamCMD stdout for ${serverName}: ${stdout.substring(0, 500)}...`);
          }
          
          // Check if the installation was successful by looking for key files
          const arkServerExe = path.join(serverPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
          const exists = await fs.access(arkServerExe).then(() => true).catch(() => false);
          
          if (!exists) {
            throw new Error(`ASA server executable not found at ${arkServerExe} after installation`);
          }
          
          logger.info(`ASA server executable verified at: ${arkServerExe}`);
        } catch (execError) {
          logger.error(`SteamCMD execution failed for ${serverName}:`, execError);
          
          // Check if the installation actually succeeded despite the error
          const arkServerExe = path.join(serverPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
          const exists = await fs.access(arkServerExe).then(() => true).catch(() => false);
          
          if (exists) {
            logger.info(`ASA server executable found despite error, continuing: ${arkServerExe}`);
          } else {
            // If it's a timeout error, provide a more helpful message
            if (execError.code === 'ETIMEDOUT' || execError.message.includes('timeout')) {
              throw new Error(`SteamCMD update timed out for ${serverName}. The update may still be running in the background. Please check the server files or try again later.`);
            }
            throw execError;
          }
        } finally {
          // Clean up .bat file
          await fs.unlink(batPath);
        }
      }
      
      // Verify installation by checking for key files
      const arkServerExe = path.join(serverPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
      const shooterGameDir = path.join(serverPath, 'ShooterGame');
      
      try {
        await fs.access(arkServerExe);
        logger.info(`ASA server executable verified: ${arkServerExe}`);
        
        // Check if ShooterGame directory exists and has content
        const shooterGameStats = await fs.stat(shooterGameDir);
        if (shooterGameStats.isDirectory()) {
          const contents = await fs.readdir(shooterGameDir);
          logger.info(`ShooterGame directory contents: ${contents.join(', ')}`);
        }
        
        this.emitProgress?.(`ASA binaries installed for server: ${serverName}`);
        logger.info(`ASA binaries installed for server: ${serverName} in cluster ${clusterName}`);
      } catch (accessError) {
        logger.error(`Installation verification failed for ${serverName}:`, accessError);
        throw new Error(`ASA server executable not found at ${arkServerExe} after installation`);
      }
    } catch (error) {
      logger.error(`Failed to install ASA binaries for server ${serverName} in cluster ${clusterName}:`, error);
      this.emitProgress?.(`Failed to install ASA binaries for server ${serverName}: ${error.message}`);
      
      // Provide more specific error messages
      let errorMessage = `Failed to install ASA binaries for server ${serverName}`;
      if (error.message) {
        if (error.message.includes('ENOENT')) {
          errorMessage = `Failed to access SteamCMD or create directories for server ${serverName}`;
        } else if (error.message.includes('timeout')) {
          errorMessage = `SteamCMD installation timed out for server ${serverName}. Please try again.`;
        } else if (error.message.includes('steamcmd')) {
          errorMessage = `SteamCMD installation failed for server ${serverName}. Please check if SteamCMD is properly installed.`;
        } else if (error.message.includes('ArkAscendedServer.exe')) {
          errorMessage = `ASA server files not found after installation for server ${serverName}. Installation may have failed.`;
        } else {
          errorMessage = error.message;
        }
      }
      
      // Log additional debugging information
      logger.error(`Error details for ${serverName}:`, {
        errorCode: error.code,
        errorMessage: error.message,
        serverPath: serverPath,
        steamCmdExe: this.steamCmdManager.getExecutablePath()
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
        const server = cluster.config.servers?.find(s => s.name === serverName);
        if (server) {
          // It's a cluster server, use the cluster-specific update method
          logger.info(`Server ${serverName} is a cluster server, using cluster update method`);
          await this.installForServerInCluster(cluster.name, serverName, false);
          logger.info(`ASA binaries updated for cluster server: ${serverName}`);
          return { success: true };
        }
      }
      
      // If not found in clusters, try as standalone server
      logger.info(`Server ${serverName} not found in clusters, trying as standalone server`);
      await this.installForServer(serverName);
      logger.info(`ASA binaries updated for standalone server: ${serverName}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to update ASA binaries for server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Update ASA binaries for all servers
   */
  async updateAll() {
    try {
      logger.info('Updating ASA binaries for all servers...');
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
          results.push({ server: serverName, success: false, error: error.message });
        }
      }
      
      logger.info('All server binary updates completed');
      return { success: true, results };
    } catch (error) {
      logger.error('Failed to update all server binaries:', error);
      throw error;
    }
  }

  /**
   * Verify ASA binaries installation for a server
   */
  async verifyInstallation(serverPath, serverType = 'cluster') {
    try {
      let exePath;
      if (serverType === 'cluster') {
        exePath = path.join(serverPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
      } else {
        exePath = path.join(serverPath, 'binaries', 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
      }
      
      await fs.access(exePath);
      const stats = await fs.stat(exePath);
      
      return {
        installed: true,
        executable: exePath,
        size: stats.size,
        modified: stats.mtime.toISOString()
      };
    } catch (error) {
      return {
        installed: false,
        executable: null,
        error: error.message
      };
    }
  }

  /**
   * Helper method to list clusters (needed for updateForServer)
   */
  async listClusters() {
    try {
      const dbConfigs = getAllServerConfigs();
      const clustersMap = new Map();
      for (const config of dbConfigs) {
        let serverConfig;
        try {
          serverConfig = JSON.parse(config.config_data);
        } catch {
          continue;
        }
        const clusterId = serverConfig.clusterId || 'standalone';
        if (!clustersMap.has(clusterId)) {
          clustersMap.set(clusterId, {
            name: clusterId,
            created: serverConfig.created || config.updated_at,
            servers: [],
          });
        }
        clustersMap.get(clusterId).servers.push(serverConfig);
      }
      const clusters = Array.from(clustersMap.values()).map(cluster => ({
        name: cluster.name,
        created: cluster.created,
        serverCount: cluster.servers.length,
        config: { name: cluster.name, servers: cluster.servers },
      }));
      return clusters.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      logger.error('Failed to list clusters (DB-native):', error);
      return [];
    }
  }
} 
