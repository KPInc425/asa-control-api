import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import autoUpdateService from '../services/auto-update-service.js';
import { deleteServerUpdateConfig } from '../services/database.js';

describe('AutoUpdateService decision flow', () => {
  beforeEach(() => {
    autoUpdateService.pendingUpdates.clear();
    autoUpdateService.warningTimers.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    autoUpdateService.pendingUpdates.clear();
    autoUpdateService.cancelWarnings('TestServer');
    deleteServerUpdateConfig('TestServer');
    deleteServerUpdateConfig('ConfigPersistenceServer');
  });

  it('starts a warning countdown when players are online', async () => {
    vi.spyOn(autoUpdateService, 'getConfig').mockReturnValue({
      enabled: true,
      warningMinutes: [5, 1],
      forceUpdate: false,
      updateIfEmpty: true
    });
    vi.spyOn(autoUpdateService, 'getPlayerConnectionState').mockResolvedValue({
      hasPlayers: true,
      count: 2,
      players: ['One', 'Two']
    });
    const startWarningCountdown = vi
      .spyOn(autoUpdateService, 'startWarningCountdown')
      .mockResolvedValue({ success: true, firstWarning: 5 });
    const performUpdate = vi.spyOn(autoUpdateService, 'performUpdate');

    const result = await autoUpdateService.initiateUpdate('TestServer');

    expect(startWarningCountdown).toHaveBeenCalledWith('TestServer', expect.objectContaining({
      initialPlayerCount: 2
    }));
    expect(performUpdate).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.message).toContain('Warning countdown started');
  });

  it('updates immediately when no players are online', async () => {
    vi.spyOn(autoUpdateService, 'getConfig').mockReturnValue({
      enabled: true,
      warningMinutes: [5, 1],
      forceUpdate: false,
      updateIfEmpty: true
    });
    vi.spyOn(autoUpdateService, 'getPlayerConnectionState').mockResolvedValue({
      hasPlayers: false,
      count: 0,
      players: []
    });
    const performUpdate = vi
      .spyOn(autoUpdateService, 'performUpdate')
      .mockResolvedValue({ success: true, jobId: 'job-1' });

    const result = await autoUpdateService.initiateUpdate('TestServer');

    expect(performUpdate).toHaveBeenCalledWith('TestServer', {});
    expect(result).toEqual({ success: true, jobId: 'job-1' });
  });

  it('fast-forwards the update when the warning phase detects the server is empty', async () => {
    autoUpdateService.warningTimers.set('TestServer', [setTimeout(() => {}, 1000)]);

    vi.spyOn(autoUpdateService, 'getPlayerConnectionState').mockResolvedValue({
      hasPlayers: false,
      count: 0,
      players: []
    });
    vi.spyOn(autoUpdateService, 'sendInGameBroadcast').mockResolvedValue(undefined);
    const performUpdate = vi
      .spyOn(autoUpdateService, 'performUpdate')
      .mockResolvedValue({ success: true, jobId: 'job-2' });

    await autoUpdateService.handleWarningPhaseRecheck('TestServer', { force: false }, new Date());

    expect(performUpdate).toHaveBeenCalledWith('TestServer', expect.objectContaining({
      startedEarlyBecauseEmpty: true,
      playerStateAtExecution: expect.objectContaining({ count: 0 })
    }));
  });

  it('runs update-on-start without duplicating the update initiation', async () => {
    vi.spyOn(autoUpdateService, 'getConfig').mockReturnValue({
      enabled: true,
      updateOnStart: true,
      forceUpdate: false
    });
    const checkStatus = vi.spyOn(autoUpdateService.serverProvisioner, 'checkServerUpdateStatus').mockResolvedValue({
      needsUpdate: true,
      reason: 'Steam build is newer',
      lastUpdate: null
    });
    const initiateUpdate = vi.spyOn(autoUpdateService, 'initiateUpdate').mockResolvedValue({
      success: true,
      message: 'Update started'
    });
    const checkForUpdates = vi.spyOn(autoUpdateService, 'checkForUpdates');

    const result = await autoUpdateService.runUpdateOnStart('TestServer');

    expect(checkStatus).toHaveBeenCalledWith('TestServer');
    expect(checkForUpdates).not.toHaveBeenCalled();
    expect(initiateUpdate).toHaveBeenCalledWith('TestServer', expect.objectContaining({
      triggeredBy: 'updateOnStart',
      force: false
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      started: true
    }));
  });

  it('persists autoRestart in server configuration', () => {
    const setResult = autoUpdateService.setConfig('ConfigPersistenceServer', {
      enabled: true,
      autoRestart: false,
      warningMinutes: [10, 5, 1]
    });

    const persisted = autoUpdateService.getConfig('ConfigPersistenceServer');

    expect(setResult.success).toBe(true);
    expect(persisted.autoRestart).toBe(false);
    expect(persisted.warningMinutes).toEqual([10, 5, 1]);
  });
});