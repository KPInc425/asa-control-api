import { spawn } from 'child_process';
import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import PowerShellHelper from './powershell-helper.js';
import { 
  upsertServerConfig, 
  getServerConfig, 
  getAllServerConfigs,
  getAllSharedMods,
  getServerMods
} from './database.js';

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
    this.dockerService = dockerService;
  }

  async start(name) {
    try {
      logger.info(`Starting Docker container: ${name}`);
      await this.dockerService.startContainer(name);
      return { success: true, message: `Container ${name} started successfully` };
    } catch (error) {
      logger.error(`Failed to start Docker container ${name}:`, error);
      throw error;
    }
  }

  async stop(name) {
    try {
      logger.info(`Stopping Docker container: ${name}`);
      await this.dockerService.stopContainer(name);
      return { success: true, message: `Container ${name} stopped successfully` };
    } catch (error) {
      logger.error(`Failed to stop Docker container ${name}:`, error);
      throw error;
    }
  }

  async restart(name) {
    try {
      logger.info(`Restarting Docker container: ${name}`);
      await this.dockerService.restartContainer(name);
      return { success: true, message: `Container ${name} restarted successfully` };
    } catch (error) {
      logger.error(`Failed to restart Docker container ${name}:`, error);
      throw error;
    }
  }

  async getStats(name) {
    try {
      const stats = await this.dockerService.getContainerStats(name);
      
      return new ServerStats(
        name,
        'running', // Docker containers are either running or stopped
        parseFloat(stats.cpu.percentage),
        parseFloat(stats.memory.percentage),
        0, // Docker uptime would need to be calculated differently
        null // Docker doesn't expose PID directly
      );
    } catch (error) {
      logger.error(`Failed to get Docker stats for ${name}:`, error);
      throw error;
    }
  }

  async getLogs(name, options = {}) {
    try {
      const logs = await this.dockerService.getContainerLogs(name, options);
      return logs.split('\n').filter(line => line.trim());
    } catch (error) {
      logger.error(`Failed to get Docker logs for ${name}:`, error);
      throw error;
    }
  }

  async listServers() {
    try {
      const containers = await this.dockerService.listContainers();
      return containers.map(container => ({
        name: container.name,
        status: container.status,
        image: container.image,
        ports: container.ports,
        created: container.created,
        type: 'container'
      }));
    } catch (error) {
      // Check if it's a Docker connection error
      if (error.code === 'ENOENT' && error.message.includes('docker_engine')) {
        logger.warn('Docker is not running or not accessible. Returning empty server list.');
        return [];
      }
      
      logger.error('Failed to list Docker containers:', error);
      throw error;
    }
  }

  async isRunning(name) {
    try {
      const containers = await this.dockerService.listContainers();
      const container = containers.find(c => c.name === name);
      return container ? container.status === 'running' : false;
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
    
    // Set up EventEmitter for crash detection
    this.eventEmitter = new EventEmitter();
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
      
      // Regenerate start.bat with latest mods and config before starting
      console.log(`Regenerating start.bat for server ${name} with latest configuration...`);
      try {
        await this.regenerateServerStartScript(name);
        console.log(`Successfully regenerated start.bat for server ${name}`);
      } catch (regenerateError) {
        console.warn(`Failed to regenerate start.bat for server ${name}:`, regenerateError.message);
        // Continue with existing start.bat if regeneration fails
      }
      
      // Get server configuration
      const serverInfo = await this.getClusterServerInfo(name);
      if (!serverInfo) {
        throw new Error(`Server configuration not found: ${name}`);
      }
      
      // Debug: Log the server info to see what ports we have
      console.log(`Server info for ${name}:`, {
        name: serverInfo.name,
        gamePort: serverInfo.gamePort,
        port: serverInfo.port,
        queryPort: serverInfo.queryPort,
        rconPort: serverInfo.rconPort,
        serverPath: serverInfo.serverPath
      });
      
      // Check if server path exists
      if (!serverInfo.serverPath || !existsSync(serverInfo.serverPath)) {
        throw new Error(`Server path does not exist: ${serverInfo.serverPath}`);
      }
      
      // Check if the start.bat file exists
      const startBatPath = path.join(serverInfo.serverPath, 'start.bat');
      if (!existsSync(startBatPath)) {
        throw new Error(`Start.bat file not found: ${startBatPath}`);
      }
      
      console.log(`Using start.bat file: ${startBatPath}`);
      console.log(`Working directory: ${serverInfo.serverPath}`);
      
      // Start the server using the start.bat file
      const childProcess = spawn('cmd', ['/c', 'start.bat'], {
        cwd: serverInfo.serverPath,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      console.log(`Process spawned with PID: ${childProcess.pid}`);
      
      // Store process info with enhanced monitoring
      if (!this.processes) {
        this.processes = new Map();
      }
      
      const processInfo = {
        process: childProcess,
        startTime: new Date(),
        command: `cmd /c start.bat`,
        name: name,
        serverInfo: serverInfo,
        startupOutput: '',
        startupErrors: '',
        status: 'starting'
      };
      
      this.processes.set(name, processInfo);
      
      // Capture startup output for error detection
      childProcess.stdout.on('data', (data) => {
        const output = data.toString();
        processInfo.startupOutput += output;
        console.log(`[${name}] STDOUT: ${output.trim()}`);
      });
      
      childProcess.stderr.on('data', (data) => {
        const error = data.toString();
        processInfo.startupErrors += error;
        console.error(`[${name}] STDERR: ${error.trim()}`);
      });
      
      // Add process event listeners for debugging
      childProcess.on('error', (error) => {
        console.error(`[${name}] Process error event:`, error);
        processInfo.status = 'error';
        processInfo.error = error.message;
        processInfo.errorTime = new Date();
      });
      
      childProcess.on('exit', (code, signal) => {
        console.log(`[${name}] Process exit event - Code: ${code}, Signal: ${signal}`);
        processInfo.status = 'exited';
        processInfo.exitCode = code;
        processInfo.exitSignal = signal;
        processInfo.exitTime = new Date();
      });
      
      childProcess.on('close', (code, signal) => {
        console.log(`[${name}] Process close event - Code: ${code}, Signal: ${signal}`);
        processInfo.status = 'closed';
        processInfo.closeCode = code;
        processInfo.closeSignal = signal;
        processInfo.closeTime = new Date();
      });
      
      // Enhanced startup monitoring - pass references to the actual output
      // Add a small delay to capture any immediate output
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const startupResult = await this.monitorStartup(name, childProcess, serverInfo, processInfo);
      
      if (!startupResult.success) {
        // Clean up failed process
        this.processes.delete(name);
        throw new Error(startupResult.message);
      }
      
      // Set up crash detection
      this.setupCrashDetection(name, childProcess);
      
      console.log(`Server ${name} started successfully with PID: ${childProcess.pid}`);
      return { 
        success: true, 
        message: `Server ${name} started successfully`, 
        pid: childProcess.pid,
        startupTime: Date.now() - processInfo.startTime.getTime()
      };
      
    } catch (error) {
      console.error(`Failed to start server ${name}:`, error);
      throw error;
    }
  }

  async monitorStartup(name, childProcess, serverInfo, processInfo) {
    const maxStartupTime = 30000; // 30 seconds max startup time (reduced from 60)
    const checkInterval = 2000; // Check every 2 seconds (reduced from 3)
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxStartupTime) {
      // Check if process is still running
      if (childProcess.killed) {
        // The cmd process has exited, which is normal for start.bat
        // Check if the actual server process is running
        const isServerRunning = await this.isRunning(name);
        if (isServerRunning) {
          // Update process info to reflect that the server is running
          processInfo.status = 'running';
          processInfo.process = null; // The cmd process is gone, but server is running
          return {
            success: true,
            message: 'Server started successfully'
          };
        } else {
          return {
            success: false,
            message: `Server process crashed during startup. Errors: ${processInfo.startupErrors || 'Unknown error'}`
          };
        }
      }
      
      // Check for common startup errors in output
      if (processInfo.startupErrors.includes('Fatal error') || 
          processInfo.startupErrors.includes('Failed to start') ||
          processInfo.startupErrors.includes('Port already in use') ||
          processInfo.startupErrors.includes('Access denied')) {
        return {
          success: false,
          message: `Server startup failed: ${processInfo.startupErrors}`
        };
      }
      
      // Check for successful startup indicators in output
      if (processInfo.startupOutput.includes('Server started') || 
          processInfo.startupOutput.includes('Listening on port') ||
          processInfo.startupOutput.includes('Server is ready') ||
          processInfo.startupOutput.includes('Game server started')) {
        // Update process info
        processInfo.status = 'running';
        return {
          success: true,
          message: 'Server started successfully'
        };
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    // If we reach here, check if the server is actually running
    const isServerRunning = await this.isRunning(name);
    if (isServerRunning) {
      // Update process info
      processInfo.status = 'running';
      processInfo.process = null; // The cmd process is gone, but server is running
      return {
        success: true,
        message: 'Server appears to be running (process active)'
      };
    }
    
    // If we timeout but the server process exists, consider it a success
    // This handles cases where the server takes longer to fully initialize
    const runningProcesses = await this.getRunningProcesses();
    const serverProcess = runningProcesses.find(process => {
      const commandLine = process.commandLine || '';
      return commandLine.includes(`SessionName=${name}`) || 
             commandLine.includes(`SessionName=${name.replace(/\s+/g, '%20')}`) ||
             commandLine.includes(name);
    });
    
    if (serverProcess) {
      // Update process info
      processInfo.status = 'running';
      processInfo.process = null;
      return {
        success: true,
        message: 'Server process detected (startup may still be in progress)'
      };
    }
    
    return {
      success: false,
      message: `Server startup timed out after ${maxStartupTime/1000} seconds. Server may be stuck.`
    };
  }

  setupCrashDetection(name, childProcess) {
    childProcess.on('exit', (code, signal) => {
      console.log(`Server ${name} process exited with code ${code} and signal ${signal}`);
      
      const processInfo = this.processes.get(name);
      if (processInfo) {
        processInfo.status = 'crashed';
        processInfo.exitCode = code;
        processInfo.exitSignal = signal;
        processInfo.exitTime = new Date();
        
        // Emit crash event for real-time updates
        this.eventEmitter.emit('serverCrashed', {
          name: name,
          code: code,
          signal: signal,
          uptime: processInfo.exitTime - processInfo.startTime
        });
      }
      
      // Clean up after a delay to allow for restart attempts
      setTimeout(() => {
        this.processes.delete(name);
      }, 60000); // Keep crash info for 1 minute
    });
    
    childProcess.on('error', (error) => {
      console.error(`Server ${name} process error:`, error);
      
      const processInfo = this.processes.get(name);
      if (processInfo) {
        processInfo.status = 'error';
        processInfo.error = error.message;
        processInfo.errorTime = new Date();
      }
    });
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
        // Try to find and kill by matching command line arguments
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        try {
          // Get all running ASA processes
          const runningProcesses = await this.getRunningProcesses();
          
          // Find the process that matches this server name
          const targetProcess = runningProcesses.find(process => {
            const commandLine = process.commandLine || '';
            // Look for the server name in the command line arguments
            // The server name is typically in the SessionName parameter
            return commandLine.includes(`SessionName=${name}`) || 
                   commandLine.includes(`SessionName=${name.replace(/\s+/g, '%20')}`) ||
                   commandLine.includes(name);
          });
          
          if (targetProcess) {
            // Kill the specific process by PID
            await execAsync(`taskkill /f /pid ${targetProcess.pid}`);
            logger.info(`Stopped server ${name} by PID ${targetProcess.pid}`);
            return { success: true, message: `Server ${name} stopped` };
          } else {
            logger.warn(`No running process found for server ${name}`);
            return { success: false, message: `Server ${name} not running` };
          }
        } catch (error) {
          logger.warn(`Could not stop server ${name} by process matching:`, error.message);
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

  async listLogFiles(name) {
    try {
      // First, try to get server info to find the correct path
      let serverInfo = null;
      try {
        serverInfo = await this.getClusterServerInfo(name);
      } catch (error) {
        logger.warn(`Could not get cluster server info for ${name}:`, error.message);
      }

      let serverPath = null;
      if (serverInfo && serverInfo.serverPath) {
        serverPath = serverInfo.serverPath;
      } else {
        // Fallback to default path
        serverPath = path.join(process.env.NATIVE_BASE_PATH || 'C:\\ARK', 'servers', name);
      }

      const logFiles = [];
      const possibleLogDirs = [
        path.join(serverPath, 'ShooterGame', 'Saved', 'Logs'),
        path.join(serverPath, 'logs'),
        serverPath
      ];

      for (const logDir of possibleLogDirs) {
        try {
          const files = await fs.readdir(logDir);
          for (const file of files) {
            if (file.endsWith('.log') || file.includes('ShooterGame') || file.includes('WindowsServer')) {
              const filePath = path.join(logDir, file);
              const stat = await fs.stat(filePath);
              logFiles.push({
                name: file,
                path: filePath,
                size: stat.size,
                modified: stat.mtime.toISOString()
              });
            }
          }
        } catch (error) {
          // Directory doesn't exist or can't be read
          continue;
        }
      }

      return logFiles.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    } catch (error) {
      logger.error(`Failed to list log files for ${name}:`, error);
      throw error;
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
      // First, try to get server info to find the correct path
      let serverInfo = null;
      try {
        serverInfo = await this.getClusterServerInfo(name);
      } catch (error) {
        logger.warn(`Could not get cluster server info for ${name}:`, error.message);
      }

      let serverPath = null;
      if (serverInfo && serverInfo.serverPath) {
        serverPath = serverInfo.serverPath;
      } else {
        // Fallback to default path
        serverPath = path.join(process.env.NATIVE_BASE_PATH || 'C:\\ARK', 'servers', name);
      }

      // Look for logs in the Saved directory structure
      const possibleLogPaths = [
        // ARK server logs in Saved/Logs
        path.join(serverPath, 'ShooterGame', 'Saved', 'Logs', 'ShooterGame.log'),
        path.join(serverPath, 'ShooterGame', 'Saved', 'Logs', 'ShooterGame_*.log'),
        // Alternative log locations
        path.join(serverPath, 'logs', `${name}.log`),
        path.join(serverPath, 'ShooterGame.log'),
        // Windows server logs
        path.join(serverPath, 'ShooterGame', 'Saved', 'Logs', 'WindowsServer.log'),
        path.join(serverPath, 'ShooterGame', 'Saved', 'Logs', 'WindowsServer_*.log')
      ];

      let logContent = '';
      let foundLog = false;

      for (const logPath of possibleLogPaths) {
        try {
          if (logPath.includes('*')) {
            // Handle wildcard patterns
            const logDir = path.dirname(logPath);
            const logFiles = await fs.readdir(logDir);
            const matchingFiles = logFiles.filter(file => file.startsWith('ShooterGame') || file.startsWith('WindowsServer'));
            
            if (matchingFiles.length > 0) {
              // Get the most recent log file
              const latestLogFile = matchingFiles.sort().pop();
              const fullLogPath = path.join(logDir, latestLogFile);
              logContent = await fs.readFile(fullLogPath, 'utf8');
              foundLog = true;
              logger.info(`Found log file for ${name}: ${fullLogPath}`);
              break;
            }
          } else {
            // Direct file path
            logContent = await fs.readFile(logPath, 'utf8');
            foundLog = true;
            logger.info(`Found log file for ${name}: ${logPath}`);
            break;
          }
        } catch (error) {
          // Continue to next path
          continue;
        }
      }

      if (!foundLog) {
        // If no log files found, try to get process output if server is running
        const processInfo = this.processes.get(name);
        if (processInfo && processInfo.process && !processInfo.process.killed) {
          logger.info(`No log files found for ${name}, server is running but no logs available`);
          return `Server ${name} is running but no log files found in:\n${possibleLogPaths.join('\n')}`;
        } else {
          throw new Error(`No log files found for server ${name} and server is not running`);
        }
      }

      if (options.follow) {
        // For following logs, we'd need to implement file watching
        // For now, return the current content
        return logContent;
      } else {
        return logContent;
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
                created: serverConfig.created || stat.birthtime.toISOString(),
                type: 'native', // These are native servers
                map: serverConfig.map || 'TheIsland',
                gamePort: serverConfig.gamePort || 7777, // Use gamePort consistently
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
                  created: new Date().toISOString(),
                  type: 'native', // These are native servers, not cluster-server type
                  clusterName: clusterConfig.name || clusterDir,
                  map: server.map || 'TheIsland',
                  gamePort: server.gamePort || 7777, // Use gamePort consistently
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
    // Save to SQLite database
    await upsertServerConfig(name, JSON.stringify(config));
    logger.info(`Server configuration saved to database: ${name}`);
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
    
    // Basic server parameters - use the correct port values
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
    // ConfigOverridePath is now handled separately based on directory existence
    
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

  /**
   * Regenerate start.bat for a specific server with latest mods and config
   */
  async regenerateServerStartScript(serverName) {
    try {
      const clustersPath = config.server.native.clustersPath || path.join(this.basePath, 'clusters');
      
      // Find which cluster contains this server
      const clusterDirs = await fs.readdir(clustersPath);
      
      for (const clusterName of clusterDirs) {
        const clusterPath = path.join(clustersPath, clusterName);
        const clusterConfigPath = path.join(clusterPath, 'cluster.json');
        
        try {
          const clusterConfigContent = await fs.readFile(clusterConfigPath, 'utf8');
          const clusterConfig = JSON.parse(clusterConfigContent);
          
          // Find the server in this cluster
          const serverConfig = clusterConfig.servers?.find(s => s.name === serverName);
          if (serverConfig) {
            // Get mod configuration for this server
            const finalMods = await this.getFinalModListForServer(serverName);
            
            // Update server config with new mods
            serverConfig.mods = finalMods;
            
            // Update cluster config file
            await fs.writeFile(clusterConfigPath, JSON.stringify(clusterConfig, null, 2));
            
            // Regenerate start.bat file using the provisioner
            const serverPath = path.join(clusterPath, serverName);
            
            // Import the provisioner dynamically to avoid circular dependencies
            const { default: provisioner } = await import('./server-provisioner.js');
            await provisioner.createStartScriptInCluster(clusterName, serverPath, serverConfig);
            
            logger.info(`Regenerated start.bat for server ${serverName} in cluster ${clusterName}`);
            return;
          }
        } catch (error) {
          // Continue to next cluster if this one fails
          logger.warn(`Failed to process cluster ${clusterName}:`, error.message);
        }
      }
      
      logger.warn(`Server ${serverName} not found in any cluster`);
    } catch (error) {
      logger.error(`Failed to regenerate start script for ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Get final mod list for a server (shared + server-specific)
   */
  async getFinalModListForServer(serverName) {
    try {
      // Get shared mods from database
      const sharedModsData = getAllSharedMods();
      const sharedMods = sharedModsData
        .filter(mod => mod.enabled === 1)
        .map(mod => mod.mod_id);
      
      // Get server-specific mods from database
      const serverModsData = getServerMods(serverName);
      const serverMods = serverModsData
        .filter(mod => mod.enabled === 1)
        .map(mod => mod.mod_id);
      
      // Check if server should exclude shared mods (legacy logic for Club ARK servers)
      const isClubArkServer = serverName.toLowerCase().includes('club') || 
                             serverName.toLowerCase().includes('bobs');
      
      if (isClubArkServer && serverMods.length === 0) {
        // Legacy fallback for Club ARK servers
        return [1005639]; // Club ARK mod
      }
      
      // Combine shared and server-specific mods, removing duplicates
      const allMods = [...sharedMods, ...serverMods];
      return [...new Set(allMods)];
      
    } catch (error) {
      logger.error(`Failed to get final mod list for ${serverName}:`, error);
      return [];
    }
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

  async getServerStatus(name) {
    try {
      const processInfo = this.processes.get(name);
      const isRunning = await this.isRunning(name);
      
      console.log(`getServerStatus for ${name}:`, {
        hasProcessInfo: !!processInfo,
        isRunning: isRunning,
        processStatus: processInfo?.status,
        processNull: processInfo?.process === null
      });
      
      if (!processInfo && !isRunning) {
        return {
          name: name,
          status: 'stopped',
          uptime: 0,
          pid: null,
          crashInfo: null
        };
      }
      
      if (processInfo) {
        const uptime = Math.floor((Date.now() - processInfo.startTime.getTime()) / 1000);
        
        // If the process is null but we have process info, it means the cmd process exited
        // but the actual server might still be running
        let currentStatus = processInfo.status;
        if (processInfo.process === null && isRunning) {
          currentStatus = 'running';
        } else if (processInfo.process === null && !isRunning) {
          currentStatus = 'stopped';
        }
        
        console.log(`Status calculation for ${name}:`, {
          originalStatus: processInfo.status,
          processNull: processInfo.process === null,
          isRunning: isRunning,
          finalStatus: currentStatus
        });
        
        return {
          name: name,
          status: currentStatus,
          uptime: uptime,
          pid: processInfo.process?.pid || null,
          startTime: processInfo.startTime,
          crashInfo: processInfo.status === 'crashed' ? {
            exitCode: processInfo.exitCode,
            exitSignal: processInfo.exitSignal,
            exitTime: processInfo.exitTime,
            error: processInfo.error
          } : null,
          startupErrors: processInfo.startupErrors || null
        };
      }
      
      // Process not tracked but server is running
      return {
        name: name,
        status: 'running',
        uptime: 0, // Unknown uptime
        pid: null,
        crashInfo: null
      };
      
    } catch (error) {
      logger.error(`Failed to get server status for ${name}:`, error);
      return {
        name: name,
        status: 'unknown',
        uptime: 0,
        pid: null,
        crashInfo: null,
        error: error.message
      };
    }
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
    return this.nativeManager.getClusterServerStartBat(name);
  }

  async updateClusterServerStartBat(name, content) {
    return this.nativeManager.updateClusterServerStartBat(name, content);
  }

  async listLogFiles(name) {
    return this.nativeManager.listLogFiles(name);
  }

  async getServerStatus(name) {
    try {
      // First try to get status as a native cluster server
      try {
        const result = await this.nativeManager.getServerStatus(name);
        return result;
      } catch (nativeError) {
        logger.info(`Server ${name} is not a native cluster server, trying Docker container`);
        // If it's not a native server, try as Docker container
        const isRunning = await this.dockerManager.isRunning(name);
        return {
          name: name,
          status: isRunning ? 'running' : 'stopped',
          uptime: 0, // Docker uptime would need to be calculated differently
          pid: null,
          crashInfo: null
        };
      }
    } catch (error) {
      logger.error(`Failed to get server status for ${name}:`, error);
      return {
        name: name,
        status: 'unknown',
        uptime: 0,
        pid: null,
        crashInfo: null,
        error: error.message
      };
    }
  }

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

