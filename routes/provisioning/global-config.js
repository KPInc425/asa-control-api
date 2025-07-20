import path from 'path';
import fs from 'fs/promises';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { requirePermission } from '../../middleware/auth.js';

export default async function globalConfigRoutes(fastify) {
  // Get global config files (Game.ini, GameUserSettings.ini, exclusions)
  fastify.get('/api/provisioning/global-configs', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const basePath = process.env.NATIVE_BASE_PATH || config.server.native.basePath;
      const globalConfigPath = path.join(basePath, 'global-configs');
      // Ensure directory exists
      await fs.mkdir(globalConfigPath, { recursive: true });
      const gameIniPath = path.join(globalConfigPath, 'Game.ini');
      const gameUserSettingsIniPath = path.join(globalConfigPath, 'GameUserSettings.ini');
      const exclusionsPath = path.join(globalConfigPath, 'exclusions.json');
      const globalSettingsPath = path.join(globalConfigPath, 'global-settings.json');
      let gameIni = '';
      let gameUserSettingsIni = '';
      let excludedServers = [];
      let customDynamicConfigUrl = '';
      try {
        gameIni = await fs.readFile(gameIniPath, 'utf8');
      } catch (error) {}
      try {
        gameUserSettingsIni = await fs.readFile(gameUserSettingsIniPath, 'utf8');
      } catch (error) {}
      try {
        const exclusionsData = await fs.readFile(exclusionsPath, 'utf8');
        const exclusionsConfig = JSON.parse(exclusionsData);
        excludedServers = exclusionsConfig.excludedServers || [];
      } catch (error) {}
      try {
        const globalSettingsData = await fs.readFile(globalSettingsPath, 'utf8');
        const globalSettings = JSON.parse(globalSettingsData);
        customDynamicConfigUrl = globalSettings.customDynamicConfigUrl || '';
      } catch (error) {}
      return {
        success: true,
        gameIni,
        gameUserSettingsIni,
        excludedServers,
        customDynamicConfigUrl
      };
    } catch (error) {
      logger.error('Failed to get global configs:', error);
      return reply.status(500).send({ success: false, message: 'Failed to get global configurations' });
    }
  });

  // Update global config files
  fastify.put('/api/provisioning/global-configs', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { gameIni, gameUserSettingsIni, customDynamicConfigUrl } = request.body;
      const basePath = process.env.NATIVE_BASE_PATH || config.server.native.basePath;
      const globalConfigPath = path.join(basePath, 'global-configs');
      // Ensure directory exists
      await fs.mkdir(globalConfigPath, { recursive: true });
      const gameIniPath = path.join(globalConfigPath, 'Game.ini');
      const gameUserSettingsIniPath = path.join(globalConfigPath, 'GameUserSettings.ini');
      const globalSettingsPath = path.join(globalConfigPath, 'global-settings.json');
      // Write config files
      if (gameIni !== undefined) {
        await fs.writeFile(gameIniPath, gameIni, 'utf8');
      }
      if (gameUserSettingsIni !== undefined) {
        await fs.writeFile(gameUserSettingsIniPath, gameUserSettingsIni, 'utf8');
      }
      if (customDynamicConfigUrl !== undefined) {
        const globalSettings = {
          customDynamicConfigUrl: customDynamicConfigUrl
        };
        await fs.writeFile(globalSettingsPath, JSON.stringify(globalSettings, null, 2), 'utf8');
      }
      return {
        success: true,
        message: 'Global configurations saved successfully'
      };
    } catch (error) {
      logger.error('Failed to save global configs:', error);
      return reply.status(500).send({ success: false, message: 'Failed to save global configurations' });
    }
  });

  // Get config exclusions
  fastify.get('/api/provisioning/config-exclusions', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const basePath = process.env.NATIVE_BASE_PATH || config.server.native.basePath;
      const globalConfigPath = path.join(basePath, 'global-configs');
      const exclusionsPath = path.join(globalConfigPath, 'exclusions.json');
      let excludedServers = [];
      try {
        const exclusionsData = await fs.readFile(exclusionsPath, 'utf8');
        const exclusionsConfig = JSON.parse(exclusionsData);
        excludedServers = exclusionsConfig.excludedServers || [];
      } catch (error) {}
      return {
        success: true,
        excludedServers
      };
    } catch (error) {
      logger.error('Failed to get config exclusions:', error);
      return reply.status(500).send({ success: false, message: 'Failed to get configuration exclusions' });
    }
  });

  // Update config exclusions
  fastify.put('/api/provisioning/config-exclusions', {
    preHandler: requirePermission('write')
  }, async (request, reply) => {
    try {
      const { excludedServers } = request.body;
      const basePath = process.env.NATIVE_BASE_PATH || config.server.native.basePath;
      const globalConfigPath = path.join(basePath, 'global-configs');
      // Ensure directory exists
      await fs.mkdir(globalConfigPath, { recursive: true });
      const exclusionsPath = path.join(globalConfigPath, 'exclusions.json');
      await fs.writeFile(exclusionsPath, JSON.stringify({ excludedServers }, null, 2), 'utf8');
      return {
        success: true,
        message: 'Configuration exclusions saved successfully'
      };
    } catch (error) {
      logger.error('Failed to save config exclusions:', error);
      return reply.status(500).send({ success: false, message: 'Failed to save configuration exclusions' });
    }
  });
} 
