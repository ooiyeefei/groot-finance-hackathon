/**
 * Memory Recall Tool (T023)
 * Retrieves all stored memories for a user to provide context enrichment
 * at the start of conversations or when context is needed.
 *
 * Security: Multi-tenant isolation via businessId/userId
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from '../base-tool'
import { callMCPToolFromAgent } from '../mcp-tool-wrapper'

interface MemoryRecallParameters {
  /** Optional category filter */
  category?: 'preference' | 'fact' | 'context' | 'instruction' | 'all'
  /** Maximum number of memories to retrieve */
  limit?: number
}

export class MemoryRecallTool extends BaseTool {
  getToolName(modelType: ModelType = 'openai'): string {
    return modelType === 'gemini' ? 'recall_user_memories' : 'memory_recall'
  }

  getDescription(modelType: ModelType = 'openai'): string {
    if (modelType === 'gemini') {
      return 'MEMORY RECALL tool for retrieving stored user facts, preferences, and context. Use at conversation start or when user context is needed.'
    } else {
      return 'Memory Recall Tool - Retrieve all stored memories about the user for context enrichment. Use this tool at the beginning of conversations or when you need to recall what you know about the user. Returns preferences, facts, context, and instructions previously stored.'
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
            category: {
              type: "string",
              enum: ["preference", "fact", "context", "instruction", "all"],
              description: "Filter memories by category. Use 'all' to retrieve all memories. Default: 'all'."
            },
            limit: {
              type: "integer",
              description: "Maximum number of memories to retrieve (1-50, default: 20)",
              minimum: 1,
              maximum: 50
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as MemoryRecallParameters

    // Validate category if provided
    if (params.category !== undefined) {
      const validCategories = ['preference', 'fact', 'context', 'instruction', 'all']
      if (!validCategories.includes(params.category)) {
        return { valid: false, error: `Category must be one of: ${validCategories.join(', ')}` }
      }
    }

    // Validate limit if provided
    if (params.limit !== undefined) {
      const limit = Number(params.limit)
      if (isNaN(limit) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
        return { valid: false, error: 'Limit must be an integer between 1 and 50' }
      }
    }

    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as MemoryRecallParameters

    return callMCPToolFromAgent('memory_recall', {
      category: params.category,
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

    // Memory recall requires business context
    if (!userContext.businessId) {
      console.error('[MemoryRecallTool] Missing business context - memory recall denied')
      return false
    }

    console.log(`[MemoryRecallTool] Memory recall access granted for business: ${userContext.businessId}`)
    return true
  }
}
