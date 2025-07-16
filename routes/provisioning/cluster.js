import path from 'path';
import { requirePermission } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';
import config from '../../config/index.js';
import { ServerProvisioner } from '../../services/server-provisioner.js';
import { createServerManager } from '../../services/server-manager.js';
import { createJob, updateJob, addJobProgress } from '../../services/job-manager.js';

// Register cluster-related provisioning routes
export default async function clusterRoutes(fastify) {
  const provisioner = new ServerProvisioner();

  // Create individual server
  fastify.post('/api/provisioning/create-server', {
    preHandler: requirePermission('write')
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
        tamingMultiplier = 5.0
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
        tamingMultiplier
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
    preHandler: requirePermission('write')
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
        foreground = false
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
        tamingMultiplier
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
} 
