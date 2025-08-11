import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const config = {
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  
  docker: {
    socketPath: process.env.DOCKER_SOCKET_PATH || 
      (process.platform === 'win32' ? '\\\\.\\pipe\\docker_engine' : '/var/run/docker.sock'),
    enabled: process.env.DOCKER_ENABLED !== 'false' // Enable by default
  },
  
  server: {
    port: parseInt(process.env.PORT) || 4000,
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    mode: process.env.SERVER_MODE || 'docker', // 'docker', 'native', or 'hybrid'
    native: {
      basePath: path.normalize(process.env.NATIVE_BASE_PATH || 'C:\\ARK'),
      configFile: process.env.NATIVE_CONFIG_FILE || 'native-servers.json',
      steamCmdPath: process.env.STEAMCMD_PATH || null,
      autoInstallSteamCmd: process.env.AUTO_INSTALL_STEAMCMD !== 'false',
      clustersPath: path.normalize(process.env.NATIVE_CLUSTERS_PATH || 'C:\\ARK\\clusters')
    },
    hybrid: {
      agentUrl: process.env.AGENT_URL || 'http://host.docker.internal:5000',
      agentEnabled: process.env.AGENT_ENABLED === 'true' // Disabled by default (future mode)
    }
  },
  
  asa: {
    // Root directory containing all ASA server folders
    serverRootPath: path.normalize(process.env.NATIVE_BASE_PATH || 
      (process.env.SERVER_MODE === 'native' ? 'C:\\ARK' : '/opt/asa/asa-server')),
    // Default config subfolder structure (Config/WindowsServer/)
    configSubPath: process.env.ASA_CONFIG_SUB_PATH || 'Config/WindowsServer',
    // Update lock file path - derive from base path or use default
    updateLockPath: process.env.ASA_UPDATE_LOCK_PATH || 
      (process.env.SERVER_MODE === 'native' ? 
        path.join(path.normalize(process.env.NATIVE_BASE_PATH || 'C:\\ARK'), '.update.lock') : 
        '/opt/asa/.update.lock'),
    // Default config files to look for
    defaultConfigFiles: ['Game.ini', 'GameUserSettings.ini'],
    // Custom Dynamic Config URL (global)
    customDynamicConfigUrl: process.env.CUSTOM_DYNAMIC_CONFIG_URL || '',
  },
  
  rcon: {
    defaultPort: parseInt(process.env.RCON_DEFAULT_PORT) || 32330,
    password: process.env.RCON_PASSWORD || 'admin'
  },
  
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'development' ? 1000 : 100),
    timeWindow: parseInt(process.env.RATE_LIMIT_TIME_WINDOW) || (process.env.NODE_ENV === 'development' ? 60000 : 900000) // 1 min in dev, 15 min in prod
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173,http://localhost:4000'
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'warn', // Changed from 'info' to 'warn' to reduce noise
    filePath: process.env.LOG_FILE_PATH || './logs/app.log',
    maxFileSize: process.env.LOG_MAX_FILE_SIZE || '10m', // 10MB max file size
    maxFiles: process.env.LOG_MAX_FILES || 5, // Keep 5 files max
    enableDebug: process.env.LOG_ENABLE_DEBUG === 'true' || false // Enable debug logging only when needed
  },
  
  metrics: {
    enabled: process.env.METRICS_ENABLED === 'true' || true
  },
  
  arkLogs: {
    basePath: process.env.ARK_LOGS_BASE_PATH || 
      (process.env.SERVER_MODE === 'native' ? 
        path.normalize(process.env.NATIVE_BASE_PATH || 'C:\\ARK') : 
        '/home/gameserver/server-files')
  }
};

export default config; 
 