/**
 * Business Context Caching Layer
 * Simple in-memory cache with TTL for business context performance
 * Part of the hybrid architecture: Database as source of truth + Application layer caching
 */

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
      return null
    }

    // Check if entry is expired
    const now = Date.now()
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(clerkUserId)
      return null
    }

    console.log(`[BusinessContextCache] Cache hit for user: ${clerkUserId}`)
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
    console.log(`[BusinessContextCache] Cached user data: ${clerkUserId} → business_id: ${data.business_id}`)
  }

  /**
   * Invalidate cache entry when business context changes
   */
  invalidate(clerkUserId: string): void {
    const deleted = this.cache.delete(clerkUserId)
    if (deleted) {
      console.log(`[BusinessContextCache] Invalidated cache for user: ${clerkUserId}`)
    }
  }

  /**
   * Clear all cache entries (useful for testing or memory management)
   */
  clear(): void {
    const size = this.cache.size
    this.cache.clear()
    console.log(`[BusinessContextCache] Cleared ${size} cache entries`)
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
      console.log(`[BusinessContextCache] Evicted oldest entry: ${oldestKey}`)
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
  console.log(`[BusinessContextCache] Cache miss, fetching from database: ${clerkUserId}`)

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