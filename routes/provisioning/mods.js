import path from 'path';
import fs from 'fs/promises';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { requirePermission } from '../../middleware/auth.js';
import { getAllSharedMods, upsertSharedMod, getServerMods, upsertServerMod, deleteAllServerMods } from '../../services/database.js';
import { ServerProvisioner } from '../../services/server-provisioner.js';

// Helper for regenerating start scripts
async function regenerateServerStartScript(serverName, provisioner) {
  if (provisioner && typeof provisioner.regenerateServerStartScript === 'function') {
    await provisioner.regenerateServerStartScript(serverName);
  }
}
async function regenerateAllClusterStartScripts(provisioner) {
  if (provisioner && typeof provisioner.regenerateAllClusterStartScripts === 'function') {
    return await provisioner.regenerateAllClusterStartScripts();
  }
  return [];
}

export default async function modRoutes(fastify) {
  const provisioner = new ServerProvisioner();

  // Get shared mods configuration
  fastify.get('/api/provisioning/shared-mods', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const sharedModsData = getAllSharedMods();
      const sharedMods = sharedModsData
        .filter(mod => mod.enabled === 1)
        .map(mod => parseInt(mod.mod_id));
      return { success: true, sharedMods };
    } catch (error) {
      logger.error('Failed to get shared mods:', error);
      return reply.status(500).send({ success: false, message: 'Failed to get shared mods configuration' });
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
          modList: { type: 'array', items: { type: 'number' } }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { modList } = request.body;
      // Clear existing shared mods and add new ones
      const existingMods = getAllSharedMods();
      for (const mod of existingMods) {
        upsertSharedMod(mod.mod_id, mod.mod_name, false);
      }
      for (const modId of modList) {
        upsertSharedMod(modId.toString(), null, true);
      }
      logger.info('Shared mods configuration updated');
      await regenerateAllClusterStartScripts(provisioner);
      return { success: true, message: 'Shared mods configuration updated successfully. Server start scripts have been regenerated.' };
    } catch (error) {
      logger.error('Failed to update shared mods:', error);
      return reply.status(500).send({ success: false, message: 'Failed to update shared mods configuration' });
    }
  });

  // Get server-specific mods configuration
  fastify.get('/api/provisioning/server-mods/:serverName', {
    preHandler: requirePermission('read'),
    schema: {
      params: {
        type: 'object',
        required: ['serverName'],
        properties: { serverName: { type: 'string' } }
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      const serverModsData = getServerMods(serverName);
      const additionalMods = serverModsData
        .filter(mod => mod.enabled === 1)
        .map(mod => parseInt(mod.mod_id));
      // Check if this is a Club ARK server and set defaults if no mods configured
      const isClubArkServer = serverName.toLowerCase().includes('club') || serverName.toLowerCase().includes('bobs');
      if (isClubArkServer && additionalMods.length === 0) {
        return { success: true, serverConfig: { additionalMods: [1005639], excludeSharedMods: true } };
      }
      return { success: true, serverConfig: { additionalMods, excludeSharedMods: false } };
    } catch (error) {
      logger.error('Failed to get server mods:', error);
      return reply.status(500).send({ success: false, message: 'Failed to get server mods configuration' });
    }
  });

  // Update server-specific mods configuration
  fastify.put('/api/provisioning/server-mods/:serverName', {
    preHandler: requirePermission('write'),
    schema: {
      params: {
        type: 'object',
        required: ['serverName'],
        properties: { serverName: { type: 'string' } }
      },
      body: {
        type: 'object',
        required: ['additionalMods', 'excludeSharedMods'],
        properties: {
          additionalMods: { type: 'array', items: { type: 'number' } },
          excludeSharedMods: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { serverName } = request.params;
      const { additionalMods } = request.body;
      deleteAllServerMods(serverName);
      for (const modId of additionalMods) {
        upsertServerMod(serverName, modId.toString(), null, true);
      }
      logger.info(`Server mods configuration updated for ${serverName}`);
      await regenerateServerStartScript(serverName, provisioner);
      return { success: true, message: `Server mods configuration for ${serverName} updated successfully. Start script has been regenerated.` };
    } catch (error) {
      logger.error('Failed to update server mods:', error);
      return reply.status(500).send({ success: false, message: 'Failed to update server mods configuration' });
    }
  });

  // Get all mods configuration (for overview)
  fastify.get('/api/provisioning/mods-overview', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const basePath = process.env.NATIVE_BASE_PATH || config.server.native.basePath;
      const sharedModsPath = path.join(basePath, 'shared-mods.json');
      const serverModsDir = path.join(basePath, 'server-mods');
      let sharedMods = [];
      let serverMods = {};
      // Get shared mods
      try {
        const sharedModsData = await fs.readFile(sharedModsPath, 'utf8');
        const sharedModsConfig = JSON.parse(sharedModsData);
        sharedMods = sharedModsConfig.modList || [];
      } catch (error) {}
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
      } catch (error) {}
      return { success: true, sharedMods, serverMods };
    } catch (error) {
      logger.error('Failed to get mods overview:', error);
      return reply.status(500).send({ success: false, message: 'Failed to get mods overview' });
    }
  });
} 
