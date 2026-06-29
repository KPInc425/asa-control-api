/**
 * System info delegation module
 */
export class SystemInfoModule {
  constructor(service) {
    this.service = service;
  }

  async getSystemInfo() {
    return await this.service.systemInfo.getSystemInfo();
  }

  formatBytes(bytes, decimals = 2) {
    return this.service.systemInfo.formatBytes(bytes, decimals);
  }
}
