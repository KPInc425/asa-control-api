import Rcon from 'rcon';
import { spawn } from 'child_process';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { 
  incrementRconCommand, 
  recordRconCommandDuration 
} from '../metrics/index.js';

class RconService {
  constructor() {
    this.connections = new Map();
    this.cachedData = new Map(); // Cache for fallback data
    this.connectionHealth = new Map(); // Track connection health
  }

  /**
   * Enhanced RCON command with retry mechanism and fallback
   */
  async sendRconCommandWithRetry(containerName, command, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000; // Start with 1 second
    const commandType = this.getCommandType(command);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const connection = await this.getConnection(containerName, options);
        
        const response = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('RCON command timeout'));
          }, options.timeout || 10000);

          connection.on('response', (str) => {
            clearTimeout(timeout);
            resolve(str);
          });

          connection.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });

          connection.send(command);
        });
        
        const duration = (Date.now() - startTime) / 1000;
        incrementRconCommand(containerName, commandType);
        recordRconCommandDuration(containerName, commandType, duration);
        
        // Update connection health on success
        this.updateConnectionHealth(containerName, true);
        
        // Cache successful response for fallback
        this.cacheResponse(containerName, command, response);
        
        // Only log successful commands at debug level to reduce noise
        if (config.logging.enableDebug) {
          logger.debug(`RCON command successful (attempt ${attempt}/${maxRetries}) to ${containerName}: ${command}`);
        }
        return { success: true, response, command, attempt };
        
      } catch (error) {
        const duration = (Date.now() - startTime) / 1000;
        incrementRconCommand(containerName, commandType);
        recordRconCommandDuration(containerName, commandType, duration);
        
        // Update connection health on failure
        this.updateConnectionHealth(containerName, false);
        
        logger.warn(`RCON command failed (attempt ${attempt}/${maxRetries}) for ${containerName}: ${command}`, {
          error: error.message,
          attempt,
          maxRetries
        });
        
        // If this is the last attempt, try to use cached data
        if (attempt === maxRetries) {
          const cachedResponse = this.getCachedResponse(containerName, command);
          if (cachedResponse) {
            logger.info(`Using cached response for ${containerName}: ${command}`);
            return { 
              success: true, 
              response: cachedResponse, 
              command, 
              cached: true,
              error: error.message 
            };
          }
          
          // Log detailed error information
          logger.error(`RCON command failed after ${maxRetries} attempts for ${containerName}: ${command}`, {
            error: error.message,
            stack: error.stack,
            connectionHealth: this.getConnectionHealth(containerName)
          });
          
          throw new Error(`RCON command failed after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Wait before retry with exponential backoff
        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Send RCON command using rcon-client (legacy method - now uses enhanced version)
   */
  async sendRconCommand(containerName, command, options = {}) {
    return this.sendRconCommandWithRetry(containerName, command, options);
  }

  /**
   * Send RCON command using asa-ctrl (alternative method)
   */
  async sendAsaCtrlCommand(containerName, command, options = {}) {
    const startTime = Date.now();
    const commandType = this.getCommandType(command);
    
    return new Promise((resolve, reject) => {
      const asaCtrl = spawn('asa-ctrl', [
        '--container', containerName,
        '--command', command,
        '--password', options.password || config.rcon.password
      ]);

      let stdout = '';
      let stderr = '';

      asaCtrl.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      asaCtrl.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      asaCtrl.on('close', (code) => {
        const duration = (Date.now() - startTime) / 1000;
        incrementRconCommand(containerName, commandType);
        recordRconCommandDuration(containerName, commandType, duration);

        if (code === 0) {
          logger.info(`asa-ctrl command sent to ${containerName}: ${command}`);
          resolve({ success: true, response: stdout, command });
        } else {
          logger.error(`asa-ctrl command failed for ${containerName}: ${command}`, stderr);
          reject(new Error(`asa-ctrl command failed: ${stderr}`));
        }
      });

      asaCtrl.on('error', (error) => {
        const duration = (Date.now() - startTime) / 1000;
        incrementRconCommand(containerName, commandType);
        recordRconCommandDuration(containerName, commandType, duration);
        
        logger.error(`asa-ctrl error for ${containerName}: ${command}`, error);
        reject(new Error(`asa-ctrl error: ${error.message}`));
      });
    });
  }

  /**
   * Send RCON command to native server with enhanced error handling
   */
  async sendCommand(options, command) {
    logger.info(`[RconService] sendCommand called with options:`, JSON.stringify(options));
    if (!options || typeof options !== 'object' || !options.host) {
      logger.error(`[RconService] Invalid options passed to sendCommand:`, options);
      throw new Error('RCON options must include a host property.');
    }

    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000;
    const commandType = this.getCommandType(command);
    const serverKey = `${options.host}:${options.port}`;

    // Test network connectivity first
    try {
      const net = await import('net');
      const testConnection = () => {
        return new Promise((resolve, reject) => {
          const socket = new net.Socket();
          const timeout = setTimeout(() => {
            socket.destroy();
            reject(new Error('Connection timeout'));
          }, 5000);
          
          socket.connect(options.port, options.host, () => {
            clearTimeout(timeout);
            socket.destroy();
            resolve(true);
          });
          
          socket.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
      };
      
      await testConnection();
      logger.info(`[RconService] Network connectivity test passed for ${serverKey}`);
    } catch (error) {
      logger.error(`[RconService] Network connectivity test failed for ${serverKey}:`, error.message);
      throw new Error(`RCON connection failed: ${error.message}`);
    }

    // Validate required parameters
    if (!options.host) {
      logger.error('RCON command failed: host is required');
      throw new Error('RCON host is required');
    }
    if (!options.port) {
      logger.error('RCON command failed: port is required');
      throw new Error('RCON port is required');
    }
    if (!command) {
      logger.error('RCON command failed: command is required');
      throw new Error('RCON command is required');
    }
    
    logger.info(`Attempting RCON connection to ${serverKey} with command: ${command}`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      
      try {
        logger.info(`[RconService] Creating Rcon connection (attempt ${attempt}/${maxRetries}) with:`, {
          host: options.host || 'localhost',
          port: options.port,
          password: options.password || config.rcon.password,
          passwordLength: (options.password || config.rcon.password || '').length,
          passwordSource: options.password ? 'options' : 'config'
        });
        
        const response = await new Promise((resolve, reject) => {
          const connection = new Rcon(
            options.host || 'localhost',
            options.port,
            options.password || config.rcon.password
          );

          const timeout = setTimeout(() => {
            connection.disconnect();
            reject(new Error('RCON command timeout'));
          }, options.timeout || 10000);

          connection.on('auth', () => {
            // Only log authentication at debug level to reduce noise
            if (config.logging.enableDebug) {
              logger.debug(`RCON authenticated successfully to ${serverKey} (attempt ${attempt})`);
            }
            connection.send(command);
          });

          connection.on('response', (str) => {
            clearTimeout(timeout);
            // Only log responses at debug level to reduce noise
            if (config.logging.enableDebug) {
              logger.debug(`RCON response received from ${serverKey}: ${str}`);
            }
            connection.disconnect();
            resolve(str);
          });

          connection.on('error', (err) => {
            clearTimeout(timeout);
            logger.error(`RCON error from ${serverKey} (attempt ${attempt}): ${err}`);
            connection.disconnect();
            reject(err);
          });

          connection.on('end', () => {
            // Only log connection end at debug level to reduce noise
            if (config.logging.enableDebug) {
              logger.debug(`RCON connection ended for ${serverKey}`);
            }
          });

          connection.connect();
        });
        
        const duration = (Date.now() - startTime) / 1000;
        incrementRconCommand(`native-${serverKey}`, commandType);
        recordRconCommandDuration(`native-${serverKey}`, commandType, duration);
        
        // Update connection health on success
        this.updateConnectionHealth(serverKey, true);
        
        // Cache successful response for fallback
        this.cacheResponse(serverKey, command, response);
        
        // Only log successful commands at debug level to reduce noise
        if (config.logging.enableDebug) {
          logger.debug(`RCON command successful (attempt ${attempt}/${maxRetries}) to native server ${serverKey}: ${command}`);
        }
        return response;
        
      } catch (error) {
        const duration = (Date.now() - startTime) / 1000;
        incrementRconCommand(`native-${serverKey}`, commandType);
        recordRconCommandDuration(`native-${serverKey}`, commandType, duration);
        
        // Update connection health on failure
        this.updateConnectionHealth(serverKey, false);
        
        logger.warn(`RCON command failed (attempt ${attempt}/${maxRetries}) for native server ${serverKey}: ${command}`, {
          error: error.message,
          attempt,
          maxRetries
        });
        
        // If this is the last attempt, try to use cached data
        if (attempt === maxRetries) {
          const cachedResponse = this.getCachedResponse(serverKey, command);
          if (cachedResponse) {
            logger.info(`Using cached response for ${serverKey}: ${command}`);
            return cachedResponse;
          }
          
          // Log detailed error information
          logger.error(`RCON command failed after ${maxRetries} attempts for native server ${serverKey}: ${command}`, {
            error: error.message,
            stack: error.stack,
            connectionHealth: this.getConnectionHealth(serverKey)
          });
          
          // Provide more specific error messages
          if (error.message.includes('ECONNREFUSED')) {
            throw new Error(`RCON connection refused. Server may not be running or RCON port ${options.port} is not accessible.`);
          } else if (error.message.includes('timeout')) {
            throw new Error(`RCON connection timeout. Server may not be responding.`);
          } else if (error.message.includes('authentication')) {
            throw new Error(`RCON authentication failed. Check RCON password.`);
          } else {
            throw new Error(`RCON command failed after ${maxRetries} attempts: ${error.message}`);
          }
        }
        
        // Wait before retry with exponential backoff
        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Cache response for fallback use
   */
  cacheResponse(serverKey, command, response) {
    const cacheKey = `${serverKey}:${command}`;
    const cacheEntry = {
      response,
      timestamp: Date.now(),
      ttl: 300000 // 5 minutes TTL
    };
    this.cachedData.set(cacheKey, cacheEntry);
    
    // Clean up expired cache entries
    this.cleanupCache();
  }

  /**
   * Get cached response if available and not expired
   */
  getCachedResponse(serverKey, command) {
    const cacheKey = `${serverKey}:${command}`;
    const cacheEntry = this.cachedData.get(cacheKey);
    
    if (cacheEntry && (Date.now() - cacheEntry.timestamp) < cacheEntry.ttl) {
      return cacheEntry.response;
    }
    
    // Remove expired entry
    if (cacheEntry) {
      this.cachedData.delete(cacheKey);
    }
    
    return null;
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.cachedData.entries()) {
      if ((now - entry.timestamp) > entry.ttl) {
        this.cachedData.delete(key);
      }
    }
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
    
    const connectionKey = `${containerName}-${safeOptions.host || 'localhost'}-${safeOptions.port || config.rcon.defaultPort}`;
    
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
      safeOptions.host || 'localhost',
      safeOptions.port || config.rcon.defaultPort,
        safeOptions.password || config.rcon.password
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
   * Get command type for metrics
   */
  getCommandType(command) {
    const cmd = command.toLowerCase();
    if (cmd.includes('saveworld')) return 'saveworld';
    if (cmd.includes('shutdown')) return 'shutdown';
    if (cmd.includes('broadcast')) return 'broadcast';
    if (cmd.includes('kick')) return 'kick';
    if (cmd.includes('ban')) return 'ban';
    if (cmd.includes('teleport')) return 'teleport';
    if (cmd.includes('spawn')) return 'spawn';
    if (cmd.includes('give')) return 'give';
    if (cmd.includes('listplayers')) return 'listplayers';
    if (cmd.includes('listtribes')) return 'listtribes';
    return 'other';
  }

  /**
   * Get server info with enhanced error handling
   */
  async getServerInfo(containerName, options = {}) {
    try {
      const response = await this.sendRconCommandWithRetry(containerName, 'ServerInfo', options);
      return this.parseServerInfo(response.response);
    } catch (error) {
      logger.error(`Failed to get server info for ${containerName}:`, error);
      
      // Return fallback data if available
      const cachedResponse = this.getCachedResponse(containerName, 'ServerInfo');
      if (cachedResponse) {
        logger.info(`Using cached server info for ${containerName}`);
        return this.parseServerInfo(cachedResponse);
      }
      
      throw error;
    }
  }

  /**
   * Get player list with enhanced error handling and improved parsing
   */
  async getPlayerList(containerName, options = {}) {
    try {
      const response = await this.sendRconCommandWithRetry(containerName, 'ListPlayers', options);
      return this.parsePlayerList(response.response);
    } catch (error) {
      logger.error(`Failed to get player list for ${containerName}:`, error);
      
      // Return fallback data if available
      const cachedResponse = this.getCachedResponse(containerName, 'ListPlayers');
      if (cachedResponse) {
        logger.info(`Using cached player list for ${containerName}`);
        return this.parsePlayerList(cachedResponse);
      }
      
      throw error;
    }
  }

  /**
   * Save world
   */
  async saveWorld(containerName, options = {}) {
    try {
      const response = await this.sendRconCommandWithRetry(containerName, 'SaveWorld', options);
      return { success: true, message: 'World saved successfully' };
    } catch (error) {
      logger.error(`Failed to save world for ${containerName}:`, error);
      throw error;
    }
  }

  /**
   * Broadcast message
   */
  async broadcast(containerName, message, options = {}) {
    try {
      const response = await this.sendRconCommandWithRetry(containerName, `Broadcast ${message}`, options);
      return { success: true, message: 'Message broadcasted successfully' };
    } catch (error) {
      logger.error(`Failed to broadcast message to ${containerName}:`, error);
      throw error;
    }
  }

  /**
   * Parse server info response with improved error handling
   */
  parseServerInfo(response) {
    try {
      if (!response || typeof response !== 'string') {
        logger.warn('Invalid server info response:', response);
        return { raw: response, error: 'Invalid response format' };
      }
      
      const lines = response.split('\n');
      const info = {};
      
      lines.forEach(line => {
        const [key, value] = line.split(':').map(s => s.trim());
        if (key && value) {
          info[key] = value;
        }
      });
      
      logger.debug('Parsed server info:', info);
      return info;
    } catch (error) {
      logger.warn('Failed to parse server info response:', error);
      return { raw: response, error: error.message };
    }
  }

  /**
   * Parse player list response with improved parsing for ARK ASA format
   */
  parsePlayerList(response) {
    try {
      if (!response || typeof response !== 'string') {
        logger.warn('Invalid player list response:', response);
        return [];
      }
      
      const lines = response.split('\n');
      const players = [];
      
      lines.forEach(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;
        
        // Try multiple parsing patterns for ARK ASA
        let player = null;
        
        // Pattern 1: "0. PlayerName, 0002214a4a6742d9a347bd449b2dc143"
        const pattern1 = /^(\d+)\.\s+([^,]+),\s*([0-9a-fA-F]+)$/;
        const match1 = trimmedLine.match(pattern1);
        if (match1) {
          player = {
            id: match1[1],
            name: match1[2].trim(),
            steamId: match1[3]
          };
        }
        
        // Pattern 2: "Player 1: PlayerName"
        const pattern2 = /^Player\s+(\d+):\s+(.+)$/;
        const match2 = trimmedLine.match(pattern2);
        if (match2 && !player) {
          player = {
            id: match2[1],
            name: match2[2].trim()
          };
        }
        
        // Pattern 3: Just player name (fallback)
        if (!player && !trimmedLine.includes('Player') && !trimmedLine.includes('.')) {
          player = {
            id: players.length + 1,
            name: trimmedLine
          };
        }
        
        if (player) {
          players.push(player);
        }
      });
      
      logger.debug(`Parsed ${players.length} players from response:`, players);
      return players;
    } catch (error) {
      logger.warn('Failed to parse player list response:', error);
      return [];
    }
  }

  /**
   * Get connection health summary for monitoring
   */
  getConnectionHealthSummary() {
    const summary = {};
    for (const [serverKey, health] of this.connectionHealth.entries()) {
      summary[serverKey] = {
        ...health,
        successRate: health.successCount + health.failureCount > 0 
          ? (health.successCount / (health.successCount + health.failureCount) * 100).toFixed(2) + '%'
          : '0%'
      };
    }
    return summary;
  }

  /**
   * Clear cache for a specific server or all servers
   */
  clearCache(serverKey = null) {
    if (serverKey) {
      for (const key of this.cachedData.keys()) {
        if (key.startsWith(serverKey)) {
          this.cachedData.delete(key);
        }
      }
      logger.info(`Cleared cache for ${serverKey}`);
    } else {
      this.cachedData.clear();
      logger.info('Cleared all cached data');
    }
  }
}

export default new RconService(); 
