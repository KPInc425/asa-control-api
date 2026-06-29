import fs from "fs/promises";
import path from "path";
import logger from "../../utils/logger.js";
import config from "../../config/index.js";
import { requirePermission } from "../../middleware/auth.js";

// Whitelist of safe environment variables that can be edited via dashboard
const SAFE_ENV_VARS = [
  "NATIVE_BASE_PATH",
  "NATIVE_CLUSTERS_PATH",
  "NATIVE_CONFIG_FILE",
  "STEAMCMD_PATH",
  "AUTO_INSTALL_STEAMCMD",
  "ASA_CONFIG_SUB_PATH",
  "RCON_DEFAULT_PORT",
  "RCON_PASSWORD",
  "RATE_LIMIT_MAX",
  "RATE_LIMIT_TIME_WINDOW",
  "CORS_ORIGIN",
  "LOG_LEVEL",
  "LOG_FILE_PATH",
  "METRICS_ENABLED",
  "POWERSHELL_ENABLED",
  "PORT",
  "HOST",
  "NODE_ENV",
];

// Sensitive variables that should never be exposed or edited via dashboard
const SENSITIVE_ENV_VARS = [
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "DOCKER_SOCKET_PATH",
  "AGENT_URL",
  "AGENT_ENABLED",
];

export default async function envConfigRoutes(fastify) {
  // Get current configuration (whitelisted only)
  fastify.get(
    "/api/configs",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        const envPath = path.join(process.cwd(), ".env");
        const envContent = await fs.readFile(envPath, "utf8");

        const envVars = {};
        const lines = envContent.split("\n");

        for (const line of lines) {
          if (line.trim() && !line.startsWith("#")) {
            const [key, ...valueParts] = line.split("=");
            if (key && valueParts.length > 0) {
              const value = valueParts.join("=");
              if (SAFE_ENV_VARS.includes(key)) {
                envVars[key] = value;
              }
            }
          }
        }

        return {
          success: true,
          config: envVars,
          mode: config.server.mode,
          safeVars: SAFE_ENV_VARS,
          hasAdminRights: request.user?.role === "admin",
        };
      } catch (error) {
        logger.error("Failed to read config:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to read configuration",
        });
      }
    },
  );

  // Get full configuration (admin only)
  fastify.get(
    "/api/configs/full",
    {
      preHandler: requirePermission("admin"),
    },
    async (request, reply) => {
      try {
        const envPath = path.join(process.cwd(), ".env");
        const envContent = await fs.readFile(envPath, "utf8");

        const envVars = {};
        const lines = envContent.split("\n");

        for (const line of lines) {
          if (line.trim() && !line.startsWith("#")) {
            const [key, ...valueParts] = line.split("=");
            if (key && valueParts.length > 0) {
              const value = valueParts.join("=");
              envVars[key] = {
                value,
                isSensitive: SENSITIVE_ENV_VARS.includes(key),
                isSafe: SAFE_ENV_VARS.includes(key),
              };
            }
          }
        }

        return {
          success: true,
          config: envVars,
          mode: config.server.mode,
        };
      } catch (error) {
        logger.error("Failed to read full config:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to read full configuration",
        });
      }
    },
  );

  // Update configuration (whitelisted variables only)
  fastify.put(
    "/api/configs",
    {
      preHandler: requirePermission("write"),
    },
    async (request, reply) => {
      try {
        const { config: updates, restart = false } = request.body;

        // Validate that only safe variables are being updated
        const invalidVars = Object.keys(updates).filter(
          (key) => !SAFE_ENV_VARS.includes(key),
        );
        if (invalidVars.length > 0) {
          return reply.status(400).send({
            success: false,
            message: `Cannot update sensitive variables: ${invalidVars.join(", ")}`,
          });
        }

        const envPath = path.join(process.cwd(), ".env");
        const envContent = await fs.readFile(envPath, "utf8");

        const lines = envContent.split("\n");
        const updatedLines = [];

        // Track which variables we've updated
        const updatedVars = new Set();

        for (const line of lines) {
          if (line.trim() && !line.startsWith("#")) {
            const [key, ...valueParts] = line.split("=");
            if (key && valueParts.length > 0) {
              if (updates[key] !== undefined) {
                updatedLines.push(`${key}=${updates[key]}`);
                updatedVars.add(key);
              } else {
                updatedLines.push(line);
              }
            } else {
              updatedLines.push(line);
            }
          } else {
            updatedLines.push(line);
          }
        }

        // Add any new variables that weren't in the original file
        for (const [key, value] of Object.entries(updates)) {
          if (!updatedVars.has(key)) {
            updatedLines.push(`${key}=${value}`);
          }
        }

        // Write the updated .env file
        await fs.writeFile(envPath, updatedLines.join("\n"));

        logger.info(
          `Configuration updated by user ${request.user?.username}: ${Object.keys(updates).join(", ")}`,
        );

        const response = {
          success: true,
          message: "Configuration updated successfully",
          updatedVars: Object.keys(updates),
        };

        // Restart the API if requested
        if (restart) {
          try {
            const { restartAPI } = await import("./system.js");
            await restartAPI();
            response.message += " and API restarted";
          } catch (restartError) {
            logger.error("Failed to restart API:", restartError);
            response.message += " but failed to restart API";
            response.restartError = restartError.message;
          }
        }

        return response;
      } catch (error) {
        logger.error("Failed to update config:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to update configuration",
        });
      }
    },
  );
}
