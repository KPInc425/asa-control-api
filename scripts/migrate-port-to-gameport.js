#!/usr/bin/env node

/**
 * Migration script to update existing cluster configurations
 * from using 'port' to 'gamePort' for consistency
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  server: {
    native: {
      clustersPath: process.env.NATIVE_CLUSTERS_PATH || 'C:\\ARK\\clusters'
    }
  }
};

async function migrateClusterConfigs() {
  console.log('🔄 Starting migration from "port" to "gamePort"...');
  
  try {
    const clustersPath = config.server.native.clustersPath;
    
    // Check if clusters directory exists
    try {
      await fs.access(clustersPath);
    } catch (error) {
      console.log(`❌ Clusters directory not found: ${clustersPath}`);
      console.log('Migration not needed or clusters directory not accessible.');
      return;
    }
    
    const clusterDirs = await fs.readdir(clustersPath);
    let migratedClusters = 0;
    let migratedServers = 0;
    
    for (const clusterName of clusterDirs) {
      const clusterPath = path.join(clustersPath, clusterName);
      const clusterConfigPath = path.join(clusterPath, 'cluster.json');
      
      try {
        // Check if cluster.json exists
        await fs.access(clusterConfigPath);
        
        // Read cluster configuration
        const clusterContent = await fs.readFile(clusterConfigPath, 'utf8');
        const clusterConfig = JSON.parse(clusterContent);
        
        let clusterModified = false;
        
        // Update servers array if it exists
        if (clusterConfig.servers && Array.isArray(clusterConfig.servers)) {
          for (const server of clusterConfig.servers) {
            if (server.port !== undefined && server.gamePort === undefined) {
              // Migrate port to gamePort
              server.gamePort = server.port;
              delete server.port;
              clusterModified = true;
              migratedServers++;
              console.log(`  📝 Migrated server ${server.name}: port ${server.port} → gamePort ${server.gamePort}`);
            }
          }
        }
        
        // Update individual server config files
        if (clusterConfig.servers && Array.isArray(clusterConfig.servers)) {
          for (const server of clusterConfig.servers) {
            const serverConfigPath = path.join(clusterPath, server.name, 'server-config.json');
            
            try {
              await fs.access(serverConfigPath);
              const serverConfigContent = await fs.readFile(serverConfigPath, 'utf8');
              const serverConfig = JSON.parse(serverConfigContent);
              
              if (serverConfig.port !== undefined && serverConfig.gamePort === undefined) {
                // Migrate port to gamePort in server config
                serverConfig.gamePort = serverConfig.port;
                delete serverConfig.port;
                
                await fs.writeFile(serverConfigPath, JSON.stringify(serverConfig, null, 2));
                console.log(`  📝 Migrated server config for ${server.name}: port ${serverConfig.port} → gamePort ${serverConfig.gamePort}`);
              }
            } catch (error) {
              // Server config file doesn't exist or can't be read, skip
            }
          }
        }
        
        // Save updated cluster configuration
        if (clusterModified) {
          await fs.writeFile(clusterConfigPath, JSON.stringify(clusterConfig, null, 2));
          migratedClusters++;
          console.log(`✅ Migrated cluster: ${clusterName}`);
        }
        
      } catch (error) {
        console.log(`⚠️  Skipped cluster ${clusterName}: ${error.message}`);
      }
    }
    
    console.log('\n🎉 Migration completed!');
    console.log(`📊 Results:`);
    console.log(`  - Clusters migrated: ${migratedClusters}`);
    console.log(`  - Servers migrated: ${migratedServers}`);
    
    if (migratedClusters === 0 && migratedServers === 0) {
      console.log('✨ No migration needed - all configurations already use "gamePort"');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateClusterConfigs();
}

export { migrateClusterConfigs }; 
