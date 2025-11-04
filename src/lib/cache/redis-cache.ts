/**
 * Redis-Based Cache Implementation with In-Memory Fallback
 *
 * Provides distributed caching for:
 * - Business context data (user profile + business membership)
 * - JWT tokens with expiration awareness
 * - User roles and permissions
 *
 * Automatically falls back to in-memory cache if Redis is unavailable
 */

import { redisCache, generateCacheKey } from './redis-client'

/**
 * Business Context Cache Entry
 */
interface BusinessContextData {
  id: string
  business_id: string | null
  home_currency: string
  email: string
  full_name: string | null
}

interface CacheEntry {
  data: BusinessContextData
  timestamp: number
  ttl: number
}

/**
 * JWT Token Cache Entry
 */
interface JWTCacheEntry {
  token: string
  timestamp: number
  ttl: number
}

/**
 * Redis-based Business Context Cache
 * Maintains same interface as original in-memory implementation
 */
class RedisBusinessContextCache {
  private readonly DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes (ms)
  private readonly DEFAULT_TTL_SECONDS = 5 * 60 // 5 minutes (seconds for Redis)
  private readonly MAX_ENTRIES = 1000

  // In-memory fallback cache
  private fallbackCache = new Map<string, CacheEntry>()

  /**
   * Get business context from Redis (or fallback)
   */
  async get(clerkUserId: string): Promise<BusinessContextData | null> {
    const key = generateCacheKey('business-context', clerkUserId)

    try {
      // Try Redis first
      const redisEntry = await redisCache.get<CacheEntry>(key)
      if (redisEntry) {
        const now = Date.now()
        const ageMs = now - redisEntry.timestamp

        if (ageMs < redisEntry.ttl) {
          return redisEntry.data
        } else {
          // Expired, delete from Redis
          await redisCache.del(key)
          return null
        }
      }
    } catch (error) {
      console.warn('[RedisBusinessContextCache] Redis get failed, using fallback:', error)
    }

    // Fallback to in-memory
    const fallbackEntry = this.fallbackCache.get(clerkUserId)
    if (!fallbackEntry) return null

    const now = Date.now()
    const ageMs = now - fallbackEntry.timestamp
    if (ageMs >= fallbackEntry.ttl) {
      this.fallbackCache.delete(clerkUserId)
      return null
    }

    return fallbackEntry.data
  }

  /**
   * Set business context in Redis (and fallback)
   */
  async set(clerkUserId: string, data: BusinessContextData, customTtl?: number): Promise<void> {
    const ttlMs = customTtl || this.DEFAULT_TTL
    const ttlSeconds = Math.ceil(ttlMs / 1000)

    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    }

    const key = generateCacheKey('business-context', clerkUserId)

    try {
      // Store in Redis
      await redisCache.set(key, entry, ttlSeconds)
    } catch (error) {
      console.warn('[RedisBusinessContextCache] Redis set failed, using fallback:', error)
    }

    // Always store in fallback cache
    if (this.fallbackCache.size >= this.MAX_ENTRIES) {
      this.evictOldestFromFallback()
    }
    this.fallbackCache.set(clerkUserId, entry)
  }

  /**
   * Invalidate business context in Redis and fallback
   */
  async invalidate(clerkUserId: string): Promise<void> {
    const key = generateCacheKey('business-context', clerkUserId)

    try {
      await redisCache.del(key)
    } catch (error) {
      console.warn('[RedisBusinessContextCache] Redis invalidate failed:', error)
    }

    this.fallbackCache.delete(clerkUserId)
  }

  /**
   * Clear all business context cache
   */
  async clear(): Promise<void> {
    try {
      await redisCache.delPattern('finanseal:business-context:*')
    } catch (error) {
      console.warn('[RedisBusinessContextCache] Redis clear failed:', error)
    }

    this.fallbackCache.clear()
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.fallbackCache.size,
      maxSize: this.MAX_ENTRIES,
    }
  }

  /**
   * Evict oldest entry from fallback cache (LRU)
   */
  private evictOldestFromFallback(): void {
    let oldestKey: string | null = null
    let oldestTimestamp = Date.now()

    for (const [key, entry] of this.fallbackCache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.fallbackCache.delete(oldestKey)
    }
  }
}

/**
 * Redis-based JWT Token Cache
 * JWT-expiration-aware caching with fallback
 */
class RedisJWTTokenCache {
  private readonly DEFAULT_TTL = 3 * 60 * 1000 // 3 minutes (ms)
  private readonly DEFAULT_TTL_SECONDS = 3 * 60 // 3 minutes (seconds)
  private readonly REFRESH_BUFFER = 30 * 1000 // 30 seconds
  private readonly MAX_ENTRIES = 500

  // In-memory fallback cache
  private fallbackCache = new Map<string, JWTCacheEntry>()

  /**
   * Get JWT token from Redis (or fallback)
   * Returns null if expired or near expiration
   */
  async get(clerkUserId: string): Promise<string | null> {
    const key = generateCacheKey('jwt-token', clerkUserId)

    try {
      // Try Redis first
      const redisEntry = await redisCache.get<JWTCacheEntry>(key)
      if (redisEntry) {
        const { isJWTExpiredOrNearExpiry } = await import('@/lib/utils/jwt-utils')

        if (isJWTExpiredOrNearExpiry(redisEntry.token, this.REFRESH_BUFFER)) {
          await redisCache.del(key)
          return null
        }

        return redisEntry.token
      }
    } catch (error) {
      console.warn('[RedisJWTTokenCache] Redis get failed, using fallback:', error)
    }

    // Fallback to in-memory
    const fallbackEntry = this.fallbackCache.get(clerkUserId)
    if (!fallbackEntry) return null

    const { isJWTExpiredOrNearExpiry } = await import('@/lib/utils/jwt-utils')

    if (isJWTExpiredOrNearExpiry(fallbackEntry.token, this.REFRESH_BUFFER)) {
      this.fallbackCache.delete(clerkUserId)
      return null
    }

    return fallbackEntry.token
  }

  /**
   * Set JWT token in Redis (and fallback)
   * Automatically calculates TTL based on JWT expiration
   */
  async set(clerkUserId: string, token: string, customTtl?: number): Promise<void> {
    const { calculateJWTCacheTTL } = await import('@/lib/utils/jwt-utils')
    const jwtTtlMs = calculateJWTCacheTTL(token, this.REFRESH_BUFFER)
    const ttlMs = customTtl || jwtTtlMs || this.DEFAULT_TTL
    const ttlSeconds = Math.ceil(ttlMs / 1000)

    const entry: JWTCacheEntry = {
      token,
      timestamp: Date.now(),
      ttl: ttlMs,
    }

    const key = generateCacheKey('jwt-token', clerkUserId)

    try {
      // Store in Redis
      await redisCache.set(key, entry, ttlSeconds)
    } catch (error) {
      console.warn('[RedisJWTTokenCache] Redis set failed, using fallback:', error)
    }

    // Always store in fallback cache
    if (this.fallbackCache.size >= this.MAX_ENTRIES) {
      this.evictOldestFromFallback()
    }
    this.fallbackCache.set(clerkUserId, entry)
  }

  /**
   * Invalidate JWT token in Redis and fallback
   */
  async invalidate(clerkUserId: string): Promise<void> {
    const key = generateCacheKey('jwt-token', clerkUserId)

    try {
      await redisCache.del(key)
    } catch (error) {
      console.warn('[RedisJWTTokenCache] Redis invalidate failed:', error)
    }

    this.fallbackCache.delete(clerkUserId)
  }

  /**
   * Clear all JWT token cache
   */
  async clear(): Promise<void> {
    try {
      await redisCache.delPattern('finanseal:jwt-token:*')
    } catch (error) {
      console.warn('[RedisJWTTokenCache] Redis clear failed:', error)
    }

    this.fallbackCache.clear()
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.fallbackCache.size,
      maxSize: this.MAX_ENTRIES,
    }
  }

  /**
   * Evict oldest entry from fallback cache (LRU)
   */
  private evictOldestFromFallback(): void {
    let oldestKey: string | null = null
    let oldestTimestamp = Date.now()

    for (const [key, entry] of this.fallbackCache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.fallbackCache.delete(oldestKey)
    }
  }
}

/**
 * Redis-based Role Cache
 * Generic cache for user role and permissions data
 */
class RedisRoleCache {
  private readonly DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes (ms)
  private readonly DEFAULT_TTL_SECONDS = 5 * 60 // 5 minutes (seconds)
  private readonly MAX_ENTRIES = 1000

  // In-memory fallback cache
  private fallbackCache = new Map<string, { data: any; timestamp: number }>()

  /**
   * Get role data from Redis (or fallback)
   */
  async get(userId: string): Promise<any | null> {
    const key = generateCacheKey('user-role', userId)

    try {
      // Try Redis first
      const redisEntry = await redisCache.get<{ data: any; timestamp: number }>(key)
      if (redisEntry) {
        const now = Date.now()
        const ageMs = now - redisEntry.timestamp

        if (ageMs < this.DEFAULT_TTL) {
          return redisEntry.data
        } else {
          await redisCache.del(key)
          return null
        }
      }
    } catch (error) {
      console.warn('[RedisRoleCache] Redis get failed, using fallback:', error)
    }

    // Fallback to in-memory
    const fallbackEntry = this.fallbackCache.get(userId)
    if (!fallbackEntry) return null

    const now = Date.now()
    const ageMs = now - fallbackEntry.timestamp
    if (ageMs >= this.DEFAULT_TTL) {
      this.fallbackCache.delete(userId)
      return null
    }

    return fallbackEntry.data
  }

  /**
   * Set role data in Redis (and fallback)
   */
  async set(userId: string, data: any): Promise<void> {
    const entry = {
      data,
      timestamp: Date.now(),
    }

    const key = generateCacheKey('user-role', userId)

    try {
      // Store in Redis
      await redisCache.set(key, entry, this.DEFAULT_TTL_SECONDS)
    } catch (error) {
      console.warn('[RedisRoleCache] Redis set failed, using fallback:', error)
    }

    // Always store in fallback cache
    if (this.fallbackCache.size >= this.MAX_ENTRIES) {
      this.evictOldestFromFallback()
    }
    this.fallbackCache.set(userId, entry)
  }

  /**
   * Invalidate role data in Redis and fallback
   */
  async invalidate(userId: string): Promise<void> {
    const key = generateCacheKey('user-role', userId)

    try {
      await redisCache.del(key)
    } catch (error) {
      console.warn('[RedisRoleCache] Redis invalidate failed:', error)
    }

    this.fallbackCache.delete(userId)
  }

  /**
   * Clear all role cache
   */
  async clear(): Promise<void> {
    try {
      await redisCache.delPattern('finanseal:user-role:*')
    } catch (error) {
      console.warn('[RedisRoleCache] Redis clear failed:', error)
    }

    this.fallbackCache.clear()
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.fallbackCache.size,
      maxSize: this.MAX_ENTRIES,
    }
  }

  /**
   * Evict oldest entry from fallback cache (LRU)
   */
  private evictOldestFromFallback(): void {
    let oldestKey: string | null = null
    let oldestTimestamp = Date.now()

    for (const [key, entry] of this.fallbackCache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.fallbackCache.delete(oldestKey)
    }
  }
}

// Export singleton instances
export const redisBusinessContextCache = new RedisBusinessContextCache()
export const redisJWTTokenCache = new RedisJWTTokenCache()
export const redisRoleCache = new RedisRoleCache()
