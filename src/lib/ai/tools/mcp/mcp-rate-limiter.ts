/**
 * MCP Rate Limiter (Phase 6)
 *
 * Provides per-business rate limiting for MCP tool calls.
 * Uses in-memory sliding window algorithm for simplicity.
 *
 * Rate Limits:
 * - 60 requests per minute per business (default)
 * - 10 requests per second burst limit
 */

export interface RateLimiterConfig {
  maxRequestsPerMinute: number
  maxBurstPerSecond: number
}

interface RateWindow {
  minuteRequests: number[]
  secondRequests: number[]
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxRequestsPerMinute: 60,
  maxBurstPerSecond: 10,
}

export class MCPRateLimiter {
  private windows: Map<string, RateWindow> = new Map()
  private config: RateLimiterConfig

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Check if a request is allowed for the given business
   * @returns true if allowed, false if rate limited
   */
  checkLimit(businessId: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now()
    const window = this.getOrCreateWindow(businessId)

    // Clean up old entries
    this.cleanupWindow(window, now)

    // Check burst limit (per second)
    const oneSecondAgo = now - 1000
    const recentSecondRequests = window.secondRequests.filter(t => t > oneSecondAgo)
    if (recentSecondRequests.length >= this.config.maxBurstPerSecond) {
      const oldestInSecond = Math.min(...recentSecondRequests)
      const retryAfterMs = oldestInSecond + 1000 - now
      return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) }
    }

    // Check minute limit
    const oneMinuteAgo = now - 60000
    const recentMinuteRequests = window.minuteRequests.filter(t => t > oneMinuteAgo)
    if (recentMinuteRequests.length >= this.config.maxRequestsPerMinute) {
      const oldestInMinute = Math.min(...recentMinuteRequests)
      const retryAfterMs = oldestInMinute + 60000 - now
      return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) }
    }

    return { allowed: true }
  }

  /**
   * Record a request for the given business
   */
  recordRequest(businessId: string): void {
    const now = Date.now()
    const window = this.getOrCreateWindow(businessId)

    window.secondRequests.push(now)
    window.minuteRequests.push(now)

    // Cleanup old entries
    this.cleanupWindow(window, now)
  }

  /**
   * Get current usage stats for a business
   */
  getUsage(businessId: string): {
    requestsInLastMinute: number
    requestsInLastSecond: number
    remainingPerMinute: number
    remainingPerSecond: number
  } {
    const now = Date.now()
    const window = this.windows.get(businessId)

    if (!window) {
      return {
        requestsInLastMinute: 0,
        requestsInLastSecond: 0,
        remainingPerMinute: this.config.maxRequestsPerMinute,
        remainingPerSecond: this.config.maxBurstPerSecond,
      }
    }

    const oneSecondAgo = now - 1000
    const oneMinuteAgo = now - 60000

    const requestsInLastSecond = window.secondRequests.filter(t => t > oneSecondAgo).length
    const requestsInLastMinute = window.minuteRequests.filter(t => t > oneMinuteAgo).length

    return {
      requestsInLastMinute,
      requestsInLastSecond,
      remainingPerMinute: Math.max(0, this.config.maxRequestsPerMinute - requestsInLastMinute),
      remainingPerSecond: Math.max(0, this.config.maxBurstPerSecond - requestsInLastSecond),
    }
  }

  private getOrCreateWindow(businessId: string): RateWindow {
    let window = this.windows.get(businessId)
    if (!window) {
      window = { minuteRequests: [], secondRequests: [] }
      this.windows.set(businessId, window)
    }
    return window
  }

  private cleanupWindow(window: RateWindow, now: number): void {
    const oneSecondAgo = now - 1000
    const oneMinuteAgo = now - 60000

    window.secondRequests = window.secondRequests.filter(t => t > oneSecondAgo)
    window.minuteRequests = window.minuteRequests.filter(t => t > oneMinuteAgo)
  }

  /**
   * Clear all rate limit windows (for testing)
   */
  reset(): void {
    this.windows.clear()
  }
}

// Singleton instance
let rateLimiter: MCPRateLimiter | null = null

export function getMCPRateLimiter(): MCPRateLimiter {
  if (!rateLimiter) {
    rateLimiter = new MCPRateLimiter()
  }
  return rateLimiter
}

export function resetMCPRateLimiter(): void {
  rateLimiter = null
}
