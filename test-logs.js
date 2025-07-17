import serviceDetector from './utils/service-detector.js';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

async function testLogs() {
  try {
    console.log('Testing system logs detection...');
    
    // Detect service mode
    await serviceDetector.detectServiceMode();
    const serviceInfo = serviceDetector.getServiceInfo();
    const logPaths = serviceDetector.getLogFilePaths();
    
    console.log('\nService Info:', serviceInfo);
    console.log('\nLog Paths:', logPaths);
    
    // Check if log files exist
    console.log('\nChecking log file existence:');
    
    for (const [logType, paths] of Object.entries(logPaths)) {
      console.log(`\n${logType}:`);
      for (const filePath of paths) {
        const exists = existsSync(filePath);
        console.log(`  ${filePath}: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
        
        if (exists) {
          try {
            const fileStat = await stat(filePath);
            console.log(`    Size: ${(fileStat.size / 1024).toFixed(2)} KB`);
            console.log(`    Modified: ${fileStat.mtime.toISOString()}`);
          } catch (error) {
            console.log(`    Error reading file: ${error.message}`);
          }
        }
      }
    }
    
    // Check current working directory
    console.log(`\nCurrent working directory: ${process.cwd()}`);
    
    // Check if logs directory exists
    const logsDir = path.join(process.cwd(), 'logs');
    console.log(`\nLogs directory (${logsDir}): ${existsSync(logsDir) ? 'EXISTS' : 'NOT FOUND'}`);
    
    if (existsSync(logsDir)) {
      try {
        const { readdir } = await import('fs/promises');
        const files = await readdir(logsDir, { withFileTypes: true });
        console.log('Files in logs directory:');
        files.forEach(file => {
          if (file.isFile()) {
            console.log(`  - ${file.name}`);
          }
        });
      } catch (error) {
        console.log(`Error reading logs directory: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('Error testing logs:', error);
  }
}

testLogs(); 
