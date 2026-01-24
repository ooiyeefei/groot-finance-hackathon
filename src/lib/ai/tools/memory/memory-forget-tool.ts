/**
 * Memory Forget Tool (T025)
 * Allows users to request removal of specific memories through the AI agent.
 * Supports both ID-based deletion and search-based deletion.
 *
 * Security: Multi-tenant isolation via businessId/userId
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from '../base-tool'
import { mem0Service } from '../../agent/memory/mem0-service'

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

    try {
      console.log(`[MemoryForgetTool] Processing forget request for user ${userContext.userId}`)

      // Check if memory service is available
      const isAvailable = await mem0Service.isAvailable()
      if (!isAvailable) {
        console.warn('[MemoryForgetTool] Memory service not available')
        return {
          success: false,
          error: 'Memory service is currently unavailable. Cannot delete memories at this time.'
        }
      }

      // Validate business context
      if (!userContext.businessId) {
        console.error('[MemoryForgetTool] Missing business context')
        return {
          success: false,
          error: 'Missing business context for memory deletion. Please ensure you are logged into a business account.'
        }
      }

      // Case 1: Delete by specific ID
      if (params.memoryId) {
        return await this.deleteById(params.memoryId, userContext)
      }

      // Case 2: Delete by search query
      if (params.searchQuery) {
        return await this.deleteBySearch(
          params.searchQuery,
          params.deleteAll || false,
          userContext
        )
      }

      return {
        success: false,
        error: 'No valid deletion criteria provided'
      }

    } catch (error) {
      console.error('[MemoryForgetTool] Execution error:', error)
      return {
        success: false,
        error: `Memory deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  /**
   * Delete a specific memory by ID
   */
  private async deleteById(memoryId: string, userContext: UserContext): Promise<ToolResult> {
    try {
      // First, verify the memory exists and belongs to this user
      const memory = await mem0Service.getMemory(memoryId)
      if (!memory) {
        return {
          success: false,
          error: `Memory with ID "${memoryId}" not found. It may have already been deleted.`
        }
      }

      // Verify ownership (memory should belong to this user)
      if (memory.user_id !== userContext.userId) {
        console.error(`[MemoryForgetTool] User ${userContext.userId} attempted to delete memory belonging to ${memory.user_id}`)
        return {
          success: false,
          error: 'Cannot delete this memory. It does not belong to your account.'
        }
      }

      // Delete the memory
      const deleted = await mem0Service.deleteMemory(memoryId)
      if (!deleted) {
        return {
          success: false,
          error: 'Failed to delete memory. Please try again.'
        }
      }

      console.log(`[MemoryForgetTool] Deleted memory ${memoryId} for user ${userContext.userId}`)

      return {
        success: true,
        data: `Successfully deleted the memory: "${memory.memory.substring(0, 100)}${memory.memory.length > 100 ? '...' : ''}"`,
        metadata: {
          deletedCount: 1,
          memoryId,
          userId: userContext.userId
        }
      }

    } catch (error) {
      console.error('[MemoryForgetTool] Delete by ID error:', error)
      return {
        success: false,
        error: `Failed to delete memory: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  /**
   * Delete memories by search query
   */
  private async deleteBySearch(
    searchQuery: string,
    deleteAll: boolean,
    userContext: UserContext
  ): Promise<ToolResult> {
    try {
      // Search for matching memories
      const memories = await mem0Service.searchMemories(
        searchQuery,
        userContext.userId,
        userContext.businessId!,
        deleteAll ? 10 : 1 // Limit to 10 if deleteAll, else just 1
      )

      if (!memories || memories.length === 0) {
        return {
          success: true,
          data: `No memories found matching "${searchQuery}". Nothing to delete.`,
          metadata: { deletedCount: 0, searchQuery }
        }
      }

      // Delete matching memories
      let deletedCount = 0
      const deletedSummaries: string[] = []

      for (const memory of memories) {
        // Verify ownership
        if (memory.user_id !== userContext.userId) {
          console.warn(`[MemoryForgetTool] Skipping memory ${memory.id} - different user`)
          continue
        }

        const deleted = await mem0Service.deleteMemory(memory.id)
        if (deleted) {
          deletedCount++
          deletedSummaries.push(memory.memory.substring(0, 50) + (memory.memory.length > 50 ? '...' : ''))
        }

        // Only delete first match if not deleteAll
        if (!deleteAll && deletedCount >= 1) {
          break
        }
      }

      if (deletedCount === 0) {
        return {
          success: false,
          error: 'Found matching memories but failed to delete them. Please try again.'
        }
      }

      console.log(`[MemoryForgetTool] Deleted ${deletedCount} memories for user ${userContext.userId}`)

      const summaryText = deletedSummaries.length > 3
        ? deletedSummaries.slice(0, 3).join('", "') + `" and ${deletedSummaries.length - 3} more`
        : deletedSummaries.join('", "')

      return {
        success: true,
        data: `Successfully deleted ${deletedCount} memory(ies) matching "${searchQuery}": "${summaryText}"`,
        metadata: {
          deletedCount,
          searchQuery,
          deleteAll,
          userId: userContext.userId
        }
      }

    } catch (error) {
      console.error('[MemoryForgetTool] Delete by search error:', error)
      return {
        success: false,
        error: `Failed to delete memories: ${error instanceof Error ? error.message : 'Unknown error'}`
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

    // Memory deletion requires business context
    if (!userContext.businessId) {
      console.error('[MemoryForgetTool] Missing business context - memory deletion denied')
      return false
    }

    console.log(`[MemoryForgetTool] Memory deletion access granted for business: ${userContext.businessId}`)
    return true
  }
}
