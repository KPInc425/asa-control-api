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
      
      logger.info('System logs request received', { type, lines });
      
      // Use the new ark-logs service for system logs
      const arkLogsService = await import('../../services/ark-logs.js');
      const systemLogs = await arkLogsService.default.getSystemLogs();
      
      // Detect service mode for service info
      await serviceDetector.detectServiceMode();
      const serviceInfo = serviceDetector.getServiceInfo();
      
      logger.info('System logs found', { count: systemLogs.length, logs: systemLogs.map(l => l.name) });
      
      // Convert the new format to the expected format
      const logFiles = {};
      
      for (const logFile of systemLogs) {
        const fileName = logFile.name;
        const filePath = logFile.path;
        
        // Read the log content
        const content = await readLastLines(filePath, lines);
        
        if (content) {
          const key = fileName.replace('.log', '');
          logFiles[key] = {
            content,
            path: filePath,
            exists: true
          };
          logger.info(`Found log file: ${fileName}`, { path: filePath });
        }
      }
      
      // Add fallback log content if no logs found
      if (Object.keys(logFiles).length === 0) {
        logger.warn('No log files found, creating fallback log content');
        logFiles.fallback = {
          content: `No log files found in expected locations.\n\nService Info:\n${JSON.stringify(serviceInfo, null, 2)}\n\nCurrent Working Directory: ${process.cwd()}\nProcess ID: ${process.pid}\n\nAvailable System Logs:\n${JSON.stringify(systemLogs, null, 2)}`,
          path: 'fallback',
          exists: true
        };
      }
      
      logger.info('System logs response prepared', { 
        totalLogFiles: Object.keys(logFiles).length,
        availableLogs: Object.keys(logFiles)
      });
      
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

