import { normalizeStatus } from "../utils/statusContract.js";

/**
 * Server statistics interface
 * Aligned with STATUS_ERROR_CONTRACT.md specification
 * @see docs/STATUS_ERROR_CONTRACT.md
 */
export class ServerStats {
  /**
   * @param {string} name - Server name
   * @param {string} status - Server status (uses ServerStatus constants)
   * @param {number} cpu - CPU usage percentage
   * @param {number} memory - Memory usage in MB
   * @param {number} uptime - Uptime in seconds
   * @param {number|null} pid - Process ID
   */
  constructor(name, status, cpu, memory, uptime, pid) {
    this.name = name;
    this.status = normalizeStatus(status);
    this.cpu = cpu;
    this.memory = memory;
    this.uptime = uptime;
    this.pid = pid;
  }
}
