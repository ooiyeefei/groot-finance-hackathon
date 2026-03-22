/**
 * Memory Forget Tool (T025)
 * Allows users to request removal of specific memories through the AI agent.
 * Supports both ID-based deletion and search-based deletion.
 *
 * Security: Multi-tenant isolation via businessId/userId
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from '../base-tool'
import { callMCPToolFromAgent } from '../mcp-tool-wrapper'

interface MemoryForgetParameters {
  /** Memory ID to delete (if known) */
  memoryId?: string
  /** Search query to find and delete memories */
  searchQuery?: string
  /** Whether to delete all matching memories (requires confirmation) */
  deleteAll?: boolean
}

export class MemoryForgetTool extends BaseTool {
  getToolName(modelType: ModelType = 'openai'): string {
    return modelType === 'gemini' ? 'forget_user_memory' : 'memory_forget'
  }

  getDescription(modelType: ModelType = 'openai'): string {
    if (modelType === 'gemini') {
      return 'MEMORY FORGET tool for removing stored user information. Use when user explicitly requests to forget specific information or preferences.'
    } else {
      return 'Memory Forget Tool - Remove stored memories by ID or search query. Use this tool when the user explicitly requests to forget specific information. IMPORTANT: Only use when user clearly asks to delete/forget/remove stored information. Requires either a memory ID or a search query to find memories to delete.'
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
            memoryId: {
              type: "string",
              description: "Specific memory ID to delete. Use this if you have the exact memory ID from a previous recall or search."
            },
            searchQuery: {
              type: "string",
              description: "Search query to find memories to delete. Example: 'currency preference' to find and delete memories about currency settings."
            },
            deleteAll: {
              type: "boolean",
              description: "If true and searchQuery is provided, delete all matching memories. Default: false (only deletes first match). Use with caution."
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as MemoryForgetParameters

    // Must provide either memoryId or searchQuery
    if (!params.memoryId && !params.searchQuery) {
      return { valid: false, error: 'Either memoryId or searchQuery is required to identify memories to delete' }
    }

    // Validate memoryId if provided
    if (params.memoryId !== undefined) {
      if (typeof params.memoryId !== 'string' || params.memoryId.trim().length === 0) {
        return { valid: false, error: 'memoryId must be a non-empty string' }
      }
    }

    // Validate searchQuery if provided
    if (params.searchQuery !== undefined) {
      if (typeof params.searchQuery !== 'string' || params.searchQuery.trim().length === 0) {
        return { valid: false, error: 'searchQuery must be a non-empty string' }
      }
      if (params.searchQuery.length > 500) {
        return { valid: false, error: 'searchQuery too long (max 500 characters)' }
      }
    }

    // Validate deleteAll
    if (params.deleteAll !== undefined && typeof params.deleteAll !== 'boolean') {
      return { valid: false, error: 'deleteAll must be a boolean' }
    }

    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as MemoryForgetParameters

    return callMCPToolFromAgent('memory_forget', {
      memory_id: params.memoryId,
      search_query: params.searchQuery,
      delete_all: params.deleteAll,
    }, userContext)
  }

  /**
   * Format result data for display (required abstract method)
   */
  protected formatResultData(data: any[]): string {
    return data.map((item, index) => `${index + 1}. ${item.memory || item}`).join('\n')
  }

  /**
   * Enhanced permission check with business context validation
   */
  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    const basePermission = await super.checkUserPermissions(userContext)
    if (!basePermission) {
      return false
    }

    // Memory deletion requires business context
    if (!userContext.businessId) {
      console.error('[MemoryForgetTool] Missing business context - memory deletion denied')
      return false
    }

    console.log(`[MemoryForgetTool] Memory deletion access granted for business: ${userContext.businessId}`)
    return true
  }
}
