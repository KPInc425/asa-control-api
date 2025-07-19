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

// Helper: migrate excludeSharedMods from cluster.json to DB if needed
async function migrateExcludeSharedModsToDB(serverName) {
  const provisioner = new ServerProvisioner();
  const clusters = await provisioner.listClusters();
  for (const cluster of clusters) {
    if (cluster.config && cluster.config.servers) {
      const server = cluster.config.servers.find(s => s.name === serverName);
      if (server && typeof server.excludeSharedMods === 'boolean') {
        // Write to DB
        upsertServerMod(serverName, null, null, true, server.excludeSharedMods);
        // Remove from cluster.json and save
        delete server.excludeSharedMods;
        const clusterPath = path.join(provisioner.clustersPath, cluster.name, 'cluster.json');
        await fs.writeFile(clusterPath, JSON.stringify(cluster.config, null, 2));
        return server.excludeSharedMods;
      }
    }
  }
  return null;
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

  // GET server mods (DB only, migrate from json if needed)
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
      let serverModsData = getServerMods(serverName);
      let additionalMods = serverModsData.filter(mod => mod.enabled === 1).map(mod => parseInt(mod.mod_id));
      let excludeSharedMods = false;
      
      if (serverModsData.length > 0) {
        // Check if any server mod record has excludeSharedMods set to true
        excludeSharedMods = serverModsData.some(mod => mod.excludeSharedMods === 1);
      } else {
        // Try to migrate from json if not in DB
        const migrated = await migrateExcludeSharedModsToDB(serverName);
        if (typeof migrated === 'boolean') excludeSharedMods = migrated;
      }
      
      // Club ARK fallback
      const isClubArkServer = serverName.toLowerCase().includes('club') || serverName.toLowerCase().includes('bobs');
      if (isClubArkServer && additionalMods.length === 0) {
        return { success: true, serverConfig: { additionalMods: [1005639], excludeSharedMods: true } };
      }
      return { success: true, serverConfig: { additionalMods, excludeSharedMods } };
    } catch (error) {
      logger.error('Failed to get server mods:', error);
      return reply.status(500).send({ success: false, message: 'Failed to get server mods configuration' });
    }
  });

  // PUT server mods (DB only)
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
      const { additionalMods, excludeSharedMods } = request.body;
      
      // Update server mods in DB
      deleteAllServerMods(serverName);
      
      // Add each mod with the exclusion flag
      for (const modId of additionalMods) {
        upsertServerMod(serverName, modId.toString(), null, true, excludeSharedMods);
      }
      
      // If no mods, still persist the exclusion flag
      if (additionalMods.length === 0) {
        upsertServerMod(serverName, null, null, true, excludeSharedMods);
      }
      
      // Regenerate start.bat
      const provisioner = new ServerProvisioner();
      await provisioner.regenerateServerStartScript(serverName);
      logger.info(`[server-mods PUT] Regenerated start.bat for ${serverName}`);
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
