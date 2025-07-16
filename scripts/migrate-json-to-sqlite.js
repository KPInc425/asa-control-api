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
const CLUSTERS_PATH = path.join(NATIVE_BASE_PATH, 'clusters');
const SERVER_MODS_PATH = path.join(NATIVE_BASE_PATH, 'server-mods.json');
const SHARED_MODS_PATH = path.join(NATIVE_BASE_PATH, 'shared-mods.json');

console.log('DEBUG: Using NATIVE_BASE_PATH:', NATIVE_BASE_PATH);
console.log('DEBUG: Clusters path:', CLUSTERS_PATH);
console.log('DEBUG: Server mods path:', SERVER_MODS_PATH);
console.log('DEBUG: Shared mods path:', SHARED_MODS_PATH);

async function migrateClustersAndServers() {
  console.log('DEBUG: Scanning clusters in', CLUSTERS_PATH);
  let totalClusters = 0;
  let totalServers = 0;
  try {
    const clusterDirs = await fs.readdir(CLUSTERS_PATH);
    for (const clusterName of clusterDirs) {
      const clusterDir = path.join(CLUSTERS_PATH, clusterName);
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
  await migrateSharedMods();
  console.log('Migration complete.');
}

main(); 
