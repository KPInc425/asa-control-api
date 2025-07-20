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
  }

  /**
   * Send RCON command using rcon-client
   */
  async sendRconCommand(containerName, command, options = {}) {
    const startTime = Date.now();
    const commandType = this.getCommandType(command);
    
    try {
      const connection = await this.getConnection(containerName, options);
      
      const response = await new Promise((resolve, reject) => {
        connection.on('response', (str) => {
          resolve(str);
        });

        connection.on('error', (err) => {
          reject(err);
        });

        connection.send(command);
      });
      
      const duration = (Date.now() - startTime) / 1000;
      incrementRconCommand(containerName, commandType);
      recordRconCommandDuration(containerName, commandType, duration);
      
      logger.info(`RCON command sent to ${containerName}: ${command}`);
      return { success: true, response, command };
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      incrementRconCommand(containerName, commandType);
      recordRconCommandDuration(containerName, commandType, duration);
      
      logger.error(`RCON command failed for ${containerName}: ${command}`, error);
      throw new Error(`RCON command failed: ${error.message}`);
    }
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
   * Send RCON command to native server
   */
  async sendCommand(options, command) {
    logger.info(`[RconService] sendCommand called with options:`, JSON.stringify(options));
    if (!options || typeof options !== 'object' || !options.host) {
      logger.error(`[RconService] Invalid options passed to sendCommand:`, options);
      throw new Error('RCON options must include a host property.');
    }

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
      logger.info(`[RconService] Network connectivity test passed for ${options.host}:${options.port}`);
    } catch (error) {
      logger.error(`[RconService] Network connectivity test failed for ${options.host}:${options.port}:`, error.message);
      throw new Error(`RCON connection failed: ${error.message}`);
    }
    const startTime = Date.now();
    const commandType = this.getCommandType(command);
    
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
    
    logger.info(`Attempting RCON connection to ${options.host}:${options.port} with command: ${command}`);
    
    try {
          logger.info(`[RconService] Creating Rcon connection with:`, {
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

        connection.on('auth', () => {
          logger.info(`RCON authenticated successfully to ${options.host}:${options.port}`);
          connection.send(command);
        });

        connection.on('response', (str) => {
          logger.info(`RCON response received: ${str}`);
          connection.disconnect();
          resolve(str);
        });

        connection.on('error', (err) => {
          logger.error(`RCON error: ${err}`);
          connection.disconnect();
          reject(err);
        });

        connection.on('end', () => {
          logger.info(`RCON connection ended`);
        });

        connection.connect();
      });
      
      const duration = (Date.now() - startTime) / 1000;
      incrementRconCommand(`native-${options.host}:${options.port}`, commandType);
      recordRconCommandDuration(`native-${options.host}:${options.port}`, commandType, duration);
      
      logger.info(`RCON command sent to native server ${options.host}:${options.port}: ${command}`);
      return response;
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      incrementRconCommand(`native-${options.host}:${options.port}`, commandType);
      recordRconCommandDuration(`native-${options.host}:${options.port}`, commandType, duration);
      
      logger.error(`RCON command failed for native server ${options.host}:${options.port}: ${command}`, error);
      
      // Provide more specific error messages
      if (error.message.includes('ECONNREFUSED')) {
        throw new Error(`RCON connection refused. Server may not be running or RCON port ${options.port} is not accessible.`);
      } else if (error.message.includes('timeout')) {
        throw new Error(`RCON connection timeout. Server may not be responding.`);
      } else if (error.message.includes('authentication')) {
        throw new Error(`RCON authentication failed. Check RCON password.`);
      } else {
        throw new Error(`RCON command failed: ${error.message}`);
      }
    }
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
   * Get server info
   */
  async getServerInfo(containerName, options = {}) {
    try {
      const response = await this.sendRconCommand(containerName, 'ServerInfo', options);
      return this.parseServerInfo(response.response);
    } catch (error) {
      logger.error(`Failed to get server info for ${containerName}:`, error);
      throw error;
    }
  }

  /**
   * Get player list
   */
  async getPlayerList(containerName, options = {}) {
    try {
      const response = await this.sendRconCommand(containerName, 'ListPlayers', options);
      return this.parsePlayerList(response.response);
    } catch (error) {
      logger.error(`Failed to get player list for ${containerName}:`, error);
      throw error;
    }
  }

  /**
   * Save world
   */
  async saveWorld(containerName, options = {}) {
    try {
      const response = await this.sendRconCommand(containerName, 'SaveWorld', options);
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
      const response = await this.sendRconCommand(containerName, `Broadcast ${message}`, options);
      return { success: true, message: 'Message broadcasted successfully' };
    } catch (error) {
      logger.error(`Failed to broadcast message to ${containerName}:`, error);
      throw error;
    }
  }

  /**
   * Parse server info response
   */
  parseServerInfo(response) {
    // This is a basic parser - you may need to adjust based on actual ASA response format
    try {
      const lines = response.split('\n');
      const info = {};
      
      lines.forEach(line => {
        const [key, value] = line.split(':').map(s => s.trim());
        if (key && value) {
          info[key] = value;
        }
      });
      
      return info;
    } catch (error) {
      logger.warn('Failed to parse server info response:', error);
      return { raw: response };
    }
  }

  /**
   * Parse player list response
   */
  parsePlayerList(response) {
    // This is a basic parser - you may need to adjust based on actual ASA response format
    try {
      const lines = response.split('\n');
      const players = [];
      
      lines.forEach(line => {
        if (line.includes('Player')) {
          const match = line.match(/Player (\d+): (.+)/);
          if (match) {
            players.push({
              id: match[1],
              name: match[2].trim()
            });
          }
        }
      });
      
      return players;
    } catch (error) {
      logger.warn('Failed to parse player list response:', error);
      return { raw: response };
    }
  }
}

export default new RconService(); 
