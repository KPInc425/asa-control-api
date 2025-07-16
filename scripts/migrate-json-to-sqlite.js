#!/usr/bin/env node

/**
 * Migration script to move existing JSON data to SQLite database
 * Migrates: native-servers.json, shared-mods.json, server-mods/*.json, config-exclusions.json
 */

console.log('DEBUG: process.argv:', process.argv);

import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { upsertServerConfig, upsertSharedMod, upsertServerMod } from '../services/database.js';

// Load environment variables from .env file
dotenv.config();

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

async function migrateClustersAndServers() {
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
        await upsertServerConfig(clusterName, JSON.stringify(clusterConfig));
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
              await upsertServerConfig(server.name, JSON.stringify(serverConfig));
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

async function migrateServerMods() {
  try {
    const modsRaw = await fs.readFile(SERVER_MODS_PATH, 'utf8');
    const serverMods = JSON.parse(modsRaw);
    let count = 0;
    for (const [serverName, mods] of Object.entries(serverMods)) {
      if (Array.isArray(mods)) {
        for (const modId of mods) {
          await upsertServerMod(serverName, modId.toString(), null, true);
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

async function migrateServerModsFromFolder() {
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
              await upsertServerMod(serverName, modId.toString(), null, true);
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

async function migrateModsFromServerConfigs() {
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
                  await upsertServerMod(server.name, modId.toString(), null, true);
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

async function migrateSharedMods() {
  try {
    const modsRaw = await fs.readFile(SHARED_MODS_PATH, 'utf8');
    const sharedMods = JSON.parse(modsRaw);
    let count = 0;
    if (Array.isArray(sharedMods)) {
      for (const modId of sharedMods) {
        await upsertSharedMod(modId.toString(), null, true);
        count++;
      }
    } else if (Array.isArray(sharedMods.modList)) {
      for (const modId of sharedMods.modList) {
        await upsertSharedMod(modId.toString(), null, true);
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
  await migrateClustersAndServers();
  await migrateServerMods();
  await migrateServerModsFromFolder();
  await migrateModsFromServerConfigs();
  await migrateSharedMods();
  console.log('Migration complete.');
}

main(); 
