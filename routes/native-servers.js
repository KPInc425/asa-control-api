import { NativeServerManager } from '../services/server-manager.js';
import { requireRead, requireWrite, requirePermission } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { getServerConfig, deleteServerConfig } from '../services/database.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import { getServerLiveStats } from '../services/asa-query.js';

// Create native server manager instance (no Docker service)
const serverManager = new NativeServerManager();

/**
 * Native server routes for ASA Windows server management
 */
export default async function nativeServerRoutes(fastify, options) {
  // Get all native server configurations
  fastify.get('/api/native-servers', {
    preHandler: [requireRead],
    // schema removed to allow all properties
  }, async (request, reply) => {
    try {
      const servers = await serverManager.listServers();
      return { success: true, servers };
    } catch (error) {
      fastify.log.error('Error listing native servers:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Add or update native server configuration
  fastify.post('/api/native-servers', {
    preHandler: [requireWrite],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'config'],
        properties: {
          name: { type: 'string' },
          config: {
            type: 'object',
            properties: {
              serverPath: { type: 'string' },
              mapName: { type: 'string' },
              gamePort: { type: 'number' },
              queryPort: { type: 'number' },
              rconPort: { type: 'number' },
              serverName: { type: 'string' },
              maxPlayers: { type: 'number' },
              serverPassword: { type: 'string' },
              adminPassword: { type: 'string' },
              mods: { type: 'array', items: { type: 'string' } },
              additionalArgs: { type: 'string' },
              disableBattleEye: { type: 'boolean' },
              customDynamicConfigUrl: { type: 'string' }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name, config } = request.body;
      
      // Validate required fields
      if (!config.serverPath) {
        return reply.status(400).send({
          success: false,
          message: 'Server path is required'
        });
      }

      // Add server configuration
      await serverManager.addServerConfig(name, config);
      
      logger.info(`Native server configuration added/updated: ${name}`);
      return {
        success: true,
        message: `Server configuration for ${name} saved successfully`
      };
    } catch (error) {
      fastify.log.error('Error adding native server configuration:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get native server configuration
  fastify.get('/api/native-servers/:name/config', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            config: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      
      // Get server configuration from database
      const serverConfig = getServerConfig(name);
      
      if (!serverConfig) {
        return reply.status(404).send({
          success: false,
          message: `Server configuration not found: ${name}`
        });
      }
      
      const config = JSON.parse(serverConfig.config_data);
      
      // Ensure RCON password is set to admin password (ARK: Survival Ascended requirement)
      if (config.adminPassword && (!config.rconPassword || config.rconPassword !== config.adminPassword)) {
        config.rconPassword = config.adminPassword;
        logger.info(`Updated RCON password to match admin password for server ${name}`);
      }
      
      return {
        success: true,
        config: config
      };
    } catch (error) {
      fastify.log.error(`Error getting native server configuration for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Delete native server configuration
  fastify.delete('/api/native-servers/:name', {
    preHandler: [requireWrite],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      
      // Stop server if running
      if (await serverManager.isRunning(name)) {
        await serverManager.stop(name);
      }
      
      // Remove from database
      deleteServerConfig(name);
      
      logger.info(`Native server configuration deleted: ${name}`);
      return {
        success: true,
        message: `Server configuration for ${name} deleted successfully`
      };
    } catch (error) {
      fastify.log.error(`Error deleting native server configuration for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get native server stats
  fastify.get('/api/native-servers/:name/stats', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            stats: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const stats = await serverManager.getStats(name);
      return { success: true, stats };
    } catch (error) {
      fastify.log.error(`Error getting native server stats for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Start native server or cluster
  fastify.post('/api/native-servers/:name/start', {
    preHandler: [requireWrite],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      
      // Check if this is a cluster summary card
      const servers = await serverManager.listServers();
      const cluster = servers.find(s => s.type === 'cluster' && s.name === name);
      
      if (cluster) {
        // For clusters, start in background and return immediately
        serverManager.startCluster(name).catch(error => {
          fastify.log.error(`Background cluster start failed for ${name}:`, error);
        });
        
        return {
          success: true,
          message: `Cluster ${name} start initiated. Check server status for progress.`
        };
      } else {
        // For individual servers, start in background and return immediately
        serverManager.start(name).catch(error => {
          fastify.log.error(`Background server start failed for ${name}:`, error);
        });
        
        return {
          success: true,
          message: `Server ${name} start initiated. Check server status for progress.`
        };
      }
    } catch (error) {
      fastify.log.error(`Error initiating native server start for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Stop native server or cluster
  fastify.post('/api/native-servers/:name/stop', {
    preHandler: [requireWrite],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const servers = await serverManager.listServers();
      const cluster = servers.find(s => s.type === 'cluster' && s.name === name);
      if (cluster) {
        const result = await serverManager.stopCluster(name);
        return result;
      }
      const result = await serverManager.stop(name);
      return result;
    } catch (error) {
      fastify.log.error(`Error stopping native server ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Restart native server or cluster
  fastify.post('/api/native-servers/:name/restart', {
    preHandler: [requireWrite],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const servers = await serverManager.listServers();
      const cluster = servers.find(s => s.type === 'cluster' && s.name === name);
      if (cluster) {
        const result = await serverManager.restartCluster(name);
        return result;
      }
      const result = await serverManager.restart(name);
      return result;
    } catch (error) {
      fastify.log.error(`Error restarting native server ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get cluster server info
  fastify.get('/api/native-servers/:name/cluster-info', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            server: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const result = await serverManager.getClusterServerInfo(name);
      return result;
    } catch (error) {
      fastify.log.error(`Error getting cluster server info for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get live server details with player count and game time (MOVED UP)
  fastify.get('/api/native-servers/:name/live-details', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            details: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    console.log('[live-details] handler called for', request.params);
    request.log.info(`[live-details] handler called for ${JSON.stringify(request.params)}`);
    try {
      const { name } = request.params;
      request.log.info(`[live-details] Handling request for ${name}`);
      // Always try asa-query first
      const asaStats = await getServerLiveStats(name);
      if (asaStats) {
        request.log.info(`[live-details] asa-query stats found for ${name}:`, asaStats);
        // If asa-query says server is online (players/maxPlayers > 0 or started), treat as online
        const isOnline = asaStats.players > 0 || asaStats.started !== 'N/A';
        if (isOnline) {
          const details = {
            name,
            status: 'online',
            players: asaStats.players ?? 0,
            maxPlayers: asaStats.maxPlayers ?? 0,
            day: asaStats.day ?? 0,
            gameTime: '00:00', // asa-query does not provide time
            version: asaStats.version ?? 'N/A',
            map: asaStats.map ?? 'N/A',
            uptime: 0,
            cpu: 0,
            memory: 0,
            lastUpdated: asaStats.lastUpdated || new Date().toISOString()
          };
          console.log('[live-details] Returning asa-query online details:', details);
          request.log.info(`[live-details] Returning asa-query online details for ${name}:`, details);
          return { success: true, details };
        } else {
          // Server is offline per asa-query, return asa-query stats as offline snapshot
          const details = {
            name,
            status: 'offline',
            players: asaStats.players ?? 0,
            maxPlayers: asaStats.maxPlayers ?? 0,
            day: asaStats.day ?? 0,
            gameTime: '00:00',
            version: asaStats.version ?? 'N/A',
            map: asaStats.map ?? 'N/A',
            uptime: 0,
            cpu: 0,
            memory: 0,
            lastUpdated: asaStats.lastUpdated || new Date().toISOString()
          };
          console.log('[live-details] Returning asa-query offline details:', details);
          request.log.info(`[live-details] Returning asa-query offline details for ${name}:`, details);
          return { success: true, details };
        }
      }
      // If asa-query fails, fallback to RCON/local stats if server is running
      let isRunning = false;
      let stats = {};
      try {
        isRunning = await serverManager.isRunning(name);
      } catch (err) {
        request.log.warn(`isRunning check failed for ${name}:`, err);
      }
      if (isRunning) {
        try {
          stats = await serverManager.getStats(name) || {};
        } catch (err) {
          request.log.warn(`getStats failed for ${name}:`, err);
          stats = {};
        }
        // Try to get player count and game info via RCON
        let playerCount = 0;
        let maxPlayers = 70;
        let day = 0;
        let gameTime = '00:00';
        let version = 'N/A';
        let map = 'N/A';
        try {
          const rconService = (await import('../services/rcon.js')).default;
          const playerList = await rconService.getPlayerList(name);
          playerCount = Array.isArray(playerList) ? playerList.length : 0;
          const serverInfo = await rconService.getServerInfo(name);
          if (serverInfo && serverInfo.Day) {
            day = parseInt(serverInfo.Day) || 0;
          }
          if (day > 0) {
            const hours = Math.floor((day * 24) % 24);
            const minutes = Math.floor((day * 24 * 60) % 60);
            gameTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
          }
        } catch (rconError) {
          request.log.warn(`RCON failed for ${name}, using fallback data:`, rconError.message);
        }
        const details = {
          name,
          status: 'online',
          players: playerCount,
          maxPlayers,
          day,
          gameTime,
          version,
          map,
          uptime: stats.uptime || 0,
          cpu: stats.cpu || 0,
          memory: stats.memory || 0,
          lastUpdated: new Date().toISOString()
        };
        console.log('[live-details] Returning RCON/local details:', details);
        request.log.info(`[live-details] Returning RCON/local details for ${name}:`, details);
        return { success: true, details };
      } else {
        // Server is offline and no asa-query stats, return default
        const details = {
          name,
          status: 'offline',
          players: 0,
          maxPlayers: 0,
          day: 0,
          gameTime: '00:00',
          version: 'N/A',
          map: 'N/A',
          uptime: 0,
          cpu: 0,
          memory: 0,
          lastUpdated: new Date().toISOString()
        };
        console.log('[live-details] Returning default offline details:', details);
        request.log.info(`[live-details] Returning default offline details for ${name}:`, details);
        return { success: true, details };
      }
    } catch (error) {
      console.error('[live-details] handler error:', error);
      request.log.error(`[live-details] Error getting live details for ${request.params.name}:`, error);
      return reply.status(200).send({
        success: true,
        details: {
          name: request.params.name,
          status: 'unknown',
          players: 0,
          maxPlayers: 0,
          day: 0,
          gameTime: '00:00',
          version: 'N/A',
          map: 'N/A',
          uptime: 0,
          cpu: 0,
          memory: 0,
          lastUpdated: new Date().toISOString()
        }
      });
    }
  });

  // Get cluster server start.bat
  fastify.get('/api/native-servers/:name/start-bat', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            content: { type: 'string' },
            path: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const result = await serverManager.getClusterServerStartBat(name);
      return result;
    } catch (error) {
      fastify.log.error(`Error getting start.bat for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // List log files for a server
  fastify.get('/api/native-servers/:name/log-files', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            logFiles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  path: { type: 'string' },
                  size: { type: 'number' },
                  modified: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const logFiles = await serverManager.listLogFiles(name);
      return {
        success: true,
        logFiles
      };
    } catch (error) {
      fastify.log.error(`Error listing log files for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Update cluster server start.bat
  fastify.put('/api/native-servers/:name/start-bat', {
    preHandler: [requireWrite],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const { content } = request.body;
      const result = await serverManager.updateClusterServerStartBat(name, content);
      return result;
    } catch (error) {
      fastify.log.error(`Error updating start.bat for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Regenerate start.bat for a server with latest mods and config
  fastify.post('/api/native-servers/:name/regenerate-start-bat', {
    preHandler: [requireWrite],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      
      // Check if this is a native server manager
      if (serverManager.regenerateServerStartScript) {
        await serverManager.regenerateServerStartScript(name);
        return {
          success: true,
          message: `Start.bat regenerated for server ${name} with latest mods and configuration`
        };
      } else {
        return reply.status(400).send({
          success: false,
          message: 'Start.bat regeneration is only available for native servers'
        });
      }
    } catch (error) {
      fastify.log.error(`Error regenerating start.bat for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Check if native server is running
  fastify.get('/api/native-servers/:name/running', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            running: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const running = await serverManager.isRunning(name);
      return { success: true, running };
    } catch (error) {
      fastify.log.error(`Error checking running status for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Send RCON command to native server
  fastify.post('/api/native-servers/:name/rcon', {
    preHandler: [requireWrite],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['command'],
        properties: {
          command: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            response: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const { command } = request.body;
      
      logger.info(`RCON command request for server ${name}: ${command}`);
      
      // Get server info to find RCON port
      const servers = await serverManager.listServers();
      const server = servers.find(s => s.name === name);
      
      if (!server) {
        logger.warn(`RCON command failed: Server ${name} not found`);
        return reply.status(404).send({
          success: false,
          message: `Server ${name} not found`
        });
      }

      // Debug: Log the full server configuration
      logger.info(`[RCON Debug] Full server config for ${name}:`, {
        name: server.name,
        rconPort: server.rconPort,
        adminPassword: server.adminPassword,
        config: server.config,
        isClusterServer: server.isClusterServer,
        clusterName: server.clusterName
      });

      // Check if server is running
      const isRunning = await serverManager.isRunning(name);
      if (!isRunning) {
        logger.warn(`RCON command failed: Server ${name} is not running`);
        return reply.status(400).send({
          success: false,
          message: `Server ${name} is not running. Cannot send RCON commands to a stopped server.`
        });
      }

      // Check for RCON configuration
      if (!server.rconPort) {
        logger.error(`RCON command failed: No RCON port configured for server ${name}`);
        return reply.status(400).send({
          success: false,
          message: `No RCON port configured for server ${name}. Please check server configuration.`
        });
      }

      logger.info(`Sending RCON command to ${name} on port ${server.rconPort}: ${command}`);

      // Use the RCON service to send command
      const rconService = (await import('../services/rcon.js')).default;
      const config = await import('../config/index.js');
      
      // Ensure we have valid host and port
      const rconHost = '127.0.0.1';
      const rconPort = server.rconPort || 32330;
      // Use server-specific admin password or fall back to default admin password
      // In ARK: Survival Ascended, RCON password is the same as admin password
      const rconPassword = server.adminPassword || server.config?.adminPassword || 'admin123';
      
      logger.info(`[RCON Debug] Server config for ${name}:`, {
        serverAdminPassword: server.adminPassword,
        configAdminPassword: server.config?.adminPassword,
        defaultAdminPassword: 'admin123',
        finalPassword: rconPassword,
        finalPasswordLength: rconPassword ? rconPassword.length : 0,
        serverPath: server.serverPath,
        rconPort: rconPort,
        isClusterServer: server.isClusterServer,
        clusterName: server.clusterName
      });
      
      // Create options object for RCON connection
      const rconOptions = {
        host: rconHost,
        port: rconPort,
        password: rconPassword
      };
      
      logger.info(`Sending RCON command to ${name} on ${rconHost}:${rconPort}: ${command}`);
      const response = await rconService.sendCommand(rconOptions, command);
      
      logger.info(`RCON command successful for ${name}: ${command}`);
      return {
        success: true,
        message: 'Command sent successfully',
        response: response
      };
    } catch (error) {
      logger.error(`RCON command error for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get server configuration debug info
  fastify.get('/api/native-servers/:name/debug', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            debug: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      
      // Get server info to find RCON port
      const servers = await serverManager.listServers();
      const server = servers.find(s => s.name === name);
      
      if (!server) {
        return reply.status(404).send({
          success: false,
          message: `Server ${name} not found`
        });
      }

      // Check if server is running
      const isRunning = await serverManager.isRunning(name);
      
      // Get database config for comparison
      const dbConfig = serverManager.getServerConfigFromDatabase(name);
      
      const debugInfo = {
        serverName: name,
        isRunning,
        serverConfig: {
          adminPassword: server.adminPassword,
          configAdminPassword: server.config?.adminPassword,
          rconPort: server.rconPort,
          gamePort: server.gamePort,
          serverPath: server.serverPath,
          isClusterServer: server.isClusterServer,
          clusterName: server.clusterName
        },
        databaseConfig: dbConfig,
        rconConnection: {
          host: '127.0.0.1',
          port: server.rconPort || 32330,
          password: server.adminPassword || server.config?.adminPassword || 'admin123'
        },
        processInfo: null
      };

      // Try to get process info if running
      if (isRunning) {
        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);
          
          // Get process info
          const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ArkAscendedServer.exe" /FO CSV /NH`);
          debugInfo.processInfo = stdout;
        } catch (error) {
          debugInfo.processInfo = `Error getting process info: ${error.message}`;
        }
      }

      return {
        success: true,
        debug: debugInfo
      };
    } catch (error) {
      logger.error(`Error getting debug info for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Debug and fix RCON password issues
  fastify.post('/api/native-servers/:name/fix-rcon', {
    preHandler: [requireWrite],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            debug: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      
      logger.info(`Fixing RCON issues for server: ${name}`);
      
      // Get server info
      const servers = await serverManager.listServers();
      const server = servers.find(s => s.name === name);
      
      if (!server) {
        return reply.status(404).send({
          success: false,
          message: `Server ${name} not found`
        });
      }

      // Get database config for comparison
      const dbConfig = serverManager.getServerConfigFromDatabase(name);
      
      const debugInfo = {
        serverName: name,
        serverConfig: {
          adminPassword: server.adminPassword,
          configAdminPassword: server.config?.adminPassword,
          rconPort: server.rconPort,
          gamePort: server.gamePort,
          serverPath: server.serverPath,
          isClusterServer: server.isClusterServer,
          clusterName: server.clusterName
        },
        databaseConfig: dbConfig
      };

      // Steps to fix RCON:
      // 1. Get the actual server configuration from database
      // 2. Create start script directly from database config
      // 3. Update the database config if needed
      // 4. Provide restart instructions

      logger.info(`Step 1: Getting server configuration from database for ${name}`);
      
      // Get the actual server configuration from database
      let dbServerConfig = getServerConfig(name);
      let serverConfig;
      
      if (!dbServerConfig) {
        logger.warn(`Server ${name} not found in database, creating from cluster config`);
        
        // Server not in database, create it from the cluster/server info
        serverConfig = {
          name: name,
          map: server.map || 'TheIsland_WP',
          gamePort: server.gamePort || 7777,
          queryPort: server.queryPort || 27015,
          rconPort: server.rconPort || 32330,
          maxPlayers: server.maxPlayers || 70,
          adminPassword: server.adminPassword || 'King5252',
          serverPassword: server.serverPassword || '',
          clusterId: server.clusterName || '',
          clusterPassword: '',
          customDynamicConfigUrl: server.config?.customDynamicConfigUrl || '',
          disableBattleEye: server.config?.disableBattleEye || false,
          mods: server.config?.mods || [],
          serverPath: server.serverPath || '',
          created: new Date().toISOString()
        };
        
        // Save to database
        await serverManager.addServerConfig(name, serverConfig);
        logger.info(`Created database entry for server ${name}`);
        
      } else {
        // Server exists in database, parse the config
        try {
          serverConfig = JSON.parse(dbServerConfig.config_data);
        } catch (parseError) {
          throw new Error(`Invalid server configuration in database for ${name}: ${parseError.message}`);
        }
      }
      
      logger.info(`Step 2: Creating start script directly from database config for ${name}`);
      
      // Ensure the admin password is set correctly
      const adminPassword = dbConfig?.adminPassword || serverConfig.adminPassword || 'King5252';
      
      // Update the server config with the correct password
      const updatedServerConfig = {
        ...serverConfig,
        adminPassword: adminPassword,
        rconPassword: adminPassword, // RCON password should always match admin password
        customDynamicConfigUrl: dbConfig?.customDynamicConfigUrl || serverConfig.customDynamicConfigUrl || ''
      };
      
      // Determine the server path
      let serverPath;
      if (server.isClusterServer && server.clusterName) {
        // Cluster server
        const clustersPath = process.env.NATIVE_CLUSTERS_PATH || join(process.env.NATIVE_BASE_PATH || 'F:\\ARK', 'clusters');
        serverPath = join(clustersPath, server.clusterName, name);
        logger.info(`Creating start script for cluster server ${name} at: ${serverPath}`);
      } else {
        // Standalone server
        serverPath = serverConfig.serverPath || join(process.env.NATIVE_BASE_PATH || 'F:\\ARK', 'servers', name);
        logger.info(`Creating start script for standalone server ${name} at: ${serverPath}`);
      }
      
      try {
        const { ServerProvisioner } = await import('../services/server-provisioner.js');
        const provisioner = new ServerProvisioner();
        
        // Regenerate both config files and start script
        if (server.isClusterServer && server.clusterName) {
          // Regenerate config files in cluster
          await provisioner.createServerConfigInCluster(server.clusterName, serverPath, updatedServerConfig);
          // Create start script in cluster (without password args)
          await provisioner.createStartScriptInCluster(server.clusterName, serverPath, updatedServerConfig);
        } else {
          // Regenerate config files for standalone server
          await provisioner.createServerConfig(serverPath, updatedServerConfig);
          // Create start script for standalone server (without password args)
          await provisioner.createStartScript(serverPath, updatedServerConfig);
        }
        
        // Update the database with the corrected configuration
        await serverManager.addServerConfig(name, updatedServerConfig);
        
        logger.info(`Successfully regenerated config files and start script for ${name} with password: ${adminPassword.substring(0, 3)}***`);
        
      } catch (createError) {
        logger.error(`Failed to regenerate config files and start script for ${name}: ${createError.message}`);
        throw new Error(`Failed to regenerate config files and start script: ${createError.message}`);
      }
      
      // Step 3: Log success and provide instructions
      logger.info(`Step 3: RCON fix completed for ${name}. Database updated with correct password.`);
      
      return {
        success: true,
        message: `RCON fix completed for ${name}. Please restart the server to apply the new password.`,
        debug: {
          serverName: name,
          databasePassword: dbConfig?.adminPassword,
          serverPassword: server.adminPassword,
          isClusterServer: server.isClusterServer,
          clusterName: server.clusterName,
          serverPath: serverPath,
          passwordUpdated: true
        }
      };


    } catch (error) {
      logger.error(`Error fixing RCON for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Regenerate start script for a server
  fastify.post('/api/native-servers/:name/regenerate-start-script', {
    preHandler: [requireWrite],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      
      logger.info(`Regenerating start script for server: ${name}`);
      
      // Regenerate the start script using the server manager
      await serverManager.regenerateServerStartScript(name);
      
      return {
        success: true,
        message: `Start script regenerated for ${name}`
      };
    } catch (error) {
      logger.error(`Error regenerating start script for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Debug cluster configuration
  fastify.get('/api/native-servers/debug-clusters', {
    preHandler: [requireRead],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            debug: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Enhanced debug info with environment variables
      const debugInfo = {
        environment: {
          NATIVE_BASE_PATH: process.env.NATIVE_BASE_PATH,
          NATIVE_CLUSTERS_PATH: process.env.NATIVE_CLUSTERS_PATH,
          NATIVE_SERVERS_PATH: process.env.NATIVE_SERVERS_PATH,
          SERVER_MODE: process.env.SERVER_MODE,
          NODE_ENV: process.env.NODE_ENV
        },
        calculatedPaths: {
          clustersPath: process.env.NATIVE_CLUSTERS_PATH || join(process.env.NATIVE_BASE_PATH || 'F:\\ARK', 'clusters'),
          basePath: process.env.NATIVE_BASE_PATH || 'F:\\ARK',
          serversPath: process.env.NATIVE_SERVERS_PATH || join(process.env.NATIVE_BASE_PATH || 'F:\\ARK', 'servers')
        },
        clustersPath: process.env.NATIVE_CLUSTERS_PATH || join(process.env.NATIVE_BASE_PATH || 'F:\\ARK', 'clusters'),
        clustersPathExists: false,
        clusterDirs: [],
        clusterConfigs: {},
        commonPaths: []
      };
      
      // Check if common ARK paths exist
      const commonPaths = [
        'F:\\ARK',
        'G:\\ARK', 
        'C:\\ARK',
        'D:\\ARK',
        'E:\\ARK',
        'F:\\ASA',
        'G:\\ASA',
        'C:\\ASA',
        'D:\\ASA',
        'E:\\ASA'
      ];
      
      for (const testPath of commonPaths) {
        try {
          const exists = await fs.access(testPath).then(() => true).catch(() => false);
          if (exists) {
            debugInfo.commonPaths.push({
              path: testPath,
              exists: true
            });
            
            // Check if clusters subfolder exists
            const clustersSubPath = join(testPath, 'clusters');
            const clustersExists = await fs.access(clustersSubPath).then(() => true).catch(() => false);
            debugInfo.commonPaths.push({
              path: clustersSubPath,
              exists: clustersExists,
              isClustersFolder: true
            });
          }
        } catch (error) {
          debugInfo.commonPaths.push({
            path: testPath,
            exists: false,
            error: error.message
          });
        }
      }
      
      try {
        const exists = await fs.access(debugInfo.clustersPath).then(() => true).catch(() => false);
        debugInfo.clustersPathExists = exists;
        
        if (exists) {
          const clusterDirs = await fs.readdir(debugInfo.clustersPath);
          debugInfo.clusterDirs = clusterDirs;
          
          for (const clusterDir of clusterDirs) {
            try {
              const clusterConfigPath = join(debugInfo.clustersPath, clusterDir, 'cluster.json');
              const clusterConfigContent = await fs.readFile(clusterConfigPath, 'utf8');
              const clusterConfig = JSON.parse(clusterConfigContent);
              
              debugInfo.clusterConfigs[clusterDir] = {
                exists: true,
                serverCount: clusterConfig.servers ? clusterConfig.servers.length : 0,
                serverNames: clusterConfig.servers ? clusterConfig.servers.map(s => s.name) : [],
                configPreview: JSON.stringify(clusterConfig, null, 2).substring(0, 1000) + '...'
              };
            } catch (error) {
              debugInfo.clusterConfigs[clusterDir] = {
                exists: false,
                error: error.message
              };
            }
          }
        }
      } catch (error) {
        debugInfo.error = error.message;
      }

      return {
        success: true,
        debug: debugInfo
      };
    } catch (error) {
      logger.error(`Error debugging clusters:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Test endpoint to check if debug is being called
  fastify.get('/api/native-servers/:name/debug-test', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    logger.info(`[DEBUG-TEST] Test endpoint called for ${request.params.name}`);
    return {
      success: true,
      debug: {
        message: "Test endpoint working!",
        serverName: request.params.name,
        timestamp: new Date().toISOString()
      }
    };
  });

  // Debug start script and RCON configuration
  fastify.get('/api/native-servers/:name/debug-rcon', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            debug: { 
              type: 'object',
              additionalProperties: true,
              properties: {
                serverName: { type: 'string' },
                environment: { type: 'object', additionalProperties: true },
                serverInfo: { type: 'object', additionalProperties: true },
                databaseConfig: { type: 'object', additionalProperties: true },
                startBatInfo: { type: 'object', additionalProperties: true },
                passwordComparison: { type: 'object', additionalProperties: true }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    logger.info(`[DEBUG-RCON] Endpoint called with params:`, request.params);
    logger.info(`[DEBUG-RCON] Request URL: ${request.url}`);
    
    try {
      const { name } = request.params;
      
      logger.info(`[DEBUG-RCON] Processing debug request for server: ${name}`);
      
      // Get server info
      logger.info(`Debug RCON: Starting debug for server: ${name}`);
      logger.info(`Debug RCON: Server manager base path: ${serverManager.basePath}`);
      logger.info(`Debug RCON: Environment NATIVE_BASE_PATH: ${process.env.NATIVE_BASE_PATH}`);
      
      const servers = await serverManager.listServers();
      logger.info(`Debug RCON: Found ${servers.length} servers in list: ${servers.map(s => s.name).join(', ')}`);
      
      const server = servers.find(s => s.name === name);
      
      if (!server) {
        logger.warn(`Server ${name} not found in server list. Available servers: ${servers.map(s => s.name).join(', ')}`);
        return reply.status(404).send({
          success: false,
          message: `Server ${name} not found in server list. Available servers: ${servers.map(s => s.name).join(', ')}`
        });
      }
      
      logger.info(`Debug RCON: Found server ${name} with type ${server.type}, isClusterServer: ${server.isClusterServer}, clusterName: ${server.clusterName}`);

      // Get database config
      const dbConfig = serverManager.getServerConfigFromDatabase(name);
      
      // Try to find and read the start.bat file
      let startBatContent = null;
      let startBatPath = null;
      
      try {
        if (server.isClusterServer && server.clusterName) {
          // Cluster server
          const clustersPath = process.env.NATIVE_CLUSTERS_PATH || join(process.env.NATIVE_BASE_PATH || 'F:\\ARK', 'clusters');
          startBatPath = join(clustersPath, server.clusterName, name, 'start.bat');
        } else {
          // Standalone server
          const serverPath = server.serverPath || join(process.env.NATIVE_BASE_PATH || 'F:\\ARK', 'servers', name);
          startBatPath = join(serverPath, 'start.bat');
        }
        
        startBatContent = await fs.readFile(startBatPath, 'utf8');
      } catch (fileError) {
        logger.warn(`Could not read start.bat for ${name}: ${fileError.message}`);
        // Try to find the start.bat file in common locations
        const commonPaths = [
          'F:\\ARK', 'G:\\ARK', 'C:\\ARK', 'D:\\ARK', 'E:\\ARK',
          'F:\\ASA', 'G:\\ASA', 'C:\\ASA', 'D:\\ASA', 'E:\\ASA'
        ];
        
        for (const basePath of commonPaths) {
          try {
            let testPath;
            if (server.isClusterServer && server.clusterName) {
              testPath = join(basePath, 'clusters', server.clusterName, name, 'start.bat');
            } else {
              testPath = join(basePath, 'servers', name, 'start.bat');
            }
            
            const testContent = await fs.readFile(testPath, 'utf8');
            startBatPath = testPath;
            startBatContent = testContent;
            logger.info(`Found start.bat for ${name} at: ${testPath}`);
            break;
          } catch (testError) {
            // Continue to next path
          }
        }
      }
      
      // Extract password from start.bat if it exists
      let startBatPassword = null;
      if (startBatContent) {
        const passwordMatch = startBatContent.match(/AdminPassword="([^"]+)"/);
        if (passwordMatch) {
          startBatPassword = passwordMatch[1];
        }
      }
      
      // Try to read config files
      let gameUserSettingsContent = null;
      let gameIniContent = null;
      let configsPath = null;
      
      try {
        if (server.isClusterServer && server.clusterName) {
          // Cluster server
          const clustersPath = process.env.NATIVE_CLUSTERS_PATH || join(process.env.NATIVE_BASE_PATH || 'F:\\ARK', 'clusters');
          configsPath = join(clustersPath, server.clusterName, name, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
        } else {
          // Standalone server
          const serverPath = server.serverPath || join(process.env.NATIVE_BASE_PATH || 'F:\\ARK', 'servers', name);
          configsPath = join(serverPath, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
        }
        
        // Try to read GameUserSettings.ini
        try {
          const gameUserSettingsPath = join(configsPath, 'GameUserSettings.ini');
          gameUserSettingsContent = await fs.readFile(gameUserSettingsPath, 'utf8');
        } catch (error) {
          logger.warn(`Could not read GameUserSettings.ini for ${name}: ${error.message}`);
        }
        
        // Try to read Game.ini
        try {
          const gameIniPath = join(configsPath, 'Game.ini');
          gameIniContent = await fs.readFile(gameIniPath, 'utf8');
        } catch (error) {
          logger.warn(`Could not read Game.ini for ${name}: ${error.message}`);
        }
      } catch (configError) {
        logger.warn(`Could not access config directory for ${name}: ${configError.message}`);
      }
      
      // Extract RCON settings from GameUserSettings.ini
      let rconEnabled = null;
      let rconPort = null;
      let configAdminPassword = null;
      
      if (gameUserSettingsContent) {
        const rconEnabledMatch = gameUserSettingsContent.match(/RCONEnabled\s*=\s*(True|False)/i);
        const rconPortMatch = gameUserSettingsContent.match(/RCONPort\s*=\s*(\d+)/);
        const adminPasswordMatch = gameUserSettingsContent.match(/ServerAdminPassword\s*=\s*([^\r\n]+)/);
        
        rconEnabled = rconEnabledMatch ? rconEnabledMatch[1] : null;
        rconPort = rconPortMatch ? rconPortMatch[1] : null;
        configAdminPassword = adminPasswordMatch ? adminPasswordMatch[1].trim() : null;
      }
      
      const debugInfo = {
        serverName: name,
        environment: {
          NATIVE_BASE_PATH: process.env.NATIVE_BASE_PATH ? process.env.NATIVE_BASE_PATH.replace(/\\\\/g, '\\') : null,
          NATIVE_CLUSTERS_PATH: process.env.NATIVE_CLUSTERS_PATH ? process.env.NATIVE_CLUSTERS_PATH.replace(/\\\\/g, '\\') : null,
          NATIVE_SERVERS_PATH: process.env.NATIVE_SERVERS_PATH ? process.env.NATIVE_SERVERS_PATH.replace(/\\\\/g, '\\') : null,
          SERVER_MODE: process.env.SERVER_MODE
        },
        serverInfo: {
          adminPassword: server?.adminPassword || 'undefined',
          configAdminPassword: server?.config?.adminPassword || 'undefined',
          rconPort: server?.rconPort || 'undefined',
          gamePort: server?.gamePort || 'undefined',
          serverPath: server?.serverPath ? server.serverPath.replace(/\\\\/g, '\\') : 'undefined',
          isClusterServer: server?.isClusterServer || false,
          clusterName: server?.clusterName || 'undefined',
          serverType: server?.type || 'undefined'
        },
        databaseConfig: dbConfig,
        startBatInfo: {
          path: startBatPath ? startBatPath.replace(/\\\\/g, '\\') : null,
          exists: !!startBatContent,
          password: startBatPassword,
          passwordLength: startBatPassword ? startBatPassword.length : 0,
          contentPreview: startBatContent ? startBatContent.substring(0, 500) + '...' : null
        },
        passwordComparison: {
          serverPassword: server?.adminPassword || 'undefined',
          databasePassword: dbConfig?.adminPassword || 'undefined',
          startBatPassword: startBatPassword || 'undefined',
          configAdminPassword: configAdminPassword || 'undefined',
          allMatch: (server?.adminPassword === dbConfig?.adminPassword && 
                   dbConfig?.adminPassword === configAdminPassword) || false
        },
        configFiles: {
          configsPath: configsPath ? configsPath.replace(/\\\\/g, '\\') : null,
          gameUserSettingsExists: !!gameUserSettingsContent,
          gameIniExists: !!gameIniContent,
          rconEnabled: rconEnabled,
          rconPort: rconPort,
          configAdminPassword: configAdminPassword,
          gameUserSettingsContent: gameUserSettingsContent ? gameUserSettingsContent.substring(0, 1000) + '...' : null,
          gameIniContent: gameIniContent ? gameIniContent.substring(0, 500) + '...' : null
        }
      };

      logger.info(`Debug RCON: Returning debug info for ${name}:`, {
        serverName: debugInfo.serverName,
        serverInfoKeys: Object.keys(debugInfo.serverInfo),
        databaseConfigExists: !!debugInfo.databaseConfig,
        startBatExists: debugInfo.startBatInfo.exists,
        environmentKeys: Object.keys(debugInfo.environment),
        serverInfo: debugInfo.serverInfo
      });

      // Debug: Log the actual return object
      const returnObject = {
        success: true,
        debug: debugInfo
      };
      
      logger.info(`Debug RCON: Return object keys:`, Object.keys(returnObject));
      logger.info(`Debug RCON: Debug object keys:`, Object.keys(returnObject.debug));
      
      // Test JSON serialization
      try {
        const jsonString = JSON.stringify(returnObject, null, 2);
        logger.info(`Debug RCON: JSON string length: ${jsonString.length}`);
        logger.info(`Debug RCON: JSON string preview: ${jsonString.substring(0, 500)}`);
        
        // Test parsing back
        const parsed = JSON.parse(jsonString);
        logger.info(`Debug RCON: Parsed back successfully, debug keys: ${Object.keys(parsed.debug || {}).join(', ')}`);
        
        // Log individual debug object properties
        logger.info(`Debug RCON: serverName = ${parsed.debug?.serverName}`);
        logger.info(`Debug RCON: serverInfo keys = ${Object.keys(parsed.debug?.serverInfo || {}).join(', ')}`);
        logger.info(`Debug RCON: adminPassword = ${parsed.debug?.serverInfo?.adminPassword}`);
        logger.info(`Debug RCON: rconPort = ${parsed.debug?.serverInfo?.rconPort}`);
      } catch (error) {
        logger.error(`Debug RCON: JSON serialization error: ${error.message}`);
      }

      return returnObject;
    } catch (error) {
      logger.error(`[DEBUG-RCON] Error debugging RCON for ${request.params.name}:`, error);
      logger.error(`[DEBUG-RCON] Error stack:`, error.stack);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Test RCON connection with debug info
  fastify.get('/api/native-servers/:name/test-rcon', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            debug: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      
      // Get server info to find RCON port
      const servers = await serverManager.listServers();
      const server = servers.find(s => s.name === name);
      
      if (!server) {
        return reply.status(404).send({
          success: false,
          message: `Server ${name} not found`
        });
      }

      // Get database config for comparison
      const dbConfig = serverManager.getServerConfigFromDatabase(name);
      
      // Ensure we have valid host and port
      const rconHost = '127.0.0.1';
      const rconPort = server.rconPort || 32330;
      const rconPassword = server.adminPassword || server.config?.adminPassword || 'admin123';
      
      const debugInfo = {
        serverName: name,
        serverConfig: {
          adminPassword: server.adminPassword,
          configAdminPassword: server.config?.adminPassword,
          rconPort: rconPort,
          gamePort: server.gamePort,
          serverPath: server.serverPath,
          isClusterServer: server.isClusterServer,
          clusterName: server.clusterName
        },
        databaseConfig: dbConfig,
        rconConnection: {
          host: rconHost,
          port: rconPort,
          password: rconPassword,
          passwordLength: rconPassword ? rconPassword.length : 0
        }
      };

      // Try a simple RCON command to test connection
      try {
        const rconService = (await import('../services/rcon.js')).default;
        const rconOptions = {
          host: rconHost,
          port: rconPort,
          password: rconPassword
        };
        
        logger.info(`Testing RCON connection for ${name}:`, {
          host: rconHost,
          port: rconPort,
          passwordLength: rconPassword ? rconPassword.length : 0,
          passwordPreview: rconPassword ? rconPassword.substring(0, 3) + '***' : 'none'
        });
        
        const response = await rconService.sendCommand(rconOptions, 'gettime');
        debugInfo.rconTest = {
          success: true,
          response: response
        };
      } catch (error) {
        debugInfo.rconTest = {
          success: false,
          error: error.message,
          errorType: error.constructor.name
        };
      }

      return {
        success: true,
        debug: debugInfo
      };
    } catch (error) {
      logger.error(`Error testing RCON for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get enhanced server status with crash detection
  fastify.get('/api/native-servers/:name/status', {
    preHandler: [requireRead],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            status: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.params;
      const status = await serverManager.getServerStatus(name);
      return { success: true, status };
    } catch (error) {
      fastify.log.error(`Error getting enhanced server status for ${request.params.name}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });



  // Get all servers (compatibility endpoint)
  fastify.get('/api/servers', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const servers = await serverManager.listServers();
      return {
        success: true,
        servers: servers.map(server => ({
          id: server.name,
          name: server.name,
          type: server.type || 'native',
          status: server.status,
          map: server.map,
          port: server.gamePort,
          rconPort: server.rconPort,
          maxPlayers: server.maxPlayers,
          currentPlayers: server.currentPlayers || 0,
          uptime: server.uptime,
          lastStarted: server.lastStarted,
          configPath: server.configPath
        }))
      };
    } catch (error) {
      logger.error('Failed to list servers:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to list servers'
      });
    }
  });
} 
