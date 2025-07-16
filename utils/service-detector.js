import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import path from 'path';
import logger from './logger.js';

const execAsync = promisify(exec);

class ServiceDetector {
  constructor() {
    this.mode = null; // 'native' or 'docker'
    this.isWindowsService = null; // true if running as Windows service
    this.serviceInstallPath = null;
    this.logBasePath = null;
  }

  /**
   * Detect if the API is running in Docker or native mode
   */
  async detectServiceMode() {
    if (this.mode !== null) {
      return this.mode;
    }

    // 1. Docker detection (check env/cgroup)
    if (this.isDocker()) {
      this.mode = 'docker';
      this.isWindowsService = false;
      this.logBasePath = '/app';
      logger.info('Detected Docker mode - API running in a container');
      return this.mode;
    }

    // 2. Native mode (includes both node server.js and Windows service)
    this.mode = 'native';
    
    // Check if running as Windows service to determine log location
    this.isWindowsService = await this.checkIfRunningAsService();
    if (this.isWindowsService) {
      this.serviceInstallPath = 'C:\\ASA-API';
      this.logBasePath = this.serviceInstallPath;
      logger.info('Detected native mode (Windows service) - API running as Windows service');
    } else {
      this.logBasePath = process.cwd();
      logger.info('Detected native mode (development) - API running from working directory');
    }
    
    return this.mode;
  }

  /**
   * Check if running in Docker
   */
  isDocker() {
    try {
      if (process.env.DOCKER_CONTAINER || process.env.CONTAINER) return true;
      // Check cgroup (Linux)
      if (process.platform === 'linux') {
        const cgroup = require('fs').readFileSync('/proc/1/cgroup', 'utf8');
        if (cgroup.includes('docker') || cgroup.includes('kubepods')) return true;
      }
    } catch (e) {}
    return false;
  }

  /**
   * Check if the process is running as a Windows service
   */
  async checkIfRunningAsService() {
    try {
      // Only check on Windows
      if (process.platform !== 'win32') return false;
      
      // Method 1: Check if parent process is services.exe
      const parentProcess = await this.getParentProcess();
      if (parentProcess && parentProcess.toLowerCase().includes('services.exe')) {
        return true;
      }
      
      // Method 2: Check Windows service status
      const serviceStatus = await this.checkServiceStatus();
      if (serviceStatus && serviceStatus.running) {
        return true;
      }
      
      return false;
    } catch (error) {
      logger.warn('Error checking service status:', error);
      return false;
    }
  }

  /**
   * Get parent process name
   */
  async getParentProcess() {
    try {
      const { stdout } = await execAsync('wmic process where ProcessId=' + process.ppid + ' get Name /value');
      const match = stdout.match(/Name=([^\r\n]+)/);
      return match ? match[1] : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if the ASA-API service is running
   */
  async checkServiceStatus() {
    try {
      const { stdout } = await execAsync('sc query ASA-API');
      const stateMatch = stdout.match(/STATE\s+:\s+(\d+)/);
      const state = stateMatch ? parseInt(stateMatch[1]) : null;
      // State 4 = Running
      return {
        exists: !stdout.includes('does not exist'),
        running: state === 4,
        state: state
      };
    } catch (error) {
      return { exists: false, running: false, state: null };
    }
  }

  /**
   * Get the base path for logs
   */
  getLogBasePath() {
    return this.logBasePath || process.cwd();
  }

  /**
   * Get all possible log file paths
   */
  getLogFilePaths() {
    const basePath = this.getLogBasePath();
    const cwd = process.cwd();
    
    return {
      // Winston log files
      combined: [
        path.join(basePath, 'logs', 'combined.log'),
        path.join(cwd, 'logs', 'combined.log'),
        path.join(cwd, 'asa-docker-control-api', 'logs', 'combined.log')
      ],
      error: [
        path.join(basePath, 'logs', 'error.log'),
        path.join(cwd, 'logs', 'error.log'),
        path.join(cwd, 'asa-docker-control-api', 'logs', 'error.log')
      ],
      asaApiService: [
        path.join(basePath, 'logs', 'asa-api-service.log'),
        path.join(cwd, 'logs', 'asa-api-service.log'),
        path.join(cwd, 'asa-docker-control-api', 'logs', 'asa-api-service.log')
      ],
      nodeOut: [
        path.join(basePath, 'logs', 'node-out.log'),
        path.join(cwd, 'logs', 'node-out.log'),
        path.join(cwd, 'asa-docker-control-api', 'logs', 'node-out.log')
      ],
      nodeErr: [
        path.join(basePath, 'logs', 'node-err.log'),
        path.join(cwd, 'logs', 'node-err.log'),
        path.join(cwd, 'asa-docker-control-api', 'logs', 'node-err.log')
      ],
      // Service logs (only when running as Windows service)
      serviceOut: this.isWindowsService ? [
        path.join(basePath, 'logs', 'nssm-out.log'),
        'C:\\ASA-API\\logs\\nssm-out.log'
      ] : [],
      serviceErr: this.isWindowsService ? [
        path.join(basePath, 'logs', 'nssm-err.log'),
        'C:\\ASA-API\\logs\\nssm-err.log'
      ] : []
    };
  }

  /**
   * Get service information
   */
  getServiceInfo() {
    return {
      mode: this.mode,
      isWindowsService: this.isWindowsService,
      serviceInstallPath: this.serviceInstallPath,
      logBasePath: this.logBasePath,
      currentWorkingDirectory: process.cwd(),
      processId: process.pid,
      parentProcessId: process.ppid
    };
  }
}

// Create singleton instance
const serviceDetector = new ServiceDetector();

export default serviceDetector; 
