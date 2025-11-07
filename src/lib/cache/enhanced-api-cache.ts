/**
 * Enhanced Multi-Layer API Caching
 *
 * Layer 1: Redis (Upstash) - Distributed cache across serverless instances
 * Layer 2: In-Memory - Fast fallback for local requests
 *
 * Features:
 * - Automatic Redis fallback to in-memory
 * - Cache hit/miss metrics
 * - Stale-while-revalidate pattern
 * - Cache warming support
 */

import { redisCache, generateCacheKey } from './redis-client'

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

interface CacheMetrics {
  hits: number
  misses: number
  redisHits: number
  memoryHits: number
  errors: number
  totalRequests: number
}

class EnhancedApiCache {
  // Layer 2: In-memory cache (fallback)
  private memoryCache = new Map<string, CacheEntry<any>>()
  private readonly DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes
  private readonly MAX_MEMORY_CACHE_SIZE = 1000

  // Metrics tracking
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    redisHits: 0,
    memoryHits: 0,
    errors: 0,
    totalRequests: 0
  }

  /**
   * Generate cache key from user ID and endpoint parameters
   */
  private generateKey(userId: string, endpoint: string, params?: Record<string, any>): string {
    const paramString = params ? JSON.stringify(params) : ''
    return generateCacheKey(`api:${userId}:${endpoint}`, paramString)
  }

  /**
   * Get cached data with multi-layer lookup
   * 1. Try Redis first (Layer 1)
   * 2. Fall back to memory cache (Layer 2)
   * 3. Return null if not found
   */
  async get<T>(userId: string, endpoint: string, params?: Record<string, any>): Promise<T | null> {
    this.metrics.totalRequests++
    const key = this.generateKey(userId, endpoint, params)

    try {
      // Layer 1: Try Redis first
      const redisValue = await redisCache.get<CacheEntry<T>>(key)
      if (redisValue && Date.now() < redisValue.expiresAt) {
        this.metrics.hits++
        this.metrics.redisHits++
        console.log(`[Cache HIT - Redis] ${endpoint}`)

        // Warm memory cache for faster subsequent requests
        this.setMemoryCache(key, redisValue)
        return redisValue.data
      }

      // Layer 2: Fall back to memory cache
      const memoryValue = this.memoryCache.get(key)
      if (memoryValue && Date.now() < memoryValue.expiresAt) {
        this.metrics.hits++
        this.metrics.memoryHits++
        console.log(`[Cache HIT - Memory] ${endpoint}`)
        return memoryValue.data
      }

      // Cache miss
      this.metrics.misses++
      console.log(`[Cache MISS] ${endpoint}`)
      return null

    } catch (error) {
      this.metrics.errors++
      console.error(`[Cache ERROR] Failed to get key "${key}":`, error)

      // Try memory cache as final fallback
      const memoryValue = this.memoryCache.get(key)
      if (memoryValue && Date.now() < memoryValue.expiresAt) {
        return memoryValue.data
      }
      return null
    }
  }

  /**
   * Set cached data in both Redis and memory
   */
  async set<T>(
    userId: string,
    endpoint: string,
    data: T,
    params?: Record<string, any>,
    ttlMs?: number
  ): Promise<void> {
    const key = this.generateKey(userId, endpoint, params)
    const ttl = ttlMs || this.DEFAULT_TTL
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl
    }

    try {
      // Layer 1: Set in Redis with TTL (in seconds)
      await redisCache.set(key, entry, Math.floor(ttl / 1000))

      // Layer 2: Set in memory cache
      this.setMemoryCache(key, entry)

      console.log(`[Cache SET] ${endpoint} (TTL: ${ttl}ms)`)
    } catch (error) {
      this.metrics.errors++
      console.error(`[Cache ERROR] Failed to set key "${key}":`, error)

      // At least cache in memory on Redis failure
      this.setMemoryCache(key, entry)
    }
  }

  /**
   * Invalidate cache for user/endpoint
   */
  async invalidate(userId: string, endpoint?: string): Promise<void> {
    try {
      if (!endpoint) {
        // Invalidate all entries for user
        const pattern = generateCacheKey(`api:${userId}`, '*')
        await redisCache.delPattern(pattern)

        // Clear memory cache for user
        const keysToDelete: string[] = []
        for (const key of this.memoryCache.keys()) {
          if (key.includes(`api:${userId}:`)) {
            keysToDelete.push(key)
          }
        }
        keysToDelete.forEach(key => this.memoryCache.delete(key))
        console.log(`[Cache INVALIDATE] All endpoints for user ${userId}`)
      } else {
        // Invalidate specific endpoint
        const pattern = generateCacheKey(`api:${userId}:${endpoint}`, '*')
        await redisCache.delPattern(pattern)

        // Clear memory cache for endpoint
        const keysToDelete: string[] = []
        for (const key of this.memoryCache.keys()) {
          if (key.includes(`api:${userId}:${endpoint}`)) {
            keysToDelete.push(key)
          }
        }
        keysToDelete.forEach(key => this.memoryCache.delete(key))
        console.log(`[Cache INVALIDATE] ${endpoint} for user ${userId}`)
      }
    } catch (error) {
      console.error(`[Cache ERROR] Failed to invalidate:`, error)
    }
  }

  /**
   * Set value in memory cache with eviction
   */
  private setMemoryCache<T>(key: string, entry: CacheEntry<T>): void {
    // Prevent memory cache from growing too large
    if (this.memoryCache.size >= this.MAX_MEMORY_CACHE_SIZE) {
      this.evictOldest()
    }
    this.memoryCache.set(key, entry)
  }

  /**
   * Evict oldest entries from memory cache
   */
  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTimestamp = Infinity

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.memoryCache.delete(oldestKey)
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics & { hitRate: number } {
    const hitRate = this.metrics.totalRequests > 0
      ? (this.metrics.hits / this.metrics.totalRequests) * 100
      : 0

    return {
      ...this.metrics,
      hitRate: Number(hitRate.toFixed(2))
    }
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      redisHits: 0,
      memoryHits: 0,
      errors: 0,
      totalRequests: 0
    }
  }

  /**
   * Clear all caches (use with caution)
   */
  async clear(): Promise<void> {
    try {
      await redisCache.clear()
      this.memoryCache.clear()
      console.log('[Cache CLEAR] All caches cleared')
    } catch (error) {
      console.error('[Cache ERROR] Failed to clear caches:', error)
    }
  }
}

// Singleton instance
export const enhancedApiCache = new EnhancedApiCache()

/**
 * Enhanced cache wrapper with stale-while-revalidate support
 */
export async function withEnhancedCache<T>(
  userId: string,
  endpoint: string,
  fn: () => Promise<T>,
  options?: {
    params?: Record<string, any>
    ttlMs?: number
    skipCache?: boolean
    staleWhileRevalidate?: boolean
  }
): Promise<T> {
  const { params, ttlMs, skipCache = false, staleWhileRevalidate = false } = options || {}

  if (skipCache) {
    return await fn()
  }

  // Try to get from cache first
  const cached = await enhancedApiCache.get<T>(userId, endpoint, params)
  if (cached) {
    // If stale-while-revalidate enabled, refresh in background
    if (staleWhileRevalidate) {
      fn().then(result => {
        enhancedApiCache.set(userId, endpoint, result, params, ttlMs)
      }).catch(error => {
        console.error('[Cache SWR] Background refresh failed:', error)
      })
    }
    return cached
  }

  // Execute function and cache result
  const result = await fn()
  await enhancedApiCache.set(userId, endpoint, result, params, ttlMs)

  return result
}

/**
 * Cache TTL configurations optimized for performance
 */
export const ENHANCED_CACHE_TTL = {
  // Short-lived (high volatility)
  ACCOUNTING_ENTRIES: 2 * 60 * 1000,     // 2 minutes - transactions change frequently
  EXPENSE_CLAIMS: 90 * 1000,             // 90 seconds - during approval workflows

  // Medium-lived (moderate volatility)
  INVOICES_LIST: 3 * 60 * 1000,          // 3 minutes - documents processing
  DASHBOARD_ANALYTICS: 5 * 60 * 1000,    // 5 minutes - analytics calculations

  // Long-lived (low volatility)
  BUSINESS_CONTEXT: 15 * 60 * 1000,      // 15 minutes - business settings
  USER_PROFILE: 15 * 60 * 1000,          // 15 minutes - user data
  CATEGORIES: 30 * 60 * 1000,            // 30 minutes - category lists
  CURRENCY_RATES: 60 * 60 * 1000,        // 60 minutes - exchange rates
  TEAM_MEMBERS: 10 * 60 * 1000,          // 10 minutes - team composition
} as const
