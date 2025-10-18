/**
 * Search Parameter Security Validator
 * Prevents SQL injection and other malicious patterns in search queries
 */

export interface SearchValidationResult {
  isValid: boolean
  sanitizedValue: string
  error?: string
}

/**
 * Validate and sanitize search parameters to prevent SQL injection
 * @param searchValue - Raw search input from user
 * @param maxLength - Maximum allowed length (default: 100)
 * @returns Validation result with sanitized value
 */
export function validateSearchParameter(
  searchValue: string,
  maxLength: number = 100
): SearchValidationResult {

  // Check if search value exists
  if (!searchValue || typeof searchValue !== 'string') {
    return {
      isValid: false,
      sanitizedValue: '',
      error: 'Search parameter must be a non-empty string'
    }
  }

  // Check length limits
  if (searchValue.length > maxLength) {
    return {
      isValid: false,
      sanitizedValue: '',
      error: `Search parameter cannot exceed ${maxLength} characters`
    }
  }

  // Check for minimum length
  if (searchValue.trim().length < 1) {
    return {
      isValid: false,
      sanitizedValue: '',
      error: 'Search parameter cannot be empty'
    }
  }

  // Remove potentially dangerous characters and patterns
  let sanitized = searchValue.trim()

  // Block SQL injection patterns
  const sqlInjectionPatterns = [
    /['";]/g,           // SQL quotes and semicolons
    /--/g,              // SQL comments
    /\/\*/g,            // Block comments start
    /\*\//g,            // Block comments end
    /\bUNION\b/gi,      // UNION statements
    /\bSELECT\b/gi,     // SELECT statements
    /\bINSERT\b/gi,     // INSERT statements
    /\bUPDATE\b/gi,     // UPDATE statements
    /\bDELETE\b/gi,     // DELETE statements
    /\bDROP\b/gi,       // DROP statements
    /\bALTER\b/gi,      // ALTER statements
    /\bEXEC\b/gi,       // EXEC statements
    /\bEXECUTE\b/gi,    // EXECUTE statements
    /\bxp_\w+/gi,       // Extended stored procedures
    /\bsp_\w+/gi,       // System stored procedures
    /\\\\/g,            // Escaped backslashes
    /\x00/g,            // Null bytes
  ]

  // Check for SQL injection patterns
  for (const pattern of sqlInjectionPatterns) {
    if (pattern.test(sanitized)) {
      return {
        isValid: false,
        sanitizedValue: '',
        error: 'Search parameter contains potentially malicious content'
      }
    }
  }

  // Block wildcard injection attempts
  const wildcardPatterns = [
    /%{2,}/g,           // Multiple % characters
    /_{2,}/g,           // Multiple _ characters
    /[%_]{5,}/g,        // Long sequences of wildcards
  ]

  for (const pattern of wildcardPatterns) {
    if (pattern.test(sanitized)) {
      return {
        isValid: false,
        sanitizedValue: '',
        error: 'Search parameter contains too many wildcard characters'
      }
    }
  }

  // Escape special regex/like characters for safe usage
  // Only allow alphanumeric, spaces, hyphens, underscores, dots, and basic punctuation
  sanitized = sanitized.replace(/[^\w\s\-_.!@#$%^&*()+=\[\]{}|:;,.<>?]/g, '')

  // Limit consecutive spaces
  sanitized = sanitized.replace(/\s{2,}/g, ' ')

  // Final length check after sanitization
  if (sanitized.length === 0) {
    return {
      isValid: false,
      sanitizedValue: '',
      error: 'Search parameter contains no valid characters'
    }
  }

  return {
    isValid: true,
    sanitizedValue: sanitized
  }
}

/**
 * Create a safe ILIKE pattern for PostgreSQL queries
 * Properly escapes % and _ characters to prevent wildcard injection
 * @param searchValue - Sanitized search value
 * @returns Safe pattern for PostgreSQL ILIKE
 */
export function createSafeILikePattern(searchValue: string): string {
  // Escape existing % and _ characters in the search value
  const escaped = searchValue
    .replace(/%/g, '\\%')    // Escape literal % characters
    .replace(/_/g, '\\_')    // Escape literal _ characters

  // Wrap with wildcards for substring matching
  return `%${escaped}%`
}

/**
 * Validate multiple search parameters (for advanced search)
 * @param searchParams - Object containing search parameters
 * @returns Validation results for all parameters
 */
export function validateSearchParameters(
  searchParams: Record<string, string>
): Record<string, SearchValidationResult> {
  const results: Record<string, SearchValidationResult> = {}

  for (const [key, value] of Object.entries(searchParams)) {
    if (value) {
      results[key] = validateSearchParameter(value)
    }
  }

  return results
}

/**
 * Validate numeric search parameters (amounts, IDs, etc.)
 * @param value - Numeric search value
 * @param options - Validation options
 */
export function validateNumericSearch(
  value: string,
  options: {
    min?: number
    max?: number
    allowDecimals?: boolean
  } = {}
): SearchValidationResult {

  const { min = 0, max = Number.MAX_SAFE_INTEGER, allowDecimals = true } = options

  if (!value || typeof value !== 'string') {
    return {
      isValid: false,
      sanitizedValue: '',
      error: 'Numeric search parameter must be a string'
    }
  }

  // Remove any non-numeric characters except decimals and negative sign
  const sanitized = value.replace(/[^\d.-]/g, '')

  if (sanitized.length === 0) {
    return {
      isValid: false,
      sanitizedValue: '',
      error: 'Numeric search parameter contains no valid digits'
    }
  }

  // Validate number format
  const isValidNumber = allowDecimals
    ? /^-?\d+(\.\d+)?$/.test(sanitized)
    : /^-?\d+$/.test(sanitized)

  if (!isValidNumber) {
    return {
      isValid: false,
      sanitizedValue: '',
      error: 'Invalid numeric format'
    }
  }

  const numValue = parseFloat(sanitized)

  if (isNaN(numValue)) {
    return {
      isValid: false,
      sanitizedValue: '',
      error: 'Invalid numeric value'
    }
  }

  if (numValue < min || numValue > max) {
    return {
      isValid: false,
      sanitizedValue: '',
      error: `Numeric value must be between ${min} and ${max}`
    }
  }

  return {
    isValid: true,
    sanitizedValue: sanitized
  }
}

/**
 * Validate date search parameters
 * @param value - Date search value (ISO format expected)
 */
export function validateDateSearch(value: string): SearchValidationResult {
  if (!value || typeof value !== 'string') {
    return {
      isValid: false,
      sanitizedValue: '',
      error: 'Date search parameter must be a string'
    }
  }

  // Basic ISO date format validation
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/

  if (!isoDateRegex.test(value)) {
    return {
      isValid: false,
      sanitizedValue: '',
      error: 'Date must be in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)'
    }
  }

  // Validate the date is actually valid
  const date = new Date(value)
  if (isNaN(date.getTime())) {
    return {
      isValid: false,
      sanitizedValue: '',
      error: 'Invalid date value'
    }
  }

  // Check for reasonable date ranges (not too far in past or future)
  const now = new Date()
  const minDate = new Date('1900-01-01')
  const maxDate = new Date(now.getFullYear() + 10, 11, 31) // 10 years in future

  if (date < minDate || date > maxDate) {
    return {
      isValid: false,
      sanitizedValue: '',
      error: 'Date must be between 1900 and 10 years in the future'
    }
  }

  return {
    isValid: true,
    sanitizedValue: value
  }
}

/**
 * Security logger for search attempts
 */
export function logSuspiciousSearch(
  searchValue: string,
  userId?: string,
  ipAddress?: string
): void {
  console.warn('[Security] Suspicious search attempt detected:', {
    searchValue: searchValue.substring(0, 100), // Log first 100 chars only
    userId,
    ipAddress,
    timestamp: new Date().toISOString(),
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'server-side'
  })
}