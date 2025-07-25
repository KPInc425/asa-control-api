import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import https from 'https';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import os from 'os';
import { existsSync, statSync } from 'fs';
import { SteamCmdManager } from './provisioning/steam-cmd-manager.js';
import { SystemInfo } from './provisioning/system-info.js';
import { ASABinariesManager } from './provisioning/asa-binaries-manager.js';
import { ConfigGenerator } from './provisioning/config-generator.js';
import { ScriptGenerator } from './provisioning/script-generator.js';
import { ClusterManager } from './provisioning/cluster-manager.js';
import { ServerManager } from './provisioning/server-manager.js';

const execAsync = promisify(exec);

/**
 * Server Provisioning Service
 * Handles installation, updates, and management of ASA servers
 * Updated for separate binary architecture
 */
export class ServerProvisioner {
  constructor() {
    logger.info(`ServerProvisioner constructor - NATIVE_BASE_PATH env: ${process.env.NATIVE_BASE_PATH}`);
    logger.info(`ServerProvisioner constructor - config.server.native.basePath: ${config.server.native.basePath}`);
    
    this.basePath = config.server.native.basePath || process.env.NATIVE_BASE_PATH || 'C:\\ARK';
    logger.info(`ServerProvisioner constructor - final basePath: ${this.basePath}`);
    
    // Updated paths for separate binary architecture
    this.serversPath = process.env.NATIVE_SERVERS_PATH || (config.server && config.server.native && config.server.native.serversPath) || (config.server && config.server.native && config.server.native.basePath ? path.join(config.server.native.basePath, 'servers') : null);
    this.clustersPath = process.env.NATIVE_CLUSTERS_PATH || (config.server && config.server.native && config.server.native.clustersPath) || (config.server && config.server.native && config.server.native.basePath ? path.join(config.server.native.basePath, 'clusters') : null);
    if (!this.serversPath || !this.clustersPath) {
      logger.error('ServerProvisioner: Missing serversPath or clustersPath in configuration.');
    }

    // Initialize managers
    this.steamCmdManager = new SteamCmdManager(this.basePath);
    this.systemInfo = new SystemInfo(this.basePath, this.clustersPath, this.serversPath);
    this.asaBinariesManager = new ASABinariesManager(this.steamCmdManager, this.basePath, this.clustersPath, this.serversPath);
    this.configGenerator = new ConfigGenerator(this.basePath);
    this.scriptGenerator = new ScriptGenerator(this.basePath, this.clustersPath, this.serversPath);
    this.clusterManager = new ClusterManager(this.basePath, this.clustersPath, this.serversPath, this.asaBinariesManager, this.configGenerator, this.scriptGenerator);
    this.serverManager = new ServerManager(this.basePath, this.clustersPath, this.serversPath, this.asaBinariesManager, this.configGenerator, this.scriptGenerator);
    
    // Update paths in sub-managers
    this.configGenerator.updatePaths(this.basePath, this.clustersPath, this.serversPath);
    
    // Update legacy properties for compatibility
    this.steamCmdPath = this.steamCmdManager.getInstallationPath();
    this.steamCmdExe = this.steamCmdManager.getExecutablePath();
    this.autoInstallSteamCmd = config.server.native.autoInstallSteamCmd !== false;
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
          stdio: 'inherit', // This makes the output visible in the terminal
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
   * Create necessary directories for the provisioning system
   */
  async createDirectories() {
    try {
      logger.info('Creating necessary directories...');
      
      const directories = [
        this.basePath,
        this.serversPath,
        this.clustersPath,
        this.steamCmdPath
      ];
      
      for (const dir of directories) {
        await fs.mkdir(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
      
      logger.info('All necessary directories created successfully');
      return { success: true, message: 'Directories created successfully' };
    } catch (error) {
      logger.error('Failed to create directories:', error);
      throw error;
    }
  }

  /**
   * Initialize the provisioning system
   */
  async initialize() {
    try {
      logger.info('Initializing server provisioning system...');
      
      // Create necessary directories
      await this.createDirectories();
      
      // Check SteamCMD availability (don't install automatically)
      await this.checkSteamCmdAvailability();
      
      // Check ASA binaries availability (don't install automatically)
      await this.checkASABinariesAvailability();
      
      logger.info('Server provisioning system initialized successfully');
      return { success: true, message: 'Provisioning system ready' };
    } catch (error) {
      logger.error('Failed to initialize provisioning system:', error);
      throw error;
    }
  }

  /**
   * Check SteamCMD availability without installing
   */
  async checkSteamCmdAvailability() {
    return await this.steamCmdManager.checkAvailability();
  }

  /**
   * Check ASA binaries availability without installing
   */
  async checkASABinariesAvailability() {
    const asaBinariesInstalled = await this.systemInfo.checkASABinariesInstalled();
    if (asaBinariesInstalled) {
      logger.info('ASA binaries found in existing servers');
      return { success: true, message: 'ASA binaries available' };
    } else {
      logger.warn('No ASA binaries found in any servers. Create a cluster to install ASA binaries.');
      return { success: false, message: 'ASA binaries not found' };
    }
  }

  /**
   * Get SteamCMD installation status
   */
  async isSteamCmdInstalled() {
    return await this.steamCmdManager.isInstalled();
  }

  /**
   * Install SteamCMD
   */
  async installSteamCmd(foreground = false) {
    return await this.steamCmdManager.install(foreground);
  }

  /**
   * Find existing SteamCMD installations
   */
  async findExistingSteamCmd() {
    return await this.steamCmdManager.findExisting();
  }

  /**
   * Ensure SteamCMD is available (for explicit installation)
   */
  async ensureSteamCmd() {
    return await this.steamCmdManager.ensure();
  }

  /**
   * Install ASA server binaries
   */
  async installASABinaries(foreground = false) {
    const startTime = Date.now();
    const appId = '2430930'; // ASA Dedicated Server App ID
    
    logger.info(`[ASA Install] Starting ASA server binaries installation (foreground: ${foreground})`);
    logger.info(`[ASA Install] App ID: ${appId}`);
    logger.info(`[ASA Install] Target directory: ${this.sharedBinariesPath}`);
    logger.info(`[ASA Install] SteamCMD executable: ${this.steamCmdExe}`);
    
    try {
      // Check if binaries already exist
      try {
        const existingBinaries = path.join(this.sharedBinariesPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
        await fs.access(existingBinaries);
        logger.info(`[ASA Install] Existing binaries found at: ${existingBinaries}`);
        
        // Get existing binary info
        const stats = await fs.stat(existingBinaries);
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
        logger.info(`[ASA Install] Existing binary size: ${fileSizeMB}MB, modified: ${stats.mtime.toISOString()}`);
      } catch (accessError) {
        logger.info(`[ASA Install] No existing binaries found, proceeding with fresh installation`);
      }
      
      const installScript = `
        @ShutdownOnFailedCommand 1
        @NoPromptForPassword 1
        login anonymous
        force_install_dir "${this.sharedBinariesPath}"
        app_update ${appId} validate
        quit
      `;
      
      const scriptPath = path.join(this.steamCmdPath, 'install_asa.txt');
      logger.info(`[ASA Install] Creating SteamCMD script: ${scriptPath}`);
      await fs.writeFile(scriptPath, installScript);
      logger.info(`[ASA Install] Script content written successfully`);
      
      const command = `"${this.steamCmdExe}" +runscript "${scriptPath}"`;
      logger.info(`[ASA Install] Executing command: ${command}`);
      
      if (foreground) {
        console.log('\n=== Installing ASA Server Binaries ===');
        console.log('This may take several minutes depending on your internet connection...');
        logger.info(`[ASA Install] Running in foreground mode`);
        
        const execStartTime = Date.now();
        await this.execForeground(command);
        const execDuration = Date.now() - execStartTime;
        logger.info(`[ASA Install] Foreground execution completed in ${execDuration}ms`);
      } else {
        logger.info(`[ASA Install] Running in background mode`);
        const execStartTime = Date.now();
        const { stdout, stderr } = await execAsync(command, { timeout: 1800000 }); // 30 minute timeout
        const execDuration = Date.now() - execStartTime;
        
        logger.info(`[ASA Install] Background execution completed in ${execDuration}ms`);
        if (stdout) {
          logger.info(`[ASA Install] SteamCMD stdout: ${stdout.substring(0, 1000)}${stdout.length > 1000 ? '... (truncated)' : ''}`);
        }
        if (stderr) {
          logger.warn(`[ASA Install] SteamCMD stderr: ${stderr.substring(0, 1000)}${stderr.length > 1000 ? '... (truncated)' : ''}`);
        }
      }
      
      // Clean up script
      logger.info(`[ASA Install] Cleaning up script file: ${scriptPath}`);
      await fs.unlink(scriptPath);
      logger.info(`[ASA Install] Script file removed`);
      
      // Verify installation
      const serverExePath = path.join(this.sharedBinariesPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
      logger.info(`[ASA Install] Verifying installation at: ${serverExePath}`);
      
      try {
        await fs.access(serverExePath);
        const stats = await fs.stat(serverExePath);
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
        const totalDuration = Date.now() - startTime;
        
        logger.info(`[ASA Install] Installation verified successfully`);
        logger.info(`[ASA Install] Server executable size: ${fileSizeMB}MB`);
        logger.info(`[ASA Install] Total installation time: ${totalDuration}ms`);
        
        if (foreground) {
          console.log('\n=== ASA Server Binaries installed successfully ===');
        }
        
        return { success: true, message: 'ASA binaries installed', installationTime: totalDuration, binarySize: fileSizeMB };
      } catch (verifyError) {
        const error = new Error(`ASA installation verification failed: ${verifyError.message}`);
        logger.error(`[ASA Install] ${error.message}`);
        throw error;
      }
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      logger.error(`[ASA Install] Installation failed after ${totalDuration}ms:`, error);
      logger.error(`[ASA Install] Error details: ${error.message}`);
      logger.error(`[ASA Install] Stack trace: ${error.stack}`);
      throw error;
    }
  }

  /**
   * Ensure ASA binaries are available (for explicit installation)
   */
  async ensureASABinaries() {
    try {
      const serverExe = path.join(this.sharedBinariesPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
      await fs.access(serverExe);
      logger.info('ASA binaries already installed');
      return { success: true, message: 'ASA binaries available' };
    } catch (error) {
      logger.info('ASA binaries not found, installing...');
      return await this.installASABinaries();
    }
  }

  /**
   * Update ASA server binaries
   */
  async updateASABinaries() {
    const startTime = Date.now();
    const appId = '2430930';
    
    logger.info(`[ASA Update] Starting ASA server binaries update`);
    logger.info(`[ASA Update] App ID: ${appId}`);
    logger.info(`[ASA Update] Target directory: ${this.sharedBinariesPath}`);
    logger.info(`[ASA Update] SteamCMD executable: ${this.steamCmdExe}`);
    
    try {
      // Get current binary info before update
      const serverExePath = path.join(this.sharedBinariesPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
      let beforeUpdateInfo = null;
      
      try {
        const beforeStats = await fs.stat(serverExePath);
        beforeUpdateInfo = {
          size: beforeStats.size,
          sizeMB: (beforeStats.size / 1024 / 1024).toFixed(2),
          modified: beforeStats.mtime.toISOString()
        };
        logger.info(`[ASA Update] Current binary info: ${beforeUpdateInfo.sizeMB}MB, modified: ${beforeUpdateInfo.modified}`);
      } catch (statError) {
        logger.warn(`[ASA Update] Could not read current binary info: ${statError.message}`);
      }
      
      const updateScript = `
        @ShutdownOnFailedCommand 1
        @NoPromptForPassword 1
        force_install_dir "${this.sharedBinariesPath}"
        app_update ${appId}
        quit
      `;
      
      const scriptPath = path.join(this.steamCmdPath, 'update_asa.txt');
      logger.info(`[ASA Update] Creating SteamCMD update script: ${scriptPath}`);
      await fs.writeFile(scriptPath, updateScript);
      logger.info(`[ASA Update] Update script written successfully`);
      
      const command = `"${this.steamCmdExe}" +runscript "${scriptPath}"`;
      logger.info(`[ASA Update] Executing update command: ${command}`);
      
      const execStartTime = Date.now();
      const { stdout, stderr } = await execAsync(command, { timeout: 900000 }); // 15 minute timeout
      const execDuration = Date.now() - execStartTime;
      
      logger.info(`[ASA Update] Update execution completed in ${execDuration}ms`);
      
      if (stdout) {
        logger.info(`[ASA Update] SteamCMD stdout: ${stdout.substring(0, 1000)}${stdout.length > 1000 ? '... (truncated)' : ''}`);
      }
      if (stderr) {
        logger.warn(`[ASA Update] SteamCMD stderr: ${stderr.substring(0, 1000)}${stderr.length > 1000 ? '... (truncated)' : ''}`);
      }
      
      // Clean up script
      logger.info(`[ASA Update] Cleaning up update script: ${scriptPath}`);
      await fs.unlink(scriptPath);
      logger.info(`[ASA Update] Script file removed`);
      
      // Verify and compare update results
      logger.info(`[ASA Update] Verifying update results`);
      try {
        const afterStats = await fs.stat(serverExePath);
        const afterUpdateInfo = {
          size: afterStats.size,
          sizeMB: (afterStats.size / 1024 / 1024).toFixed(2),
          modified: afterStats.mtime.toISOString()
        };
        
        const totalDuration = Date.now() - startTime;
        logger.info(`[ASA Update] Update completed successfully in ${totalDuration}ms`);
        logger.info(`[ASA Update] Updated binary info: ${afterUpdateInfo.sizeMB}MB, modified: ${afterUpdateInfo.modified}`);
        
        if (beforeUpdateInfo) {
          const sizeChange = afterStats.size - beforeUpdateInfo.size;
          const sizeChangeMB = (sizeChange / 1024 / 1024).toFixed(2);
          logger.info(`[ASA Update] Size change: ${sizeChangeMB}MB (${sizeChange > 0 ? '+' : ''}${sizeChange} bytes)`);
          
          if (beforeUpdateInfo.modified !== afterUpdateInfo.modified) {
            logger.info(`[ASA Update] Binary was updated (modification time changed)`);
          } else {
            logger.info(`[ASA Update] Binary appears unchanged (same modification time)`);
          }
        }
        
        return { 
          success: true, 
          message: 'ASA binaries updated',
          updateTime: totalDuration,
          beforeUpdate: beforeUpdateInfo,
          afterUpdate: afterUpdateInfo
        };
      } catch (verifyError) {
        const error = new Error(`Update verification failed: ${verifyError.message}`);
        logger.error(`[ASA Update] ${error.message}`);
        throw error;
      }
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      logger.error(`[ASA Update] Update failed after ${totalDuration}ms:`, error);
      logger.error(`[ASA Update] Error details: ${error.message}`);
      logger.error(`[ASA Update] Stack trace: ${error.stack}`);
      throw error;
    }
  }

  // Helper: Find next available game port based on allocation mode
  getNextAvailableGamePort(existingServers, basePort = 7777, portAllocationMode = 'sequential') {
    // Gather all used ports
    const usedPorts = new Set();
    for (const server of existingServers) {
      if (server.gamePort) usedPorts.add(server.gamePort);
      if (server.queryPort) usedPorts.add(server.queryPort);
      if (server.rconPort) usedPorts.add(server.rconPort);
    }
    
    if (portAllocationMode === 'even') {
      // Even mode: Game ports increment by 2, Query/RCON use standard ASA offsets
      // Find the highest game port used, starting from basePort
      let maxGamePort = basePort - 2; // Start 2 less than base to ensure we start at basePort
      for (const server of existingServers) {
        if (server.gamePort && server.gamePort >= basePort && server.gamePort > maxGamePort) {
          maxGamePort = server.gamePort;
        }
      }
      
      // Start from basePort if no servers exist, otherwise use next even port
      let candidate = maxGamePort < basePort ? basePort : maxGamePort + 2;
      
      // Ensure candidate is even
      if (candidate % 2 !== 0) {
        candidate += 1;
      }
      
      // Ensure candidate and its ASA offsets are all unused
      // ASA uses: Game Port, Query Port (Game Port + 1), RCON Port (Game Port + 2)
      while (
        usedPorts.has(candidate) ||
        usedPorts.has(candidate + 1) ||
        usedPorts.has(candidate + 2)
      ) {
        candidate += 2;
      }
      
      return candidate;
    } else {
      // Sequential mode: Game ports increment by 1
      // Find the highest game port used, starting from basePort
      let maxGamePort = basePort - 1; // Start 1 less than base to ensure we start at basePort
      for (const server of existingServers) {
        if (server.gamePort && server.gamePort >= basePort && server.gamePort > maxGamePort) {
          maxGamePort = server.gamePort;
        }
      }
      
      // Start from basePort if no servers exist, otherwise use next sequential port
      let candidate = maxGamePort < basePort ? basePort : maxGamePort + 1;
      
      // Ensure candidate and its ASA offsets are all unused
      // ASA uses: Game Port, Query Port (Game Port + 1), RCON Port (Game Port + 2)
      while (
        usedPorts.has(candidate) ||
        usedPorts.has(candidate + 1) ||
        usedPorts.has(candidate + 2)
      ) {
        candidate += 1;
      }
      
      return candidate;
    }
  }

  /**
   * Create a new server with its own complete installation
   */
  async createServer(serverConfig) {
    return await this.serverManager.createServer(serverConfig);
  }

  /**
   * Create a new server with its own complete installation (LEGACY)
   */
  async createServerLegacy(serverConfig) {
    try {
      const serverName = serverConfig.name;
      const serverPath = path.join(this.serversPath, serverName);
      
      logger.info(`Creating server: ${serverName} at ${serverPath}`);
      
      // Create server directory structure
      const serverDirs = [
        serverPath,
        path.join(serverPath, 'binaries'),
        path.join(serverPath, 'configs'),
        path.join(serverPath, 'saves'),
        path.join(serverPath, 'logs')
      ];
      
      for (const dir of serverDirs) {
        await fs.mkdir(dir, { recursive: true });
      }
      
      // Install ASA binaries for this server
      await this.installASABinariesForServer(serverName);
      
      // Create server configuration
      await this.createServerConfig(serverPath, serverConfig);
      
      // Create startup script
      await this.createStartScript(serverPath, serverConfig);
      
      // Create stop script
      await this.createStopScript(serverPath, serverName);
      
      logger.info(`Server ${serverName} created successfully`);
      return { success: true, serverPath };
    } catch (error) {
      logger.error(`Failed to create server ${serverConfig.name}:`, error);
      throw error;
    }
  }

  /**
   * Install ASA binaries for a specific server
   */
  async installASABinariesForServer(serverName) {
    try {
      const serverPath = path.join(this.serversPath, serverName);
      const binariesPath = path.join(serverPath, 'binaries');
      
      logger.info(`Installing ASA binaries for server: ${serverName}`);
      
      // SteamCMD commands to install ASA
      const steamCmdCommands = [
        'force_install_dir ' + binariesPath.replace(/\\/g, '/'),
        'login anonymous',
        'app_update 2430930 validate',
        'quit'
      ];
      
      const scriptPath = path.join(serverPath, 'install_asa.txt');
      await fs.writeFile(scriptPath, steamCmdCommands.join('\n'));
      
      // Run SteamCMD
      const command = `"${this.steamCmdExe}" +runscript "${scriptPath}"`;
      await execAsync(command, { stdio: 'inherit' });
      
      // Clean up script
      await fs.unlink(scriptPath);
      
      logger.info(`ASA binaries installed for server: ${serverName}`);
    } catch (error) {
      logger.error(`Failed to install ASA binaries for server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Create server configuration files
   */
  async createServerConfig(serverPath, serverConfig) {
    try {
      const configsPath = path.join(serverPath, 'configs');
      
      // Create Game.ini
      const gameIni = this.generateGameIni(serverConfig);
      await fs.writeFile(path.join(configsPath, 'Game.ini'), gameIni);
      
      // Create GameUserSettings.ini
      const gameUserSettings = this.generateGameUserSettings(serverConfig);
      await fs.writeFile(path.join(configsPath, 'GameUserSettings.ini'), gameUserSettings);
      
      // Create server-config.json
      const serverConfigFile = {
        name: serverConfig.name,
        map: serverConfig.map || 'TheIsland',
        gamePort: serverConfig.gamePort || 7777,
        queryPort: serverConfig.queryPort || 27015,
        rconPort: serverConfig.rconPort || 32330,
        maxPlayers: serverConfig.maxPlayers || 70,
        adminPassword: serverConfig.adminPassword || 'admin123',
        serverPassword: serverConfig.serverPassword || '',
        rconPassword: serverConfig.adminPassword || 'admin123', // RCON password is same as admin password
        clusterId: serverConfig.clusterId || '',
        clusterPassword: serverConfig.clusterPassword || '',
        customDynamicConfigUrl: serverConfig.customDynamicConfigUrl || '',
        disableBattleEye: serverConfig.disableBattleEye || false,
        created: new Date().toISOString(),
        binariesPath: path.join(serverPath, 'binaries'),
        configsPath: configsPath,
        savesPath: path.join(serverPath, 'saves'),
        logsPath: path.join(serverPath, 'logs'),
        mods: serverConfig.mods || []
      };
      
      await fs.writeFile(
        path.join(serverPath, 'server-config.json'),
        JSON.stringify(serverConfigFile, null, 2)
      );
      
      logger.info(`Server configuration created for: ${serverConfig.name}`);
    } catch (error) {
      logger.error(`Failed to create server configuration for ${serverConfig.name}:`, error);
      throw error;
    }
  }

  /**
   * Create startup script for a server
   */
  async createStartScript(serverPath, serverConfig) {
    try {
      const serverName = serverConfig.name;
      const binariesPath = path.join(serverPath, 'binaries');
      const configsPath = path.join(serverPath, 'configs');
      const savesPath = path.join(serverPath, 'saves');
      const logsPath = path.join(serverPath, 'logs');
      
      // Add BattleEye flag based on server configuration
      const battleEyeArg = serverConfig.disableBattleEye ? ' -NoBattleEye' : '';
      
      // Use customDynamicConfigUrl if provided
      const customUrl = serverConfig.customDynamicConfigUrl || '';
      const customUrlArg = customUrl ? `?customdynamicconfigurl=\"${customUrl}\"` : '';
      
      const startScript = `@echo off
echo Starting ${serverName}...
cd /d "${binariesPath}"

REM Set server parameters (passwords are in config files)
set MAP=${(serverConfig.map || 'TheIsland')}_WP
set PORT=${serverConfig.gamePort || 7777}
set QUERYPORT=${serverConfig.queryPort || 27015}
set RCONPORT=${serverConfig.rconPort || 32330}
set MAXPLAYERS=${serverConfig.maxPlayers || 70}
set CLUSTERID=${serverConfig.clusterId || ''}
set CLUSTERPASSWORD=${serverConfig.clusterPassword || ''}

REM Set paths
set CONFIGPATH=${configsPath}
set SAVEPATH=${savesPath}
set LOGPATH=${logsPath}

REM Start the server (passwords are in GameUserSettings.ini)
"${path.join(binariesPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe')}" \\
  %MAP%?listen?Port=%PORT%?QueryPort=%QUERYPORT%?RCONPort=%RCONPORT% \\
  ?MaxPlayers=%MAXPLAYERS% \\
  ?ClusterId=%CLUSTERID% \\
  ?ClusterPassword=%CLUSTERPASSWORD% \\
  ?AltSaveDirectoryName=%SAVEPATH% \\
  ?ConfigOverridePath=%CONFIGPATH% \\
  ?LogPath=%LOGPATH%${customUrlArg}${battleEyeArg}

pause`;

      await fs.writeFile(path.join(serverPath, 'start.bat'), startScript);
      logger.info(`Start script created for server: ${serverName}`);
      logger.info(`BattleEye disabled: ${serverConfig.disableBattleEye || false}`);
    } catch (error) {
      logger.error(`Failed to create start script for ${serverConfig.name}:`, error);
      throw error;
    }
  }

  /**
   * Create stop script for a server
   */
  async createStopScript(serverPath, serverName) {
    try {
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
      await fs.writeFile(path.join(serverPath, `stop_${serverName}.ps1`), psScript);
      await fs.writeFile(path.join(serverPath, 'stop.bat'), stopScript);
      
      logger.info(`Stop script created for server: ${serverName}`);
    } catch (error) {
      logger.error(`Failed to create stop script for ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Create a cluster with multiple servers
   */
  async createCluster(clusterConfig, foreground = false) {
    return await this.clusterManager.createCluster(clusterConfig, foreground);
  }

  /**
   * Create a cluster with multiple servers (LEGACY - keeping implementation for safety)
   */
  async createClusterLegacy(clusterConfig, foreground = false) {
    logger.info('[createCluster] Method entered');
    try {
      // Defensive checks for required fields
      if (!clusterConfig || typeof clusterConfig !== 'object') {
        throw new Error('Missing or invalid clusterConfig object');
      }
      // Accept either 'name' or 'clusterName' for compatibility
      const clusterName = clusterConfig.name || clusterConfig.clusterName;
      if (!clusterName || typeof clusterName !== 'string' || !clusterName.trim()) {
        throw new Error('Invalid or missing clusterName');
      }
      if (!this.clustersPath || typeof this.clustersPath !== 'string' || !this.clustersPath.trim()) {
        throw new Error('Invalid or missing clustersPath');
      }
      // Log incoming config for debugging
      logger.info('[createCluster] Incoming clusterConfig:', JSON.stringify(clusterConfig, null, 2));
      const clusterPath = path.join(this.clustersPath, clusterName);
      this.emitProgress?.(`Validating configuration for cluster: ${clusterName}`);
      logger.info(`Creating cluster: ${clusterName} (foreground: ${foreground})`);
      
      if (foreground) {
        console.log(`\n=== Creating Cluster: ${clusterName} ===`);
      }
      
      // Create cluster directory
      this.emitProgress?.(`Creating cluster directory structure`);
      await fs.mkdir(clusterPath, { recursive: true });
      
      // Create comprehensive cluster configuration
      const clusterData = {
        name: clusterName,
        description: clusterConfig.description || '',
        basePort: clusterConfig.basePort || 7777,
        serverCount: clusterConfig.servers?.length || 0,
        selectedMaps: clusterConfig.selectedMaps || [],
        globalMods: clusterConfig.globalMods || [],
        servers: [],
        created: clusterConfig.created || new Date().toISOString(),
        globalSettings: clusterConfig.globalSettings || {},
        clusterSettings: clusterConfig.clusterSettings || {
          clusterId: clusterName,
          clusterName: clusterName,
          clusterDescription: clusterConfig.description || '',
          clusterPassword: clusterConfig.clusterPassword || '',
          clusterOwner: 'Admin'
        },
        portConfiguration: clusterConfig.portConfiguration || {
          basePort: clusterConfig.basePort || 7777,
          portAllocationMode: clusterConfig.portAllocationMode || 'sequential',
          portIncrement: (clusterConfig.portAllocationMode || 'sequential') === 'even' ? 2 : 1,
          queryPortBase: (clusterConfig.portAllocationMode || 'sequential') === 'even' ? 
            (clusterConfig.basePort || 7777) + 1 : (clusterConfig.basePort || 7777) + 1,
          queryPortIncrement: (clusterConfig.portAllocationMode || 'sequential') === 'even' ? 2 : 1,
          rconPortBase: (clusterConfig.portAllocationMode || 'sequential') === 'even' ? 
            (clusterConfig.basePort || 7777) + 2 : (clusterConfig.basePort || 7777) + 2,
          rconPortIncrement: (clusterConfig.portAllocationMode || 'sequential') === 'even' ? 2 : 1
        }
      };
      
      // Create servers for the cluster
      if (clusterConfig.servers && clusterConfig.servers.length > 0) {
        if (foreground) {
          console.log(`\n=== Installing ${clusterConfig.servers.length} servers ===`);
          console.log('Servers will be installed sequentially to avoid file locks...');
        }
        // Merge globalMods into each server's mods array unless excludeSharedMods is true
        const globalMods = Array.isArray(clusterConfig.globalMods) ? clusterConfig.globalMods : [];
        for (let i = 0; i < clusterConfig.servers.length; i++) {
          const serverConfig = clusterConfig.servers[i];
          const serverName = serverConfig.name;
          const serverPath = path.join(clusterPath, serverName); // PATCH: Define serverPath before use
          logger.info(`Creating server: ${serverName} in cluster ${clusterName}`);
          await fs.mkdir(clusterPath, { recursive: true });
          await this.installASABinariesForServerInCluster(clusterName, serverName, foreground);
          this.emitProgress?.(`Creating server configuration for ${serverName}`);
          await this.createServerConfigInCluster(clusterName, serverPath, serverConfig);
          this.emitProgress?.(`Creating startup script for ${serverName}`);
          await this.createStartScriptInCluster(clusterName, serverPath, { 
            ...serverConfig, 
            customDynamicConfigUrl: clusterConfig.customDynamicConfigUrl,
            disableBattleEye: clusterConfig.disableBattleEye || false
          });
          await this.createStopScriptInCluster(clusterName, serverPath, serverName);
          clusterData.servers.push({
            name: serverName,
            serverPath: serverPath,
            ...serverConfig
          });
          if (foreground) {
            console.log(`--- Server ${serverName} completed ---`);
          }
        }
      }
      
      // Save cluster configuration
      this.emitProgress?.(`Setting up cluster settings and finalizing configuration`);
      await fs.writeFile(
        path.join(clusterPath, 'cluster.json'),
        JSON.stringify(clusterData, null, 2)
      );
      this.emitProgress?.(`Cluster configuration saved: ${clusterPath}/cluster.json`);
      
      if (foreground) {
        console.log(`\n=== Cluster ${clusterName} created successfully with ${clusterData.servers.length} servers ===`);
      }
      logger.info(`Cluster ${clusterName} created with ${clusterData.servers.length} servers`);
      this.emitProgress?.(`Finalizing cluster creation - ${clusterName} created successfully with ${clusterData.servers.length} servers`);
      return { success: true, clusterPath, clusterData };
    } catch (error) {
      logger.error(`Failed to create cluster ${clusterConfig.name}:`, error);
      this.emitProgress?.(`Failed to create cluster: ${error.message}`);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to create cluster';
      if (error.message) {
        if (error.message.includes('ENOENT')) {
          errorMessage = 'Failed to create cluster directory or access SteamCMD';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'SteamCMD installation timed out. Please try again.';
        } else if (error.message.includes('steamcmd')) {
          errorMessage = 'SteamCMD installation failed. Please check if SteamCMD is properly installed.';
        } else {
          errorMessage = error.message;
        }
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Install ASA binaries for a specific server in a cluster
   */
  async installASABinariesForServerInCluster(clusterName, serverName, foreground = false) {
    return await this.asaBinariesManager.installForServerInCluster(clusterName, serverName, foreground);
  }

  /**
   * Create server configuration files in cluster
   */
  async createServerConfigInCluster(clusterName, serverPath, serverConfig) {
    return await this.configGenerator.createServerConfigInCluster(clusterName, serverPath, serverConfig);
  }

  /**
   * Create startup script for a server in cluster
   */
  async createStartScriptInCluster(clusterName, serverPath, serverConfig) {
    return await this.scriptGenerator.createStartScriptInCluster(clusterName, serverPath, serverConfig);
  }

  /**
   * Create stop script for a server in cluster
   */
  async createStopScriptInCluster(clusterName, serverPath, serverName) {
    return await this.scriptGenerator.createStopScriptInCluster(clusterName, serverPath, serverName);
  }

  /**
   * Get final configs for a server (global + server-specific)
   */
  async getFinalConfigsForServer(serverName) {
    return await this.configGenerator.getFinalConfigsForServer(serverName);
  }

  /**
   * Update ASA binaries for a specific server
   */
  async updateServerBinaries(serverName) {
    return await this.asaBinariesManager.updateForServer(serverName);
  }

    /**
   * Update ASA binaries for all servers
   */
  async updateAllServerBinaries() {
    return await this.asaBinariesManager.updateAll();
  }

  /**
   * List all servers
   */
  async listServers() {
    return await this.serverManager.listServers();
  }

  /**
   * List all servers (LEGACY)
   */
  async listServersLegacy() {
    try {
      const servers = [];
      await fs.mkdir(this.serversPath, { recursive: true }); // Ensure serversPath exists
      const serverDirs = await fs.readdir(this.serversPath);
      
      for (const serverName of serverDirs) {
        try {
          const serverPath = path.join(this.serversPath, serverName);
          const stat = await fs.stat(serverPath);
          
          if (stat.isDirectory()) {
            const configPath = path.join(serverPath, 'server-config.json');
            let serverConfig = {};
            
            try {
              const configContent = await fs.readFile(configPath, 'utf8');
              serverConfig = JSON.parse(configContent);
            } catch {
              // Server config not found, use defaults
            }
            
            servers.push({
              name: serverName,
              path: serverPath,
              config: serverConfig,
              created: serverConfig.created || stat.birthtime.toISOString()
            });
          }
        } catch (error) {
          logger.error(`Error reading server ${serverName}:`, error);
        }
      }
      
      return servers;
    } catch (error) {
      logger.error('Failed to list servers:', error);
      throw error;
    }
  }

  /**
   * List all clusters
   */
  async listClusters() {
    return await this.clusterManager.listClusters();
  }

  /**
   * List all clusters (LEGACY)
   */
  async listClustersLegacy() {
    try {
      const clusters = [];
      const clusterDirs = await fs.readdir(this.clustersPath);
      
      for (const clusterName of clusterDirs) {
        try {
          const clusterPath = path.join(this.clustersPath, clusterName);
          const stat = await fs.stat(clusterPath);
          
          if (stat.isDirectory()) {
            const configPath = path.join(clusterPath, 'cluster.json');
            let clusterConfig = {};
            
            try {
              const configContent = await fs.readFile(configPath, 'utf8');
              clusterConfig = JSON.parse(configContent);
      } catch {
              // Cluster config not found, use defaults
              clusterConfig = {
                name: clusterName,
                description: '',
                basePort: 7777,
                serverCount: 0,
                selectedMaps: [],
                globalMods: [],
                servers: [],
                created: stat.birthtime.toISOString(),
                globalSettings: {},
                clusterSettings: {
                  clusterId: clusterName,
                  clusterName: clusterName,
                  clusterDescription: '',
                  clusterPassword: '',
                  clusterOwner: 'Admin'
                },
                portConfiguration: {
                  basePort: 7777,
                  portIncrement: 1,
                  queryPortBase: 7777 + 19338,
                  queryPortIncrement: 1,
                  rconPortBase: 7777 + 24553,
                  rconPortIncrement: 1
                }
              };
            }
            
            clusters.push({
              name: clusterName,
              path: clusterPath,
              config: clusterConfig,
              created: clusterConfig.created || stat.birthtime.toISOString()
            });
          }
        } catch (error) {
          logger.error(`Error reading cluster ${clusterName}:`, error);
        }
      }
      
      return clusters;
    } catch (error) {
      logger.error('Failed to list clusters:', error);
      throw error;
    }
  }

  /**
   * Delete a server
   */
  async deleteServer(serverName) {
    return await this.serverManager.deleteServer(serverName);
  }

  /**
   * Delete a server (LEGACY)
   */
  async deleteServerLegacy(serverName) {
    try {
      const serverPath = path.join(this.serversPath, serverName);
      
      // Check if server exists
      try {
        await fs.access(serverPath);
      } catch {
        throw new Error(`Server ${serverName} not found`);
      }
      
      // Remove server directory
      const { execSync } = await import('child_process');
      execSync(`rmdir /s /q "${serverPath}"`, { stdio: 'inherit' });
      
      logger.info(`Server ${serverName} deleted successfully`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to delete server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Delete a cluster
   */
  async deleteCluster(clusterName, options = {}) {
    return await this.clusterManager.deleteCluster(clusterName, options);
  }

  /**
   * Delete a cluster (LEGACY)
   */
  async deleteClusterLegacy(clusterName, options = {}) {
    const { backupSaved = true, deleteFiles = true } = options;
    
    try {
      const clusterPath = path.join(this.clustersPath, clusterName);
      
      // Check if cluster exists
      let clusterExists = false;
      try {
        await fs.access(clusterPath);
        clusterExists = true;
      } catch {
        // Cluster doesn't exist, but we might still want to clean up
        logger.warn(`Cluster directory ${clusterPath} not found`);
      }

      // Backup saved data if requested and cluster exists
      let backupPath = null;
      if (backupSaved && clusterExists) {
        try {
          backupPath = await this.backupCluster(clusterName);
          logger.info(`Backed up cluster ${clusterName} to: ${backupPath}`);
        } catch (backupError) {
          logger.warn(`Failed to backup cluster ${clusterName}: ${backupError.message}`);
          // Continue with deletion even if backup fails
        }
      }

      // Kill any ArkAscendedServer.exe and steamcmd.exe processes before deletion
      try {
        const { execSync } = await import('child_process');
        execSync('taskkill /F /IM ArkAscendedServer.exe', { stdio: 'ignore' });
        execSync('taskkill /F /IM steamcmd.exe', { stdio: 'ignore' });
        logger.info('Killed ArkAscendedServer.exe and steamcmd.exe processes before cluster deletion');
      } catch (killError) {
        logger.warn('Failed to kill some processes before cluster deletion (may not be running):', killError.message);
      }

      if (deleteFiles && clusterExists) {
        // Try multiple deletion methods
        let deleted = false;
        
        // Method 1: Try fs.rm (Node 16+)
        try {
          await fs.rm(clusterPath, { recursive: true, force: true });
          logger.info(`Cluster ${clusterName} deleted successfully with fs.rm`);
          deleted = true;
        } catch (rmError) {
          logger.warn(`fs.rm failed for ${clusterName}: ${rmError.message}, trying alternative methods`);
        }

        // Method 2: Try PowerShell Remove-Item with better error handling
        if (!deleted) {
          try {
            const { execSync } = await import('child_process');
            const psCommand = `powershell -Command "try { Remove-Item -Path '${clusterPath.replace(/\\/g, '\\\\')}' -Recurse -Force -ErrorAction Stop; Write-Host 'SUCCESS' } catch { Write-Host 'ERROR:' $_.Exception.Message; exit 1 }"`;
            const result = execSync(psCommand, { encoding: 'utf8', stdio: 'pipe' });
            
            if (result.includes('SUCCESS')) {
              logger.info(`Cluster ${clusterName} deleted successfully with PowerShell`);
              deleted = true;
            } else {
              throw new Error(result);
            }
          } catch (psError) {
            logger.warn(`PowerShell deletion failed for ${clusterName}: ${psError.message}`);
          }
        }

        // Method 3: Try manual deletion of subdirectories
        if (!deleted) {
          try {
            logger.info(`Attempting manual deletion of cluster ${clusterName}`);
            await this.deleteDirectoryManually(clusterPath);
            logger.info(`Cluster ${clusterName} deleted successfully with manual method`);
            deleted = true;
          } catch (manualError) {
            logger.warn(`Manual deletion failed for ${clusterName}: ${manualError.message}`);
          }
        }

        if (!deleted) {
          throw new Error(`Failed to delete cluster ${clusterName} with all available methods`);
        }
      }

      return { 
        success: true, 
        message: `Cluster ${clusterName} deleted successfully`,
        backupPath: backupPath
      };
    } catch (error) {
      logger.error(`Failed to delete cluster ${clusterName}:`, error);
      throw error;
    }
  }

  /**
   * Helper method to delete directory manually by removing files first
   */
  async deleteDirectoryManually(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          await this.deleteDirectoryManually(fullPath);
        } else {
          try {
            await fs.unlink(fullPath);
          } catch (unlinkError) {
            logger.warn(`Failed to delete file ${fullPath}: ${unlinkError.message}`);
            // Try to make file writable first
            try {
              await fs.chmod(fullPath, 0o666);
              await fs.unlink(fullPath);
            } catch (retryError) {
              logger.warn(`Failed to delete file ${fullPath} after chmod: ${retryError.message}`);
            }
          }
        }
      }
      
      await fs.rmdir(dirPath);
    } catch (error) {
      throw new Error(`Failed to manually delete directory ${dirPath}: ${error.message}`);
    }
  }

  /**
   * Backup cluster saved data
   */
  async backupCluster(clusterName, customDestination = null) {
    return await this.clusterManager.backupCluster(clusterName, customDestination);
  }

  /**
   * Backup cluster saved data (LEGACY)
   */
  async backupClusterLegacy(clusterName, customDestination = null) {
    try {
      const clusterPath = path.join(this.clustersPath, clusterName);
      
      // Check if cluster exists
      try {
        await fs.access(clusterPath);
      } catch {
        throw new Error(`Cluster ${clusterName} not found`);
      }

      // Create backup directory
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = customDestination || path.join(this.clustersPath, '..', 'backups', `${clusterName}-${timestamp}`);
      
      // Ensure backup directory exists
      await fs.mkdir(path.dirname(backupDir), { recursive: true });

      // Read cluster config to get server names
      const clusterConfigPath = path.join(clusterPath, 'cluster.json');
      let clusterConfig;
      
      try {
        const configContent = await fs.readFile(clusterConfigPath, 'utf8');
        clusterConfig = JSON.parse(configContent);
      } catch (error) {
        logger.warn(`Failed to read cluster config for ${clusterName}: ${error.message}`);
        // Try to find servers by scanning the directory
        const entries = await fs.readdir(clusterPath, { withFileTypes: true });
        const serverDirs = entries.filter(entry => entry.isDirectory() && entry.name !== 'backups');
        
        clusterConfig = {
          servers: serverDirs.map(dir => ({ name: dir.name }))
        };
        
        logger.info(`Found ${clusterConfig.servers.length} servers by directory scan for ${clusterName}`);
      }

      const backupResults = [];

      // Backup each server's Saved folder
      for (const server of clusterConfig.servers) {
        const serverPath = path.join(clusterPath, server.name);
        const savedPath = path.join(serverPath, 'ShooterGame', 'Saved');
        const backupServerPath = path.join(backupDir, server.name);

        try {
          // Check if Saved folder exists
          await fs.access(savedPath);
          
          // Copy Saved folder
          await this.copyDirectory(savedPath, backupServerPath);
          backupResults.push({
            server: server.name,
            success: true,
            path: backupServerPath
          });
          
          logger.info(`Backed up ${server.name} Saved folder to: ${backupServerPath}`);
        } catch (error) {
          backupResults.push({
            server: server.name,
            success: false,
            error: error.message
          });
          logger.warn(`Failed to backup ${server.name} Saved folder:`, error.message);
        }
      }

      // Also backup the cluster config
      const clusterConfigBackupPath = path.join(backupDir, 'cluster-config.json');
      await fs.copyFile(clusterConfigPath, clusterConfigBackupPath);

      return {
        success: true,
        backupPath: backupDir,
        timestamp: timestamp,
        results: backupResults
      };
    } catch (error) {
      logger.error(`Failed to backup cluster ${clusterName}:`, error);
      throw error;
    }
  }

  /**
   * Restore cluster saved data
   */
  async restoreCluster(clusterName, sourcePath) {
    return await this.clusterManager.restoreCluster(clusterName, sourcePath);
  }

  /**
   * Restore cluster saved data (LEGACY)
   */
  async restoreClusterLegacy(clusterName, sourcePath) {
    try {
      const clusterPath = path.join(this.clustersPath, clusterName);
      
      // Check if cluster exists
      try {
        await fs.access(clusterPath);
      } catch {
        throw new Error(`Cluster ${clusterName} not found`);
      }

      // Check if source backup exists
      try {
        await fs.access(sourcePath);
      } catch {
        throw new Error(`Backup source not found: ${sourcePath}`);
      }

      // Read cluster config to get server names
      const clusterConfigPath = path.join(clusterPath, 'cluster.json');
      const configContent = await fs.readFile(clusterConfigPath, 'utf8');
      const clusterConfig = JSON.parse(configContent);

      const restoreResults = [];

      // Restore each server's Saved folder
      for (const server of clusterConfig.servers) {
        const serverPath = path.join(clusterPath, server.name);
        const savedPath = path.join(serverPath, 'ShooterGame', 'Saved');
        const backupServerPath = path.join(sourcePath, server.name);

        try {
          // Check if backup exists for this server
          await fs.access(backupServerPath);
          
          // Remove existing Saved folder if it exists
          try {
            await fs.rm(savedPath, { recursive: true, force: true });
          } catch (error) {
            // Saved folder might not exist, which is fine
          }
          
          // Copy backup to server
          await this.copyDirectory(backupServerPath, savedPath);
          restoreResults.push({
            server: server.name,
            success: true,
            path: savedPath
          });
          
          logger.info(`Restored ${server.name} Saved folder from: ${backupServerPath}`);
        } catch (error) {
          restoreResults.push({
            server: server.name,
            success: false,
            error: error.message
          });
          logger.warn(`Failed to restore ${server.name} Saved folder:`, error.message);
        }
      }

      return {
        success: true,
        sourcePath: sourcePath,
        results: restoreResults
      };
    } catch (error) {
      logger.error(`Failed to restore cluster ${clusterName}:`, error);
      throw error;
    }
  }

  /**
   * Helper method to copy directory recursively
   */
  async copyDirectory(source, destination) {
    try {
      await fs.mkdir(destination, { recursive: true });
      const entries = await fs.readdir(source, { withFileTypes: true });

      for (const entry of entries) {
        const sourcePath = path.join(source, entry.name);
        const destPath = path.join(destination, entry.name);

        if (entry.isDirectory()) {
          await this.copyDirectory(sourcePath, destPath);
        } else {
          await fs.copyFile(sourcePath, destPath);
        }
      }
    } catch (error) {
      throw new Error(`Failed to copy directory from ${source} to ${destination}: ${error.message}`);
    }
  }

  /**
   * Backup individual server
   */
  async backupServer(serverName, options = {}) {
    return await this.serverManager.backupServer(serverName, options);
  }

  /**
   * Backup individual server (LEGACY)
   */
  async backupServerLegacy(serverName, options = {}) {
    const { destination, includeConfigs = true, includeScripts = false } = options;
    
    try {
      // Find the server in clusters
      const clusters = await this.listClusters();
      let serverConfig = null;
      let clusterName = null;
      let serverPath = null;
      
      for (const cluster of clusters) {
        if (cluster.config && cluster.config.servers) {
          const server = cluster.config.servers.find(s => s.name === serverName);
          if (server) {
            serverConfig = server;
            clusterName = cluster.name;
            serverPath = path.join(this.clustersPath, clusterName, serverName);
            break;
          }
        }
      }
      
      if (!serverConfig) {
        throw new Error(`Server "${serverName}" not found`);
      }

      // Create backup directory
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = destination || path.join(this.clustersPath, '..', 'backups', 'servers', `${serverName}-${timestamp}`);
      
      // Ensure backup directory exists
      await fs.mkdir(path.dirname(backupDir), { recursive: true });

      const backupResults = [];

      // Backup Saved folder (always included)
      const savedPath = path.join(serverPath, 'ShooterGame', 'Saved');
      const backupSavedPath = path.join(backupDir, 'ShooterGame', 'Saved');
      
      try {
        await fs.access(savedPath);
        await this.copyDirectory(savedPath, backupSavedPath);
        backupResults.push({
          type: 'saved',
          success: true,
          path: backupSavedPath
        });
        logger.info(`Backed up ${serverName} Saved folder to: ${backupSavedPath}`);
      } catch (error) {
        backupResults.push({
          type: 'saved',
          success: false,
          error: error.message
        });
        logger.warn(`Failed to backup ${serverName} Saved folder:`, error.message);
      }

      // Backup configs if requested
      if (includeConfigs) {
        const configPath = path.join(serverPath, 'ShooterGame', 'Config');
        const backupConfigPath = path.join(backupDir, 'ShooterGame', 'Config');
        
        try {
          await fs.access(configPath);
          await this.copyDirectory(configPath, backupConfigPath);
          backupResults.push({
            type: 'configs',
            success: true,
            path: backupConfigPath
          });
          logger.info(`Backed up ${serverName} configs to: ${backupConfigPath}`);
        } catch (error) {
          backupResults.push({
            type: 'configs',
            success: false,
            error: error.message
          });
          logger.warn(`Failed to backup ${serverName} configs:`, error.message);
        }
      }

      // Backup scripts if requested
      if (includeScripts) {
        const scriptsToBackup = ['start.bat', 'stop.bat'];
        const backupScriptsPath = path.join(backupDir, 'scripts');
        
        try {
          await fs.mkdir(backupScriptsPath, { recursive: true });
          
          for (const script of scriptsToBackup) {
            const scriptPath = path.join(serverPath, script);
            const backupScriptPath = path.join(backupScriptsPath, script);
            
            try {
              await fs.access(scriptPath);
              await fs.copyFile(scriptPath, backupScriptPath);
              backupResults.push({
                type: `script-${script}`,
                success: true,
                path: backupScriptPath
              });
              logger.info(`Backed up ${serverName} ${script} to: ${backupScriptPath}`);
            } catch (error) {
              backupResults.push({
                type: `script-${script}`,
                success: false,
                error: error.message
              });
              logger.warn(`Failed to backup ${serverName} ${script}:`, error.message);
            }
          }
        } catch (error) {
          backupResults.push({
            type: 'scripts',
            success: false,
            error: error.message
          });
          logger.warn(`Failed to backup ${serverName} scripts:`, error.message);
        }
      }

      // Backup server configuration
      const serverConfigPath = path.join(backupDir, 'server-config.json');
      await fs.writeFile(serverConfigPath, JSON.stringify(serverConfig, null, 2));

      // Backup cluster info
      const clusterInfoPath = path.join(backupDir, 'cluster-info.json');
      await fs.writeFile(clusterInfoPath, JSON.stringify({
        originalCluster: clusterName,
        serverName: serverName,
        backupDate: new Date().toISOString(),
        options: options
      }, null, 2));

      return {
        success: true,
        backupPath: backupDir,
        timestamp: timestamp,
        serverName: serverName,
        clusterName: clusterName,
        results: backupResults
      };
    } catch (error) {
      logger.error(`Failed to backup server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Restore individual server
   */
  async restoreServer(serverName, sourcePath, options = {}) {
    return await this.serverManager.restoreServer(serverName, sourcePath, options);
  }

  /**
   * Restore individual server (LEGACY)
   */
  async restoreServerLegacy(serverName, sourcePath, options = {}) {
    const { targetClusterName, overwrite = false } = options;
    
    try {
      // Check if source backup exists
      try {
        await fs.access(sourcePath);
      } catch {
        throw new Error(`Backup source not found: ${sourcePath}`);
      }

      // Read server config from backup
      const serverConfigPath = path.join(sourcePath, 'server-config.json');
      let serverConfig;
      try {
        const configContent = await fs.readFile(serverConfigPath, 'utf8');
        serverConfig = JSON.parse(configContent);
      } catch (error) {
        throw new Error(`Failed to read server config from backup: ${error.message}`);
      }

      // Determine target cluster
      let targetCluster = targetClusterName;
      if (!targetCluster) {
        // Try to restore to original cluster
        const clusterInfoPath = path.join(sourcePath, 'cluster-info.json');
        try {
          const clusterInfoContent = await fs.readFile(clusterInfoPath, 'utf8');
          const clusterInfo = JSON.parse(clusterInfoContent);
          targetCluster = clusterInfo.originalCluster;
        } catch (error) {
          throw new Error('No target cluster specified and could not determine original cluster');
        }
      }

      // Check if target cluster exists
      const targetClusterPath = path.join(this.clustersPath, targetCluster);
      try {
        await fs.access(targetClusterPath);
      } catch {
        throw new Error(`Target cluster "${targetCluster}" not found`);
      }

      // Check if server already exists in target cluster
      const targetServerPath = path.join(targetClusterPath, serverName);
      const serverExists = await fs.access(targetServerPath).then(() => true).catch(() => false);
      
      if (serverExists && !overwrite) {
        throw new Error(`Server "${serverName}" already exists in cluster "${targetCluster}". Use overwrite=true to replace it.`);
      }

      const restoreResults = [];

      // Create server directory if it doesn't exist
      if (!serverExists) {
        await fs.mkdir(targetServerPath, { recursive: true });
        logger.info(`Created server directory: ${targetServerPath}`);
      }

      // Restore Saved folder
      const backupSavedPath = path.join(sourcePath, 'ShooterGame', 'Saved');
      const targetSavedPath = path.join(targetServerPath, 'ShooterGame', 'Saved');
      
      try {
        await fs.access(backupSavedPath);
        
        // Remove existing Saved folder if it exists
        try {
          await fs.rm(targetSavedPath, { recursive: true, force: true });
        } catch (error) {
          // Saved folder might not exist, which is fine
        }
        
        await this.copyDirectory(backupSavedPath, targetSavedPath);
        restoreResults.push({
          type: 'saved',
          success: true,
          path: targetSavedPath
        });
        logger.info(`Restored ${serverName} Saved folder to: ${targetSavedPath}`);
      } catch (error) {
        restoreResults.push({
          type: 'saved',
          success: false,
          error: error.message
        });
        logger.warn(`Failed to restore ${serverName} Saved folder:`, error.message);
      }

      // Restore configs if they exist in backup
      const backupConfigPath = path.join(sourcePath, 'ShooterGame', 'Config');
      const targetConfigPath = path.join(targetServerPath, 'ShooterGame', 'Config');
      
      try {
        await fs.access(backupConfigPath);
        
        // Remove existing configs if they exist
        try {
          await fs.rm(targetConfigPath, { recursive: true, force: true });
        } catch (error) {
          // Config folder might not exist, which is fine
        }
        
        await this.copyDirectory(backupConfigPath, targetConfigPath);
        restoreResults.push({
          type: 'configs',
          success: true,
          path: targetConfigPath
        });
        logger.info(`Restored ${serverName} configs to: ${targetConfigPath}`);
      } catch (error) {
        restoreResults.push({
          type: 'configs',
          success: false,
          error: error.message
        });
        logger.warn(`Failed to restore ${serverName} configs:`, error.message);
      }

      // Restore scripts if they exist in backup
      const backupScriptsPath = path.join(sourcePath, 'scripts');
      try {
        await fs.access(backupScriptsPath);
        const scripts = await fs.readdir(backupScriptsPath);
        
        for (const script of scripts) {
          const backupScriptPath = path.join(backupScriptsPath, script);
          const targetScriptPath = path.join(targetServerPath, script);
          
          try {
            await fs.copyFile(backupScriptPath, targetScriptPath);
            restoreResults.push({
              type: `script-${script}`,
              success: true,
              path: targetScriptPath
            });
            logger.info(`Restored ${serverName} ${script} to: ${targetScriptPath}`);
          } catch (error) {
            restoreResults.push({
              type: `script-${script}`,
              success: false,
              error: error.message
            });
            logger.warn(`Failed to restore ${serverName} ${script}:`, error.message);
          }
        }
      } catch (error) {
        // Scripts might not exist in backup, which is fine
        logger.info(`No scripts found in backup for ${serverName}`);
      }

      // Update cluster config to include the restored server
      const clusterConfigPath = path.join(targetClusterPath, 'cluster.json');
      try {
        const clusterConfigContent = await fs.readFile(clusterConfigPath, 'utf8');
        const clusterConfig = JSON.parse(clusterConfigContent);
        
        // Check if server already exists in cluster config
        const existingServerIndex = clusterConfig.servers.findIndex(s => s.name === serverName);
        
        if (existingServerIndex >= 0) {
          // Update existing server config
          clusterConfig.servers[existingServerIndex] = serverConfig;
        } else {
          // Add new server to cluster config
          clusterConfig.servers.push(serverConfig);
        }
        
        await fs.writeFile(clusterConfigPath, JSON.stringify(clusterConfig, null, 2));
        restoreResults.push({
          type: 'cluster-config',
          success: true,
          path: clusterConfigPath
        });
        logger.info(`Updated cluster config for ${serverName} in ${targetCluster}`);
      } catch (error) {
        restoreResults.push({
          type: 'cluster-config',
          success: false,
          error: error.message
        });
        logger.warn(`Failed to update cluster config for ${serverName}:`, error.message);
      }

      return {
        success: true,
        sourcePath: sourcePath,
        targetCluster: targetCluster,
        serverName: serverName,
        results: restoreResults
      };
    } catch (error) {
      logger.error(`Failed to restore server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * List available server backups
   */
  async listServerBackups() {
    return await this.serverManager.listServerBackups();
  }

  /**
   * List available server backups (LEGACY)
   */
  async listServerBackupsLegacy() {
    try {
      const backupsPath = path.join(this.clustersPath, '..', 'backups', 'servers');
      
      // Check if backups directory exists
      try {
        await fs.access(backupsPath);
      } catch {
        return {
          success: true,
          backups: [],
          message: 'No server backups found'
        };
      }

      const backups = [];
      const entries = await fs.readdir(backupsPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const backupPath = path.join(backupsPath, entry.name);
          
          try {
            // Read server config to get details
            const serverConfigPath = path.join(backupPath, 'server-config.json');
            const clusterInfoPath = path.join(backupPath, 'cluster-info.json');
            
            let serverConfig = null;
            let clusterInfo = null;
            
            try {
              const configContent = await fs.readFile(serverConfigPath, 'utf8');
              serverConfig = JSON.parse(configContent);
            } catch (error) {
              logger.warn(`Failed to read server config for backup ${entry.name}:`, error.message);
            }
            
            try {
              const clusterInfoContent = await fs.readFile(clusterInfoPath, 'utf8');
              clusterInfo = JSON.parse(clusterInfoContent);
            } catch (error) {
              logger.warn(`Failed to read cluster info for backup ${entry.name}:`, error.message);
            }

            // Get backup size
            const stats = await fs.stat(backupPath);
            
            backups.push({
              name: entry.name,
              path: backupPath,
              serverName: serverConfig?.name || 'Unknown',
              originalCluster: clusterInfo?.originalCluster || 'Unknown',
              backupDate: clusterInfo?.backupDate || stats.mtime.toISOString(),
              size: stats.size,
              sizeFormatted: this.formatBytes(stats.size),
              serverConfig: serverConfig,
              clusterInfo: clusterInfo
            });
          } catch (error) {
            logger.warn(`Failed to process backup ${entry.name}:`, error.message);
          }
        }
      }

      // Sort by backup date (newest first)
      backups.sort((a, b) => new Date(b.backupDate) - new Date(a.backupDate));

      return {
        success: true,
        backups,
        count: backups.length
      };
    } catch (error) {
      logger.error('Failed to list server backups:', error);
      throw error;
    }
  }

  /**
   * Regenerate start script for a specific server
   */
  async regenerateServerStartScript(serverName) {
    return await this.scriptGenerator.regenerateServerStartScript(serverName);
  }

  /**
   * Regenerate start scripts for all servers in all clusters
   */
  async regenerateAllClusterStartScripts() {
    return await this.scriptGenerator.regenerateAllClusterStartScripts();
  }

  /**
   * Validate cluster configuration
   */
  async validateClusterConfig(config) {
    return await this.clusterManager.validateClusterConfig(config);
  }

  /**
   * Validate cluster configuration (LEGACY)
   */
  async validateClusterConfigLegacy(config) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check required fields
    if (!config.name || !config.name.trim()) {
      validation.valid = false;
      validation.errors.push('Cluster name is required');
    }

    // Check name format
    if (config.name && !/^[a-zA-Z0-9_-]+$/.test(config.name)) {
      validation.valid = false;
      validation.errors.push('Cluster name can only contain letters, numbers, underscores, and hyphens');
    }

    // Check server count
    if (config.serverCount && (config.serverCount < 1 || config.serverCount > 10)) {
      validation.valid = false;
      validation.errors.push('Server count must be between 1 and 10');
    }

    // Check base port
    if (config.basePort && (config.basePort < 1024 || config.basePort > 65535)) {
      validation.valid = false;
      validation.errors.push('Base port must be between 1024 and 65535');
    }

    // Check if cluster already exists
    if (config.name) {
      try {
        const clusterPath = path.join(this.clustersPath, config.name);
        await fs.access(clusterPath);
        validation.valid = false;
        validation.errors.push(`Cluster "${config.name}" already exists`);
      } catch {
        // Cluster doesn't exist, which is good
      }
    }

    // Check system requirements
    try {
      const systemInfo = await this.getSystemInfo();
      
      // Check disk space (need at least 10GB per server)
      const requiredSpace = (config.serverCount || 1) * 10 * 1024 * 1024 * 1024; // 10GB per server
      if (systemInfo.diskSpace.free < requiredSpace) {
        validation.warnings.push(`Insufficient disk space. Need ${this.formatBytes(requiredSpace)}, have ${this.formatBytes(systemInfo.diskSpace.free)}`);
      }

      // Check if system is ready
      if (!systemInfo.steamCmdInstalled || !systemInfo.asaBinariesInstalled) {
        validation.warnings.push('System not fully initialized. SteamCMD or ASA binaries may not be installed.');
      }
    } catch (error) {
      validation.warnings.push(`Could not verify system requirements: ${error.message}`);
    }

    return validation;
  }

  /**
   * Start a cluster (start all servers in the cluster)
   */
  async startCluster(clusterName) {
    return await this.clusterManager.startCluster(clusterName);
  }

  /**
   * Start a cluster (start all servers in the cluster) (LEGACY)
   */
  async startClusterLegacy(clusterName) {
    try {
      const clusterPath = path.join(this.clustersPath, clusterName);
      const clusterConfigPath = path.join(clusterPath, 'cluster.json');
      
      // Read cluster configuration
      const configContent = await fs.readFile(clusterConfigPath, 'utf8');
      const clusterConfig = JSON.parse(configContent);
      
      logger.info(`Starting cluster: ${clusterName}`);
      
      // Check if we should update ASA binaries first
      const shouldUpdate = clusterConfig.updateOnStart !== false; // Default to true
      if (shouldUpdate) {
        logger.info('Checking for ASA binary updates...');
        try {
          await this.updateAllServerBinaries();
          logger.info('ASA binaries updated successfully');
        } catch (error) {
          logger.warn('Failed to update ASA binaries, continuing with existing version:', error.message);
        }
      }
      
      // Start servers sequentially to avoid overwhelming the system
      for (const server of clusterConfig.servers) {
        const serverPath = path.join(clusterPath, server.name);
        const startScript = path.join(serverPath, 'start.bat');
        
        // Create start script if it doesn't exist
        if (!(await fs.access(startScript).catch(() => false))) {
          await this.createStartScript(serverPath, server);
        }
        
        // Start the server with proper working directory
        const command = `start /B "${server.name}" cmd /c "cd /d "${serverPath}" && "${startScript}""`;
        await execAsync(command);
        
        logger.info(`Started server: ${server.name}`);
        
        // Wait a moment between starting servers
        if (clusterConfig.servers.indexOf(server) < clusterConfig.servers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      return { success: true, message: `Cluster ${clusterName} started successfully.` };
    } catch (error) {
      logger.error(`Failed to start cluster ${clusterName}:`, error);
      throw error;
    }
  }

  /**
   * Get system information (disk, memory, SteamCMD, ASA, platform, etc.)
   */
  async getSystemInfo() {
    return await this.systemInfo.getSystemInfo();
  }

  /**
   * Set a progress callback for real-time feedback (used by routes for frontend progress)
   */
  setProgressCallback(cb) {
    this.emitProgress = cb;
    // Pass progress callback to all managers
    this.asaBinariesManager?.setProgressCallback(cb);
    this.scriptGenerator?.setProgressCallback(cb);
    this.clusterManager?.setProgressCallback(cb);
    this.serverManager?.setProgressCallback(cb);
  }

  /**
   * Download a file from URL to destination
   */
  async downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(destination);
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(destination).catch(() => {}); // Clean up on error
          reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
        file.on('error', (err) => {
          file.close();
          fs.unlink(destination).catch(() => {}); // Clean up on error
          reject(err);
        });
      }).on('error', (err) => {
        file.close();
        fs.unlink(destination).catch(() => {}); // Clean up on error
        reject(err);
      });
    });
  }

  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes, decimals = 2) {
    return this.systemInfo.formatBytes(bytes, decimals);
  }
}
