import { requireRead } from "../../middleware/auth.js";
import logger from "../../utils/logger.js";
import { dirname, join } from "path";
import { promises as fs } from "fs";

export default async function debugClusterRoutes(fastify, options) {
  // Debug cluster configuration
  fastify.get(
    "/api/native-servers/debug-clusters",
    {
      preHandler: [requireRead],
      schema: {
        response: {
          200: {
            type: "object",
            properties: { success: { type: "boolean" }, debug: { type: "object" } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const debugInfo = {
          environment: {
            NATIVE_BASE_PATH: process.env.NATIVE_BASE_PATH,
            NATIVE_CLUSTERS_PATH: process.env.NATIVE_CLUSTERS_PATH,
            NATIVE_SERVERS_PATH: process.env.NATIVE_SERVERS_PATH,
            SERVER_MODE: process.env.SERVER_MODE,
            NODE_ENV: process.env.NODE_ENV,
          },
          calculatedPaths: {
            clustersPath: process.env.NATIVE_CLUSTERS_PATH || join(process.env.NATIVE_BASE_PATH || "F:\\ARK", "clusters"),
            basePath: process.env.NATIVE_BASE_PATH || "F:\\ARK",
            serversPath: process.env.NATIVE_SERVERS_PATH || join(process.env.NATIVE_BASE_PATH || "F:\\ARK", "servers"),
          },
          clustersPath: process.env.NATIVE_CLUSTERS_PATH || join(process.env.NATIVE_BASE_PATH || "F:\\ARK", "clusters"),
          clustersPathExists: false,
          clusterDirs: [],
          clusterConfigs: {},
          commonPaths: [],
        };

        const commonPaths = ["F:\\ARK", "G:\\ARK", "C:\\ARK", "D:\\ARK", "E:\\ARK", "F:\\ASA", "G:\\ASA", "C:\\ASA", "D:\\ASA", "E:\\ASA"];

        for (const testPath of commonPaths) {
          try {
            const exists = await fs.access(testPath).then(() => true).catch(() => false);
            if (exists) {
              debugInfo.commonPaths.push({ path: testPath, exists: true });
              const clustersSubPath = join(testPath, "clusters");
              const clustersExists = await fs.access(clustersSubPath).then(() => true).catch(() => false);
              debugInfo.commonPaths.push({ path: clustersSubPath, exists: clustersExists, isClustersFolder: true });
            }
          } catch (error) {
            debugInfo.commonPaths.push({ path: testPath, exists: false, error: error.message });
          }
        }

        try {
          const exists = await fs.access(debugInfo.clustersPath).then(() => true).catch(() => false);
          debugInfo.clustersPathExists = exists;
          if (exists) {
            const clusterDirs = await fs.readdir(debugInfo.clustersPath);
            debugInfo.clusterDirs = clusterDirs;
            for (const clusterDir of clusterDirs) {
              try {
                const clusterConfigPath = join(debugInfo.clustersPath, clusterDir, "cluster.json");
                const clusterConfigContent = await fs.readFile(clusterConfigPath, "utf8");
                const clusterConfig = JSON.parse(clusterConfigContent);
                debugInfo.clusterConfigs[clusterDir] = {
                  exists: true,
                  serverCount: clusterConfig.servers ? clusterConfig.servers.length : 0,
                  serverNames: clusterConfig.servers ? clusterConfig.servers.map((s) => s.name) : [],
                  configPreview: JSON.stringify(clusterConfig, null, 2).substring(0, 1000) + "...",
                };
              } catch (error) {
                debugInfo.clusterConfigs[clusterDir] = { exists: false, error: error.message };
              }
            }
          }
        } catch (error) {
          debugInfo.error = error.message;
        }

        return { success: true, debug: debugInfo };
      } catch (error) {
        logger.error("Error debugging clusters:", error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );
}
