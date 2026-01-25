/**
 * Memory Store Tool (T022)
 * Allows the AI agent to explicitly persist user facts and preferences
 * discovered during conversation for future context enrichment.
 *
 * Security: Multi-tenant isolation via businessId/userId
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from '../base-tool'
import { mem0Service, ConversationMessage } from '../../agent/memory/mem0-service'

interface MemoryStoreParameters {
  /** The fact or preference to store */
  content: string
  /** Category for organization: preference, fact, context, instruction */
  category: 'preference' | 'fact' | 'context' | 'instruction'
  /** Optional metadata tags for retrieval */
  tags?: string[]
}

export class MemoryStoreTool extends BaseTool {
  getToolName(modelType: ModelType = 'openai'): string {
    return modelType === 'gemini' ? 'store_user_memory' : 'memory_store'
  }

  getDescription(modelType: ModelType = 'openai'): string {
    if (modelType === 'gemini') {
      return 'MEMORY STORAGE tool for saving important user facts, preferences, and context. Use when user shares personal/business information worth remembering for future conversations.'
    } else {
      return 'Memory Storage Tool - Persist important user facts, preferences, and context for future conversations. Use this tool when the user shares information about their business, preferences, or important facts that should be remembered. Examples: "My company uses Thai Baht as home currency", "I prefer detailed explanations", "We process invoices weekly".'
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
            content: {
              type: "string",
              description: "The fact, preference, or context to remember. Should be a clear, standalone statement. Example: 'User prefers reports in Thai language' or 'Business processes 50+ invoices monthly'."
            },
            category: {
              type: "string",
              enum: ["preference", "fact", "context", "instruction"],
              description: "Category of memory: 'preference' for user preferences, 'fact' for business facts, 'context' for situational context, 'instruction' for how user wants to be helped."
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Optional tags for organization and retrieval. Examples: ['currency', 'reporting'], ['invoice', 'workflow']."
            }
          },
          required: ["content", "category"]
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as MemoryStoreParameters

    // Validate content
    if (!params.content || typeof params.content !== 'string') {
      return { valid: false, error: 'Content parameter is required and must be a string' }
    }

    if (params.content.trim().length === 0) {
      return { valid: false, error: 'Content cannot be empty' }
    }

    if (params.content.length > 1000) {
      return { valid: false, error: 'Content too long (max 1000 characters)' }
    }

    // Validate category
    const validCategories = ['preference', 'fact', 'context', 'instruction']
    if (!params.category || !validCategories.includes(params.category)) {
      return { valid: false, error: `Category must be one of: ${validCategories.join(', ')}` }
    }

    // Validate tags if provided
    if (params.tags !== undefined) {
      if (!Array.isArray(params.tags)) {
        return { valid: false, error: 'Tags must be an array of strings' }
      }
      if (params.tags.length > 10) {
        return { valid: false, error: 'Maximum 10 tags allowed' }
      }
      for (const tag of params.tags) {
        if (typeof tag !== 'string' || tag.length > 50) {
          return { valid: false, error: 'Each tag must be a string with max 50 characters' }
        }
      }
    }

    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as MemoryStoreParameters
    const content = params.content.trim()
    const category = params.category
    const tags = params.tags || []

    try {
      console.log(`[MemoryStoreTool] Storing memory for user ${userContext.userId}: ${category}`)

      // Check if memory service is available
      const isAvailable = await mem0Service.isAvailable()
      if (!isAvailable) {
        console.warn('[MemoryStoreTool] Memory service not available')
        return {
          success: false,
          error: 'Memory service is currently unavailable. The information was noted but could not be persisted.'
        }
      }

      // Validate business context
      if (!userContext.businessId) {
        console.error('[MemoryStoreTool] Missing business context')
        return {
          success: false,
          error: 'Missing business context for memory storage. Please ensure you are logged into a business account.'
        }
      }

      // Format as conversation message for Mem0
      // Mem0 will extract and deduplicate facts automatically
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: `Remember this ${category}: ${content}`
        },
        {
          role: 'assistant',
          content: `I'll remember that ${category} about you.`
        }
      ]

      // Store with metadata for categorization
      const result = await mem0Service.addConversationMemories(
        messages,
        userContext.userId,
        userContext.businessId,
        {
          category,
          tags,
          source: 'explicit_store',
          conversationId: userContext.conversationId
        }
      )

      if (!result) {
        return {
          success: false,
          error: 'Failed to store memory. Please try again.'
        }
      }

      const storedCount = result.results?.length || 0
      console.log(`[MemoryStoreTool] Stored ${storedCount} memory entries for user ${userContext.userId}`)

      return {
        success: true,
        data: `I've remembered this ${category}: "${content}"${tags.length > 0 ? ` (tagged: ${tags.join(', ')})` : ''}. I'll use this information to provide better assistance in future conversations.`,
        metadata: {
          memoriesStored: storedCount,
          category,
          tags,
          userId: userContext.userId
        }
      }

    } catch (error) {
      console.error('[MemoryStoreTool] Execution error:', error)
      return {
        success: false,
        error: `Memory storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
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

    // Memory storage requires business context
    if (!userContext.businessId) {
      console.error('[MemoryStoreTool] Missing business context - memory storage denied')
      return false
    }

    console.log(`[MemoryStoreTool] Memory storage access granted for business: ${userContext.businessId}`)
    return true
  }
}
