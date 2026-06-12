/**
 * Query Provider Registry
 *
 * Maps game types to their query providers. A game adapter's `queryServer()`
 * method typically delegates to one of these providers. The registry lets
 * you add new query providers without modifying game adapters.
 */
import logger from '../../utils/logger.js';
import { eosQueryProvider } from './eos-provider.js';

const builtinProviders = {
  eos: eosQueryProvider,
};

class QueryProviderRegistry {
  constructor(initial = {}) {
    /** @type {Record<string, import('./base-provider.js').QueryProvider>} */
    this._providers = { ...initial };
  }

  /**
   * Register a query provider.
   * @param {import('./base-provider.js').QueryProvider} provider
   */
  register(provider) {
    this._providers[provider.id] = provider;
    logger.info(`[QueryRegistry] Registered provider: ${provider.id}`);
  }

  /**
   * Get a provider by ID.
   * @param {string} id
   * @returns {import('./base-provider.js').QueryProvider|undefined}
   */
  get(id) {
    return this._providers[id];
  }

  /**
   * List all registered provider IDs.
   * @returns {string[]}
   */
  get ids() {
    return Object.keys(this._providers);
  }
}

export const queryRegistry = new QueryProviderRegistry(builtinProviders);
