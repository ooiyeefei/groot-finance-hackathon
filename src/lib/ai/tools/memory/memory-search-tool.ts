/**
 * Memory Search Tool (T024)
 * Performs semantic search over stored memories to find relevant context
 * for specific queries or topics.
 *
 * Security: Multi-tenant isolation via businessId/userId
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from '../base-tool'
import { mem0Service, Memory } from '../../agent/memory/mem0-service'

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
    const query = params.query.trim()
    const limit = params.limit || 5

    try {
      console.log(`[MemorySearchTool] Searching memories for user ${userContext.userId}: "${query}"`)

      // Check if memory service is available
      const isAvailable = await mem0Service.isAvailable()
      if (!isAvailable) {
        console.warn('[MemorySearchTool] Memory service not available')
        return {
          success: true,
          data: 'No matching memories found. Memory service is currently unavailable.',
          metadata: { memoriesFound: 0 }
        }
      }

      // Validate business context
      if (!userContext.businessId) {
        console.error('[MemorySearchTool] Missing business context')
        return {
          success: false,
          error: 'Missing business context for memory search. Please ensure you are logged into a business account.'
        }
      }

      // Perform semantic search
      const memories = await mem0Service.searchMemories(
        query,
        userContext.userId,
        userContext.businessId,
        limit
      )

      if (!memories || memories.length === 0) {
        return {
          success: true,
          data: `No memories found matching "${query}". The user may not have shared relevant information yet.`,
          metadata: { memoriesFound: 0, query }
        }
      }

      // Format search results with relevance scores
      const formattedResults = this.formatSearchResults(memories, query)
      console.log(`[MemorySearchTool] Found ${memories.length} matching memories for user ${userContext.userId}`)

      return {
        success: true,
        data: `Found ${memories.length} relevant memories for "${query}":\n\n${formattedResults}`,
        metadata: {
          memoriesFound: memories.length,
          query,
          userId: userContext.userId
        }
      }

    } catch (error) {
      console.error('[MemorySearchTool] Execution error:', error)
      return {
        success: false,
        error: `Memory search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  /**
   * Format search results with relevance scores
   */
  private formatSearchResults(memories: Memory[], query: string): string {
    return memories.map((memory, index) => {
      const category = (memory.metadata?.category as string) || 'general'
      const tags = memory.metadata?.tags as string[] | undefined
      const score = memory.score !== undefined ? ` (relevance: ${(memory.score * 100).toFixed(0)}%)` : ''
      const date = memory.created_at ? new Date(memory.created_at).toLocaleDateString() : 'Unknown date'

      let formatted = `${index + 1}. [${category.toUpperCase()}]${score} ${memory.memory}`
      if (tags && tags.length > 0) {
        formatted += `\n   Tags: ${tags.join(', ')}`
      }
      formatted += `\n   Stored: ${date}`

      return formatted
    }).join('\n\n')
  }

  /**
   * Format result data for display (required abstract method)
   */
  protected formatResultData(data: any[]): string {
    return this.formatSearchResults(data, '')
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
