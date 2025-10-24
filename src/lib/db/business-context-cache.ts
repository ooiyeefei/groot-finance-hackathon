/**
 * Business Context & JWT Token Caching Layer
 * Simple in-memory cache with TTL for business context and JWT token performance
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
      console.log(`[BusinessContextCache] Cache miss - no entry found for user: ${clerkUserId} (total cache size: ${this.cache.size})`)
      return null
    }

    // Check if entry is expired (use >= to handle boundary case when remaining is exactly 0)
    const now = Date.now()
    const ageMs = now - entry.timestamp
    if (ageMs >= entry.ttl) {
      console.log(`[BusinessContextCache] Cache miss - entry expired for user: ${clerkUserId} (age: ${Math.round(ageMs/1000)}s, ttl: ${Math.round(entry.ttl/1000)}s)`)
      this.cache.delete(clerkUserId)
      return null
    }

    console.log(`[BusinessContextCache] Cache hit for user: ${clerkUserId} (age: ${Math.round(ageMs/1000)}s, remaining: ${Math.round((entry.ttl - ageMs)/1000)}s)`)
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

/**
 * JWT Token Cache Interface and Implementation
 */
interface JWTCacheEntry {
  token: string
  timestamp: number
  ttl: number
}

class JWTTokenCache {
  private cache = new Map<string, JWTCacheEntry>()
  private readonly DEFAULT_TTL = 3 * 60 * 1000 // 3 minutes (match Clerk JWT expiration)
  private readonly REFRESH_BUFFER = 30 * 1000 // 30 seconds buffer before expiry
  private readonly MAX_ENTRIES = 500 // Prevent memory bloat

  /**
   * Get JWT token from cache if valid, otherwise return null
   */
  get(clerkUserId: string): string | null {
    const entry = this.cache.get(clerkUserId)

    if (!entry) {
      console.log(`[JWTTokenCache] Cache miss - no entry found for user: ${clerkUserId} (total cache size: ${this.cache.size})`)
      return null
    }

    // Check if entry is expired or needs refresh (with buffer)
    const now = Date.now()
    const ageMs = now - entry.timestamp
    const remainingMs = entry.ttl - ageMs

    // Invalidate if expired OR within refresh buffer time
    if (ageMs >= entry.ttl || remainingMs <= this.REFRESH_BUFFER) {
      console.log(`[JWTTokenCache] Cache miss - entry expired or needs refresh for user: ${clerkUserId} (age: ${Math.round(ageMs/1000)}s, ttl: ${Math.round(entry.ttl/1000)}s, remaining: ${Math.round(remainingMs/1000)}s)`)
      this.cache.delete(clerkUserId)
      return null
    }

    console.log(`[JWTTokenCache] Cache hit for user: ${clerkUserId} (age: ${Math.round(ageMs/1000)}s, remaining: ${Math.round(remainingMs/1000)}s)`)
    return entry.token
  }

  /**
   * Set JWT token in cache with TTL
   */
  set(clerkUserId: string, token: string, customTtl?: number): void {
    // Prevent cache from growing too large
    if (this.cache.size >= this.MAX_ENTRIES) {
      this.evictOldest()
    }

    const entry: JWTCacheEntry = {
      token,
      timestamp: Date.now(),
      ttl: customTtl || this.DEFAULT_TTL
    }

    this.cache.set(clerkUserId, entry)
    console.log(`[JWTTokenCache] Cached JWT token for user: ${clerkUserId}`)
  }

  /**
   * Invalidate cache entry when needed
   */
  invalidate(clerkUserId: string): void {
    const deleted = this.cache.delete(clerkUserId)
    if (deleted) {
      console.log(`[JWTTokenCache] Invalidated JWT token for user: ${clerkUserId}`)
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size
    this.cache.clear()
    console.log(`[JWTTokenCache] Cleared ${size} JWT cache entries`)
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
      console.log(`[JWTTokenCache] Evicted oldest JWT entry: ${oldestKey}`)
    }
  }
}

// Singleton instance for JWT token caching
export const jwtTokenCache = new JWTTokenCache()

/**
 * Get cached JWT token or fetch new one from Clerk
 */
export async function getCachedJWTToken(clerkUserId: string): Promise<string | null> {
  // Try cache first
  const cached = jwtTokenCache.get(clerkUserId)
  if (cached) {
    return cached
  }

  // Cache miss - get from Clerk
  console.log(`[JWTTokenCache] Cache miss, fetching from Clerk: ${clerkUserId}`)

  try {
    // Import here to avoid circular dependency
    const { auth } = await import('@clerk/nextjs/server')
    const { getToken } = await auth()

    const jwtToken = await getToken({ template: 'supabase' })

    if (jwtToken) {
      // Validate JWT structure before caching
      const tokenParts = jwtToken.split('.')
      if (tokenParts.length === 3) {
        // Cache the token
        jwtTokenCache.set(clerkUserId, jwtToken)
        console.log(`[JWTTokenCache] Successfully cached JWT token for user: ${clerkUserId}`)
        return jwtToken
      } else {
        console.warn(`[JWTTokenCache] Invalid JWT token structure for user: ${clerkUserId}`)
      }
    }

    return jwtToken
  } catch (error) {
    console.error(`[JWTTokenCache] Failed to get JWT token for user: ${clerkUserId}`, error)
    return null
  }
}

/**
 * Invalidate JWT token cache when needed
 */
export function invalidateJWTTokenCache(clerkUserId: string): void {
  jwtTokenCache.invalidate(clerkUserId)
}