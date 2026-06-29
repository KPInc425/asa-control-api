/**
 * Cluster management delegation module
 */
export class ClusterModule {
  constructor(service) {
    this.service = service;
  }

  async createCluster(clusterConfig, foreground = false) {
    return await this.service.clusterManager.createCluster(clusterConfig, foreground);
  }

  async listClusters() {
    return await this.service.clusterManager.listClusters();
  }

  async deleteCluster(clusterName, options = {}) {
    return await this.service.clusterManager.deleteCluster(clusterName, options);
  }

  async startCluster(clusterName) {
    return await this.service.clusterManager.startCluster(clusterName);
  }

  async backupCluster(clusterName, customDestination = null) {
    return await this.service.clusterManager.backupCluster(clusterName, customDestination);
  }

  async restoreCluster(clusterName, sourcePath) {
    return await this.service.clusterManager.restoreCluster(clusterName, sourcePath);
  }

  async validateClusterConfig(config) {
    return await this.service.clusterManager.validateClusterConfig(config);
  }

  async listClusterBackups(clusterName) {
    return await this.service.clusterManager.listClusterBackups(clusterName);
  }
}
