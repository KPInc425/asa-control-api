import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('Testing SteamCMD detection...');
console.log('NATIVE_BASE_PATH:', process.env.NATIVE_BASE_PATH);

const basePath = process.env.NATIVE_BASE_PATH || 'C:\\ARK';
console.log('Using base path:', basePath);

// Check the default installation path
const defaultSteamCmdPath = path.join(basePath, 'steamcmd', 'steamcmd.exe');
console.log('Default SteamCMD path:', defaultSteamCmdPath);

// Check if SteamCMD exists at the default path
try {
  await fs.access(defaultSteamCmdPath);
  console.log('✅ SteamCMD found at default path!');
} catch (error) {
  console.log('❌ SteamCMD not found at default path');
}

// Check your specific G: drive path
const gDrivePath = 'G:\\ARK\\steamcmd\\steamcmd.exe';
console.log('G: drive SteamCMD path:', gDrivePath);

try {
  await fs.access(gDrivePath);
  console.log('✅ SteamCMD found at G: drive path!');
} catch (error) {
  console.log('❌ SteamCMD not found at G: drive path');
}

// Check other common paths
const commonPaths = [
  'C:\\Steam\\steamcmd\\steamcmd.exe',
  'C:\\Program Files\\Steam\\steamcmd\\steamcmd.exe',
  'C:\\Program Files (x86)\\Steam\\steamcmd\\steamcmd.exe',
  'G:\\ARK\\steamcmd\\steamcmd.exe'
];

console.log('\nChecking common paths:');
for (const steamCmdPath of commonPaths) {
  try {
    await fs.access(steamCmdPath);
    console.log(`✅ Found: ${steamCmdPath}`);
  } catch (error) {
    console.log(`❌ Not found: ${steamCmdPath}`);
  }
} 
