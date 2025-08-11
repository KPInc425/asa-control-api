#!/usr/bin/env node

import { readdir, stat, unlink, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logsDir = join(__dirname, '..', 'logs');

async function cleanupLogs() {
  try {
    console.log('🧹 Starting log cleanup...');
    
    // Get all log files
    const files = await readdir(logsDir);
    const logFiles = files.filter(file => file.endsWith('.log'));
    
    console.log(`Found ${logFiles.length} log files`);
    
    let totalSize = 0;
    let deletedFiles = 0;
    let compressedFiles = 0;
    
    for (const file of logFiles) {
      const filePath = join(logsDir, file);
      const stats = await stat(filePath);
      totalSize += stats.size;
      
      // If file is larger than 50MB, compress it or delete old entries
      if (stats.size > 50 * 1024 * 1024) { // 50MB
        console.log(`📦 Large log file detected: ${file} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
        
        try {
          // Read the file and keep only the last 1000 lines
          const content = await readFile(filePath, 'utf8');
          const lines = content.split('\n');
          
          if (lines.length > 1000) {
            const truncatedContent = lines.slice(-1000).join('\n');
            await writeFile(filePath, truncatedContent);
            console.log(`✂️  Truncated ${file} to last 1000 lines`);
            compressedFiles++;
          }
        } catch (error) {
          console.error(`❌ Error processing ${file}:`, error.message);
        }
      }
      
      // Delete files older than 7 days
      const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
      if (ageInDays > 7) {
        await unlink(filePath);
        console.log(`🗑️  Deleted old log file: ${file} (${ageInDays.toFixed(1)} days old)`);
        deletedFiles++;
      }
    }
    
    console.log('\n📊 Cleanup Summary:');
    console.log(`   Total log files: ${logFiles.length}`);
    console.log(`   Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Files deleted: ${deletedFiles}`);
    console.log(`   Files compressed: ${compressedFiles}`);
    
    // Create a summary file
    const summary = {
      timestamp: new Date().toISOString(),
      totalFiles: logFiles.length,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      deletedFiles,
      compressedFiles
    };
    
    await writeFile(join(logsDir, 'cleanup-summary.json'), JSON.stringify(summary, null, 2));
    console.log('✅ Log cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during log cleanup:', error);
    process.exit(1);
  }
}

// Run cleanup
cleanupLogs();
