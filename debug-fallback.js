import { createServerManager } from './services/server-manager.js';
import fs from 'fs';
import path from 'path';

async function debugFallback() {
  console.log('=== Debug Fallback Logic ===\n');
  
  try {
    const serverManager = createServerManager();
    const serverName = 'iLGaming-Ragnarok';
    
    console.log('1. Testing database lookup...');
    const dbConfig = serverManager.getServerConfigFromDatabase(serverName);
    if (dbConfig) {
      console.log('   ✅ Server found in database');
      console.log(`   - Cluster: ${dbConfig.clusterId || dbConfig.clusterName || 'none'}`);
      
      // Check if clusterId exists
      const clusterId = dbConfig.clusterId || dbConfig.clusterName;
      if (clusterId) {
        console.log(`   - Cluster ID found: ${clusterId}`);
        console.log('   ✅ Database path should work, no need for fallback');
        return;
      } else {
        console.log('   ❌ No clusterId found in database config');
        console.log('   This is why it\'s falling back to disk-based configs');
      }
    } else {
      console.log('   ❌ Server not found in database');
    }
    
    console.log('\n2. Testing disk-based fallback...');
    
    // Check clusters path
    const clustersPath = path.join(process.env.NATIVE_BASE_PATH || 'C:\\ARK', 'clusters');
    console.log(`   Clusters path: ${clustersPath}`);
    
    try {
      const clusterDirs = await fs.readdir(clustersPath);
      console.log(`   Found ${clusterDirs.length} cluster directories: ${clusterDirs.join(', ')}`);
      
      for (const clusterDir of clusterDirs) {
        console.log(`\n   Checking cluster: ${clusterDir}`);
        
        try {
          const clusterConfigPath = path.join(clustersPath, clusterDir, 'cluster.json');
          console.log(`   Cluster config path: ${clusterConfigPath}`);
          
          if (await fs.access(clusterConfigPath).then(() => true).catch(() => false)) {
            const clusterConfigContent = await fs.readFile(clusterConfigPath, 'utf8');
            const clusterConfig = JSON.parse(clusterConfigContent);
            
            console.log(`   ✅ Cluster config loaded successfully`);
            console.log(`   - Servers count: ${clusterConfig.servers?.length || 0}`);
            
            if (clusterConfig.servers && Array.isArray(clusterConfig.servers)) {
              const serverConfig = clusterConfig.servers.find(s => s.name === serverName);
              if (serverConfig) {
                console.log(`   ✅ Found server "${serverName}" in cluster "${clusterDir}"`);
                console.log(`   - Server config: ${JSON.stringify(serverConfig, null, 2)}`);
                return;
              } else {
                console.log(`   ❌ Server "${serverName}" not found in cluster "${clusterDir}"`);
                console.log(`   - Available servers: ${clusterConfig.servers.map(s => s.name).join(', ')}`);
              }
            } else {
              console.log(`   ❌ No servers array in cluster config`);
            }
          } else {
            console.log(`   ❌ Cluster config file not found`);
          }
        } catch (error) {
          console.log(`   ❌ Error reading cluster ${clusterDir}: ${error.message}`);
        }
      }
      
      console.log('\n❌ Server not found in any cluster directory');
      
    } catch (error) {
      console.log(`   ❌ Error reading clusters directory: ${error.message}`);
    }
    
  } catch (error) {
    console.error('\n❌ Debug failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

debugFallback().catch(console.error); 
