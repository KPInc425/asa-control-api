import { createServerManager } from './services/server-manager.js';

async function testCurrentCode() {
  console.log('=== Testing Current Code Version ===\n');
  
  try {
    const serverManager = createServerManager();
    const serverName = 'iLGaming-Ragnarok';
    
    console.log('1. Testing server discovery...');
    const serverInfo = await serverManager.getClusterServerInfo(serverName);
    if (serverInfo) {
      console.log('   ✅ Server found via getClusterServerInfo');
    } else {
      console.log('   ❌ Server not found via getClusterServerInfo');
      return;
    }
    
    console.log('\n2. Testing regenerateServerStartScript...');
    console.log('   This should work now with the fix...');
    
    await serverManager.regenerateServerStartScript(serverName);
    console.log('   ✅ regenerateServerStartScript completed successfully!');
    
    console.log('\n3. Testing server start...');
    console.log('   Starting server (this will call regenerateServerStartScript internally)...');
    
    const result = await serverManager.start(serverName);
    console.log('   ✅ Server start initiated successfully!');
    console.log(`   Result: ${JSON.stringify(result, null, 2)}`);
    
    console.log('\n=== Test Complete ===');
    console.log('✅ All tests passed - the fix is working!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Check if it's the old error
    if (error.message.includes('not found in database or any cluster')) {
      console.log('\n🔍 This appears to be the old error - the code fix may not be applied yet.');
      console.log('   Please ensure the service has been restarted after uploading the updated files.');
    }
  }
}

testCurrentCode().catch(console.error); 
