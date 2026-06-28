/**
 * Auto-Update Routes - main entry point
 * Splits the monolithic auto-update.js into focused route modules
 */
import statusRoutes from "./status.js";
import configRoutes from "./config.js";
import actionRoutes from "./actions.js";
import schedulerRoutes from "./scheduler.js";
import notificationRoutes from "./notifications.js";
import historyRoutes from "./history.js";

export default async function autoUpdateRoutes(fastify, options) {
  await fastify.register(statusRoutes);
  await fastify.register(configRoutes);
  await fastify.register(actionRoutes);
  await fastify.register(schedulerRoutes);
  await fastify.register(notificationRoutes);
  await fastify.register(historyRoutes);
}
