#!/usr/bin/env node

import readline from 'readline';
import path from 'path';
import fs from 'fs/promises';
import ServerProvisioner from '../services/server-provisioner.js';
import consoleLogger from './console-logger.js';

/**
 * Interactive Console Interface for ASA Server Management
 * Provides a user-friendly command-line interface for managing ARK clusters
 * Updated for separate binary architecture
 */
class InteractiveConsole {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // Create a custom provisioner with console logger
    this.provisioner = new ServerProvisioner();
    
    // Override the logger in the provisioner to use console logger
    this.provisioner.logger = consoleLogger;
    
    this.isRunning = false;
  }

  /**
   * Start the interactive console
   */
  async start() {
    console.log('\n=== ASA Server Management Console ===');
    console.log('=== Separate Binary Architecture ===\n');
    
    // Handle Ctrl+C gracefully - only exit the console, not the entire process
    process.on('SIGINT', () => {
      console.log('\n\nExiting interactive console...');
      this.isRunning = false;
      this.rl.close();
      process.exit(0);
    });
    
    try {
      // Check if .env file exists
      const envPath = path.join(process.cwd(), '.env');
      const envExists = await fs.access(envPath).then(() => true).catch(() => false);
      
      if (!envExists) {
        console.log('⚠️  No .env file found. First-time setup detected!');
        const runSetup = await this.question('Run first-time setup wizard? (Y/n): ');
        if (runSetup.toLowerCase() !== 'n') {
          await this.firstTimeSetup();
        } else {
          console.log('You can run setup later from the main menu (option 12).\n');
        }
      }
      
      // Initialize the provisioner with smart detection
      console.log('Initializing server provisioning system...');
      
      try {
        await this.provisioner.initialize();
        console.log('✓ System initialized successfully\n');
      } catch (error) {
        console.log('⚠️  System initialization error:');
        console.log(`   ${error.message}`);
        console.log('   You can still use the console to configure clusters.');
        console.log('   Use option 7 (System Information) to check status.\n');
      }
      
      // Show installation status
      await this.showInstallationStatus();
      
      this.isRunning = true;
      await this.showMainMenu();
    } catch (error) {
      console.error('Failed to start console:', error.message);
      process.exit(1);
    }
  }

  /**
   * Show installation status and detect what's already installed
   */
  async showInstallationStatus() {
    console.log('=== Installation Status ===');
    
    // Check SteamCMD
    const steamCmdStatus = await this.checkSteamCmdStatus();
    console.log(`SteamCMD: ${steamCmdStatus.status} ${steamCmdStatus.path ? `(${steamCmdStatus.path})` : ''}`);
    
    // Check Servers
    const serversStatus = await this.checkServersStatus();
    console.log(`Servers: ${serversStatus.status}`);
    
    // Check Clusters
    const clustersStatus = await this.checkClustersStatus();
    console.log(`Clusters: ${clustersStatus.status}`);
    
    // Check directories
    const dirStatus = await this.checkDirectoryStatus();
    console.log(`Directories: ${dirStatus.status}`);
    
    console.log('');
  }

  /**
   * Check SteamCMD installation status
   */
  async checkSteamCmdStatus() {
    try {
      // Check if SteamCMD exists at configured path
      await fs.access(this.provisioner.steamCmdExe);
      return { status: '✓ Installed', path: this.provisioner.steamCmdExe };
    } catch (error) {
      // Check for existing SteamCMD installations
      const existingSteamCmd = await this.provisioner.findExistingSteamCmd();
      if (existingSteamCmd) {
        return { status: '✓ Found existing', path: existingSteamCmd };
      }
      return { status: '❌ Not installed', path: null };
    }
  }

  /**
   * Check servers status
   */
  async checkServersStatus() {
    try {
      const servers = await this.provisioner.listServers();
      if (servers.length > 0) {
        return { status: `✓ ${servers.length} server(s) created` };
      } else {
        return { status: '⚠️  No servers created' };
      }
    } catch (error) {
      return { status: '❌ Error checking servers' };
    }
  }

  /**
   * Check clusters status
   */
  async checkClustersStatus() {
    try {
      const clusters = await this.provisioner.listClusters();
      if (clusters.length > 0) {
        return { status: `✓ ${clusters.length} cluster(s) created` };
      } else {
        return { status: '⚠️  No clusters created' };
      }
    } catch (error) {
      return { status: '❌ Error checking clusters' };
    }
  }

  /**
   * Check directory structure status
   */
  async checkDirectoryStatus() {
    const requiredDirs = [
      this.provisioner.basePath,
      this.provisioner.steamCmdPath,
      this.provisioner.serversPath,
      this.provisioner.clustersPath
    ];
    
    let existingCount = 0;
    for (const dir of requiredDirs) {
      try {
        await fs.access(dir);
        existingCount++;
      } catch (error) {
        // Directory doesn't exist
      }
    }
    
    if (existingCount === requiredDirs.length) {
      return { status: '✓ All directories exist' };
    } else if (existingCount > 0) {
      return { status: `⚠️  ${existingCount}/${requiredDirs.length} directories exist` };
    } else {
      return { status: '❌ No directories exist' };
    }
  }

  /**
   * Show the main menu
   */
  async showMainMenu() {
    while (this.isRunning) {
      console.log('\n=== Main Menu ===');
      console.log('1. Create New Server');
      console.log('2. Create New Cluster');
      console.log('3. List Servers');
      console.log('4. List Clusters');
      console.log('5. Start Server');
      console.log('6. Stop Server');
      console.log('7. System Information');
      console.log('8. Install SteamCMD');
      console.log('9. Update Server Binaries');
      console.log('10. Update All Servers');
      console.log('11. Configure Environment');
      console.log('12. First-Time Setup');
      console.log('0. Exit');
      
      const choice = await this.question('\nSelect an option (1-12, 0): ');
      
      switch (choice.trim()) {
        case '1':
          await this.createServer();
          break;
        case '2':
          await this.createCluster();
          break;
        case '3':
          await this.listServers();
          break;
        case '4':
          await this.listClusters();
          break;
        case '5':
          await this.startServer();
          break;
        case '6':
          await this.stopServer();
          break;
        case '7':
          await this.showSystemInfo();
          break;
        case '8':
          await this.installSteamCmd();
          break;
        case '9':
          await this.updateServerBinaries();
          break;
        case '10':
          await this.updateAllServers();
          break;
        case '11':
          await this.configureEnvironment();
          break;
        case '12':
          await this.firstTimeSetup();
          break;
        case '0':
          console.log('Goodbye!');
          this.isRunning = false;
          this.rl.close();
          process.exit(0);
          break;
        default:
          console.log('Invalid option. Please try again.');
      }
    }
  }

  /**
   * Create a new server
   */
  async createServer() {
    console.log('\n=== Create New Server ===');
    
    try {
      const serverName = await this.question('Server name: ');
      if (!serverName.trim()) {
        console.log('❌ Server name is required');
        return;
      }

      const map = await this.question('Map (TheIsland/TheCenter/Ragnarok/etc.) [TheIsland]: ') || 'TheIsland';
      const gamePort = parseInt(await this.question('Game port [7777]: ') || '7777');
      const maxPlayers = parseInt(await this.question('Max players [70]: ') || '70');
      const adminPassword = await this.question('Admin password [admin123]: ') || 'admin123';
      const serverPassword = await this.question('Server password (optional): ') || '';
      
      const serverConfig = {
        name: serverName.trim(),
        map: map.trim(),
        gamePort,
        queryPort: gamePort + 19338,
        rconPort: gamePort + 24553,
        maxPlayers,
        adminPassword,
        serverPassword,
        rconPassword: adminPassword, // RCON password is same as admin password
        harvestMultiplier: 3.0,
        xpMultiplier: 3.0,
        tamingMultiplier: 5.0
      };

      console.log('\nCreating server...');
      const result = await this.provisioner.createServer(serverConfig);
      
      console.log('✓ Server created successfully!');
      console.log(`   Path: ${result.serverPath}`);
      console.log(`   Map: ${serverConfig.map}`);
      console.log(`   Port: ${serverConfig.gamePort}`);
      console.log(`   Max Players: ${serverConfig.maxPlayers}`);
      
    } catch (error) {
      console.log(`❌ Failed to create server: ${error.message}`);
    }
  }

  /**
   * Create a new cluster
   */
  async createCluster() {
    console.log('\n=== Create New Cluster ===');
    
    try {
      const clusterName = await this.question('Cluster name: ');
      if (!clusterName.trim()) {
        console.log('❌ Cluster name is required');
        return;
      }

      const description = await this.question('Description (optional): ') || '';
      const serverCount = parseInt(await this.question('Number of servers [1]: ') || '1');
      const basePort = parseInt(await this.question('Base port [7777]: ') || '7777');
      const maxPlayers = parseInt(await this.question('Max players per server [70]: ') || '70');
      const adminPassword = await this.question('Admin password [admin123]: ') || 'admin123';
      const clusterPassword = await this.question('Cluster password (optional): ') || '';
      
      const clusterConfig = {
        name: clusterName.trim(),
        description: description.trim(),
        serverCount,
        basePort,
        maxPlayers,
        adminPassword,
        serverPassword: '',
        rconPassword: adminPassword, // RCON password is same as admin password
        clusterPassword,
        harvestMultiplier: 3.0,
        xpMultiplier: 3.0,
        tamingMultiplier: 5.0
      };

      console.log('\nCreating cluster...');
      const result = await this.provisioner.createCluster(clusterConfig);
      
      console.log('✓ Cluster created successfully!');
      console.log(`   Name: ${clusterConfig.name}`);
      console.log(`   Servers: ${clusterConfig.serverCount}`);
      console.log(`   Base Port: ${clusterConfig.basePort}`);
      console.log(`   Max Players: ${clusterConfig.maxPlayers}`);
      
    } catch (error) {
      console.log(`❌ Failed to create cluster: ${error.message}`);
    }
  }

  /**
   * List all servers
   */
  async listServers() {
    console.log('\n=== Servers ===');
    
    try {
      const servers = await this.provisioner.listServers();
      
      if (servers.length === 0) {
        console.log('No servers found.');
        return;
      }
      
      servers.forEach((server, index) => {
        console.log(`${index + 1}. ${server.name}`);
        console.log(`   Map: ${server.config?.map || 'Unknown'}`);
        console.log(`   Port: ${server.config?.gamePort || 'Unknown'}`);
        console.log(`   Created: ${new Date(server.created).toLocaleDateString()}`);
        console.log('');
      });
      
    } catch (error) {
      console.log(`❌ Failed to list servers: ${error.message}`);
    }
  }

  /**
   * List all clusters
   */
  async listClusters() {
    console.log('\n=== Clusters ===');
    
    try {
      const clusters = await this.provisioner.listClusters();
      
      if (clusters.length === 0) {
        console.log('No clusters found.');
        return;
      }
      
      clusters.forEach((cluster, index) => {
        console.log(`${index + 1}. ${cluster.name}`);
        console.log(`   Description: ${cluster.config?.description || 'No description'}`);
        console.log(`   Servers: ${cluster.config?.servers?.length || 0}`);
        console.log(`   Created: ${new Date(cluster.created).toLocaleDateString()}`);
        console.log('');
      });
      
    } catch (error) {
      console.log(`❌ Failed to list clusters: ${error.message}`);
    }
  }

  /**
   * Start a server
   */
  async startServer() {
    console.log('\n=== Start Server ===');
    
    try {
      const servers = await this.provisioner.listServers();
      
      if (servers.length === 0) {
        console.log('No servers found. Create a server first.');
        return;
      }
      
      console.log('Available servers:');
      servers.forEach((server, index) => {
        console.log(`${index + 1}. ${server.name}`);
      });
      
      const choice = await this.question('\nSelect server to start (number): ');
      const serverIndex = parseInt(choice) - 1;
      
      if (serverIndex < 0 || serverIndex >= servers.length) {
        console.log('❌ Invalid selection');
        return;
      }
      
      const serverName = servers[serverIndex].name;
      console.log(`Starting server: ${serverName}`);
      
      // Note: This would require integration with the server manager
      console.log('⚠️  Server start functionality requires server manager integration');
      console.log('   Use the web dashboard to start servers for now.');
      
    } catch (error) {
      console.log(`❌ Failed to start server: ${error.message}`);
    }
  }

  /**
   * Stop a server
   */
  async stopServer() {
    console.log('\n=== Stop Server ===');
    
    try {
      const servers = await this.provisioner.listServers();
      
      if (servers.length === 0) {
        console.log('No servers found. Create a server first.');
        return;
      }
      
      console.log('Available servers:');
      servers.forEach((server, index) => {
        console.log(`${index + 1}. ${server.name}`);
      });
      
      const choice = await this.question('\nSelect server to stop (number): ');
      const serverIndex = parseInt(choice) - 1;
      
      if (serverIndex < 0 || serverIndex >= servers.length) {
        console.log('❌ Invalid selection');
        return;
      }
      
      const serverName = servers[serverIndex].name;
      console.log(`Stopping server: ${serverName}`);
      
      // Note: This would require integration with the server manager
      console.log('⚠️  Server stop functionality requires server manager integration');
      console.log('   Use the web dashboard to stop servers for now.');
      
    } catch (error) {
      console.log(`❌ Failed to stop server: ${error.message}`);
    }
  }

  /**
   * Show system information
   */
  async showSystemInfo() {
    console.log('\n=== System Information ===');
    
    try {
      const systemInfo = await this.provisioner.getSystemInfo();
      const diskSpace = await this.provisioner.getDiskSpace();
      const memoryInfo = await this.provisioner.getMemoryInfo();
      
      console.log('System:');
      console.log(`  Platform: ${systemInfo.platform}`);
      console.log(`  Architecture: ${systemInfo.arch}`);
      console.log(`  Node.js Version: ${systemInfo.nodeVersion}`);
      console.log(`  CPU Cores: ${systemInfo.cpuCores}`);
      
      console.log('\nDisk Space:');
      console.log(`  Total: ${diskSpace.total} GB`);
      console.log(`  Free: ${diskSpace.free} GB`);
      console.log(`  Used: ${diskSpace.used} GB`);
      console.log(`  Usage: ${diskSpace.usagePercent}%`);
      
      console.log('\nMemory:');
      console.log(`  Total: ${memoryInfo.total} GB`);
      console.log(`  Free: ${memoryInfo.free} GB`);
      console.log(`  Used: ${memoryInfo.used} GB`);
      console.log(`  Usage: ${memoryInfo.usagePercent}%`);
      
      console.log('\nPaths:');
      console.log(`  Base Path: ${this.provisioner.basePath}`);
      console.log(`  Servers Path: ${this.provisioner.serversPath}`);
      console.log(`  Clusters Path: ${this.provisioner.clustersPath}`);
      console.log(`  SteamCMD Path: ${this.provisioner.steamCmdPath}`);
      
    } catch (error) {
      console.log(`❌ Failed to get system information: ${error.message}`);
    }
  }

  /**
   * Install SteamCMD
   */
  async installSteamCmd() {
    console.log('\n=== Install SteamCMD ===');
    
    try {
      const steamCmdStatus = await this.checkSteamCmdStatus();
      
      if (steamCmdStatus.status.includes('✓')) {
        console.log('SteamCMD is already installed.');
        const reinstall = await this.question('Reinstall? (y/N): ');
        if (reinstall.toLowerCase() !== 'y') {
          return;
        }
      }
      
      console.log('Installing SteamCMD...');
      await this.provisioner.installSteamCmd();
      console.log('✓ SteamCMD installed successfully!');
      
    } catch (error) {
      console.log(`❌ Failed to install SteamCMD: ${error.message}`);
    }
  }

  /**
   * Update server binaries
   */
  async updateServerBinaries() {
    console.log('\n=== Update Server Binaries ===');
    
    try {
      const servers = await this.provisioner.listServers();
      
      if (servers.length === 0) {
        console.log('No servers found. Create a server first.');
        return;
      }
      
      console.log('Available servers:');
      servers.forEach((server, index) => {
        console.log(`${index + 1}. ${server.name}`);
      });
      
      const choice = await this.question('\nSelect server to update (number): ');
      const serverIndex = parseInt(choice) - 1;
      
      if (serverIndex < 0 || serverIndex >= servers.length) {
        console.log('❌ Invalid selection');
        return;
      }
      
      const serverName = servers[serverIndex].name;
      console.log(`Updating server: ${serverName}`);
      
      await this.provisioner.updateServerBinaries(serverName);
      console.log('✓ Server updated successfully!');
      
    } catch (error) {
      console.log(`❌ Failed to update server: ${error.message}`);
    }
  }

  /**
   * Update all servers
   */
  async updateAllServers() {
    console.log('\n=== Update All Servers ===');
    
    try {
      const servers = await this.provisioner.listServers();
      
      if (servers.length === 0) {
        console.log('No servers found. Create a server first.');
        return;
      }
      
      console.log(`Found ${servers.length} server(s) to update.`);
      const confirm = await this.question('Continue? (y/N): ');
      
      if (confirm.toLowerCase() !== 'y') {
        return;
      }
      
      console.log('Updating all servers...');
      const result = await this.provisioner.updateAllServerBinaries();
      
      console.log('✓ All servers updated successfully!');
      console.log('Results:');
      result.results.forEach((serverResult) => {
        const status = serverResult.success ? '✓' : '❌';
        console.log(`  ${status} ${serverResult.server}`);
        if (!serverResult.success) {
          console.log(`    Error: ${serverResult.error}`);
        }
      });
      
    } catch (error) {
      console.log(`❌ Failed to update all servers: ${error.message}`);
    }
  }

  /**
   * Configure environment
   */
  async configureEnvironment() {
    console.log('\n=== Configure Environment ===');
    
    try {
      const basePath = await this.question(`Base path [${this.provisioner.basePath}]: `) || this.provisioner.basePath;
      const steamCmdPath = await this.question(`SteamCMD path [${this.provisioner.steamCmdPath}]: `) || this.provisioner.steamCmdPath;
      
      const config = {
        NATIVE_BASE_PATH: basePath,
        STEAMCMD_PATH: steamCmdPath
      };
      
      await this.updateEnvFile(config);
      console.log('✓ Environment configured successfully!');
      console.log('   Restart the console for changes to take effect.');
      
    } catch (error) {
      console.log(`❌ Failed to configure environment: ${error.message}`);
    }
  }

  /**
   * First-time setup
   */
  async firstTimeSetup() {
    console.log('\n=== First-Time Setup ===');
    console.log('This will configure your ASA server environment.');
    
    try {
      const basePath = await this.question('Base path for ASA servers [C:\\ARK]: ') || 'C:\\ARK';
      const steamCmdPath = await this.question('SteamCMD path [C:\\SteamCMD]: ') || 'C:\\SteamCMD';
      
      const config = {
        NATIVE_BASE_PATH: basePath,
        STEAMCMD_PATH: steamCmdPath
      };
      
      console.log('\nCreating directories...');
      await this.provisioner.createDirectories();
      
      console.log('Installing SteamCMD...');
      await this.provisioner.installSteamCmd();
      
      await this.updateEnvFile(config);
      
      console.log('✓ First-time setup completed successfully!');
      console.log('   You can now create servers and clusters.');
      
    } catch (error) {
      console.log(`❌ Setup failed: ${error.message}`);
    }
  }

  /**
   * Update .env file
   */
  async updateEnvFile(config) {
    const envPath = path.join(process.cwd(), '.env');
    let content = '';
    
    try {
      content = await fs.readFile(envPath, 'utf8');
    } catch (error) {
      // File doesn't exist, create new content
      content = '# ASA Server Configuration\n';
    }
    
    content = this.updateEnvContent(content, config);
    await fs.writeFile(envPath, content);
  }

  /**
   * Update environment content
   */
  updateEnvContent(content, config) {
    let updatedContent = content;
    
    for (const [key, value] of Object.entries(config)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const newLine = `${key}=${value}`;
      
      if (regex.test(updatedContent)) {
        updatedContent = updatedContent.replace(regex, newLine);
      } else {
        updatedContent += `\n${newLine}`;
      }
    }
    
    return updatedContent;
  }

  /**
   * Ask a question and return the answer
   */
  question(query) {
    return new Promise((resolve) => {
      this.rl.question(query, resolve);
    });
  }
}

// Start the console if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const console = new InteractiveConsole();
  console.start().catch(console.error);
}

export default InteractiveConsole; 
 