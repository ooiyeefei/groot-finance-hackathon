/**
 * Tool Interfaces, Types, Validation & Security
 * Centralized type definitions and validation for the secure tool system
 */

export interface UserContext {
  userId: string
  conversationId?: string
}

export interface ToolParameters {
  [key: string]: any
}

export interface ToolResult {
  success: boolean
  data?: string
  error?: string
  metadata?: Record<string, any>
}

export interface ToolValidationResult {
  valid: boolean
  error?: string
}

export interface SecurityCheckResult {
  authorized: boolean
  reason?: string
}

/**
 * Tool registry interface for dependency injection
 */
export interface IToolFactory {
  executeTool(toolName: string, parameters: ToolParameters, userContext: UserContext): Promise<ToolResult>
  getAvailableTools(): string[]
  hasToolType(name: string): boolean
  getToolDescriptions(): Record<string, string>
  validateTools(): Promise<{ valid: boolean; errors: string[] }>
}

/**
 * Base tool interface that all tools must implement
 */
export interface ITool {
  getToolName(): string
  getDescription(): string
  execute(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult>
}

/**
 * Security validation utilities
 */
export class SecurityValidator {
  /**
   * Validate user context is present and properly formatted
   */
  static validateUserContext(userContext: UserContext): SecurityCheckResult {
    if (!userContext || !userContext.userId) {
      return {
        authorized: false,
        reason: 'Missing user context'
      }
    }

    if (typeof userContext.userId !== 'string' || userContext.userId.length === 0) {
      return {
        authorized: false,
        reason: 'Invalid userId format'
      }
    }

    return { authorized: true }
  }

  /**
   * Validate tool parameters for security risks
   */
  static validateParameters(parameters: ToolParameters): ToolValidationResult {
    if (!parameters || typeof parameters !== 'object') {
      return { valid: false, error: 'Parameters must be an object' }
    }

    // Check for potential injection attacks
    const stringParams = JSON.stringify(parameters).toLowerCase()
    const suspiciousPatterns = [
      'drop table',
      'delete from',
      'update set',
      'insert into',
      '<script',
      'javascript:',
      'eval(',
      'function('
    ]

    for (const pattern of suspiciousPatterns) {
      if (stringParams.includes(pattern)) {
        return { valid: false, error: `Potentially unsafe parameter detected: ${pattern}` }
      }
    }

    return { valid: true }
  }

  /**
   * Sanitize string input to prevent injection attacks
   */
  static sanitizeString(input: string): string {
    if (typeof input !== 'string') return ''
    
    return input
      .replace(/[<>]/g, '') // Remove potential HTML
      .replace(/['"]/g, '') // Remove quotes that could break SQL/JS
      .replace(/[;&|`$]/g, '') // Remove shell injection chars
      .trim()
      .substring(0, 1000) // Limit length
  }

  /**
   * Validate query length and content
   */
  static validateQuery(query: string, maxLength: number = 500): ToolValidationResult {
    if (!query || typeof query !== 'string') {
      return { valid: false, error: 'Query must be a non-empty string' }
    }

    if (query.trim().length === 0) {
      return { valid: false, error: 'Query cannot be empty' }
    }

    if (query.length > maxLength) {
      return { valid: false, error: `Query too long (max ${maxLength} characters)` }
    }

    return { valid: true }
  }
}