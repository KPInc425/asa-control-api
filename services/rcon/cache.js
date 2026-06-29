import logger from '../../utils/logger.js';

export class RconCache {
  constructor(service) {
    this.service = service;
    this.cachedData = new Map(); // Cache for fallback data
  }

  /**
   * Cache response for fallback use
   */
  cacheResponse(serverKey, command, response) {
    const cacheKey = `${serverKey}:${command}`;
    const cacheEntry = {
      response,
      timestamp: Date.now(),
      ttl: 300000 // 5 minutes TTL
    };
    this.cachedData.set(cacheKey, cacheEntry);
    
    // Clean up expired cache entries
    this.cleanupCache();
  }

  /**
   * Get cached response if available and not expired
   */
  getCachedResponse(serverKey, command) {
    const cacheKey = `${serverKey}:${command}`;
    const cacheEntry = this.cachedData.get(cacheKey);
    
    if (cacheEntry && (Date.now() - cacheEntry.timestamp) < cacheEntry.ttl) {
      return cacheEntry.response;
    }
    
    // Remove expired entry
    if (cacheEntry) {
      this.cachedData.delete(cacheKey);
    }
    
    return null;
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.cachedData.entries()) {
      if ((now - entry.timestamp) > entry.ttl) {
        this.cachedData.delete(key);
      }
    }
  }
}
