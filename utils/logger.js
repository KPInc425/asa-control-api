import winston from 'winston';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create logs directory if it doesn't exist
import { mkdir, rename, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';

const logsDir = join(__dirname, '..', 'logs');
if (!existsSync(logsDir)) {
  await mkdir(logsDir, { recursive: true });
}

// Log rotation function - create backups when API restarts
async function rotateLogs() {
  try {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .split('.')[0]; // YYYY-MM-DD_HH-mm-ss format
    
    const backupDir = join(logsDir, 'backups', timestamp);
    
    // Create backup directory if it doesn't exist
    if (!existsSync(backupDir)) {
      await mkdir(backupDir, { recursive: true });
    }
    
    // List of log files to rotate
    const logFiles = [
      'combined.log',
      'error.log',
      'node-out.log',
      'node-err.log',
      'asa-api-service.log'
    ];
    
    for (const logFile of logFiles) {
      const logPath = join(logsDir, logFile);
      if (existsSync(logPath)) {
        const backupPath = join(backupDir, logFile);
        await rename(logPath, backupPath);
        console.log(`Rotated log file: ${logFile} -> ${backupPath}`);
      }
    }
    
    // Clean up old backups (keep last 7 days)
    await cleanupOldBackups();
    
  } catch (error) {
    console.error('Error rotating logs:', error);
  }
}

// Clean up old backup directories
async function cleanupOldBackups() {
  try {
    const backupDir = join(logsDir, 'backups');
    if (!existsSync(backupDir)) return;
    
    const backupDirs = await readdir(backupDir);
    const now = new Date();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    
    for (const dir of backupDirs) {
      const dirPath = join(backupDir, dir);
      const dirStat = await stat(dirPath);
      const age = now.getTime() - dirStat.mtime.getTime();
      
      if (age > maxAge) {
        // Remove old backup directory
        await import('fs/promises').then(fs => fs.rm(dirPath, { recursive: true, force: true }));
        console.log(`Removed old backup: ${dir}`);
      }
    }
  } catch (error) {
    console.error('Error cleaning up old backups:', error);
  }
}

// Rotate logs on startup
await rotateLogs();

// Create main logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'asa-control-api' },
  transports: [
    // Write all logs with importance level of `error` or less to `error.log`
    new winston.transports.File({ 
      filename: join(logsDir, 'error.log'), 
      level: 'error' 
    }),
    // Write all logs with importance level of `info` or less to `combined.log`
    new winston.transports.File({ 
      filename: join(logsDir, 'combined.log') 
    }),
    // Write stdout logs to `node-out.log`
    new winston.transports.File({ 
      filename: join(logsDir, 'node-out.log'),
      level: 'info'
    }),
    // Write stderr logs to `node-err.log`
    new winston.transports.File({ 
      filename: join(logsDir, 'node-err.log'),
      level: 'error'
    })
  ],
});

// Create service-specific logger for asa-api-service.log
const serviceLogger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'asa-control-api', type: 'service-event' },
  transports: [
    // Service events only - this will be filtered by the custom format
    new winston.transports.File({ 
      filename: join(logsDir, 'asa-api-service.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, service, type, ...meta }) => {
          // Only log if it's a service event or has service-specific metadata
          if (type === 'service-event' || meta.serviceEvent || meta.eventType === 'service') {
            return JSON.stringify({
              timestamp,
              level,
              message,
              service,
              type,
              ...meta
            });
          }
          return null; // Don't log non-service events
        })
      )
    })
  ],
});

// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
if (config.server.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
  
  serviceLogger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Create a service event logger function
logger.serviceEvent = (level, message, meta = {}) => {
  serviceLogger.log(level, message, { 
    ...meta, 
    serviceEvent: true,
    eventType: 'service'
  });
};

// Log startup event
logger.serviceEvent('info', 'ASA Control API starting up', {
  event: 'startup',
  timestamp: new Date().toISOString(),
  version: '1.0.0'
});

export default logger; 
