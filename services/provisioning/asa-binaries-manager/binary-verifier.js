import fs from "fs/promises";
import path from "path";
import logger from "../../utils/logger.js";
import { gameFor } from "../../games/index.js";

/**
 * Binary verification and fallback copy operations
 */
export class BinaryVerifier {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Verify ASA binaries installation for a server
   */
  async verifyInstallation(serverPath, serverType = "cluster") {
    try {
      const adapter = gameFor(this.parent.gameType || "ark");
      let exePath;
      if (serverType === "cluster") {
        exePath = path.join(serverPath, adapter.binaryExeRelPath);
      } else {
        exePath = path.join(serverPath, "binaries", adapter.binaryExeRelPath);
      }

      await fs.access(exePath);
      const stats = await fs.stat(exePath);

      return {
        installed: true,
        executable: exePath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
      };
    } catch (error) {
      return {
        installed: false,
        executable: null,
        error: error.message,
      };
    }
  }

  /**
   * Fallback: copy binaries from the global SteamCMD install when
   * force_install_dir fails (state 0x6 - cross-install conflict).
   */
  async _copyFromGlobalInstall(serverPath, serverName, adapter) {
    const globalInstallPath = path.join(
      this.parent.steamCmdManager.steamCmdPath,
      "steamapps",
      "common",
      "ARK Survival Ascended Dedicated Server",
    );
    const globalExe = path.join(globalInstallPath, adapter.binaryExeRelPath);
    const globalExists = await fs
      .access(globalExe)
      .then(() => true)
      .catch(() => false);

    if (!globalExists) {
      throw new Error(
        `No global install found at ${globalInstallPath} and SteamCMD install failed for ${serverName}`,
      );
    }

    logger.info(
      `Falling back to global install at ${globalInstallPath} for ${serverName}...`,
    );

    const serverExe = path.join(serverPath, adapter.binaryExeRelPath);
    await fs.mkdir(path.dirname(serverExe), { recursive: true });
    await fs.copyFile(globalExe, serverExe);

    const globalRootFiles = [
      "steamclient.dll",
      "steamclient64.dll",
      "steamwebrtc.dll",
      "steamwebrtc64.dll",
      "tier0_s.dll",
      "tier0_s64.dll",
      "vstdlib_s.dll",
      "vstdlib_s64.dll",
    ];
    for (const file of globalRootFiles) {
      const srcPath = path.join(globalInstallPath, file);
      const dstPath = path.join(serverPath, file);
      try {
        await fs.copyFile(srcPath, dstPath);
      } catch {
        logger.warn(`Could not copy ${file} from global install`);
      }
    }

    // Copy the appmanifest to track the correct build ID
    const manifestSrc = path.join(globalInstallPath, "steamapps", "appmanifest_2430930.acf");
    const manifestDst = path.join(serverPath, "steamapps", "appmanifest_2430930.acf");
    try {
      await fs.mkdir(path.dirname(manifestDst), { recursive: true });
      await fs.copyFile(manifestSrc, manifestDst);
    } catch {
      logger.warn("Could not copy appmanifest from global install");
    }

    logger.info(
      `Fallback copy completed for ${serverName} from global install`,
    );
  }
}
