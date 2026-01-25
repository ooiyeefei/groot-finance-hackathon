/**
 * MCP Security Audit Service (T074)
 *
 * Security compliance layer for MCP tool calls:
 * - Parameter validation against dangerous patterns
 * - Parameter sanitization for audit logging
 * - Rate limiting tracking per user
 * - Compliance-grade audit events
 * - Suspicious activity detection
 *
 * Security Principles:
 * - Defense in depth: Multiple validation layers
 * - Deny by default: Block suspicious patterns
 * - Audit everything: Full trail for compliance
 * - Rate limit: Prevent abuse and resource exhaustion
 */

import { createLogger } from '@/lib/utils/logger'
import { UserContext } from '../tools/base-tool'

// Create dedicated security audit logger
const securityLog = createLogger('MCP:Security')

/**
 * Security audit event types
 */
export type SecurityEventType =
  | 'tool_call_audit'      // Standard audit log
  | 'validation_failure'    // Parameter validation failed
  | 'rate_limit_warning'    // User approaching rate limit
  | 'rate_limit_exceeded'   // User exceeded rate limit
  | 'suspicious_pattern'    // Dangerous pattern detected
  | 'permission_denied'     // Access denied

/**
 * Severity levels for security events
 */
export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Security audit event structure
 * Designed for compliance reporting and SIEM integration
 */
export interface SecurityAuditEvent {
  /** Event type */
  eventType: SecurityEventType
  /** Severity level */
  severity: SecuritySeverity
  /** ISO timestamp */
  timestamp: string
  /** Tool name (full prefixed name) */
  toolName: string
  /** MCP server ID */
  serverId: string
  /** User ID (partial for privacy) */
  userId: string
  /** Business ID (partial for privacy) */
  businessId?: string
  /** Conversation context */
  conversationId?: string
  /** Whether the operation was allowed */
  allowed: boolean
  /** Reason if denied */
  reason?: string
  /** Detected security issues */
  issues?: string[]
  /** Sanitized parameter keys (not values) */
  parameterKeys?: string[]
  /** Request fingerprint for correlation */
  requestId: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Dangerous patterns to detect in parameters
 * OWASP-based security patterns
 */
const DANGEROUS_PATTERNS: Array<{
  name: string
  pattern: RegExp
  severity: SecuritySeverity
  description: string
}> = [
  {
    name: 'sql_injection',
    pattern: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b.*\b(FROM|INTO|TABLE|WHERE)\b)|(--.*)|(;.*\b(SELECT|DROP|DELETE)\b)/i,
    severity: 'critical',
    description: 'SQL injection attempt detected'
  },
  {
    name: 'command_injection',
    pattern: /[;&|`$]|\$\(|\b(rm|wget|curl|bash|sh|nc|netcat)\b/i,
    severity: 'critical',
    description: 'Command injection attempt detected'
  },
  {
    name: 'path_traversal',
    pattern: /\.\.[\/\\]|\.\.%2[fF]|%2e%2e[\/\\]/,
    severity: 'high',
    description: 'Path traversal attempt detected'
  },
  {
    name: 'xss_attempt',
    pattern: /<script|javascript:|on\w+\s*=|<iframe|<object/i,
    severity: 'high',
    description: 'Cross-site scripting attempt detected'
  },
  {
    name: 'ldap_injection',
    pattern: /[()\\*]|\x00|\x0a|\x0d/,
    severity: 'medium',
    description: 'LDAP injection pattern detected'
  },
  {
    name: 'xxe_attempt',
    pattern: /<!DOCTYPE|<!ENTITY|SYSTEM\s+["']/i,
    severity: 'high',
    description: 'XML External Entity attempt detected'
  }
]

/**
 * Sensitive parameter names to mask in audit logs
 */
const SENSITIVE_PARAM_NAMES = new Set([
  'password',
  'secret',
  'token',
  'key',
  'apikey',
  'api_key',
  'credential',
  'auth',
  'authorization',
  'bearer',
  'session',
  'cookie',
  'ssn',
  'social_security',
  'credit_card',
  'card_number',
  'cvv',
  'pin'
])

/**
 * Rate limiting configuration per user per tool
 */
interface RateLimitConfig {
  /** Max calls per window */
  maxCalls: number
  /** Window duration in milliseconds */
  windowMs: number
  /** Warning threshold (percentage) */
  warningThreshold: number
}

/**
 * Default rate limit: 100 calls per 15 minutes per tool per user
 */
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxCalls: 100,
  windowMs: 15 * 60 * 1000, // 15 minutes
  warningThreshold: 0.8 // Warn at 80%
}

/**
 * Rate limit tracking storage
 * Key: `${userId}:${toolName}`
 */
const rateLimitTracker = new Map<string, {
  calls: number
  windowStart: number
}>()

/**
 * Generate a unique request ID for correlation
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `mcp_${timestamp}_${random}`
}

/**
 * Mask user ID for privacy in logs (show first 8 chars)
 */
function maskUserId(userId: string): string {
  if (!userId || userId.length <= 8) return userId
  return `${userId.substring(0, 8)}***`
}

/**
 * Validate parameters against dangerous patterns
 *
 * @returns Object with validation result and detected issues
 */
export function validateParameters(
  parameters: Record<string, unknown>
): { valid: boolean; issues: string[]; severity: SecuritySeverity } {
  const issues: string[] = []
  let maxSeverity: SecuritySeverity = 'low'

  const severityOrder: Record<SecuritySeverity, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3
  }

  // Recursively check all string values in parameters
  function checkValue(value: unknown, path: string): void {
    if (typeof value === 'string') {
      for (const { name, pattern, severity, description } of DANGEROUS_PATTERNS) {
        if (pattern.test(value)) {
          issues.push(`${description} in parameter '${path}'`)
          if (severityOrder[severity] > severityOrder[maxSeverity]) {
            maxSeverity = severity
          }
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => checkValue(item, `${path}[${index}]`))
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, val] of Object.entries(value)) {
        checkValue(val, `${path}.${key}`)
      }
    }
  }

  for (const [key, value] of Object.entries(parameters)) {
    // Skip internal context fields
    if (key.startsWith('_')) continue
    checkValue(value, key)
  }

  return {
    valid: issues.length === 0,
    issues,
    severity: issues.length > 0 ? maxSeverity : 'low'
  }
}

/**
 * Sanitize parameters for safe audit logging
 * Masks sensitive values while preserving structure
 */
export function sanitizeParametersForAudit(
  parameters: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(parameters)) {
    // Skip internal context (already logged separately)
    if (key.startsWith('_')) continue

    const lowerKey = key.toLowerCase()

    // Mask sensitive parameter values
    if (SENSITIVE_PARAM_NAMES.has(lowerKey)) {
      sanitized[key] = '[MASKED]'
    } else if (typeof value === 'string' && value.length > 100) {
      // Truncate long strings for log efficiency
      sanitized[key] = `${value.substring(0, 50)}...[truncated ${value.length} chars]`
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeParametersForAudit(value as Record<string, unknown>)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}

/**
 * Check and update rate limit for user + tool combination
 *
 * @returns Object with rate limit status
 */
export function checkRateLimit(
  userId: string,
  toolName: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): { allowed: boolean; current: number; max: number; warning: boolean; resetsAt: Date } {
  const key = `${userId}:${toolName}`
  const now = Date.now()

  let tracker = rateLimitTracker.get(key)

  // Reset window if expired
  if (!tracker || (now - tracker.windowStart) >= config.windowMs) {
    tracker = { calls: 0, windowStart: now }
    rateLimitTracker.set(key, tracker)
  }

  const current = tracker.calls + 1
  const warning = current >= config.maxCalls * config.warningThreshold
  const allowed = current <= config.maxCalls

  // Update call count
  tracker.calls = current
  rateLimitTracker.set(key, tracker)

  // Calculate reset time
  const resetsAt = new Date(tracker.windowStart + config.windowMs)

  return { allowed, current, max: config.maxCalls, warning, resetsAt }
}

/**
 * Create a security audit event
 */
export function createAuditEvent(
  eventType: SecurityEventType,
  severity: SecuritySeverity,
  toolName: string,
  serverId: string,
  userContext: UserContext,
  allowed: boolean,
  options?: {
    reason?: string
    issues?: string[]
    parameterKeys?: string[]
    metadata?: Record<string, unknown>
  }
): SecurityAuditEvent {
  return {
    eventType,
    severity,
    timestamp: new Date().toISOString(),
    toolName,
    serverId,
    userId: maskUserId(userContext.userId),
    businessId: userContext.businessId ? maskUserId(userContext.businessId) : undefined,
    conversationId: userContext.conversationId,
    allowed,
    reason: options?.reason,
    issues: options?.issues,
    parameterKeys: options?.parameterKeys,
    requestId: generateRequestId(),
    metadata: options?.metadata
  }
}

/**
 * Log security audit event
 * Uses appropriate log level based on severity
 */
export function logSecurityAudit(event: SecurityAuditEvent): void {
  switch (event.severity) {
    case 'critical':
      securityLog.error('SECURITY AUDIT - CRITICAL', event)
      break
    case 'high':
      securityLog.warn('SECURITY AUDIT - HIGH', event)
      break
    case 'medium':
      securityLog.warn('SECURITY AUDIT - MEDIUM', event)
      break
    default:
      securityLog.info('SECURITY AUDIT', event)
  }
}

/**
 * Perform full security audit for MCP tool call
 *
 * This is the main entry point for T074 security compliance.
 * Call this before executing any MCP tool.
 *
 * @returns Object with audit result and event
 */
export async function auditMcpToolCall(
  toolName: string,
  serverId: string,
  parameters: Record<string, unknown>,
  userContext: UserContext
): Promise<{
  allowed: boolean
  event: SecurityAuditEvent
  sanitizedParams: Record<string, unknown>
}> {
  // 1. Check rate limit
  const rateLimit = checkRateLimit(userContext.userId, toolName)

  if (!rateLimit.allowed) {
    const event = createAuditEvent(
      'rate_limit_exceeded',
      'high',
      toolName,
      serverId,
      userContext,
      false,
      {
        reason: `Rate limit exceeded: ${rateLimit.current}/${rateLimit.max} calls. Resets at ${rateLimit.resetsAt.toISOString()}`,
        metadata: {
          calls: rateLimit.current,
          maxCalls: rateLimit.max,
          resetsAt: rateLimit.resetsAt.toISOString()
        }
      }
    )
    logSecurityAudit(event)
    return { allowed: false, event, sanitizedParams: {} }
  }

  // Log rate limit warning
  if (rateLimit.warning) {
    const warningEvent = createAuditEvent(
      'rate_limit_warning',
      'medium',
      toolName,
      serverId,
      userContext,
      true,
      {
        reason: `Approaching rate limit: ${rateLimit.current}/${rateLimit.max} calls`,
        metadata: {
          calls: rateLimit.current,
          maxCalls: rateLimit.max
        }
      }
    )
    logSecurityAudit(warningEvent)
  }

  // 2. Validate parameters
  const validation = validateParameters(parameters)

  if (!validation.valid) {
    const event = createAuditEvent(
      'suspicious_pattern',
      validation.severity,
      toolName,
      serverId,
      userContext,
      false,
      {
        reason: 'Dangerous pattern detected in parameters',
        issues: validation.issues,
        parameterKeys: Object.keys(parameters).filter(k => !k.startsWith('_'))
      }
    )
    logSecurityAudit(event)
    return { allowed: false, event, sanitizedParams: {} }
  }

  // 3. Sanitize parameters for audit log
  const sanitizedParams = sanitizeParametersForAudit(parameters)

  // 4. Create success audit event
  const event = createAuditEvent(
    'tool_call_audit',
    'low',
    toolName,
    serverId,
    userContext,
    true,
    {
      parameterKeys: Object.keys(sanitizedParams),
      metadata: {
        rateLimitCalls: rateLimit.current,
        rateLimitMax: rateLimit.max
      }
    }
  )

  // Log successful audit (info level - dev only)
  logSecurityAudit(event)

  return { allowed: true, event, sanitizedParams }
}

/**
 * Log permission denied event (for T072 integration)
 */
export function logPermissionDenied(
  toolName: string,
  serverId: string,
  userContext: UserContext,
  reason: string
): void {
  const event = createAuditEvent(
    'permission_denied',
    'medium',
    toolName,
    serverId,
    userContext,
    false,
    { reason }
  )
  logSecurityAudit(event)
}

/**
 * Log validation failure event
 */
export function logValidationFailure(
  toolName: string,
  serverId: string,
  userContext: UserContext,
  reason: string
): void {
  const event = createAuditEvent(
    'validation_failure',
    'medium',
    toolName,
    serverId,
    userContext,
    false,
    { reason }
  )
  logSecurityAudit(event)
}

/**
 * Get current rate limit status for a user+tool (for monitoring)
 */
export function getRateLimitStatus(
  userId: string,
  toolName: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): { calls: number; max: number; remaining: number; resetsAt: Date | null } {
  const key = `${userId}:${toolName}`
  const tracker = rateLimitTracker.get(key)
  const now = Date.now()

  if (!tracker || (now - tracker.windowStart) >= config.windowMs) {
    return { calls: 0, max: config.maxCalls, remaining: config.maxCalls, resetsAt: null }
  }

  const resetsAt = new Date(tracker.windowStart + config.windowMs)
  return {
    calls: tracker.calls,
    max: config.maxCalls,
    remaining: Math.max(0, config.maxCalls - tracker.calls),
    resetsAt
  }
}

/**
 * Clear rate limit for a user (admin function)
 */
export function clearRateLimit(userId: string, toolName?: string): void {
  if (toolName) {
    rateLimitTracker.delete(`${userId}:${toolName}`)
  } else {
    // Clear all rate limits for user
    for (const key of rateLimitTracker.keys()) {
      if (key.startsWith(`${userId}:`)) {
        rateLimitTracker.delete(key)
      }
    }
  }
}
