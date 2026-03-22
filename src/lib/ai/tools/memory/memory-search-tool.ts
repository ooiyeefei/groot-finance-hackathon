/**
 * Memory Search Tool (T024)
 * Performs semantic search over stored memories to find relevant context
 * for specific queries or topics.
 *
 * Security: Multi-tenant isolation via businessId/userId
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from '../base-tool'
import { callMCPToolFromAgent } from '../mcp-tool-wrapper'

interface MemorySearchParameters {
  /** Search query for semantic matching */
  query: string
  /** Maximum number of results */
  limit?: number
}

export class MemorySearchTool extends BaseTool {
  getToolName(modelType: ModelType = 'openai'): string {
    return modelType === 'gemini' ? 'search_user_memories' : 'memory_search'
  }

  getDescription(modelType: ModelType = 'openai'): string {
    if (modelType === 'gemini') {
      return 'MEMORY SEARCH tool for finding relevant stored information about the user. Use semantic search to find memories related to a specific topic or query.'
    } else {
      return 'Memory Search Tool - Semantic search over stored user memories. Use this tool to find relevant previously stored information about specific topics. Example: searching for "currency preferences" returns memories about the user\'s currency settings and preferences.'
    }
  }

  getToolSchema(modelType: ModelType = 'openai'): OpenAIToolSchema {
    const toolName = this.getToolName(modelType)
    const description = this.getDescription(modelType)

    return {
      type: "function",
      function: {
        name: toolName,
        description,
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query to find relevant memories. Use descriptive terms. Examples: 'invoice processing workflow', 'currency preferences', 'reporting frequency'."
            },
            limit: {
              type: "integer",
              description: "Maximum number of results to return (1-20, default: 5)",
              minimum: 1,
              maximum: 20
            }
          },
          required: ["query"]
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as MemorySearchParameters

    // Validate query
    if (!params.query || typeof params.query !== 'string') {
      return { valid: false, error: 'Query parameter is required and must be a string' }
    }

    if (params.query.trim().length === 0) {
      return { valid: false, error: 'Query cannot be empty' }
    }

    if (params.query.length > 500) {
      return { valid: false, error: 'Query too long (max 500 characters)' }
    }

    // Validate limit if provided
    if (params.limit !== undefined) {
      const limit = Number(params.limit)
      if (isNaN(limit) || !Number.isInteger(limit) || limit < 1 || limit > 20) {
        return { valid: false, error: 'Limit must be an integer between 1 and 20' }
      }
    }

    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as MemorySearchParameters

    return callMCPToolFromAgent('memory_search', {
      query: params.query,
      limit: params.limit,
    }, userContext)
  }

  /**
   * Format result data for display (required abstract method)
   */
  protected formatResultData(data: any[]): string {
    return data.map((item, index) => `${index + 1}. ${item.content || item.memory || item}`).join('\n')
  }

  /**
   * Enhanced permission check with business context validation
   */
  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    const basePermission = await super.checkUserPermissions(userContext)
    if (!basePermission) {
      return false
    }

    // Memory search requires business context
    if (!userContext.businessId) {
      console.error('[MemorySearchTool] Missing business context - memory search denied')
      return false
    }

    console.log(`[MemorySearchTool] Memory search access granted for business: ${userContext.businessId}`)
    return true
  }
}
