import fs from 'fs/promises';
import path from 'path';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { requireRead, requirePermission } from '../../middleware/auth.js';

export default async function miscRoutes(fastify, options) {
  // Get available mods (placeholder for future implementation)
  fastify.get('/api/mods', {
    preHandler: [requireRead],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            mods: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  author: { type: 'string' },
                  version: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const mods = [
        {
          id: '731604991',
          name: 'Structures Plus (S+)',
          description: 'Enhanced building system with advanced features',
          author: 'Orionsun',
          version: '1.0.0'
        },
        {
          id: '793605978',
          name: 'Platforms Plus',
          description: 'Enhanced platform building and functionality',
          author: 'Orionsun',
          version: '1.0.0'
        },
        {
          id: '821530042',
          name: 'Castles, Keeps, and Forts Remastered',
          description: 'Medieval building pieces and structures',
          author: 'Mezta',
          version: '1.0.0'
        },
        {
          id: '1404697612',
          name: 'Dino Storage v2',
          description: 'Advanced dino management and storage system',
          author: 'Salty',
          version: '2.0.0'
        },
        {
          id: '1565015734',
          name: 'Awesome SpyGlass!',
          description: 'Enhanced spyglass with detailed creature information',
          author: 'MisterRaa',
          version: '1.0.0'
        },
        {
          id: '1631852980',
          name: 'Super Structures',
          description: 'Advanced building system with automation features',
          author: 'Orionsun',
          version: '1.0.0'
        },
        {
          id: '1766154726',
          name: 'Automated Ark',
          description: 'Automation and quality of life improvements',
          author: 'MisterRaa',
          version: '1.0.0'
        },
        {
          id: '1814953878',
          name: 'HG Stacking Mod 5000-90 V317',
          description: 'Increased stack sizes for better inventory management',
          author: 'HackGMs',
          version: '3.17'
        }
      ];

      return {
        success: true,
        mods
      };
    } catch (error) {
      fastify.log.error('Error getting mods:', error);
      return reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // Get lock status
  fastify.get('/api/lock-status', {
    preHandler: requirePermission('read')
  }, async (request, reply) => {
    try {
      const lockFilePath = config.environment.lockFilePath || path.join(process.cwd(), '.update.lock');

      try {
        await fs.access(lockFilePath);
        const lockContent = await fs.readFile(lockFilePath, 'utf8');
        const lockData = JSON.parse(lockContent);

        return {
          success: true,
          locked: true,
          lockData
        };
      } catch (error) {
        if (error.code === 'ENOENT') {
          return {
            success: true,
            locked: false,
            lockData: null
          };
        }
        throw error;
      }
    } catch (error) {
      logger.error('Failed to get lock status:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get lock status'
      });
    }
  });
}
