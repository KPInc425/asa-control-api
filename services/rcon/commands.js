import Rcon from 'rcon';
import { spawn } from 'child_process';
import net from 'net';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import {
  incrementRconCommand,
  recordRconCommandDuration
} from '../../metrics/index.js';

export class RconCommands {
  constructor(service) {
    this.service = service;
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
   * Enhanced RCON command with retry mechanism and fallback
   */
  async sendRconCommandWithRetry(containerName, command, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000; // Start with 1 second
    const commandType = this.getCommandType(command);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let startTime;
      try {
        startTime = Date.now();
        const connection = await this.service.connection.getConnection(containerName, options);
        
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
        this.service.connection.updateConnectionHealth(containerName, true);
        
        // Cache successful response for fallback
        this.service.cache.cacheResponse(containerName, command, response);
        
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
        this.service.connection.updateConnectionHealth(containerName, false);
        
        logger.warn(`RCON command failed (attempt ${attempt}/${maxRetries}) for ${containerName}: ${command}`, {
          error: error.message,
          attempt,
          maxRetries
        });
        
        // If this is the last attempt, try to use cached data
        if (attempt === maxRetries) {
          const cachedResponse = this.service.cache.getCachedResponse(containerName, command);
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
            connectionHealth: this.service.connection.getConnectionHealth(containerName)
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
        this.service.connection.updateConnectionHealth(serverKey, true);
        
        // Cache successful response for fallback
        this.service.cache.cacheResponse(serverKey, command, response);
        
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
        this.service.connection.updateConnectionHealth(serverKey, false);
        
        logger.warn(`RCON command failed (attempt ${attempt}/${maxRetries}) for native server ${serverKey}: ${command}`, {
          error: error.message,
          attempt,
          maxRetries
        });
        
        // If this is the last attempt, try to use cached data
        if (attempt === maxRetries) {
          const cachedResponse = this.service.cache.getCachedResponse(serverKey, command);
          if (cachedResponse) {
            logger.info(`Using cached response for ${serverKey}: ${command}`);
            return cachedResponse;
          }
          
          // Log detailed error information
          logger.error(`RCON command failed after ${maxRetries} attempts for native server ${serverKey}: ${command}`, {
            error: error.message,
            stack: error.stack,
            connectionHealth: this.service.connection.getConnectionHealth(serverKey)
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
   * Get server info with enhanced error handling
   */
  async getServerInfo(containerName, options = {}) {
    try {
      const response = await this.sendRconCommandWithRetry(containerName, 'ServerInfo', options);
      return this.service.parser.parseServerInfo(response.response);
    } catch (error) {
      logger.error(`Failed to get server info for ${containerName}:`, error);
      
      // Return fallback data if available
      const cachedResponse = this.service.cache.getCachedResponse(containerName, 'ServerInfo');
      if (cachedResponse) {
        logger.info(`Using cached server info for ${containerName}`);
        return this.service.parser.parseServerInfo(cachedResponse);
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
      return this.service.parser.parsePlayerList(response.response);
    } catch (error) {
      logger.error(`Failed to get player list for ${containerName}:`, error);
      
      // Return fallback data if available
      const cachedResponse = this.service.cache.getCachedResponse(containerName, 'ListPlayers');
      if (cachedResponse) {
        logger.info(`Using cached player list for ${containerName}`);
        return this.service.parser.parsePlayerList(cachedResponse);
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
}
