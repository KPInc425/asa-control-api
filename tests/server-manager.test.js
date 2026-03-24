import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpsertServerConfig = vi.fn();
const mockGetServerConfig = vi.fn();
const mockGetAllServerConfigs = vi.fn();
const mockGetAllSharedMods = vi.fn(() => []);
const mockGetServerMods = vi.fn(() => []);
const mockGetServerSettings = vi.fn(() => null);
const mockCreateStartScriptInCluster = vi.fn();

vi.mock('../services/database.js', () => ({
  upsertServerConfig: mockUpsertServerConfig,
  getServerConfig: mockGetServerConfig,
  getAllServerConfigs: mockGetAllServerConfigs,
  getAllSharedMods: mockGetAllSharedMods,
  getServerMods: mockGetServerMods,
  getServerSettings: mockGetServerSettings
}));

vi.mock('../services/server-provisioner.js', () => ({
  ServerProvisioner: class MockServerProvisioner {
    async createStartScriptInCluster(...args) {
      return mockCreateStartScriptInCluster(...args);
    }
  }
}));

const { NativeServerManager } = await import('../services/server-manager.js');

describe('NativeServerManager resolution', () => {
  let tempRoot;
  let manager;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'asa-server-manager-'));
    manager = new NativeServerManager();
    manager.basePath = tempRoot;
    manager.serversPath = path.join(tempRoot, 'servers');
    manager.clustersPath = path.join(tempRoot, 'clusters');

    await fs.mkdir(manager.serversPath, { recursive: true });
    await fs.mkdir(manager.clustersPath, { recursive: true });

    mockUpsertServerConfig.mockReset();
    mockGetServerConfig.mockReset();
    mockGetAllServerConfigs.mockReset();
    mockGetAllSharedMods.mockReset();
    mockGetAllSharedMods.mockReturnValue([]);
    mockGetServerMods.mockReset();
    mockGetServerMods.mockReturnValue([]);
    mockGetServerSettings.mockReset();
    mockGetServerSettings.mockReturnValue(null);
    mockCreateStartScriptInCluster.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('finds a cluster server from start.bat when db and cluster.json are absent', async () => {
    mockGetServerConfig.mockReturnValue(null);

    const serverPath = path.join(manager.clustersPath, 'iLGaming', 'iLGaming-Ragnarok');
    await fs.mkdir(serverPath, { recursive: true });
    await fs.writeFile(
      path.join(serverPath, 'start.bat'),
      'start "" "ArkAscendedServer.exe" "Ragnarok_WP?SessionName=iLGaming-Ragnarok?Port=7777?QueryPort=27015?RCONPort=32330?ClusterId=iLGaming" -NoBattleEye\n'
    );

    const serverInfo = await manager.getClusterServerInfo('iLGaming-Ragnarok');

    expect(serverInfo).toMatchObject({
      name: 'iLGaming-Ragnarok',
      clusterName: 'iLGaming',
      clusterId: 'iLGaming',
      serverPath
    });
  });

  it('builds cluster membership from database configs without requiring cluster.json', async () => {
    mockGetAllServerConfigs.mockReturnValue([
      {
        name: 'iLGaming-Ragnarok',
        config_data: JSON.stringify({
          name: 'iLGaming-Ragnarok',
          clusterId: 'iLGaming',
          gamePort: 7777,
          queryPort: 27015,
          rconPort: 32330
        })
      }
    ]);

    const servers = await manager.getClusterServers('iLGaming');

    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({
      name: 'iLGaming-Ragnarok',
      clusterName: 'iLGaming',
      clusterId: 'iLGaming',
      isClusterServer: true,
      serverPath: path.join(manager.clustersPath, 'iLGaming', 'iLGaming-Ragnarok')
    });
  });

  it('regenerates the start script from database-backed cluster config', async () => {
    mockGetServerConfig.mockReturnValue({
      name: 'iLGaming-Ragnarok',
      config_data: JSON.stringify({
        name: 'iLGaming-Ragnarok',
        clusterId: 'iLGaming',
        excludeSharedMods: false
      })
    });

    await manager.regenerateServerStartScript('iLGaming-Ragnarok');

    expect(mockCreateStartScriptInCluster).toHaveBeenCalledTimes(1);
    expect(mockCreateStartScriptInCluster).toHaveBeenCalledWith(
      'iLGaming',
      path.join(manager.clustersPath, 'iLGaming', 'iLGaming-Ragnarok'),
      expect.objectContaining({
        name: 'iLGaming-Ragnarok',
        clusterId: 'iLGaming',
        clusterName: 'iLGaming',
        mods: []
      })
    );
  });
});