/**
 * Failure Analyzer Module
 *
 * Determines human-readable failure reasons from process exit information.
 */

export class FailureAnalyzer {
  /**
   * @param {import('./types').StateReconciliationFacade} service - Parent service reference
   */
  constructor(service) {
    this.service = service;
  }

  /**
   * Determine failure reason from exit info
   * @param {Object} exitInfo - Exit information
   * @returns {string} Human-readable failure reason
   */
  determineFailureReason(exitInfo) {
    const { exitCode, exitSignal, error } = exitInfo;

    if (exitSignal === 'SIGKILL') {
      return 'Process was forcefully terminated';
    }
    if (exitSignal === 'SIGTERM') {
      return 'Process was terminated';
    }
    if (exitSignal) {
      return `Process terminated by signal: ${exitSignal}`;
    }

    if (exitCode === null || exitCode === undefined) {
      return 'Server crashed unexpectedly';
    }

    switch (exitCode) {
      case 0:
        return 'Server exited normally';
      case 1:
        return 'Server crashed with generic error';
      case 2:
        return 'Server command line error';
      case -1073741515:
        return 'Missing DLL or dependency (0xC0000135)';
      case -1073741819:
        return 'Access violation (0xC0000005)';
      case -1073740940:
        return 'Heap corruption (0xC0000374)';
      case -1073740791:
        return 'Stack buffer overrun (0xC0000409)';
      default:
        if (exitCode < 0) {
          return `Server crashed with Windows error code: 0x${(exitCode >>> 0).toString(16).toUpperCase()}`;
        }
        return `Server exited with code: ${exitCode}`;
    }
  }
}
