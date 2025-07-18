#!/usr/bin/env node

/**
 * Migration script to move existing JSON data to SQLite database
 * Migrates: native-servers.json, shared-mods.json, server-mods/*.json, config-exclusions.json
 * 
 * Supports both development and production service environments
 */

console.log('DEBUG: process.argv:', process.argv);

import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
let customDbPath = null;
let forceServicePath = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--db-path' && i + 1 < args.length) {
    customDbPath = args[i + 1];
    i++; // Skip next argument
  } else if (args[i] === '--service-path') {
    forceServicePath = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Migration script for ASA Management API

Usage: node migrate-json-to-sqlite.js [options]

Options:
  --db-path <path>     Specify custom database path
  --service-path       Force using service path (C:\\ASA-API\\data\\asa-data.sqlite)
  --help, -h          Show this help message

Examples:
  node migrate-json-to-sqlite.js
  node migrate-json-to-sqlite.js --service-path
  node migrate-json-to-sqlite.js --db-path "D:\\custom\\path\\asa-data.sqlite"
`);
    process.exit(0);
  }
}

// Determine database path
function getDatabasePath() {
  // If custom path is specified, use it
  if (customDbPath) {
    console.log('Using custom database path:', customDbPath);
    return customDbPath;
  }

  // Check if we're running in a service environment
  const currentDir = process.cwd();
  const isServiceEnvironment = forceServicePath || 
    currentDir.includes('C:\\ASA-API') || 
    process.env.NODE_ENV === 'production' ||
    process.env.SERVICE_MODE === 'true';

  if (isServiceEnvironment) {
    const serviceDbPath = path.join('C:\\ASA-API', 'data', 'asa-data.sqlite');
    console.log('Detected service environment, using database path:', serviceDbPath);
    return serviceDbPath;
  } else {
    // Development environment - use relative path from project
    const devDbPath = path.join(__dirname, '..', 'data', 'asa-data.sqlite');
    console.log('Detected development environment, using database path:', devDbPath);
    return devDbPath;
  }
}

// Dynamic database import
async function getDatabaseService() {
  const dbPath = getDatabasePath();
  
  // Ensure the data directory exists
  const dataDir = path.dirname(dbPath);
  try {
    await fs.access(dataDir);
  } catch {
    console.log('Creating data directory:', dataDir);
    await fs.mkdir(dataDir, { recursive: true });
  }

  // Create a temporary database service with the correct path
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath);

  // Create tables if they don't exist
  db.prepare(`CREATE TABLE IF NOT EXISTS server_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    config_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS shared_mods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mod_id TEXT UNIQUE NOT NULL,
    mod_name TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS server_mods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_name TEXT NOT NULL,
    mod_id TEXT NOT NULL,
    mod_name TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(server_name, mod_id)
  )`).run();

  // Database functions
  const upsertServerConfig = (name, configData) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO server_configs (name, config_data, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
    return stmt.run(name, configData);
  };

  const upsertSharedMod = (modId, modName = null, enabled = true) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO shared_mods (mod_id, mod_name, enabled, updated_at) 
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);
    return stmt.run(modId, modName, enabled);
  };

  const upsertServerMod = (serverName, modId, modName = null, enabled = true) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO server_mods (server_name, mod_id, mod_name, enabled, updated_at) 
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    return stmt.run(serverName, modId, modName, enabled);
  };

  return { upsertServerConfig, upsertSharedMod, upsertServerMod, db };
}

// Get paths from environment variables with fallbacks
const NATIVE_BASE_PATH = process.env.NATIVE_BASE_PATH || 'C:\\ARK';
const NATIVE_CLUSTERS_PATH = process.env.NATIVE_CLUSTERS_PATH || path.join(NATIVE_BASE_PATH, 'clusters');
const SERVER_MODS_PATH = path.join(NATIVE_BASE_PATH, 'server-mods.json');
const SHARED_MODS_PATH = path.join(NATIVE_BASE_PATH, 'shared-mods.json');
const SERVER_MODS_FOLDER = path.join(NATIVE_BASE_PATH, 'server-mods');

console.log('DEBUG: Using NATIVE_BASE_PATH:', NATIVE_BASE_PATH);
console.log('DEBUG: Using NATIVE_CLUSTERS_PATH:', NATIVE_CLUSTERS_PATH);
console.log('DEBUG: Server mods path:', SERVER_MODS_PATH);
console.log('DEBUG: Shared mods path:', SHARED_MODS_PATH);
console.log('DEBUG: Server mods folder:', SERVER_MODS_FOLDER);

async function migrateClustersAndServers(dbService) {
  console.log('DEBUG: Scanning clusters in', NATIVE_CLUSTERS_PATH);
  let totalClusters = 0;
  let totalServers = 0;
  try {
    const clusterDirs = await fs.readdir(NATIVE_CLUSTERS_PATH);
    for (const clusterName of clusterDirs) {
      const clusterDir = path.join(NATIVE_CLUSTERS_PATH, clusterName);
      const clusterConfigPath = path.join(clusterDir, 'cluster.json');
      try {
        const clusterConfigRaw = await fs.readFile(clusterConfigPath, 'utf8');
        const clusterConfig = JSON.parse(clusterConfigRaw);
        await dbService.upsertServerConfig(clusterName, JSON.stringify(clusterConfig));
        totalClusters++;
        console.log(`Imported cluster: ${clusterName}`);
        // Import each server in the cluster
        if (Array.isArray(clusterConfig.servers)) {
          for (const server of clusterConfig.servers) {
            const serverDir = path.join(clusterDir, server.name);
            const serverConfigPath = path.join(serverDir, 'server-config.json');
            try {
              const serverConfigRaw = await fs.readFile(serverConfigPath, 'utf8');
              const serverConfig = JSON.parse(serverConfigRaw);
              await dbService.upsertServerConfig(server.name, JSON.stringify(serverConfig));
              totalServers++;
              console.log(`  Imported server: ${server.name}`);
            } catch (err) {
              console.warn(`  No server-config.json for ${server.name} in ${clusterName}`);
            }
          }
        }
      } catch (err) {
        console.warn(`No cluster.json in ${clusterDir}`);
      }
    }
    console.log(`✅ Migrated ${totalClusters} clusters and ${totalServers} servers.`);
  } catch (err) {
    console.error('Failed to scan clusters:', err);
  }
}

async function migrateServerMods(dbService) {
  try {
    const modsRaw = await fs.readFile(SERVER_MODS_PATH, 'utf8');
    const serverMods = JSON.parse(modsRaw);
    let count = 0;
    for (const [serverName, mods] of Object.entries(serverMods)) {
      if (Array.isArray(mods)) {
        for (const modId of mods) {
          await dbService.upsertServerMod(serverName, modId.toString(), null, true);
          count++;
        }
      }
    }
    console.log(`✅ Migrated server mods for ${Object.keys(serverMods).length} servers (${count} mods).`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('No server-mods.json found, skipping.');
    } else {
      console.error('Failed to migrate server-mods.json:', err);
    }
  }
}

async function migrateServerModsFromFolder(dbService) {
  try {
    const serverModFiles = await fs.readdir(SERVER_MODS_FOLDER);
    let totalServers = 0;
    let totalMods = 0;
    
    for (const fileName of serverModFiles) {
      if (fileName.endsWith('.json')) {
        const serverName = fileName.replace('.json', '');
        const filePath = path.join(SERVER_MODS_FOLDER, fileName);
        
        try {
          const modsRaw = await fs.readFile(filePath, 'utf8');
          const mods = JSON.parse(modsRaw);
          
          if (Array.isArray(mods)) {
            for (const modId of mods) {
              await dbService.upsertServerMod(serverName, modId.toString(), null, true);
              totalMods++;
            }
            totalServers++;
            console.log(`  Migrated mods for server: ${serverName} (${mods.length} mods)`);
          }
        } catch (err) {
          console.warn(`  Failed to read mods for ${serverName}:`, err.message);
        }
      }
    }
    
    if (totalServers > 0) {
      console.log(`✅ Migrated mods for ${totalServers} servers from server-mods folder (${totalMods} total mods).`);
    } else {
      console.log('No server mod files found in server-mods folder, skipping.');
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('No server-mods folder found, skipping.');
    } else {
      console.error('Failed to migrate server-mods folder:', err);
    }
  }
}

async function migrateModsFromServerConfigs(dbService) {
  try {
    const clusterDirs = await fs.readdir(NATIVE_CLUSTERS_PATH);
    let totalServers = 0;
    let totalMods = 0;
    
    for (const clusterName of clusterDirs) {
      const clusterDir = path.join(NATIVE_CLUSTERS_PATH, clusterName);
      const clusterConfigPath = path.join(clusterDir, 'cluster.json');
      
      try {
        const clusterConfigRaw = await fs.readFile(clusterConfigPath, 'utf8');
        const clusterConfig = JSON.parse(clusterConfigRaw);
        
        if (Array.isArray(clusterConfig.servers)) {
          for (const server of clusterConfig.servers) {
            const serverDir = path.join(clusterDir, server.name);
            const serverConfigPath = path.join(serverDir, 'server-config.json');
            
            try {
              const serverConfigRaw = await fs.readFile(serverConfigPath, 'utf8');
              const serverConfig = JSON.parse(serverConfigRaw);
              
              // Check if server config has mods
              if (serverConfig.mods && Array.isArray(serverConfig.mods)) {
                for (const modId of serverConfig.mods) {
                  await dbService.upsertServerMod(server.name, modId.toString(), null, true);
                  totalMods++;
                }
                totalServers++;
                console.log(`  Migrated mods from server-config.json for: ${server.name} (${serverConfig.mods.length} mods)`);
              }
            } catch (err) {
              // Server config file doesn't exist or can't be read, skip
            }
          }
        }
      } catch (err) {
        // Cluster config doesn't exist or can't be read, skip
      }
    }
    
    if (totalServers > 0) {
      console.log(`✅ Migrated mods from server-config.json for ${totalServers} servers (${totalMods} total mods).`);
    } else {
      console.log('No mods found in server-config.json files, skipping.');
    }
  } catch (err) {
    console.error('Failed to migrate mods from server-config.json files:', err);
  }
}

async function migrateSharedMods(dbService) {
  try {
    const modsRaw = await fs.readFile(SHARED_MODS_PATH, 'utf8');
    const sharedMods = JSON.parse(modsRaw);
    let count = 0;
    if (Array.isArray(sharedMods)) {
      for (const modId of sharedMods) {
        await dbService.upsertSharedMod(modId.toString(), null, true);
        count++;
      }
    } else if (Array.isArray(sharedMods.modList)) {
      for (const modId of sharedMods.modList) {
        await dbService.upsertSharedMod(modId.toString(), null, true);
        count++;
      }
    }
    console.log(`✅ Migrated ${count} shared mods.`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('No shared-mods.json found, skipping.');
    } else {
      console.error('Failed to migrate shared-mods.json:', err);
    }
  }
}

async function main() {
  console.log('=== ASA Management API Migration Script ===');
  console.log('Current working directory:', process.cwd());
  
  try {
    const dbService = await getDatabaseService();
    console.log('Database service initialized successfully');
    
    await migrateClustersAndServers(dbService);
    await migrateServerMods(dbService);
    await migrateServerModsFromFolder(dbService);
    await migrateModsFromServerConfigs(dbService);
    await migrateSharedMods(dbService);
    
    console.log('Migration complete.');
    
    // Close database connection
    dbService.db.close();
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main(); 
