import Docker from 'dockerode';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { 
  incrementContainerOperation, 
  recordContainerOperationDuration,
  updateArkServerStatus 
} from '../metrics/index.js';

class DockerService {
  constructor() {
    this.docker = new Docker({
      socketPath: config.docker.socketPath
    });
    this.activeLogStreams = new Map(); // Track active log streams
  }

  /**
   * List all ASA containers with their status
   */
  async listContainers() {
    try {
      const containers = await this.docker.listContainers({ all: true });
      
      // Filter for ASA containers (you may need to adjust this filter based on your naming convention)
      const asaContainers = containers.filter(container => 
        container.Names.some(name => name.includes('asa') || name.includes('ark'))
      );

      const containerDetails = await Promise.all(
        asaContainers.map(async (container) => {
          const containerObj = this.docker.getContainer(container.Id);
          const stats = await containerObj.stats({ stream: false });
          
          return {
            id: container.Id,
            name: container.Names[0].replace('/', ''),
            image: container.Image,
            status: container.State,
            created: container.Created,
            ports: container.Ports,
            labels: container.Labels,
            memoryUsage: stats?.memory_stats?.usage || 0,
            cpuUsage: stats?.cpu_stats?.cpu_usage?.total_usage || 0
          };
        })
      );

      // Update metrics
      const runningCount = containerDetails.filter(c => c.status === 'running').length;
      containerDetails.forEach(container => {
        updateArkServerStatus(container.name, container.labels?.map_name || 'unknown', container.status === 'running');
      });

      return containerDetails;
    } catch (error) {
      // Check if it's a Docker connection error
      if (error.code === 'ENOENT' && error.message.includes('docker_engine')) {
        logger.warn('Docker is not running or not accessible. Returning empty container list.');
        return [];
      }
      
      logger.error('Error listing containers:', error);
      throw new Error('Failed to list containers');
    }
  }

  /**
   * Start a container
   */
  async startContainer(containerName) {
    const startTime = Date.now();
    try {
      const container = this.docker.getContainer(containerName);
      await container.start();
      
      const duration = (Date.now() - startTime) / 1000;
      incrementContainerOperation('start', containerName, 'success');
      recordContainerOperationDuration('start', containerName, duration);
      
      logger.info(`Container ${containerName} started successfully`);
      return { success: true, message: `Container ${containerName} started` };
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      incrementContainerOperation('start', containerName, 'error');
      recordContainerOperationDuration('start', containerName, duration);
      
      logger.error(`Error starting container ${containerName}:`, error);
      throw new Error(`Failed to start container ${containerName}`);
    }
  }

  /**
   * Stop a container
   */
  async stopContainer(containerName) {
    const startTime = Date.now();
    try {
      const container = this.docker.getContainer(containerName);
      await container.stop();
      
      const duration = (Date.now() - startTime) / 1000;
      incrementContainerOperation('stop', containerName, 'success');
      recordContainerOperationDuration('stop', containerName, duration);
      
      logger.info(`Container ${containerName} stopped successfully`);
      return { success: true, message: `Container ${containerName} stopped` };
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      incrementContainerOperation('stop', containerName, 'error');
      recordContainerOperationDuration('stop', containerName, duration);
      
      logger.error(`Error stopping container ${containerName}:`, error);
      throw new Error(`Failed to stop container ${containerName}`);
    }
  }

  /**
   * Restart a container
   */
  async restartContainer(containerName) {
    const startTime = Date.now();
    try {
      const container = this.docker.getContainer(containerName);
      await container.restart();
      
      const duration = (Date.now() - startTime) / 1000;
      incrementContainerOperation('restart', containerName, 'success');
      recordContainerOperationDuration('restart', containerName, duration);
      
      logger.info(`Container ${containerName} restarted successfully`);
      return { success: true, message: `Container ${containerName} restarted` };
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      incrementContainerOperation('restart', containerName, 'error');
      recordContainerOperationDuration('restart', containerName, duration);
      
      logger.error(`Error restarting container ${containerName}:`, error);
      throw new Error(`Failed to restart container ${containerName}`);
    }
  }

  /**
   * Get container logs
   */
  async getContainerLogs(containerName, options = {}) {
    try {
      const container = this.docker.getContainer(containerName);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: options.tail || 100,
        ...options
      });
      
      return logs.toString('utf8');
    } catch (error) {
      logger.error(`Error getting logs for container ${containerName}:`, error);
      throw new Error(`Failed to get logs for container ${containerName}`);
    }
  }

  /**
   * Get container stats
   */
  async getContainerStats(containerName) {
    try {
      const container = this.docker.getContainer(containerName);
      const stats = await container.stats({ stream: false });
      
      return {
        memory: {
          usage: stats.memory_stats.usage || 0,
          limit: stats.memory_stats.limit || 0,
          percentage: stats.memory_stats.limit ? 
            ((stats.memory_stats.usage / stats.memory_stats.limit) * 100).toFixed(2) : 0
        },
        cpu: {
          usage: stats.cpu_stats.cpu_usage.total_usage || 0,
          systemUsage: stats.cpu_stats.system_cpu_usage || 0,
          percentage: this.calculateCpuPercentage(stats)
        },
        network: stats.networks || {},
        timestamp: stats.read
      };
    } catch (error) {
      logger.error(`Error getting stats for container ${containerName}:`, error);
      throw new Error(`Failed to get stats for container ${containerName}`);
    }
  }

  /**
   * Calculate CPU percentage from Docker stats
   */
  calculateCpuPercentage(stats) {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - (stats.precpu_stats?.cpu_usage?.total_usage || 0);
    const systemDelta = stats.cpu_stats.system_cpu_usage - (stats.precpu_stats?.system_cpu_usage || 0);
    
    if (systemDelta > 0 && cpuDelta > 0) {
      return ((cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100).toFixed(2);
    }
    return 0;
  }

  /**
   * Start Socket.IO log streaming for a container
   */
  async startLogStreaming(containerName, tail = 100, io) {
    try {
      // Stop existing stream if any
      await this.stopLogStreaming(containerName);
      
      const container = this.docker.getContainer(containerName);
      const logStream = await container.logs({
        stdout: true,
        stderr: true,
        tail: tail,
        follow: true
      });

      // Store the stream reference
      this.activeLogStreams.set(containerName, logStream);

      logStream.on('data', (chunk) => {
        const logMessage = {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: chunk.toString('utf8').trim(),
          container: containerName
        };

        // Emit to all clients in the logs room for this container
        io.to(`logs-${containerName}`).emit('log', logMessage);
      });

      logStream.on('end', () => {
        logger.info(`Log stream ended for container ${containerName}`);
        this.activeLogStreams.delete(containerName);
      });

      logStream.on('error', (error) => {
        logger.error(`Log stream error for container ${containerName}:`, error);
        this.activeLogStreams.delete(containerName);
      });

      logger.info(`Started Socket.IO log streaming for container ${containerName}`);
    } catch (error) {
      logger.error(`Error starting log streaming for container ${containerName}:`, error);
      throw new Error(`Failed to start log streaming for container ${containerName}`);
    }
  }

  /**
   * Stop Socket.IO log streaming for a container
   */
  async stopLogStreaming(containerName) {
    try {
      const logStream = this.activeLogStreams.get(containerName);
      if (logStream) {
        logStream.destroy();
        this.activeLogStreams.delete(containerName);
        logger.info(`Stopped Socket.IO log streaming for container ${containerName}`);
      }
    } catch (error) {
      logger.error(`Error stopping log streaming for container ${containerName}:`, error);
      throw new Error(`Failed to stop log streaming for container ${containerName}`);
    }
  }

  /**
   * Stop all active log streams
   */
  async stopAllLogStreams() {
    try {
      for (const [containerName, logStream] of this.activeLogStreams) {
        logStream.destroy();
        logger.info(`Stopped log streaming for container ${containerName}`);
      }
      this.activeLogStreams.clear();
    } catch (error) {
      logger.error('Error stopping all log streams:', error);
    }
  }
}

export default new DockerService(); 
