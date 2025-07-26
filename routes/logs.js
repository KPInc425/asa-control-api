import { requirePermission } from '../middleware/auth.js';
import arkLogsService from '../services/ark-logs.js';
import logger from '../utils/logger.js';

export default async function (fastify) {
  // Get available log files for a server
  fastify.get('/api/logs/:serverName/files', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      logger.info(`Getting available log files for server: ${serverName}`);
      
      const logFiles = await arkLogsService.getAvailableLogs(serverName);
      
      return {
        success: true,
        serverName,
        logFiles
      };
    } catch (error) {
      logger.error(`Failed to get log files for server ${request.params.serverName}:`, error);
      return reply.status(500).send({
        success: false,
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
      
      const content = await arkLogsService.getRecentLogs(serverName, fileName, parseInt(lines));
      
      return {
        success: true,
        serverName,
        fileName,
        content,
        lines: parseInt(lines),
        timestamp: new Date().toISOString() // Add timestamp to see when this was served
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

  // Debug endpoint to check log file paths and content
  fastify.get('/api/logs/:serverName/debug', {
    // Temporarily remove auth requirement for debugging
    // preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      logger.info(`Debug: Getting log file info for server: ${serverName}`);
      
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

  // Simple test endpoint to verify route registration
  fastify.get('/api/logs/test', async (request, reply) => {
    return {
      success: true,
      message: 'Logs route is working!',
      timestamp: new Date().toISOString()
    };
  });
} 
