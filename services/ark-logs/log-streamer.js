import fs from 'fs/promises';
import path from 'path';
import { createReadStream, watch } from 'fs';
import { EventEmitter } from 'events';
import logger from '../../utils/logger.js';
import config from '../../config/index.js';
import { gameFor } from '../../games/index.js';
import { getServerConfig } from '../database.js';

export class LogStreamer {
  constructor(service) {
    this.service = service;
  }

  /**
   * Create a read stream for a specific log file with real-time following
   */
  async createLogStream(serverName, logFileName, options = {}) {
    const { tail = 100, follow = true } = options;

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

    const dbRow = serverName ? getServerConfig(serverName) : null;
    const adapter = gameFor(dbRow?.game_type || 'ark');
    const logSubDirs = adapter.getLogSubDirectories();
    const possibleLogPaths = [
      ...logSubDirs.map(sub => path.join(serverPath, sub, logFileName)),
      path.join(serverPath, logFileName),
    ];

    let logPath = null;
    for (const p of possibleLogPaths) {
      try {
        await fs.access(p);
        logPath = p;
        break;
      } catch (error) {
        // Continue to next path
      }
    }

    if (!logPath) {
      throw new Error(`Log file ${logFileName} not found for server ${serverName}`);
    }

    logger.info(`Creating log stream for ${serverName}/${logFileName} at ${logPath}`);

    const stream = new EventEmitter();

    try {
      const content = await fs.readFile(logPath, 'utf8');
      const lines = content.split('\n');
      const tailLines = lines.slice(-tail);

      for (const line of tailLines) {
        if (line.trim()) {
          stream.emit('data', Buffer.from(line + '\n', 'utf8'));
        }
      }

      if (follow) {
        const watcher = watch(logPath, { persistent: true }, async (eventType, filename) => {
          if (eventType === 'change') {
            try {
              const newContent = await fs.readFile(logPath, 'utf8');
              const newLines = newContent.split('\n');

              const newLinesOnly = newLines.slice(lines.length);

              for (const line of newLinesOnly) {
                if (line.trim()) {
                  stream.emit('data', Buffer.from(line + '\n', 'utf8'));
                }
              }

              lines.length = newLines.length;
            } catch (error) {
              logger.error(`Error reading updated log file ${logPath}:`, error);
            }
          }
        });

        stream.watcher = watcher;

        watcher.on('error', (error) => {
          logger.error(`File watcher error for ${logPath}:`, error);
          stream.emit('error', error);
        });
      }

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
}
