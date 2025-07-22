import rconService from './rcon.js';
import { NativeServerManager } from './server-manager.js';
import logger from '../utils/logger.js';

const POLL_INTERVAL = 2000; // 2 seconds
const lastChatBuffers = new Map(); // serverName -> last chat buffer string
let pollerInterval = null;
// Create server manager instance
const serverManager = new NativeServerManager();

export function startChatPolling(io) {
  if (pollerInterval) return; // Already running
  logger.info('Starting ARK chat polling for all servers...');
  pollerInterval = setInterval(async () => {
    try {
      // Get all running servers (native and container)
      const servers = await serverManager.listServers();
      for (const server of servers) {
        if (server.status !== 'running') continue;
        try {
          // Use the same RCON connection options as the API endpoint
          const rconOptions = {
            host: '127.0.0.1',
            port: server.rconPort,
            password: server.adminPassword || server.config?.adminPassword || 'admin123'
          };
          // Get chat buffer via RCON
          const response = await rconService.sendRconCommand(server.name, 'GetChat', rconOptions);
          logger.info(`[ChatPoller] Raw GetChat response for ${server.name}:`, response.response);
          if (!response.success || !response.response) continue;
          const chatBuffer = response.response.trim();
          const lastBuffer = lastChatBuffers.get(server.name) || '';
          if (chatBuffer && chatBuffer !== lastBuffer) {
            // New chat detected
            lastChatBuffers.set(server.name, chatBuffer);
            // Parse chat lines
            const messages = chatBuffer.split('\n').filter(line => line.trim()).map(line => {
              // Format: [timestamp] Player: message
              const match = line.match(/^\[(.*?)\]\s*(.*?):\s*(.*)$/);
              if (match) {
                return {
                  timestamp: match[1],
                  sender: match[2],
                  message: match[3]
                };
              }
              return { timestamp: '', sender: 'System', message: line };
            });
            logger.info(`[ChatPoller] Emitting chat:update for ${server.name} with ${messages.length} messages`);
            io.emit('chat:update', { serverName: server.name, messages });
          }
        } catch (err) {
          logger.warn(`Chat polling failed for server ${server.name}:`, err.message);
        }
      }
    } catch (err) {
      logger.error('Error in chat polling loop:', err);
    }
  }, POLL_INTERVAL);
}

export function stopChatPolling() {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    logger.info('Stopped ARK chat polling.');
  }
} 
