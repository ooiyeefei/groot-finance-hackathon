/**
 * API Response Caching Layer
 * Provides simple in-memory caching for API responses to reduce database load
 * Optimized for dashboard and invoices endpoints
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class ApiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 1000;

  /**
   * Generate cache key from user ID and additional parameters
   */
  private generateKey(userId: string, endpoint: string, params?: Record<string, any>): string {
    const paramString = params ? JSON.stringify(params) : '';
    return `${userId}:${endpoint}:${paramString}`;
  }

  /**
   * Get cached data if available and not expired
   */
  get<T>(userId: string, endpoint: string, params?: Record<string, any>): T | null {
    const key = this.generateKey(userId, endpoint, params);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cached data with TTL
   */
  set<T>(
    userId: string,
    endpoint: string,
    data: T,
    params?: Record<string, any>,
    ttlMs?: number
  ): void {
    const key = this.generateKey(userId, endpoint, params);
    const ttl = ttlMs || this.DEFAULT_TTL;

    // Prevent cache from growing too large
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl
    });
  }

  /**
   * Invalidate cache for specific user and endpoint
   */
  invalidate(userId: string, endpoint?: string): void {
    if (!endpoint) {
      // Invalidate all entries for user
      const keysToDelete: string[] = [];
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${userId}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.cache.delete(key));
    } else {
      // Invalidate specific endpoint for user
      const keysToDelete: string[] = [];
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${userId}:${endpoint}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.cache.delete(key));
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Evict oldest entries when cache is full
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      hitRate: 0 // TODO: Implement hit rate tracking
    };
  }
}

// Singleton instance
export const apiCache = new ApiCache();

/**
 * Cache wrapper for API functions
 */
export async function withCache<T>(
  userId: string,
  endpoint: string,
  fn: () => Promise<T>,
  options?: {
    params?: Record<string, any>;
    ttlMs?: number;
    skipCache?: boolean;
  }
): Promise<T> {
  const { params, ttlMs, skipCache = false } = options || {};

  if (skipCache) {
    return await fn();
  }

  // Try to get from cache first
  const cached = apiCache.get<T>(userId, endpoint, params);
  if (cached) {
    return cached;
  }

  // Execute function and cache result
  const result = await fn();
  apiCache.set(userId, endpoint, result, params, ttlMs);

  return result;
}

/**
 * Cache TTL configurations for different endpoints
 */
export const CACHE_TTL = {
  DASHBOARD_ANALYTICS: 5 * 60 * 1000,    // 5 minutes - financial data changes frequently
  INVOICES_LIST: 2 * 60 * 1000,          // 2 minutes - documents change less frequently
  USER_PROFILE: 15 * 60 * 1000,          // 15 minutes - user data rarely changes
  CURRENCY_RATES: 30 * 60 * 1000,        // 30 minutes - exchange rates update periodically

  // New endpoint optimizations
  ACCOUNTING_ENTRIES: 3 * 60 * 1000,     // 3 minutes - transaction data changes moderately
  EXPENSE_CLAIMS: 2 * 60 * 1000,         // 2 minutes - expense claims change during approvals
  EXPENSE_ANALYTICS: 10 * 60 * 1000,     // 10 minutes - analytics data less volatile
  BUSINESS_SETTINGS: 30 * 60 * 1000,     // 30 minutes - business settings rarely change
  USER_SETTINGS: 15 * 60 * 1000,         // 15 minutes - user settings rarely change
  TEAM_MEMBERS: 10 * 60 * 1000,          // 10 minutes - team composition changes occasionally
} as const;