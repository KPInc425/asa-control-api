import { getAllServerConfigs, getServerConfig } from './services/database.js';
import { existsSync } from 'fs';
import path from 'path';
import serviceDetector from './utils/service-detector.js';

async function testDatabase() {
  console.log('=== Database Test ===');
  
  try {
    const configs = getAllServerConfigs();
    console.log(`Found ${configs.length} server configurations in database:`);
    
    configs.forEach(config => {
      try {
        const parsed = JSON.parse(config.config_data);
        console.log(`- ${config.name}:`, {
          disableBattleEye: parsed.disableBattleEye,
          gamePort: parsed.gamePort,
          rconPort: parsed.rconPort
        });
      } catch (error) {
        console.log(`- ${config.name}: Failed to parse config`);
      }
    });
  } catch (error) {
    console.error('Database test failed:', error);
  }
}

async function testLogFiles() {
  console.log('\n=== Log Files Test ===');
  
  try {
    await serviceDetector.detectServiceMode();
    const serviceInfo = serviceDetector.getServiceInfo();
    const logPaths = serviceDetector.getLogFilePaths();
    
    console.log('Service Info:', serviceInfo);
    console.log('\nLog Paths:');
    
    Object.entries(logPaths).forEach(([key, paths]) => {
      console.log(`\n${key}:`);
      paths.forEach(path => {
        const exists = existsSync(path);
        console.log(`  ${exists ? '✅' : '❌'} ${path}`);
      });
    });
  } catch (error) {
    console.error('Log files test failed:', error);
  }
}

async function main() {
  await testDatabase();
  await testLogFiles();
}

main().catch(console.error); 
