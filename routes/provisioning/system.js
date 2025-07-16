import { requirePermission } from '../../middleware/auth.js';
import { ServerProvisioner } from '../../services/server-provisioner.js';
import logger from '../../utils/logger.js';
import serviceDetector from '../../utils/service-detector.js';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Helper to read last N lines from a file with header
async function readLastLines(filePath, lines = 100) {
  try {
    if (!existsSync(filePath)) return null;
    
    const fileStat = await stat(filePath);
    const content = await readFile(filePath, 'utf8');
    const allLines = content.split(/\r?\n/);
    const lastLines = allLines.slice(-lines);
    
    // Add header with file information
    const header = `Log file: ${path.basename(filePath)}\n` +
                   `Path: ${filePath}\n` +
                   `Size: ${(fileStat.size / 1024).toFixed(2)} KB\n` +
                   `Modified: ${fileStat.mtime.toISOString()}\n` +
                   `Lines: ${allLines.length} total, showing last ${lines}\n` +
                   `─`.repeat(80) + `\n`;
    
    return header + lastLines.join('\n');
  } catch (err) {
    logger.error(`Failed to read log file: ${filePath}`, err);
    return null;
  }
}

// Helper to find the first existing log file from a list of paths
async function findLogFile(paths, lines = 100) {
  for (const filePath of paths) {
    try {
      const content = await readLastLines(filePath, lines);
      if (content) {
        logger.info(`Found log file: ${filePath}`);
        return {
          content,
          path: filePath,
          exists: true
        };
      }
    } catch (err) {
      // Continue to next path
      continue;
    }
  }
  
  return {
    content: null,
    path: null,
    exists: false
  };
}

export default async function systemRoutes(fastify) {
  // GET /api/provisioning/system-logs
  fastify.get('/api/provisioning/system-logs', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { type = 'all', lines = 100 } = request.query;
      
      // Detect service mode
      await serviceDetector.detectServiceMode();
      const serviceInfo = serviceDetector.getServiceInfo();
      const logPaths = serviceDetector.getLogFilePaths();
      
      // Get all available log files
      const logFiles = {};
      
      // Combined logs (main application logs)
      const combinedLog = await findLogFile(logPaths.combined, lines);
      if (combinedLog.exists) {
        logFiles.combined = combinedLog;
      }
      
      // Error logs
      const errorLog = await findLogFile(logPaths.error, lines);
      if (errorLog.exists) {
        logFiles.error = errorLog;
      }
      
      // ASA API Service logs
      const asaApiServiceLog = await findLogFile(logPaths.asaApiService, lines);
      if (asaApiServiceLog.exists) {
        logFiles.asaApiService = asaApiServiceLog;
      }
      
      // Node stdout logs
      const nodeOutLog = await findLogFile(logPaths.nodeOut, lines);
      if (nodeOutLog.exists) {
        logFiles.nodeOut = nodeOutLog;
      }
      
      // Node stderr logs
      const nodeErrLog = await findLogFile(logPaths.nodeErr, lines);
      if (nodeErrLog.exists) {
        logFiles.nodeErr = nodeErrLog;
      }
      
      // Service logs (only when running as Windows service)
      if (serviceInfo.isWindowsService) {
        const serviceOutLog = await findLogFile(logPaths.serviceOut, lines);
        if (serviceOutLog.exists) {
          logFiles.serviceOut = serviceOutLog;
        }
        
        const serviceErrLog = await findLogFile(logPaths.serviceErr, lines);
        if (serviceErrLog.exists) {
          logFiles.serviceErr = serviceErrLog;
        }
      }
      
      return {
        success: true,
        serviceInfo,
        logFiles,
        type,
        lines: Number(lines),
        totalLogFiles: Object.keys(logFiles).length
      };
    } catch (error) {
      logger.error('Failed to get system logs:', error);
      return reply.status(500).send({ success: false, message: 'Failed to get system logs' });
    }
  });

  // GET /api/provisioning/system-info
  fastify.get('/api/provisioning/system-info', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const provisioner = new ServerProvisioner();
      const status = await provisioner.getSystemInfo();
      
      // Add service detection info
      await serviceDetector.detectServiceMode();
      const serviceInfo = serviceDetector.getServiceInfo();
      
      return {
        success: true,
        status: {
          ...status,
          serviceInfo
        }
      };
    } catch (error) {
      logger.error('Failed to get system info:', error);
      return reply.status(500).send({ success: false, message: 'Failed to get system info' });
    }
  });
} 
