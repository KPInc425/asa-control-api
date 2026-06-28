/**
 * Native server routes - main entry point
 * Splits the monolithic native-servers.js into focused route modules
 */
import liveDetailsRoutes from "./live-details.js";
import crudRoutes from "./crud.js";
import controlRoutes from "./control.js";
import infoRoutes from "./info.js";
import rconRoutes from "./rcon.js";
import debugRoutes from "./debug.js";
import statusRoutes from "./status.js";
import stateRoutes from "./state.js";
import debugClusterRoutes from "./debug-clusters.js";
import compatibilityRoutes from "./compatibility.js";

/**
 * Native server routes for ASA Windows server management
 */
export default async function nativeServerRoutes(fastify, options) {
  await fastify.register(liveDetailsRoutes);
  await fastify.register(crudRoutes);
  await fastify.register(controlRoutes);
  await fastify.register(infoRoutes);
  await fastify.register(rconRoutes);
  await fastify.register(debugRoutes);
  await fastify.register(statusRoutes);
  await fastify.register(stateRoutes);
  await fastify.register(debugClusterRoutes);
  await fastify.register(compatibilityRoutes);
}
