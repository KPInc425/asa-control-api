import fs from "fs/promises";
import path from "path";
import { join } from "path";
import logger from "../../utils/logger.js";
import configService from "../../services/config.js";
import { gameFor } from "../../games/index.js";
import { requirePermission } from "../../middleware/auth.js";

export default async function arkConfigRoutes(fastify) {
  // Get config file for a server — game-type-aware
  fastify.get(
    "/api/configs/ark/:serverName/:fileName",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        const { serverName, fileName } = request.params;

        const serverRow = await configService.getServerInfo(serverName);
        const gameType = serverRow?.gameType || "ark";
        const adapter = gameFor(gameType);

        if (!adapter.isValidConfigFile(fileName)) {
          const validFiles = adapter.configFiles.join(", ");
          return reply.status(400).send({
            success: false,
            message: `Invalid config file for ${adapter.name}. Valid files: ${validFiles}`,
          });
        }

        const content = await configService.getConfigFile(serverName, fileName);

        return {
          success: true,
          content,
          fileName,
          serverName,
          gameType,
          requiresRestart: true,
        };
      } catch (error) {
        logger.error("Failed to get config file:", error);
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );

  // Update config file for a server — game-type-aware
  fastify.put(
    "/api/configs/ark/:serverName/:fileName",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        const { serverName, fileName } = request.params;
        const { content } = request.body;

        if (!content) {
          return reply.status(400).send({
            success: false,
            message: "Content is required",
          });
        }

        const serverRow = await configService.getServerInfo(serverName);
        const gameType = serverRow?.gameType || "ark";
        const adapter = gameFor(gameType);

        if (!adapter.isValidConfigFile(fileName)) {
          const validFiles = adapter.configFiles.join(", ");
          return reply.status(400).send({
            success: false,
            message: `Invalid config file for ${adapter.name}. Valid files: ${validFiles}`,
          });
        }

        await configService.updateConfigFile(serverName, content, fileName);

        logger.info(
          `Config file updated by user ${request.user?.username}: ${serverName}/${fileName} (${gameType})`,
        );

        return {
          success: true,
          message: `${fileName} updated successfully`,
          fileName,
          serverName,
          gameType,
          requiresRestart: true,
        };
      } catch (error) {
        logger.error("Failed to update config file:", error);
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );

  // Get server config info (server-config.json)
  fastify.get(
    "/api/configs/ark/:serverName/info",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;

        const serverInfo = await configService.getServerInfo(serverName);

        let serverConfig = null;
        try {
          const serverInfo = await configService.findServerConfigPath(serverName);
          if (serverInfo) {
            const serverPath =
              serverInfo.type === "standalone"
                ? join(configService.serverRootPath, serverName)
                : join(
                    configService.serverRootPath,
                    "cluster",
                    serverInfo.clusterName,
                    serverName,
                  );
            const serverConfigPath = join(serverPath, "server-config.json");
            const serverConfigContent = await fs.readFile(serverConfigPath, "utf8");
            serverConfig = JSON.parse(serverConfigContent);
          }
        } catch (error) {
          logger.info(`No server-config.json found for ${serverName}`);
        }

        return {
          success: true,
          serverInfo,
          serverConfig,
          serverName,
        };
      } catch (error) {
        logger.error("Failed to get server config info:", error);
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );

  // List available ARK config files for a server
  fastify.get(
    "/api/configs/ark/:serverName/files",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        const { serverName } = request.params;

        const serverInfo = await configService.getServerInfo(serverName);

        return {
          success: true,
          files: serverInfo.configFiles,
          serverName,
          configPath: serverInfo.configPath,
          hasGameIni: serverInfo.hasGameIni,
          hasGameUserSettings: serverInfo.hasGameUserSettings,
        };
      } catch (error) {
        logger.error("Failed to list ARK config files:", error);
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );
}
