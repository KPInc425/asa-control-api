/**
 * Script generation delegation module
 */
export class ScriptModule {
  constructor(service) {
    this.service = service;
  }

  async createStartScript(serverPath, serverConfig) {
    return await this.service.scriptGenerator.createStartScript(serverPath, serverConfig);
  }

  async createStopScript(serverPath, serverName) {
    return await this.service.scriptGenerator.createStopScript(serverPath, serverName);
  }

  async createStartScriptInCluster(clusterName, serverPath, serverConfig) {
    return await this.service.scriptGenerator.createStartScriptInCluster(
      clusterName, serverPath, serverConfig,
    );
  }

  async createStopScriptInCluster(clusterName, serverPath, serverName) {
    return await this.service.scriptGenerator.createStopScriptInCluster(
      clusterName, serverPath, serverName,
    );
  }

  async regenerateServerStartScript(serverName) {
    return await this.service.scriptGenerator.regenerateServerStartScript(serverName);
  }

  async regenerateAllClusterStartScripts() {
    return await this.service.scriptGenerator.regenerateAllClusterStartScripts();
  }
}
