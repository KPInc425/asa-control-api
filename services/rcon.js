import { Rcon } from 'rcon-client';
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
      const response = await connection.send(command);
      
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
  async sendCommand(host, port, command, password = 'admin123') {
    const startTime = Date.now();
    const commandType = this.getCommandType(command);
    
    // Validate required parameters
    if (!host) {
      throw new Error('RCON host is required');
    }
    if (!port) {
      throw new Error('RCON port is required');
    }
    if (!command) {
      throw new Error('RCON command is required');
    }
    
    try {
      const connection = new Rcon({
        host: host || 'localhost',
        port: port,
        password: password,
        timeout: 5000
      });

      await connection.connect();
      const response = await connection.send(command);
      await connection.end();
      
      const duration = (Date.now() - startTime) / 1000;
      incrementRconCommand(`native-${host}:${port}`, commandType);
      recordRconCommandDuration(`native-${host}:${port}`, commandType, duration);
      
      logger.info(`RCON command sent to native server ${host}:${port}: ${command}`);
      return response;
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      incrementRconCommand(`native-${host}:${port}`, commandType);
      recordRconCommandDuration(`native-${host}:${port}`, commandType, duration);
      
      logger.error(`RCON command failed for native server ${host}:${port}: ${command}`, error);
      
      // Provide more specific error messages
      if (error.message.includes('ECONNREFUSED')) {
        throw new Error(`RCON connection refused. Server may not be running or RCON port ${port} is not accessible.`);
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
    const connectionKey = `${containerName}-${options.host || 'localhost'}-${options.port || config.rcon.defaultPort}`;
    
    if (this.connections.has(connectionKey)) {
      const connection = this.connections.get(connectionKey);
      if (connection.connected) {
        return connection;
      }
    }

    const connection = new Rcon({
      host: options.host || 'localhost',
      port: options.port || config.rcon.defaultPort,
      password: options.password || config.rcon.password,
      timeout: options.timeout || 5000
    });

    try {
      await connection.connect();
      this.connections.set(connectionKey, connection);
      
      // Handle connection close
      connection.on('end', () => {
        this.connections.delete(connectionKey);
        logger.info(`RCON connection closed for ${containerName}`);
      });

      return connection;
    } catch (error) {
      logger.error(`Failed to connect RCON for ${containerName}:`, error);
      throw new Error(`RCON connection failed: ${error.message}`);
    }
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
