import path from 'path';
import fs from 'fs/promises';
import { requirePermission } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';
import config from '../../config/index.js';
import { ServerProvisioner } from '../../services/server-provisioner.js';
import { createServerManager } from '../../services/server-manager.js';
import { createJob, updateJob, addJobProgress } from '../../services/job-manager.js';

// Register cluster-related provisioning routes
export default async function clusterRoutes(fastify) {
  const provisioner = new ServerProvisioner();

  // Update server settings
  fastify.post('/api/provisioning/servers/:serverName/update-settings', {
    preHandler: requirePermission('write'),
    schema: {
      params: {
        type: 'object',
        required: ['serverName'],
        properties: {
          serverName: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['settings'],
        properties: {
          settings: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              map: { type: 'string' },
              gamePort: { type: 'number' },
              queryPort: { type: 'number' },
              rconPort: { type: 'number' },
              maxPlayers: { type: 'number' },
              adminPassword: { type: 'string' },
              serverPassword: { type: 'string' },
              rconPassword: { type: 'string' },
              clusterId: { type: 'string' },
              clusterPassword: { type: 'string' },
              sessionName: { type: 'string' },
              disableBattleEye: { type: 'boolean' },
              customDynamicConfigUrl: { type: 'string' }
            }
          },
          regenerateConfigs: { type: 'boolean' },
          regenerateScripts: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      const { settings, regenerateConfigs = true, regenerateScripts = true } = request.body;
      
      logger.info(`Updating server settings for ${serverName}`, { 
        disableBattleEye: settings.disableBattleEye,
        regenerateConfigs,
        regenerateScripts
      });
      
      const result = await provisioner.updateServerSettings(serverName, settings, {
        regenerateConfigs,
        regenerateScripts
      });
      
      return {
        success: true,
        message: result.message,
        data: result
      };
    } catch (error) {
      logger.error(`Failed to update server settings for ${request.params.serverName}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Create individual server
  fastify.post('/api/provisioning/create-server', {
    preHandler: requirePermission('write'),
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          map: { type: 'string' },
          gamePort: { type: 'number' },
          queryPort: { type: 'number' },
          rconPort: { type: 'number' },
          maxPlayers: { type: 'number' },
          adminPassword: { type: 'string' },
          serverPassword: { type: 'string' },
          rconPassword: { type: 'string' },
          harvestMultiplier: { type: 'number' },
          xpMultiplier: { type: 'number' },
          tamingMultiplier: { type: 'number' },
          disableBattleEye: { type: 'boolean' },
          customDynamicConfigUrl: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const {
        name,
        map = 'TheIsland',
        gamePort = 7777,
        queryPort = 27015,
        rconPort = 32330,
        maxPlayers = 70,
        adminPassword = 'admin123',
        serverPassword = '',
        rconPassword = 'rcon123',
        harvestMultiplier = 3.0,
        xpMultiplier = 3.0,
        tamingMultiplier = 5.0,
        disableBattleEye = false,
        customDynamicConfigUrl = ''
      } = request.body;

      if (!name) {
        return reply.status(400).send({
          success: false,
          message: 'Server name is required'
        });
      }

      const serverConfig = {
        name,
        map,
        gamePort,
        queryPort,
        rconPort,
        maxPlayers,
        adminPassword,
        serverPassword,
        rconPassword,
        harvestMultiplier,
        xpMultiplier,
        tamingMultiplier,
        disableBattleEye,
        customDynamicConfigUrl
      };

      const result = await provisioner.createServer(serverConfig);
      return {
        success: true,
        message: `Server ${name} created successfully`,
        data: result
      };
    } catch (error) {
      logger.error('Failed to create server:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to create server'
      });
    }
  });

  // Create cluster (direct)
  fastify.post('/api/provisioning/create-cluster', {
    preHandler: requirePermission('write'),
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          serverCount: { type: 'number' },
          basePort: { type: 'number' },
          maps: { type: 'array', items: { type: 'string' } },
          maxPlayers: { type: 'number' },
          adminPassword: { type: 'string' },
          serverPassword: { type: 'string' },
          rconPassword: { type: 'string' },
          clusterPassword: { type: 'string' },
          harvestMultiplier: { type: 'number' },
          xpMultiplier: { type: 'number' },
          tamingMultiplier: { type: 'number' },
          foreground: { type: 'boolean' },
          disableBattleEye: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const {
        name,
        description = '',
        serverCount = 1,
        basePort = 7777,
        maps = [],
        maxPlayers = 70,
        adminPassword = 'admin123',
        serverPassword = '',
        rconPassword = 'rcon123',
        clusterPassword = '',
        harvestMultiplier = 3.0,
        xpMultiplier = 3.0,
        tamingMultiplier = 5.0,
        foreground = false,
        disableBattleEye = false
      } = request.body;

      if (!name) {
        return reply.status(400).send({
          success: false,
          message: 'Cluster name is required'
        });
      }
      if (serverCount < 1 || serverCount > 10) {
        return reply.status(400).send({
          success: false,
          message: 'Server count must be between 1 and 10'
        });
      }
      const clusterConfig = {
        name,
        description,
        serverCount,
        basePort,
        maps: maps.length > 0 ? maps : Array(serverCount).fill('TheIsland'),
        maxPlayers,
        adminPassword,
        serverPassword,
        rconPassword,
        clusterPassword,
        harvestMultiplier,
        xpMultiplier,
        tamingMultiplier,
        disableBattleEye
      };
      const result = await provisioner.createCluster(clusterConfig, foreground);
      return {
        success: true,
        message: `Cluster ${name} created successfully with ${serverCount} servers`,
        data: result
      };
    } catch (error) {
      logger.error('Failed to create cluster:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to create cluster'
      });
    }
  });

  // Cluster creation with job/progress system
  fastify.post('/api/provisioning/clusters', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    const io = fastify.io;
    const clusterConfig = request.body;
    logger.info('Creating cluster with config:', {
      name: clusterConfig.name,
      serverCount: clusterConfig.serverCount,
      basePort: clusterConfig.basePort
    });
    const job = createJob('create-cluster', { clusterName: clusterConfig.name });
    logger.info(`Created job ${job.id} for cluster creation`);
    // Respond immediately with job ID
    reply.send({ success: true, jobId: job.id });
    // Start cluster creation in background
    (async () => {
      try {
        addJobProgress(job.id, 'Starting cluster creation...');
        if (io) {
          io.emit('job-progress', {
            jobId: job.id,
            status: 'running',
            progress: 0,
            message: 'Starting cluster creation...'
          });
        }
        // Progress callback
        const progressCb = (msg) => {
          addJobProgress(job.id, msg);
          if (io) {
            io.emit('job-progress', {
              jobId: job.id,
              status: 'running',
              progress: 0,
              message: msg
            });
          }
        };
        provisioner.setProgressCallback(progressCb);
        logger.info(`Starting cluster creation for job ${job.id}: ${clusterConfig.name}`);
        const result = await provisioner.createCluster(clusterConfig, clusterConfig.foreground || false);
        updateJob(job.id, { status: 'completed', result });
        if (io) {
          io.emit('job-progress', {
            jobId: job.id,
            status: 'completed',
            progress: 100,
            message: 'Cluster created successfully!',
            result
          });
        }
        logger.info(`Cluster creation completed for job ${job.id}: ${clusterConfig.name}`);
      } catch (err) {
        logger.error(`Cluster creation failed for job ${job.id}:`, err);
        updateJob(job.id, { status: 'failed', error: err.message });
        if (io) {
          io.emit('job-progress', {
            jobId: job.id,
            status: 'failed',
            progress: 0,
            message: `Cluster creation failed: ${err.message}`,
            error: err.message
          });
        }
      }
    })();
  });

  // List clusters
  fastify.get('/api/provisioning/clusters', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const clusters = await provisioner.listClusters();
      return {
        success: true,
        clusters
      };
    } catch (error) {
      logger.error('Failed to list clusters:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to list clusters'
      });
    }
  });

  // Get cluster details
  fastify.get('/api/provisioning/clusters/:clusterName', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { clusterName } = request.params;
      const clusters = await provisioner.listClusters();
      const cluster = clusters.find(c => c.name === clusterName);
      if (!cluster) {
        return reply.status(404).send({
          success: false,
          message: `Cluster "${clusterName}" not found`
        });
      }
      // Get server status for each server in the cluster
      const serverManager = createServerManager();
      const serversWithStatus = [];
      if (cluster.config && cluster.config.servers) {
        for (const server of cluster.config.servers) {
          try {
            const isRunning = await serverManager.isRunning(server.name);
            serversWithStatus.push({
              ...server,
              status: isRunning ? 'running' : 'stopped'
            });
          } catch (error) {
            logger.warn(`Failed to get status for server ${server.name}:`, error);
            serversWithStatus.push({
              ...server,
              status: 'unknown'
            });
          }
        }
      }
      return {
        success: true,
        cluster: {
          ...cluster,
          servers: serversWithStatus
        }
      };
    } catch (error) {
      logger.error(`Failed to get cluster details for ${request.params.clusterName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get cluster details'
      });
    }
  });

  // Start cluster
  fastify.post('/api/provisioning/clusters/:clusterName/start', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { clusterName } = request.params;
      const serverManager = createServerManager();
      const result = await serverManager.startCluster(clusterName);
      return {
        success: true,
        message: `Cluster ${clusterName} start initiated`,
        data: result
      };
    } catch (error) {
      logger.error(`Failed to start cluster ${request.params.clusterName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to start cluster'
      });
    }
  });

  // Stop cluster
  fastify.post('/api/provisioning/clusters/:clusterName/stop', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { clusterName } = request.params;
      const serverManager = createServerManager();
      const result = await serverManager.stopCluster(clusterName);
      return {
        success: true,
        message: `Cluster ${clusterName} stop initiated`,
        data: result
      };
    } catch (error) {
      logger.error(`Failed to stop cluster ${request.params.clusterName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to stop cluster'
      });
    }
  });

  // Restart cluster
  fastify.post('/api/provisioning/clusters/:clusterName/restart', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { clusterName } = request.params;
      const serverManager = createServerManager();
      const result = await serverManager.restartCluster(clusterName);
      return {
        success: true,
        message: `Cluster ${clusterName} restart initiated`,
        data: result
      };
    } catch (error) {
      logger.error(`Failed to restart cluster ${request.params.clusterName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to restart cluster'
      });
    }
  });

  // Get update status for all servers
  fastify.get('/api/provisioning/update-status-all', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const clusters = await provisioner.listClusters();
      const allServers = [];
      
      for (const cluster of clusters) {
        if (cluster.config && cluster.config.servers) {
          for (const server of cluster.config.servers) {
            try {
              const updateStatus = await provisioner.checkServerUpdateStatus(server.name);
              const updateConfig = await provisioner.getServerUpdateConfig(server.name);
              
              allServers.push({
                serverName: server.name,
                clusterName: cluster.name,
                status: updateStatus,
                config: updateConfig
              });
            } catch (error) {
              logger.warn(`Failed to get update status for server ${server.name}:`, error);
              allServers.push({
                serverName: server.name,
                clusterName: cluster.name,
                status: {
                  needsUpdate: false,
                  reason: 'Error checking update status',
                  error: error.message
                },
                config: null
              });
            }
          }
        }
      }
      
      return {
        success: true,
        data: allServers
      };
    } catch (error) {
      logger.error('Failed to get update status for all servers:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get update status for all servers'
      });
    }
  });

  // Get start script for a server
  fastify.get('/api/provisioning/start-script/:serverName', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      // Find the server in clusters
      const clusters = await provisioner.listClusters();
      let serverConfig = null;
      let clusterName = null;
      
      for (const cluster of clusters) {
        if (cluster.config && cluster.config.servers) {
          const server = cluster.config.servers.find(s => s.name === serverName);
          if (server) {
            serverConfig = server;
            clusterName = cluster.name;
            break;
          }
        }
      }
      
      if (!serverConfig) {
        return reply.status(404).send({
          success: false,
          message: `Server "${serverName}" not found`
        });
      }
      
      // Get the server path
      const serverPath = clusterName 
        ? path.join(config.native.clustersPath, clusterName, serverName)
        : path.join(config.native.serversPath, serverName);
      
      // Check if start script exists
      const startScriptPath = path.join(serverPath, 'start.bat');
      try {
        const startScript = await fs.readFile(startScriptPath, 'utf8');
        return {
          success: true,
          data: {
            serverName,
            clusterName,
            scriptPath: startScriptPath,
            content: startScript
          }
        };
      } catch (error) {
        if (error.code === 'ENOENT') {
          return reply.status(404).send({
            success: false,
            message: `Start script not found for server "${serverName}"`
          });
        }
        throw error;
      }
    } catch (error) {
      logger.error(`Failed to get start script for ${request.params.serverName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get start script'
      });
    }
  });

  // Regenerate start scripts for all servers
  fastify.post('/api/provisioning/regenerate-start-scripts', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const clusters = await provisioner.listClusters();
      const results = [];
      
      for (const cluster of clusters) {
        if (cluster.config && cluster.config.servers) {
          for (const server of cluster.config.servers) {
            try {
              await provisioner.regenerateServerStartScript(server.name);
              results.push({
                serverName: server.name,
                clusterName: cluster.name,
                success: true,
                message: `Start script regenerated for ${server.name}`
              });
            } catch (error) {
              logger.error(`Failed to regenerate start script for ${server.name}:`, error);
              results.push({
                serverName: server.name,
                clusterName: cluster.name,
                success: false,
                message: `Failed to regenerate start script: ${error.message}`
              });
            }
          }
        }
      }
      
      return {
        success: true,
        message: 'Start script regeneration completed',
        data: results
      };
    } catch (error) {
      logger.error('Failed to regenerate start scripts:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to regenerate start scripts'
      });
    }
  });

  // Update server with config
  fastify.post('/api/provisioning/servers/:serverName/update-with-config', {
    preHandler: requirePermission('write'),
    schema: {
      params: {
        type: 'object',
        required: ['serverName'],
        properties: {
          serverName: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['config'],
        properties: {
          config: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              map: { type: 'string' },
              gamePort: { type: 'number' },
              queryPort: { type: 'number' },
              rconPort: { type: 'number' },
              maxPlayers: { type: 'number' },
              adminPassword: { type: 'string' },
              serverPassword: { type: 'string' },
              rconPassword: { type: 'string' },
              clusterId: { type: 'string' },
              clusterPassword: { type: 'string' },
              sessionName: { type: 'string' },
              disableBattleEye: { type: 'boolean' },
              customDynamicConfigUrl: { type: 'string' }
            }
          },
          regenerateConfigs: { type: 'boolean' },
          regenerateScripts: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      const { config, regenerateConfigs = true, regenerateScripts = true } = request.body;
      
      logger.info(`Updating server config for ${serverName}`, { 
        disableBattleEye: config.disableBattleEye,
        regenerateConfigs,
        regenerateScripts
      });
      
      const result = await provisioner.updateServerSettings(serverName, config, {
        regenerateConfigs,
        regenerateScripts
      });
      
      return {
        success: true,
        message: result.message,
        data: result
      };
    } catch (error) {
      logger.error(`Failed to update server config for ${request.params.serverName}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Delete cluster
  fastify.delete('/api/provisioning/clusters/:clusterName', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { clusterName } = request.params;
      const { backupSaved = true, deleteFiles = true } = request.query;
      
      logger.info(`Deleting cluster: ${clusterName}`, { backupSaved, deleteFiles });
      
      const result = await provisioner.deleteCluster(clusterName, {
        backupSaved: backupSaved === 'true',
        deleteFiles: deleteFiles === 'true'
      });
      
      return {
        success: true,
        message: `Cluster ${clusterName} deleted successfully`,
        data: result
      };
    } catch (error) {
      logger.error(`Failed to delete cluster ${request.params.clusterName}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Backup cluster saved data
  fastify.post('/api/provisioning/clusters/:clusterName/backup', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { clusterName } = request.params;
      const { destination } = request.body;
      
      logger.info(`Backing up cluster: ${clusterName}`, { destination });
      
      const result = await provisioner.backupCluster(clusterName, destination);
      
      return {
        success: true,
        message: `Cluster ${clusterName} backed up successfully`,
        data: result
      };
    } catch (error) {
      logger.error(`Failed to backup cluster ${request.params.clusterName}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Restore cluster saved data
  fastify.post('/api/provisioning/clusters/:clusterName/restore', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { clusterName } = request.params;
      const { source } = request.body;
      
      logger.info(`Restoring cluster: ${clusterName}`, { source });
      
      const result = await provisioner.restoreCluster(clusterName, source);
      
      return {
        success: true,
        message: `Cluster ${clusterName} restored successfully`,
        data: result
      };
    } catch (error) {
      logger.error(`Failed to restore cluster ${request.params.clusterName}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Backup individual server
  fastify.post('/api/provisioning/servers/:serverName/backup', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      const { destination, includeConfigs = true, includeScripts = false } = request.body;
      
      logger.info(`Backing up server: ${serverName}`, { destination, includeConfigs, includeScripts });
      
      const result = await provisioner.backupServer(serverName, {
        destination,
        includeConfigs,
        includeScripts
      });
      
      return {
        success: true,
        message: `Server ${serverName} backed up successfully`,
        data: result
      };
    } catch (error) {
      logger.error(`Failed to backup server ${request.params.serverName}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Restore individual server
  fastify.post('/api/provisioning/servers/:serverName/restore', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      const { source, targetClusterName, overwrite = false } = request.body;
      
      logger.info(`Restoring server: ${serverName}`, { source, targetClusterName, overwrite });
      
      const result = await provisioner.restoreServer(serverName, source, {
        targetClusterName,
        overwrite
      });
      
      return {
        success: true,
        message: `Server ${serverName} restored successfully`,
        data: result
      };
    } catch (error) {
      logger.error(`Failed to restore server ${request.params.serverName}:`, error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // List available server backups
  fastify.get('/api/provisioning/server-backups', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const result = await provisioner.listServerBackups();
      
      return {
        success: true,
        message: 'Server backups retrieved successfully',
        data: result
      };
    } catch (error) {
      logger.error('Failed to list server backups:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });
} 
