/**
 * Server management delegation module
 */
export class ServerModule {
  constructor(service) {
    this.service = service;
  }

  async createServer(serverConfig) {
    return await this.service.serverManager.createServer(serverConfig);
  }

  async listServers() {
    return await this.service.serverManager.listServers();
  }

  async deleteServer(serverName) {
    return await this.service.serverManager.deleteServer(serverName);
  }

  async backupServer(serverName, options = {}) {
    return await this.service.serverManager.backupServer(serverName, options);
  }

  async restoreServer(serverName, sourcePath, options = {}) {
    return await this.service.serverManager.restoreServer(serverName, sourcePath, options);
  }

  async listServerBackups() {
    return await this.service.serverManager.listServerBackups();
  }
}
