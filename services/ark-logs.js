import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import logger from '../utils/logger.js';
import config from '../config/index.js';

class ArkLogsService {
  constructor() {
    this.basePath = config.arkLogs.basePath || '/home/gameserver/server-files';
  }

  /**
   * Get available log files for a server
   */
  async getAvailableLogs(serverName) {
    try {
      const serverPath = path.join(this.basePath, serverName, 'logs');
      const files = await fs.readdir(serverPath);
      
      // Filter for log files
      const logFiles = files.filter(file => 
        file.endsWith('.log') || 
        file.endsWith('.txt') ||
        file.includes('log')
      );
      
      const logFilesWithSize = [];
      for (const file of logFiles) {
        const filePath = path.join(serverPath, file);
        const size = await this.getFileSize(filePath);
        logFilesWithSize.push({
          name: file,
          path: filePath,
          size: size
        });
      }
      
      return logFilesWithSize;
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
    const logPath = path.join(this.basePath, serverName, 'logs', logFileName);
    
    logger.info(`Creating log stream for ${serverName}/${logFileName}`);
    
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
      const logPath = path.join(this.basePath, serverName, 'logs', logFileName);
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
      const logPath = path.join(this.basePath, serverName, 'logs', logFileName);
      await fs.access(logPath);
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default new ArkLogsService(); 
