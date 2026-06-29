/**
 * Type definitions for state-reconciliation module
 *
 * @typedef {import('./intent-tracker.js').IntentTracker} IntentTracker
 * @typedef {import('./probe-tracker.js').ProbeTracker} ProbeTracker
 * @typedef {import('./failure-analyzer.js').FailureAnalyzer} FailureAnalyzer
 * @typedef {import('./transition-checker.js').TransitionChecker} TransitionChecker
 * @typedef {import('./data-extractor.js').DataExtractor} DataExtractor
 * @typedef {import('./status-reconciler.js').StatusReconciler} StatusReconciler
 *
 * @typedef {Object} StateReconciliationFacade
 * @property {Map<string, Object>} serverStates
 * @property {Map<string, Object>} statusCache
 * @property {IntentTracker} intentTracker
 * @property {ProbeTracker} probeTracker
 * @property {FailureAnalyzer} failureAnalyzer
 * @property {TransitionChecker} transitionChecker
 * @property {DataExtractor} dataExtractor
 * @property {StatusReconciler} statusReconciler
 * @property {(serverId: string) => Object} createDefaultState
 * @property {(staleAfter: any) => boolean} isStaleFn
 */

export {};
