// Main router for provisioning endpoints
import clusterRoutes from './cluster.js';
import installRoutes from './install.js';
import globalConfigRoutes from './global-config.js';
import modRoutes from './mods.js';
import jobRoutes from './jobs.js';
import systemRoutes from './system.js';

export default async function provisioningRoutes(fastify) {
  await clusterRoutes(fastify);
  await installRoutes(fastify);
  await globalConfigRoutes(fastify);
  await modRoutes(fastify);
  await jobRoutes(fastify);
  await systemRoutes(fastify);
} 
