import { NativeServerManager } from "../../services/server-manager.js";
import { requireRead, requireWrite } from "../../middleware/auth.js";
import logger from "../../utils/logger.js";
import { getServerConfig } from "../../services/database.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { promises as fs } from "fs";

const serverManager = new NativeServerManager();

export default async function debugRoutes(fastify, options) {
  // Get server configuration debug info
  fastify.get(
    "/api/native-servers/:name/debug",
    {
      preHandler: [requireRead],
      schema: {
        params: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
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
        const { name } = request.params;
        const servers = await serverManager.listServers();
        const server = servers.find((s) => s.name === name);
        if (!server) {
          return reply.status(404).send({ success: false, message: `Server ${name} not found` });
        }

        const isRunning = await serverManager.isRunning(name);
        const dbConfig = serverManager.getServerConfigFromDatabase(name);

        const debugInfo = {
          serverName: name, isRunning,
          serverConfig: {
            adminPassword: server.adminPassword, configAdminPassword: server.config?.adminPassword,
            rconPort: server.rconPort, gamePort: server.gamePort, serverPath: server.serverPath,
            isClusterServer: server.isClusterServer, clusterName: server.clusterName,
          },
          databaseConfig: dbConfig,
          rconConnection: {
            host: "127.0.0.1", port: server.rconPort || 32330,
            password: server.adminPassword || server.config?.adminPassword || "admin123",
          },
          processInfo: null,
        };

        if (isRunning) {
          try {
            const { exec } = await import("child_process");
            const { promisify } = await import("util");
            const execAsync = promisify(exec);
            const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ArkAscendedServer.exe" /FO CSV /NH`);
            debugInfo.processInfo = stdout;
          } catch (error) {
            debugInfo.processInfo = `Error getting process info: ${error.message}`;
          }
        }

        return { success: true, debug: debugInfo };
      } catch (error) {
        logger.error(`Error getting debug info for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // Debug and fix RCON password issues
  fastify.post(
    "/api/native-servers/:name/fix-rcon",
    {
      preHandler: [requireWrite],
      schema: {
        params: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: { success: { type: "boolean" }, message: { type: "string" }, debug: { type: "object" } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params;
        logger.info(`Fixing RCON issues for server: ${name}`);

        const servers = await serverManager.listServers();
        const server = servers.find((s) => s.name === name);
        if (!server) {
          return reply.status(404).send({ success: false, message: `Server ${name} not found` });
        }

        const dbConfig = serverManager.getServerConfigFromDatabase(name);
        const debugInfo = {
          serverName: name,
          serverConfig: {
            adminPassword: server.adminPassword, configAdminPassword: server.config?.adminPassword,
            rconPort: server.rconPort, gamePort: server.gamePort, serverPath: server.serverPath,
            isClusterServer: server.isClusterServer, clusterName: server.clusterName,
          },
          databaseConfig: dbConfig,
        };

        logger.info(`Step 1: Getting server configuration from database for ${name}`);
        let dbServerConfig = getServerConfig(name);
        let serverConfig;

        if (!dbServerConfig) {
          logger.warn(`Server ${name} not found in database, creating from cluster config`);
          serverConfig = {
            name, map: server.map || "TheIsland_WP",
            gamePort: server.gamePort || 7777, queryPort: server.queryPort || 27015,
            rconPort: server.rconPort || 32330, maxPlayers: server.maxPlayers || 70,
            adminPassword: server.adminPassword || "King5252", serverPassword: server.serverPassword || "",
            clusterId: server.clusterName || "", clusterPassword: "",
            customDynamicConfigUrl: server.config?.customDynamicConfigUrl || "",
            disableBattleEye: server.config?.disableBattleEye || false,
            mods: server.config?.mods || [], serverPath: server.serverPath || "",
            created: new Date().toISOString(),
          };
          await serverManager.addServerConfig(name, serverConfig);
          logger.info(`Created database entry for server ${name}`);
        } else {
          try {
            serverConfig = JSON.parse(dbServerConfig.config_data);
          } catch (parseError) {
            throw new Error(`Invalid server configuration in database for ${name}: ${parseError.message}`);
          }
        }

        logger.info(`Step 2: Creating start script directly from database config for ${name}`);
        const adminPassword = dbConfig?.adminPassword || serverConfig.adminPassword || "King5252";
        const updatedServerConfig = {
          ...serverConfig, adminPassword, rconPassword: adminPassword,
          customDynamicConfigUrl: dbConfig?.customDynamicConfigUrl || serverConfig.customDynamicConfigUrl || "",
        };

        let serverPath;
        if (server.isClusterServer && server.clusterName) {
          const clustersPath = process.env.NATIVE_CLUSTERS_PATH || join(process.env.NATIVE_BASE_PATH || "F:\\ARK", "clusters");
          serverPath = join(clustersPath, server.clusterName, name);
        } else {
          serverPath = serverConfig.serverPath || join(process.env.NATIVE_BASE_PATH || "F:\\ARK", "servers", name);
        }

        try {
          const { ServerProvisioner } = await import("../../services/server-provisioner.js");
          const provisioner = new ServerProvisioner();
          if (server.isClusterServer && server.clusterName) {
            await provisioner.createServerConfigInCluster(server.clusterName, serverPath, updatedServerConfig);
            await provisioner.createStartScriptInCluster(server.clusterName, serverPath, updatedServerConfig);
          } else {
            await provisioner.createServerConfig(serverPath, updatedServerConfig);
            await provisioner.createStartScript(serverPath, updatedServerConfig);
          }
          await serverManager.addServerConfig(name, updatedServerConfig);
          logger.info(`Successfully regenerated config files and start script for ${name}`);
        } catch (createError) {
          logger.error(`Failed to regenerate config files and start script for ${name}: ${createError.message}`);
          throw new Error(`Failed to regenerate config files and start script: ${createError.message}`);
        }

        return {
          success: true,
          message: `RCON fix completed for ${name}. Please restart the server to apply the new password.`,
          debug: {
            serverName: name, databasePassword: dbConfig?.adminPassword, serverPassword: server.adminPassword,
            isClusterServer: server.isClusterServer, clusterName: server.clusterName,
            serverPath, passwordUpdated: true,
          },
        };
      } catch (error) {
        logger.error(`Error fixing RCON for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // Test endpoint to check if debug is being called
  fastify.get(
    "/api/native-servers/:name/debug-test",
    {
      preHandler: [requireRead],
      schema: {
        params: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      logger.info(`[DEBUG-TEST] Test endpoint called for ${request.params.name}`);
      return { success: true, debug: { message: "Test endpoint working!", serverName: request.params.name, timestamp: new Date().toISOString() } };
    },
  );

  // Debug start script and RCON configuration
  fastify.get(
    "/api/native-servers/:name/debug-rcon",
    {
      preHandler: [requireRead],
      schema: {
        params: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: { success: { type: "boolean" }, debug: { type: "object", additionalProperties: true } },
          },
        },
      },
    },
    async (request, reply) => {
      logger.info(`[DEBUG-RCON] Endpoint called with params:`, request.params);
      try {
        const { name } = request.params;
        logger.info(`[DEBUG-RCON] Processing debug request for server: ${name}`);

        const servers = await serverManager.listServers();
        const server = servers.find((s) => s.name === name);
        if (!server) {
          return reply.status(404).send({ success: false, message: `Server ${name} not found in server list. Available servers: ${servers.map((s) => s.name).join(", ")}` });
        }

        const dbConfig = serverManager.getServerConfigFromDatabase(name);

        let startBatContent = null;
        let startBatPath = null;
        try {
          if (server.isClusterServer && server.clusterName) {
            const clustersPath = process.env.NATIVE_CLUSTERS_PATH || join(process.env.NATIVE_BASE_PATH || "F:\\ARK", "clusters");
            startBatPath = join(clustersPath, server.clusterName, name, "start.bat");
          } else {
            const serverPath = server.serverPath || join(process.env.NATIVE_BASE_PATH || "F:\\ARK", "servers", name);
            startBatPath = join(serverPath, "start.bat");
          }
          startBatContent = await fs.readFile(startBatPath, "utf8");
        } catch (fileError) {
          logger.warn(`Could not read start.bat for ${name}: ${fileError.message}`);
          const commonPaths = ["F:\\ARK", "G:\\ARK", "C:\\ARK", "D:\\ARK", "E:\\ARK", "F:\\ASA", "G:\\ASA", "C:\\ASA", "D:\\ASA", "E:\\ASA"];
          for (const basePath of commonPaths) {
            try {
              let testPath;
              if (server.isClusterServer && server.clusterName) {
                testPath = join(basePath, "clusters", server.clusterName, name, "start.bat");
              } else {
                testPath = join(basePath, "servers", name, "start.bat");
              }
              const testContent = await fs.readFile(testPath, "utf8");
              startBatPath = testPath;
              startBatContent = testContent;
              logger.info(`Found start.bat for ${name} at: ${testPath}`);
              break;
            } catch (testError) { /* continue */ }
          }
        }

        let startBatPassword = null;
        if (startBatContent) {
          const passwordMatch = startBatContent.match(/AdminPassword="([^"]+)"/);
          if (passwordMatch) startBatPassword = passwordMatch[1];
        }

        let gameUserSettingsContent = null;
        let gameIniContent = null;
        let configsPath = null;
        try {
          if (server.isClusterServer && server.clusterName) {
            const clustersPath = process.env.NATIVE_CLUSTERS_PATH || join(process.env.NATIVE_BASE_PATH || "F:\\ARK", "clusters");
            configsPath = join(clustersPath, server.clusterName, name, "ShooterGame", "Saved", "Config", "WindowsServer");
          } else {
            const serverPath = server.serverPath || join(process.env.NATIVE_BASE_PATH || "F:\\ARK", "servers", name);
            configsPath = join(serverPath, "ShooterGame", "Saved", "Config", "WindowsServer");
          }
          try {
            gameUserSettingsContent = await fs.readFile(join(configsPath, "GameUserSettings.ini"), "utf8");
          } catch (error) { logger.warn(`Could not read GameUserSettings.ini for ${name}: ${error.message}`); }
          try {
            gameIniContent = await fs.readFile(join(configsPath, "Game.ini"), "utf8");
          } catch (error) { logger.warn(`Could not read Game.ini for ${name}: ${error.message}`); }
        } catch (configError) { logger.warn(`Could not access config directory for ${name}: ${configError.message}`); }

        let rconEnabled = null, rconPort = null, configAdminPassword = null;
        if (gameUserSettingsContent) {
          const rconEnabledMatch = gameUserSettingsContent.match(/RCONEnabled\s*=\s*(True|False)/i);
          const rconPortMatch = gameUserSettingsContent.match(/RCONPort\s*=\s*(\d+)/);
          const adminPasswordMatch = gameUserSettingsContent.match(/ServerAdminPassword\s*=\s*([^\r\n]+)/);
          rconEnabled = rconEnabledMatch ? rconEnabledMatch[1] : null;
          rconPort = rconPortMatch ? rconPortMatch[1] : null;
          configAdminPassword = adminPasswordMatch ? adminPasswordMatch[1].trim() : null;
        }

        const debugInfo = {
          serverName: name,
          environment: {
            NATIVE_BASE_PATH: process.env.NATIVE_BASE_PATH ? process.env.NATIVE_BASE_PATH.replace(/\\\\/g, "\\") : null,
            NATIVE_CLUSTERS_PATH: process.env.NATIVE_CLUSTERS_PATH ? process.env.NATIVE_CLUSTERS_PATH.replace(/\\\\/g, "\\") : null,
            NATIVE_SERVERS_PATH: process.env.NATIVE_SERVERS_PATH ? process.env.NATIVE_SERVERS_PATH.replace(/\\\\/g, "\\") : null,
            SERVER_MODE: process.env.SERVER_MODE,
          },
          serverInfo: {
            adminPassword: server?.adminPassword || "undefined",
            configAdminPassword: server?.config?.adminPassword || "undefined",
            rconPort: server?.rconPort || "undefined",
            gamePort: server?.gamePort || "undefined",
            serverPath: server?.serverPath ? server.serverPath.replace(/\\\\/g, "\\") : "undefined",
            isClusterServer: server?.isClusterServer || false,
            clusterName: server?.clusterName || "undefined",
            serverType: server?.type || "undefined",
          },
          databaseConfig: dbConfig,
          startBatInfo: {
            path: startBatPath ? startBatPath.replace(/\\\\/g, "\\") : null,
            exists: !!startBatContent, password: startBatPassword,
            passwordLength: startBatPassword ? startBatPassword.length : 0,
            contentPreview: startBatContent ? startBatContent.substring(0, 500) + "..." : null,
          },
          passwordComparison: {
            serverPassword: server?.adminPassword || "undefined",
            databasePassword: dbConfig?.adminPassword || "undefined",
            startBatPassword: startBatPassword || "undefined",
            configAdminPassword: configAdminPassword || "undefined",
            allMatch: (server?.adminPassword === dbConfig?.adminPassword && dbConfig?.adminPassword === configAdminPassword) || false,
          },
          configFiles: {
            configsPath: configsPath ? configsPath.replace(/\\\\/g, "\\") : null,
            gameUserSettingsExists: !!gameUserSettingsContent,
            gameIniExists: !!gameIniContent,
            rconEnabled, rconPort, configAdminPassword,
            gameUserSettingsContent: gameUserSettingsContent ? gameUserSettingsContent.substring(0, 1000) + "..." : null,
            gameIniContent: gameIniContent ? gameIniContent.substring(0, 500) + "..." : null,
          },
        };

        return { success: true, debug: debugInfo };
      } catch (error) {
        logger.error(`[DEBUG-RCON] Error debugging RCON for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );

  // Test RCON connection with debug info
  fastify.get(
    "/api/native-servers/:name/test-rcon",
    {
      preHandler: [requireRead],
      schema: {
        params: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
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
        const { name } = request.params;
        const servers = await serverManager.listServers();
        const server = servers.find((s) => s.name === name);
        if (!server) {
          return reply.status(404).send({ success: false, message: `Server ${name} not found` });
        }

        const dbConfig = serverManager.getServerConfigFromDatabase(name);
        const rconHost = "127.0.0.1";
        const rconPort = server.rconPort || 32330;
        const rconPassword = server.adminPassword || server.config?.adminPassword || "admin123";

        const debugInfo = {
          serverName: name,
          serverConfig: {
            adminPassword: server.adminPassword, configAdminPassword: server.config?.adminPassword,
            rconPort, gamePort: server.gamePort, serverPath: server.serverPath,
            isClusterServer: server.isClusterServer, clusterName: server.clusterName,
          },
          databaseConfig: dbConfig,
          rconConnection: { host: rconHost, port: rconPort, password: rconPassword, passwordLength: rconPassword ? rconPassword.length : 0 },
        };

        try {
          const rconService = (await import("../../services/rcon.js")).default;
          const rconOptions = { host: rconHost, port: rconPort, password: rconPassword };
          logger.info(`Testing RCON connection for ${name}:`, { host: rconHost, port: rconPort, passwordLength: rconPassword ? rconPassword.length : 0 });
          const response = await rconService.sendCommand(rconOptions, "gettime");
          debugInfo.rconTest = { success: true, response };
        } catch (error) {
          debugInfo.rconTest = { success: false, error: error.message, errorType: error.constructor.name };
        }

        return { success: true, debug: debugInfo };
      } catch (error) {
        logger.error(`Error testing RCON for ${request.params.name}:`, error);
        return reply.status(500).send({ success: false, message: error.message });
      }
    },
  );
}
