import logger from "../../utils/logger.js";
import { requireWrite } from "../../middleware/auth.js";
import { notifyInGame, notifyDiscord, notifySocket } from "../../services/notifications/adapters.js";

export default async function notificationRoutes(fastify, options) {
  // POST /api/auto-update/test-notification
  fastify.post(
    "/api/auto-update/test-notification",
    {
      preHandler: [requireWrite],
      schema: {
        body: {
          type: "object",
          required: ["serverName"],
          properties: {
            serverName: { type: "string" },
            channels: { type: "object", properties: { rcon: { type: "boolean", default: true }, discord: { type: "boolean", default: true }, socket: { type: "boolean", default: true } } },
            message: { type: "string", default: "[TEST] This is a test notification from the Auto-Update system." },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { serverName, channels = { rcon: true, discord: true, socket: true }, message = "[TEST] This is a test notification from the Auto-Update system." } = request.body;

        logger.info(`[AutoUpdateRoutes] Sending test notification for ${serverName}:`, { channels, message });

        const results = { rcon: null, discord: null, socket: null };
        const errors = [];

        if (channels.rcon) {
          try {
            const rconResult = await notifyInGame(serverName, message, {});
            results.rcon = rconResult;
            if (!rconResult.success && !rconResult.skipped) errors.push(`RCON: ${rconResult.error}`);
          } catch (error) { results.rcon = { success: false, error: error.message }; errors.push(`RCON: ${error.message}`); }
        }

        if (channels.discord) {
          try {
            const discordResult = await notifyDiscord(serverName, message, { type: "generic", severity: "info" });
            results.discord = discordResult;
            if (!discordResult.success) errors.push(`Discord: ${discordResult.error}`);
          } catch (error) { results.discord = { success: false, error: error.message }; errors.push(`Discord: ${error.message}`); }
        }

        if (channels.socket) {
          try {
            const io = fastify.io || options?.io;
            if (io) {
              const socketResult = notifySocket(io, serverName, "auto-update:test", { message, type: "test", timestamp: new Date().toISOString() });
              results.socket = socketResult;
            } else {
              results.socket = { success: false, skipped: true, reason: "Socket.io not available" };
            }
          } catch (error) { results.socket = { success: false, error: error.message }; errors.push(`Socket: ${error.message}`); }
        }

        const testedChannels = Object.values(results).filter((r) => r !== null);
        const successCount = testedChannels.filter((r) => r.success).length;
        const totalTested = testedChannels.length;

        if (errors.length === 0 || successCount > 0) {
          return { success: true, message: `Test notification sent to ${successCount}/${totalTested} channel(s)`, results };
        }
        return reply.status(500).send({ success: false, message: `Test notification failed: ${errors.join("; ")}`, results });
      } catch (error) {
        logger.error("Error sending test notification:", error);
        return reply.status(500).send({ success: false, message: "Failed to send test notification", error: error.message });
      }
    },
  );
}
