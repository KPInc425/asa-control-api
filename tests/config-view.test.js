import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockConfig,
  mockGetServerConfig,
  mockConfigService,
  mockGameFor,
  mockLogger
} = vi.hoisted(() => ({
  mockConfig: { asa: { serverRootPath: '' } },
  mockGetServerConfig: vi.fn(),
  mockConfigService: {
    getServerInfo: vi.fn(),
    findServerConfigPath: vi.fn(),
    getConfigFile: vi.fn(),
    updateConfigFile: vi.fn(),
    serverRootPath: ''
  },
  mockGameFor: vi.fn(() => ({ name: 'ASA', configFiles: ['Game.ini'], isValidConfigFile: () => true })),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('../config/index.js', () => ({ default: mockConfig }));
vi.mock('../services/database.js', () => ({
  getServerConfig: mockGetServerConfig,
  deleteServerConfig: vi.fn()
}));
vi.mock('../services/config.js', () => ({ default: mockConfigService }));
vi.mock('../games/index.js', () => ({ gameFor: mockGameFor }));
vi.mock('../middleware/auth.js', () => ({
  requirePermission: () => async () => {},
  requireRead: async () => {},
  requireWrite: async () => {}
}));
vi.mock('../utils/logger.js', () => ({ default: mockLogger }));
vi.mock('../services/server-manager.js', () => ({
  NativeServerManager: class {
    async listServers() { return []; }
    async isRunning() { return false; }
    async addServerConfig() {}
    async stop() {}
  }
}));

const { ServerInfoModule } = await import('../services/config/server-info.js');
const { default: arkConfigRoutes } = await import('../routes/configs/ark-configs.js');
const { default: nativeCrudRoutes } = await import('../routes/native-servers/crud.js');

let tempRoot;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'asa-config-view-'));
  mockConfig.asa.serverRootPath = tempRoot;
  mockGetServerConfig.mockReset();
  mockGetServerConfig.mockReturnValue(null);
  mockConfigService.getServerInfo.mockReset();
  mockConfigService.findServerConfigPath.mockReset();
  mockConfigService.getConfigFile.mockReset();
  mockConfigService.updateConfigFile.mockReset();
  mockGameFor.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function makeServerTree(installPath) {
  const configPath = path.join(installPath, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
  await fs.mkdir(configPath, { recursive: true });
  await fs.writeFile(path.join(configPath, 'Game.ini'), '[ServerSettings]\n');
  await fs.writeFile(path.join(configPath, 'GameUserSettings.ini'), '[ServerSettings]\n');
  return configPath;
}

describe('ASA config view', () => {
  it('resolves standalone servers found beneath the servers directory', async () => {
    const installPath = path.join(tempRoot, 'servers', 'Ragnarok');
    const configPath = await makeServerTree(installPath);
    const service = {
      findServerConfigPath: async () => ({ type: 'standalone', serverName: 'Ragnarok', path: configPath }),
      defaultConfigFiles: ['Game.ini', 'GameUserSettings.ini']
    };

    const result = await new ServerInfoModule(service).getServerInfo('Ragnarok');

    expect(result.serverPath).toBe(installPath);
    expect(result.configPath).toBe(configPath);
    expect(result.configFiles).toEqual(expect.arrayContaining(['Game.ini', 'GameUserSettings.ini']));
  });

  it('resolves cluster servers from the discovered config directory', async () => {
    const installPath = path.join(tempRoot, 'clusters', 'iLGaming', 'Ragnarok');
    const configPath = await makeServerTree(installPath);
    const service = {
      findServerConfigPath: async () => ({ type: 'cluster', clusterName: 'iLGaming', serverName: 'Ragnarok', path: configPath }),
      defaultConfigFiles: ['Game.ini', 'GameUserSettings.ini']
    };

    const result = await new ServerInfoModule(service).getServerInfo('Ragnarok');

    expect(result.serverPath).toBe(installPath);
    expect(result.configPath).toBe(configPath);
  });

  it('uses the database config when the server-config.json mirror is absent', async () => {
    const storedConfig = { name: 'iLGaming-Ragnarok', map: 'Ragnarok', serverPath: 'D:/ARK/servers/iLGaming-Ragnarok' };
    mockGetServerConfig.mockReturnValue({ config_data: JSON.stringify(storedConfig) });
    mockConfigService.getServerInfo.mockResolvedValue({ serverName: storedConfig.name, serverPath: storedConfig.serverPath, configFiles: ['Game.ini'] });

    const app = Fastify();
    await app.register(arkConfigRoutes);
    const response = await app.inject({ method: 'GET', url: '/api/configs/ark/iLGaming-Ragnarok/info' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().serverConfig).toEqual(storedConfig);
  });

  it('preserves native server config fields in the JSON response', async () => {
    const storedConfig = { name: 'iLGaming-Ragnarok', map: 'Ragnarok', serverPath: 'D:/ARK/servers/iLGaming-Ragnarok', rconPort: 30105 };
    mockGetServerConfig.mockReturnValue({ config_data: JSON.stringify(storedConfig) });

    const app = Fastify();
    await app.register(nativeCrudRoutes);
    const response = await app.inject({ method: 'GET', url: '/api/native-servers/iLGaming-Ragnarok/config' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().config).toEqual(storedConfig);
  });
});
