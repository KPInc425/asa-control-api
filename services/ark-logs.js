import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import { createServerManager } from './server-manager.js';

class ArkLogsService {
  constructor() {
    this.basePath = config.arkLogs.basePath || '/home/gameserver/server-files';
    this.serverManager = createServerManager();
  }

  /**
   * Get available log files for a server
   */
  async getAvailableLogs(serverName) {
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
        serverPath = path.join(process.env.NATIVE_BASE_PATH || 'C:\\ARK', 'servers', serverName);
      }

      // Look for logs in the Saved directory structure
      const possibleLogDirs = [
        path.join(serverPath, 'ShooterGame', 'Saved', 'Logs'),
        path.join(serverPath, 'logs'),
        serverPath
      ];

      const logFiles = [];
      
      for (const logDir of possibleLogDirs) {
        try {
          const files = await fs.readdir(logDir);
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
            }
          }
        } catch (error) {
          // Directory doesn't exist or can't be read
          continue;
        }
      }
      
      return logFiles.sort((a, b) => b.size - a.size); // Sort by size, largest first
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
   * Create a read stream for a specific log file
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
      serverPath = path.join(process.env.NATIVE_BASE_PATH || 'C:\\ARK', 'servers', serverName);
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
    
    try {
      // Get file size if we need to tail
      let startPosition = 0;
      if (follow) {
        const fileSize = await this.getFileSize(logPath);
        startPosition = Math.max(0, fileSize - (tail * 1000));
      }
      
      // Create a read stream
      const stream = createReadStream(logPath, {
        encoding: 'utf8',
        start: startPosition
      });
      
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
        serverPath = path.join(process.env.NATIVE_BASE_PATH || 'C:\\ARK', 'servers', serverName);
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

      const content = await fs.readFile(logPath, 'utf8');
      const linesArray = content.split('\n');
      return linesArray.slice(-lines).join('\n');
    } catch (error) {
      logger.error(`Failed to read recent logs for ${serverName}/${logFileName}:`, error);
      return '';
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
        serverPath = path.join(process.env.NATIVE_BASE_PATH || 'C:\\ARK', 'servers', serverName);
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
