/**
 * Base Tool Abstract Class
 * Enforces security-first architecture with mandatory user context validation
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'

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

/**
 * Abstract base class that enforces security patterns for all tools
 */
export abstract class BaseTool {
  protected supabase: SupabaseClient

  constructor() {
    // Use RLS-enabled client (NOT createServiceSupabaseClient)
    this.supabase = createServerSupabaseClient()
  }

  /**
   * Public execute method with mandatory security validation
   */
  async execute(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    try {
      // CRITICAL: Validate user context is provided
      if (!userContext || !userContext.userId) {
        return {
          success: false,
          error: 'Unauthorized: User context required'
        }
      }

      // CRITICAL: Validate parameters
      const validationResult = await this.validateParameters(parameters)
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Invalid parameters: ${validationResult.error}`
        }
      }

      // CRITICAL: Check user permissions for this tool
      const hasPermission = await this.checkUserPermissions(userContext)
      if (!hasPermission) {
        return {
          success: false,
          error: 'Insufficient permissions for this operation'
        }
      }

      // Execute the tool-specific logic
      return await this.executeInternal(parameters, userContext)

    } catch (error) {
      console.error(`[${this.getToolName()}] Execution error:`, error)
      return {
        success: false,
        error: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  /**
   * Abstract methods that must be implemented by concrete tools
   */
  abstract getToolName(): string
  abstract getDescription(): string
  protected abstract validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }>
  protected abstract executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult>

  /**
   * Default permission check - can be overridden by specific tools
   */
  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    try {
      // Verify user exists and is active
      const { data: user, error } = await this.supabase
        .from('users')
        .select('id')
        .eq('id', userContext.userId)
        .single()

      if (error || !user) {
        console.warn(`[${this.getToolName()}] User validation failed:`, error)
        return false
      }

      return true
    } catch (error) {
      console.error(`[${this.getToolName()}] Permission check error:`, error)
      return false
    }
  }

  /**
   * Utility method to create RLS-enabled database queries
   */
  protected createSecureQuery<T = any>(tableName: string, userContext: UserContext) {
    return this.supabase
      .from(tableName)
      .select('*')
      .eq('user_id', userContext.userId) as any
  }

  /**
   * Utility method to safely format results
   */
  protected formatResult(data: any[], description: string): string {
    if (!data || data.length === 0) {
      return `No ${description} found.`
    }

    const summary = `Found ${data.length} ${description}${data.length === 1 ? '' : 's'}:\n\n`
    const maxResults = 5
    const displayData = data.slice(0, maxResults)
    
    return summary + this.formatResultData(displayData) + 
      (data.length > maxResults ? `\n\n... and ${data.length - maxResults} more results` : '')
  }

  /**
   * Abstract method for formatting tool-specific data
   */
  protected abstract formatResultData(data: any[]): string
}