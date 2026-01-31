/**
 * Status Contract Utilities Tests
 * 
 * Tests for the status contract utilities that ensure consistent 
 * server status handling across the API.
 */

import { describe, it, expect } from 'vitest';
import {
  ServerStatus,
  DataSource,
  ErrorTypes,
  normalizeStatus,
  isValidStatus,
  calculateStaleAfter,
  isStale,
  createTransitionState,
  createServerLiveData,
  createProblemDetails,
  createProblemDetailsFromType,
  createSuccessResponse,
  getBestAvailableData
} from '../utils/statusContract.js';

describe('normalizeStatus', () => {
  it('returns the same value for canonical statuses', () => {
    expect(normalizeStatus('running')).toBe(ServerStatus.RUNNING);
    expect(normalizeStatus('stopped')).toBe(ServerStatus.STOPPED);
    expect(normalizeStatus('starting')).toBe(ServerStatus.STARTING);
    expect(normalizeStatus('stopping')).toBe(ServerStatus.STOPPING);
    expect(normalizeStatus('failed')).toBe(ServerStatus.FAILED);
    expect(normalizeStatus('unknown')).toBe(ServerStatus.UNKNOWN);
  });

  it('normalizes case-insensitive input', () => {
    expect(normalizeStatus('RUNNING')).toBe(ServerStatus.RUNNING);
    expect(normalizeStatus('Running')).toBe(ServerStatus.RUNNING);
    expect(normalizeStatus('  running  ')).toBe(ServerStatus.RUNNING);
  });

  it('maps legacy status values correctly', () => {
    expect(normalizeStatus('online')).toBe(ServerStatus.RUNNING);
    expect(normalizeStatus('offline')).toBe(ServerStatus.STOPPED);
    expect(normalizeStatus('error')).toBe(ServerStatus.FAILED);
    expect(normalizeStatus('crashed')).toBe(ServerStatus.FAILED);
    expect(normalizeStatus('restarting')).toBe(ServerStatus.STARTING);
    expect(normalizeStatus('exited')).toBe(ServerStatus.STOPPED);
    expect(normalizeStatus('closed')).toBe(ServerStatus.STOPPED);
  });

  it('returns unknown for invalid/empty values', () => {
    expect(normalizeStatus('')).toBe(ServerStatus.UNKNOWN);
    expect(normalizeStatus(null)).toBe(ServerStatus.UNKNOWN);
    expect(normalizeStatus(undefined)).toBe(ServerStatus.UNKNOWN);
    expect(normalizeStatus('garbage')).toBe(ServerStatus.UNKNOWN);
    expect(normalizeStatus('invalid-status')).toBe(ServerStatus.UNKNOWN);
  });
});

describe('isValidStatus', () => {
  it('returns true for valid canonical statuses', () => {
    expect(isValidStatus('running')).toBe(true);
    expect(isValidStatus('stopped')).toBe(true);
    expect(isValidStatus('starting')).toBe(true);
    expect(isValidStatus('stopping')).toBe(true);
    expect(isValidStatus('failed')).toBe(true);
    expect(isValidStatus('unknown')).toBe(true);
  });

  it('returns false for legacy or invalid statuses', () => {
    expect(isValidStatus('online')).toBe(false);
    expect(isValidStatus('offline')).toBe(false);
    expect(isValidStatus('garbage')).toBe(false);
    expect(isValidStatus('')).toBe(false);
  });
});

describe('createServerLiveData', () => {
  it('produces valid structure with required fields', () => {
    const data = createServerLiveData({
      serverId: 'test-server',
      status: 'running',
      source: DataSource.PROCESS
    });

    expect(data).toHaveProperty('serverId', 'test-server');
    expect(data).toHaveProperty('status', 'running');
    expect(data).toHaveProperty('source', 'process');
    expect(data).toHaveProperty('players');
    expect(data.players).toHaveProperty('online', 0);
    expect(data.players).toHaveProperty('max', 0);
    expect(data).toHaveProperty('updatedAt');
    expect(data).toHaveProperty('staleAfter');
  });

  it('normalizes status values', () => {
    const data = createServerLiveData({
      serverId: 'test-server',
      status: 'online', // legacy value
      source: DataSource.CACHED
    });

    expect(data.status).toBe('running');
  });

  it('includes optional performance data when provided', () => {
    const data = createServerLiveData({
      serverId: 'test-server',
      status: 'running',
      source: DataSource.PROCESS,
      performance: { cpu: 50, memory: 1024, uptime: 3600 }
    });

    expect(data.performance).toEqual({
      cpu: 50,
      memory: 1024,
      uptime: 3600
    });
  });

  it('includes optional game data when provided', () => {
    const data = createServerLiveData({
      serverId: 'test-server',
      status: 'running',
      source: DataSource.PROCESS,
      gameData: { map: 'TheIsland', day: 42, version: '1.0.0' }
    });

    expect(data.gameData).toEqual({
      map: 'TheIsland',
      day: 42,
      version: '1.0.0'
    });
  });

  it('handles player data correctly', () => {
    const playerList = [{ name: 'Player1' }, { name: 'Player2' }];
    const data = createServerLiveData({
      serverId: 'test-server',
      status: 'running',
      source: DataSource.RCON,
      players: { online: 2, max: 70, list: playerList }
    });

    expect(data.players.online).toBe(2);
    expect(data.players.max).toBe(70);
    expect(data.players.list).toEqual(playerList);
  });

  it('includes transition state when provided', () => {
    const transition = { status: 'starting', previousStatus: 'stopped' };
    const data = createServerLiveData({
      serverId: 'test-server',
      status: 'starting',
      source: DataSource.PROCESS,
      transition
    });

    expect(data.transition).toEqual(transition);
  });
});

describe('createProblemDetails', () => {
  it('creates RFC 7807 compliant response', () => {
    const problem = createProblemDetails({
      status: 404,
      code: 'SERVER_NOT_FOUND',
      title: 'Server Not Found',
      detail: 'The requested server does not exist',
      instance: '/api/servers/test-server',
      serverId: 'test-server'
    });

    expect(problem).toHaveProperty('type', '/errors/server-not-found');
    expect(problem).toHaveProperty('title', 'Server Not Found');
    expect(problem).toHaveProperty('status', 404);
    expect(problem).toHaveProperty('code', 'SERVER_NOT_FOUND');
    expect(problem).toHaveProperty('detail', 'The requested server does not exist');
    expect(problem).toHaveProperty('instance', '/api/servers/test-server');
    expect(problem).toHaveProperty('serverId', 'test-server');
    expect(problem).toHaveProperty('timestamp');
  });

  it('includes retryAfter when provided', () => {
    const problem = createProblemDetails({
      status: 429,
      code: 'RATE_LIMITED',
      retryAfter: 60
    });

    expect(problem.retryAfter).toBe(60);
  });

  it('defaults missing error types gracefully', () => {
    const problem = createProblemDetails({
      status: 418, // I'm a teapot - no matching error type
      title: 'Custom Error'
    });

    expect(problem.type).toBe('/errors/http-418');
    expect(problem.title).toBe('Custom Error');
    expect(problem.status).toBe(418);
  });
});

describe('createProblemDetailsFromType', () => {
  it('creates problem details from known error types', () => {
    const problem = createProblemDetailsFromType('SERVER_NOT_FOUND', {
      detail: 'Server not found',
      serverId: 'test-server'
    });

    expect(problem.status).toBe(404);
    expect(problem.code).toBe('SERVER_NOT_FOUND');
    expect(problem.type).toBe('/errors/server-not-found');
    expect(problem.serverId).toBe('test-server');
  });

  it('handles unknown error types gracefully', () => {
    const problem = createProblemDetailsFromType('UNKNOWN_TYPE');

    expect(problem.status).toBe(500);
    expect(problem.code).toBe('INTERNAL_ERROR');
    expect(problem.detail).toContain('UNKNOWN_TYPE');
  });
});

describe('getBestAvailableData', () => {
  it('returns process data as highest priority', () => {
    const result = getBestAvailableData({
      process: { status: 'running' },
      rcon: { success: true },
      query: { sessionName: 'Test' },
      cached: { status: 'stopped', staleAfter: new Date(Date.now() + 60000).toISOString() }
    });

    expect(result.source).toBe(DataSource.PROCESS);
    expect(result.status).toBe(ServerStatus.RUNNING);
  });

  it('returns RCON data when process is unavailable', () => {
    const result = getBestAvailableData({
      rcon: { success: true },
      query: { sessionName: 'Test' },
      cached: { status: 'stopped', staleAfter: new Date(Date.now() + 60000).toISOString() }
    });

    expect(result.source).toBe(DataSource.RCON);
    expect(result.status).toBe(ServerStatus.RUNNING);
  });

  it('returns query data when process and RCON are unavailable', () => {
    const result = getBestAvailableData({
      query: { sessionName: 'Test' },
      cached: { status: 'stopped', staleAfter: new Date(Date.now() + 60000).toISOString() }
    });

    expect(result.source).toBe(DataSource.QUERY);
    expect(result.status).toBe(ServerStatus.RUNNING);
  });

  it('returns cached data when not stale and other sources unavailable', () => {
    const result = getBestAvailableData({
      cached: { status: 'running', staleAfter: new Date(Date.now() + 60000).toISOString() }
    });

    expect(result.source).toBe(DataSource.CACHED);
    expect(result.status).toBe(ServerStatus.RUNNING);
  });

  it('returns unknown when no valid data available', () => {
    const result = getBestAvailableData({});

    expect(result.source).toBe(DataSource.CACHED);
    expect(result.status).toBe(ServerStatus.UNKNOWN);
    expect(result.data).toBeNull();
  });

  it('skips stale cached data', () => {
    const result = getBestAvailableData({
      cached: { status: 'running', staleAfter: new Date(Date.now() - 60000).toISOString() } // expired
    });

    expect(result.status).toBe(ServerStatus.UNKNOWN);
  });
});

describe('calculateStaleAfter and isStale', () => {
  it('calculates correct stale time for rcon data', () => {
    const baseTime = new Date();
    const staleAfter = calculateStaleAfter(DataSource.RCON, baseTime);
    
    // RCON data should be stale after 10 seconds
    const expectedStaleTime = baseTime.getTime() + (10 * 1000);
    expect(new Date(staleAfter).getTime()).toBe(expectedStaleTime);
  });

  it('calculates correct stale time for cached data', () => {
    const baseTime = new Date();
    const staleAfter = calculateStaleAfter(DataSource.CACHED, baseTime);
    
    // Cached data should be stale after 5 minutes
    const expectedStaleTime = baseTime.getTime() + (5 * 60 * 1000);
    expect(new Date(staleAfter).getTime()).toBe(expectedStaleTime);
  });

  it('correctly identifies stale data', () => {
    const pastTime = new Date(Date.now() - 60000).toISOString();
    const futureTime = new Date(Date.now() + 60000).toISOString();

    expect(isStale(pastTime)).toBe(true);
    expect(isStale(futureTime)).toBe(false);
  });

  it('treats missing staleAfter as stale', () => {
    expect(isStale(null)).toBe(true);
    expect(isStale(undefined)).toBe(true);
  });
});

describe('createSuccessResponse', () => {
  it('wraps data in success response', () => {
    const response = createSuccessResponse({ id: 'test' });

    expect(response.success).toBe(true);
    expect(response.data).toEqual({ id: 'test' });
  });

  it('includes meta when provided', () => {
    const response = createSuccessResponse({ id: 'test' }, { count: 1 });

    expect(response.meta).toEqual({ count: 1 });
  });

  it('omits meta when empty', () => {
    const response = createSuccessResponse({ id: 'test' }, {});

    expect(response).not.toHaveProperty('meta');
  });
});

describe('createTransitionState', () => {
  it('creates valid transition state', () => {
    const transition = createTransitionState({
      status: 'starting',
      previousStatus: 'stopped',
      expectedDuration: 30000
    });

    expect(transition.status).toBe('starting');
    expect(transition.previousStatus).toBe('stopped');
    expect(transition.expectedDuration).toBe(30000);
    expect(transition).toHaveProperty('transitionStartedAt');
  });

  it('normalizes status values in transition', () => {
    const transition = createTransitionState({
      status: 'restarting', // legacy value
      previousStatus: 'online' // legacy value
    });

    expect(transition.status).toBe('starting');
    expect(transition.previousStatus).toBe('running');
  });
});
