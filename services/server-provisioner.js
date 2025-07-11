import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import https from 'https';
import logger from '../utils/logger.js';
import config from '../config/index.js';

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
    
    // Handle custom SteamCMD path or default to basePath
    if (config.server.native.steamCmdPath) {
      this.steamCmdPath = config.server.native.steamCmdPath;
      this.steamCmdExe = path.join(this.steamCmdPath, 'steamcmd.exe');
    } else {
      // Use the same base path as the server root for consistency
    this.steamCmdPath = path.join(this.basePath, 'steamcmd');
    this.steamCmdExe = path.join(this.steamCmdPath, 'steamcmd.exe');
    }
    
    // Updated paths for separate binary architecture
    this.serversPath = path.join(this.basePath, 'servers');
    this.clustersPath = path.join(this.basePath, 'clusters');
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
    try {
      await fs.access(this.steamCmdExe);
      logger.info('SteamCMD found at configured path');
      return { success: true, message: 'SteamCMD available' };
    } catch (error) {
      // Try to find existing SteamCMD installation
      const existingSteamCmd = await this.findExistingSteamCmd();
      if (existingSteamCmd) {
        logger.info(`Found existing SteamCMD at: ${existingSteamCmd}`);
        this.steamCmdExe = existingSteamCmd;
        this.steamCmdPath = path.dirname(existingSteamCmd);
        return { success: true, message: 'SteamCMD found at existing location' };
      }

      logger.warn('SteamCMD not found. Use option 7 to install SteamCMD.');
      return { success: false, message: 'SteamCMD not found' };
    }
  }

  /**
   * Check ASA binaries availability without installing
   */
  async checkASABinariesAvailability() {
    try {
      // Check if any servers have ASA binaries installed
      const servers = await this.listServers();
      for (const server of servers) {
        const serverExe = path.join(server.path, 'binaries', 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
        try {
      await fs.access(serverExe);
          logger.info('ASA binaries found in existing servers');
      return { success: true, message: 'ASA binaries available' };
        } catch {
          // Continue checking other servers
        }
      }
      
      // Also check clusters
      const clusters = await this.listClusters();
      for (const cluster of clusters) {
        if (cluster.config.servers) {
          for (const server of cluster.config.servers) {
            const serverExe = path.join(server.serverPath, 'binaries', 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
            try {
              await fs.access(serverExe);
              logger.info('ASA binaries found in existing cluster servers');
              return { success: true, message: 'ASA binaries available' };
            } catch {
              // Continue checking other servers
            }
          }
        }
      }
      
      logger.warn('No ASA binaries found in any servers. Create a cluster to install ASA binaries.');
      return { success: false, message: 'ASA binaries not found' };
    } catch (error) {
      logger.warn('ASA binaries not found. Create a cluster to install ASA binaries.');
      return { success: false, message: 'ASA binaries not found' };
    }
  }

  /**
   * Get SteamCMD installation status
   */
  async isSteamCmdInstalled() {
    try {
      await fs.access(this.steamCmdExe);
      return true;
        } catch {
      return false;
    }
  }

  /**
   * Install SteamCMD
   */
  async installSteamCmd(foreground = false) {
    try {
      logger.info(`Installing SteamCMD (foreground: ${foreground})...`);
      
      // Create SteamCMD directory
      await fs.mkdir(this.steamCmdPath, { recursive: true });
      
      // Download SteamCMD
      const steamCmdUrl = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';
      const zipPath = path.join(this.steamCmdPath, 'steamcmd.zip');
      
      if (foreground) {
        console.log('\n=== Downloading SteamCMD ===');
      }
      logger.info('Downloading SteamCMD...');
      await this.downloadFile(steamCmdUrl, zipPath);
      
      // Extract SteamCMD
      if (foreground) {
        console.log('\n=== Extracting SteamCMD ===');
      }
      logger.info('Extracting SteamCMD...');
      
      const extractCommand = `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${this.steamCmdPath}' -Force"`;
      
      if (foreground) {
        await this.execForeground(extractCommand);
      } else {
        const { execSync } = await import('child_process');
        execSync(extractCommand, { stdio: 'inherit' });
      }
      
      // Clean up zip file
      await fs.unlink(zipPath);
      
      // Verify installation
      if (await this.isSteamCmdInstalled()) {
        if (foreground) {
          console.log('\n=== SteamCMD installed successfully ===');
        }
      logger.info('SteamCMD installed successfully');
        return true;
      } else {
        throw new Error('SteamCMD installation verification failed');
      }
    } catch (error) {
      logger.error('Failed to install SteamCMD:', error);
      throw error;
    }
  }

  /**
   * Find existing SteamCMD installations
   */
  async findExistingSteamCmd() {
    const commonPaths = [
      // Default installation path where this system would install SteamCMD
      path.join(this.basePath, 'steamcmd', 'steamcmd.exe'),
      // G: drive path (your current installation)
      'G:\\ARK\\steamcmd\\steamcmd.exe',
      // Common Steam installation paths
      'C:\\Steam\\steamcmd\\steamcmd.exe',
      'C:\\Program Files\\Steam\\steamcmd\\steamcmd.exe',
      'C:\\Program Files (x86)\\Steam\\steamcmd\\steamcmd.exe',
      path.join(process.env.USERPROFILE || '', 'Steam', 'steamcmd', 'steamcmd.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Steam', 'steamcmd', 'steamcmd.exe'),
      // Additional common paths
      'C:\\SteamCMD\\steamcmd.exe',
      'C:\\Program Files\\SteamCMD\\steamcmd.exe',
      'C:\\Program Files (x86)\\SteamCMD\\steamcmd.exe'
    ];

    for (const steamCmdPath of commonPaths) {
      try {
        await fs.access(steamCmdPath);
        logger.info(`Found existing SteamCMD at: ${steamCmdPath}`);
        return steamCmdPath;
      } catch (error) {
        // Continue checking other paths
      }
    }

    return null;
  }

  /**
   * Ensure SteamCMD is available (for explicit installation)
   */
  async ensureSteamCmd() {
    try {
      await fs.access(this.steamCmdExe);
      logger.info('SteamCMD already installed at configured path');
      return { success: true, message: 'SteamCMD available' };
    } catch (error) {
      // Try to find existing SteamCMD installation
      const existingSteamCmd = await this.findExistingSteamCmd();
      if (existingSteamCmd) {
        logger.info(`Using existing SteamCMD at: ${existingSteamCmd}`);
        this.steamCmdExe = existingSteamCmd;
        this.steamCmdPath = path.dirname(existingSteamCmd);
        return { success: true, message: 'SteamCMD found at existing location' };
      }

      if (this.autoInstallSteamCmd) {
      logger.info('SteamCMD not found, installing...');
      return await this.installSteamCmd();
      } else {
        logger.warn('SteamCMD not found and auto-install is disabled');
        throw new Error(`SteamCMD not found. Please install SteamCMD manually or set STEAMCMD_PATH environment variable.`);
      }
    }
  }

  /**
   * Install ASA server binaries
   */
  async installASABinaries(foreground = false) {
    try {
      logger.info(`Installing ASA server binaries (foreground: ${foreground})...`);
      
      const appId = '2430930'; // ASA Dedicated Server App ID
      const installScript = `
        @ShutdownOnFailedCommand 1
        @NoPromptForPassword 1
        login anonymous
        force_install_dir "${this.sharedBinariesPath}"
        app_update ${appId} validate
        quit
      `;
      
      const scriptPath = path.join(this.steamCmdPath, 'install_asa.txt');
      await fs.writeFile(scriptPath, installScript);
      
      const command = `"${this.steamCmdExe}" +runscript "${scriptPath}"`;
      
      if (foreground) {
        console.log('\n=== Installing ASA Server Binaries ===');
        console.log('This may take several minutes depending on your internet connection...');
        await this.execForeground(command);
      } else {
      await execAsync(command);
      }
      
      // Clean up script
      await fs.unlink(scriptPath);
      
      if (foreground) {
        console.log('\n=== ASA Server Binaries installed successfully ===');
      }
      logger.info('ASA server binaries installed successfully');
      return { success: true, message: 'ASA binaries installed' };
    } catch (error) {
      logger.error('Failed to install ASA binaries:', error);
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
    try {
      logger.info('Updating ASA server binaries...');
      
      const appId = '2430930';
      const updateScript = `
        @ShutdownOnFailedCommand 1
        @NoPromptForPassword 1
        force_install_dir "${this.sharedBinariesPath}"
        app_update ${appId}
        quit
      `;
      
      const scriptPath = path.join(this.steamCmdPath, 'update_asa.txt');
      await fs.writeFile(scriptPath, updateScript);
      
      const command = `"${this.steamCmdExe}" +runscript "${scriptPath}"`;
      await execAsync(command);
      
      // Clean up script
      await fs.unlink(scriptPath);
      
      logger.info('ASA server binaries updated successfully');
      return { success: true, message: 'ASA binaries updated' };
    } catch (error) {
      logger.error('Failed to update ASA binaries:', error);
      throw error;
    }
  }

  // Helper: Find next available game port based on allocation mode
  getNextAvailableGamePort(existingServers, basePort = 7777, portAllocationMode = 'sequential') {
    // Gather all used ports
    const usedPorts = new Set();
    for (const server of existingServers) {
      if (server.port) usedPorts.add(server.port);
      if (server.queryPort) usedPorts.add(server.queryPort);
      if (server.rconPort) usedPorts.add(server.rconPort);
    }
    
    if (portAllocationMode === 'even') {
      // Even ports: 30000, 30002, 30004, etc.
      // Find the highest game port used, starting from basePort
      let maxGamePort = basePort - 2; // Start 2 less than base to ensure we start at basePort
      for (const server of existingServers) {
        if (server.port && server.port >= basePort && server.port > maxGamePort) {
          maxGamePort = server.port;
        }
      }
      
      // Start from basePort if no servers exist, otherwise use next even port
      let candidate = maxGamePort < basePort ? basePort : maxGamePort + 2;
      
      // Ensure candidate is even
      if (candidate % 2 !== 0) {
        candidate += 1;
      }
      
      // Ensure candidate, candidate+1, candidate+2 are all unused
      while (
        usedPorts.has(candidate) ||
        usedPorts.has(candidate + 1) ||
        usedPorts.has(candidate + 2)
      ) {
        candidate += 2;
      }
      
      return candidate;
        } else {
      // Sequential ports: 7777, 7778, 7779, etc.
      // Find the highest game port used, starting from basePort
      let maxGamePort = basePort - 1; // Start 1 less than base to ensure we start at basePort
      for (const server of existingServers) {
        if (server.port && server.port >= basePort && server.port > maxGamePort) {
          maxGamePort = server.port;
        }
      }
      
      // Start from basePort if no servers exist, otherwise use next sequential port
      let candidate = maxGamePort < basePort ? basePort : maxGamePort + 1;
      
      // Ensure candidate, candidate+19338, candidate+24553 are all unused
      while (
        usedPorts.has(candidate) ||
        usedPorts.has(candidate + 19338) ||
        usedPorts.has(candidate + 24553)
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
        rconPassword: serverConfig.rconPassword || 'rcon123',
        clusterId: serverConfig.clusterId || '',
        clusterPassword: serverConfig.clusterPassword || '',
        created: new Date().toISOString(),
        binariesPath: path.join(serverPath, 'binaries'),
        configsPath: configsPath,
        savesPath: path.join(serverPath, 'saves'),
        logsPath: path.join(serverPath, 'logs')
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
      
      const startScript = `@echo off
echo Starting ${serverName}...
cd /d "${binariesPath}"

REM Set server parameters
set MAP=${serverConfig.map || 'TheIsland'}
set PORT=${serverConfig.gamePort || 7777}
set QUERYPORT=${serverConfig.queryPort || 27015}
set RCONPORT=${serverConfig.rconPort || 32330}
set MAXPLAYERS=${serverConfig.maxPlayers || 70}
set ADMINPASSWORD=${serverConfig.adminPassword || 'admin123'}
set SERVERPASSWORD=${serverConfig.serverPassword || ''}
set CLUSTERID=${serverConfig.clusterId || ''}
set CLUSTERPASSWORD=${serverConfig.clusterPassword || ''}

REM Set paths
set CONFIGPATH=${configsPath}
set SAVEPATH=${savesPath}
set LOGPATH=${logsPath}

REM Start the server
"${path.join(binariesPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe')}" \\
  %MAP%?listen?Port=%PORT%?QueryPort=%QUERYPORT%?RCONPort=%RCONPORT% \\
  ?MaxPlayers=%MAXPLAYERS% \\
  ?ServerAdminPassword=%ADMINPASSWORD% \\
  ?ServerPassword=%SERVERPASSWORD% \\
  ?ClusterId=%CLUSTERID% \\
  ?ClusterPassword=%CLUSTERPASSWORD% \\
  ?AltSaveDirectoryName=%SAVEPATH% \\
  ?ConfigOverridePath=%CONFIGPATH% \\
  ?LogPath=%LOGPATH%

pause`;

      await fs.writeFile(path.join(serverPath, 'start.bat'), startScript);
      logger.info(`Start script created for server: ${serverName}`);
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
      const stopScript = `@echo off
echo Stopping ${serverName}...

REM Find and kill the server process
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq ArkAscendedServer.exe" /fo table /nh ^| find "ArkAscendedServer.exe"') do (
    echo Stopping process %%i
    taskkill /pid %%i /f
)

echo ${serverName} stopped.
pause`;

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
    try {
      const clusterName = clusterConfig.name;
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
            (clusterConfig.basePort || 7777) + 1 : (clusterConfig.basePort || 7777) + 19338,
          queryPortIncrement: (clusterConfig.portAllocationMode || 'sequential') === 'even' ? 2 : 1,
          rconPortBase: (clusterConfig.portAllocationMode || 'sequential') === 'even' ? 
            (clusterConfig.basePort || 7777) + 2 : (clusterConfig.basePort || 7777) + 24553,
          rconPortIncrement: (clusterConfig.portAllocationMode || 'sequential') === 'even' ? 2 : 1
        }
      };
      
      // Create servers for the cluster
      if (clusterConfig.servers && clusterConfig.servers.length > 0) {
        if (foreground) {
          console.log(`\n=== Installing ${clusterConfig.servers.length} servers ===`);
          console.log('Servers will be installed sequentially to avoid file locks...');
        }
        
        // Stagger (sequential) server installs for reliability
        for (let i = 0; i < clusterConfig.servers.length; i++) {
          const serverConfig = clusterConfig.servers[i];
          // Create server in cluster directory instead of servers directory
    const serverName = serverConfig.name;
    const serverPath = path.join(clusterPath, serverName);
          
          this.emitProgress?.(`Installing ASA server files for server ${i + 1}/${clusterConfig.servers.length}: ${serverName}`);
          
          if (foreground) {
            console.log(`\n--- Installing Server ${i + 1}/${clusterConfig.servers.length}: ${serverName} ---`);
          }
          logger.info(`Creating server: ${serverName} in cluster ${clusterName}`);
          
          // Don't pre-create server directories - let SteamCMD create them
          // Just create the cluster directory if it doesn't exist
          await fs.mkdir(clusterPath, { recursive: true });
          
          // Install ASA binaries for this server (this will create the server folder structure)
          // This is intentionally awaited sequentially to avoid file locks and resource contention
          await this.installASABinariesForServerInCluster(clusterName, serverName, foreground);
          
          // Create server configuration (after SteamCMD has created the structure)
          this.emitProgress?.(`Creating server configuration for ${serverName}`);
          await this.createServerConfigInCluster(clusterName, serverPath, serverConfig);
          
          // Create startup script
          this.emitProgress?.(`Creating startup script for ${serverName}`);
          await this.createStartScriptInCluster(clusterName, serverPath, { ...serverConfig, customDynamicConfigUrl: clusterConfig.customDynamicConfigUrl });
          
          // Create stop script
          await this.createStopScriptInCluster(clusterName, serverPath, serverName);
          
          // Add to cluster config
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
    try {
      const serverPath = path.join(this.clustersPath, clusterName, serverName);
      logger.info(`Installing ASA binaries for server: ${serverName} in cluster ${clusterName} (foreground: ${foreground})`);
      await fs.mkdir(serverPath, { recursive: true });
      logger.info(`Created server directory: ${serverPath}`);
      this.emitProgress?.(`Created server directory: ${serverPath}`);
      
      // Use the correct SteamCMD path with proper escaping
      const steamCmdExe = this.steamCmdExe;
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
        
        // Run the .bat file in foreground
        await this.execForeground(`cmd /c "${batPath}"`, {
          cwd: path.dirname(batPath),
          timeout: 300000 // 5 minute timeout
        });
        
        // Clean up .bat file
        await fs.unlink(batPath);
      } else {
        // Write the .bat file with better error handling
        const batPath = path.join(this.clustersPath, clusterName, 'install_asa.bat');
        const batContent = `@echo off
echo Installing ASA binaries for ${serverName}...
echo SteamCMD path: ${this.steamCmdExe}
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
        
        // Run the .bat file
        logger.info(`Running install batch: ${batPath}`);
        logger.info(`SteamCMD command: ${steamCmdCommand}`);
        
        try {
          const { stdout, stderr } = await execAsync(`cmd /c "${batPath}"`, {
            cwd: path.dirname(batPath),
            timeout: 300000 // 5 minute timeout
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
        steamCmdExe: this.steamCmdExe
      });
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Create server configuration files in cluster
   */
  async createServerConfigInCluster(clusterName, serverPath, serverConfig) {
    try {
      // SteamCMD creates a structure like:
      // serverPath/
      //   ShooterGame/
      //     Saved/
      //       Config/
      //         WindowsServer/
      //           Game.ini
      //           GameUserSettings.ini
      const configsPath = path.join(serverPath, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
      const binariesPath = path.join(serverPath, 'ShooterGame', 'Binaries', 'Win64');
      
      // Create configs directory if it doesn't exist
      await fs.mkdir(configsPath, { recursive: true });
      
      // Get final configs for this server (global + server-specific)
      const finalConfigs = await this.getFinalConfigsForServer(serverConfig.name);
      
      // Create Game.ini
      const gameIni = finalConfigs.gameIni || this.generateGameIni(serverConfig);
      await fs.writeFile(path.join(configsPath, 'Game.ini'), gameIni);
      
      // Create GameUserSettings.ini
      const gameUserSettings = finalConfigs.gameUserSettings || this.generateGameUserSettings(serverConfig);
      await fs.writeFile(path.join(configsPath, 'GameUserSettings.ini'), gameUserSettings);
      
      // Create server-config.json
      const serverConfigFile = {
        name: serverConfig.name,
        map: serverConfig.map || 'TheIsland',
        gamePort: serverConfig.port || serverConfig.gamePort || 7777,
        queryPort: serverConfig.queryPort || 27015,
        rconPort: serverConfig.rconPort || 32330,
        maxPlayers: serverConfig.maxPlayers || 70,
        adminPassword: serverConfig.adminPassword || 'admin123',
        serverPassword: serverConfig.password || serverConfig.serverPassword || '',
        rconPassword: serverConfig.rconPassword || 'rcon123',
        clusterId: serverConfig.clusterId || clusterName,
        clusterPassword: serverConfig.clusterPassword || '',
        created: new Date().toISOString(),
        binariesPath: binariesPath,
        configsPath: configsPath,
        savesPath: path.join(serverPath, 'ShooterGame', 'Saved', 'SaveGames'),
        logsPath: path.join(serverPath, 'ShooterGame', 'Saved', 'Logs'),
        gameUserSettings: serverConfig.gameUserSettings,
        gameIni: serverConfig.gameIni
      };
      
      await fs.writeFile(
        path.join(serverPath, 'server-config.json'),
        JSON.stringify(serverConfigFile, null, 2)
      );
      
      logger.info(`Server configuration created for: ${serverConfig.name} in cluster ${clusterName}`);
    } catch (error) {
      logger.error(`Failed to create server configuration for ${serverConfig.name} in cluster ${clusterName}:`, error);
      throw error;
    }
  }

  /**
   * Create startup script for a server in cluster
   */
  async createStartScriptInCluster(clusterName, serverPath, serverConfig) {
    try {
      const serverName = serverConfig.name;
      const binariesPath = path.join(serverPath, 'ShooterGame', 'Binaries', 'Win64');
      const clusterDataPath = path.join(this.clustersPath, clusterName, 'clusterdata');
      
      // Create clusterdata directory for shared cluster data
      await fs.mkdir(clusterDataPath, { recursive: true });
      
      // Use customDynamicConfigUrl if provided
      const customUrl = serverConfig.customDynamicConfigUrl || '';
      const customUrlArg = customUrl ? `?customdynamicconfigurl=\"${customUrl}\"` : '';
      
      // Add mods parameter if mods are configured
      const modsArg = serverConfig.mods && serverConfig.mods.length > 0 ? ` -mods=${serverConfig.mods.join(',')}` : '';
      
      // Build the query string for the server parameters
      let queryParams = [
        `SessionName=${serverName}`,
        `Port=${serverConfig.port || serverConfig.gamePort}`,
        `QueryPort=${serverConfig.queryPort}`,
        `RCONPort=${serverConfig.rconPort}`,
        `RCONEnabled=True`,
        `MaxPlayers=${serverConfig.maxPlayers}`,
        `ServerPassword=${serverConfig.password || serverConfig.serverPassword || ''}`,
        `ServerAdminPassword=${serverConfig.adminPassword}`
      ];
      if (customUrl) {
        queryParams.push(`customdynamicconfigurl=\"${customUrl}\"`);
      }
      const queryString = queryParams.join('?');

      const startScript = `@echo off
      echo Starting ${serverName}...

      REM Start the ASA server with proper parameters
      "${path.join(binariesPath, 'ArkAscendedServer.exe')}" "${serverConfig.map}?${queryString}"${modsArg} -servergamelog -NotifyAdminCommandsInChat -UseDynamicConfig -ClusterDirOverride=${clusterDataPath.replace(/\\/g, '\\\\')} -NoTransferFromFiltering -clusterid=${serverConfig.clusterId || clusterName} -NoBattleEye

      echo Server ${serverName} has stopped.
      pause`;

      await fs.writeFile(path.join(serverPath, 'start.bat'), startScript);
      logger.info(`Start script created for server: ${serverName} in cluster ${clusterName}`);
      this.emitProgress?.(`Start script created for server: ${serverName}`);
    } catch (error) {
      logger.error(`Failed to create start script for ${serverConfig.name} in cluster ${clusterName}:`, error);
      this.emitProgress?.(`Failed to create start script for server: ${serverConfig.name}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create stop script for a server in cluster
   */
  async createStopScriptInCluster(clusterName, serverPath, serverName) {
    try {
      const stopScript = `@echo off
echo Stopping ${serverName} in cluster ${clusterName}...

REM Find and kill the server process
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq ArkAscendedServer.exe" /fo table /nh ^| find "ArkAscendedServer.exe"') do (
    echo Stopping process %%i
    taskkill /pid %%i /f
)

echo ${serverName} stopped.
pause`;

      await fs.writeFile(path.join(serverPath, 'stop.bat'), stopScript);
      logger.info(`Stop script created for server: ${serverName} in cluster ${clusterName}`);
    } catch (error) {
      logger.error(`Failed to create stop script for ${serverName} in cluster ${clusterName}:`, error);
      throw error;
    }
  }

  /**
   * Get final configs for a server (global + server-specific)
   */
  async getFinalConfigsForServer(serverName) {
    try {
      // Check if server is excluded from global configs
      const exclusionsPath = path.join(this.basePath, 'config-exclusions.json');
      let excludedServers = [];
      
      try {
        const exclusionsData = await fs.readFile(exclusionsPath, 'utf8');
        const exclusionsConfig = JSON.parse(exclusionsData);
        excludedServers = exclusionsConfig.excludedServers || [];
      } catch (error) {
        // Exclusions file doesn't exist
      }
      
      // If server is excluded, return empty configs (will use defaults)
      if (excludedServers.includes(serverName)) {
        return { gameIni: null, gameUserSettings: null };
      }
      
      // Get global configs
      const globalConfigsPath = path.join(this.basePath, 'global-configs');
      let gameIni = null;
      let gameUserSettings = null;
      
      try {
        const gameIniPath = path.join(globalConfigsPath, 'Game.ini');
        gameIni = await fs.readFile(gameIniPath, 'utf8');
      } catch (error) {
        // Global Game.ini doesn't exist
      }
      
      try {
        const gameUserSettingsIniPath = path.join(globalConfigsPath, 'GameUserSettings.ini');
        gameUserSettings = await fs.readFile(gameUserSettingsIniPath, 'utf8');
      } catch (error) {
        // Global GameUserSettings.ini doesn't exist
      }
      
      return { gameIni, gameUserSettings };
    } catch (error) {
      logger.error(`Failed to get final configs for server ${serverName}:`, error);
      return { gameIni: null, gameUserSettings: null };
    }
  }

  /**
   * Update ASA binaries for a specific server
   */
  async updateServerBinaries(serverName) {
    try {
      logger.info(`Updating ASA binaries for server: ${serverName}`);
      await this.installASABinariesForServer(serverName);
      logger.info(`ASA binaries updated for server: ${serverName}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to update ASA binaries for server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Update ASA binaries for all servers
   */
  async updateAllServerBinaries() {
    try {
      logger.info('Updating ASA binaries for all servers...');
      
      const servers = await fs.readdir(this.serversPath);
      const results = [];
      
      for (const serverName of servers) {
        try {
          const serverPath = path.join(this.serversPath, serverName);
          const stat = await fs.stat(serverPath);
          
          if (stat.isDirectory()) {
            logger.info(`Updating server: ${serverName}`);
            await this.updateServerBinaries(serverName);
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
   * List all servers
   */
  async listServers() {
    try {
      const servers = [];
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
  async deleteCluster(clusterName) {
    try {
      const clusterPath = path.join(this.clustersPath, clusterName);
      // Check if cluster exists
      try {
        await fs.access(clusterPath);
      } catch {
        throw new Error(`Cluster ${clusterName} not found`);
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
      // Try to delete with fs.rm (Node 16+)
      try {
      await fs.rm(clusterPath, { recursive: true, force: true });
        logger.info(`Cluster ${clusterName} deleted successfully with fs.rm`);
        return { success: true };
      } catch (rmError) {
        logger.warn(`fs.rm failed for ${clusterName}: ${rmError.message}, trying PowerShell fallback`);
        // Fallback to PowerShell Remove-Item
        try {
          const { execSync } = await import('child_process');
          execSync(`powershell -Command "Remove-Item -Path \"${clusterPath}\" -Recurse -Force"`, { stdio: 'inherit' });
          logger.info(`Cluster ${clusterName} deleted successfully with PowerShell`);
          return { success: true };
        } catch (psError) {
          logger.error(`Failed to delete cluster ${clusterName} with all methods:`, psError);
          throw new Error(`Failed to delete cluster ${clusterName}: ${psError.message}`);
        }
      }
    } catch (error) {
      logger.error(`Failed to delete cluster ${clusterName}:`, error);
      throw error;
    }
  }

  /**
   * Validate cluster configuration
   */
  async validateClusterConfig(config) {
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
      
      return { success: true, message: `Cluster ${clusterName} started successfully` };
    } catch (error) {
      logger.error(`Failed to start cluster ${clusterName}:`, error);
      throw error;
    }
  }

  /**
   * Stop a cluster (stop all servers in the cluster)
   */
  async stopCluster(clusterName) {
    try {
      logger.info(`Stopping cluster: ${clusterName}`);
      
      // Find and stop all processes related to the cluster
      const command = `taskkill /F /FI "WINDOWTITLE eq *${clusterName}*" /T`;
      await execAsync(command);
      
      // Also try to kill any ShooterGameServer processes for this cluster
      const clusterPath = path.join(this.clustersPath, clusterName);
      const clusterConfigPath = path.join(clusterPath, 'cluster.json');
      
      try {
        const configContent = await fs.readFile(clusterConfigPath, 'utf8');
        const clusterConfig = JSON.parse(configContent);
        
        for (const server of clusterConfig.servers) {
          const killCommand = `taskkill /F /IM ArkAscendedServer.exe /FI "WINDOWTITLE eq *${server.name}*"`;
          try {
            await execAsync(killCommand);
            logger.info(`Stopped server process: ${server.name}`);
          } catch (error) {
            // Process might not be running, which is fine
          }
        }
      } catch (error) {
        logger.warn(`Could not read cluster config for ${clusterName}:`, error);
      }
      
      return { success: true, message: `Cluster ${clusterName} stopped successfully` };
    } catch (error) {
      logger.error(`Failed to stop cluster ${clusterName}:`, error);
      throw error;
    }
  }

  /**
   * Check if a cluster is running
   */
  async isClusterRunning(clusterName) {
    try {
      const clusterPath = path.join(this.clustersPath, clusterName);
      const clusterConfigPath = path.join(clusterPath, 'cluster.json');
      
      const configContent = await fs.readFile(clusterConfigPath, 'utf8');
      const clusterConfig = JSON.parse(configContent);
      
      const runningServers = [];
      const stoppedServers = [];
      
      for (const server of clusterConfig.servers) {
        try {
          // Check if there's a process with the server name in the window title
          const checkCommand = `tasklist /FI "WINDOWTITLE eq *${server.name}*" /FO CSV /NH`;
          const result = await execAsync(checkCommand);
          
          if (result.stdout.includes('ArkAscendedServer.exe')) {
            runningServers.push(server.name);
          } else {
            stoppedServers.push(server.name);
          }
        } catch (error) {
          stoppedServers.push(server.name);
        }
      }
      
      return {
        running: runningServers.length > 0,
        runningServers,
        stoppedServers,
        totalServers: clusterConfig.servers.length
      };
    } catch (error) {
      logger.error(`Failed to check cluster status for ${clusterName}:`, error);
      throw error;
    }
  }

  /**
   * Generate Game.ini content
   */
  generateGameIni(serverConfig) {
    return `[/script/shootergame.shootergamemode]
TamingSpeedMultiplier=${serverConfig.tamingMultiplier || 5.0}
HarvestAmountMultiplier=${serverConfig.harvestMultiplier || 3.0}
XPMultiplier=${serverConfig.xpMultiplier || 3.0}
BabyMatureSpeedMultiplier=10.0
EggHatchSpeedMultiplier=10.0
MatingIntervalMultiplier=0.5
LayEggIntervalMultiplier=0.5
CropGrowthSpeedMultiplier=3.0
CropDecaySpeedMultiplier=0.5
AllowCaveBuildingPvE=true
AllowFlyingStaminaRecovery=true
AllowUnlimitedRespecs=true
PreventSpawnFlier=true
PreventOfflinePvP=true
PreventOfflinePvPInterval=300
PreventOfflinePvPUseStructurePrevention=true
PreventOfflinePvPUseStructurePreventionRadius=1000`;
  }

  /**
   * Generate GameUserSettings.ini content
   */
  generateGameUserSettings(serverConfig) {
    return `[ServerSettings]
ServerAdminPassword=${serverConfig.adminPassword || 'admin123'}
ServerPassword=${serverConfig.serverPassword || ''}
MaxPlayers=${serverConfig.maxPlayers || 70}
ServerName=${serverConfig.name}
ServerMap=${serverConfig.map || 'TheIsland'}
ClusterId=${serverConfig.clusterId || ''}
ClusterPassword=${serverConfig.clusterPassword || ''}
AltSaveDirectoryName=${serverConfig.name}
ConfigOverridePath=./configs`;
  }

  /**
   * Get system information
   */
  async getSystemInfo() {
    try {
      const [diskSpace, memory] = await Promise.all([
        this.getDiskSpace(),
        this.getMemoryInfo()
      ]);
      
      // Check SteamCMD availability (including existing installations)
      let steamCmdInstalled = false;
      let steamCmdPath = undefined;
      
      try {
        // First check configured path
        await fs.access(this.steamCmdExe);
        steamCmdInstalled = true;
        steamCmdPath = this.steamCmdExe;
      } catch (error) {
        // If not found at configured path, look for existing installations
        const existingSteamCmd = await this.findExistingSteamCmd();
        if (existingSteamCmd) {
          steamCmdInstalled = true;
          steamCmdPath = existingSteamCmd;
          // Update the instance variables to use the found SteamCMD
          this.steamCmdExe = existingSteamCmd;
          this.steamCmdPath = path.dirname(existingSteamCmd);
        }
      }
      
      return {
        diskSpace,
        memory,
        steamCmdInstalled,
        steamCmdPath,
        asaBinariesInstalled: await this.isASABinariesInstalled(),
        basePath: this.basePath,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        cpuCores: (await import('os')).default.cpus().length
      };
    } catch (error) {
      logger.error('Failed to get system info:', error);
      throw error;
    }
  }

  /**
   * Check if ASA binaries are installed
   */
  async isASABinariesInstalled() {
    try {
      // Check if any servers have ASA binaries installed
      const servers = await this.listServers();
      for (const server of servers) {
        const serverExe = path.join(server.path, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
        try {
          await fs.access(serverExe);
          return true;
        } catch {
          // Continue checking other servers
        }
      }
      
      // Also check clusters
      const clusters = await this.listClusters();
      for (const cluster of clusters) {
        if (cluster.config.servers) {
          for (const server of cluster.config.servers) {
            const serverExe = path.join(server.serverPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
            try {
              await fs.access(serverExe);
              return true;
            } catch {
              // Continue checking other servers
            }
          }
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get disk space information for the drive where ASA servers are installed
   */
  async getDiskSpace() {
    try {
      logger.info(`Platform: ${process.platform}, Base path: ${this.basePath}, Server mode: ${config.server.mode}`);
      
      if (process.platform === 'win32') {
        // Windows native mode - use WMIC
        logger.info('Using Windows disk space detection');
        return await this.getWindowsDiskSpace();
      } else {
        // Linux/Docker mode - use df command
        logger.info('Using Linux disk space detection');
        return await this.getLinuxDiskSpace();
      }
    } catch (error) {
      logger.error('Failed to get disk space:', error);
      return { total: 0, free: 0, used: 0, usagePercent: 0, drive: 'unknown' };
    }
  }

  /**
   * Get disk space on Windows using WMIC
   */
  async getWindowsDiskSpace() {
    try {
      // Get the drive letter from the base path - more robust extraction
      let driveLetter;
      if (this.basePath.match(/^[A-Z]:/i)) {
        // Extract drive letter from Windows path like "G:\ARK" or "G:\\ARK"
        driveLetter = this.basePath.charAt(0).toUpperCase();
        logger.info(`Extracted drive letter from Windows path: ${driveLetter}`);
      } else {
        // Fallback to path.parse method
        const parsedPath = path.parse(this.basePath);
        logger.info(`Path parsing - root: "${parsedPath.root}", base: "${parsedPath.base}", dir: "${parsedPath.dir}"`);
        driveLetter = parsedPath.root.replace(/[\\\/:]/g, '');
        logger.info(`Extracted drive letter from path.parse: ${driveLetter}`);
      }
      
      logger.info(`Getting Windows disk space for drive: ${driveLetter}, basePath: ${this.basePath}`);
      
      // Try to get disk space for the configured drive first
      try {
        const { execSync } = await import('child_process');
        
        // First, let's check if the drive exists and is accessible
        logger.info(`Checking if drive ${driveLetter}: exists and is accessible...`);
        
        // Try to access the drive directly first
        try {
          await fs.access(`${driveLetter}:\\`);
          logger.info(`Drive ${driveLetter}: is accessible`);
        } catch (accessError) {
          logger.warn(`Drive ${driveLetter}: is not accessible: ${accessError.message}`);
          throw new Error(`Drive ${driveLetter}: not accessible`);
        }
        
        // Get list of available drives
        const driveCheck = execSync(`wmic logicaldisk get DeviceID`, { encoding: 'utf8' });
        const drives = driveCheck.split('\n').map(line => line.trim()).filter(line => line.match(/^[A-Z]:$/));
        logger.info(`Available drives: ${drives.join(', ')}`);
        
        if (!drives.includes(`${driveLetter}:`)) {
          logger.warn(`Drive ${driveLetter}: not found in WMIC drive list: ${drives.join(', ')}`);
          throw new Error(`Drive ${driveLetter}: not found in WMIC`);
        }
        
        // Try multiple WMIC command formats
        let output;
        let wmicSuccess = false;
        
        const wmicCommands = [
          `wmic logicaldisk where "DeviceID='${driveLetter}:'" get size,freespace /format:value`,
          `wmic logicaldisk where DeviceID="${driveLetter}:" get size,freespace /format:value`,
          `wmic logicaldisk where "DeviceID='${driveLetter}:'" get size,freespace`,
          `wmic logicaldisk where DeviceID="${driveLetter}:" get size,freespace`
        ];
        
        for (const command of wmicCommands) {
          try {
            logger.info(`Trying WMIC command: ${command}`);
            output = execSync(command, { encoding: 'utf8' });
            logger.info(`WMIC command succeeded: ${command}`);
            wmicSuccess = true;
            break;
          } catch (wmicError) {
            logger.warn(`WMIC command failed: ${command} - ${wmicError.message}`);
          }
        }
        
        if (!wmicSuccess) {
          throw new Error('All WMIC commands failed');
        }
        
        const lines = output.split('\n');
        let total = 0;
        let free = 0;
        
        for (const line of lines) {
          if (line.includes('FreeSpace=')) {
            free = parseInt(line.split('=')[1]);
          } else if (line.includes('Size=')) {
            total = parseInt(line.split('=')[1]);
          }
        }
        
        logger.info(`Raw WMIC output for ${driveLetter}:`, output);
        logger.info(`Parsed values - Total: ${total}, Free: ${free}`);
        
        // If we got valid data, return it
        if (total > 0 || free > 0) {
          const used = total - free;
          const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0;
          
          logger.info(`Disk space for ${driveLetter}: - Total: ${total}, Free: ${free}, Used: ${used}, Usage: ${usagePercent}%`);
          
          return {
            total,
            free,
            used,
            usagePercent,
            drive: driveLetter
          };
        } else {
          throw new Error('No valid disk space data returned from WMIC');
        }
      } catch (driveError) {
        logger.warn(`Failed to get disk space for ${driveLetter}: via WMIC, trying PowerShell fallback`, driveError.message);
        
        // Try PowerShell as a fallback
        try {
          const { execSync } = await import('child_process');
          const psCommand = `powershell -command "Get-WmiObject -Class Win32_LogicalDisk -Filter \\"DeviceID='${driveLetter}:'\\" | Select-Object Size,FreeSpace | ConvertTo-Json"`;
          logger.info(`Trying PowerShell command: ${psCommand}`);
          
          const output = execSync(psCommand, { encoding: 'utf8' });
          const diskInfo = JSON.parse(output);
          
          if (diskInfo && (diskInfo.Size || diskInfo.FreeSpace)) {
            const total = parseInt(diskInfo.Size) || 0;
            const free = parseInt(diskInfo.FreeSpace) || 0;
            const used = total - free;
            const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0;
            
            logger.info(`PowerShell disk space for ${driveLetter}: - Total: ${total}, Free: ${free}, Used: ${used}, Usage: ${usagePercent}%`);
            
            return {
              total,
              free,
              used,
              usagePercent,
              drive: driveLetter
            };
          } else {
            throw new Error('PowerShell returned invalid disk space data');
          }
        } catch (psError) {
          logger.warn(`PowerShell fallback also failed for ${driveLetter}:, falling back to C:`, psError.message);
        }
      }
      
      // Final fallback to C: drive
      try {
        const { execSync } = await import('child_process');
        const output = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get size,freespace /format:value', { encoding: 'utf8' });
        const lines = output.split('\n');
        let total = 0;
        let free = 0;
        
        for (const line of lines) {
          if (line.includes('FreeSpace=')) {
            free = parseInt(line.split('=')[1]);
          } else if (line.includes('Size=')) {
            total = parseInt(line.split('=')[1]);
          }
        }
        
        const used = total - free;
        const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0;
        
        logger.info(`Final fallback disk space for C: - Total: ${total}, Free: ${free}, Used: ${used}, Usage: ${usagePercent}%`);
        
        return {
          total,
          free,
          used,
          usagePercent,
          drive: 'C'
        };
      } catch (fallbackError) {
        logger.error('Failed to get disk space for all methods:', fallbackError.message);
        return { total: 0, free: 0, used: 0, usagePercent: 0, drive: 'unknown' };
      }
    } catch (error) {
      logger.error('Failed to get Windows disk space:', error);
      return { total: 0, free: 0, used: 0, usagePercent: 0, drive: 'unknown' };
    }
  }

  /**
   * Get disk space on Linux/Docker using df command
   */
  async getLinuxDiskSpace() {
    try {
      logger.info(`Getting Linux disk space for path: ${this.basePath}`);
      
      const { execSync } = await import('child_process');
      
      // Use df command to get disk space for the mounted path
      const output = execSync(`df -B1 "${this.basePath}"`, { encoding: 'utf8' });
      const lines = output.split('\n');
      
      // Skip header line and parse the data line
      if (lines.length >= 2) {
        const parts = lines[1].trim().split(/\s+/);
        if (parts.length >= 4) {
          const total = parseInt(parts[1]); // Total size in bytes
          const used = parseInt(parts[2]);  // Used size in bytes
          const free = parseInt(parts[3]);  // Available size in bytes
          const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0;
          
          logger.info(`Linux disk space - Total: ${total}, Used: ${used}, Free: ${free}, Usage: ${usagePercent}%`);
          
          // Try to determine the drive from the mount point
          let drive = 'unknown';
          try {
            const mountOutput = execSync(`df "${this.basePath}" | tail -1 | awk '{print $1}'`, { encoding: 'utf8' });
            const mountPoint = mountOutput.trim();
            if (mountPoint.includes('/dev/')) {
              // Extract drive info from device path
              drive = mountPoint.split('/').pop() || 'unknown';
            } else {
              drive = 'host';
            }
          } catch (mountError) {
            logger.warn('Could not determine mount point, using "host" as drive identifier');
            drive = 'host';
          }
          
          return {
            total,
            free,
            used,
            usagePercent,
            drive
          };
        }
      }
      
      throw new Error('Could not parse df output');
    } catch (error) {
      logger.error('Failed to get Linux disk space:', error);
      return { total: 0, free: 0, used: 0, usagePercent: 0, drive: 'unknown' };
    }
  }

  /**
   * Get memory information
   */
  async getMemoryInfo() {
    try {
      if (process.platform === 'win32') {
        // Use Windows wmic command to get memory info
        const { execSync } = await import('child_process');
        const output = execSync('wmic computersystem get TotalPhysicalMemory /format:value', { encoding: 'utf8' });
        
        const lines = output.split('\n');
        let total = 0;
        
        for (const line of lines) {
          if (line.includes('TotalPhysicalMemory=')) {
            total = parseInt(line.split('=')[1]);
            break;
          }
        }
        
        // Get free memory using os module
        const os = await import('os');
        const free = os.default.freemem();
        const used = total - free;
        const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0;
        
        return {
          total,
          free,
          used,
          usagePercent
        };
      } else {
        // For non-Windows platforms, use os module
        const os = await import('os');
        const total = os.default.totalmem();
        const free = os.default.freemem();
        const used = total - free;
        const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0;
        
        return {
          total,
          free,
          used,
          usagePercent
        };
      }
    } catch (error) {
      logger.error('Failed to get memory info:', error);
      return { total: 0, free: 0, used: 0, usagePercent: 0 };
    }
  }

  /**
   * Download a file from URL
   */
  async downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(destination);
      https.get(url, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(destination, () => {}); // Delete the file async
        reject(err);
      });
    });
  }

  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  emitProgress(message) {
    logger.info(`Progress: ${message}`);
    if (typeof this.emitProgress === 'function') {
      this.emitProgress(message);
    }
  }
}

export default ServerProvisioner; 
