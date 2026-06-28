/**
 * Abstract Server Manager interface
 */
export class ServerManager {
  async start(name) {
    throw new Error("start() must be implemented by subclass");
  }

  async stop(name) {
    throw new Error("stop() must be implemented by subclass");
  }

  async restart(name) {
    throw new Error("restart() must be implemented by subclass");
  }

  async getStats(name) {
    throw new Error("getStats() must be implemented by subclass");
  }

  async getLogs(name, options = {}) {
    throw new Error("getLogs() must be implemented by subclass");
  }

  async listServers() {
    throw new Error("listServers() must be implemented by subclass");
  }

  async isRunning(name) {
    throw new Error("isRunning() must be implemented by subclass");
  }
}
