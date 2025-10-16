/**
 * Centralized Error Sanitization System
 * Prevents information disclosure through error messages
 *
 * SECURITY PRINCIPLE: Never expose internal system details to clients
 */

import { NextResponse } from 'next/server'

export interface SanitizedError {
  success: false
  error: string
  code?: string
  details?: string[]
}

/**
 * Internal errors that should never be exposed to clients
 */
const SENSITIVE_ERROR_PATTERNS = [
  // Database errors
  /database/i,
  /postgres/i,
  /supabase/i,
  /connection/i,
  /constraint/i,
  /relation/i,
  /column/i,
  /table/i,

  // File system errors
  /ENOENT/i,
  /EACCES/i,
  /path/i,
  /directory/i,

  // Authentication/API keys
  /clerk/i,
  /api[_\s]?key/i,
  /token/i,
  /secret/i,
  /jwt/i,

  // Internal system details
  /node_modules/i,
  /src\//i,
  /\.ts:/i,
  /\.js:/i,
  /line \d+/i,
  /stack trace/i,

  // Network/Infrastructure
  /fetch failed/i,
  /network/i,
  /timeout/i,
  /redis/i,
  /qdrant/i
]

/**
 * Error codes for consistent client handling
 */
export const ERROR_CODES = {
  // Authentication/Authorization
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // Validation
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Business Logic
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',

  // Security
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // System
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // External Services
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR'
} as const

/**
 * Safe error messages that can be shown to users
 */
const SAFE_ERROR_MESSAGES: Record<string, string> = {
  [ERROR_CODES.AUTH_REQUIRED]: 'Authentication required',
  [ERROR_CODES.INSUFFICIENT_PERMISSIONS]: 'Insufficient permissions',
  [ERROR_CODES.INVALID_TOKEN]: 'Invalid or expired token',
  [ERROR_CODES.INVALID_INPUT]: 'Invalid input provided',
  [ERROR_CODES.MISSING_REQUIRED_FIELD]: 'Required field is missing',
  [ERROR_CODES.RESOURCE_NOT_FOUND]: 'Resource not found',
  [ERROR_CODES.DUPLICATE_RESOURCE]: 'Resource already exists',
  [ERROR_CODES.BUSINESS_RULE_VIOLATION]: 'Business rule violation',
  [ERROR_CODES.SECURITY_VIOLATION]: 'Security violation detected',
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded',
  [ERROR_CODES.SYSTEM_ERROR]: 'An internal system error occurred',
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable',
  [ERROR_CODES.EXTERNAL_SERVICE_ERROR]: 'External service error'
}

/**
 * Check if error message contains sensitive information
 */
function containsSensitiveInfo(message: string): boolean {
  return SENSITIVE_ERROR_PATTERNS.some(pattern => pattern.test(message))
}

/**
 * Sanitize error message for client consumption
 */
function sanitizeErrorMessage(error: unknown, fallbackMessage = 'An error occurred'): string {
  if (!error) return fallbackMessage

  const errorMessage = error instanceof Error ? error.message : String(error)

  // Check if error contains sensitive information
  if (containsSensitiveInfo(errorMessage)) {
    return fallbackMessage
  }

  // Return safe error message if it doesn't contain sensitive info
  return errorMessage
}

/**
 * Create sanitized error response for API endpoints
 */
export function createErrorResponse(
  error: unknown,
  statusCode = 500,
  errorCode?: keyof typeof ERROR_CODES,
  customMessage?: string,
  context?: string
): NextResponse {

  // Log detailed error server-side for debugging
  const timestamp = new Date().toISOString()
  const errorDetails = error instanceof Error ? {
    message: error.message,
    stack: error.stack,
    name: error.name
  } : { error: String(error) }

  console.error(`[Error Sanitizer] ${timestamp} ${context || 'API Error'}:`, errorDetails)

  // Determine safe message for client
  let clientMessage = customMessage

  if (!clientMessage && errorCode) {
    clientMessage = SAFE_ERROR_MESSAGES[errorCode]
  }

  if (!clientMessage) {
    clientMessage = sanitizeErrorMessage(error, 'An internal error occurred')
  }

  // Create sanitized response
  const response: SanitizedError = {
    success: false,
    error: clientMessage
  }

  // Add error code if provided
  if (errorCode) {
    response.code = errorCode
  }

  return NextResponse.json(response, { status: statusCode })
}

/**
 * Sanitize validation errors (preserve field-level info but sanitize messages)
 */
export function createValidationErrorResponse(
  validationErrors: Array<{ field: string; message: string }>,
  statusCode = 400
): NextResponse {

  console.error('[Error Sanitizer] Validation errors:', validationErrors)

  const sanitizedErrors = validationErrors.map(err => ({
    field: err.field,
    message: sanitizeErrorMessage(err.message, 'Invalid value')
  }))

  return NextResponse.json({
    success: false,
    error: 'Validation failed',
    code: ERROR_CODES.INVALID_INPUT,
    details: sanitizedErrors
  }, { status: statusCode })
}

/**
 * Wrapper for async API handlers with automatic error sanitization
 */
export function withErrorSanitization<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>,
  context?: string
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args)
    } catch (error) {
      return createErrorResponse(
        error,
        500,
        ERROR_CODES.SYSTEM_ERROR,
        undefined,
        context
      )
    }
  }
}

/**
 * Common error response builders for frequent scenarios
 */
export const ErrorResponses = {
  unauthorized: (message?: string) =>
    createErrorResponse(null, 401, ERROR_CODES.AUTH_REQUIRED, message || 'Authentication required'),

  forbidden: (message?: string) =>
    createErrorResponse(null, 403, ERROR_CODES.INSUFFICIENT_PERMISSIONS, message || 'Access denied'),

  notFound: (resource = 'Resource') =>
    createErrorResponse(null, 404, ERROR_CODES.RESOURCE_NOT_FOUND, `${resource} not found`),

  conflict: (message?: string) =>
    createErrorResponse(null, 409, ERROR_CODES.DUPLICATE_RESOURCE, message || 'Resource conflict'),

  rateLimit: (retryAfter?: number) => {
    const response = createErrorResponse(null, 429, ERROR_CODES.RATE_LIMIT_EXCEEDED, 'Rate limit exceeded')
    if (retryAfter) {
      response.headers.set('Retry-After', retryAfter.toString())
    }
    return response
  },

  validation: (field: string, message?: string) =>
    createValidationErrorResponse([{ field, message: message || 'Invalid value' }]),

  systemError: (context?: string) =>
    createErrorResponse(null, 500, ERROR_CODES.SYSTEM_ERROR, 'Internal system error', context),

  serviceUnavailable: (service?: string) =>
    createErrorResponse(null, 503, ERROR_CODES.SERVICE_UNAVAILABLE,
      service ? `${service} temporarily unavailable` : 'Service temporarily unavailable')
}

/**
 * Type guard for sanitized errors
 */
export function isSanitizedError(obj: any): obj is SanitizedError {
  return typeof obj === 'object' &&
         obj !== null &&
         obj.success === false &&
         typeof obj.error === 'string'
}