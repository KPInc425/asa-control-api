import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from '../utils/logger.js';
import { authenticate } from '../middleware/auth.js';
import DiscordService from '../services/discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function discordRoutes(fastify) {
  const discordService = new DiscordService();

  // Get Discord webhooks
  fastify.get('/api/discord/webhooks', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const webhooks = await discordService.getWebhooks();
      return {
        success: true,
        webhooks
      };
    } catch (error) {
      logger.error('Error getting Discord webhooks:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get Discord webhooks'
      });
    }
  });

  // Add Discord webhook
  fastify.post('/api/discord/webhooks', {
    preHandler: authenticate,
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          url: { type: 'string', format: 'uri' },
          channel: { type: 'string' },
          enabled: { type: 'boolean' }
        },
        required: ['name', 'url', 'channel']
      }
    }
  }, async (request, reply) => {
    try {
      const { name, url, channel, enabled = true } = request.body;
      
      // Validate webhook URL
      if (!url.startsWith('https://discord.com/api/webhooks/')) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid Discord webhook URL'
        });
      }
      
      const webhook = await discordService.addWebhook({
        name,
        url,
        channel,
        enabled
      });
      
      if (webhook) {
        return {
          success: true,
          webhook
        };
      } else {
        return reply.status(500).send({
          success: false,
          message: 'Failed to add webhook'
        });
      }
    } catch (error) {
      logger.error('Error adding Discord webhook:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to add Discord webhook'
      });
    }
  });

  // Update Discord webhook
  fastify.put('/api/discord/webhooks/:id', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          url: { type: 'string', format: 'uri' },
          channel: { type: 'string' },
          enabled: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const updates = request.body;
      
      const success = await discordService.updateWebhook(id, updates);
      
      if (success) {
        return {
          success: true,
          message: 'Webhook updated successfully'
        };
      } else {
        return reply.status(404).send({
          success: false,
          message: 'Webhook not found'
        });
      }
    } catch (error) {
      logger.error('Error updating Discord webhook:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update Discord webhook'
      });
    }
  });

  // Delete Discord webhook
  fastify.delete('/api/discord/webhooks/:id', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      
      const success = await discordService.deleteWebhook(id);
      
      if (success) {
        return {
          success: true,
          message: 'Webhook deleted successfully'
        };
      } else {
        return reply.status(404).send({
          success: false,
          message: 'Webhook not found'
        });
      }
    } catch (error) {
      logger.error('Error deleting Discord webhook:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to delete Discord webhook'
      });
    }
  });

  // Get Discord bot configuration
  fastify.get('/api/discord/bot/config', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const config = await discordService.getBotConfig();
      return {
        success: true,
        config
      };
    } catch (error) {
      logger.error('Error getting Discord bot config:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get Discord bot configuration'
      });
    }
  });

  // Update Discord bot configuration
  fastify.put('/api/discord/bot/config', {
    preHandler: authenticate,
    schema: {
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          token: { type: 'string' },
          prefix: { type: 'string' },
          allowedChannels: { 
            type: 'array',
            items: { type: 'string' }
          },
          allowedRoles: { 
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const config = request.body;
      
      // Validate bot token if provided
      if (config.token && !config.token.match(/^[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27}$/)) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid Discord bot token format'
        });
      }
      
      const success = await discordService.updateBotConfig(config);
      
      if (success) {
        return {
          success: true,
          message: 'Bot configuration updated successfully'
        };
      } else {
        return reply.status(500).send({
          success: false,
          message: 'Failed to update bot configuration'
        });
      }
    } catch (error) {
      logger.error('Error updating Discord bot config:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update Discord bot configuration'
      });
    }
  });

  // Send Discord notification
  fastify.post('/api/discord/notify', {
    preHandler: authenticate,
    schema: {
      body: {
        type: 'object',
        properties: {
          type: { 
            type: 'string',
            enum: ['server_status', 'player_join', 'player_leave', 'server_start', 'server_stop', 'error']
          },
          serverName: { type: 'string' },
          message: { type: 'string' },
          data: { type: 'object' }
        },
        required: ['type', 'serverName', 'message']
      }
    }
  }, async (request, reply) => {
    try {
      const { type, serverName, message, data } = request.body;
      
      const notification = {
        type,
        serverName,
        message,
        timestamp: new Date(),
        data
      };
      
      const success = await discordService.sendNotification(notification);
      
      if (success) {
        return {
          success: true,
          message: 'Notification sent successfully'
        };
      } else {
        return reply.status(500).send({
          success: false,
          message: 'Failed to send notification'
        });
      }
    } catch (error) {
      logger.error('Error sending Discord notification:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to send Discord notification'
      });
    }
  });

  // Test Discord webhook
  fastify.post('/api/discord/test', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const testNotification = {
        type: 'server_status',
        serverName: 'Test Server',
        message: '🧪 This is a test notification from ASA Management Suite',
        timestamp: new Date(),
        data: {
          status: 'online',
          players: 5,
          maxPlayers: 70,
          map: 'The Island'
        }
      };
      
      const success = await discordService.sendNotification(testNotification);
      
      if (success) {
        return {
          success: true,
          message: 'Test notification sent successfully'
        };
      } else {
        return reply.status(500).send({
          success: false,
          message: 'Failed to send test notification'
        });
      }
    } catch (error) {
      logger.error('Error sending test Discord notification:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to send test notification'
      });
    }
  });

  // Get Discord bot commands
  fastify.get('/api/discord/commands', {
    preHandler: authenticate
  }, async (request, reply) => {
    try {
      const commands = [
        {
          command: 'servers',
          description: 'List all servers and their status',
          example: '!servers'
        },
        {
          command: 'start [server]',
          description: 'Start a specific server',
          example: '!start TheIsland'
        },
        {
          command: 'stop [server]',
          description: 'Stop a specific server',
          example: '!stop TheIsland'
        },
        {
          command: 'restart [server]',
          description: 'Restart a specific server',
          example: '!restart TheIsland'
        },
        {
          command: 'status [server]',
          description: 'Get detailed status of a server',
          example: '!status TheIsland'
        },
        {
          command: 'players [server]',
          description: 'Show current players on a server',
          example: '!players TheIsland'
        },
        {
          command: 'help',
          description: 'Show all available commands',
          example: '!help'
        }
      ];
      
      return {
        success: true,
        commands
      };
    } catch (error) {
      logger.error('Error getting Discord commands:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get Discord commands'
      });
    }
  });
} 
