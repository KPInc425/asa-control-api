import fastify from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import { requirePermission } from '../middleware/auth.js';
import { join } from 'path';
import configService from '../services/config.js';

const execAsync = promisify(exec);

// Whitelist of safe environment variables that can be edited via dashboard
const SAFE_ENV_VARS = [
  'NATIVE_BASE_PATH',
  'NATIVE_CLUSTERS_PATH', 
  'NATIVE_CONFIG_FILE',
  'STEAMCMD_PATH',
  'AUTO_INSTALL_STEAMCMD',
  'ASA_CONFIG_SUB_PATH',
  'RCON_DEFAULT_PORT',
  'RCON_PASSWORD',
  'RATE_LIMIT_MAX',
  'RATE_LIMIT_TIME_WINDOW',
  'CORS_ORIGIN',
  'LOG_LEVEL',
  'LOG_FILE_PATH',
  'METRICS_ENABLED',
  'POWERSHELL_ENABLED',
  'PORT',
  'HOST',
  'NODE_ENV'
];

// Sensitive variables that should never be exposed or edited via dashboard
const SENSITIVE_ENV_VARS = [
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'DOCKER_SOCKET_PATH',
  'AGENT_URL',
  'AGENT_ENABLED'
];

export default async function configRoutes(fastify) {
  // Get current configuration (whitelisted only)
  fastify.get('/api/configs', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const envPath = path.join(process.cwd(), '.env');
      const envContent = await fs.readFile(envPath, 'utf8');
      
      const envVars = {};
      const lines = envContent.split('\n');
      
      for (const line of lines) {
        if (line.trim() && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=');
            if (SAFE_ENV_VARS.includes(key)) {
              envVars[key] = value;
            }
          }
        }
      }
      
      return {
        success: true,
        config: envVars,
        mode: config.server.mode,
        safeVars: SAFE_ENV_VARS,
        hasAdminRights: request.user?.role === 'admin'
      };
    } catch (error) {
      logger.error('Failed to read config:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to read configuration'
      });
    }
  });

  // Get full configuration (admin only)
  fastify.get('/api/configs/full', {
    preHandler: requirePermission('admin')
  }, async (request, reply) => {
    try {
      const envPath = path.join(process.cwd(), '.env');
      const envContent = await fs.readFile(envPath, 'utf8');
      
      const envVars = {};
      const lines = envContent.split('\n');
      
      for (const line of lines) {
        if (line.trim() && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=');
            envVars[key] = {
              value,
              isSensitive: SENSITIVE_ENV_VARS.includes(key),
              isSafe: SAFE_ENV_VARS.includes(key)
            };
          }
        }
      }
      
      return {
        success: true,
        config: envVars,
        mode: config.server.mode
      };
    } catch (error) {
      logger.error('Failed to read full config:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to read full configuration'
      });
    }
  });

  // Update configuration (whitelisted variables only)
  fastify.put('/api/configs', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { config: updates, restart = false } = request.body;
      
      // Validate that only safe variables are being updated
      const invalidVars = Object.keys(updates).filter(key => !SAFE_ENV_VARS.includes(key));
      if (invalidVars.length > 0) {
        return reply.status(400).send({
          success: false,
          message: `Cannot update sensitive variables: ${invalidVars.join(', ')}`
        });
      }
      
      const envPath = path.join(process.cwd(), '.env');
      const envContent = await fs.readFile(envPath, 'utf8');
      
      const lines = envContent.split('\n');
      const updatedLines = [];
      
      // Track which variables we've updated
      const updatedVars = new Set();
      
      for (const line of lines) {
        if (line.trim() && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          if (key && valueParts.length > 0) {
            if (updates[key] !== undefined) {
              updatedLines.push(`${key}=${updates[key]}`);
              updatedVars.add(key);
            } else {
              updatedLines.push(line);
            }
          } else {
            updatedLines.push(line);
          }
        } else {
          updatedLines.push(line);
        }
      }
      
      // Add any new variables that weren't in the original file
      for (const [key, value] of Object.entries(updates)) {
        if (!updatedVars.has(key)) {
          updatedLines.push(`${key}=${value}`);
        }
      }
      
      // Write the updated .env file
      await fs.writeFile(envPath, updatedLines.join('\n'));
      
      logger.info(`Configuration updated by user ${request.user?.username}: ${Object.keys(updates).join(', ')}`);
      
      const response = {
        success: true,
        message: 'Configuration updated successfully',
        updatedVars: Object.keys(updates)
      };
      
      // Restart the API if requested
      if (restart) {
        try {
          await restartAPI();
          response.message += ' and API restarted';
        } catch (restartError) {
          logger.error('Failed to restart API:', restartError);
          response.message += ' but failed to restart API';
          response.restartError = restartError.message;
        }
      }
      
      return response;
    } catch (error) {
      logger.error('Failed to update config:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update configuration'
      });
    }
  });

  // Restart API endpoint (admin only)
  fastify.post('/api/restart', {
    preHandler: requirePermission('admin')
  }, async (request, reply) => {
    try {
      await restartAPI();
      
      logger.info(`API restart requested by user ${request.user?.username}`);
      
      return {
        success: true,
        message: 'API restart initiated successfully'
      };
    } catch (error) {
      logger.error('Failed to restart API:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to restart API',
        error: error.message
      });
    }
  });

  // Get system information
  fastify.get('/api/system/info', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      // Get system memory information
      let systemMemory = null;
      try {
        if (process.platform === 'win32') {
          // Windows - use PowerShell to get system memory
          const { execSync } = await import('child_process');
          const memoryInfo = execSync('powershell "Get-WmiObject -Class Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory | ConvertTo-Json"', { encoding: 'utf8' });
          const memory = JSON.parse(memoryInfo);
          systemMemory = {
            total: memory.TotalVisibleMemorySize * 1024, // Convert KB to bytes
            free: memory.FreePhysicalMemory * 1024, // Convert KB to bytes
            used: (memory.TotalVisibleMemorySize - memory.FreePhysicalMemory) * 1024,
            usagePercent: Math.round(((memory.TotalVisibleMemorySize - memory.FreePhysicalMemory) / memory.TotalVisibleMemorySize) * 100)
          };
        } else {
          // Linux/Mac - use os module
          const os = await import('os');
          const total = os.totalmem();
          const free = os.freemem();
          systemMemory = {
            total,
            free,
            used: total - free,
            usagePercent: Math.round(((total - free) / total) * 100)
          };
        }
      } catch (memoryError) {
        logger.warn('Failed to get system memory info:', memoryError.message);
        // Fallback to API memory usage
        systemMemory = process.memoryUsage();
      }

      const systemInfo = {
        mode: config.server.mode,
        platform: process.platform,
        nodeVersion: process.version,
        uptime: process.uptime(),
        memoryUsage: systemMemory,
        dockerEnabled: config.docker.enabled,
        powershellEnabled: process.env.POWERSHELL_ENABLED === 'true',
        nativeBasePath: config.server.native.basePath,
        nativeClustersPath: config.server.native.clustersPath
      };
      
      return {
        success: true,
        systemInfo
      };
    } catch (error) {
      logger.error('Failed to get system info:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get system information'
      });
    }
  });

  // ARK Server Config File Management
  // =================================

  // Get ARK config file for a server
  fastify.get('/api/configs/ark/:serverName/:fileName', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { serverName, fileName } = request.params;
      
      // Validate fileName
      if (!['Game.ini', 'GameUserSettings.ini'].includes(fileName)) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid config file name. Must be Game.ini or GameUserSettings.ini'
        });
      }

      const content = await configService.getConfigFile(serverName, fileName);
      
      return {
        success: true,
        content,
        fileName,
        serverName,
        requiresRestart: true // ARK config changes require server restart
      };
    } catch (error) {
      logger.error('Failed to get ARK config file:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Update ARK config file for a server
  fastify.put('/api/configs/ark/:serverName/:fileName', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { serverName, fileName } = request.params;
      const { content } = request.body;
      
      if (!content) {
        return reply.status(400).send({
          success: false,
          message: 'Content is required'
        });
      }
      
      // Validate fileName
      if (!['Game.ini', 'GameUserSettings.ini'].includes(fileName)) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid config file name. Must be Game.ini or GameUserSettings.ini'
        });
      }

      await configService.updateConfigFile(serverName, content, fileName);
      
      logger.info(`ARK config file updated by user ${request.user?.username}: ${serverName}/${fileName}`);
      
      return {
        success: true,
        message: `${fileName} updated successfully`,
        fileName,
        serverName,
        requiresRestart: true // ARK config changes require server restart
      };
    } catch (error) {
      logger.error('Failed to update ARK config file:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get server config info (server-config.json)
  fastify.get('/api/configs/ark/:serverName/info', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      const serverInfo = await configService.getServerInfo(serverName);
      
      // Also try to read server-config.json if it exists
      let serverConfig = null;
      try {
        const serverConfigPath = join(configService.serverRootPath, serverName, 'server-config.json');
        const serverConfigContent = await fs.readFile(serverConfigPath, 'utf8');
        serverConfig = JSON.parse(serverConfigContent);
      } catch (error) {
        // server-config.json doesn't exist or is invalid, that's okay
        logger.info(`No server-config.json found for ${serverName}`);
      }
      
      return {
        success: true,
        serverInfo,
        serverConfig,
        serverName
      };
    } catch (error) {
      logger.error('Failed to get server config info:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // List available ARK config files for a server
  fastify.get('/api/configs/ark/:serverName/files', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      
      const serverInfo = await configService.getServerInfo(serverName);
      
      return {
        success: true,
        files: serverInfo.configFiles,
        serverName,
        configPath: serverInfo.configPath,
        hasGameIni: serverInfo.hasGameIni,
        hasGameUserSettings: serverInfo.hasGameUserSettings
      };
    } catch (error) {
      logger.error('Failed to list ARK config files:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });
}

// Helper function to restart the API
async function restartAPI() {
  const mode = config.server.mode;
  
  if (mode === 'docker') {
    // Restart Docker container
    try {
      await execAsync('docker restart asa-api');
      logger.info('Docker container restart initiated');
    } catch (error) {
      // Try docker-compose restart
      try {
        await execAsync('docker-compose restart asa-api');
        logger.info('Docker Compose restart initiated');
      } catch (composeError) {
        throw new Error(`Failed to restart Docker container: ${error.message}`);
      }
    }
  } else {
    // Native mode - restart Windows service or process
    try {
      // Try to restart as Windows service first
      await execAsync('sc stop "ASA-API"');
      await new Promise(resolve => setTimeout(resolve, 2000));
      await execAsync('sc start "ASA-API"');
      logger.info('Windows service restart initiated');
    } catch (serviceError) {
      // If service restart fails, try to restart the Node process
      try {
        const nodeProcesses = await execAsync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV');
        if (nodeProcesses.stdout.includes('node.exe')) {
          await execAsync('taskkill /F /IM node.exe');
          logger.info('Node process killed, restart required manually');
        }
      } catch (processError) {
        throw new Error(`Failed to restart API: ${serviceError.message}`);
      }
    }
  }
} 
 