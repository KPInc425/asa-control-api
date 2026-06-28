import { NativeServerManager } from "../../services/server-manager.js";
import { requireRead } from "../../middleware/auth.js";
import logger from "../../utils/logger.js";
import { getServerConfig } from "../../services/database.js";
import { gameFor } from "../../games/index.js";
import { stateReconciliation } from "../../services/state-reconciliation.js";
import {
  ServerStatus,
  DataSource,
} from "../../utils/statusContract.js";

const serverManager = new NativeServerManager();

export default async function liveDetailsRoutes(fastify, options) {
  fastify.get(
    "/api/native-servers/:name/live-details",
    {
      schema: {
        params: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              details: { type: "object", additionalProperties: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      logger.info("[live-details] handler entered", request.params);
      try {
        const { name } = request.params;
        logger.info(`[live-details] Handling request for ${name}`);

        const sources = {};
        let isRunning = false;
        let stats = {};
        try {
          isRunning = await serverManager.isRunning(name);
          sources.process = { running: isRunning };
        } catch (err) {
          logger.warn(`isRunning check failed for ${name}:`, err);
        }

        const serverDbRow = getServerConfig(name);
        const gameType = serverDbRow?.game_type || "ark";
        const adapter = gameFor(gameType);
        let asaStats = null;
        if (adapter.supportsQuery) {
          try {
            asaStats = await adapter.queryServer(name);
          } catch (queryErr) {
            logger.warn(`Server query failed for ${name}: ${queryErr.message}`);
          }
        }
        if (asaStats) {
          sources.query = {
            success: true,
            sessionName: asaStats.sessionName,
            map: asaStats.map,
            day: asaStats.day,
            version: asaStats.version,
            players: asaStats.players,
            maxPlayers: asaStats.maxPlayers,
          };
          stateReconciliation.recordSuccessfulProbe(name, DataSource.QUERY, asaStats);
        }

        let rconData = null;
        if (isRunning) {
          try {
            stats = (await serverManager.getStats(name)) || {};
            if (stats) {
              sources.process.stats = {
                uptime: stats.uptime || 0,
                cpu: stats.cpu || 0,
                memory: stats.memory || 0,
              };
            }
          } catch (err) {
            logger.warn(`getStats failed for ${name}:`, err);
          }

          try {
            const rconService = (await import("../../services/rcon.js")).default;
            const serverInfo = await serverManager.getClusterServerInfo(name);
            if (serverInfo && serverInfo.rconPort) {
              const rconOptions = {
                host: "127.0.0.1",
                port: serverInfo.rconPort,
                password:
                  serverInfo.adminPassword ||
                  serverInfo.config?.adminPassword ||
                  "admin123",
                timeout: 5000,
              };
              const playerList = await rconService.getPlayerList(name, rconOptions);
              rconData = {
                success: true,
                players: playerList,
                playerCount: Array.isArray(playerList) ? playerList.length : 0,
              };
              sources.rcon = rconData;
              stateReconciliation.recordSuccessfulProbe(name, DataSource.RCON, rconData);
            }
          } catch (rconError) {
            logger.warn(`RCON failed for ${name}:`, rconError.message);
            sources.rcon = {
              success: false,
              timeout: rconError.message.includes("timeout"),
            };
          }
        }

        const reconciledData = stateReconciliation.reconcileStatus(name, sources);

        const legacyStatus =
          reconciledData.status === ServerStatus.RUNNING
            ? "online"
            : reconciledData.status === ServerStatus.STARTING
              ? "starting"
              : reconciledData.status === ServerStatus.STOPPING
                ? "stopping"
                : reconciledData.status === ServerStatus.FAILED
                  ? "failed"
                  : "offline";

        const details = {
          name,
          status: legacyStatus,
          canonicalStatus: reconciledData.status,
          players: rconData?.playerCount ?? asaStats?.players ?? 0,
          maxPlayers: asaStats?.maxPlayers ?? 70,
          day: asaStats?.day ?? 0,
          gameTime: "00:00",
          version: asaStats?.version ?? "N/A",
          map: asaStats?.map ?? "N/A",
          uptime: stats.uptime || 0,
          cpu: stats.cpu || 0,
          memory: stats.memory || 0,
          lastUpdated: new Date().toISOString(),
          source: reconciledData.source,
          staleAfter: reconciledData.staleAfter,
          lastSuccessfulProbe: reconciledData.lastSuccessfulProbe,
        };

        if (reconciledData.transition) details.transition = reconciledData.transition;
        if (reconciledData.crashInfo) details.crashInfo = reconciledData.crashInfo;
        if (reconciledData.reason) details.reason = reconciledData.reason;

        const safeDetails = JSON.parse(JSON.stringify(details));
        logger.info("[live-details] about to return (reconciled)", {
          success: true,
          details: { name, status: safeDetails.status, canonicalStatus: safeDetails.canonicalStatus, source: safeDetails.source },
        });
        return { success: true, details: safeDetails };
      } catch (error) {
        logger.error("[live-details] error", { error: error.message, stack: error.stack });
        const details = {
          name: request.params.name,
          status: "unknown",
          canonicalStatus: ServerStatus.UNKNOWN,
          players: 0, maxPlayers: 0, day: 0, gameTime: "00:00",
          version: "N/A", map: "N/A", uptime: 0, cpu: 0, memory: 0,
          lastUpdated: new Date().toISOString(),
          source: DataSource.CACHED,
          reason: `Status check failed: ${error.message}`,
        };
        const safeDetails = JSON.parse(JSON.stringify(details));
        logger.info("[live-details] about to return (error)", { success: true, details: safeDetails });
        return reply.status(200).send({ success: true, details: safeDetails });
      }
    },
  );
}
