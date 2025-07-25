import { createServerManager } from './services/server-manager.js';
import path from 'path';

async function debugDatabasePath() {
  console.log('=== Debug Database Path ===\n');
  
  try {
    const serverManager = createServerManager();
    const serverName = 'iLGaming-Ragnarok';
    
    console.log('1. Getting database config...');
    const dbServerConfig = serverManager.getServerConfigFromDatabase(serverName);
    if (!dbServerConfig) {
      console.log('   ❌ No database config found');
      return;
    }
    
    console.log('   ✅ Database config found');
    console.log(`   - Config keys: ${Object.keys(dbServerConfig).join(', ')}`);
    console.log(`   - clusterId: ${dbServerConfig.clusterId}`);
    console.log(`   - clusterName: ${dbServerConfig.clusterName}`);
    
    const clusterId = dbServerConfig.clusterId || dbServerConfig.clusterName;
    if (!clusterId) {
      console.log('   ❌ No clusterId found');
      return;
    }
    
    console.log(`   ✅ Cluster ID: ${clusterId}`);
    
    console.log('\n2. Testing getFinalModListForServer...');
    const finalMods = await serverManager.getFinalModListForServer(serverName);
    console.log(`   Final mods: ${finalMods.join(', ')}`);
    
    console.log('\n3. Testing excludeSharedMods...');
    const excludeSharedMods = dbServerConfig.excludeSharedMods === true;
    console.log(`   excludeSharedMods: ${excludeSharedMods}`);
    
    console.log('\n4. Testing config update...');
    dbServerConfig.mods = finalMods;
    dbServerConfig.excludeSharedMods = excludeSharedMods;
    console.log(`   Updated config - mods: ${dbServerConfig.mods.join(', ')}`);
    console.log(`   Updated config - excludeSharedMods: ${dbServerConfig.excludeSharedMods}`);
    
    console.log('\n5. Testing path construction...');
    const clustersPath = path.join(process.env.NATIVE_BASE_PATH || 'C:\\ARK', 'clusters');
    const serverPath = path.join(clustersPath, clusterId, serverName);
    console.log(`   Clusters path: ${clustersPath}`);
    console.log(`   Server path: ${serverPath}`);
    
    console.log('\n6. Testing provisioner import...');
    try {
      const { default: provisioner } = await import('./server-provisioner.js');
      console.log('   ✅ Provisioner imported successfully');
      console.log(`   Provisioner type: ${typeof provisioner}`);
      
      console.log('\n7. Testing createStartScriptInCluster...');
      await provisioner.createStartScriptInCluster(clusterId, serverPath, dbServerConfig);
      console.log('   ✅ createStartScriptInCluster completed successfully');
      
      console.log('\n✅ All database path steps completed successfully!');
      
    } catch (error) {
      console.error('   ❌ Error in provisioner step:', error.message);
      console.error('   Stack trace:', error.stack);
    }
    
  } catch (error) {
    console.error('\n❌ Debug failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

debugDatabasePath().catch(console.error); 
