import fs from 'fs/promises';
import path from 'path';
import { createReadStream, watch } from 'fs';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import { createServerManager } from './server-manager.js';

class ArkLogsService {
  constructor() {
    this.basePath = config.arkLogs.basePath || 'F:\\ARK';
    this.serverManager = createServerManager();
  }

  /**
   * Get available log files for a server
   */
  async getAvailableLogs(serverName) {
    try {
      logger.info(`Getting available log files for server: ${serverName}`);
      
      // First, try to get server info to find the correct path
      let serverInfo = null;
      try {
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout getting server info')), 10000)
        );
        
        const serverInfoPromise = this.serverManager.getClusterServerInfo(serverName);
        serverInfo = await Promise.race([serverInfoPromise, timeoutPromise]);
        
        logger.info(`Server info retrieved for ${serverName}:`, {
          hasServerPath: !!serverInfo?.serverPath,
          serverPath: serverInfo?.serverPath
        });
      } catch (error) {
        logger.warn(`Could not get cluster server info for ${serverName}:`, error.message);
      }

      let serverPath = null;
      if (serverInfo && serverInfo.serverPath) {
        serverPath = serverInfo.serverPath;
      } else {
        // Fallback to default path
        serverPath = path.join(process.env.NATIVE_BASE_PATH || 'F:\\ARK', 'servers', serverName);
      }

      logger.info(`Using server path for logs: ${serverPath}`);

      // Look for logs in the Saved directory structure
      const possibleLogDirs = [
        path.join(serverPath, 'ShooterGame', 'Saved', 'Logs'),
        path.join(serverPath, 'logs'),
        serverPath
      ];

      const logFiles = [];
      
      for (const logDir of possibleLogDirs) {
        try {
          logger.info(`Checking log directory: ${logDir}`);
          const files = await fs.readdir(logDir);
          logger.info(`Found ${files.length} files in ${logDir}`);
          
          for (const file of files) {
            if (file.endsWith('.log') || 
                file.endsWith('.txt') ||
                file.includes('ShooterGame') ||
                file.includes('WindowsServer') ||
                file.includes('ServGame') ||
                file.includes('crashcallstack') ||
                file.includes('FailedWaterDinoSpawns')) {
              
              const filePath = path.join(logDir, file);
              const size = await this.getFileSize(filePath);
              logFiles.push({
                name: file,
                path: filePath,
                size: size
              });
              logger.info(`Added log file: ${file} (${size} bytes)`);
            }
          }
        } catch (error) {
          logger.warn(`Directory not accessible: ${logDir}`, error.message);
          // Directory doesn't exist or can't be read
          continue;
        }
      }
      
      logger.info(`Total log files found for ${serverName}: ${logFiles.length}`);
      
      // Sort log files with priority: actual logs first, then by size
      return logFiles.sort((a, b) => {
        const aIsLog = a.name.toLowerCase().includes('shootergame.log') || 
                      a.name.toLowerCase().includes('servergame') ||
                      a.name.toLowerCase().includes('windowsserver.log') ||
                      (a.name.toLowerCase().endsWith('.log') && !a.name.toLowerCase().includes('manifest'));
        const bIsLog = b.name.toLowerCase().includes('shootergame.log') || 
                      b.name.toLowerCase().includes('servergame') ||
                      b.name.toLowerCase().includes('windowsserver.log') ||
                      (b.name.toLowerCase().endsWith('.log') && !b.name.toLowerCase().includes('manifest'));
        
        if (aIsLog && !bIsLog) return -1;
        if (!aIsLog && bIsLog) return 1;
        return b.size - a.size; // Then sort by size
      });
    } catch (error) {
      logger.error(`Failed to get available logs for server ${serverName}:`, error);
      return [];
    }
  }

  /**
   * Get file size in bytes
   */
  async getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Create a read stream for a specific log file with real-time following
   */
  async createLogStream(serverName, logFileName, options = {}) {
    const { tail = 100, follow = true } = options;
    
    // First, try to get server info to find the correct path
    let serverInfo = null;
    try {
      serverInfo = await this.serverManager.getClusterServerInfo(serverName);
    } catch (error) {
      logger.warn(`Could not get cluster server info for ${serverName}:`, error.message);
    }

    let serverPath = null;
    if (serverInfo && serverInfo.serverPath) {
      serverPath = serverInfo.serverPath;
    } else {
      // Fallback to default path
      serverPath = path.join(process.env.NATIVE_BASE_PATH || 'F:\\ARK', 'servers', serverName);
    }

    // Look for the log file in multiple possible locations
    const possibleLogPaths = [
      path.join(serverPath, 'ShooterGame', 'Saved', 'Logs', logFileName),
      path.join(serverPath, 'logs', logFileName),
      path.join(serverPath, logFileName)
    ];

    let logPath = null;
    for (const path of possibleLogPaths) {
      try {
        await fs.access(path);
        logPath = path;
        break;
      } catch (error) {
        // Continue to next path
      }
    }

    if (!logPath) {
      throw new Error(`Log file ${logFileName} not found for server ${serverName}`);
    }
    
    logger.info(`Creating log stream for ${serverName}/${logFileName} at ${logPath}`);
    
    // Create an EventEmitter to simulate a stream interface
    const stream = new EventEmitter();
    
    try {
      // Read initial content (tail)
      const content = await fs.readFile(logPath, 'utf8');
      const lines = content.split('\n');
      const tailLines = lines.slice(-tail);
      
      // Emit initial content
      for (const line of tailLines) {
        if (line.trim()) {
          stream.emit('data', Buffer.from(line + '\n', 'utf8'));
        }
      }
      
      if (follow) {
        // Set up file watching for real-time updates
        const watcher = watch(logPath, { persistent: true }, async (eventType, filename) => {
          if (eventType === 'change') {
            try {
              // Read the file again to get new content
              const newContent = await fs.readFile(logPath, 'utf8');
              const newLines = newContent.split('\n');
              
              // Only emit lines that are newer than what we've already seen
              const newLinesOnly = newLines.slice(lines.length);
              
              for (const line of newLinesOnly) {
                if (line.trim()) {
                  stream.emit('data', Buffer.from(line + '\n', 'utf8'));
                }
      }
      
              // Update our line count
              lines.length = newLines.length;
            } catch (error) {
              logger.error(`Error reading updated log file ${logPath}:`, error);
            }
          }
        });
        
        // Store the watcher so it can be cleaned up
        stream.watcher = watcher;
        
        // Handle watcher errors
        watcher.on('error', (error) => {
          logger.error(`File watcher error for ${logPath}:`, error);
          stream.emit('error', error);
        });
      }
      
      // Add destroy method for cleanup
      stream.destroy = () => {
        if (stream.watcher) {
          stream.watcher.close();
          stream.watcher = null;
        }
        stream.removeAllListeners();
      };
      
      return stream;
    } catch (error) {
      logger.error(`Failed to create log stream for ${serverName}/${logFileName}:`, error);
      throw error;
    }
  }

  /**
   * Get the most recent log entries from a file
   */
  async getRecentLogs(serverName, logFileName, lines = 100) {
    try {
      // First, try to get server info to find the correct path
      let serverInfo = null;
      try {
        serverInfo = await this.serverManager.getClusterServerInfo(serverName);
      } catch (error) {
        logger.warn(`Could not get cluster server info for ${serverName}:`, error.message);
      }

      let serverPath = null;
      if (serverInfo && serverInfo.serverPath) {
        serverPath = serverInfo.serverPath;
      } else {
        // Fallback to default path
        serverPath = path.join(process.env.NATIVE_BASE_PATH || 'F:\\ARK', 'servers', serverName);
      }

      // Look for the log file in multiple possible locations
      const possibleLogPaths = [
        path.join(serverPath, 'ShooterGame', 'Saved', 'Logs', logFileName),
        path.join(serverPath, 'logs', logFileName),
        path.join(serverPath, logFileName)
      ];

      let logPath = null;
      for (const path of possibleLogPaths) {
        try {
          await fs.access(path);
          logPath = path;
          break;
        } catch (error) {
          // Continue to next path
        }
      }

      if (!logPath) {
        logger.warn(`Log file ${logFileName} not found for server ${serverName}. Searched paths:`, possibleLogPaths);
        return `Log file ${logFileName} not found for server ${serverName}.\n\nSearched locations:\n${possibleLogPaths.map(p => `  - ${p}`).join('\n')}\n\nThis is normal if the server hasn't started yet or if logs are stored elsewhere.`;
      }

      const content = await fs.readFile(logPath, 'utf8');
      const linesArray = content.split('\n');
      return linesArray.slice(-lines).join('\n');
    } catch (error) {
      logger.error(`Failed to read recent logs for ${serverName}/${logFileName}:`, error);
      return `Error reading log file: ${error.message}`;
    }
  }

  /**
   * Check if a log file exists
   */
  async logFileExists(serverName, logFileName) {
    try {
      // First, try to get server info to find the correct path
      let serverInfo = null;
      try {
        serverInfo = await this.serverManager.getClusterServerInfo(serverName);
      } catch (error) {
        logger.warn(`Could not get cluster server info for ${serverName}:`, error.message);
      }

      let serverPath = null;
      if (serverInfo && serverInfo.serverPath) {
        serverPath = serverInfo.serverPath;
      } else {
        // Fallback to default path
        serverPath = path.join(process.env.NATIVE_BASE_PATH || 'F:\\ARK', 'servers', serverName);
      }

      // Look for the log file in multiple possible locations
      const possibleLogPaths = [
        path.join(serverPath, 'ShooterGame', 'Saved', 'Logs', logFileName),
        path.join(serverPath, 'logs', logFileName),
        path.join(serverPath, logFileName)
      ];

      for (const path of possibleLogPaths) {
        try {
          await fs.access(path);
          return true;
        } catch (error) {
          // Continue to next path
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }
}

export default new ArkLogsService(); 
