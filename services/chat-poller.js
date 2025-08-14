import rconService from './rcon.js';
import { NativeServerManager } from './server-manager.js';
import logger from '../utils/logger.js';

const POLL_INTERVAL = 2000; // 2 seconds
const lastChatBuffers = new Map(); // serverName -> last chat buffer string
const emptyResponseCounts = new Map(); // serverName -> count of consecutive empty responses
const MAX_EMPTY_RESPONSES = 10; // Reduce polling frequency after 10 empty responses
const unsupportedCommands = new Set(); // Track servers that don't support GetChat
let pollerInterval = null;
// Create server manager instance
const serverManager = new NativeServerManager();

let activeConnections = new Set(); // Track which servers have active chat connections

export function startChatPolling(io) {
  if (pollerInterval) return; // Already running
  logger.info('Starting ARK chat polling for all servers...');
  
  // Set up Socket.IO connection tracking
  io.on('connection', (socket) => {
    socket.on('subscribe-to-chat', (serverName) => {
      activeConnections.add(serverName);
      logger.info(`Chat polling activated for server: ${serverName}`);
    });
    
    socket.on('unsubscribe-from-chat', (serverName) => {
      activeConnections.delete(serverName);
      logger.info(`Chat polling deactivated for server: ${serverName}`);
    });
    
    socket.on('disconnect', () => {
      // Clean up any subscriptions when socket disconnects
      activeConnections.clear();
    });
  });
  
  pollerInterval = setInterval(async () => {
    // Only poll if there are active chat connections
    if (activeConnections.size === 0) {
      return; // No active chat connections, skip polling
    }
    const startTime = Date.now();
    try {
      // Get all running servers (native and container)
      const servers = await serverManager.listServers();
      for (const server of servers) {
        if (server.status !== 'running') continue;
        if (!activeConnections.has(server.name)) continue; // Only poll servers with active chat connections
        try {
          // Use the same RCON connection options as the API endpoint
          const rconOptions = {
            host: '127.0.0.1',
            port: server.rconPort,
            password: server.adminPassword || server.config?.adminPassword || 'admin123'
          };
          // Get chat buffer via RCON
          const response = await rconService.sendRconCommand(server.name, 'GetChat', rconOptions);
          
          // Only log if there's actual chat content or an error
          if (response.response && response.response.trim() && response.success) {
            logger.info(`[ChatPoller] GetChat response for ${server.name}:`, {
              success: response.success,
              responseLength: response.response ? response.response.length : 0,
              response: response.response,
              cached: response.cached || false,
              attempt: response.attempt || 1
            });
          } else if (!response.success) {
            logger.warn(`[ChatPoller] GetChat failed for ${server.name}:`, response.error || 'Unknown error');
          }
          
          // Handle empty responses gracefully - GetChat often returns empty when no new chat
          if (!response.success) {
            continue; // Already logged above
          }
          
          // Check if GetChat command is supported (some servers might not support it)
          if (response.response && response.response.includes('Unknown command')) {
            if (!unsupportedCommands.has(server.name)) {
              logger.info(`[ChatPoller] GetChat command not supported by ${server.name}, skipping chat polling for this server`);
              unsupportedCommands.add(server.name);
            }
            continue;
          }
          
          // Skip servers that we know don't support GetChat
          if (unsupportedCommands.has(server.name)) {
            continue;
          }
          
          // response.response can be empty string for GetChat when no new messages
          const chatBuffer = (response.response || '').trim();
          const lastBuffer = lastChatBuffers.get(server.name) || '';
          
          // Only process if we have new chat content
          if (chatBuffer && chatBuffer !== lastBuffer) {
            // New chat detected
            lastChatBuffers.set(server.name, chatBuffer);
            emptyResponseCounts.set(server.name, 0); // Reset empty response count
            
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
            logger.info(`[ChatPoller] About to emit chat:update for ${server.name} with ${messages.length} messages. Socket count: ${io.engine.clientsCount}`);
            logger.info(`[ChatPoller] chat:update payload:`, { serverName: server.name, messages });
            io.emit('chat:update', { serverName: server.name, messages });
          } else {
            // Empty response - track for potential polling frequency reduction
            const emptyCount = (emptyResponseCounts.get(server.name) || 0) + 1;
            emptyResponseCounts.set(server.name, emptyCount);
            
            if (emptyCount >= MAX_EMPTY_RESPONSES) {
              logger.debug(`[ChatPoller] ${server.name} has had ${emptyCount} consecutive empty responses - normal for quiet servers`);
            }
            
            // Log empty responses occasionally for debugging (reduced frequency)
            if (emptyCount % 200 === 0) { // Log every 200th empty response instead of 50th
              logger.debug(`[ChatPoller] ${server.name} - ${emptyCount} consecutive empty GetChat responses (normal for servers with no chat activity)`);
            }
          }
        } catch (err) {
          logger.warn(`Chat polling failed for server ${server.name}:`, err.message);
        }
      }
      
      // Log polling performance occasionally
      const pollDuration = Date.now() - startTime;
      if (pollDuration > 1000) { // Log if polling takes more than 1 second
        logger.info(`[ChatPoller] Polling cycle completed in ${pollDuration}ms`);
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

/**
 * Manually test GetChat command for a specific server
 * Useful for debugging chat functionality
 */
export async function testGetChatForServer(serverName) {
  try {
    const servers = await serverManager.listServers();
    const server = servers.find(s => s.name === serverName);
    
    if (!server) {
      throw new Error(`Server ${serverName} not found`);
    }
    
    if (server.status !== 'running') {
      throw new Error(`Server ${serverName} is not running (status: ${server.status})`);
    }
    
    const rconOptions = {
      host: '127.0.0.1',
      port: server.rconPort,
      password: server.adminPassword || server.config?.adminPassword || 'admin123'
    };
    
    logger.info(`[ChatPoller] Testing GetChat for ${serverName} with options:`, {
      host: rconOptions.host,
      port: rconOptions.port,
      passwordLength: rconOptions.password.length
    });
    
    const response = await rconService.sendRconCommand(serverName, 'GetChat', rconOptions);
    
    return {
      success: response.success,
      response: response.response,
      responseLength: response.response ? response.response.length : 0,
      cached: response.cached || false,
      attempt: response.attempt || 1,
      error: response.error
    };
    
  } catch (error) {
    logger.error(`[ChatPoller] Error testing GetChat for ${serverName}:`, error);
    throw error;
  }
} 
