/**
 * Config routes - main entry point
 * Splits the monolithic configs.js into focused route modules
 */
import envConfigRoutes from "./env-config.js";
import systemRoutes from "./system.js";
import arkConfigRoutes from "./ark-configs.js";

export default async function configRoutes(fastify, options) {
  await fastify.register(envConfigRoutes);
  await fastify.register(systemRoutes);
  await fastify.register(arkConfigRoutes);
}
