import { db } from './services/database.js';
import { createServerManager } from './services/server-manager.js';

async function debugServerConfig() {
  console.log('=== Debug Server Configuration ===\n');
  
  const serverName = 'iLGaming-Ragnarok';
  
  // Check what's in the database directly
  console.log('1. Checking database directly...');
  const serverConfigs = db.prepare('SELECT * FROM server_configs').all();
  console.log(`   Total server configs in database: ${serverConfigs.length}`);
  
  serverConfigs.forEach(config => {
    console.log(`   - Name: "${config.name}"`);
    console.log(`     ID: ${config.id}`);
    console.log(`     Config data length: ${config.config_data?.length || 0}`);
    if (config.config_data) {
      try {
        const parsed = JSON.parse(config.config_data);
        console.log(`     Cluster: ${parsed.clusterId || parsed.clusterName || 'none'}`);
        console.log(`     Mods: ${parsed.mods?.join(', ') || 'none'}`);
      } catch (e) {
        console.log(`     Parse error: ${e.message}`);
      }
    }
    console.log('');
  });
  
  // Check if the specific server exists
  console.log('2. Checking specific server...');
  const specificConfig = db.prepare('SELECT * FROM server_configs WHERE name = ?').get(serverName);
  if (specificConfig) {
    console.log(`   ✅ Found server "${serverName}" in database`);
    console.log(`   - ID: ${specificConfig.id}`);
    console.log(`   - Config data length: ${specificConfig.config_data?.length || 0}`);
    if (specificConfig.config_data) {
      try {
        const parsed = JSON.parse(specificConfig.config_data);
        console.log(`   - Cluster: ${parsed.clusterId || parsed.clusterName || 'none'}`);
        console.log(`   - Mods: ${parsed.mods?.join(', ') || 'none'}`);
      } catch (e) {
        console.log(`   - Parse error: ${e.message}`);
      }
    }
  } else {
    console.log(`   ❌ Server "${serverName}" NOT found in database`);
  }
  
  // Test the server manager methods
  console.log('\n3. Testing server manager methods...');
  const serverManager = createServerManager();
  
  console.log('   Testing getServerConfigFromDatabase...');
  const dbConfig = serverManager.getServerConfigFromDatabase(serverName);
  if (dbConfig) {
    console.log('   ✅ getServerConfigFromDatabase returned config');
    console.log(`   - Cluster: ${dbConfig.clusterId || dbConfig.clusterName || 'none'}`);
    console.log(`   - Mods: ${dbConfig.mods?.join(', ') || 'none'}`);
  } else {
    console.log('   ❌ getServerConfigFromDatabase returned null');
  }
  
  console.log('\n   Testing getClusterServerInfo...');
  const clusterInfo = await serverManager.getClusterServerInfo(serverName);
  if (clusterInfo) {
    console.log('   ✅ getClusterServerInfo returned config');
    console.log(`   - Cluster: ${clusterInfo.clusterId || clusterInfo.clusterName || 'none'}`);
    console.log(`   - Mods: ${clusterInfo.mods?.join(', ') || 'none'}`);
  } else {
    console.log('   ❌ getClusterServerInfo returned null');
  }
  
  console.log('\n=== Debug Complete ===');
}

debugServerConfig().catch(console.error); 
