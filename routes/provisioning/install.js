import path from 'path';
import fs from 'fs/promises';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { requirePermission } from '../../middleware/auth.js';
import { ServerProvisioner } from '../../services/server-provisioner.js';

// Helper functions for install logic
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
  // Windows only: list available drives (C:, D:, etc.)
  if (process.platform !== 'win32') return [];
  const drives = [];
  for (let i = 67; i <= 90; i++) { // C-Z
    const drive = String.fromCharCode(i) + ':\\';
    try {
      await fs.access(drive);
      drives.push(drive);
    } catch {
      // Not accessible
    }
  }
  return drives;
}

export default async function installRoutes(fastify) {
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
      return { success: true, options };
    } catch (error) {
      logger.error('Failed to get wizard options:', error);
      return reply.status(500).send({ success: false, message: 'Failed to get wizard options' });
    }
  });

  // Initialize system
  fastify.post('/api/provisioning/initialize', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const result = await provisioner.initialize();
      const systemInfo = await provisioner.getSystemInfo();
      return {
        success: true,
        message: 'System initialized successfully',
        data: { ...result, systemInfo }
      };
    } catch (error) {
      logger.error('Failed to initialize system:', error);
      return reply.status(500).send({ success: false, message: 'Failed to initialize system' });
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
      return { success: true, message: 'SteamCMD installed successfully' };
    } catch (error) {
      logger.error('Failed to install SteamCMD:', error);
      return reply.status(500).send({ success: false, message: 'Failed to install SteamCMD' });
    }
  });

  // Install ASA binaries
  fastify.post('/api/provisioning/install-asa-binaries', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { foreground = false } = request.body;
      const result = await provisioner.installASABinaries(foreground);
      return { success: true, message: 'ASA binaries installed successfully', data: result };
    } catch (error) {
      logger.error('Failed to install ASA binaries:', error);
      return reply.status(500).send({ success: false, message: 'Failed to install ASA binaries' });
    }
  });

  // Update server binaries
  fastify.post('/api/provisioning/update-server', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { serverName } = request.body;
      if (!serverName) {
        return reply.status(400).send({ success: false, message: 'Server name is required' });
      }
      const result = await provisioner.updateServerBinaries(serverName);
      return { success: true, message: `Server ${serverName} updated successfully`, data: result };
    } catch (error) {
      logger.error('Failed to update server:', error);
      return reply.status(500).send({ success: false, message: 'Failed to update server' });
    }
  });

  // Update all servers
  fastify.post('/api/provisioning/update-all-servers', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const result = await provisioner.updateAllServerBinaries();
      return { success: true, message: 'All servers updated successfully', data: result };
    } catch (error) {
      logger.error('Failed to update all servers:', error);
      return reply.status(500).send({ success: false, message: 'Failed to update all servers' });
    }
  });
} 
