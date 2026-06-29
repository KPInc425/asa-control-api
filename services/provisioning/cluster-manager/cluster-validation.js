import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import logger from "../../utils/logger.js";

/**
 * Cluster configuration validation
 */
export class ClusterValidation {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Validate cluster configuration
   */
  async validateClusterConfig(config) {
    const validation = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // Check required fields
    if (!config.name || !config.name.trim()) {
      validation.valid = false;
      validation.errors.push("Cluster name is required");
    }

    // Check name format
    if (config.name && !/^[a-zA-Z0-9_-]+$/.test(config.name)) {
      validation.valid = false;
      validation.errors.push(
        "Cluster name can only contain letters, numbers, underscores, and hyphens",
      );
    }

    // Check server count
    if (
      config.serverCount &&
      (config.serverCount < 1 || config.serverCount > 10)
    ) {
      validation.valid = false;
      validation.errors.push("Server count must be between 1 and 10");
    }

    // Check base port
    if (
      config.basePort &&
      (config.basePort < 1024 || config.basePort > 65535)
    ) {
      validation.valid = false;
      validation.errors.push("Base port must be between 1024 and 65535");
    }

    // Check if cluster already exists
    if (config.name) {
      const clusterPath = path.join(this.parent.clustersPath, config.name);
      try {
        await fs.access(clusterPath);
        validation.warnings.push(
          `Cluster "${config.name}" already exists on disk`,
        );
      } catch {
        // Cluster doesn't exist, which is good
      }
    }

    return validation;
  }
}
