/**
 * ASA Binaries delegation module
 */
export class ASABinariesModule {
  constructor(service) {
    this.service = service;
  }

  async checkASABinariesAvailability() {
    return (await this.service.asaBinariesManager.checkAvailability)
      ? await this.service.asaBinariesManager.checkAvailability()
      : await this.service.systemInfo.checkASABinariesInstalled();
  }

  async installASABinaries(foreground = false) {
    const servers = await this.service.listServers();
    if (servers.length > 0) {
      return await this.service.asaBinariesManager.installForServer(servers[0].name);
    }
    throw new Error("No servers found. Create a server first.");
  }

  async ensureASABinaries() {
    return await this.installASABinaries();
  }

  async updateASABinaries() {
    return await this.service.asaBinariesManager.updateAll();
  }

  async installASABinariesForServer(serverName) {
    return await this.service.asaBinariesManager.installForServer(serverName);
  }

  async installASABinariesForServerInCluster(clusterName, serverName, foreground = false) {
    return await this.service.asaBinariesManager.installForServerInCluster(
      clusterName, serverName, foreground,
    );
  }

  async updateAllServerBinaries() {
    return await this.service.asaBinariesManager.updateAll();
  }
}
