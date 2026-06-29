/**
 * Environment routes - main entry point
 * Splits the monolithic environment.js into focused route modules
 */
import envFileRoutes from "./env-file.js";
import dockerComposeRoutes from "./docker-compose.js";
import arkServerRoutes from "./ark-servers.js";
import miscRoutes from "./misc.js";

export default async function environmentRoutes(fastify, options) {
  await fastify.register(envFileRoutes);
  await fastify.register(dockerComposeRoutes);
  await fastify.register(arkServerRoutes);
  await fastify.register(miscRoutes);
}
