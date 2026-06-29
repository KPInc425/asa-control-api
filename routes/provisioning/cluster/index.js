/**
 * Cluster provisioning routes - main entry point
 */
import serverRoutes from "./server.js";
import clusterCrudRoutes from "./cluster-crud.js";
import clusterControlRoutes from "./cluster-control.js";
import backupRoutes from "./backup.js";
import configRoutes from "./config.js";
import debugRoutes from "./debug.js";

export default async function clusterRoutes(fastify, options) {
  await fastify.register(serverRoutes);
  await fastify.register(clusterCrudRoutes);
  await fastify.register(clusterControlRoutes);
  await fastify.register(backupRoutes);
  await fastify.register(configRoutes);
  await fastify.register(debugRoutes);
}
