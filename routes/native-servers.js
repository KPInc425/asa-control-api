import { NativeServerManager } from '../services/server-manager.js';
import { requireRead, requireWrite, requirePermission } from '../middleware/auth.js';
import logger from '../utils/logger.js';

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
              additionalArgs: { type: 'string' }
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
      
      // This would need to be implemented in the NativeServerManager
      // For now, we'll read from the config file directly
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const configPath = path.join(process.cwd(), 'native-servers.json');
      const configContent = await fs.readFile(configPath, 'utf8');
      const serverConfigs = JSON.parse(configContent);
      
      if (!serverConfigs[name]) {
        return reply.status(404).send({
          success: false,
          message: `Server configuration not found: ${name}`
        });
      }
      
      return {
        success: true,
        config: serverConfigs[name]
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
      
      // Remove from configuration
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const configPath = path.join(process.cwd(), 'native-servers.json');
      const configContent = await fs.readFile(configPath, 'utf8');
      const serverConfigs = JSON.parse(configContent);
      
      delete serverConfigs[name];
      await fs.writeFile(configPath, JSON.stringify(serverConfigs, null, 2));
      
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
      
      // Get server info to find RCON port
      const servers = await serverManager.listServers();
      const server = servers.find(s => s.name === name);
      
      if (!server) {
        return reply.status(404).send({
          success: false,
          message: `Server ${name} not found`
        });
      }

      if (!server.rconPort) {
        return reply.status(400).send({
          success: false,
          message: `No RCON port configured for server ${name}`
        });
      }

      // Use the RCON service to send command
      const rconService = await import('../services/rcon.js');
      const response = await rconService.default.sendCommand('127.0.0.1', server.rconPort, command);
      
      return {
        success: true,
        message: 'Command sent successfully',
        response: response
      };
    } catch (error) {
      fastify.log.error(`Error sending RCON command to ${request.params.name}:`, error);
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
