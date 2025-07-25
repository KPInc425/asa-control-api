import { createServerManager } from './services/server-manager.js';

async function debugDeep() {
  console.log('=== Deep Debug - Tracing regenerateServerStartScript ===\n');
  
  try {
    const serverManager = createServerManager();
    const serverName = 'iLGaming-Ragnarok';
    
    console.log('1. Checking server manager instance...');
    console.log(`   Server manager type: ${serverManager.constructor.name}`);
    console.log(`   Has regenerateServerStartScript: ${typeof serverManager.regenerateServerStartScript === 'function'}`);
    
    // Get the actual function source
    const functionSource = serverManager.regenerateServerStartScript.toString();
    console.log(`   Function source length: ${functionSource.length}`);
    console.log(`   Function starts with: ${functionSource.substring(0, 100)}...`);
    
    // Check if it contains the key lines
    const hasGetServerConfigFromDatabase = functionSource.includes('getServerConfigFromDatabase');
    const hasGetServerConfig = functionSource.includes('getServerConfig(');
    
    console.log(`   Contains getServerConfigFromDatabase: ${hasGetServerConfigFromDatabase}`);
    console.log(`   Contains getServerConfig(: ${hasGetServerConfig}`);
    
    console.log('\n2. Testing getServerConfigFromDatabase directly...');
    const dbConfig = serverManager.getServerConfigFromDatabase(serverName);
    if (dbConfig) {
      console.log('   ✅ getServerConfigFromDatabase returned config');
      console.log(`   - Cluster: ${dbConfig.clusterId || dbConfig.clusterName || 'none'}`);
      console.log(`   - Mods: ${dbConfig.mods?.join(', ') || 'none'}`);
    } else {
      console.log('   ❌ getServerConfigFromDatabase returned null');
    }
    
    console.log('\n3. Testing getFinalModListForServer...');
    const finalMods = await serverManager.getFinalModListForServer(serverName);
    console.log(`   Final mods: ${finalMods.join(', ')}`);
    
    console.log('\n4. Testing regenerateServerStartScript with detailed logging...');
    
    // Add a try-catch around the specific call to see exactly where it fails
    try {
      console.log('   About to call regenerateServerStartScript...');
      await serverManager.regenerateServerStartScript(serverName);
      console.log('   ✅ regenerateServerStartScript completed successfully!');
    } catch (error) {
      console.error('   ❌ regenerateServerStartScript failed:');
      console.error(`   Error message: ${error.message}`);
      console.error(`   Error stack: ${error.stack}`);
      
      // Check if the error is coming from a different line
      const stackLines = error.stack.split('\n');
      for (const line of stackLines) {
        if (line.includes('server-manager.js:')) {
          console.error(`   Stack trace line: ${line.trim()}`);
        }
      }
    }
    
  } catch (error) {
    console.error('\n❌ Debug failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

debugDeep().catch(console.error); 
