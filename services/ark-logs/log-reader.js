import fs from 'fs/promises';
import path from 'path';
import logger from '../../utils/logger.js';
import config from '../../config/index.js';

export class LogReader {
  constructor(service) {
    this.service = service;
  }

  /**
   * Get the most recent log entries from a file
   */
  async getRecentLogs(serverName, logFileName, lines = 100) {
    try {
      let serverInfo = null;
      try {
        serverInfo = await this.service.serverManager.getClusterServerInfo(serverName);
      } catch (error) {
        logger.warn(`Could not get cluster server info for ${serverName}:`, error.message);
      }

      let serverPath = null;
      if (serverInfo && serverInfo.serverPath) {
        serverPath = serverInfo.serverPath;
        logger.info(`Using server path from database: ${serverPath}`);
      } else {
        const basePath = process.env.NATIVE_BASE_PATH || (config.server && config.server.native && config.server.native.basePath) || 'F:\\ARK';
        const clustersPath = process.env.NATIVE_CLUSTERS_PATH || (config.server && config.server.native && config.server.native.clustersPath) || path.join(basePath, 'clusters');
        const serversPath = path.join(basePath, 'servers');

        if (!basePath) {
          logger.error('ArkLogsService: Missing basePath for log file resolution.');
          throw new Error('Server configuration error: basePath is not set.');
        }

        const standalonePath = path.join(serversPath, serverName);

        try {
          await fs.access(standalonePath);
          serverPath = standalonePath;
          logger.info(`Found standalone server ${serverName} at: ${serverPath}`);
        } catch (error) {
          logger.debug(`Server ${serverName} not found in standalone path: ${standalonePath}`);

          try {
            const clusterDirs = await fs.readdir(clustersPath);
            for (const clusterDir of clusterDirs) {
              const potentialServerPath = path.join(clustersPath, clusterDir, serverName);
              try {
                await fs.access(potentialServerPath);
                serverPath = potentialServerPath;
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
          serverPath = standalonePath;
        }
      }

      const possibleLogPaths = [
        path.join(serverPath, 'ShooterGame', 'Saved', 'Logs', logFileName),
        path.join(serverPath, 'logs', logFileName),
        path.join(serverPath, logFileName)
      ];

      let logPath = null;
      for (const p of possibleLogPaths) {
        try {
          await fs.access(p);
          logPath = p;
          logger.info(`Found log file at: ${p}`);
          break;
        } catch (error) {
          logger.debug(`Log file not found at: ${p}`);
        }
      }

      if (!logPath) {
        logger.warn(`Log file ${logFileName} not found for server ${serverName}. Searched paths:`, possibleLogPaths);
        return `Log file ${logFileName} not found for server ${serverName}.\n\nSearched locations:\n${possibleLogPaths.map(p => `  - ${p}`).join('\n')}\n\nThis is normal if the server hasn't started yet or if logs are stored elsewhere.`;
      }

      const content = await fs.readFile(logPath, 'utf8');
      const linesArray = content.split('\n');

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
      let serverInfo = null;
      try {
        serverInfo = await this.service.serverManager.getClusterServerInfo(serverName);
      } catch (error) {
        logger.warn(`Could not get cluster server info for ${serverName}:`, error.message);
      }

      let serverPath = null;
      if (serverInfo && serverInfo.serverPath) {
        serverPath = serverInfo.serverPath;
        logger.info(`Using server path from database: ${serverPath}`);
      } else {
        const basePath = process.env.NATIVE_BASE_PATH || (config.server && config.server.native && config.server.native.basePath) || 'F:\\ARK';
        const clustersPath = process.env.NATIVE_CLUSTERS_PATH || (config.server && config.server.native && config.server.native.clustersPath) || path.join(basePath, 'clusters');
        const serversPath = path.join(basePath, 'servers');

        if (!basePath) {
          logger.error('ArkLogsService: Missing basePath for log file resolution.');
          throw new Error('Server configuration error: basePath is not set.');
        }

        const standalonePath = path.join(serversPath, serverName);

        try {
          await fs.access(standalonePath);
          serverPath = standalonePath;
          logger.info(`Found standalone server ${serverName} at: ${serverPath}`);
        } catch (error) {
          logger.debug(`Server ${serverName} not found in standalone path: ${standalonePath}`);

          try {
            const clusterDirs = await fs.readdir(clustersPath);
            for (const clusterDir of clusterDirs) {
              const potentialServerPath = path.join(clustersPath, clusterDir, serverName);
              try {
                await fs.access(potentialServerPath);
                serverPath = potentialServerPath;
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
          serverPath = standalonePath;
        }
      }

      const possibleLogPaths = [
        path.join(serverPath, 'ShooterGame', 'Saved', 'Logs', logFileName),
        path.join(serverPath, 'logs', logFileName),
        path.join(serverPath, logFileName)
      ];

      for (const p of possibleLogPaths) {
        try {
          await fs.access(p);
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
