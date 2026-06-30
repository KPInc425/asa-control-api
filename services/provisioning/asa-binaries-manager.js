/**
 * ASA Binaries Manager
 *
 * Facade that delegates to focused composition modules.
 */
import { BinaryInstaller } from "./asa-binaries-manager/binary-installer.js";
import { BinaryUpdater } from "./asa-binaries-manager/binary-updater.js";
import { BinaryVerifier } from "./asa-binaries-manager/binary-verifier.js";

export class ASABinariesManager {
  constructor(
    steamCmdManager,
    basePath,
    clustersPath,
    serversPath,
    gameType = "ark",
  ) {
    this.steamCmdManager = steamCmdManager;
    this.basePath = basePath;
    this.clustersPath = clustersPath;
    this.serversPath = serversPath;
    this.gameType = gameType;
    this.emitProgress = null;

    this.installer = new BinaryInstaller(this);
    this.updater = new BinaryUpdater(this);
    this.verifier = new BinaryVerifier(this);
  }

  async installBinaries(gameType, serverPath, options) {
    return this.installer.installBinaries(gameType, serverPath, options);
  }

  async updateBinaries(gameType, serverPath, options) {
    return this.updater.updateBinaries(gameType, serverPath, options);
  }

  async verifyBinaries(gameType, serverPath) {
    return this.verifier.verifyBinaries(gameType, serverPath);
  }

  async getInstalledVersion(gameType, serverPath) {
    return this.verifier.getInstalledVersion(gameType, serverPath);
  }

  async getLatestVersion(gameType) {
    return this.updater.getLatestVersion(gameType);
  }

  async checkForUpdates(gameType, serverPath) {
    return this.verifier.checkForUpdates(gameType, serverPath);
  }
}
