/**
 * Auto-Update Service Manual Test
 * 
 * Run with: node tests/test-auto-update.js
 * 
 * This script tests the auto-update service functionality:
 * 1. Service initialization
 * 2. Configuration management
 * 3. Status tracking
 * 4. Notification adapters
 */

import autoUpdateService, { UPDATE_STATUS, DEFAULT_CONFIG } from '../services/auto-update-service.js';
import { 
  notifyInGame, 
  notifyDiscord, 
  notifySocket, 
  notifyAll,
  processTemplate,
  getTemplate,
  formatForARK,
  DEFAULT_TEMPLATES,
  NotificationService
} from '../services/notifications/adapters.js';
import logger from '../utils/logger.js';

// Test counter
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (error) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, message = '') {
  if (!value) {
    throw new Error(`${message} Expected true, got ${value}`);
  }
}

function assertDefined(value, message = '') {
  if (value === undefined || value === null) {
    throw new Error(`${message} Expected defined value, got ${value}`);
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('  Auto-Update Service Tests');
  console.log('========================================\n');

  // ============================================
  // Template Processing Tests
  // ============================================
  console.log('--- Template Processing Tests ---\n');

  test('processTemplate replaces single placeholder', () => {
    const result = processTemplate('Hello {name}!', { name: 'World' });
    assertEqual(result, 'Hello World!');
  });

  test('processTemplate replaces multiple placeholders', () => {
    const result = processTemplate('{server} update in {time} minutes', { 
      server: 'TestServer', 
      time: 5 
    });
    assertEqual(result, 'TestServer update in 5 minutes');
  });

  test('processTemplate handles missing data gracefully (keeps placeholder)', () => {
    const result = processTemplate('Hello {name}!', {});
    assertEqual(result, 'Hello {name}!');
  });

  test('getTemplate returns default template', () => {
    const template = getTemplate('update.warning', 'inGame');
    assertTrue(template.includes('minute'));
  });

  test('getTemplate returns custom template when provided', () => {
    const custom = { 'update.warning': { inGame: 'Custom warning!' } };
    const template = getTemplate('update.warning', 'inGame', custom);
    assertEqual(template, 'Custom warning!');
  });

  test('formatForARK truncates long messages', () => {
    const longMessage = 'A'.repeat(300);
    const result = formatForARK(longMessage);
    assertTrue(result.length <= 250);
    assertTrue(result.endsWith('...'));
  });

  test('formatForARK removes problematic characters', () => {
    const result = formatForARK('Test <script> "message"');
    assertTrue(!result.includes('<'));
    assertTrue(!result.includes('>'));
    assertTrue(!result.includes('"'));
  });

  // ============================================
  // DEFAULT_TEMPLATES Tests
  // ============================================
  console.log('\n--- Default Templates Tests ---\n');

  test('DEFAULT_TEMPLATES has update.warning', () => {
    assertDefined(DEFAULT_TEMPLATES['update.warning']);
    assertDefined(DEFAULT_TEMPLATES['update.warning'].inGame);
    assertDefined(DEFAULT_TEMPLATES['update.warning'].discord);
    assertDefined(DEFAULT_TEMPLATES['update.warning'].socket);
  });

  test('DEFAULT_TEMPLATES has update.completed', () => {
    assertDefined(DEFAULT_TEMPLATES['update.completed']);
  });

  test('DEFAULT_TEMPLATES has update.failed', () => {
    assertDefined(DEFAULT_TEMPLATES['update.failed']);
  });

  // ============================================
  // UPDATE_STATUS Constants Tests
  // ============================================
  console.log('\n--- Update Status Constants Tests ---\n');

  test('UPDATE_STATUS has all required states', () => {
    assertEqual(UPDATE_STATUS.IDLE, 'idle');
    assertEqual(UPDATE_STATUS.CHECKING, 'checking');
    assertEqual(UPDATE_STATUS.AVAILABLE, 'available');
    assertEqual(UPDATE_STATUS.WARNING, 'warning');
    assertEqual(UPDATE_STATUS.UPDATING, 'updating');
    assertEqual(UPDATE_STATUS.COMPLETED, 'completed');
    assertEqual(UPDATE_STATUS.FAILED, 'failed');
    assertEqual(UPDATE_STATUS.CANCELLED, 'cancelled');
  });

  // ============================================
  // DEFAULT_CONFIG Tests
  // ============================================
  console.log('\n--- Default Config Tests ---\n');

  test('DEFAULT_CONFIG has enabled field', () => {
    assertEqual(DEFAULT_CONFIG.enabled, false);
  });

  test('DEFAULT_CONFIG has warningMinutes array', () => {
    assertTrue(Array.isArray(DEFAULT_CONFIG.warningMinutes));
    assertTrue(DEFAULT_CONFIG.warningMinutes.length > 0);
  });

  test('DEFAULT_CONFIG has checkIntervalMinutes', () => {
    assertTrue(typeof DEFAULT_CONFIG.checkIntervalMinutes === 'number');
    assertTrue(DEFAULT_CONFIG.checkIntervalMinutes > 0);
  });

  // ============================================
  // AutoUpdateService Tests
  // ============================================
  console.log('\n--- AutoUpdateService Tests ---\n');

  test('autoUpdateService is defined', () => {
    assertDefined(autoUpdateService);
  });

  test('autoUpdateService has getConfig method', () => {
    assertTrue(typeof autoUpdateService.getConfig === 'function');
  });

  test('autoUpdateService has setConfig method', () => {
    assertTrue(typeof autoUpdateService.setConfig === 'function');
  });

  test('autoUpdateService has getUpdateStatus method', () => {
    assertTrue(typeof autoUpdateService.getUpdateStatus === 'function');
  });

  test('autoUpdateService has checkForUpdates method', () => {
    assertTrue(typeof autoUpdateService.checkForUpdates === 'function');
  });

  test('autoUpdateService has cancelUpdate method', () => {
    assertTrue(typeof autoUpdateService.cancelUpdate === 'function');
  });

  test('autoUpdateService.getConfig returns default config for unknown server', () => {
    const config = autoUpdateService.getConfig('NonExistentServer');
    assertDefined(config);
    assertEqual(config.enabled, false);
  });

  test('autoUpdateService.getUpdateStatus returns idle for unknown server', () => {
    const status = autoUpdateService.getUpdateStatus('NonExistentServer');
    assertEqual(status.status, UPDATE_STATUS.IDLE);
  });

  // ============================================
  // NotificationService Class Tests
  // ============================================
  console.log('\n--- NotificationService Class Tests ---\n');

  test('NotificationService can be instantiated', () => {
    const service = new NotificationService();
    assertDefined(service);
  });

  test('NotificationService has setSocketIO method', () => {
    const service = new NotificationService();
    assertTrue(typeof service.setSocketIO === 'function');
  });

  test('NotificationService has registerRconConfig method', () => {
    const service = new NotificationService();
    assertTrue(typeof service.registerRconConfig === 'function');
  });

  test('NotificationService can register and retrieve RCON config', () => {
    const service = new NotificationService();
    const config = { host: 'localhost', port: 27020, password: 'test' };
    service.registerRconConfig('TestServer', config);
    
    const retrieved = service.getRconConfig('TestServer');
    assertEqual(retrieved.host, 'localhost');
    assertEqual(retrieved.port, 27020);
  });

  test('NotificationService has convenience notification methods', () => {
    const service = new NotificationService();
    assertTrue(typeof service.sendUpdateWarning === 'function');
    assertTrue(typeof service.sendUpdateStarting === 'function');
    assertTrue(typeof service.sendUpdateCompleted === 'function');
    assertTrue(typeof service.sendUpdateFailed === 'function');
    assertTrue(typeof service.sendServerStatus === 'function');
  });

  // ============================================
  // Notification Functions Tests
  // ============================================
  console.log('\n--- Notification Function Tests ---\n');

  test('notifySocket returns skipped when no io instance', () => {
    const result = notifySocket(null, 'TestServer', 'test:event', { message: 'test' });
    assertTrue(result.skipped === true);
  });

  test('notifySocket emits event when io is provided', () => {
    let emitted = false;
    const mockIo = {
      to: () => mockIo,
      emit: () => { emitted = true; }
    };
    
    const result = notifySocket(mockIo, 'TestServer', 'test:event', { message: 'test' });
    assertEqual(result.success, true);
    assertTrue(emitted);
  });

  // ============================================
  // Summary
  // ============================================
  console.log('\n========================================');
  console.log('  Test Results');
  console.log('========================================');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total:  ${passed + failed}`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
