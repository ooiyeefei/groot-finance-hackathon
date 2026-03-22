/**
 * Memory Store Tool (T022) - WITH CONTRADICTION DETECTION
 *
 * Allows the AI agent to explicitly persist user facts and preferences
 * discovered during conversation for future context enrichment.
 *
 * Architecture (029-dspy-mem0-activation):
 * Frontend → MemoryStoreTool → Generate Embeddings → Convex storeMemory mutation
 *                                                    ↓
 *                                         Contradiction Detection (T025)
 *                                         LRU Eviction (T026)
 *                                                    ↓
 *                                         Return conflict or success
 *
 * Security: Multi-tenant isolation via businessId/userId
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from '../base-tool'
import { callMCPToolFromAgent } from '../mcp-tool-wrapper'

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

    return callMCPToolFromAgent('memory_store', {
      content: params.content,
      category: params.category,
      tags: params.tags,
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

    // Memory storage requires business context
    if (!userContext.businessId) {
      console.error('[MemoryStoreTool] Missing business context - memory storage denied')
      return false
    }

    console.log(`[MemoryStoreTool] Memory storage access granted for business: ${userContext.businessId}`)
    return true
  }
}
