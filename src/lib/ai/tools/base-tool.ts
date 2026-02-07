/**
 * Base Tool Abstract Class
 * Enforces security-first architecture with mandatory user context validation
 *
 * MIGRATED TO CONVEX (2026-01-03)
 * - Convex: Primary database for all operations
 * - AWS S3: File storage (via convex actions)
 */

import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import type { ConvexHttpClient } from 'convex/browser'

export interface UserContext {
  userId: string // Clerk user ID
  convexUserId?: string // Convex database user ID
  businessId?: string // Business ID for tenant isolation
  conversationId?: string
  role?: string // Business membership role (manager, finance_admin, owner, employee)
}

export interface ToolParameters {
  [key: string]: any
}

export interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface CitationData {
  id: string
  index: number
  source_name: string
  country: string
  section?: string
  pdf_url?: string
  page_number?: number
  text_coordinates?: BoundingBox
  content_snippet: string
  confidence_score: number
  official_url?: string
}

export interface ToolResult {
  toolName?: string
  success: boolean
  data?: any
  error?: string
  metadata?: Record<string, any>
  citations?: CitationData[]
  executionTime?: number
  debugInfo?: string
  errorType?: string
  timestamp?: string
}

export type ModelType = 'gemini' | 'openai'

export interface OpenAIToolSchema {
  type: "function"
  function: {
    name: string
    description: string
    parameters: {
      type: "object"
      properties: Record<string, any>
      required: string[]
    }
  }
}

/**
 * Abstract base class that enforces security patterns for all tools
 */
export abstract class BaseTool {
  // Convex client for database queries
  // CRITICAL: Must be authenticated for queries requiring ctx.auth.getUserIdentity()
  protected convex: ConvexHttpClient | null = null
  protected convexApi = api

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

      // SECURITY: Get complete user data from Convex including business context for proper tenant isolation
      try {
        const userProfile = await ensureUserProfile(userContext.userId)
        if (!userProfile) {
          return {
            success: false,
            error: 'Authentication failed: Unable to resolve user profile'
          }
        }

        // Enrich user context with business information for proper security validation
        userContext.convexUserId = userProfile.user_id
        userContext.businessId = userProfile.business_id || undefined

        console.log(`[${this.getToolName()}] Enhanced user context:`, {
          clerkUserId: userContext.userId,
          convexUserId: userProfile.user_id,
          businessId: userProfile.business_id
        })
      } catch (userDataError) {
        return {
          success: false,
          error: 'Authentication failed: Unable to resolve user data'
        }
      }

      // CRITICAL: Create authenticated Convex client for queries requiring ctx.auth.getUserIdentity()
      try {
        const { client: convexAuthClient } = await getAuthenticatedConvex()
        if (!convexAuthClient) {
          console.error(`[${this.getToolName()}] ❌ Convex authentication failed - no JWT token`)
          return {
            success: false,
            error: 'Authentication failed: Unable to create authenticated Convex connection'
          }
        }
        this.convex = convexAuthClient
        console.log(`[${this.getToolName()}] ✅ Convex authenticated client created`)
      } catch (convexAuthError) {
        console.error(`[${this.getToolName()}] ❌ Convex auth error:`, convexAuthError)
        return {
          success: false,
          error: 'Authentication failed: Unable to authenticate with Convex'
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

      // Execute the tool-specific logic with authenticated client
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
  abstract getToolName(modelType?: ModelType): string
  abstract getDescription(modelType?: ModelType): string
  abstract getToolSchema(modelType?: ModelType): OpenAIToolSchema
  protected abstract validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }>
  protected abstract executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult>

  /**
   * Default permission check - can be overridden by specific tools
   */
  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    try {
      console.log(`[${this.getToolName()}] Checking permissions for user: ${userContext.userId}`)

      // SECURITY: Use enhanced user context with business validation
      if (!userContext.convexUserId || !userContext.businessId) {
        console.warn(`[${this.getToolName()}] Missing enhanced user context - security validation failed`)
        return false
      }

      // Additional validation: User exists and has business context
      console.log(`[${this.getToolName()}] User validation passed:`, {
        clerkUserId: userContext.userId,
        convexUserId: userContext.convexUserId,
        businessId: userContext.businessId
      })
      return true
    } catch (error) {
      console.error(`[${this.getToolName()}] Permission check error:`, error)
      return false
    }
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