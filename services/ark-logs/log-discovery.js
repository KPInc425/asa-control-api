import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../utils/logger.js';
import { gameFor } from '../../games/index.js';
import { getServerConfig } from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class LogDiscovery {
  constructor(service) {
    this.service = service;
  }

  /**
   * Get available log files for a server
   */
  async getAvailableLogs(serverName) {
    try {
      logger.info(`Getting available log files for server: ${serverName}`);
      logger.info(`ArkLogsService basePath: ${this.service.basePath}`);

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout getting server info')), 5000)
      );

      let serverInfo = null;
      try {
        const serverInfoPromise = this.service.serverManager.getClusterServerInfo(serverName);
        serverInfo = await Promise.race([serverInfoPromise, timeoutPromise]);

        logger.info(`Server info retrieved for ${serverName}:`, {
          hasServerPath: !!serverInfo?.serverPath,
          serverPath: serverInfo?.serverPath,
          serverInfoKeys: serverInfo ? Object.keys(serverInfo) : null
        });
      } catch (error) {
        logger.warn(`Could not get cluster server info for ${serverName}:`, error.message);
      }

      let serverPath = null;
      if (serverInfo && serverInfo.serverPath) {
        serverPath = serverInfo.serverPath;
        logger.info(`Using server path from database: ${serverPath}`);
      } else {
        const basePath = process.env.NATIVE_BASE_PATH || (this.service.config?.server?.native?.basePath) || 'F:\\ARK';
        const clustersPath = process.env.NATIVE_CLUSTERS_PATH || (this.service.config?.server?.native?.clustersPath) || path.join(basePath, 'clusters');
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
          return [];
        }

        const standalonePath = path.join(serversPath, serverName);
        let foundInCluster = false;

        logger.info(`Checking standalone path: ${standalonePath}`);

        try {
          await fs.access(standalonePath);
          serverPath = standalonePath;
          logger.info(`Found standalone server ${serverName} at: ${serverPath}`);
        } catch (error) {
          logger.debug(`Server ${serverName} not found in standalone path: ${standalonePath}`);

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
                logger.info(`Found server ${serverName} in cluster ${clusterDir} at: ${serverPath}`);
                break;
              } catch (error) {
                logger.debug(`Server not found in cluster ${clusterDir}: ${potentialServerPath}`);
              }
            }
          } catch (error) {
            logger.warn(`Could not search clusters directory: ${error.message}`);
          }
        }

        if (!serverPath) {
          logger.warn(`Server ${serverName} not found in either standalone or cluster locations`);
          const additionalPaths = [
            path.join(basePath, serverName),
            path.join(basePath, 'servers', serverName),
            path.join(basePath, 'clusters', 'default', serverName),
            path.join(basePath, 'clusters', 'main', serverName),
            path.join(basePath, 'clusters', 'cluster1', serverName)
          ];

          for (const additionalPath of additionalPaths) {
            try {
              await fs.access(additionalPath);
              serverPath = additionalPath;
              logger.info(`Found server ${serverName} in additional path: ${serverPath}`);
              break;
            } catch (error) {
              logger.debug(`Server not found in additional path: ${additionalPath}`);
            }
          }

          if (!serverPath) {
            serverPath = standalonePath;
            logger.info(`Using fallback path for server ${serverName}: ${serverPath}`);
          }
        }

        logger.info(`Final server path resolved: ${serverPath}`);
      }

      logger.info(`Using server path for logs: ${serverPath}`);

      const dbRow = getServerConfig(serverName);
      const adapter = gameFor(dbRow?.game_type || 'ark');
      const logSubDirs = adapter.getLogSubDirectories();
      const logPatterns = adapter.getLogFilePatterns();

      const possibleLogDirs = logSubDirs.map(sub => path.join(serverPath, sub));

      logger.info(`Checking log directories for ${serverName}:`, possibleLogDirs);

      try {
        await fs.access(serverPath);
        logger.info(`Server path exists: ${serverPath}`);
      } catch (error) {
        logger.warn(`Server path does not exist: ${serverPath}`, error.message);
      }

      const logFiles = [];

      for (const logDir of possibleLogDirs) {
        try {
          logger.info(`Checking log directory: ${logDir}`);
          const files = await fs.readdir(logDir);
          logger.info(`Found ${files.length} files in ${logDir}`);

          for (const file of files) {
            const lowerName = file.toLowerCase();
            const isLogFile = file.endsWith('.log') ||
                             file.endsWith('.txt') ||
                             (logPatterns.length > 0 && logPatterns.some(p => lowerName.includes(p)));

            if (isLogFile) {
              const filePath = path.join(logDir, file);
              const size = await this.service.getFileSize(filePath);
              logFiles.push({
                name: file,
                path: filePath,
                size: size,
                type: this.categorizeLogFile(file, logDir, serverName)
              });
              logger.info(`Added log file: ${file} (${size} bytes) - Type: ${this.categorizeLogFile(file, logDir, serverName)}`);
            }
          }
        } catch (error) {
          logger.warn(`Directory not accessible: ${logDir}`, error.message);
          continue;
        }
      }

      logger.info(`Total log files found for ${serverName}: ${logFiles.length}`);

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

        if (aIsLog && bIsLog) {
          return b.size - a.size;
        }

        return b.size - a.size;
      });
    } catch (error) {
      logger.error(`Failed to get available logs for server ${serverName}:`, error);
      return [];
    }
  }

  /**
   * Categorize log file based on name and location
   */
  categorizeLogFile(fileName, logDir, serverName) {
    const lowerName = fileName.toLowerCase();
    const lowerDir = logDir.toLowerCase();

    const dbRow = getServerConfig(serverName);
    const adapter = gameFor(dbRow?.game_type || 'ark');
    const patterns = adapter.getLogFilePatterns();
    if (patterns.length > 0 && patterns.some(p => lowerName.includes(p))) {
      return 'server';
    }

    if (lowerName.includes('app') || lowerName.includes('system') || lowerName.includes('api')) {
      return 'api';
    }

    if (lowerName.includes('steam') || lowerName.includes('update') || lowerName.includes('install')) {
      return 'steam';
    }

    if (lowerName.includes('error') || lowerName.includes('crash') || lowerName.includes('failed')) {
      return 'error';
    }

    if (lowerName.includes('debug') || lowerName.includes('info') || lowerName.includes('warn')) {
      return 'debug';
    }

    return 'other';
  }

  /**
   * Get system logs (API logs, not server-specific)
   */
  async getSystemLogs() {
    try {
      const systemLogDirs = [
        path.normalize(path.join(process.cwd(), 'logs')),
        path.normalize(path.join(__dirname, '..', '..', 'logs'))
      ];

      logger.info('Looking for system logs in:', systemLogDirs);
      logger.info('Current working directory:', process.cwd());
      logger.info('__dirname:', __dirname);

      const logFiles = [];

      for (const logDir of systemLogDirs) {
        try {
          logger.info(`Checking log directory: ${logDir}`);
          const files = await fs.readdir(logDir);
          logger.info(`Found ${files.length} files in ${logDir}`);

          for (const file of files) {
            const isLogFile = file.endsWith('.log');
            const isBackup = file.includes('backup') || file.includes('backups');
            const isAudit = file.includes('audit.json');
            const isCompressed = file.endsWith('.gz');

            if (!isLogFile || isBackup || isAudit || isCompressed) {
              continue;
            }

            if (file.includes('-') && /\d{4}-\d{2}-\d{2}/.test(file)) {
              const baseName = file.replace(/\.\d+$/, '');
              const hasNewerVersion = files.some(f =>
                f !== file &&
                f.startsWith(baseName) &&
                /\d{4}-\d{2}-\d{2}/.test(f) &&
                !f.match(/\.\d+$/)
              );

              if (hasNewerVersion) {
                continue;
              }
            }

            const filePath = path.join(logDir, file);
            const size = await this.service.getFileSize(filePath);
            logFiles.push({
              name: file,
              path: filePath,
              size: size,
              type: this.categorizeLogFile(file, logDir)
            });
            logger.info(`Added log file: ${file} (${size} bytes)`);
          }
        } catch (error) {
          logger.warn(`Directory not accessible: ${logDir}`, error.message);
          continue;
        }
      }

      logger.info(`Total system log files found: ${logFiles.length}`);
      return logFiles.sort((a, b) => b.size - a.size);
    } catch (error) {
      logger.error('Failed to get system logs:', error);
      return [];
    }
  }
}
