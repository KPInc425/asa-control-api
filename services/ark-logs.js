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
  /**
   * Get available log files for a server
   */
  async getAvailableLogs(serverName) {
    try {
            logger.info(`Getting available log files for server: ${serverName}`);
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout getting server info')), 5000)
      );
      
      // First, try to get server info to find the correct path
      let serverInfo = null;
      try {
        const serverInfoPromise = this.serverManager.getClusterServerInfo(serverName);
        serverInfo = await Promise.race([serverInfoPromise, timeoutPromise]);
        
        logger.info(`Server info retrieved for ${serverName}:`, {
          hasServerPath: !!serverInfo?.serverPath,
          serverPath: serverInfo?.serverPath,
          serverInfoKeys: serverInfo ? Object.keys(serverInfo) : null
        });
      } catch (error) {
        logger.warn(`Could not get cluster server info for ${serverName}:`, error.message);
        // Don't throw here - continue with fallback path
      }

          let serverPath = null;
      if (serverInfo && serverInfo.serverPath) {
        serverPath = serverInfo.serverPath;
        logger.info(`Using server path from database: ${serverPath}`);
      } else {
        // Smart path resolution for both cluster and standalone servers
        const basePath = process.env.NATIVE_BASE_PATH || (config.server && config.server.native && config.server.native.basePath) || 'F:\\ARK';
        const clustersPath = process.env.NATIVE_CLUSTERS_PATH || (config.server && config.server.native && config.server.native.clustersPath) || path.join(basePath, 'clusters');
        const serversPath = path.join(basePath, 'servers');
        
        logger.info(`Path resolution for ${serverName}:`, {
          basePath,
          clustersPath,
          serversPath,
          serverInfoHasPath: !!serverInfo?.serverPath,
          serverInfoPath: serverInfo?.serverPath
        });
        
        if (!basePath) {
          logger.error('ArkLogsService: Missing basePath for log file resolution.');
          // Return empty array instead of throwing to prevent 502
          return [];
        }
        
        // Check both standalone and cluster locations
        const standalonePath = path.join(serversPath, serverName);
        let foundInCluster = false;
        let clusterPath = null;
        
        logger.info(`Checking standalone path: ${standalonePath}`);
        
        // First check if it's a standalone server
        try {
          await fs.access(standalonePath);
          serverPath = standalonePath;
          logger.info(`Found standalone server ${serverName} at: ${serverPath}`);
        } catch (error) {
          logger.debug(`Server ${serverName} not found in standalone path: ${standalonePath}`);
          
          // If not standalone, check clusters
          logger.info(`Checking clusters directory: ${clustersPath}`);
          try {
            const clusterDirs = await fs.readdir(clustersPath);
            logger.info(`Found cluster directories:`, clusterDirs);
            
            for (const clusterDir of clusterDirs) {
              const potentialServerPath = path.join(clustersPath, clusterDir, serverName);
              logger.info(`Checking cluster path: ${potentialServerPath}`);
              try {
                await fs.access(potentialServerPath);
                serverPath = potentialServerPath;
                foundInCluster = true;
                clusterPath = clusterPath;
                logger.info(`Found server ${serverName} in cluster ${clusterDir} at: ${serverPath}`);
                break;
              } catch (error) {
                logger.debug(`Server not found in cluster ${clusterDir}: ${potentialServerPath}`);
                // Continue to next cluster
              }
            }
          } catch (error) {
            logger.warn(`Could not search clusters directory: ${error.message}`);
          }
        }
        
        if (!serverPath) {
          logger.warn(`Server ${serverName} not found in either standalone or cluster locations`);
          // Still set a default path for potential log discovery
          serverPath = standalonePath;
        }
        
        logger.info(`Final server path resolved: ${serverPath}`);
      }

      logger.info(`Using server path for logs: ${serverPath}`);

      // Look for logs in the Saved directory structure
      const possibleLogDirs = [
        path.join(serverPath, 'ShooterGame', 'Saved', 'Logs'),
        path.join(serverPath, 'logs'),
        serverPath
      ];

      logger.info(`Checking log directories for ${serverName}:`, possibleLogDirs);

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
      
      // Sort log files with priority: most recent logs first
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
        
        // For log files, prioritize by size (larger = more recent content)
        if (aIsLog && bIsLog) {
          return b.size - a.size;
        }
        
        // For non-log files, sort by size
        return b.size - a.size;
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
      logger.info(`Using server path from database: ${serverPath}`);
    } else {
      // Smart path resolution for both cluster and standalone servers
      const basePath = process.env.NATIVE_BASE_PATH || (config.server && config.server.native && config.server.native.basePath) || 'F:\\ARK';
      const clustersPath = process.env.NATIVE_CLUSTERS_PATH || (config.server && config.server.native && config.server.native.clustersPath) || path.join(basePath, 'clusters');
      const serversPath = path.join(basePath, 'servers');
      
      if (!basePath) {
        logger.error('ArkLogsService: Missing basePath for log file resolution.');
        throw new Error('Server configuration error: basePath is not set.');
      }
      
      // Check both standalone and cluster locations
      const standalonePath = path.join(serversPath, serverName);
      let foundInCluster = false;
      let clusterPath = null;
      
      // First check if it's a standalone server
      try {
        await fs.access(standalonePath);
        serverPath = standalonePath;
        logger.info(`Found standalone server ${serverName} at: ${serverPath}`);
      } catch (error) {
        logger.debug(`Server ${serverName} not found in standalone path: ${standalonePath}`);
        
        // If not standalone, check clusters
        try {
          const clusterDirs = await fs.readdir(clustersPath);
          for (const clusterDir of clusterDirs) {
            const potentialServerPath = path.join(clustersPath, clusterDir, serverName);
            try {
              await fs.access(potentialServerPath);
              serverPath = potentialServerPath;
              foundInCluster = true;
              clusterPath = clusterPath;
              logger.info(`Found server ${serverName} in cluster ${clusterDir} at: ${serverPath}`);
              break;
            } catch (error) {
              // Continue to next cluster
            }
          }
        } catch (error) {
          logger.warn(`Could not search clusters directory: ${error.message}`);
        }
      }
      
      if (!serverPath) {
        logger.warn(`Server ${serverName} not found in either standalone or cluster locations`);
        // Still set a default path for potential log discovery
        serverPath = standalonePath;
      }
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
        logger.info(`Using server path from database: ${serverPath}`);
      } else {
        // Smart path resolution for both cluster and standalone servers
        const basePath = process.env.NATIVE_BASE_PATH || (config.server && config.server.native && config.server.native.basePath) || 'F:\\ARK';
        const clustersPath = process.env.NATIVE_CLUSTERS_PATH || (config.server && config.server.native && config.server.native.clustersPath) || path.join(basePath, 'clusters');
        const serversPath = path.join(basePath, 'servers');
        
        if (!basePath) {
          logger.error('ArkLogsService: Missing basePath for log file resolution.');
          throw new Error('Server configuration error: basePath is not set.');
        }
        
        // Check both standalone and cluster locations
        const standalonePath = path.join(serversPath, serverName);
        let foundInCluster = false;
        let clusterPath = null;
        
        // First check if it's a standalone server
        try {
          await fs.access(standalonePath);
          serverPath = standalonePath;
          logger.info(`Found standalone server ${serverName} at: ${serverPath}`);
        } catch (error) {
          logger.debug(`Server ${serverName} not found in standalone path: ${standalonePath}`);
          
          // If not standalone, check clusters
          try {
            const clusterDirs = await fs.readdir(clustersPath);
            for (const clusterDir of clusterDirs) {
              const potentialServerPath = path.join(clustersPath, clusterDir, serverName);
              try {
                await fs.access(potentialServerPath);
                serverPath = potentialServerPath;
                foundInCluster = true;
                clusterPath = clusterPath;
                logger.info(`Found server ${serverName} in cluster ${clusterDir} at: ${serverPath}`);
                break;
              } catch (error) {
                // Continue to next cluster
              }
            }
          } catch (error) {
            logger.warn(`Could not search clusters directory: ${error.message}`);
          }
        }
        
        if (!serverPath) {
          logger.warn(`Server ${serverName} not found in either standalone or cluster locations`);
          // Still set a default path for potential log discovery
          serverPath = standalonePath;
        }
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
          logger.info(`Found log file at: ${path}`);
          break;
        } catch (error) {
          logger.debug(`Log file not found at: ${path}`);
          // Continue to next path
        }
      }

      if (!logPath) {
        logger.warn(`Log file ${logFileName} not found for server ${serverName}. Searched paths:`, possibleLogPaths);
        return `Log file ${logFileName} not found for server ${serverName}.\n\nSearched locations:\n${possibleLogPaths.map(p => `  - ${p}`).join('\n')}\n\nThis is normal if the server hasn't started yet or if logs are stored elsewhere.`;
      }

      const content = await fs.readFile(logPath, 'utf8');
      const linesArray = content.split('\n');
      
      // Add debugging information
      const fileStats = await fs.stat(logPath);
      logger.info(`Reading log file ${logPath}:`, {
        fileSize: fileStats.size,
        lastModified: fileStats.mtime,
        linesRequested: lines,
        linesReturned: Math.min(lines, linesArray.length),
        totalLinesInFile: linesArray.length
      });
      
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
        logger.info(`Using server path from database: ${serverPath}`);
      } else {
        // Smart path resolution for both cluster and standalone servers
        const basePath = process.env.NATIVE_BASE_PATH || (config.server && config.server.native && config.server.native.basePath) || 'F:\\ARK';
        const clustersPath = process.env.NATIVE_CLUSTERS_PATH || (config.server && config.server.native && config.server.native.clustersPath) || path.join(basePath, 'clusters');
        const serversPath = path.join(basePath, 'servers');
        
        if (!basePath) {
          logger.error('ArkLogsService: Missing basePath for log file resolution.');
          throw new Error('Server configuration error: basePath is not set.');
        }
        
        // Check both standalone and cluster locations
        const standalonePath = path.join(serversPath, serverName);
        let foundInCluster = false;
        let clusterPath = null;
        
        // First check if it's a standalone server
        try {
          await fs.access(standalonePath);
          serverPath = standalonePath;
          logger.info(`Found standalone server ${serverName} at: ${serverPath}`);
        } catch (error) {
          logger.debug(`Server ${serverName} not found in standalone path: ${standalonePath}`);
          
          // If not standalone, check clusters
          try {
            const clusterDirs = await fs.readdir(clustersPath);
            for (const clusterDir of clusterDirs) {
              const potentialServerPath = path.join(clustersPath, clusterDir, serverName);
              try {
                await fs.access(potentialServerPath);
                serverPath = potentialServerPath;
                foundInCluster = true;
                clusterPath = clusterPath;
                logger.info(`Found server ${serverName} in cluster ${clusterDir} at: ${serverPath}`);
                break;
              } catch (error) {
                // Continue to next cluster
              }
            }
          } catch (error) {
            logger.warn(`Could not search clusters directory: ${error.message}`);
          }
        }
        
        if (!serverPath) {
          logger.warn(`Server ${serverName} not found in either standalone or cluster locations`);
          // Still set a default path for potential log discovery
          serverPath = standalonePath;
        }
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
