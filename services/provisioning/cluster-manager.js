import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../utils/logger.js";
import {
  upsertServerConfig,
  getAllServerConfigs,
  deleteServerConfig,
  upsertSharedMod,
  upsertServerMod,
  upsertServerSettings,
} from "./database.js";
import { ClusterOperations } from "./cluster-manager/cluster-operations.js";
import { ClusterListing } from "./cluster-manager/cluster-listing.js";
import { ClusterDeletion } from "./cluster-manager/cluster-deletion.js";
import { ClusterBackup } from "./cluster-manager/cluster-backup.js";
import { ClusterStart } from "./cluster-manager/cluster-start.js";
import { ClusterValidation } from "./cluster-manager/cluster-validation.js";
import { FileUtils } from "./cluster-manager/file-utils.js";

/**
 * Cluster Manager
 * Facade that delegates to specialized modules.
 */
export class ClusterManager {
  constructor(
    basePath,
    clustersPath,
    serversPath,
    asaBinariesManager,
    configGenerator,
    scriptGenerator,
  ) {
    this.basePath = basePath;
    this.clustersPath = clustersPath;
    this.serversPath = serversPath;
    this.asaBinariesManager = asaBinariesManager;
    this.configGenerator = configGenerator;
    this.scriptGenerator = scriptGenerator;
    this.emitProgress = null;

    // Initialize modules
    this.operations = new ClusterOperations(this);
    this.listing = new ClusterListing(this);
    this.deletion = new ClusterDeletion(this);
    this.backup = new ClusterBackup(this);
    this.start = new ClusterStart(this);
    this.validation = new ClusterValidation(this);
    this.fileUtils = new FileUtils(this);
  }

  setProgressCallback(cb) {
    this.emitProgress = cb;
  }

  // Cluster operations
  async createCluster(clusterConfig, foreground = false) {
    return this.operations.createCluster(clusterConfig, foreground);
  }

  async addServerToCluster(clusterName, serverConfig) {
    return this.operations.addServerToCluster(clusterName, serverConfig);
  }

  // Cluster listing
  async listClusters() {
    return this.listing.listClusters();
  }

  // Cluster deletion
  async deleteCluster(clusterName, options = {}) {
    return this.deletion.deleteCluster(clusterName, options);
  }

  // Cluster backup/restore
  async backupCluster(clusterName, customDestination = null, options = {}) {
    return this.backup.backupCluster(clusterName, customDestination, options);
  }

  async restoreCluster(clusterName, sourcePath) {
    return this.backup.restoreCluster(clusterName, sourcePath);
  }

  async listClusterBackups(clusterName) {
    return this.backup.listClusterBackups(clusterName);
  }

  // Cluster start
  async startCluster(clusterName) {
    return this.start.startCluster(clusterName);
  }

  // Cluster validation
  async validateClusterConfig(config) {
    return this.validation.validateClusterConfig(config);
  }

  // File utilities
  async copyDirectory(source, destination) {
    return this.fileUtils.copyDirectory(source, destination);
  }

  async deleteDirectoryManually(dirPath) {
    return this.fileUtils.deleteDirectoryManually(dirPath);
  }
}
