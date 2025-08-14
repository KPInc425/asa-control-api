import { requirePermission } from '../middleware/auth.js';
// import arkLogsService from '../services/ark-logs.js';
import logger from '../utils/logger.js';
// import config from '../config/index.js';
import fs from 'fs/promises';
import path from 'path';

export default async function (fastify) {
  // Get available log files for a server
  fastify.get('/api/logs/:serverName/files', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      logger.info(`Getting available log files for server: ${serverName}`);
      
      // Simple response without file system operations
      return {
        success: true,
        serverName,
        logFiles: [],
        systemLogs: [],
        message: 'Logs endpoint working - file system operations disabled for debugging'
      };
    } catch (error) {
      logger.error(`Failed to get log files for server ${request.params.serverName}:`, error);
      
      // Return a more graceful error response instead of 500
      return reply.status(200).send({
        success: false,
        serverName: request.params.serverName,
        logFiles: [],
        message: 'Failed to get log files',
        error: error.message
      });
    }
  });

  // Get recent log content from a specific file
  fastify.get('/api/logs/:serverName/files/:fileName', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { serverName, fileName } = request.params;
      const { lines = 100 } = request.query;
      
      logger.info(`Getting recent logs from ${serverName}/${fileName} (${lines} lines)`);
      
      // Temporarily disabled arkLogsService
      return {
        success: true,
        serverName,
        fileName,
        content: 'arkLogsService temporarily disabled for debugging',
        lines: parseInt(lines),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to get log content for ${request.params.serverName}/${request.params.fileName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get log content',
        error: error.message
      });
    }
  });

  // Simple test endpoint to check if the route is working
  fastify.get('/api/logs/test', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      logger.info('Test endpoint called');
      return {
        success: true,
        message: 'Logs route is working',
        timestamp: new Date().toISOString(),
        env: {
          NATIVE_BASE_PATH: process.env.NATIVE_BASE_PATH
        }
      };
    } catch (error) {
      logger.error('Test endpoint error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Test endpoint failed',
        error: error.message
      });
    }
  });

  // Debug endpoint without auth for browser testing
  fastify.get('/api/logs/debug', async (request, reply) => {
    try {
      logger.info('Debug endpoint called');
      return {
        success: true,
        message: 'Logs route is working!',
        timestamp: new Date().toISOString(),
        env: {
          NATIVE_BASE_PATH: process.env.NATIVE_BASE_PATH,
          NODE_ENV: process.env.NODE_ENV
        }
      };
    } catch (error) {
      logger.error('Debug endpoint error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Debug endpoint failed',
        error: error.message
      });
    }
  });

  // Even simpler test endpoint without auth
  fastify.get('/api/logs/test-simple', async (request, reply) => {
    try {
      logger.info('Simple test endpoint called');
      return {
        success: true,
        message: 'Simple logs route is working',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Simple test endpoint error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Simple test endpoint failed',
        error: error.message
      });
    }
  });

  // Debug endpoint to check log file paths and content
  fastify.get('/api/logs/:serverName/debug', {
    // Temporarily remove auth requirement for debugging
    // preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      logger.info(`Debug: Getting log file info for server: ${serverName}`);
      
      // Get environment info for debugging
      const envInfo = {
        NATIVE_BASE_PATH: process.env.NATIVE_BASE_PATH,
        NATIVE_CLUSTERS_PATH: process.env.NATIVE_CLUSTERS_PATH,
        NATIVE_SERVERS_PATH: process.env.NATIVE_SERVERS_PATH,
        config_arkLogs_basePath: config.arkLogs.basePath,
        config_server_native_basePath: config.server?.native?.basePath
      };
      
      const logFiles = await arkLogsService.getAvailableLogs(serverName);
      
      // Get file stats for each log file
      const fileInfo = [];
      for (const file of logFiles) {
        try {
          const fs = await import('fs/promises');
          const stats = await fs.stat(file.path);
          fileInfo.push({
            name: file.name,
            path: file.path,
            size: file.size,
            lastModified: stats.mtime,
            created: stats.birthtime
          });
        } catch (error) {
          fileInfo.push({
            name: file.name,
            path: file.path,
            size: file.size,
            error: error.message
          });
        }
      }
      
      return {
        success: true,
        serverName,
        logFiles: fileInfo,
        environment: envInfo,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Debug: Failed to get log file info for server ${request.params.serverName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get log file info',
        error: error.message
      });
    }
  });

  // Get system logs (not server-specific)
  fastify.get('/api/logs/system', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      logger.info('Getting system logs');
      
      const logFiles = await arkLogsService.getSystemLogs();
      
      return {
        success: true,
        logFiles: logFiles,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get system logs:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get system logs',
        error: error.message
      });
    }
  });

  // Get system log content
  fastify.get('/api/logs/system/:fileName', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { fileName } = request.params;
      const { lines = 100 } = request.query;
      
      logger.info(`Getting system log content from ${fileName} (${lines} lines)`);
      
      // Get system logs to find the file
      const logFiles = await arkLogsService.getSystemLogs();
      const targetFile = logFiles.find(f => f.name === fileName);
      
      if (!targetFile) {
        return reply.status(404).send({
          success: false,
          message: `System log file ${fileName} not found`
        });
      }
      
      // Read the file content
      const fs = await import('fs/promises');
      const content = await fs.readFile(targetFile.path, 'utf8');
      
      // Get the last N lines
      const linesArray = content.split('\n');
      const recentLines = linesArray.slice(-parseInt(lines)).join('\n');
      
      return {
        success: true,
        fileName,
        content: recentLines,
        lines: parseInt(lines),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to get system log content for ${request.params.fileName}:`, error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get system log content',
        error: error.message
      });
    }
  });

} 
