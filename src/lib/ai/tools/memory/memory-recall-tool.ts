/**
 * Memory Recall Tool (T023)
 * Retrieves all stored memories for a user to provide context enrichment
 * at the start of conversations or when context is needed.
 *
 * Security: Multi-tenant isolation via businessId/userId
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from '../base-tool'
import { mem0Service, Memory } from '../../agent/memory/mem0-service'

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
    const category = params.category || 'all'
    const limit = params.limit || 20

    try {
      console.log(`[MemoryRecallTool] Recalling memories for user ${userContext.userId}, category: ${category}`)

      // Check if memory service is available
      const isAvailable = await mem0Service.isAvailable()
      if (!isAvailable) {
        console.warn('[MemoryRecallTool] Memory service not available')
        return {
          success: true,
          data: 'No stored memories available. Memory service is currently unavailable.',
          metadata: { memoriesFound: 0 }
        }
      }

      // Validate business context
      if (!userContext.businessId) {
        console.error('[MemoryRecallTool] Missing business context')
        return {
          success: false,
          error: 'Missing business context for memory recall. Please ensure you are logged into a business account.'
        }
      }

      // Retrieve all user memories
      const memories = await mem0Service.getAllUserMemories(
        userContext.userId,
        userContext.businessId
      )

      if (!memories || memories.length === 0) {
        return {
          success: true,
          data: 'No stored memories found for this user. Information will be remembered as conversations progress.',
          metadata: { memoriesFound: 0, category }
        }
      }

      // Filter by category if specified
      let filteredMemories = memories
      if (category !== 'all') {
        filteredMemories = memories.filter(m =>
          m.metadata?.category === category
        )
      }

      // Apply limit
      filteredMemories = filteredMemories.slice(0, limit)

      if (filteredMemories.length === 0) {
        return {
          success: true,
          data: `No memories found in category '${category}'. Try using 'all' to see all stored memories.`,
          metadata: { memoriesFound: 0, category, totalMemories: memories.length }
        }
      }

      // Format memories for display
      const formattedMemories = this.formatMemories(filteredMemories)
      console.log(`[MemoryRecallTool] Retrieved ${filteredMemories.length} memories for user ${userContext.userId}`)

      return {
        success: true,
        data: `Retrieved ${filteredMemories.length} stored memories:\n\n${formattedMemories}`,
        metadata: {
          memoriesFound: filteredMemories.length,
          totalMemories: memories.length,
          category,
          userId: userContext.userId
        }
      }

    } catch (error) {
      console.error('[MemoryRecallTool] Execution error:', error)
      return {
        success: false,
        error: `Memory recall failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  /**
   * Format memories for human-readable output
   */
  private formatMemories(memories: Memory[]): string {
    return memories.map((memory, index) => {
      const category = (memory.metadata?.category as string) || 'general'
      const tags = memory.metadata?.tags as string[] | undefined
      const date = memory.created_at ? new Date(memory.created_at).toLocaleDateString() : 'Unknown date'

      let formatted = `${index + 1}. [${category.toUpperCase()}] ${memory.memory}`
      if (tags && tags.length > 0) {
        formatted += ` (tags: ${tags.join(', ')})`
      }
      formatted += ` - Stored: ${date}`

      return formatted
    }).join('\n')
  }

  /**
   * Format result data for display (required abstract method)
   */
  protected formatResultData(data: any[]): string {
    return this.formatMemories(data)
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
