/**
 * SteamCMD delegation module
 */
export class SteamCmdModule {
  constructor(service) {
    this.service = service;
  }

  async checkSteamCmdAvailability() {
    return await this.service.steamCmdManager.checkAvailability();
  }

  async isSteamCmdInstalled() {
    return await this.service.steamCmdManager.isInstalled();
  }

  async installSteamCmd(foreground = false) {
    return await this.service.steamCmdManager.install(foreground);
  }

  async findExistingSteamCmd() {
    return await this.service.steamCmdManager.findExisting();
  }

  async ensureSteamCmd() {
    return await this.service.steamCmdManager.ensure();
  }
}
