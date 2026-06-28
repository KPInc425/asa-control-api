// Server Manager — refactored into focused modules.
// This file re-exports everything for backward compatibility.
// New code should import from the specific module files.

export { ServerStats } from './server-stats.js';
export { ServerManager } from './server-manager-base.js';
export { DockerServerManager } from './docker-server-manager.js';
export { NativeServerManager } from './native-server-manager.js';
export { HybridServerManager } from './hybrid-server-manager.js';

import logger from '../utils/logger.js';
import { DockerServerManager } from './docker-server-manager.js';
import { NativeServerManager } from './native-server-manager.js';
import { HybridServerManager } from './hybrid-server-manager.js';

/**
 * Factory function to create the appropriate ServerManager
 */
export function createServerManager(dockerService = null) {
  const serverMode = process.env.SERVER_MODE || 'docker';

  if (serverMode === 'native') {
    logger.info('Initializing Native Server Manager');
    return new NativeServerManager();
  } else if (serverMode === 'hybrid') {
    logger.info('Initializing Hybrid Server Manager (Docker + Native)');
    return new HybridServerManager(dockerService);
  } else {
    logger.info('Initializing Docker Server Manager');
    return new DockerServerManager(dockerService);
  }
}

export default createServerManager;
