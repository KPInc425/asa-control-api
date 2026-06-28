import { NativeServerManager } from "../../services/server-manager.js";
import { requireWrite } from "../../middleware/auth.js";
import logger from "../../utils/logger.js";

const serverManager = new NativeServerManager();

export default async function rconRoutes(fastify, options) {
  // Send RCON command to native server
  fastify.post(
    "/api/native-servers/:name/rcon",
    {
      preHandler: [requireWrite],
      schema: {
        params: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["command"],
          properties: { command: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              response: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params;
        const { command } = request.body;

        logger.info(`RCON command request for server ${name}: ${command}`);

        const servers = await serverManager.listServers();
        const server = servers.find((s) => s.name === name);

        if (!server) {
          logger.warn(`RCON command failed: Server ${name} not found`);
          return reply.status(404).send({ success: false, message: `Server ${name} not found` });
        }

        logger.info(`[RCON Debug] Full server config for ${name}:`, {
          name: server.name, rconPort: server.rconPort, adminPassword: server.adminPassword,
          config: server.config, isClusterServer: server.isClusterServer, clusterName: server.clusterName,
        });

        const isRunning = await serverManager.isRunning(name);
        if (!isRunning) {
          logger.warn(`RCON command failed: Server ${name} is not running`);
          return reply.status(400).send({ success: false, message: `Server ${name} is not running. Cannot send RCON commands to a stopped server.` });
        }

        if (!server.rconPort) {
          logger.error(`RCON command failed: No RCON port configured for server ${name}`);
          return reply.status(400).send({ success: false, message: `No RCON port configured for server ${name}. Please check server configuration.` });
        }

        logger.info(`Sending RCON command to ${name} on port ${server.rconPort}: ${command}`);

        const rconService = (await import("../../services/rcon.js")).default;
        const rconHost = "127.0.0.1";
        const rconPort = server.rconPort || 32330;
        const rconPassword = server.adminPassword || server.config?.adminPassword || "admin123";

        logger.info(`[RCON Debug] Server config for ${name}:`, {
          serverAdminPassword: server.adminPassword, configAdminPassword: server.config?.adminPassword,
          finalPassword: rconPassword, finalPasswordLength: rconPassword ? rconPassword.length : 0,
          serverPath: server.serverPath, rconPort, isClusterServer: server.isClusterServer, clusterName: server.clusterName,
        });

        const rconOptions = { host: rconHost, port: rconPort, password: rconPassword };
        logger.info(`Sending RCON command to ${name} on ${rconHost}:${rconPort}: ${command}`);
        const response = await rconService.sendCommand(rconOptions, command);

        logger.info(`RCON command successful for ${name}: ${command}`);
        return { success: true, message: "Command sent successfully", response };
      } catch (error) {
        logger.error(`RCON command error for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );
}
