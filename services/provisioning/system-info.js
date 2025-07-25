import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import logger from '../../utils/logger.js';

/**
 * System Information Manager
 * Handles system resource monitoring and status checks
 */
export class SystemInfo {
  constructor(basePath, clustersPath, serversPath) {
    this.basePath = basePath || 'C:\\ARK';
    this.clustersPath = clustersPath;
    this.serversPath = serversPath;
  }

  /**
   * Get comprehensive system information
   */
  async getSystemInfo() {
    // Disk space (Windows: use drive letter from basePath)
    let diskSpace = { total: 0, free: 0, used: 0, usagePercent: 0, drive: '' };
    try {
      const basePath = this.basePath || 'C:\\';
      const drive = path.parse(basePath).root;
      // Try to use statSync for free/total (fallback, not as accurate as check-disk-space)
      // If you have check-disk-space or similar, use it here for better accuracy
      // Example: const { free, size } = await checkDiskSpace(drive);
      // diskSpace = { total: size, free, used: size - free, usagePercent: Math.round(((size - free) / size) * 100), drive };
      // Fallback: just show drive letter
      diskSpace.drive = drive;
    } catch {}

    // Memory
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    // SteamCMD/ASA checks
    const steamCmdInstalled = await this.checkSteamCmdInstalled();
    const asaBinariesInstalled = await this.checkASABinariesInstalled();

    return {
      diskSpace,
      memory: { 
        total: totalMem, 
        free: freeMem, 
        used: totalMem - freeMem, 
        usagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100) 
      },
      steamCmdInstalled,
      steamCmdPath: this.steamCmdPath,
      asaBinariesInstalled,
      basePath: this.basePath,
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      cpuCores: os.cpus().length
    };
  }

  /**
   * Check if SteamCMD is installed (requires steamCmdExe path)
   */
  async checkSteamCmdInstalled(steamCmdExe = null) {
    if (!steamCmdExe) {
      // Try common paths if no specific path provided
      const commonPaths = [
        path.join(this.basePath, 'steamcmd', 'steamcmd.exe'),
        'C:\\steamcmd\\steamcmd.exe',
        'D:\\steamcmd\\steamcmd.exe'
      ];
      
      for (const steamCmdPath of commonPaths) {
        if (existsSync(steamCmdPath)) {
          this.steamCmdPath = steamCmdPath;
          return true;
        }
      }
      return false;
    }

    try {
      await fs.access(steamCmdExe);
      this.steamCmdPath = steamCmdExe;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if ASA binaries are installed in any server
   */
  async checkASABinariesInstalled() {
    try {
      // Check for ASA server binary in clusters
      if (this.clustersPath && existsSync(this.clustersPath)) {
        const clusterDirs = await fs.readdir(this.clustersPath);
        for (const clusterName of clusterDirs) {
          const clusterPath = path.join(this.clustersPath, clusterName);
          if (existsSync(clusterPath)) {
            const serverDirs = await fs.readdir(clusterPath);
            for (const serverName of serverDirs) {
              const exePath = path.join(clusterPath, serverName, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
              if (existsSync(exePath)) {
                return true;
              }
            }
          }
        }
      }

      // Check for ASA server binary in standalone servers
      if (this.serversPath && existsSync(this.serversPath)) {
        const serverDirs = await fs.readdir(this.serversPath);
        for (const serverName of serverDirs) {
          const exePath = path.join(this.serversPath, serverName, 'binaries', 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe');
          if (existsSync(exePath)) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      logger.warn('Error checking ASA binaries:', error.message);
      return false;
    }
  }

  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Check system requirements for cluster creation
   */
  async checkSystemRequirements(serverCount = 1) {
    const systemInfo = await this.getSystemInfo();
    const requirements = {
      valid: true,
      warnings: [],
      errors: []
    };

    // Check disk space (need at least 10GB per server)
    const requiredSpace = serverCount * 10 * 1024 * 1024 * 1024; // 10GB per server
    if (systemInfo.diskSpace.free > 0 && systemInfo.diskSpace.free < requiredSpace) {
      requirements.warnings.push(
        `Insufficient disk space. Need ${this.formatBytes(requiredSpace)}, have ${this.formatBytes(systemInfo.diskSpace.free)}`
      );
    }

    // Check if system is ready
    if (!systemInfo.steamCmdInstalled || !systemInfo.asaBinariesInstalled) {
      requirements.warnings.push('System not fully initialized. SteamCMD or ASA binaries may not be installed.');
    }

    // Check memory (recommend at least 8GB for server hosting)
    const recommendedMemory = 8 * 1024 * 1024 * 1024; // 8GB
    if (systemInfo.memory.total < recommendedMemory) {
      requirements.warnings.push(
        `Low system memory. Recommended: ${this.formatBytes(recommendedMemory)}, available: ${this.formatBytes(systemInfo.memory.total)}`
      );
    }

    return requirements;
  }

  /**
   * Update paths if they change
   */
  updatePaths(basePath, clustersPath, serversPath) {
    this.basePath = basePath;
    this.clustersPath = clustersPath;
    this.serversPath = serversPath;
  }
} 
