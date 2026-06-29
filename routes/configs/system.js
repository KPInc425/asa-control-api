import { exec } from "child_process";
import { promisify } from "util";
import logger from "../../utils/logger.js";
import config from "../../config/index.js";
import { requirePermission } from "../../middleware/auth.js";

const execAsync = promisify(exec);

/**
 * Restart the API (Docker or native mode)
 */
export async function restartAPI() {
  const mode = config.server.mode;

  if (mode === "docker") {
    try {
      await execAsync("docker restart asa-api");
      logger.info("Docker container restart initiated");
    } catch (error) {
      try {
        await execAsync("docker-compose restart asa-api");
        logger.info("Docker Compose restart initiated");
      } catch (composeError) {
        throw new Error(`Failed to restart Docker container: ${error.message}`);
      }
    }
  } else {
    try {
      await execAsync('sc stop "ASA-API"');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await execAsync('sc start "ASA-API"');
      logger.info("Windows service restart initiated");
    } catch (serviceError) {
      try {
        const nodeProcesses = await execAsync(
          'tasklist /FI "IMAGENAME eq node.exe" /FO CSV',
        );
        if (nodeProcesses.stdout.includes("node.exe")) {
          await execAsync("taskkill /F /IM node.exe");
          logger.info("Node process killed, restart required manually");
        }
      } catch (processError) {
        throw new Error(`Failed to restart API: ${serviceError.message}`);
      }
    }
  }
}

export default async function systemRoutes(fastify) {
  // Restart API endpoint (admin only)
  fastify.post(
    "/api/restart",
    {
      preHandler: requirePermission("admin"),
    },
    async (request, reply) => {
      try {
        await restartAPI();

        logger.info(`API restart requested by user ${request.user?.username}`);

        return {
          success: true,
          message: "API restart initiated successfully",
        };
      } catch (error) {
        logger.error("Failed to restart API:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to restart API",
          error: error.message,
        });
      }
    },
  );

  // Get system information
  fastify.get(
    "/api/system/info",
    {
      preHandler: requirePermission("read"),
    },
    async (request, reply) => {
      try {
        let systemMemory = null;
        try {
          if (process.platform === "win32") {
            const { execSync } = await import("child_process");
            const memoryInfo = execSync(
              'powershell "Get-WmiObject -Class Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory | ConvertTo-Json"',
              { encoding: "utf8" },
            );
            const memory = JSON.parse(memoryInfo);
            systemMemory = {
              total: memory.TotalVisibleMemorySize * 1024,
              free: memory.FreePhysicalMemory * 1024,
              used:
                (memory.TotalVisibleMemorySize - memory.FreePhysicalMemory) * 1024,
              usagePercent: Math.round(
                ((memory.TotalVisibleMemorySize - memory.FreePhysicalMemory) /
                  memory.TotalVisibleMemorySize) * 100,
              ),
            };
          } else {
            const os = await import("os");
            const total = os.totalmem();
            const free = os.freemem();
            systemMemory = {
              total,
              free,
              used: total - free,
              usagePercent: Math.round(((total - free) / total) * 100),
            };
          }
        } catch (memoryError) {
          logger.warn("Failed to get system memory info:", memoryError.message);
          systemMemory = process.memoryUsage();
        }

        const systemInfo = {
          mode: config.server.mode,
          platform: process.platform,
          nodeVersion: process.version,
          uptime: process.uptime(),
          memoryUsage: systemMemory,
          dockerEnabled: config.docker.enabled,
          powershellEnabled: process.env.POWERSHELL_ENABLED === "true",
          nativeBasePath: config.server.native.basePath,
          nativeClustersPath: config.server.native.clustersPath,
        };

        return {
          success: true,
          systemInfo,
        };
      } catch (error) {
        logger.error("Failed to get system info:", error);
        return reply.status(500).send({
          success: false,
          message: "Failed to get system information",
        });
      }
    },
  );
}
