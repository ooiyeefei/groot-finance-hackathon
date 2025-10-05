/**
 * Audit logging utility for security-critical operations
 * Logs RPC calls, authentication events, and security-related actions
 */

interface AuditLogEntry {
  timestamp: string
  user_id: string | null
  business_id: string | null
  action: string
  resource: string
  details: Record<string, any>
  ip_address?: string
  user_agent?: string
  success: boolean
  error_message?: string
}

interface RPCAuditDetails {
  rpc_function: string
  parameters: Record<string, any>
  execution_time_ms?: number
  result_count?: number
  cached?: boolean
}

interface AuthAuditDetails {
  auth_method: string
  role_permissions?: Record<string, boolean>
  business_context?: boolean
}

interface RateLimitAuditDetails {
  rate_limiter: string
  requests_remaining: number
  reset_time: number
  exceeded: boolean
}

class AuditLogger {
  private logToConsole: boolean

  constructor(logToConsole: boolean = true) {
    this.logToConsole = logToConsole
  }

  private createLogEntry(
    userId: string | null,
    businessId: string | null,
    action: string,
    resource: string,
    details: Record<string, any>,
    success: boolean,
    request?: Request,
    errorMessage?: string
  ): AuditLogEntry {
    return {
      timestamp: new Date().toISOString(),
      user_id: userId,
      business_id: businessId,
      action,
      resource,
      details,
      ip_address: this.extractIPAddress(request),
      user_agent: request?.headers.get('user-agent') || undefined,
      success,
      error_message: errorMessage
    }
  }

  private extractIPAddress(request?: Request): string | undefined {
    if (!request) return undefined

    // Check for forwarded IP (common in production environments)
    const forwardedFor = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    const clientIp = request.headers.get('x-client-ip')

    return forwardedFor?.split(',')[0] || realIp || clientIp || undefined
  }

  private logEntry(entry: AuditLogEntry): void {
    if (this.logToConsole) {
      console.log(`[AUDIT] ${entry.timestamp} | ${entry.action} | User: ${entry.user_id} | Business: ${entry.business_id} | Success: ${entry.success}`)
      if (entry.error_message) {
        console.log(`[AUDIT ERROR] ${entry.error_message}`)
      }
    }

    // In production, this could also:
    // - Send logs to external service (e.g., Supabase audit table, CloudWatch, etc.)
    // - Write to files
    // - Send to SIEM systems
  }

  /**
   * Log RPC function calls for security monitoring
   */
  logRPCCall(
    userId: string | null,
    businessId: string | null,
    rpcFunction: string,
    parameters: Record<string, any>,
    success: boolean,
    request?: Request,
    executionTimeMs?: number,
    resultCount?: number,
    errorMessage?: string,
    cached?: boolean
  ): void {
    const details: RPCAuditDetails = {
      rpc_function: rpcFunction,
      parameters: this.sanitizeParameters(parameters),
      execution_time_ms: executionTimeMs,
      result_count: resultCount,
      cached
    }

    const entry = this.createLogEntry(
      userId,
      businessId,
      'RPC_CALL',
      `rpc.${rpcFunction}`,
      details,
      success,
      request,
      errorMessage
    )

    this.logEntry(entry)
  }

  /**
   * Log authentication and authorization events
   */
  logAuthEvent(
    userId: string | null,
    businessId: string | null,
    authMethod: string,
    success: boolean,
    request?: Request,
    rolePermissions?: Record<string, boolean>,
    businessContext?: boolean,
    errorMessage?: string
  ): void {
    const details: AuthAuditDetails = {
      auth_method: authMethod,
      role_permissions: rolePermissions,
      business_context: businessContext
    }

    const entry = this.createLogEntry(
      userId,
      businessId,
      'AUTHENTICATION',
      `auth.${authMethod}`,
      details,
      success,
      request,
      errorMessage
    )

    this.logEntry(entry)
  }

  /**
   * Log rate limiting events
   */
  logRateLimit(
    userId: string | null,
    businessId: string | null,
    rateLimiterName: string,
    exceeded: boolean,
    requestsRemaining: number,
    resetTime: number,
    request?: Request
  ): void {
    const details: RateLimitAuditDetails = {
      rate_limiter: rateLimiterName,
      requests_remaining: requestsRemaining,
      reset_time: resetTime,
      exceeded
    }

    const entry = this.createLogEntry(
      userId,
      businessId,
      'RATE_LIMIT',
      `rate_limit.${rateLimiterName}`,
      details,
      !exceeded, // Success is when rate limit is NOT exceeded
      request,
      exceeded ? 'Rate limit exceeded' : undefined
    )

    this.logEntry(entry)
  }

  /**
   * Sanitize sensitive parameters before logging
   */
  private sanitizeParameters(params: Record<string, any>): Record<string, any> {
    const sanitized = { ...params }

    // Remove or hash sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth']

    for (const key of Object.keys(sanitized)) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        sanitized[key] = '[REDACTED]'
      }
    }

    return sanitized
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger(true)

// Export types for use in other modules
export type { AuditLogEntry, RPCAuditDetails, AuthAuditDetails, RateLimitAuditDetails }