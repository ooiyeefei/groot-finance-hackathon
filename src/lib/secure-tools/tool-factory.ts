/**
 * Tool Factory with Dependency Injection
 * Centralized, secure tool registration and instantiation
 */

import { BaseTool, UserContext, ToolParameters, ToolResult } from './base-tool'
import { DocumentSearchTool } from './document-search-tool'
import { TransactionLookupTool } from './transaction-lookup-tool'

export type ToolName = 'search_documents' | 'get_transactions'

/**
 * Tool Factory implementing dependency injection pattern
 */
export class ToolFactory {
  private static tools: Map<ToolName, () => BaseTool> = new Map()

  /**
   * Register all available tools
   */
  static {
    this.registerTool('search_documents', () => new DocumentSearchTool())
    this.registerTool('get_transactions', () => new TransactionLookupTool())
  }

  /**
   * Register a tool with the factory
   */
  private static registerTool(name: ToolName, factory: () => BaseTool): void {
    this.tools.set(name, factory)
  }

  /**
   * Get available tool names
   */
  static getAvailableTools(): ToolName[] {
    return Array.from(this.tools.keys())
  }

  /**
   * Check if a tool exists
   */
  static hasToolType(name: string): name is ToolName {
    return this.tools.has(name as ToolName)
  }

  /**
   * Execute a tool with full security validation
   */
  static async executeTool(
    toolName: string,
    parameters: ToolParameters,
    userContext: UserContext
  ): Promise<ToolResult> {
    // CRITICAL: Validate tool exists
    if (!this.hasToolType(toolName)) {
      return {
        success: false,
        error: `Unknown tool: ${toolName}`
      }
    }

    // CRITICAL: Validate user context
    if (!userContext || !userContext.userId) {
      return {
        success: false,
        error: 'Unauthorized: User context required'
      }
    }

    try {
      // Create tool instance with dependency injection
      const toolFactory = this.tools.get(toolName as ToolName)!
      const tool = toolFactory()

      console.log(`[ToolFactory] Executing ${toolName} for user ${userContext.userId}`)
      
      // Execute with security enforcement
      const result = await tool.execute(parameters, userContext)
      
      console.log(`[ToolFactory] Tool ${toolName} completed:`, { success: result.success })
      return result

    } catch (error) {
      console.error(`[ToolFactory] Tool execution error for ${toolName}:`, error)
      return {
        success: false,
        error: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  /**
   * Get tool information for LLM prompt generation
   */
  static getToolDescriptions(): Record<ToolName, string> {
    const descriptions: Record<string, string> = {}
    
    for (const [name, factory] of this.tools.entries()) {
      try {
        const tool = factory()
        descriptions[name] = tool.getDescription()
      } catch (error) {
        console.error(`[ToolFactory] Error getting description for ${name}:`, error)
        descriptions[name] = 'Tool description unavailable'
      }
    }
    
    return descriptions as Record<ToolName, string>
  }

  /**
   * Validate all registered tools
   */
  static async validateTools(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []
    
    for (const [name, factory] of this.tools.entries()) {
      try {
        const tool = factory()
        
        // Basic validation checks
        if (!tool.getToolName()) {
          errors.push(`Tool ${name}: Missing tool name`)
        }
        
        if (!tool.getDescription()) {
          errors.push(`Tool ${name}: Missing description`)
        }
        
      } catch (error) {
        errors.push(`Tool ${name}: Failed to instantiate - ${error}`)
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    }
  }
}