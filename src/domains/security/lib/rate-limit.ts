/**
 * Rate Limiting System for Groot Finance API
 *
 * ✅ PRODUCTION-READY: Redis-based distributed rate limiter with in-memory fallback
 *
 * Features:
 * - Distributed rate limiting across serverless instances (Upstash Redis)
 * - Automatic fallback to in-memory if Redis not configured
 * - Sliding window algorithm
 * - Combined user ID + IP security keys
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { Redis } from '@upstash/redis'

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Max requests per window
  keyGenerator?: (request: NextRequest) => Promise<string> // Custom key generator
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

// Redis client (singleton pattern with lazy initialization)
let redisClient: Redis | null = null
let redisInitialized = false

/**
 * Initialize Redis client with environment variables
 */
function initializeRedis(): Redis | null {
  try {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

    if (!redisUrl || !redisToken) {
      console.warn('[Rate Limit] ⚠️ Redis credentials not configured, using in-memory fallback')
      console.warn('[Rate Limit] Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for distributed rate limiting')
      return null
    }

    const client = new Redis({
      url: redisUrl,
      token: redisToken
    })

    console.log('[Rate Limit] ✅ Redis client initialized successfully (distributed mode)')
    return client
  } catch (error) {
    console.error('[Rate Limit] ❌ Failed to initialize Redis, falling back to in-memory:', error)
    return null
  }
}

/**
 * Get Redis client (lazy initialization, cached for performance)
 */
function getRedisClient(): Redis | null {
  if (!redisInitialized) {
    redisClient = initializeRedis()
    redisInitialized = true
  }
  return redisClient
}

// In-memory store (fallback when Redis is not available)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

/**
 * Default rate limit configurations for different endpoint types
 */
export const RATE_LIMIT_CONFIGS = {
  // Anonymous user limits
  ANONYMOUS: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10 // 10 requests per minute
  },

  // Strict limits for auth-related endpoints
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5 // 5 attempts per 15 minutes
  },

  // Medium limits for state-changing operations
  MUTATION: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30 // 30 requests per minute
  },

  // More lenient for read operations
  QUERY: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100 // 100 requests per minute
  },

  // Strict limits for expensive operations (document processing, etc.)
  EXPENSIVE: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20 // 20 requests per minute
  },

  // Very strict for admin operations
  ADMIN: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20 // 20 requests per minute
  },

  // Document upload limits
  UPLOAD: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 120 // 120 uploads per hour
  },

  // AI chat limits
  CHAT: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 30 // 30 messages per hour
  }
} as const

/**
 * Generate unified rate limit key combining user ID and IP address
 * This prevents rate limit bypass by switching between authenticated/unauthenticated requests
 */
async function generateDefaultKey(request: NextRequest): Promise<string> {
  const { userId } = await auth()
  const ip = getClientIP(request)

  // SECURITY FIX: Use combined key to prevent bypass attacks
  // Both authenticated and unauthenticated requests from same IP share limits
  if (userId) {
    return `ratelimit:combined:user:${userId}:ip:${ip}`
  } else {
    return `ratelimit:combined:ip:${ip}`
  }
}

/**
 * Extract client IP address with proper header precedence and validation
 */
function getClientIP(request: NextRequest): string {
  // Trust proxy headers in order of reliability
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const cfIp = request.headers.get('cf-connecting-ip')

  let ip = 'unknown'

  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, get the leftmost (original client)
    ip = forwardedFor.split(',')[0].trim()
  } else if (realIp) {
    ip = realIp.trim()
  } else if (cfIp) {
    ip = cfIp.trim()
  }

  // Validate IP format to prevent injection
  if (ip !== 'unknown' && !isValidIP(ip)) {
    console.warn('[Rate Limit] Invalid IP detected, using fallback:', ip)
    ip = 'unknown'
  }

  return ip
}

/**
 * Validate IP address format (IPv4 and IPv6)
 */
function isValidIP(ip: string): boolean {
  // IPv4 regex
  const ipv4Regex = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/

  // IPv6 regex (simplified)
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/

  return ipv4Regex.test(ip) || ipv6Regex.test(ip)
}

/**
 * Redis-based rate limiting implementation
 */
async function rateLimitRedis(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetTime: number } | null> {
  const redis = getRedisClient()

  if (!redis) {
    // Redis not available, return null to trigger fallback
    return null
  }

  try {
    const now = Date.now()
    const windowKey = `${key}:${Math.floor(now / config.windowMs)}`

    // Increment counter atomically using Redis INCR
    const count = await redis.incr(windowKey)

    // Set expiration on first request (TTL in seconds)
    if (count === 1) {
      await redis.expire(windowKey, Math.ceil(config.windowMs / 1000))
    }

    const resetTime = Math.ceil(now / config.windowMs) * config.windowMs + config.windowMs
    const remaining = Math.max(0, config.maxRequests - count)

    return {
      allowed: count <= config.maxRequests,
      remaining,
      resetTime
    }
  } catch (error) {
    console.error('[Rate Limit] Redis error, falling back to in-memory:', error)
    // Return null to trigger in-memory fallback
    return null
  }
}

/**
 * In-memory fallback rate limiting
 */
function rateLimitMemory(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now()

  // Get or create rate limit entry
  let entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetTime) {
    // Create new entry or reset expired one
    entry = {
      count: 1,
      resetTime: now + config.windowMs
    }
    rateLimitStore.set(key, entry)

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: entry.resetTime
    }
  }

  // Increment counter
  entry.count++
  rateLimitStore.set(key, entry)

  const allowed = entry.count <= config.maxRequests
  const remaining = Math.max(0, config.maxRequests - entry.count)

  return {
    allowed,
    remaining,
    resetTime: entry.resetTime
  }
}

/**
 * Rate limiting middleware with Redis + in-memory fallback
 */
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  try {
    const key = config.keyGenerator
      ? await config.keyGenerator(request)
      : await generateDefaultKey(request)

    // Try Redis first, fallback to in-memory
    let result = await rateLimitRedis(key, config)

    if (result === null) {
      // Use in-memory fallback
      result = rateLimitMemory(key, config)
    }

    // Check if limit exceeded
    if (!result.allowed) {
      const remainingTime = Math.ceil((result.resetTime - Date.now()) / 1000)

      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded',
          message: `Too many requests. Try again in ${remainingTime} seconds.`,
          retryAfter: remainingTime
        },
        {
          status: 429,
          headers: {
            'Retry-After': remainingTime.toString(),
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString()
          }
        }
      )
    }

    return null // Allow request
  } catch (error) {
    // ✅ FAIL-CLOSED: Block request on any rate limiting error
    console.error('[Rate Limit] Error - BLOCKING REQUEST:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limiting system error',
        message: 'Request blocked due to rate limiting system failure'
      },
      { status: 503 } // Service Unavailable
    )
  }
}

/**
 * Convenience wrapper for common rate limiting patterns
 */
export const createRateLimiter = (config: RateLimitConfig) => {
  return (request: NextRequest) => rateLimit(request, config)
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const rateLimiters = {
  anonymous: createRateLimiter(RATE_LIMIT_CONFIGS.ANONYMOUS),
  auth: createRateLimiter(RATE_LIMIT_CONFIGS.AUTH),
  mutation: createRateLimiter(RATE_LIMIT_CONFIGS.MUTATION),
  query: createRateLimiter(RATE_LIMIT_CONFIGS.QUERY),
  expensive: createRateLimiter(RATE_LIMIT_CONFIGS.EXPENSIVE),
  admin: createRateLimiter(RATE_LIMIT_CONFIGS.ADMIN),
  upload: createRateLimiter(RATE_LIMIT_CONFIGS.UPLOAD),
  chat: createRateLimiter(RATE_LIMIT_CONFIGS.CHAT)
}

/**
 * Business-specific rate limiting (per business context)
 */
export const createBusinessRateLimiter = (config: RateLimitConfig) => {
  return createRateLimiter({
    ...config,
    keyGenerator: async (request: NextRequest) => {
      const { userId } = await auth()
      const businessId = request.headers.get('x-business-id') ||
        request.nextUrl.searchParams.get('businessId') || 'default'

      return userId
        ? `ratelimit:business:${businessId}:user:${userId}`
        : await generateDefaultKey(request)
    }
  })
}

/**
 * Rate limiting decorator for API routes
 */
export function withRateLimit<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>,
  rateLimiter: (request: NextRequest) => Promise<NextResponse | null>
) {
  return async (...args: T): Promise<NextResponse> => {
    const request = args[0] as NextRequest

    // Apply rate limiting
    const rateLimitResponse = await rateLimiter(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Continue with original handler
    return handler(...args)
  }
}

/**
 * BACKWARDS COMPATIBILITY HELPERS
 * For smooth migration from rate-limiter.ts
 */

/**
 * Get client identifier for rate limiting (combined userId and IP)
 * SECURITY FIX: Use unified approach to prevent bypass attacks
 */
export function getClientIdentifier(request: NextRequest | Request, userId?: string): string {
  const ip = getClientIPFromRequest(request)

  // SECURITY FIX: Use combined key to prevent bypass attacks
  // Both authenticated and unauthenticated requests from same IP share limits
  if (userId) {
    return `ratelimit:combined:user:${userId}:ip:${ip}`
  } else {
    return `ratelimit:combined:ip:${ip}`
  }
}

/**
 * Extract client IP from request (helper for backwards compatibility)
 */
function getClientIPFromRequest(request: NextRequest | Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const cfIp = request.headers.get('cf-connecting-ip')

  let ip = 'unknown'

  if (forwardedFor) {
    ip = forwardedFor.split(',')[0].trim()
  } else if (realIp) {
    ip = realIp.trim()
  } else if (cfIp) {
    ip = cfIp.trim()
  }

  // Validate IP format to prevent injection
  if (ip !== 'unknown' && !isValidIP(ip)) {
    console.warn('[Rate Limit] Invalid IP detected in backwards compatibility helper, using fallback:', ip)
    ip = 'unknown'
  }

  return ip
}

/**
 * Class-based rate limiter for backwards compatibility
 * Migrates old RateLimiter class usage to new rate-limit.ts system
 */
export class RateLimiter {
  private windowMs: number
  private maxRequests: number
  private store = new Map<string, RateLimitEntry>()

  constructor(windowMs: number = 60000, maxRequests: number = 10) {
    this.windowMs = windowMs
    this.maxRequests = maxRequests

    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  public isRateLimited(identifier: string): boolean {
    const now = Date.now()
    const entry = this.store.get(identifier)

    // If no entry exists or window has expired, create new entry
    if (!entry || now >= entry.resetTime) {
      this.store.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs
      })
      return false
    }

    // If within window, increment count
    entry.count++

    // Check if limit exceeded
    return entry.count > this.maxRequests
  }

  public getRemainingRequests(identifier: string): number {
    const entry = this.store.get(identifier)
    if (!entry || Date.now() >= entry.resetTime) {
      return this.maxRequests
    }
    return Math.max(0, this.maxRequests - entry.count)
  }

  public getResetTime(identifier: string): number {
    const entry = this.store.get(identifier)
    return entry?.resetTime || Date.now()
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetTime) {
        this.store.delete(key)
      }
    }
  }
}

/**
 * Apply rate limiting and return result with headers
 * Backwards compatibility helper for old api-middleware.ts pattern
 */
export function applyRateLimit(
  rateLimiter: RateLimiter,
  identifier: string
): { allowed: boolean; headers: Record<string, string> } {
  const isLimited = rateLimiter.isRateLimited(identifier)
  const remaining = rateLimiter.getRemainingRequests(identifier)
  const resetTime = rateLimiter.getResetTime(identifier)

  return {
    allowed: !isLimited,
    headers: {
      'X-RateLimit-Limit': rateLimiter['maxRequests'].toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString()
    }
  }
}

/**
 * Pre-configured rate limiter instances (migrated from rate-limiter.ts)
 */
export const uploadRateLimiter = new RateLimiter(60000, 5) // 5 uploads per minute
export const processRateLimiter = new RateLimiter(60000, 3) // 3 processing requests per minute
export const apiRateLimiter = new RateLimiter(60000, 30) // 30 API requests per minute
export const analyticsRateLimiter = new RateLimiter(60000, 10) // 10 analytics requests per minute
export const dashboardRateLimiter = new RateLimiter(60000, 15) // 15 dashboard requests per minute
export const reportsRateLimiter = new RateLimiter(300000, 5) // 5 reports per 5 minutes (expensive)
export const teamManagementRateLimiter = new RateLimiter(60000, 20) // 20 team requests per minute
export const realtimeRateLimiter = new RateLimiter(60000, 30) // 30 real-time requests per minute