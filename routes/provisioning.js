import fastify from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import { requirePermission } from '../middleware/auth.js';
import { ServerProvisioner } from '../services/server-provisioner.js';
import { createJob, updateJob, addJobProgress, getJob, getAllJobs } from '../services/job-manager.js';
import { createServerManager } from '../services/server-manager.js';

const execAsync = promisify(exec);

export default async function provisioningRoutes(fastify) {
  const provisioner = new ServerProvisioner();

  // Get cluster wizard options
  fastify.get('/api/provisioning/wizard-options', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const options = {
        steamcmdPaths: await getSteamCmdPaths(),
        availableDrives: await getAvailableDrives(),
        defaultPaths: {
          steamcmd: 'C:\\SteamCMD',
          basePath: 'C:\\ASA-Servers',
          clustersPath: 'C:\\ASA-Servers\\Clusters',
          serversPath: 'C:\\ASA-Servers\\Servers'
        },
        mode: config.server.mode,
        powershellEnabled: process.env.POWERSHELL_ENABLED === 'true'
      };
      
      return {
        success: true,
        options
      };
    } catch (error) {
      logger.error('Failed to get wizard options:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get wizard options'
      });
    }
  });

  // Initialize system
  fastify.post('/api/provisioning/initialize', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const result = await provisioner.initialize();
      
      // Get updated system info after initialization
      const systemInfo = await provisioner.getSystemInfo();
      
      return {
        success: true,
        message: 'System initialized successfully',
        data: {
          ...result,
          systemInfo
        }
      };
    } catch (error) {
      logger.error('Failed to initialize system:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to initialize system'
      });
    }
  });

  // Install SteamCMD
  fastify.post('/api/provisioning/install-steamcmd', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { steamcmdPath, foreground = false } = request.body;
      
      if (steamcmdPath) {
        provisioner.steamCmdPath = steamcmdPath;
        provisioner.steamCmdExe = path.join(steamcmdPath, 'steamcmd.exe');
      }
      
      await provisioner.installSteamCmd(foreground);
      
      return {
        success: true,
        message: 'SteamCMD installed successfully'
      };
    } catch (error) {
      logger.error('Failed to install SteamCMD:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to install SteamCMD'
      });
    }
  });

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

  // Create cluster
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

  // Update server binaries
  fastify.post('/api/provisioning/update-server', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { serverName } = request.body;
      
      if (!serverName) {
        return reply.status(400).send({
          success: false,
          message: 'Server name is required'
        });
      }

      const result = await provisioner.updateServerBinaries(serverName);
      
      return {
        success: true,
        message: `Server ${serverName} updated successfully`,
        data: result
      };
    } catch (error) {
      logger.error('Failed to update server:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update server'
      });
    }
  });

  // Install ASA binaries
  fastify.post('/api/provisioning/install-asa-binaries', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { foreground = false } = request.body;
      
      const result = await provisioner.installASABinaries(foreground);
      
      return {
        success: true,
        message: 'ASA binaries installed successfully',
        data: result
      };
    } catch (error) {
      logger.error('Failed to install ASA binaries:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to install ASA binaries'
      });
    }
  });

  // Update all servers
  fastify.post('/api/provisioning/update-all-servers', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const result = await provisioner.updateAllServerBinaries();
      
      return {
        success: true,
        message: 'All servers updated successfully',
        data: result
      };
    } catch (error) {
      logger.error('Failed to update all servers:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update all servers'
      });
    }
  });

  // List servers
  fastify.get('/api/provisioning/servers', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const servers = await provisioner.listServers();
      
      return {
        success: true,
        servers
      };
    } catch (error) {
      logger.error('Failed to list servers:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to list servers'
      });
    }
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
        
        // Emit progress if Socket.IO is available
        if (io) {
          io.emit('job-progress', { 
            jobId: job.id, 
            status: 'running',
            progress: 0,
            message: 'Starting cluster creation...' 
          });
        }
        
        // Wrap provisioner.createCluster to emit progress
        const progressCb = (msg) => {
          addJobProgress(job.id, msg);
          if (io) {
            io.emit('job-progress', { 
              jobId: job.id, 
              status: 'running',
              progress: 0, // Will be calculated based on steps
              message: msg 
            });
          }
        };
        
        // Patch provisioner to emit progress
        provisioner.emitProgress = progressCb;
        
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

  // List all jobs
  fastify.get('/api/provisioning/jobs', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    const jobs = getAllJobs();
    reply.send({ success: true, jobs });
  });

  // Job status endpoint
  fastify.get('/api/provisioning/jobs/:jobId', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    const job = getJob(request.params.jobId);
    if (!job) return reply.status(404).send({ success: false, message: 'Job not found' });
    reply.send({ success: true, job });
  });

  // Delete server
  fastify.delete('/api/provisioning/servers/:serverName', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      const result = await provisioner.deleteServer(serverName);
      
      return {
        success: true,
        message: `Server ${serverName} deleted successfully`,
        data: result
      };
    } catch (error) {
      logger.error('Failed to delete server:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to delete server'
      });
    }
  });

  // Get shared mods configuration
  fastify.get('/api/provisioning/shared-mods', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const sharedModsPath = path.join(config.server.native.basePath, 'shared-mods.json');
      
      try {
        const sharedModsData = await fs.readFile(sharedModsPath, 'utf8');
        const sharedMods = JSON.parse(sharedModsData);
        
        return {
          success: true,
          sharedMods: sharedMods.modList || []
        };
      } catch (fileError) {
        // If file doesn't exist, return empty mod list
        return {
          success: true,
          sharedMods: []
        };
      }
    } catch (error) {
      logger.error('Failed to get shared mods:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get shared mods configuration'
      });
    }
  });

  // Update shared mods configuration
  fastify.put('/api/provisioning/shared-mods', {
    preHandler: requirePermission('write'),
    schema: {
      body: {
        type: 'object',
        required: ['modList'],
        properties: {
          modList: {
            type: 'array',
            items: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { modList } = request.body;
      const sharedModsPath = path.join(config.server.native.basePath, 'shared-mods.json');
      
      const sharedModsData = {
        modList: modList || [],
        updatedAt: new Date().toISOString()
      };
      
      await fs.writeFile(sharedModsPath, JSON.stringify(sharedModsData, null, 2));
      
      logger.info('Shared mods configuration updated');
      
      // Regenerate start.bat files for all cluster servers
      await regenerateAllClusterStartScripts();
      
      return {
        success: true,
        message: 'Shared mods configuration updated successfully. Server start scripts have been regenerated.'
      };
    } catch (error) {
      logger.error('Failed to update shared mods:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update shared mods configuration'
      });
    }
  });

  // Get server-specific mods configuration
  fastify.get('/api/provisioning/server-mods/:serverName', {
    preHandler: requirePermission('read'),
    schema: {
      params: {
        type: 'object',
        required: ['serverName'],
        properties: {
          serverName: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      const serverModsPath = path.join(config.server.native.basePath, 'server-mods', `${serverName}.json`);
      
      try {
        const serverModsData = await fs.readFile(serverModsPath, 'utf8');
        const serverConfig = JSON.parse(serverModsData);
        
        return {
          success: true,
          serverConfig: {
            additionalMods: serverConfig.additionalMods || [],
            excludeSharedMods: serverConfig.excludeSharedMods || false
          }
        };
      } catch (fileError) {
        // Check if this is a Club ARK server and set defaults
        const isClubArkServer = serverName.toLowerCase().includes('club') || 
                               serverName.toLowerCase().includes('bobs');
        
        if (isClubArkServer) {
          return {
            success: true,
            serverConfig: {
              additionalMods: [1005639], // Club ARK mod
              excludeSharedMods: true // Exclude shared mods
            }
          };
        }
        
        // Return empty configuration for other servers
        return {
          success: true,
          serverConfig: {
            additionalMods: [],
            excludeSharedMods: false
          }
        };
      }
    } catch (error) {
      logger.error('Failed to get server mods:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get server mods configuration'
      });
    }
  });

  // Update server-specific mods configuration
  fastify.put('/api/provisioning/server-mods/:serverName', {
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
        required: ['additionalMods', 'excludeSharedMods'],
        properties: {
          additionalMods: {
            type: 'array',
            items: { type: 'number' }
          },
          excludeSharedMods: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      const { additionalMods, excludeSharedMods } = request.body;
      
      const serverModsDir = path.join(config.server.native.basePath, 'server-mods');
      const serverModsPath = path.join(serverModsDir, `${serverName}.json`);
      
      // Ensure directory exists
      await fs.mkdir(serverModsDir, { recursive: true });
      
      const serverConfig = {
        additionalMods: additionalMods || [],
        excludeSharedMods: excludeSharedMods || false,
        updatedAt: new Date().toISOString()
      };
      
      await fs.writeFile(serverModsPath, JSON.stringify(serverConfig, null, 2));
      
      logger.info(`Server mods configuration updated for ${serverName}`);
      
      // Regenerate start.bat for this specific server
      await regenerateServerStartScript(serverName);
      
      return {
        success: true,
        message: `Server mods configuration for ${serverName} updated successfully. Start script has been regenerated.`
      };
    } catch (error) {
      logger.error('Failed to update server mods:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update server mods configuration'
      });
    }
  });

  // Get all mods configuration (for overview)
  fastify.get('/api/provisioning/mods-overview', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const sharedModsPath = path.join(config.server.native.basePath, 'shared-mods.json');
      const serverModsDir = path.join(config.server.native.basePath, 'server-mods');
      
      let sharedMods = [];
      let serverMods = {};
      
      // Get shared mods
      try {
        const sharedModsData = await fs.readFile(sharedModsPath, 'utf8');
        const sharedModsConfig = JSON.parse(sharedModsData);
        sharedMods = sharedModsConfig.modList || [];
      } catch (error) {
        // Shared mods file doesn't exist
      }
      
      // Get server-specific mods
      try {
        const serverModFiles = await fs.readdir(serverModsDir);
        for (const fileName of serverModFiles) {
          if (fileName.endsWith('.json')) {
            const serverName = fileName.replace('.json', '');
            const serverModsPath = path.join(serverModsDir, fileName);
            const serverModsData = await fs.readFile(serverModsPath, 'utf8');
            const serverModsConfig = JSON.parse(serverModsData);
            serverMods[serverName] = serverModsConfig;
          }
        }
      } catch (error) {
        // Server mods directory doesn't exist
      }
      
      return {
        success: true,
        sharedMods,
        serverMods
      };
    } catch (error) {
      logger.error('Failed to get mods overview:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get mods overview'
      });
    }
  });

  // Get system logs
  fastify.get('/api/provisioning/system-logs', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { type = 'all', lines = 100 } = request.query;
      const logTypes = ['api', 'server', 'docker', 'system'];
      
      if (type !== 'all' && !logTypes.includes(type)) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid log type. Must be one of: all, api, server, docker, system'
        });
      }

      const logs = {};
      
      // Define log directory - try multiple possible locations
      const possibleLogDirs = [
        'C:\\ASA-API\\logs',
        path.join(process.cwd(), 'logs'),
        path.join(process.cwd(), '..', 'logs'),
        'C:\\logs'
      ];
      
      let logDir = null;
      for (const dir of possibleLogDirs) {
        try {
          await fs.access(dir);
          logDir = dir;
          break;
        } catch (error) {
          // Continue to next directory
        }
      }
      
      if (!logDir) {
        logs.api = 'No log directory found. Tried: ' + possibleLogDirs.join(', ');
        logs.server = 'No log directory found';
        logs.docker = 'No log directory found';
        logs.system = 'No log directory found';
      } else {
        if (type === 'all' || type === 'api') {
          try {
            // Try multiple API log file names
            const apiLogFiles = ['combined.log', 'api.log', 'app.log', 'server.log'];
            let apiLogContent = '';
            
            for (const fileName of apiLogFiles) {
              try {
                const apiLogPath = path.join(logDir, fileName);
                apiLogContent = await fs.readFile(apiLogPath, 'utf8');
                logs.api = `Log file: ${fileName}\n\n` + apiLogContent.split('\n').slice(-lines).join('\n');
                break;
              } catch (error) {
                // Continue to next file
              }
            }
            
            if (!apiLogContent) {
              logs.api = `No API log files found in ${logDir}. Tried: ${apiLogFiles.join(', ')}`;
            }
          } catch (error) {
            logs.api = `Error reading API logs: ${error.message}`;
          }
        }
        
        if (type === 'all' || type === 'server') {
          try {
            // Try multiple server log file names
            const serverLogFiles = ['server.log', 'server-manager.log', 'combined.log'];
            let serverLogContent = '';
            
            for (const fileName of serverLogFiles) {
              try {
                const serverLogPath = path.join(logDir, fileName);
                serverLogContent = await fs.readFile(serverLogPath, 'utf8');
                logs.server = `Log file: ${fileName}\n\n` + serverLogContent.split('\n').slice(-lines).join('\n');
                break;
              } catch (error) {
                // Continue to next file
              }
            }
            
            if (!serverLogContent) {
              logs.server = `No server log files found in ${logDir}. Tried: ${serverLogFiles.join(', ')}`;
            }
          } catch (error) {
            logs.server = `Error reading server logs: ${error.message}`;
          }
        }
        
        if (type === 'all' || type === 'docker') {
          try {
            // Try multiple docker log file names
            const dockerLogFiles = ['docker.log', 'container.log', 'combined.log'];
            let dockerLogContent = '';
            
            for (const fileName of dockerLogFiles) {
              try {
                const dockerLogPath = path.join(logDir, fileName);
                dockerLogContent = await fs.readFile(dockerLogPath, 'utf8');
                logs.docker = `Log file: ${fileName}\n\n` + dockerLogContent.split('\n').slice(-lines).join('\n');
                break;
              } catch (error) {
                // Continue to next file
              }
            }
            
            if (!dockerLogContent) {
              logs.docker = `No Docker log files found in ${logDir}. Tried: ${dockerLogFiles.join(', ')}`;
            }
          } catch (error) {
            logs.docker = `Error reading Docker logs: ${error.message}`;
          }
        }
        
        if (type === 'all' || type === 'system') {
          try {
            // Try multiple system log file names
            const systemLogFiles = ['error.log', 'nssm-err.log', 'nssm-out.log', 'system.log', 'combined.log'];
            let systemLogContent = '';
            
            for (const fileName of systemLogFiles) {
              try {
                const systemLogPath = path.join(logDir, fileName);
                systemLogContent = await fs.readFile(systemLogPath, 'utf8');
                logs.system = `Log file: ${fileName}\n\n` + systemLogContent.split('\n').slice(-lines).join('\n');
                break;
              } catch (error) {
                // Continue to next file
              }
            }
            
            if (!systemLogContent) {
              logs.system = `No system log files found in ${logDir}. Tried: ${systemLogFiles.join(', ')}`;
            }
          } catch (error) {
            logs.system = `Error reading system logs: ${error.message}`;
          }
        }
      }
      
      return {
        success: true,
        logs,
        type,
        lines: parseInt(lines)
      };
    } catch (error) {
      logger.error('Failed to get system logs:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get system logs'
      });
    }
  });

  // Get global config files
  fastify.get('/api/provisioning/global-configs', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const globalConfigsPath = path.join(config.server.native.basePath, 'global-configs');
      
      let gameIni = '';
      let gameUserSettingsIni = '';
      
      try {
        const gameIniPath = path.join(globalConfigsPath, 'Game.ini');
        gameIni = await fs.readFile(gameIniPath, 'utf8');
      } catch (error) {
        // Game.ini doesn't exist
      }
      
      try {
        const gameUserSettingsIniPath = path.join(globalConfigsPath, 'GameUserSettings.ini');
        gameUserSettingsIni = await fs.readFile(gameUserSettingsIniPath, 'utf8');
      } catch (error) {
        // GameUserSettings.ini doesn't exist
      }
      
      return {
        success: true,
        gameIni,
        gameUserSettingsIni
      };
    } catch (error) {
      logger.error('Failed to get global configs:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get global configs'
      });
    }
  });

  // Update global config files
  fastify.put('/api/provisioning/global-configs', {
    preHandler: requirePermission('write'),
    schema: {
      body: {
        type: 'object',
        properties: {
          gameIni: { type: 'string' },
          gameUserSettingsIni: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { gameIni, gameUserSettingsIni } = request.body;
      const globalConfigsPath = path.join(config.server.native.basePath, 'global-configs');
      
      // Ensure directory exists
      await fs.mkdir(globalConfigsPath, { recursive: true });
      
      // Save Game.ini if provided
      if (gameIni !== undefined) {
        const gameIniPath = path.join(globalConfigsPath, 'Game.ini');
        await fs.writeFile(gameIniPath, gameIni);
      }
      
      // Save GameUserSettings.ini if provided
      if (gameUserSettingsIni !== undefined) {
        const gameUserSettingsIniPath = path.join(globalConfigsPath, 'GameUserSettings.ini');
        await fs.writeFile(gameUserSettingsIniPath, gameUserSettingsIni);
      }
      
      logger.info('Global config files updated');
      
      // Regenerate start scripts for all servers to apply new configs
      await regenerateAllClusterStartScripts();
      
      return {
        success: true,
        message: 'Global config files updated successfully. Server configs have been regenerated.'
      };
    } catch (error) {
      logger.error('Failed to update global configs:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update global configs'
      });
    }
  });

  // Get server config exclusion list
  fastify.get('/api/provisioning/config-exclusions', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const exclusionsPath = path.join(config.server.native.basePath, 'config-exclusions.json');
      
      let excludedServers = [];
      
      try {
        const exclusionsData = await fs.readFile(exclusionsPath, 'utf8');
        const exclusionsConfig = JSON.parse(exclusionsData);
        excludedServers = exclusionsConfig.excludedServers || [];
      } catch (error) {
        // Exclusions file doesn't exist
      }
      
      return {
        success: true,
        excludedServers
      };
    } catch (error) {
      logger.error('Failed to get config exclusions:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get config exclusions'
      });
    }
  });

  // Update server config exclusion list
  fastify.put('/api/provisioning/config-exclusions', {
    preHandler: requirePermission('write'),
    schema: {
      body: {
        type: 'object',
        required: ['excludedServers'],
        properties: {
          excludedServers: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { excludedServers } = request.body;
      
      const exclusionsPath = path.join(config.server.native.basePath, 'config-exclusions.json');
      
      const exclusionsData = {
        excludedServers: excludedServers || [],
        updatedAt: new Date().toISOString()
      };
      
      await fs.writeFile(exclusionsPath, JSON.stringify(exclusionsData, null, 2));
      
      logger.info('Config exclusions updated');
      
      return {
        success: true,
        message: 'Config exclusions updated successfully'
      };
    } catch (error) {
      logger.error('Failed to update config exclusions:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update config exclusions'
      });
    }
  });

  // Regenerate all start scripts with current mod configurations
  fastify.post('/api/provisioning/regenerate-start-scripts', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      await regenerateAllClusterStartScripts();
      
      return {
        success: true,
        message: 'All start scripts have been regenerated with current mod configurations'
      };
    } catch (error) {
      logger.error('Failed to regenerate start scripts:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to regenerate start scripts'
      });
    }
  });

  // Delete cluster
  fastify.delete('/api/provisioning/clusters/:clusterName', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { clusterName } = request.params;
      const { force } = request.query;
      
      if (force === 'true') {
        // Force delete - remove cluster directory without checking config
        const clusterPath = path.join(provisioner.clustersPath, clusterName);
        try {
          const { execSync } = await import('child_process');
          execSync(`rmdir /s /q "${clusterPath}"`, { stdio: 'inherit' });
          logger.info(`Force deleted cluster: ${clusterName}`);
          return {
            success: true,
            message: `Cluster ${clusterName} force deleted successfully`,
            data: { force: true }
          };
        } catch (error) {
          logger.error(`Failed to force delete cluster ${clusterName}:`, error);
          return reply.status(500).send({
            success: false,
            message: `Failed to force delete cluster: ${error.message}`
          });
        }
      } else {
        // Normal delete
        const result = await provisioner.deleteCluster(clusterName);
        
        return {
          success: true,
          message: `Cluster ${clusterName} deleted successfully`,
          data: result
        };
      }
    } catch (error) {
      logger.error('Failed to delete cluster:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to delete cluster'
      });
    }
  });

  // Get system status
  fastify.get('/api/provisioning/status', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const status = await getInstallationStatus();
      
      return {
        success: true,
        status
      };
    } catch (error) {
      logger.error('Failed to get installation status:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get installation status'
      });
    }
  });

  // Get system info
  fastify.get('/api/provisioning/system-info', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const systemInfo = await provisioner.getSystemInfo();
      
      return {
        success: true,
        status: systemInfo
      };
    } catch (error) {
      logger.error('Failed to get system info:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get system info'
      });
    }
  });

  // Get system requirements
  fastify.get('/api/provisioning/requirements', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const systemInfo = await provisioner.getSystemInfo();
      const diskSpace = await provisioner.getDiskSpace();
      const memoryInfo = await provisioner.getMemoryInfo();
      
      const requirements = {
        system: systemInfo,
        disk: diskSpace,
        memory: memoryInfo,
        recommendations: {
          minRam: '8GB',
          recommendedRam: '16GB',
          minDisk: '50GB per server',
          recommendedDisk: '100GB per server',
          minCpu: '2 cores per server',
          recommendedCpu: '4 cores per server'
        }
      };
      
      return {
        success: true,
        requirements
      };
    } catch (error) {
      logger.error('Failed to get system requirements:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get system requirements'
      });
    }
  });
}

// Helper functions
async function getSteamCmdPaths() {
  const commonPaths = [
    'C:\\Steam\\steamcmd',
    'C:\\Program Files\\Steam\\steamcmd',
    'C:\\Program Files (x86)\\Steam\\steamcmd',
    path.join(process.env.USERPROFILE || '', 'Steam', 'steamcmd'),
    path.join(process.env.LOCALAPPDATA || '', 'Steam', 'steamcmd')
  ];

  const validPaths = [];
  for (const steamCmdPath of commonPaths) {
    try {
      await fs.access(path.join(steamCmdPath, 'steamcmd.exe'));
      validPaths.push(steamCmdPath);
    } catch {
      // Path not accessible
    }
  }

  return validPaths;
}

async function getAvailableDrives() {
  if (process.platform !== 'win32') {
    return [];
  }

  try {
    const { execSync } = await import('child_process');
    const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' });
    const lines = output.split('\n').slice(1); // Skip header
    
    const drives = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const caption = parts[0];
        const freeSpace = parseInt(parts[1]);
        const size = parseInt(parts[2]);
        
        if (caption && !isNaN(freeSpace) && !isNaN(size)) {
          drives.push({
            drive: caption,
            freeSpace: Math.floor(freeSpace / (1024 * 1024 * 1024)), // GB
            totalSpace: Math.floor(size / (1024 * 1024 * 1024)), // GB
            freeSpacePercent: Math.floor((freeSpace / size) * 100)
          });
        }
      }
    }
    
    return drives;
  } catch (error) {
    logger.error('Failed to get available drives:', error);
    return [];
  }
}

async function getInstallationStatus() {
  try {
    const basePath = config.server.native.basePath || 'C:\\ASA-Servers';
    
    const status = {
      steamcmd: false,
      servers: [],
      clusters: []
    };
    
    // Check SteamCMD
    const steamcmdPath = process.env.STEAMCMD_PATH || 'C:\\SteamCMD';
    try {
      await fs.access(path.join(steamcmdPath, 'steamcmd.exe'));
      status.steamcmd = true;
    } catch {
      // SteamCMD not found
    }
    
    // Check servers
    try {
      const serversPath = path.join(basePath, 'servers');
      const servers = await fs.readdir(serversPath);
      status.servers = servers.filter(server => {
        try {
          return fs.statSync(path.join(serversPath, server)).isDirectory();
        } catch {
          return false;
        }
      });
    } catch {
      // No servers found
    }
    
    // Check clusters
    try {
      const clustersPath = path.join(basePath, 'clusters');
      const clusters = await fs.readdir(clustersPath);
      status.clusters = clusters.filter(cluster => {
        try {
          return fs.statSync(path.join(clustersPath, cluster)).isDirectory();
        } catch {
          return false;
        }
      });
    } catch {
      // No clusters found
    }
    
    return status;
  } catch (error) {
    logger.error('Failed to get installation status:', error);
    return {
      steamcmd: false,
      servers: [],
      clusters: []
    };
  }
} 

// Helper function to regenerate start.bat for a specific server
async function regenerateServerStartScript(serverName) {
  try {
    const clustersPath = config.server.native.clustersPath || path.join(config.server.native.basePath, 'clusters');
    
    // Find which cluster contains this server
    const clusterDirs = await fs.readdir(clustersPath);
    
    for (const clusterName of clusterDirs) {
      const clusterPath = path.join(clustersPath, clusterName);
      const clusterConfigPath = path.join(clusterPath, 'cluster.json');
      
      try {
        const clusterConfigContent = await fs.readFile(clusterConfigPath, 'utf8');
        const clusterConfig = JSON.parse(clusterConfigContent);
        
        // Find the server in this cluster
        const serverConfig = clusterConfig.servers?.find(s => s.name === serverName);
        if (serverConfig) {
          // Get mod configuration for this server
          const finalMods = await getFinalModListForServer(serverName);
          
          // Update server config with new mods
          serverConfig.mods = finalMods;
          
          // Update cluster config file
          await fs.writeFile(clusterConfigPath, JSON.stringify(clusterConfig, null, 2));
          
          // Regenerate start.bat file
          const serverPath = path.join(clusterPath, serverName);
          await provisioner.createStartScriptInCluster(clusterName, serverPath, serverConfig);
          
          logger.info(`Regenerated start.bat for server ${serverName} in cluster ${clusterName}`);
          return;
        }
      } catch (error) {
        // Continue to next cluster if this one fails
        logger.warn(`Failed to process cluster ${clusterName}:`, error.message);
      }
    }
    
    logger.warn(`Server ${serverName} not found in any cluster`);
  } catch (error) {
    logger.error(`Failed to regenerate start script for ${serverName}:`, error);
  }
}

// Helper function to regenerate all cluster start scripts
async function regenerateAllClusterStartScripts() {
  try {
    const clustersPath = config.server.native.clustersPath || path.join(config.server.native.basePath, 'clusters');
    
    if (!(await fs.access(clustersPath).catch(() => false))) {
      logger.info('No clusters directory found, skipping start script regeneration');
      return;
    }
    
    const clusterDirs = await fs.readdir(clustersPath);
    
    for (const clusterName of clusterDirs) {
      const clusterPath = path.join(clustersPath, clusterName);
      const clusterConfigPath = path.join(clusterPath, 'cluster.json');
      
      try {
        const clusterConfigContent = await fs.readFile(clusterConfigPath, 'utf8');
        const clusterConfig = JSON.parse(clusterConfigContent);
        
        // Update each server's mods and regenerate start.bat
        for (const serverConfig of clusterConfig.servers || []) {
          const finalMods = await getFinalModListForServer(serverConfig.name);
          serverConfig.mods = finalMods;
          
          const serverPath = path.join(clusterPath, serverConfig.name);
          await provisioner.createStartScriptInCluster(clusterName, serverPath, serverConfig);
        }
        
        // Update cluster config file
        await fs.writeFile(clusterConfigPath, JSON.stringify(clusterConfig, null, 2));
        
        logger.info(`Regenerated start scripts for cluster ${clusterName}`);
      } catch (error) {
        logger.warn(`Failed to regenerate start scripts for cluster ${clusterName}:`, error.message);
      }
    }
  } catch (error) {
    logger.error('Failed to regenerate all cluster start scripts:', error);
  }
}

// Helper function to get final mod list for a server (shared + server-specific)
async function getFinalModListForServer(serverName) {
  try {
    // Get shared mods
    const sharedModsPath = path.join(config.server.native.basePath, 'shared-mods.json');
    let sharedMods = [];
    
    try {
      const sharedModsData = await fs.readFile(sharedModsPath, 'utf8');
      const sharedModsConfig = JSON.parse(sharedModsData);
      sharedMods = sharedModsConfig.modList || [];
    } catch (error) {
      // Shared mods file doesn't exist, use empty array
    }
    
    // Get server-specific mods
    const serverModsPath = path.join(config.server.native.basePath, 'server-mods', `${serverName}.json`);
    let serverMods = [];
    let excludeSharedMods = false;
    
    try {
      const serverModsData = await fs.readFile(serverModsPath, 'utf8');
      const serverModsConfig = JSON.parse(serverModsData);
      serverMods = serverModsConfig.additionalMods || [];
      excludeSharedMods = serverModsConfig.excludeSharedMods || false;
    } catch (error) {
      // Server mods file doesn't exist, use defaults
      const isClubArkServer = serverName.toLowerCase().includes('club') || 
                             serverName.toLowerCase().includes('bobs');
      if (isClubArkServer) {
        serverMods = [1005639]; // Club ARK mod
        excludeSharedMods = true;
      }
    }
    
    // Combine mods based on configuration
    if (excludeSharedMods) {
      return serverMods;
    } else {
      // Combine shared and server-specific mods, removing duplicates
      const allMods = [...sharedMods, ...serverMods];
      return [...new Set(allMods)];
    }
  } catch (error) {
    logger.error(`Failed to get final mod list for ${serverName}:`, error);
    return [];
  }
} 
