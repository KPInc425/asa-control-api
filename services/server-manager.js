import { spawn } from 'child_process';
import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import PowerShellHelper from './powershell-helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Server statistics interface
 */
export class ServerStats {
  constructor(name, status, cpu, memory, uptime, pid) {
    this.name = name;
    this.status = status; // 'running', 'stopped', 'starting', 'stopping'
    this.cpu = cpu; // CPU usage percentage
    this.memory = memory; // Memory usage in MB
    this.uptime = uptime; // Uptime in seconds
    this.pid = pid; // Process ID
  }
}

/**
 * Abstract Server Manager interface
 */
export class ServerManager {
  async start(name) {
    throw new Error('start() must be implemented by subclass');
  }

  async stop(name) {
    throw new Error('stop() must be implemented by subclass');
  }

  async restart(name) {
    throw new Error('restart() must be implemented by subclass');
  }

  async getStats(name) {
    throw new Error('getStats() must be implemented by subclass');
  }

  async getLogs(name, options = {}) {
    throw new Error('getLogs() must be implemented by subclass');
  }

  async listServers() {
    throw new Error('listServers() must be implemented by subclass');
  }

  async isRunning(name) {
    throw new Error('isRunning() must be implemented by subclass');
  }
}

/**
 * Docker-based Server Manager
 */
export class DockerServerManager extends ServerManager {
  constructor(dockerService) {
    super();
    this.docker = dockerService;
  }

  async start(name) {
    try {
      logger.info(`Starting Docker container: ${name}`);
      await this.docker.startContainer(name);
      return { success: true, message: `Container ${name} started successfully` };
    } catch (error) {
      logger.error(`Failed to start Docker container ${name}:`, error);
      throw error;
    }
  }

  async stop(name) {
    try {
      logger.info(`Stopping Docker container: ${name}`);
      await this.docker.stopContainer(name);
      return { success: true, message: `Container ${name} stopped successfully` };
    } catch (error) {
      logger.error(`Failed to stop Docker container ${name}:`, error);
      throw error;
    }
  }

  async restart(name) {
    try {
      logger.info(`Restarting Docker container: ${name}`);
      await this.docker.restartContainer(name);
      return { success: true, message: `Container ${name} restarted successfully` };
    } catch (error) {
      logger.error(`Failed to restart Docker container ${name}:`, error);
      throw error;
    }
  }

  async getStats(name) {
    try {
      const container = await this.docker.getContainer(name);
      const stats = await container.stats({ stream: false });
      
      // Parse Docker stats
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;
      
      const memoryUsage = stats.memory_stats.usage / (1024 * 1024); // Convert to MB
      
      return new ServerStats(
        name,
        container.State.Status,
        Math.round(cpuPercent * 100) / 100,
        Math.round(memoryUsage * 100) / 100,
        Math.floor((Date.now() - new Date(container.State.StartedAt).getTime()) / 1000),
        container.State.Pid
      );
    } catch (error) {
      logger.error(`Failed to get Docker stats for ${name}:`, error);
      throw error;
    }
  }

  async getLogs(name, options = {}) {
    try {
      const container = await this.docker.getContainer(name);
      const logStream = await container.logs({
        stdout: true,
        stderr: true,
        tail: options.tail || 100,
        follow: options.follow || false
      });
      return logStream;
    } catch (error) {
      logger.error(`Failed to get Docker logs for ${name}:`, error);
      throw error;
    }
  }

  async listServers() {
    try {
      const containers = await this.docker.listContainers();
      return containers.filter(container => 
        container.Names.some(name => 
          name.startsWith('/asa-server-') && 
          !name.includes('dashboard') && 
          !name.includes('asa-dashboard-ui')
        )
      ).map(container => ({
        name: container.Names[0].substring(1), // Remove leading slash
        status: container.State,
        image: container.Image,
        ports: container.Ports,
        created: container.Created
      }));
    } catch (error) {
      logger.error('Failed to list Docker containers:', error);
      throw error;
    }
  }

  async isRunning(name) {
    try {
      const container = await this.docker.getContainer(name);
      const info = await container.inspect();
      return info.State.Running;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Native Windows Server Manager
 */
export class NativeServerManager extends ServerManager {
  constructor() {
    super();
    this.basePath = config.server.native.basePath || process.env.NATIVE_BASE_PATH || 'C:\\ARK';
    this.serversPath = path.join(this.basePath, 'servers');
    this.clustersPath = path.join(this.basePath, 'clusters');
    this.processes = new Map(); // Initialize the processes Map
  }

  async start(name) {
    try {
      // Check if server is already running
      const isCurrentlyRunning = await this.isRunning(name);
      if (isCurrentlyRunning) {
        console.log(`Server ${name} is already running. Stopping existing instance to prevent duplicates...`);
        await this.stop(name);
        // Wait a moment for the process to fully stop
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Get server configuration
      const serverInfo = await this.getClusterServerInfo(name);
      if (!serverInfo) {
        throw new Error(`Server configuration not found: ${name}`);
      }
      
      // Check if server path exists
      if (!serverInfo.serverPath || !existsSync(serverInfo.serverPath)) {
        throw new Error(`Server path does not exist: ${serverInfo.serverPath}`);
      }
      
      // Build command line arguments
      const args = this.buildServerArgsFromCluster(serverInfo);
      
      // Create the full command
      const serverExePath = path.join(serverInfo.serverPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
      const fullCommand = `"${serverExePath}" ${args.join(' ')}`;
      
      console.log(`Starting server ${name} with command: ${fullCommand}`);
      
      // Start the server process
      const childProcess = spawn(serverExePath, args, {
        cwd: serverInfo.serverPath,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      // Store process info
      if (!this.processes) {
        this.processes = new Map();
      }
      this.processes.set(name, {
        process: childProcess,
        startTime: new Date(),
        command: fullCommand
      });
      
      // Wait a moment to see if the process starts successfully
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check if process is still running
      if (childProcess.killed) {
        throw new Error(`Server process failed to start: ${name}`);
      }
      
      console.log(`Server ${name} started successfully with PID: ${childProcess.pid}`);
      return { success: true, message: `Server ${name} started successfully`, pid: childProcess.pid };
      
    } catch (error) {
      console.error(`Failed to start server ${name}:`, error);
      throw error;
    }
  }

  async stop(name) {
    try {
      logger.info(`Stopping native server: ${name}`);
      
      const processInfo = this.processes.get(name);
      if (processInfo && processInfo.process) {
        // Kill the process
        processInfo.process.kill('SIGTERM');
        
        // Wait a moment, then force kill if needed
        setTimeout(() => {
          if (processInfo.process && !processInfo.process.killed) {
            processInfo.process.kill('SIGKILL');
          }
        }, 5000);
        
        this.processes.delete(name);
        logger.info(`Stopped server ${name}`);
        return { success: true, message: `Server ${name} stopped` };
      } else {
        // Try to find and kill by process name
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        try {
          await execAsync(`taskkill /f /im ArkAscendedServer.exe /fi "WINDOWTITLE eq ${name}*"`);
          logger.info(`Stopped server ${name} by process name`);
          return { success: true, message: `Server ${name} stopped` };
        } catch (error) {
          logger.warn(`Could not stop server ${name} by process name:`, error.message);
          return { success: false, message: `Server ${name} not running or could not be stopped` };
        }
      }
    } catch (error) {
      logger.error(`Failed to stop server ${name}:`, error);
      throw error;
    }
  }

  async restart(name) {
    try {
      await this.stop(name);
      // Wait a moment for the process to fully stop
      await new Promise(resolve => setTimeout(resolve, 2000));
      return await this.start(name);
    } catch (error) {
      logger.error(`Failed to restart native server ${name}:`, error);
      throw error;
    }
  }

  async getClusterServerInfo(name) {
    try {
      // Find the server in the clusters using the correct native path
      let clustersPath = config.server.native.clustersPath || path.join(this.basePath, 'clusters');
      
      try {
        await fs.access(clustersPath);
        logger.info(`Using native clusters path for server info: ${clustersPath}`);
      } catch (error) {
        logger.warn(`Native clusters path not accessible: ${clustersPath}`, error.message);
        // Try Docker path as fallback
        const dockerClustersPath = '/opt/asa/asa-server/clusters';
        try {
          await fs.access(dockerClustersPath);
          clustersPath = dockerClustersPath;
          logger.info(`Using Docker clusters path as fallback: ${clustersPath}`);
        } catch {
          throw new Error(`No clusters directory found or accessible`);
        }
      }
      
      const clusterDirs = await fs.readdir(clustersPath);
      
      for (const clusterDir of clusterDirs) {
        try {
          const clusterConfigPath = path.join(clustersPath, clusterDir, 'cluster.json');
          const clusterConfigContent = await fs.readFile(clusterConfigPath, 'utf8');
          const clusterConfig = JSON.parse(clusterConfigContent);
          
          if (clusterConfig.servers && Array.isArray(clusterConfig.servers)) {
            const server = clusterConfig.servers.find(s => s.name === name);
            if (server) {
              // Return server info with cluster context
              return {
                ...server,
                clusterName: clusterConfig.name || clusterDir,
                clusterPath: path.join(clustersPath, clusterDir),
                serverPath: server.serverPath || path.join(clustersPath, clusterDir, server.name),
                clusterConfig: clusterConfig
              };
            }
          }
        } catch (error) {
          logger.warn(`Error reading cluster ${clusterDir}:`, error.message);
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Failed to get cluster server info for ${name}:`, error);
      return null;
    }
  }

  async getClusterServerStartBat(name) {
    try {
      const serverInfo = await this.getClusterServerInfo(name);
      return {
        success: true,
        content: serverInfo.startBatContent,
        path: serverInfo.startBatPath
      };
    } catch (error) {
      logger.error(`Failed to get start.bat for ${name}:`, error);
      throw error;
    }
  }

  async updateClusterServerStartBat(name, content) {
    try {
      const serverInfo = await this.getClusterServerInfo(name);
      await fs.writeFile(serverInfo.startBatPath, content, 'utf8');
      return { success: true, message: `Start.bat updated for ${name}` };
    } catch (error) {
      logger.error(`Failed to update start.bat for ${name}:`, error);
      throw error;
    }
  }

  async getStats(name) {
    try {
      // First check if we have a tracked process
      const processInfo = this.processes.get(name);
      if (processInfo) {
        // Try to get real stats from PowerShell
        try {
          const stats = await this.powershellHelper.getProcessInfo(processInfo.processId);
          if (stats.success) {
            const process = stats.process;
            const uptime = Math.floor((Date.now() - new Date(process.StartTime).getTime()) / 1000);
            const memoryMB = Math.round(process.WorkingSet / (1024 * 1024));
            
            return new ServerStats(
              name,
              process.Responding ? 'running' : 'stopped',
              0, // CPU usage not available from this method
              memoryMB,
              uptime,
              process.Id
            );
          }
        } catch (powershellError) {
          logger.error(`PowerShell stats check failed for ${name}:`, powershellError);
        }
        
        // Fallback to basic info from tracking
      const uptime = Math.floor((Date.now() - processInfo.startTime) / 1000);
      return new ServerStats(
        name,
        'running',
        0, // CPU usage not available from container
        0, // Memory usage not available from container
        uptime,
          processInfo.processId
        );
      }

      // For cluster servers, try to find running ASA processes
      try {
        const asaProcesses = await this.powershellHelper.getProcessesByName('ArkAscendedServer');
        if (asaProcesses.success && asaProcesses.processes && asaProcesses.processes.length > 0) {
          // Use the first found process for stats
          const process = asaProcesses.processes[0];
          const uptime = Math.floor((Date.now() - new Date(process.StartTime).getTime()) / 1000);
          const memoryMB = Math.round(process.WorkingSet / (1024 * 1024));
          
          return new ServerStats(
            name,
            'running',
            0, // CPU usage not available
            memoryMB,
            uptime,
            process.Id
          );
        }
        
        // Also check for ShooterGameServer
        const shooterProcesses = await this.powershellHelper.getProcessesByName('ShooterGameServer');
        if (shooterProcesses.success && shooterProcesses.processes && shooterProcesses.processes.length > 0) {
          const process = shooterProcesses.processes[0];
          const uptime = Math.floor((Date.now() - new Date(process.StartTime).getTime()) / 1000);
          const memoryMB = Math.round(process.WorkingSet / (1024 * 1024));
          
          return new ServerStats(
            name,
            'running',
            0, // CPU usage not available
            memoryMB,
            uptime,
            process.Id
          );
        }
      } catch (powershellError) {
        logger.error(`PowerShell process search failed for ${name}:`, powershellError);
      }

      // If no process found, return stopped status
      return new ServerStats(name, 'stopped', 0, 0, 0, null);
    } catch (error) {
      logger.error(`Failed to get native server stats for ${name}:`, error);
      return new ServerStats(name, 'unknown', 0, 0, 0, null);
    }
  }

  async getLogs(name, options = {}) {
    try {
      const processInfo = this.processes.get(name);
      if (!processInfo) {
        throw new Error(`Server ${name} is not running`);
      }

      // For native servers, we'll stream the process output
      const logStream = processInfo.process.stdout;
      
      if (options.follow) {
        return logStream;
      } else {
        // For non-following logs, we'd need to read from log files
        const logPath = path.join(processInfo.config.serverPath || path.join(process.env.NATIVE_BASE_PATH || 'C:\\ARK', 'servers'), 'logs', `${name}.log`);
        const content = await fs.readFile(logPath, 'utf8');
        return content;
      }
    } catch (error) {
      logger.error(`Failed to get native server logs for ${name}:`, error);
      throw error;
    }
  }

  async listServers() {
    try {
      const servers = [];
      
      // List individual servers
      try {
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
                // Use defaults if config not found
              }
              
              const isRunning = await this.isRunning(serverName);
              
              servers.push({
                name: serverName,
                status: isRunning ? 'running' : 'stopped',
                image: 'ASA Server',
                ports: `${serverConfig.gamePort || 7777}:7777, ${serverConfig.queryPort || 27015}:32330, ${serverConfig.rconPort || 32330}:32331`,
                created: serverConfig.created || stat.birthtime.toISOString(),
                type: 'individual-server',
                map: serverConfig.map || 'TheIsland',
                gamePort: serverConfig.gamePort || 7777,
                queryPort: serverConfig.queryPort || 27015,
                rconPort: serverConfig.rconPort || 32330,
                maxPlayers: serverConfig.maxPlayers || 70,
                serverPath: serverPath,
                config: serverConfig,
                isClusterServer: false
              });
            }
          } catch (error) {
            logger.warn(`Error reading server ${serverName}:`, error.message);
          }
        }
      } catch (error) {
        logger.warn(`Could not read servers directory:`, error.message);
      }
      
      // List cluster servers
      try {
        const clustersPath = config.server.native.clustersPath || path.join(this.basePath, 'clusters');
        const clusterDirs = await fs.readdir(clustersPath);
        
        for (const clusterDir of clusterDirs) {
          try {
            const clusterConfigPath = path.join(clustersPath, clusterDir, 'cluster.json');
            const clusterConfigContent = await fs.readFile(clusterConfigPath, 'utf8');
            const clusterConfig = JSON.parse(clusterConfigContent);
            
            if (clusterConfig.servers && Array.isArray(clusterConfig.servers)) {
              for (const server of clusterConfig.servers) {
                const isRunning = await this.isRunning(server.name);
                const serverInfo = {
                  name: server.name,
                  status: isRunning ? 'running' : 'stopped',
                  image: 'ASA Cluster Server',
                  ports: `${server.gamePort || 7777}:7777, ${server.queryPort || 27015}:32330, ${server.rconPort || 32330}:32331`,
                  created: new Date().toISOString(),
                  type: 'cluster-server',
                  clusterName: clusterConfig.name || clusterDir,
                  map: server.map || 'TheIsland',
                  gamePort: server.gamePort || 7777,
                  queryPort: server.queryPort || 27015,
                  rconPort: server.rconPort || 32330,
                  maxPlayers: server.maxPlayers || 70,
                  serverPath: server.serverPath || path.join(clustersPath, clusterDir, server.name),
                  config: server,
                  isClusterServer: true,
                  // Additional fields from enhanced format
                  password: server.serverPassword || '',
                  adminPassword: server.adminPassword || '',
                  clusterId: server.clusterId || clusterConfig.name,
                  clusterPassword: server.clusterPassword || '',
                  clusterOwner: server.clusterOwner || 'Admin',
                  gameUserSettings: server.gameUserSettings || {},
                  gameIni: server.gameIni || {},
                  // Enhanced mod management
                  modManagement: clusterConfig.modManagement || {
                    sharedMods: clusterConfig.globalMods || [],
                    serverMods: {},
                    excludedServers: []
                  }
                };
                
                logger.info(`Adding cluster server to servers list: ${JSON.stringify(serverInfo)}`);
                servers.push(serverInfo);
              }
            }
          } catch (error) {
            logger.warn(`Error reading cluster ${clusterDir}:`, error.message);
          }
        }
      } catch (error) {
        logger.warn(`Could not read clusters directory:`, error.message);
      }
      
      return servers;
    } catch (error) {
      logger.error('Failed to list servers:', error);
      throw error;
    }
  }

  async isRunning(name) {
    try {
      // Ensure processes Map is initialized
      if (!this.processes) {
        this.processes = new Map();
      }
      
      // Check if we have process info
      const processInfo = this.processes.get(name);
      if (processInfo && processInfo.process) {
        return !processInfo.process.killed;
      }
      
      // Get server config to find the ports
      let serverPorts = null;
      try {
        // Try to get server info from cluster config
        const serverInfo = await this.getClusterServerInfo(name);
        if (serverInfo) {
          serverPorts = {
            gamePort: serverInfo.gamePort,
            queryPort: serverInfo.queryPort,
            rconPort: serverInfo.rconPort,
            externalPort: serverInfo.port // This is the external port that appears in command line
          };
        }
      } catch (error) {
        console.warn(`Failed to get server info for ${name}:`, error.message);
      }
      
      // Get all running processes
      const processes = await this.getRunningProcesses();
      
      // Look for matching process by checking multiple criteria
      for (const process of processes) {
        const commandLine = process.commandLine || '';
        const processName = process.name || '';
        
        // Debug logging
        console.log(`Checking process: ${processName}`);
        console.log(`Command line: ${commandLine}`);
        
        // Method 1: Check by external port (primary method)
        if (serverPorts && serverPorts.externalPort) {
          const portPattern = `Port=${serverPorts.externalPort}`;
          if (commandLine.includes(portPattern)) {
            console.log(`Found running server ${name} by external port ${serverPorts.externalPort}`);
            return true;
          }
        }
        
        // Method 2: Check by query port
        if (serverPorts && serverPorts.queryPort) {
          const queryPortPattern = `QueryPort=${serverPorts.queryPort}`;
          if (commandLine.includes(queryPortPattern)) {
            console.log(`Found running server ${name} by query port ${serverPorts.queryPort}`);
            return true;
          }
        }
        
        // Method 3: Check by RCON port
        if (serverPorts && serverPorts.rconPort) {
          const rconPortPattern = `RCONPort=${serverPorts.rconPort}`;
          if (commandLine.includes(rconPortPattern)) {
            console.log(`Found running server ${name} by RCON port ${serverPorts.rconPort}`);
            return true;
          }
        }
        
        // Method 4: Check by session name (fallback)
        if (commandLine.includes(`SessionName=${name}`)) {
          console.log(`Found running server ${name} by session name`);
          return true;
        }
        
        // Method 5: Check by server name in path (fallback)
        if (commandLine.includes(name.replace(/\s+/g, '\\s*'))) {
          console.log(`Found running server ${name} by name in path`);
          return true;
        }
      }
      
      console.log(`No running process found for server ${name}`);
      return false;
    } catch (error) {
      console.error(`Error checking if server ${name} is running:`, error);
      return false;
    }
  }

  /**
   * Add or update server configuration
   */
  async addServerConfig(name, config) {
    this.serverConfigs.set(name, config);
    
    // Save to file
    const configPath = path.join(process.cwd(), 'native-servers.json');
    const allConfigs = {};
    
    try {
      const existingContent = await fs.readFile(configPath, 'utf8');
      Object.assign(allConfigs, JSON.parse(existingContent));
    } catch (error) {
      // File doesn't exist, start with empty config
    }
    
    allConfigs[name] = config;
    await fs.writeFile(configPath, JSON.stringify(allConfigs, null, 2));
  }

  /**
   * Build command line arguments for ASA server
   */
  buildServerArgs(config) {
    const args = [
      config.mapName || 'TheIsland',
      '?listen',
      `?Port=${config.gamePort || 7777}`,
      `?QueryPort=${config.queryPort || 27015}`,
      `?RCONPort=${config.rconPort || 32330}`,
      `?ServerName="${config.serverName || 'ASA Server'}"`,
      `?MaxPlayers=${config.maxPlayers || 70}`,
      `?ServerPassword="${config.serverPassword || ''}"`,
      `?AdminPassword="${config.adminPassword || 'admin123'}"`
    ];

    // Add mods if specified
    if (config.mods && config.mods.length > 0) {
      args.push(`?Mods=${config.mods.join(',')}`);
    }

    // Add additional arguments
    if (config.additionalArgs) {
      args.push(...config.additionalArgs.split(' '));
    }

    return args;
  }

  /**
   * Build command line arguments for cluster server
   */
  buildServerArgsFromCluster(server) {
    const args = [];
    
    // Map
    args.push(server.map || 'TheIsland');
    
    // Basic server parameters
    args.push('?listen');
    args.push(`?Port=${server.gamePort || 7777}`);
    args.push(`?QueryPort=${server.queryPort || 27015}`);
    args.push(`?RCONPort=${server.rconPort || 32330}`);
    args.push(`?MaxPlayers=${server.maxPlayers || 70}`);
    
    // Passwords
    if (server.adminPassword) {
      args.push(`?ServerAdminPassword=${server.adminPassword}`);
    }
    if (server.serverPassword) {
      args.push(`?ServerPassword=${server.serverPassword}`);
    }
    
    // Cluster settings
    if (server.clusterId) {
      args.push(`?ClusterId=${server.clusterId}`);
    }
    if (server.clusterPassword) {
      args.push(`?ClusterPassword=${server.clusterPassword}`);
    }
    
    // Paths - fix ClusterDirOverride path formatting
    const clusterDataPath = path.join(path.dirname(server.serverPath || ''), 'clusterdata').replace(/\\/g, '/');
    args.push(`?ClusterDirOverride=${clusterDataPath}`);
    args.push(`?ConfigOverridePath=./configs`);
    
    return args;
  }

  // Add to NativeServerManager
  async startCluster(clusterName) {
    // Use the correct native clusters path
    const clustersPath = config.server.native.clustersPath || path.join(this.basePath, 'clusters');
    const clusterConfigPath = path.join(clustersPath, clusterName, 'cluster.json');
    const configContent = await fs.readFile(clusterConfigPath, 'utf8');
    const clusterConfig = JSON.parse(configContent);
    if (!clusterConfig.servers || !Array.isArray(clusterConfig.servers)) {
      throw new Error(`No servers found in cluster: ${clusterName}`);
    }
    const results = [];
    for (const server of clusterConfig.servers) {
      try {
        const result = await this.start(server.name);
        results.push({ name: server.name, success: true, result });
      } catch (err) {
        results.push({ name: server.name, success: false, error: err.message });
      }
    }
    return { success: true, message: `Cluster ${clusterName} start attempted.`, results };
  }
  async stopCluster(clusterName) {
    const clustersPath = config.server.native.clustersPath || path.join(this.basePath, 'clusters');
    const clusterConfigPath = path.join(clustersPath, clusterName, 'cluster.json');
    const configContent = await fs.readFile(clusterConfigPath, 'utf8');
    const clusterConfig = JSON.parse(configContent);
    if (!clusterConfig.servers || !Array.isArray(clusterConfig.servers)) {
      throw new Error(`No servers found in cluster: ${clusterName}`);
    }
    const results = [];
    for (const server of clusterConfig.servers) {
      try {
        const result = await this.stop(server.name);
        results.push({ name: server.name, success: true, result });
      } catch (err) {
        results.push({ name: server.name, success: false, error: err.message });
      }
    }
    return { success: true, message: `Cluster ${clusterName} stop attempted.`, results };
  }
  async restartCluster(clusterName) {
    await this.stopCluster(clusterName);
    await this.startCluster(clusterName);
    return { success: true, message: `Cluster ${clusterName} restart commands prepared.` };
  }

  async getRunningProcesses() {
    const processes = [];
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Get all ArkAscendedServer processes
      const command = 'tasklist /FI "IMAGENAME eq ArkAscendedServer.exe" /NH /FO CSV';
      const output = await execAsync(command);
      const lines = output.stdout.split('\n');

      for (const line of lines) {
        if (line.includes('ArkAscendedServer.exe')) {
          const fields = line.split('","');
          if (fields.length >= 2) {
            const processName = fields[0].replace(/"/g, '');
            const pid = fields[1].replace(/"/g, '');
            
            if (processName === 'ArkAscendedServer.exe' && pid) {
              try {
                // Get command line for this process
                const wmicCommand = `wmic process where "ProcessId=${pid}" get CommandLine /format:list`;
                const wmicOutput = await execAsync(wmicCommand);
                
                // Parse the WMIC output
                const commandLineMatch = wmicOutput.stdout.match(/CommandLine=(.+)/);
                const commandLine = commandLineMatch ? commandLineMatch[1].trim() : '';
                
                if (commandLine) {
                  processes.push({
                    id: parseInt(pid, 10),
                    name: processName,
                    commandLine: commandLine,
                    pid: parseInt(pid, 10)
                  });
                }
              } catch (wmicError) {
                console.warn(`Failed to get command line for PID ${pid}:`, wmicError.message);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to get running processes:', error);
    }
    
    console.log(`Found ${processes.length} running ArkAscendedServer processes:`, processes.map(p => ({ pid: p.pid, commandLine: p.commandLine.substring(0, 100) + '...' })));
    return processes;
  }
}

/**
 * Hybrid Server Manager that handles both Docker containers and native cluster servers
 */
export class HybridServerManager extends ServerManager {
  constructor(dockerService) {
    super();
    this.dockerManager = new DockerServerManager(dockerService);
    this.nativeManager = new NativeServerManager();
  }

  async start(name) {
    try {
      // First try to start as a native cluster server
      try {
        const result = await this.nativeManager.start(name);
        return result;
      } catch (nativeError) {
        logger.info(`Server ${name} is not a native cluster server, trying Docker container`);
        // If it's not a native server, try as Docker container
        return await this.dockerManager.start(name);
      }
    } catch (error) {
      logger.error(`Failed to start server ${name}:`, error);
      throw error;
    }
  }

  async stop(name) {
    try {
      // First try to stop as a native cluster server
      try {
        const result = await this.nativeManager.stop(name);
        return result;
      } catch (nativeError) {
        logger.info(`Server ${name} is not a native cluster server, trying Docker container`);
        // If it's not a native server, try as Docker container
        return await this.dockerManager.stop(name);
      }
    } catch (error) {
      logger.error(`Failed to stop server ${name}:`, error);
      throw error;
    }
  }

  async restart(name) {
    try {
      // First try to restart as a native cluster server
      try {
        const result = await this.nativeManager.restart(name);
        return result;
      } catch (nativeError) {
        logger.info(`Server ${name} is not a native cluster server, trying Docker container`);
        // If it's not a native server, try as Docker container
        return await this.dockerManager.restart(name);
      }
    } catch (error) {
      logger.error(`Failed to restart server ${name}:`, error);
      throw error;
    }
  }

  async getStats(name) {
    try {
      // First try to get stats as a native cluster server
      try {
        const result = await this.nativeManager.getStats(name);
        return result;
      } catch (nativeError) {
        logger.info(`Server ${name} is not a native cluster server, trying Docker container`);
        // If it's not a native server, try as Docker container
        return await this.dockerManager.getStats(name);
      }
    } catch (error) {
      logger.error(`Failed to get stats for server ${name}:`, error);
      throw error;
    }
  }

  async getLogs(name, options = {}) {
    try {
      // First try to get logs as a native cluster server
      try {
        const result = await this.nativeManager.getLogs(name, options);
        return result;
      } catch (nativeError) {
        logger.info(`Server ${name} is not a native cluster server, trying Docker container`);
        // If it's not a native server, try as Docker container
        return await this.dockerManager.getLogs(name, options);
      }
    } catch (error) {
      logger.error(`Failed to get logs for server ${name}:`, error);
      throw error;
    }
  }

  async listServers() {
    try {
      // Get both Docker containers and native cluster servers
      const [dockerServers, nativeServers] = await Promise.all([
        this.dockerManager.listServers(),
        this.nativeManager.listServers()
      ]);

      // Combine the lists, giving priority to native servers (they're more specific)
      const allServers = [...nativeServers];
      
      // Add Docker servers that aren't already covered by native servers
      for (const dockerServer of dockerServers) {
        const existingNative = nativeServers.find(ns => ns.name === dockerServer.name);
        if (!existingNative) {
          allServers.push(dockerServer);
        }
      }

      logger.info(`Hybrid listServers() completed. Total servers: ${allServers.length}`);
      logger.info(`Server types: ${allServers.map(s => s.type || 'docker').join(', ')}`);
      return allServers;
    } catch (error) {
      logger.error('Failed to list servers in hybrid mode:', error);
      // Return empty array instead of throwing error to prevent 500 errors
      return [];
    }
  }

  async isRunning(name) {
    try {
      // Check both native and Docker servers
      const [nativeRunning, dockerRunning] = await Promise.all([
        this.nativeManager.isRunning(name).catch(() => false),
        this.dockerManager.isRunning(name).catch(() => false)
      ]);
      return nativeRunning || dockerRunning;
    } catch (error) {
      logger.error(`Failed to check running status for ${name}:`, error);
      return false;
    }
  }

  // Delegate cluster-specific methods to native manager
  async getClusterServerInfo(name) {
    return this.nativeManager.getClusterServerInfo(name);
  }

  async getClusterServerStartBat(name) {
    try {
      const serverInfo = await this.getClusterServerInfo(name);
      return {
        success: true,
        content: serverInfo.startBatContent,
        path: serverInfo.startBatPath
      };
    } catch (error) {
      logger.error(`Failed to get start.bat for ${name}:`, error);
      throw error;
    }
  }

  async updateClusterServerStartBat(name, content) {
    try {
      const serverInfo = await this.getClusterServerInfo(name);
      await fs.writeFile(serverInfo.startBatPath, content, 'utf8');
      return { success: true, message: `Start.bat updated for ${name}` };
    } catch (error) {
      logger.error(`Failed to update start.bat for ${name}:`, error);
      throw error;
    }
  }

  // In HybridServerManager, delegate to nativeManager
  async startCluster(name) { return this.nativeManager.startCluster(name); }
  async stopCluster(name) { return this.nativeManager.stopCluster(name); }
  async restartCluster(name) { return this.nativeManager.restartCluster(name); }
}

/**
 * Factory function to create the appropriate ServerManager
 */
export function createServerManager(dockerService = null) {
  const serverMode = process.env.SERVER_MODE || 'docker';
  
  if (serverMode === 'native') {
    logger.info('Initializing Native Server Manager');
    return new NativeServerManager();
  } else if (serverMode === 'hybrid') {
    logger.info('Initializing Hybrid Server Manager (Docker + Native)');
    return new HybridServerManager(dockerService);
  } else {
    logger.info('Initializing Docker Server Manager');
    return new DockerServerManager(dockerService);
  }
}

export default createServerManager; 

