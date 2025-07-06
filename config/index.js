import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const config = {
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development'
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  
  docker: {
    socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'
  },
  
  asa: {
    // Root directory containing all ASA server folders
    serverRootPath: '/opt/asa/asa-server',
    // Default config subfolder structure (Config/WindowsServer/)
    configSubPath: process.env.ASA_CONFIG_SUB_PATH || 'Config/WindowsServer',
    // Update lock file path
    updateLockPath: process.env.ASA_UPDATE_LOCK_PATH || '/opt/asa/.update.lock',
    // Default config files to look for
    defaultConfigFiles: ['Game.ini', 'GameUserSettings.ini']
  },
  
  rcon: {
    defaultPort: parseInt(process.env.RCON_DEFAULT_PORT) || 32330,
    password: process.env.RCON_PASSWORD || 'admin'
  },
  
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    timeWindow: parseInt(process.env.RATE_LIMIT_TIME_WINDOW) || 900000 // 15 minutes
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000'
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || './logs/app.log'
  },
  
  metrics: {
    enabled: process.env.METRICS_ENABLED === 'true' || true
  },
  
  arkLogs: {
    basePath: process.env.ARK_LOGS_BASE_PATH || '/home/gameserver/server-files'
  }
};

export default config; 
 