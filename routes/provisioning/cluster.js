import path from 'path';
import fs from 'fs/promises';
import { requirePermission } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';
import config from '../../config/index.js';
import { ServerProvisioner } from '../../services/server-provisioner.js';
import { createServerManager } from '../../services/server-manager.js';
import { createJob, updateJob, addJobProgress } from '../../services/job-manager.js';
import archiver from 'archiver';
import unzipper from 'unzipper';
import os from 'os';

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
    logger.info('[ROUTE] Received cluster creation request:', JSON.stringify(clusterConfig, null, 2));
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
            progress: 5,
            message: 'Starting cluster creation...'
          });
        }
        // Progress callback with actual progress calculation
        let currentStep = 0;
        const totalSteps = 5; // validation, directory creation, server installation, config creation, finalization
        const progressCb = (msg) => {
          currentStep++;
          const progress = Math.min(Math.round((currentStep / totalSteps) * 100), 95); // Cap at 95% until completion
          addJobProgress(job.id, msg);
          if (io) {
            io.emit('job-progress', {
              jobId: job.id,
              status: 'running',
              progress: progress,
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

  // Import cluster config from uploaded JSON
  fastify.post('/api/provisioning/clusters/import', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({
          success: false,
          message: 'No file uploaded'
        });
      }
      let configContent = '';
      for await (const chunk of data.file) {
        configContent += chunk.toString();
      }
      let clusterConfig;
      try {
        clusterConfig = JSON.parse(configContent);
      } catch (err) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid JSON in uploaded file'
        });
      }
      if (!clusterConfig.name) {
        return reply.status(400).send({
          success: false,
          message: 'Cluster config must include a name'
        });
      }
      // Check if cluster already exists
      const clusterPath = path.join(provisioner.clustersPath, clusterConfig.name);
      try {
        await fs.access(clusterPath);
        return reply.status(409).send({
          success: false,
          message: `Cluster with name '${clusterConfig.name}' already exists`
        });
      } catch {
        // Not found, continue
      }
      // Provision the new cluster
      try {
        const result = await provisioner.createCluster(clusterConfig, false);
        return reply.send({
          success: true,
          message: `Cluster '${clusterConfig.name}' imported successfully`,
          data: result
        });
      } catch (err) {
        return reply.status(500).send({
          success: false,
          message: `Failed to import cluster: ${err.message}`
        });
      }
    } catch (error) {
      logger.error('Failed to import cluster config:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to import cluster config'
      });
    }
  });

  // List clusters
  fastify.get('/api/provisioning/clusters', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const clusters = await provisioner.listClusters();
      const serverManager = createServerManager();
      
      // Add server status for each cluster
      const clustersWithStatus = await Promise.all(clusters.map(async (cluster) => {
        if (cluster.config && cluster.config.servers) {
          const serversWithStatus = await Promise.all(cluster.config.servers.map(async (server) => {
            try {
              const isRunning = await serverManager.isRunning(server.name);
              return {
                ...server,
                status: isRunning ? 'running' : 'stopped'
              };
            } catch (error) {
              logger.warn(`Failed to get status for server ${server.name}:`, error);
              return {
                ...server,
                status: 'unknown'
              };
            }
          }));
          
          return {
            ...cluster,
            config: {
              ...cluster.config,
              servers: serversWithStatus
            }
          };
        }
        return cluster;
      }));
      
      return {
        success: true,
        clusters: clustersWithStatus
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

  // Export cluster config as downloadable JSON
  fastify.get('/api/provisioning/clusters/:clusterName/export', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { clusterName } = request.params;
      const clusterPath = path.join(provisioner.clustersPath, clusterName);
      const configPath = path.join(clusterPath, 'cluster.json');
      let configContent;
      try {
        configContent = await fs.readFile(configPath, 'utf8');
      } catch (err) {
        logger.warn(`Cluster config not found for export: ${clusterName}`);
        return reply.status(404).send({
          success: false,
          message: `Cluster config not found for ${clusterName}`
        });
      }
      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', `attachment; filename="${clusterName}-cluster.json"`);
      return reply.send(configContent);
    } catch (error) {
      logger.error(`Failed to export cluster config for ${request.params.clusterName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to export cluster config'
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
      logger.info(`[start-script endpoint] Fetching start script for server: ${serverName}`);
      // Find the server in clusters
      const clusters = await provisioner.listClusters();
      let serverConfig = null;
      let clusterName = null;
      let serverPath = null;
      for (const cluster of clusters) {
        if (cluster.config && cluster.config.servers) {
          const server = cluster.config.servers.find(s => s.name === serverName);
          if (server) {
            serverConfig = server;
            clusterName = cluster.name;
            serverPath = path.join(provisioner.clustersPath, clusterName, serverName);
            break;
          }
        }
      }
      if (!serverConfig) {
        // Try standalone servers
        serverPath = path.join(provisioner.serversPath, serverName);
      }
      const startScriptPath = path.join(serverPath, 'start.bat');
      logger.info(`[start-script endpoint] Resolved start.bat path: ${startScriptPath}`);
      try {
        const startScript = await fs.readFile(startScriptPath, 'utf8');
        logger.info(`[start-script endpoint] Read start.bat, content length: ${startScript.length}`);
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
        logger.error(`[start-script endpoint] Failed to read start.bat at ${startScriptPath}:`, error);
        if (error.code === 'ENOENT') {
          return reply.status(404).send({
            success: false,
            message: `Start script not found for server "${serverName}" at ${startScriptPath}`
          });
        }
        throw error;
      }
    } catch (error) {
      logger.error(`[start-script endpoint] Failed to get start script for ${request.params.serverName}:`, error);
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
      // Robust path resolution for clustersPath
      const clustersPath = process.env.NATIVE_CLUSTERS_PATH || (config.server && config.server.native && config.server.native.clustersPath) || (config.server && config.server.native && config.server.native.basePath ? path.join(config.server.native.basePath, 'clusters') : null);
      if (!clustersPath) {
        logger.error('Missing clustersPath in configuration.');
        return reply.status(500).send({
          success: false,
          message: 'Server configuration error: clustersPath is not set.'
        });
      }
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

  // Restore cluster from backup ZIP
  fastify.post('/api/provisioning/clusters/restore-backup', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const data = await request.parts();
      let filePart = null;
      let targetClusterName = null;
      for await (const part of data) {
        if (part.type === 'file' && part.fieldname === 'file') filePart = part;
        if (part.type === 'field' && part.fieldname === 'targetClusterName') targetClusterName = part.value;
      }
      if (!filePart || !targetClusterName) {
        return reply.status(400).send({ success: false, message: 'Missing file or targetClusterName' });
      }
      // Save uploaded ZIP to temp file
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cluster-restore-'));
      const zipPath = path.join(tmpDir, 'backup.zip');
      const out = await fs.open(zipPath, 'w');
      for await (const chunk of filePart.file) {
        await out.write(chunk);
      }
      await out.close();
      // Extract ZIP
      await fs.mkdir(path.join(tmpDir, 'extracted'));
      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: path.join(tmpDir, 'extracted') }));
        stream.on('close', resolve);
        stream.on('error', reject);
      });
      // Read cluster-config.json from extracted
      const extractedPath = path.join(tmpDir, 'extracted');
      const configPath = path.join(extractedPath, 'cluster-config.json');
      let backupConfig;
      try {
        const configContent = await fs.readFile(configPath, 'utf8');
        backupConfig = JSON.parse(configContent);
      } catch {
        await fs.rm(tmpDir, { recursive: true, force: true });
        return reply.status(400).send({ success: false, message: 'Invalid or missing cluster-config.json in backup' });
      }
      // Check if target cluster exists
      const targetClusterPath = path.join(provisioner.clustersPath, targetClusterName);
      let targetExists = false;
      try {
        await fs.access(targetClusterPath);
        targetExists = true;
      } catch {
        targetExists = false;
      }
      if (targetExists) {
        // Validate cluster name and server names/count
        const targetConfigPath = path.join(targetClusterPath, 'cluster.json');
        let targetConfig;
        try {
          const targetContent = await fs.readFile(targetConfigPath, 'utf8');
          targetConfig = JSON.parse(targetContent);
        } catch {
          await fs.rm(tmpDir, { recursive: true, force: true });
          return reply.status(400).send({ success: false, message: 'Target cluster config not found or invalid' });
        }
        if (backupConfig.name !== targetConfig.name) {
          await fs.rm(tmpDir, { recursive: true, force: true });
          return reply.status(400).send({ success: false, message: 'Cluster name in backup does not match target' });
        }
        const backupServers = (backupConfig.servers || []).map(s => s.name).sort();
        const targetServers = (targetConfig.servers || []).map(s => s.name).sort();
        if (backupServers.length !== targetServers.length || !backupServers.every((v, i) => v === targetServers[i])) {
          await fs.rm(tmpDir, { recursive: true, force: true });
          return reply.status(400).send({ success: false, message: 'Server names/count in backup do not match target cluster' });
        }
        // Overwrite saves/configs for matching servers
        for (const serverName of backupServers) {
          const src = path.join(extractedPath, serverName);
          const dest = path.join(targetClusterPath, serverName);
          // Overwrite Saved folder
          const srcSaved = path.join(src, 'ShooterGame', 'Saved');
          const destSaved = path.join(dest, 'ShooterGame', 'Saved');
          try {
            await fs.rm(destSaved, { recursive: true, force: true });
          } catch {}
          try {
            await fs.cp(srcSaved, destSaved, { recursive: true });
          } catch {}
          // Optionally overwrite configs (Game.ini, etc.)
          const srcConfig = path.join(src, 'ShooterGame', 'Config');
          const destConfig = path.join(dest, 'ShooterGame', 'Config');
          try {
            await fs.cp(srcConfig, destConfig, { recursive: true });
          } catch {}
        }
        await fs.rm(tmpDir, { recursive: true, force: true });
        return reply.send({ success: true, message: 'Cluster saves/configs restored to existing cluster' });
      } else {
        // Create new cluster from backup
        try {
          await fs.cp(extractedPath, targetClusterPath, { recursive: true });
        } catch (err) {
          await fs.rm(tmpDir, { recursive: true, force: true });
          return reply.status(500).send({ success: false, message: 'Failed to create new cluster from backup' });
        }
        await fs.rm(tmpDir, { recursive: true, force: true });
        return reply.send({ success: true, message: 'Cluster restored from backup (new cluster created)' });
      }
    } catch (error) {
      logger.error('Failed to restore cluster from backup:', error);
      return reply.status(500).send({ success: false, message: 'Failed to restore cluster from backup' });
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

  // List available backups for a cluster
  fastify.get('/api/provisioning/cluster-backups/:clusterName', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { clusterName } = request.params;
      const result = await provisioner.listClusterBackups(clusterName);
      return {
        success: true,
        message: 'Cluster backups retrieved successfully',
        data: result
      };
    } catch (error) {
      logger.error('Failed to list cluster backups:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Download cluster backup as ZIP
  fastify.get('/api/provisioning/clusters/:clusterName/download-backup', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { clusterName } = request.params;
      const { backup } = request.query;
      if (!backup) {
        return reply.status(400).send({ success: false, message: 'Missing backup parameter' });
      }
      // Backups are stored in ../backups/<backup>
      const backupsRoot = path.join(provisioner.clustersPath, '..', 'backups');
      const backupPath = path.join(backupsRoot, backup);
      // Check if backup folder exists
      try {
        await fs.access(backupPath);
      } catch {
        return reply.status(404).send({ success: false, message: 'Backup not found' });
      }
      // Set headers for ZIP download
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="${backup}.zip"`);
      // Stream ZIP
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.directory(backupPath, false);
      archive.finalize();
      return reply.send(archive);
    } catch (error) {
      logger.error('Failed to download cluster backup:', error);
      return reply.status(500).send({ success: false, message: 'Failed to download cluster backup' });
    }
  });

  // Download server backup as ZIP
  fastify.get('/api/provisioning/servers/:serverName/download-backup', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      const { backup } = request.query;
      if (!backup) {
        return reply.status(400).send({ success: false, message: 'Missing backup parameter' });
      }
      // Server backups are stored in ../backups/servers/<backup>
      const backupsRoot = path.join(provisioner.clustersPath, '..', 'backups', 'servers');
      const backupPath = path.join(backupsRoot, backup);
      // Check if backup folder exists
      try {
        await fs.access(backupPath);
      } catch {
        return reply.status(404).send({ success: false, message: 'Backup not found' });
      }
      // Set headers for ZIP download
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="${backup}.zip"`);
      // Stream ZIP
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.directory(backupPath, false);
      archive.finalize();
      return reply.send(archive);
    } catch (error) {
      logger.error('Failed to download server backup:', error);
      return reply.status(500).send({ success: false, message: 'Failed to download server backup' });
    }
  });

  // Restore server from backup ZIP
  fastify.post('/api/provisioning/servers/:serverName/restore-backup', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      const data = await request.parts();
      let filePart = null;
      for await (const part of data) {
        if (part.type === 'file' && part.fieldname === 'file') filePart = part;
      }
      if (!filePart) {
        return reply.status(400).send({ success: false, message: 'Missing file' });
      }
      // Save uploaded ZIP to temp file
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'server-restore-'));
      const zipPath = path.join(tmpDir, 'backup.zip');
      const out = await fs.open(zipPath, 'w');
      for await (const chunk of filePart.file) {
        await out.write(chunk);
      }
      await out.close();
      // Extract ZIP
      await fs.mkdir(path.join(tmpDir, 'extracted'));
      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: path.join(tmpDir, 'extracted') }));
        stream.on('close', resolve);
        stream.on('error', reject);
      });
      // Find the server in clusters
      const clusters = await provisioner.listClusters();
      let targetServerPath = null;
      let targetClusterName = null;
      for (const cluster of clusters) {
        if (cluster.config && cluster.config.servers) {
          const server = cluster.config.servers.find(s => s.name === serverName);
          if (server) {
            targetServerPath = path.join(provisioner.clustersPath, cluster.name, serverName);
            targetClusterName = cluster.name;
            break;
          }
        }
      }
      if (!targetServerPath) {
        await fs.rm(tmpDir, { recursive: true, force: true });
        return reply.status(404).send({ success: false, message: 'Target server not found' });
      }
      // Overwrite saves/configs from backup
      const extractedPath = path.join(tmpDir, 'extracted');
      const srcSaved = path.join(extractedPath, 'ShooterGame', 'Saved');
      const destSaved = path.join(targetServerPath, 'ShooterGame', 'Saved');
      const srcConfig = path.join(extractedPath, 'ShooterGame', 'Config');
      const destConfig = path.join(targetServerPath, 'ShooterGame', 'Config');
      // Overwrite Saved folder
      try {
        await fs.rm(destSaved, { recursive: true, force: true });
      } catch {}
      try {
        await fs.cp(srcSaved, destSaved, { recursive: true });
      } catch {}
      // Overwrite configs
      try {
        await fs.cp(srcConfig, destConfig, { recursive: true });
      } catch {}
      await fs.rm(tmpDir, { recursive: true, force: true });
      return reply.send({ success: true, message: 'Server saves/configs restored successfully' });
    } catch (error) {
      logger.error('Failed to restore server from backup:', error);
      return reply.status(500).send({ success: false, message: 'Failed to restore server from backup' });
    }
  });

  // Debug endpoint for troubleshooting
  fastify.get('/api/provisioning/debug', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      // Helper function to clean Windows paths
      const cleanPath = (path) => {
        if (typeof path === 'string') {
          // Replace double backslashes with single backslashes (handles .env file format)
          return path.replace(/\\\\/g, '\\');
        }
        return path;
      };

      // Helper function to recursively clean paths in objects
      const cleanPathsInObject = (obj) => {
        if (typeof obj !== 'object' || obj === null) {
          return cleanPath(obj);
        }
        
        if (Array.isArray(obj)) {
          return obj.map(cleanPathsInObject);
        }
        
        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
          cleaned[key] = cleanPathsInObject(value);
        }
        return cleaned;
      };

      // Get environment variables and clean them
      const envVars = {
        NATIVE_BASE_PATH: process.env.NATIVE_BASE_PATH,
        NATIVE_CLUSTERS_PATH: process.env.NATIVE_CLUSTERS_PATH,
        NATIVE_SERVERS_PATH: process.env.NATIVE_SERVERS_PATH
      };

      const debugInfo = {
        timestamp: new Date().toISOString(),
        environment: cleanPathsInObject(envVars),
        config: cleanPathsInObject({
          server: {
            native: {
              basePath: config.server?.native?.basePath,
              clustersPath: config.server?.native?.clustersPath,
              serversPath: config.server?.native?.serversPath
            }
          }
        }),
        provisioner: cleanPathsInObject({
          basePath: provisioner.basePath,
          clustersPath: provisioner.clustersPath,
          serversPath: provisioner.serversPath
        }),
        clusters: [],
        errors: []
      };

      // Try to list clusters
      try {
        const clusters = await provisioner.listClusters();
        debugInfo.clusters = clusters.map(cluster => ({
          name: cluster.name,
          path: cleanPath(cluster.path),
          serverCount: cluster.config?.servers?.length || 0,
          servers: cluster.config?.servers?.map(s => ({
            name: s.name,
            serverPath: cleanPath(s.serverPath),
            map: s.map,
            gamePort: s.gamePort
          })) || []
        }));
      } catch (error) {
        debugInfo.errors.push(`Failed to list clusters: ${error.message}`);
      }

      return reply.send(debugInfo);
    } catch (error) {
      logger.error('Debug endpoint error:', error);
      return reply.status(500).send({
        success: false,
        message: error.message,
        stack: error.stack
      });
    }
  });
} 
