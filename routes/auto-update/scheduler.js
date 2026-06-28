import logger from "../../utils/logger.js";
import { requireWrite } from "../../middleware/auth.js";
import autoUpdateService from "../../services/auto-update-service.js";

export default async function schedulerRoutes(fastify, options) {
  // POST /api/auto-update/scheduler/start
  fastify.post(
    "/api/auto-update/scheduler/start",
    { preHandler: [requireWrite] },
    async (request, reply) => {
      try {
        if (autoUpdateService.isRunning) {
          return { success: true, message: "Scheduler already running", schedulerRunning: true };
        }
        autoUpdateService.startScheduler();
        logger.info("[AutoUpdateRoutes] Global scheduler started");
        return { success: true, message: "Scheduler started", schedulerRunning: true };
      } catch (error) {
        logger.error("Error starting scheduler:", error);
        return reply.status(500).send({ success: false, message: "Failed to start scheduler", error: error.message });
      }
    },
  );

  // POST /api/auto-update/scheduler/stop
  fastify.post(
    "/api/auto-update/scheduler/stop",
    { preHandler: [requireWrite] },
    async (request, reply) => {
      try {
        if (!autoUpdateService.isRunning) {
          return { success: true, message: "Scheduler not running", schedulerRunning: false };
        }
        autoUpdateService.stopScheduler();
        logger.info("[AutoUpdateRoutes] Global scheduler stopped");
        return { success: true, message: "Scheduler stopped", schedulerRunning: false };
      } catch (error) {
        logger.error("Error stopping scheduler:", error);
        return reply.status(500).send({ success: false, message: "Failed to stop scheduler", error: error.message });
      }
    },
  );

  // POST /api/auto-update/servers/:serverName/scheduler/start
  fastify.post(
    "/api/auto-update/servers/:serverName/scheduler/start",
    { preHandler: [requireWrite] },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        autoUpdateService.startServerScheduler(serverName);
        return { success: true, message: `Scheduler started for ${serverName}` };
      } catch (error) {
        logger.error(`Error starting scheduler for ${request.params.serverName}:`, error);
        return reply.status(500).send({ success: false, message: "Failed to start server scheduler", error: error.message });
      }
    },
  );

  // POST /api/auto-update/servers/:serverName/scheduler/stop
  fastify.post(
    "/api/auto-update/servers/:serverName/scheduler/stop",
    { preHandler: [requireWrite] },
    async (request, reply) => {
      try {
        const { serverName } = request.params;
        autoUpdateService.stopServerScheduler(serverName);
        return { success: true, message: `Scheduler stopped for ${serverName}` };
      } catch (error) {
        logger.error(`Error stopping scheduler for ${request.params.serverName}:`, error);
        return reply.status(500).send({ success: false, message: "Failed to stop server scheduler", error: error.message });
      }
    },
  );
}
