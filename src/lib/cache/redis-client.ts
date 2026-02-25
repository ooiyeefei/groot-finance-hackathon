/**
 * Redis Client Configuration for Groot Finance
 *
 * Provides centralized Redis client with:
 * - Upstash Redis connection
 * - Graceful fallback to in-memory cache on failure
 * - Type-safe operations
 * - Connection health monitoring
 */

import { Redis } from '@upstash/redis'

/**
 * Redis client instance
 * Configured with Upstash credentials from environment variables
 */
let redisClient: Redis | null = null
let redisConnectionError: Error | null = null

/**
 * Initialize Redis client with Upstash configuration
 * Falls back gracefully if environment variables are missing
 */
function initializeRedis(): Redis | null {
  try {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

    if (!redisUrl || !redisToken) {
      console.warn('[Redis] Missing Upstash credentials - falling back to in-memory cache')
      console.warn('[Redis] Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables')
      return null
    }

    redisClient = new Redis({
      url: redisUrl,
      token: redisToken,
    })

    console.log('[Redis] Successfully initialized Upstash Redis client')
    return redisClient
  } catch (error) {
    console.error('[Redis] Failed to initialize Redis client:', error)
    redisConnectionError = error as Error
    return null
  }
}

/**
 * Get Redis client instance
 * Returns null if Redis is unavailable (triggers fallback)
 */
export function getRedisClient(): Redis | null {
  if (redisClient === null && redisConnectionError === null) {
    redisClient = initializeRedis()
  }
  return redisClient
}

/**
 * Check if Redis is available and healthy
 */
export async function isRedisAvailable(): Promise<boolean> {
  const client = getRedisClient()
  if (!client) return false

  try {
    await client.ping()
    return true
  } catch (error) {
    console.error('[Redis] Health check failed:', error)
    return false
  }
}

/**
 * Redis cache operations with automatic fallback
 */
export const redisCache = {
  /**
   * Get value from Redis
   * Returns null if key doesn't exist or Redis is unavailable
   */
  async get<T>(key: string): Promise<T | null> {
    const client = getRedisClient()
    if (!client) return null

    try {
      const value = await client.get<T>(key)
      return value
    } catch (error) {
      console.error(`[Redis] Failed to get key "${key}":`, error)
      return null
    }
  },

  /**
   * Set value in Redis with optional TTL (in seconds)
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    const client = getRedisClient()
    if (!client) return false

    try {
      if (ttlSeconds) {
        await client.setex(key, ttlSeconds, value)
      } else {
        await client.set(key, value)
      }
      return true
    } catch (error) {
      console.error(`[Redis] Failed to set key "${key}":`, error)
      return false
    }
  },

  /**
   * Delete key from Redis
   */
  async del(key: string): Promise<boolean> {
    const client = getRedisClient()
    if (!client) return false

    try {
      await client.del(key)
      return true
    } catch (error) {
      console.error(`[Redis] Failed to delete key "${key}":`, error)
      return false
    }
  },

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern: string): Promise<boolean> {
    const client = getRedisClient()
    if (!client) return false

    try {
      const keys = await client.keys(pattern)
      if (keys.length > 0) {
        await client.del(...keys)
      }
      return true
    } catch (error) {
      console.error(`[Redis] Failed to delete pattern "${pattern}":`, error)
      return false
    }
  },

  /**
   * Check if key exists in Redis
   */
  async exists(key: string): Promise<boolean> {
    const client = getRedisClient()
    if (!client) return false

    try {
      const result = await client.exists(key)
      return result > 0
    } catch (error) {
      console.error(`[Redis] Failed to check existence of key "${key}":`, error)
      return false
    }
  },

  /**
   * Get TTL (time to live) for a key in seconds
   * Returns -1 if key has no expiration
   * Returns -2 if key doesn't exist
   * Returns null on error
   */
  async ttl(key: string): Promise<number | null> {
    const client = getRedisClient()
    if (!client) return null

    try {
      const ttl = await client.ttl(key)
      return ttl
    } catch (error) {
      console.error(`[Redis] Failed to get TTL for key "${key}":`, error)
      return null
    }
  },

  /**
   * Clear all keys (use with caution)
   */
  async clear(): Promise<boolean> {
    const client = getRedisClient()
    if (!client) return false

    try {
      await client.flushdb()
      return true
    } catch (error) {
      console.error('[Redis] Failed to clear cache:', error)
      return false
    }
  },
}

/**
 * Generate cache key with namespace prefix
 */
export function generateCacheKey(namespace: string, identifier: string): string {
  return `finanseal:${namespace}:${identifier}`
}
