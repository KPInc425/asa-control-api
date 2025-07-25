import fs from 'fs';
import path from 'path';

function checkFileContent() {
  console.log('=== Checking File Content ===\n');
  
  const filePath = './services/server-manager.js';
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Find the regenerateServerStartScript method
    const methodStart = content.indexOf('async regenerateServerStartScript(serverName)');
    if (methodStart === -1) {
      console.log('❌ regenerateServerStartScript method not found in file');
      return;
    }
    
    // Find the end of the method (next method or end of class)
    const methodEnd = content.indexOf('async getFinalModListForServer(serverName)', methodStart);
    const methodContent = methodEnd !== -1 
      ? content.substring(methodStart, methodEnd)
      : content.substring(methodStart, methodStart + 2000);
    
    console.log('📄 regenerateServerStartScript method content:');
    console.log('=' .repeat(80));
    console.log(methodContent);
    console.log('=' .repeat(80));
    
    // Check for the key lines
    const hasGetServerConfigFromDatabase = methodContent.includes('this.getServerConfigFromDatabase(serverName)');
    const hasGetServerConfig = methodContent.includes('getServerConfig(serverName)');
    
    console.log('\n🔍 Analysis:');
    console.log(`   Uses getServerConfigFromDatabase: ${hasGetServerConfigFromDatabase ? '✅ YES' : '❌ NO'}`);
    console.log(`   Uses getServerConfig: ${hasGetServerConfig ? '❌ YES (OLD CODE)' : '✅ NO'}`);
    
    if (hasGetServerConfigFromDatabase && !hasGetServerConfig) {
      console.log('\n✅ File contains the FIXED version');
    } else if (hasGetServerConfig && !hasGetServerConfigFromDatabase) {
      console.log('\n❌ File contains the OLD version');
    } else {
      console.log('\n⚠️  File contains mixed or unexpected content');
    }
    
  } catch (error) {
    console.error('❌ Error reading file:', error.message);
  }
}

checkFileContent(); 
