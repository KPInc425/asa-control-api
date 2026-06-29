import fs from 'fs/promises';
import path from 'path';
import logger from '../../utils/logger.js';
import config from '../../config/index.js';

export class PathResolver {
  constructor(service) {
    this.service = service;
  }

  /**
   * Resolve the server path for a given server name.
   * Checks database first, then standalone and cluster locations.
   */
  async resolveServerPath(serverName, defaultBasePath = 'F:\\ARK') {
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
      const basePath = process.env.NATIVE_BASE_PATH || (config.server && config.server.native && config.server.native.basePath) || defaultBasePath;
      const clustersPath = process.env.NATIVE_CLUSTERS_PATH || (config.server && config.server.native && config.server.native.clustersPath) || path.join(basePath, 'clusters');
      const serversPath = path.join(basePath, 'servers');

      // Check both standalone and cluster locations
      const standalonePath = path.join(serversPath, serverName);

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

    return serverPath;
  }
}
