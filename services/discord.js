import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DiscordService {
  constructor() {
    this.configPath = path.join(process.cwd(), 'data', 'discord-config.json');
    this.webhooksPath = path.join(process.cwd(), 'data', 'discord-webhooks.json');
    this.init();
  }

  async init() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.configPath);
      await fs.mkdir(dataDir, { recursive: true });
      
      // Initialize config file if it doesn't exist
      try {
        await fs.access(this.configPath);
      } catch (error) {
        const defaultConfig = {
          enabled: false,
          token: '',
          applicationId: '', // Discord Application ID for slash commands
          allowedChannels: [],
          allowedRoles: [],
          notifications: {
            serverStatus: true,
            playerJoin: true,
            playerLeave: true,
            serverStart: true,
            serverStop: true,
            errors: true
          }
        };
        await fs.writeFile(this.configPath, JSON.stringify(defaultConfig, null, 2));
      }
      
      // Initialize webhooks file if it doesn't exist
      try {
        await fs.access(this.webhooksPath);
      } catch (error) {
        await fs.writeFile(this.webhooksPath, JSON.stringify([], null, 2));
      }
    } catch (error) {
      logger.error('Error initializing Discord service:', error);
    }
  }

  async getBotConfig() {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      logger.error('Error reading Discord bot config:', error);
      return {
        enabled: false,
        token: '',
        applicationId: '',
        allowedChannels: [],
        allowedRoles: [],
        notifications: {
          serverStatus: true,
          playerJoin: true,
          playerLeave: true,
          serverStart: true,
          serverStop: true,
          errors: true
        }
      };
    }
  }

  async updateBotConfig(config) {
    try {
      const currentConfig = await this.getBotConfig();
      const updatedConfig = { ...currentConfig, ...config };
      
      await fs.writeFile(this.configPath, JSON.stringify(updatedConfig, null, 2));
      
      // If bot is enabled and token is provided, restart bot
      if (updatedConfig.enabled && updatedConfig.token) {
        await this.restartBot();
      }
      
      return true;
    } catch (error) {
      logger.error('Error updating Discord bot config:', error);
      return false;
    }
  }

  async getWebhooks() {
    try {
      const webhooksData = await fs.readFile(this.webhooksPath, 'utf8');
      return JSON.parse(webhooksData);
    } catch (error) {
      logger.error('Error reading Discord webhooks:', error);
      return [];
    }
  }

  async addWebhook(webhook) {
    try {
      const webhooks = await this.getWebhooks();
      const newWebhook = {
        id: this.generateId(),
        ...webhook,
        createdAt: new Date().toISOString()
      };
      
      webhooks.push(newWebhook);
      await fs.writeFile(this.webhooksPath, JSON.stringify(webhooks, null, 2));
      
      return newWebhook;
    } catch (error) {
      logger.error('Error adding Discord webhook:', error);
      return null;
    }
  }

  async updateWebhook(id, updates) {
    try {
      const webhooks = await this.getWebhooks();
      const webhookIndex = webhooks.findIndex(w => w.id === id);
      
      if (webhookIndex === -1) {
        return false;
      }
      
      webhooks[webhookIndex] = {
        ...webhooks[webhookIndex],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      await fs.writeFile(this.webhooksPath, JSON.stringify(webhooks, null, 2));
      return true;
    } catch (error) {
      logger.error('Error updating Discord webhook:', error);
      return false;
    }
  }

  async deleteWebhook(id) {
    try {
      const webhooks = await this.getWebhooks();
      const filteredWebhooks = webhooks.filter(w => w.id !== id);
      
      if (filteredWebhooks.length === webhooks.length) {
        return false; // Webhook not found
      }
      
      await fs.writeFile(this.webhooksPath, JSON.stringify(filteredWebhooks, null, 2));
      return true;
    } catch (error) {
      logger.error('Error deleting Discord webhook:', error);
      return false;
    }
  }

  async sendNotification(notification) {
    try {
      const webhooks = await this.getWebhooks();
      const enabledWebhooks = webhooks.filter(w => w.enabled);
      
      if (enabledWebhooks.length === 0) {
        logger.warn('No enabled Discord webhooks found');
        return false;
      }
      
      const embed = this.createEmbed(notification);
      const payload = {
        embeds: [embed]
      };
      
      const results = await Promise.allSettled(
        enabledWebhooks.map(webhook => this.sendWebhook(webhook.url, payload))
      );
      
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
      const failureCount = results.length - successCount;
      
      if (failureCount > 0) {
        logger.warn(`Discord notification: ${successCount} successful, ${failureCount} failed`);
      }
      
      return successCount > 0;
    } catch (error) {
      logger.error('Error sending Discord notification:', error);
      return false;
    }
  }

  createEmbed(notification) {
    const { type, serverName, message, timestamp, data } = notification;
    
    // Define colors and icons for different notification types
    const typeConfig = {
      server_status: { color: 0x00ff00, icon: '🟢' },
      player_join: { color: 0x00ff00, icon: '👋' },
      player_leave: { color: 0xffa500, icon: '👋' },
      server_start: { color: 0x00ff00, icon: '🚀' },
      server_stop: { color: 0xff0000, icon: '🛑' },
      error: { color: 0xff0000, icon: '❌' }
    };
    
    const config = typeConfig[type] || { color: 0x0099ff, icon: 'ℹ️' };
    
    const embed = {
      title: `${config.icon} ${this.formatTitle(type)}`,
      description: message,
      color: config.color,
      timestamp: timestamp.toISOString(),
      fields: []
    };
    
    // Add server name field
    if (serverName) {
      embed.fields.push({
        name: 'Server',
        value: serverName,
        inline: true
      });
    }
    
    // Add data fields based on notification type
    if (data) {
      if (data.status) {
        embed.fields.push({
          name: 'Status',
          value: data.status,
          inline: true
        });
      }
      
      if (data.players !== undefined && data.maxPlayers !== undefined) {
        embed.fields.push({
          name: 'Players',
          value: `${data.players}/${data.maxPlayers}`,
          inline: true
        });
      }
      
      if (data.map) {
        embed.fields.push({
          name: 'Map',
          value: data.map,
          inline: true
        });
      }
      
      if (data.playerName) {
        embed.fields.push({
          name: 'Player',
          value: data.playerName,
          inline: true
        });
      }
      
      if (data.error) {
        embed.fields.push({
          name: 'Error Details',
          value: data.error,
          inline: false
        });
      }
    }
    
    return embed;
  }

  formatTitle(type) {
    const titles = {
      server_status: 'Server Status Update',
      player_join: 'Player Joined',
      player_leave: 'Player Left',
      server_start: 'Server Started',
      server_stop: 'Server Stopped',
      error: 'Error Occurred'
    };
    
    return titles[type] || 'Notification';
  }

  async sendWebhook(url, payload) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return true;
    } catch (error) {
      logger.error('Error sending webhook:', error);
      return false;
    }
  }

  async restartBot() {
    try {
      const config = await this.getBotConfig();
      
      if (!config.enabled || !config.token) {
        logger.info('Discord bot not enabled or no token provided');
        return false;
      }
      
      // In a real implementation, you would restart the Discord bot process here
      // For now, we'll just log that it should be restarted
      logger.info('Discord bot should be restarted with new configuration');
      
      return true;
    } catch (error) {
      logger.error('Error restarting Discord bot:', error);
      return false;
    }
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Method to send server status updates
  async sendServerStatusUpdate(serverName, status, players = 0, maxPlayers = 70, map = 'Unknown') {
    const notification = {
      type: 'server_status',
      serverName,
      message: `Server ${status === 'online' ? 'is now online' : 'has gone offline'}`,
      timestamp: new Date(),
      data: {
        status,
        players,
        maxPlayers,
        map
      }
    };
    
    return await this.sendNotification(notification);
  }

  // Method to send player join/leave notifications
  async sendPlayerNotification(serverName, playerName, action) {
    const notification = {
      type: action === 'join' ? 'player_join' : 'player_leave',
      serverName,
      message: `Player ${playerName} has ${action === 'join' ? 'joined' : 'left'} the server`,
      timestamp: new Date(),
      data: {
        playerName
      }
    };
    
    return await this.sendNotification(notification);
  }

  // Method to send server start/stop notifications
  async sendServerActionNotification(serverName, action) {
    const notification = {
      type: action === 'start' ? 'server_start' : 'server_stop',
      serverName,
      message: `Server has been ${action === 'start' ? 'started' : 'stopped'}`,
      timestamp: new Date(),
      data: {}
    };
    
    return await this.sendNotification(notification);
  }

  // Method to send error notifications
  async sendErrorNotification(serverName, error, context = '') {
    const notification = {
      type: 'error',
      serverName,
      message: `An error occurred${context ? ` in ${context}` : ''}`,
      timestamp: new Date(),
      data: {
        error: error.message || error.toString()
      }
    };
    
    return await this.sendNotification(notification);
  }
}

export default DiscordService; 
