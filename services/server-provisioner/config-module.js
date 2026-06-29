/**
 * Configuration generation delegation module
 */
export class ConfigModule {
  constructor(service) {
    this.service = service;
  }

  async createServerConfig(serverPath, serverConfig) {
    return await this.service.configGenerator.createServerConfig(serverPath, serverConfig);
  }

  async createServerConfigInCluster(clusterName, serverPath, serverConfig) {
    return await this.service.configGenerator.createServerConfigInCluster(
      clusterName, serverPath, serverConfig,
    );
  }

  async getFinalConfigsForServer(serverName) {
    return await this.service.configGenerator.getFinalConfigsForServer(serverName);
  }

  async updateServerSettings(serverName, newSettings, options = {}) {
    return await this.service.configGenerator.updateServerSettings(
      serverName, newSettings, options,
    );
  }
}
