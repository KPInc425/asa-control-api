import Rcon from 'rcon';
import { promises as fs } from 'fs';
import path from 'path';
import { existsSync } from 'fs';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

export class RconConnection {
  constructor(service) {
    this.service = service;
    this.connections = new Map();
    this.connectionHealth = new Map();
  }

  /**
   * Resolve server RCON configuration from server-config.json on disk
   * Uses the containerName (server name) to find the correct RCON port and password
   */
  async resolveServerConfig(serverName) {
    try {
      // Determine possible paths for server-config.json
      const nativeBasePath = config.server.native.basePath || 'C:\\ARK';
      const clustersPath = config.server.native.clustersPath || path.join(nativeBasePath, 'clusters');
      const serversPath = path.join(nativeBasePath, 'servers');

      // Search clusters first
      if (existsSync(clustersPath)) {
        const clusterDirs = await fs.readdir(clustersPath);
        for (const clusterName of clusterDirs) {
          const clusterPath = path.join(clustersPath, clusterName);
          const serverConfigPath = path.join(clusterPath, serverName, 'server-config.json');
          if (existsSync(serverConfigPath)) {
            const data = await fs.readFile(serverConfigPath, 'utf8');
            const parsed = JSON.parse(data);
            return {
              host: '127.0.0.1',
              port: parsed.rconPort || parsed.port || config.rcon.defaultPort,
              password: parsed.rconPassword || parsed.adminPassword || config.rcon.password
            };
          }
        }
      }

      // Fallback to standalone servers path
      if (existsSync(serversPath)) {
        const serverConfigPath = path.join(serversPath, serverName, 'server-config.json');
        if (existsSync(serverConfigPath)) {
          const data = await fs.readFile(serverConfigPath, 'utf8');
          const parsed = JSON.parse(data);
          return {
            host: '127.0.0.1',
            port: parsed.rconPort || parsed.port || config.rcon.defaultPort,
            password: parsed.rconPassword || parsed.adminPassword || config.rcon.password
          };
        }
      }
    } catch (err) {
      logger.warn(`[RconService] Failed to resolve server config for ${serverName}: ${err.message}`);
    }
    return null;
  }

  /**
   * Get or create RCON connection
   */
  async getConnection(containerName, options = {}) {
    // Ensure options is an object and handle undefined values
    const safeOptions = options || {};
    
    // Validate container name
    if (!containerName) {
      throw new Error('Container name is required for RCON connection');
    }

    // Auto-resolve server config if host/port/password not provided
    let resolvedHost = safeOptions.host;
    let resolvedPort = safeOptions.port;
    let resolvedPassword = safeOptions.password;

    if (!resolvedHost || !resolvedPort || !resolvedPassword) {
      const serverConfig = await this.resolveServerConfig(containerName);
      if (serverConfig) {
        resolvedHost = resolvedHost || serverConfig.host;
        resolvedPort = resolvedPort || serverConfig.port;
        resolvedPassword = resolvedPassword || serverConfig.password;
        logger.info(`[RconService] Resolved config for ${containerName}: port=${resolvedPort}`);
      }
    }

    const resolvedHostFinal = resolvedHost || 'localhost';
    const resolvedPortFinal = resolvedPort || config.rcon.defaultPort;
    const resolvedPasswordFinal = resolvedPassword || config.rcon.password;
    
    const connectionKey = `${containerName}-${resolvedHostFinal}-${resolvedPortFinal}`;
    
    if (this.connections.has(connectionKey)) {
      const connection = this.connections.get(connectionKey);
      if (connection && connection.connected) {
        return connection;
      }
      // Remove stale connection
      this.connections.delete(connectionKey);
    }

    return new Promise((resolve, reject) => {
    const connection = new Rcon(
      resolvedHostFinal,
      resolvedPortFinal,
      resolvedPasswordFinal
    );

      connection.on('auth', () => {
        logger.info(`RCON authenticated successfully for ${containerName}`);
      this.connections.set(connectionKey, connection);
        resolve(connection);
      });

      connection.on('error', (err) => {
        logger.error(`Failed to connect RCON for ${containerName}:`, err);
        reject(new Error(`RCON connection failed: ${err.message}`));
      });

      connection.on('end', () => {
        this.connections.delete(connectionKey);
        logger.info(`RCON connection closed for ${containerName}`);
      });

      connection.connect();
    });
  }

  /**
   * Close all RCON connections
   */
  async closeAllConnections() {
    const closePromises = Array.from(this.connections.values()).map(async (connection) => {
      try {
        await connection.end();
      } catch (error) {
        logger.error('Error closing RCON connection:', error);
      }
    });

    await Promise.all(closePromises);
    this.connections.clear();
    logger.info('All RCON connections closed');
  }

  /**
   * Update connection health tracking
   */
  updateConnectionHealth(serverKey, success) {
    const health = this.connectionHealth.get(serverKey) || {
      successCount: 0,
      failureCount: 0,
      lastSuccess: null,
      lastFailure: null,
      consecutiveFailures: 0
    };
    
    if (success) {
      health.successCount++;
      health.lastSuccess = Date.now();
      health.consecutiveFailures = 0;
    } else {
      health.failureCount++;
      health.lastFailure = Date.now();
      health.consecutiveFailures++;
    }
    
    this.connectionHealth.set(serverKey, health);
  }

  /**
   * Get connection health information
   */
  getConnectionHealth(serverKey) {
    return this.connectionHealth.get(serverKey) || {
      successCount: 0,
      failureCount: 0,
      lastSuccess: null,
      lastFailure: null,
      consecutiveFailures: 0
    };
  }
}
