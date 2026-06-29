import { requirePermission } from "../../middleware/auth.js";
import logger from "../../utils/logger.js";
import { createServerManager } from "../../services/server-manager.js";

export default async function clusterControlRoutes(fastify) {
  // Start cluster
  fastify.post(
    "/api/provisioning/clusters/:clusterName/start",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        const { clusterName } = request.params;
        const serverManager = createServerManager();
        const result = await serverManager.startCluster(clusterName);
        return {
          success: true,
          message: `Cluster ${clusterName} start initiated`,
          data: result,
        };
      } catch (error) {
        logger.error(
          `Failed to start cluster ${request.params.clusterName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to start cluster",
        });
      }
    },
  );

  // Stop cluster
  fastify.post(
    "/api/provisioning/clusters/:clusterName/stop",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        const { clusterName } = request.params;
        const serverManager = createServerManager();
        const result = await serverManager.stopCluster(clusterName);
        return {
          success: true,
          message: `Cluster ${clusterName} stop initiated`,
          data: result,
        };
      } catch (error) {
        logger.error(
          `Failed to stop cluster ${request.params.clusterName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to stop cluster",
        });
      }
    },
  );

  // Restart cluster
  fastify.post(
    "/api/provisioning/clusters/:clusterName/restart",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        const { clusterName } = request.params;
        const serverManager = createServerManager();
        const result = await serverManager.restartCluster(clusterName);
        return {
          success: true,
          message: `Cluster ${clusterName} restart initiated`,
          data: result,
        };
      } catch (error) {
        logger.error(
          `Failed to restart cluster ${request.params.clusterName}:`,
          error,
        );
        return reply.status(500).send({
          success: false,
          message: "Failed to restart cluster",
        });
      }
    },
  );
}
