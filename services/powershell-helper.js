import { spawn } from 'child_process';
import logger from '../utils/logger.js';
import path from 'path';

/**
 * PowerShell Helper Service
 * Executes PowerShell commands on the Windows host to manage ASA servers
 */
export class PowerShellHelper {
  constructor() {
    // Use Windows PowerShell path, fallback to common Windows locations
    this.powershellPath = process.env.POWERSHELL_PATH || 'powershell.exe';
    this.enabled = process.env.POWERSHELL_ENABLED !== 'false'; // Enable by default
    
    if (!this.enabled) {
      logger.warn('PowerShell helper is disabled. Set POWERSHELL_ENABLED=true to enable.');
    }
  }

  /**
   * Execute a PowerShell command
   * @param {string} command - PowerShell command to execute
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} - Result with success, output, and error
   */
  async executeCommand(command, options = {}) {
    if (!this.enabled) {
      throw new Error('PowerShell helper is disabled');
    }

    return new Promise((resolve, reject) => {
      const args = ['-Command', command];
      if (options.noProfile) {
        args.unshift('-NoProfile');
      }
      if (options.executionPolicy) {
        args.unshift(`-ExecutionPolicy`, options.executionPolicy);
      }

      logger.info(`Executing PowerShell command: ${command}`);

      const powershell = spawn(this.powershellPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      });

      let stdout = '';
      let stderr = '';

      powershell.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      powershell.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      powershell.on('close', (code) => {
        if (code === 0) {
          logger.info(`PowerShell command executed successfully`);
          resolve({
            success: true,
            output: stdout.trim(),
            error: stderr.trim(),
            code
          });
        } else {
          logger.error(`PowerShell command failed with code ${code}: ${stderr}`);
          reject({
            success: false,
            output: stdout.trim(),
            error: stderr.trim(),
            code
          });
        }
      });

      powershell.on('error', (error) => {
        logger.error(`PowerShell execution error:`, error);
        reject({
          success: false,
          output: stdout.trim(),
          error: error.message,
          code: -1
        });
      });
    });
  }

  /**
   * Start a batch file on the Windows host
   * @param {string} batchFilePath - Full path to the .bat file
   * @param {string} workingDirectory - Working directory for the process
   * @returns {Promise<Object>} - Result with process info
   */
  async startBatchFile(batchFilePath, workingDirectory = null) {
    const command = `Start-Process -FilePath "${batchFilePath}" -WorkingDirectory "${workingDirectory || path.dirname(batchFilePath)}" -WindowStyle Normal -PassThru | Select-Object Id, ProcessName, StartTime | ConvertTo-Json`;
    
    try {
      const result = await this.executeCommand(command);
      if (result.success) {
        const processInfo = JSON.parse(result.output);
        logger.info(`Started batch file: ${batchFilePath}, Process ID: ${processInfo.Id}`);
        return {
          success: true,
          processId: processInfo.Id,
          processName: processInfo.ProcessName,
          startTime: processInfo.StartTime,
          message: `Batch file started successfully with PID ${processInfo.Id}`
        };
      }
      return result;
    } catch (error) {
      logger.error(`Failed to start batch file ${batchFilePath}:`, error);
      throw error;
    }
  }

  /**
   * Stop a process by ID
   * @param {number} processId - Process ID to stop
   * @param {boolean} force - Force kill the process
   * @returns {Promise<Object>} - Result
   */
  async stopProcess(processId, force = false) {
    const command = force 
      ? `Stop-Process -Id ${processId} -Force -PassThru | Select-Object Id, ProcessName | ConvertTo-Json`
      : `Stop-Process -Id ${processId} -PassThru | Select-Object Id, ProcessName | ConvertTo-Json`;

    try {
      const result = await this.executeCommand(command);
      if (result.success) {
        const processInfo = JSON.parse(result.output);
        logger.info(`Stopped process: ${processInfo.ProcessName}, PID: ${processInfo.Id}`);
        return {
          success: true,
          processId: processInfo.Id,
          processName: processInfo.ProcessName,
          message: `Process ${processInfo.ProcessName} (PID: ${processInfo.Id}) stopped successfully`
        };
      }
      return result;
    } catch (error) {
      logger.error(`Failed to stop process ${processId}:`, error);
      throw error;
    }
  }

  /**
   * Stop a process by name
   * @param {string} processName - Process name to stop
   * @param {boolean} force - Force kill the process
   * @returns {Promise<Object>} - Result
   */
  async stopProcessByName(processName, force = false) {
    const command = force 
      ? `Stop-Process -Name "${processName}" -Force -PassThru | Select-Object Id, ProcessName | ConvertTo-Json`
      : `Stop-Process -Name "${processName}" -PassThru | Select-Object Id, ProcessName | ConvertTo-Json`;

    try {
      const result = await this.executeCommand(command);
      if (result.success && result.output.trim()) {
        const processInfo = JSON.parse(result.output);
        logger.info(`Stopped process by name: ${processName}, PID: ${processInfo.Id}`);
        return {
          success: true,
          processId: processInfo.Id,
          processName: processInfo.ProcessName,
          message: `Process ${processName} (PID: ${processInfo.Id}) stopped successfully`
        };
      }
      return {
        success: false,
        message: `No processes found with name: ${processName}`
      };
    } catch (error) {
      logger.error(`Failed to stop process by name ${processName}:`, error);
      throw error;
    }
  }

  /**
   * Get process information by ID
   * @param {number} processId - Process ID
   * @returns {Promise<Object>} - Process information
   */
  async getProcessInfo(processId) {
    const command = `Get-Process -Id ${processId} -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, StartTime, CPU, WorkingSet, Responding | ConvertTo-Json`;

    try {
      const result = await this.executeCommand(command);
      if (result.success && result.output.trim()) {
        const processInfo = JSON.parse(result.output);
        return {
          success: true,
          process: processInfo
        };
      }
      return {
        success: false,
        message: `Process ${processId} not found`
      };
    } catch (error) {
      logger.error(`Failed to get process info for ${processId}:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Check if a process is running
   * @param {number} processId - Process ID to check
   * @returns {Promise<boolean>} - True if process is running
   */
  async isProcessRunning(processId) {
    try {
      const result = await this.getProcessInfo(processId);
      return result.success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all running processes with a specific name
   * @param {string} processName - Process name to search for
   * @returns {Promise<Array>} - Array of matching processes
   */
  async getProcessesByName(processName) {
    const command = `Get-Process -Name "${processName}" -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, StartTime, CPU, WorkingSet | ConvertTo-Json`;

    try {
      const result = await this.executeCommand(command);
      if (result.success && result.output.trim()) {
        const processes = JSON.parse(result.output);
        return {
          success: true,
          processes: Array.isArray(processes) ? processes : [processes]
        };
      }
      return {
        success: true,
        processes: []
      };
    } catch (error) {
      logger.error(`Failed to get processes by name ${processName}:`, error);
      return {
        success: false,
        processes: [],
        error: error.message
      };
    }
  }

  /**
   * Test PowerShell connectivity
   * @returns {Promise<Object>} - Test result
   */
  async testConnection() {
    try {
      const result = await this.executeCommand('Get-Date | ConvertTo-Json');
      if (result.success) {
        logger.info('PowerShell connection test successful');
        return {
          success: true,
          message: 'PowerShell connection working',
          timestamp: JSON.parse(result.output)
        };
      }
      return {
        success: false,
        message: 'PowerShell connection failed',
        error: result.error
      };
    } catch (error) {
      logger.error('PowerShell connection test failed:', error);
      return {
        success: false,
        message: 'PowerShell connection test failed',
        error: error.message
      };
    }
  }
}

export default PowerShellHelper; 
