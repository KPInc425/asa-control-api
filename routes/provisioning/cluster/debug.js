import { requirePermission } from "../../../middleware/auth.js";
import logger from "../../../utils/logger.js";
import config from "../../../config/index.js";
import { ServerProvisioner } from "../../../services/server-provisioner.js";

export default async function debugRoutes(fastify) {
  const provisioner = new ServerProvisioner();

  // Debug endpoint for troubleshooting
  fastify.get(
    "/api/provisioning/debug",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        // Helper function to clean Windows paths
        const cleanPath = (path) => {
          if (typeof path === "string") {
            // Replace double backslashes with single backslashes (handles .env file format)
            return path.replace(/\\\\/g, "\\");
          }
          return path;
        };

        // Helper function to recursively clean paths in objects
        const cleanPathsInObject = (obj) => {
          if (typeof obj !== "object" || obj === null) {
            return cleanPath(obj);
          }

          if (Array.isArray(obj)) {
            return obj.map(cleanPathsInObject);
          }

          const cleaned = {};
          for (const [key, value] of Object.entries(obj)) {
            cleaned[key] = cleanPathsInObject(value);
          }
          return cleaned;
        };

        // Get environment variables and clean them
        const envVars = {
          NATIVE_BASE_PATH: process.env.NATIVE_BASE_PATH,
          NATIVE_CLUSTERS_PATH: process.env.NATIVE_CLUSTERS_PATH,
          NATIVE_SERVERS_PATH: process.env.NATIVE_SERVERS_PATH,
        };

        const debugInfo = {
          timestamp: new Date().toISOString(),
          environment: cleanPathsInObject(envVars),
          config: cleanPathsInObject({
            server: {
              native: {
                basePath: config.server?.native?.basePath,
                clustersPath: config.server?.native?.clustersPath,
                serversPath: config.server?.native?.serversPath,
              },
            },
          }),
          provisioner: cleanPathsInObject({
            basePath: provisioner.basePath,
            clustersPath: provisioner.clustersPath,
            serversPath: provisioner.serversPath,
          }),
          clusters: [],
          errors: [],
        };

        // Try to list clusters
        try {
          const clusters = await provisioner.listClusters();
          debugInfo.clusters = clusters.map((cluster) => ({
            name: cluster.name,
            path: cleanPath(cluster.path),
            serverCount: cluster.config?.servers?.length || 0,
            servers:
              cluster.config?.servers?.map((s) => ({
                name: s.name,
                serverPath: cleanPath(s.serverPath),
                map: s.map,
                gamePort: s.gamePort,
              })) || [],
          }));
        } catch (error) {
          debugInfo.errors.push(`Failed to list clusters: ${error.message}`);
        }

        return reply.send(debugInfo);
      } catch (error) {
        logger.error("Debug endpoint error:", error);
        return reply.status(500).send({
          success: false,
          message: error.message,
          stack: error.stack,
        });
      }
    },
  );
}
