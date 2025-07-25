import fs from 'fs';

function checkLine1462() {
  console.log('=== Checking Line 1462 ===\n');
  
  const filePath = './services/server-manager.js';
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    console.log(`Total lines in file: ${lines.length}`);
    
    // Check lines around 1462
    const startLine = Math.max(1455, 0);
    const endLine = Math.min(1470, lines.length - 1);
    
    console.log(`\nLines ${startLine}-${endLine}:`);
    console.log('=' .repeat(80));
    
    for (let i = startLine; i <= endLine; i++) {
      const marker = i === 1461 ? '>>> ' : '    ';
      console.log(`${marker}${i + 1}: ${lines[i]}`);
    }
    
    console.log('=' .repeat(80));
    
    // Find the regenerateServerStartScript method
    const methodStart = content.indexOf('async regenerateServerStartScript(serverName)');
    if (methodStart !== -1) {
      const methodStartLine = content.substring(0, methodStart).split('\n').length;
      console.log(`\nregenerateServerStartScript method starts at line: ${methodStartLine}`);
      
      // Find the throw statement
      const throwStatement = content.indexOf('throw new Error(`Server ${serverName} not found in database or any cluster`);', methodStart);
      if (throwStatement !== -1) {
        const throwLine = content.substring(0, throwStatement).split('\n').length;
        console.log(`Throw statement is at line: ${throwLine}`);
        
        if (throwLine === 1462) {
          console.log('✅ Line 1462 is the throw statement - this is correct');
        } else {
          console.log(`❌ Line 1462 is NOT the throw statement. Throw is at line ${throwLine}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error reading file:', error.message);
  }
}

checkLine1462(); 
