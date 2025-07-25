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
  getServerMods,
  getServerSettings
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
    // Normalize the base path to fix double backslash issues
    const rawBasePath = config.server.native.basePath || process.env.NATIVE_BASE_PATH || 'C:\\ARK';
    this.basePath = path.normalize(rawBasePath);
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

  /**
   * Get server configuration from database
   */
  getServerConfigFromDatabase(name) {
    try {
      const dbConfig = getServerConfig(name);
      if (dbConfig) {
        return JSON.parse(dbConfig.config_data);
      }
      return null;
    } catch (error) {
      logger.warn(`Failed to get database config for ${name}:`, error.message);
      return null;
    }
  }

  /**
   * Get cluster server info with database config merge
   */
  async getClusterServerInfo(name) {
    try {
      const clustersPath = config.server.native.clustersPath || path.join(this.basePath, 'clusters');
      const clusterDirs = await fs.readdir(clustersPath);
      
      for (const clusterDir of clusterDirs) {
        try {
          const clusterConfigPath = path.join(clustersPath, clusterDir, 'cluster.json');
          const clusterConfigContent = await fs.readFile(clusterConfigPath, 'utf8');
          const clusterConfig = JSON.parse(clusterConfigContent);
          
          if (clusterConfig.servers && Array.isArray(clusterConfig.servers)) {
            const server = clusterConfig.servers.find(s => s.name === name);
            if (server) {
              // Merge with database config (database takes precedence)
              const dbConfig = this.getServerConfigFromDatabase(name);
              if (dbConfig) {
                Object.assign(server, dbConfig);
                logger.info(`Merged database config for cluster server ${name}`, { 
                  disableBattleEye: server.disableBattleEye 
                });
              }
              
              return server;
            }
          }
        } catch (error) {
          logger.warn(`Error reading cluster ${clusterDir}:`, error && (error.stack || error.message || error));
          // Graceful fallback: if error is file not found, just continue
          if (error.code === 'ENOENT') continue;
          // If error is something else, try to continue, but log it
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
      if (!serverInfo) {
        throw new Error(`Server ${name} not found`);
      }
      
      // Use robust path resolution for clustersPath
      const clustersPath = process.env.NATIVE_CLUSTERS_PATH || (config.server && config.server.native && config.server.native.clustersPath) || (config.server && config.server.native && config.server.native.basePath ? path.join(config.server.native.basePath, 'clusters') : null);
      if (!clustersPath) {
        throw new Error('Missing clustersPath in configuration.');
      }
      
      // Find which cluster contains this server
      const clusterDirs = await fs.readdir(clustersPath);
      let clusterName = null;
      
      for (const clusterDir of clusterDirs) {
        try {
          const clusterConfigPath = path.join(clustersPath, clusterDir, 'cluster.json');
          const clusterConfigContent = await fs.readFile(clusterConfigPath, 'utf8');
          const clusterConfig = JSON.parse(clusterConfigContent);
          
          if (clusterConfig.servers && Array.isArray(clusterConfig.servers)) {
            const server = clusterConfig.servers.find(s => s.name === name);
            if (server) {
              clusterName = clusterDir;
              break;
            }
          }
        } catch (error) {
          logger.warn(`Error reading cluster ${clusterDir}:`, error.message);
        }
      }
      
      if (!clusterName) {
        throw new Error(`Server ${name} not found in any cluster`);
      }
      
      // Construct the start.bat path
      const startBatPath = path.join(clustersPath, clusterName, name, 'start.bat');
      
      // Check if the file exists
      try {
        await fs.access(startBatPath);
      } catch (error) {
        throw new Error(`Start.bat file not found: ${startBatPath}`);
      }
      
      // Read the file content
      const content = await fs.readFile(startBatPath, 'utf8');
      
      logger.info(`[getClusterServerStartBat] Read start.bat for ${name}, content length: ${content.length}`);
      
      return {
        success: true,
        content: content,
        path: startBatPath
      };
    } catch (error) {
      logger.error(`Failed to get start.bat for ${name}:`, error);
      throw error;
    }
  }

  async updateClusterServerStartBat(name, content) {
    try {
      const serverInfo = await this.getClusterServerInfo(name);
      if (!serverInfo) {
        throw new Error(`Server ${name} not found`);
      }
      
      // Use robust path resolution for clustersPath
      const clustersPath = process.env.NATIVE_CLUSTERS_PATH || (config.server && config.server.native && config.server.native.clustersPath) || (config.server && config.server.native && config.server.native.basePath ? path.join(config.server.native.basePath, 'clusters') : null);
      if (!clustersPath) {
        throw new Error('Missing clustersPath in configuration.');
      }
      
      // Find which cluster contains this server
      const clusterDirs = await fs.readdir(clustersPath);
      let clusterName = null;
      
      for (const clusterDir of clusterDirs) {
        try {
          const clusterConfigPath = path.join(clustersPath, clusterDir, 'cluster.json');
          const clusterConfigContent = await fs.readFile(clusterConfigPath, 'utf8');
          const clusterConfig = JSON.parse(clusterConfigContent);
          
          if (clusterConfig.servers && Array.isArray(clusterConfig.servers)) {
            const server = clusterConfig.servers.find(s => s.name === name);
            if (server) {
              clusterName = clusterDir;
              break;
            }
          }
        } catch (error) {
          logger.warn(`Error reading cluster ${clusterDir}:`, error.message);
        }
      }
      
      if (!clusterName) {
        throw new Error(`Server ${name} not found in any cluster`);
      }
      
      // Construct the start.bat path
      const startBatPath = path.join(clustersPath, clusterName, name, 'start.bat');
      
      // Write the new content
      await fs.writeFile(startBatPath, content, 'utf8');
      
      logger.info(`[updateClusterServerStartBat] Updated start.bat for ${name} at: ${startBatPath}`);
      
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
      logger.info(`[NativeServerManager] listServers() called. Base path: ${this.basePath}`);
      logger.info(`[NativeServerManager] Servers path: ${this.serversPath}`);
      logger.info(`[NativeServerManager] Clusters path: ${this.clustersPath}`);

      // Get database configurations only
      const dbConfigs = getAllServerConfigs();
      logger.info(`[NativeServerManager] Found ${dbConfigs.length} database configs`);
      // Build clusterMap from DB configs only, robust to legacy shapes
      const clusterMap = {};
      function getClusterId(config) {
        return (
          config.clusterId ||
          config.clusterName ||
          (config.config && (config.config.clusterId || config.config.clusterName)) ||
          null
        );
      }
      for (const config of dbConfigs) {
        try {
          const serverConfig = JSON.parse(config.config_data);
          const clusterId = getClusterId(serverConfig);
          if (clusterId) {
            clusterMap[config.name] = clusterId;
          }
        } catch (e) {
          logger.warn(`Failed to parse config for cluster mapping: ${config.name}`, e.message);
        }
      }
      const servers = await Promise.all(dbConfigs.map(async config => {
        try {
          const serverConfig = JSON.parse(config.config_data);
          // Fetch status using getServerStatus
          let status = 'unknown';
          try {
            const statusObj = await this.getServerStatus(config.name);
            status = statusObj.status;
          } catch (e) {
            logger.warn(`Failed to get status for ${config.name}:`, e.message);
          }
          // Set clusterName and isClusterServer robustly
          const clusterName = getClusterId(serverConfig);
          const isClusterServer = !!clusterName;
          return {
            name: config.name,
            ...serverConfig,
            status,
            type: 'native',
            config: serverConfig,
            isClusterServer,
            clusterName,
            serverPath: serverConfig.serverPath || '',
            created: serverConfig.created || '',
          };
        } catch (error) {
          logger.warn(`Failed to parse database config for ${config.name}:`, error.message);
          return null;
        }
      }));
      // Fallback: scan clusters and servers directories for start.bat files not in DB
      const foundNames = new Set(dbConfigs.map(cfg => {
        try {
          return JSON.parse(cfg.config_data).name;
        } catch { return null; }
      }).filter(Boolean));
      const { parseStartBat } = await import('../utils/parse-start-bat.js');
      // Scan clusters
      if (this.clustersPath && existsSync(this.clustersPath)) {
        const clusterDirs = await fs.readdir(this.clustersPath);
        for (const clusterName of clusterDirs) {
          const clusterPath = path.join(this.clustersPath, clusterName);
          if (!existsSync(clusterPath) || !(await fs.stat(clusterPath)).isDirectory()) continue;
          const serverDirs = await fs.readdir(clusterPath);
          for (const serverDir of serverDirs) {
            const serverPath = path.join(clusterPath, serverDir);
            if (!existsSync(serverPath) || !(await fs.stat(serverPath)).isDirectory()) continue;
            const startBatPath = path.join(serverPath, 'start.bat');
            if (existsSync(startBatPath)) {
              try {
                const parsed = await parseStartBat(startBatPath);
                if (!foundNames.has(parsed.name)) {
                  logger.warn(`[NativeServerManager] Fallback: found server on disk not in DB: ${parsed.name} (cluster: ${clusterName})`);
                  servers.push({
                    name: parsed.name,
                    ...parsed,
                    status: 'unknown',
                    type: 'native',
                    config: parsed,
                    isClusterServer: true,
                    clusterName,
                    serverPath,
                    created: '',
                    fallback: true
                  });
                  foundNames.add(parsed.name);
                }
              } catch (e) {
                logger.warn(`[NativeServerManager] Failed to parse start.bat for fallback server in cluster ${clusterName}: ${e.message}`);
              }
            }
          }
        }
      }
      // Scan serversPath for standalone servers
      if (this.serversPath && existsSync(this.serversPath)) {
        const serverDirs = await fs.readdir(this.serversPath);
        for (const serverDir of serverDirs) {
          const serverPath = path.join(this.serversPath, serverDir);
          if (!existsSync(serverPath) || !(await fs.stat(serverPath)).isDirectory()) continue;
          const startBatPath = path.join(serverPath, 'start.bat');
          if (existsSync(startBatPath)) {
            try {
              const parsed = await parseStartBat(startBatPath);
              if (!foundNames.has(parsed.name)) {
                logger.warn(`[NativeServerManager] Fallback: found standalone server on disk not in DB: ${parsed.name}`);
                servers.push({
                  name: parsed.name,
                  ...parsed,
                  status: 'unknown',
                  type: 'native',
                  config: parsed,
                  isClusterServer: false,
                  clusterName: null,
                  serverPath,
                  created: '',
                  fallback: true
                });
                foundNames.add(parsed.name);
              }
            } catch (e) {
              logger.warn(`[NativeServerManager] Failed to parse start.bat for fallback standalone server: ${e.message}`);
            }
          }
        }
      }
      return servers.filter(Boolean);
    } catch (error) {
      logger.error('Failed to list servers:', error);
      throw error;
    }
  }

  async isRunning(name) {
    try {
      if (!this.processes) this.processes = new Map();
      const processInfo = this.processes.get(name);
      if (processInfo && processInfo.process) return !processInfo.process.killed;
      let serverPorts = null;
      let serverInfo = null;
      try {
        serverInfo = await this.getClusterServerInfo(name);
        if (serverInfo) {
          serverPorts = {
            gamePort: serverInfo.gamePort,
            queryPort: serverInfo.queryPort,
            rconPort: serverInfo.rconPort,
            externalPort: serverInfo.port,
            map: serverInfo.map,
            sessionName: serverInfo.name
          };
        }
      } catch (error) {
        console.warn(`Failed to get server info for ${name}:`, error.message);
      }
      const processes = await this.getRunningProcesses();
      for (const process of processes) {
        const commandLine = process.commandLine || '';
        const processName = process.name || '';
        // Tight match: require all key params
        if (
          serverPorts &&
          commandLine.includes(`Port=${serverPorts.gamePort}`) &&
          commandLine.includes(`QueryPort=${serverPorts.queryPort}`) &&
          commandLine.includes(`RCONPort=${serverPorts.rconPort}`) &&
          commandLine.includes(serverPorts.map) &&
          commandLine.includes(`SessionName=${serverPorts.sessionName}`)
        ) {
          console.log(`Strict match: found running server ${name}`);
          return true;
        }
      }
      console.log(`No strict match found for server ${name}`);
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
      (config.mapName || 'TheIsland') + '_WP',
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
    // Add BattleEye flag if disabled
    if (config.disableBattleEye) {
      args.push('-NoBattleEye');
    }
    // Add DynamicConfigURL if present
    const dynamicConfigUrl = config.dynamicConfigUrl || (config.asa && config.asa.dynamicConfigUrl) || require('../config/index.js').default.asa.dynamicConfigUrl;
    if (dynamicConfigUrl) {
      args.push(`-DynamicConfigURL=${dynamicConfigUrl}`);
    }
    // Add CustomDynamicConfigUrl if present
    const customDynamicConfigUrl = config.customDynamicConfigUrl || (config.asa && config.asa.customDynamicConfigUrl) || require('../config/index.js').default.asa.customDynamicConfigUrl;
    if (customDynamicConfigUrl) {
      args.push(`?CustomDynamicConfigUrl=\"${customDynamicConfigUrl}\"`);
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
    args.push((server.map || 'TheIsland') + '_WP');
    args.push('?listen');
    args.push(`?Port=${server.gamePort || 7777}`);
    args.push(`?QueryPort=${server.queryPort || 27015}`);
    args.push(`?RCONPort=${server.rconPort || 32330}`);
    args.push(`?MaxPlayers=${server.maxPlayers || 70}`);
    if (server.adminPassword) {
      args.push(`?ServerAdminPassword=${server.adminPassword}`);
    }
    if (server.serverPassword) {
      args.push(`?ServerPassword=${server.serverPassword}`);
    }
    if (server.clusterId) {
      args.push(`?ClusterId=${server.clusterId}`);
    }
    if (server.clusterPassword) {
      args.push(`?ClusterPassword=${server.clusterPassword}`);
    }
    const clusterDataPath = path.join(path.dirname(server.serverPath || ''), 'clusterdata').replace(/\\/g, '/');
    args.push(`?ClusterDirOverride=${clusterDataPath}`);
    // Add DynamicConfigURL if present
    const dynamicConfigUrl = server.dynamicConfigUrl || require('../config/index.js').default.asa.dynamicConfigUrl;
    if (dynamicConfigUrl) {
      args.push(`-DynamicConfigURL=${dynamicConfigUrl}`);
    }
    // Add CustomDynamicConfigUrl if present
    const customDynamicConfigUrl = server.customDynamicConfigUrl || require('../config/index.js').default.asa.customDynamicConfigUrl;
    if (customDynamicConfigUrl) {
      args.push(`?CustomDynamicConfigUrl=\"${customDynamicConfigUrl}\"`);
    }
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
      // Use the same approach as getClusterServerInfo which works
      const clustersPath = config.server.native.clustersPath || path.join(this.basePath, 'clusters');
      const clusterDirs = await fs.readdir(clustersPath);
      
      for (const clusterDir of clusterDirs) {
        try {
          const clusterConfigPath = path.join(clustersPath, clusterDir, 'cluster.json');
          const clusterConfigContent = await fs.readFile(clusterConfigPath, 'utf8');
          const clusterConfig = JSON.parse(clusterConfigContent);
          
          if (clusterConfig.servers && Array.isArray(clusterConfig.servers)) {
            const serverConfig = clusterConfig.servers.find(s => s.name === serverName);
            if (serverConfig) {
              // Get mod configuration for this server
              const finalMods = await this.getFinalModListForServer(serverName);
              
              // Preserve the excludeSharedMods flag from the database
              const dbServerConfig = getServerConfig(serverName);
              let excludeSharedMods = false;
              if (dbServerConfig && dbServerConfig.config_data) {
                try {
                  const parsedConfig = JSON.parse(dbServerConfig.config_data);
                  excludeSharedMods = parsedConfig.excludeSharedMods === true;
                } catch (error) {
                  logger.warn(`Failed to parse server config for ${serverName}:`, error.message);
                }
              }
              
              // Update server config with new mods and preserve excludeSharedMods flag
              serverConfig.mods = finalMods;
              serverConfig.excludeSharedMods = excludeSharedMods;
              
              logger.info(`[regenerateServerStartScript] Updated server config for ${serverName}:`, {
                mods: finalMods,
                excludeSharedMods: excludeSharedMods
              });
              
              // Update cluster config file
              await fs.writeFile(clusterConfigPath, JSON.stringify(clusterConfig, null, 2));
              
              // Regenerate start.bat file using the provisioner
              const serverPath = path.join(clustersPath, clusterDir, serverName);
              
              // Import the provisioner dynamically to avoid circular dependencies
              const { default: provisioner } = await import('./server-provisioner.js');
              await provisioner.createStartScriptInCluster(clusterDir, serverPath, serverConfig);
              
              logger.info(`Regenerated start.bat for server ${serverName} in cluster ${clusterDir}`);
              return;
            }
          }
        } catch (error) {
          logger.warn(`Error processing cluster ${clusterDir}:`, error.message);
        }
      }
      
      throw new Error(`Server ${serverName} not found in any cluster`);
      // --- DB-driven fallback ---
      // Try to find the server config in the DB
      const dbServerConfig = getServerConfig(serverName);
      if (dbServerConfig && dbServerConfig.config_data) {
        try {
          const parsedConfig = JSON.parse(dbServerConfig.config_data);
          const clusterId = parsedConfig.clusterId || parsedConfig.clusterName || (parsedConfig.config && (parsedConfig.config.clusterId || parsedConfig.config.clusterName));
          if (clusterId) {
            // Get mod configuration for this server
            const finalMods = await this.getFinalModListForServer(serverName);
            let excludeSharedMods = parsedConfig.excludeSharedMods === true;
            // Update server config with new mods and preserve excludeSharedMods flag
            parsedConfig.mods = finalMods;
            parsedConfig.excludeSharedMods = excludeSharedMods;
            logger.info(`[regenerateServerStartScript][DB] Updated server config for ${serverName}:`, {
              mods: finalMods,
              excludeSharedMods: excludeSharedMods
            });
            // Regenerate start.bat file using the provisioner
            const clustersPath = config.server.native.clustersPath || path.join(this.basePath, 'clusters');
            const serverPath = path.join(clustersPath, clusterId, serverName);
            const { default: provisioner } = await import('./server-provisioner.js');
            await provisioner.createStartScriptInCluster(clusterId, serverPath, parsedConfig);
            logger.info(`[regenerateServerStartScript][DB] Regenerated start.bat for server ${serverName} in cluster ${clusterId}`);
            return;
          }
        } catch (err) {
          logger.warn(`[regenerateServerStartScript][DB] Failed to parse config_data for ${serverName}:`, err.message);
        }
      }
      // --- End DB-driven fallback ---
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
      
      // Check if server should exclude shared mods
      // Check database config for excludeSharedMods flag in server settings
      let excludeSharedMods = false;
      
      const serverSettings = getServerSettings(serverName);
      if (serverSettings) {
        excludeSharedMods = serverSettings.excludeSharedMods === 1;
        logger.info(`[getFinalModListForServer] Server ${serverName} excludeSharedMods from server settings: ${excludeSharedMods}`);
      }
      
      // Legacy fallback: Check if it's a Club ARK server
      if (!excludeSharedMods) {
        const isClubArkServer = serverName.toLowerCase().includes('club') || 
                               serverName.toLowerCase().includes('bobs');
        excludeSharedMods = isClubArkServer;
        if (isClubArkServer) {
          logger.info(`[getFinalModListForServer] Server ${serverName} marked as Club ARK (legacy logic)`);
        }
      }
      
      // If server should exclude shared mods, only return server-specific mods
      if (excludeSharedMods) {
        logger.info(`[getFinalModListForServer] Server ${serverName} excluding shared mods. Server mods only: ${serverMods.join(', ')}`);
        return serverMods;
      }
      
      // Combine shared and server-specific mods, removing duplicates
      const allMods = [...sharedMods, ...serverMods];
      const finalMods = [...new Set(allMods)];
      logger.info(`[getFinalModListForServer] Server ${serverName} combining mods. Shared: ${sharedMods.join(', ')}, Server: ${serverMods.join(', ')}, Final: ${finalMods.join(', ')}`);
      return finalMods;
      
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
        let currentStatus = processInfo.status;
        if (processInfo.status === 'crashed') {
          currentStatus = 'failed';
        } else if (processInfo.process === null && isRunning) {
          currentStatus = 'running';
        } else if (processInfo.process === null && !isRunning) {
          currentStatus = 'stopped';
        }
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
      return {
        name: name,
        status: isRunning ? 'running' : 'stopped',
        uptime: 0,
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

