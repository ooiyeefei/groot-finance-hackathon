/**
 * Business Context & JWT Token Caching Layer
 * Simple in-memory cache with TTL for business context and JWT token performance
 * Part of the hybrid architecture: Database as source of truth + Application layer caching
 */

import { createLogger } from '@/lib/utils/logger';

const log = createLogger('Cache:BusinessContext');
const jwtLog = createLogger('Cache:JWT');

interface CacheEntry {
  data: {
    id: string
    business_id: string | null
    home_currency: string
    email: string
    full_name: string | null
  }
  timestamp: number
  ttl: number
}

class BusinessContextCache {
  private cache = new Map<string, CacheEntry>()
  private readonly DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes
  private readonly MAX_ENTRIES = 1000 // Prevent memory bloat

  /**
   * Get business context from cache if valid, otherwise return null
   */
  get(clerkUserId: string): CacheEntry['data'] | null {
    const entry = this.cache.get(clerkUserId)

    if (!entry) {
      log.debug('Cache miss', { reason: 'no entry', cacheSize: this.cache.size });
      return null
    }

    // Check if entry is expired (use >= to handle boundary case when remaining is exactly 0)
    const now = Date.now()
    const ageMs = now - entry.timestamp
    if (ageMs >= entry.ttl) {
      log.debug('Cache miss', { reason: 'expired', age: Math.round(ageMs/1000), ttl: Math.round(entry.ttl/1000) });
      this.cache.delete(clerkUserId)
      return null
    }

    log.debug('Cache hit', { age: Math.round(ageMs/1000), remaining: Math.round((entry.ttl - ageMs)/1000) });
    return entry.data
  }

  /**
   * Set business context in cache with TTL
   */
  set(clerkUserId: string, data: CacheEntry['data'], customTtl?: number): void {
    // Prevent cache from growing too large
    if (this.cache.size >= this.MAX_ENTRIES) {
      this.evictOldest()
    }

    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      ttl: customTtl || this.DEFAULT_TTL
    }

    this.cache.set(clerkUserId, entry)
    log.debug('Cached user data');
  }

  /**
   * Invalidate cache entry when business context changes
   */
  invalidate(clerkUserId: string): void {
    const deleted = this.cache.delete(clerkUserId)
    if (deleted) {
      log.debug('Cache invalidated');
    }
  }

  /**
   * Clear all cache entries (useful for testing or memory management)
   */
  clear(): void {
    const size = this.cache.size
    this.cache.clear()
    log.debug('Cache cleared', { count: size });
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.MAX_ENTRIES
    }
  }

  /**
   * Evict oldest cache entry when at capacity
   */
  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTimestamp = Date.now()

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      log.debug('Evicted oldest entry');
    }
  }
}

// Singleton instance for the application
export const businessContextCache = new BusinessContextCache()

/**
 * Cached version of getUserData with invalidation on business changes
 */
export async function getCachedUserData(clerkUserId: string): Promise<{
  id: string
  business_id: string | null
  home_currency: string
  email: string
  full_name: string | null
}> {
  // Try cache first
  const cached = businessContextCache.get(clerkUserId)
  if (cached) {
    return cached
  }

  // Cache miss - get from database
  log.debug('Fetching from database');

  // Import here to avoid circular dependency
  const { getUserData } = await import('./supabase-server')
  const userData = await getUserData(clerkUserId)

  // Cache the result
  businessContextCache.set(clerkUserId, userData)

  return userData
}

/**
 * Invalidate cache when user switches business
 */
export function invalidateUserCache(clerkUserId: string): void {
  businessContextCache.invalidate(clerkUserId)
}

/**
 * JWT Token Cache Interface and Implementation
 * UPDATED: Now uses actual JWT expiration time instead of hardcoded TTL
 */
interface JWTCacheEntry {
  token: string
  timestamp: number
  ttl: number // This is now calculated from actual JWT expiration
}

class JWTTokenCache {
  private cache = new Map<string, JWTCacheEntry>()
  private readonly DEFAULT_TTL = 3 * 60 * 1000 // 3 minutes (fallback only)
  private readonly REFRESH_BUFFER = 30 * 1000 // 30 seconds buffer before expiry
  private readonly MAX_ENTRIES = 500 // Prevent memory bloat

  /**
   * Get JWT token from cache if valid, otherwise return null
   * UPDATED: Uses actual JWT expiration validation
   */
  get(clerkUserId: string): string | null {
    const entry = this.cache.get(clerkUserId)

    if (!entry) {
      jwtLog.debug('Cache miss', { reason: 'no entry', cacheSize: this.cache.size });
      return null
    }

    // Import JWT utilities for expiration checking
    const { isJWTExpiredOrNearExpiry, getJWTExpirationInfo } = require('@/lib/utils/jwt-utils')

    // Check actual JWT expiration instead of cache TTL
    if (isJWTExpiredOrNearExpiry(entry.token, this.REFRESH_BUFFER)) {
      const expirationInfo = getJWTExpirationInfo(entry.token)
      jwtLog.debug('Cache miss', { reason: 'expired', remaining: expirationInfo.timeUntilExpirySeconds });
      this.cache.delete(clerkUserId)
      return null
    }

    // Log cache hit with actual JWT expiration info
    const expirationInfo = getJWTExpirationInfo(entry.token)
    const now = Date.now()
    const ageMs = now - entry.timestamp
    jwtLog.debug('Cache hit', { age: Math.round(ageMs/1000), remaining: expirationInfo.timeUntilExpirySeconds });
    return entry.token
  }

  /**
   * Set JWT token in cache with TTL calculated from actual expiration
   * UPDATED: Uses real JWT expiration time instead of hardcoded TTL
   */
  set(clerkUserId: string, token: string, customTtl?: number): void {
    // Prevent cache from growing too large
    if (this.cache.size >= this.MAX_ENTRIES) {
      this.evictOldest()
    }

    // Calculate TTL from actual JWT expiration
    const { calculateJWTCacheTTL, getJWTExpirationInfo } = require('@/lib/utils/jwt-utils')
    const actualTtl = calculateJWTCacheTTL(token, this.REFRESH_BUFFER)
    const ttl = customTtl || actualTtl || this.DEFAULT_TTL

    const entry: JWTCacheEntry = {
      token,
      timestamp: Date.now(),
      ttl
    }

    this.cache.set(clerkUserId, entry)

    // Log with actual JWT expiration info
    const expirationInfo = getJWTExpirationInfo(token)
    jwtLog.debug('Cached JWT token', { ttl: Math.round(ttl/1000) });
  }

  /**
   * Invalidate cache entry when needed
   */
  invalidate(clerkUserId: string): void {
    const deleted = this.cache.delete(clerkUserId)
    if (deleted) {
      jwtLog.debug('Token invalidated');
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size
    this.cache.clear()
    jwtLog.debug('Cache cleared', { count: size });
  }

  /**
   * Evict oldest cache entry when at capacity
   */
  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTimestamp = Date.now()

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      jwtLog.debug('Evicted oldest entry');
    }
  }
}

// Singleton instance for JWT token caching
export const jwtTokenCache = new JWTTokenCache()

/**
 * Get cached JWT token or fetch new one from Clerk
 * UPDATED: Using native integration (no template parameter)
 */
export async function getCachedJWTToken(clerkUserId: string): Promise<string | null> {
  // Try cache first
  const cached = jwtTokenCache.get(clerkUserId)
  if (cached) {
    return cached
  }

  // Cache miss - get from Clerk
  jwtLog.debug('Fetching from Clerk');

  try {
    // Import here to avoid circular dependency
    const { auth } = await import('@clerk/nextjs/server')
    const { getToken } = await auth()

    // Get Supabase-compatible JWT using Clerk's template system
    // This generates a JWT that Supabase can validate
    const jwtToken = await getToken({ template: 'supabase' })

    if (jwtToken) {
      // Validate JWT structure before caching
      const tokenParts = jwtToken.split('.')
      if (tokenParts.length === 3) {
        // Cache the token
        jwtTokenCache.set(clerkUserId, jwtToken)
        jwtLog.debug('Token cached successfully');
        return jwtToken
      } else {
        jwtLog.warn('Invalid JWT token structure');
      }
    }

    return jwtToken
  } catch (error) {
    jwtLog.error('Failed to get JWT token', error);
    return null
  }
}

/**
 * Invalidate JWT token cache when needed
 */
export function invalidateJWTTokenCache(clerkUserId: string): void {
  jwtTokenCache.invalidate(clerkUserId)
}