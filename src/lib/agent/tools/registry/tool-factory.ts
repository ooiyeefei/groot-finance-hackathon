/**
 * Tool Factory - DI Container & Tool Management
 * Centralized, secure tool registration and instantiation with dependency injection
 */

import { 
  UserContext, 
  ToolParameters, 
  ToolResult, 
  IToolFactory, 
  ITool,
  SecurityValidator 
} from '../base/tool-interfaces'
import { DocumentSearchTool } from '../implementations/document-search-tool'
import { TransactionLookupTool } from '../implementations/transaction-lookup-tool'

export type ToolName = 'search_documents' | 'get_transactions'

/**
 * Tool Factory implementing dependency injection pattern with security enforcement
 */
export class ToolFactory implements IToolFactory {
  private static instance: ToolFactory
  private tools: Map<ToolName, () => ITool> = new Map()

  private constructor() {
    this.registerTools()
  }

  /**
   * Singleton pattern for global tool factory
   */
  static getInstance(): ToolFactory {
    if (!ToolFactory.instance) {
      ToolFactory.instance = new ToolFactory()
    }
    return ToolFactory.instance
  }

  /**
   * Register all available tools with their factory functions
   */
  private registerTools(): void {
    this.tools.set('search_documents', () => new DocumentSearchTool())
    this.tools.set('get_transactions', () => new TransactionLookupTool())

    console.log('[ToolFactory] Registered tools:', Array.from(this.tools.keys()))
  }

  /**
   * Get available tool names
   */
  getAvailableTools(): ToolName[] {
    return Array.from(this.tools.keys())
  }

  /**
   * Check if a tool exists
   */
  hasToolType(name: string): name is ToolName {
    return this.tools.has(name as ToolName)
  }

  /**
   * Execute a tool with full security validation
   */
  async executeTool(
    toolName: string,
    parameters: ToolParameters,
    userContext: UserContext
  ): Promise<ToolResult> {
    const startTime = Date.now()

    try {
      // CRITICAL: Validate tool exists
      if (!this.hasToolType(toolName)) {
        console.error(`[ToolFactory] Unknown tool requested: ${toolName}`)
        return {
          success: false,
          error: `Unknown tool: ${toolName}`
        }
      }

      // CRITICAL: Validate user context
      const contextValidation = SecurityValidator.validateUserContext(userContext)
      if (!contextValidation.authorized) {
        console.error(`[ToolFactory] Invalid user context for tool ${toolName}:`, contextValidation.reason)
        return {
          success: false,
          error: `Unauthorized: ${contextValidation.reason}`
        }
      }

      // CRITICAL: Global parameter security validation
      const paramValidation = SecurityValidator.validateParameters(parameters)
      if (!paramValidation.valid) {
        console.error(`[ToolFactory] Invalid parameters for tool ${toolName}:`, paramValidation.error)
        return {
          success: false,
          error: `Invalid parameters: ${paramValidation.error}`
        }
      }

      // Create tool instance with dependency injection
      const toolFactory = this.tools.get(toolName as ToolName)!
      const tool = toolFactory()

      console.log(`[ToolFactory] Executing ${toolName} for user ${userContext.userId}`)
      
      // Execute with security enforcement
      const result = await tool.execute(parameters, userContext)
      
      const duration = Date.now() - startTime
      console.log(`[ToolFactory] Tool ${toolName} completed in ${duration}ms:`, { 
        success: result.success,
        userId: userContext.userId,
        resultLength: result.data?.length || 0
      })

      return {
        ...result,
        metadata: {
          ...result.metadata,
          executionTime: duration,
          toolName,
          timestamp: new Date().toISOString()
        }
      }

    } catch (error) {
      const duration = Date.now() - startTime
      console.error(`[ToolFactory] Tool execution error for ${toolName} (${duration}ms):`, error)
      
      return {
        success: false,
        error: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: {
          executionTime: duration,
          toolName,
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  /**
   * Get tool descriptions for LLM prompt generation
   */
  getToolDescriptions(): Record<ToolName, string> {
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
  async validateTools(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []
    
    console.log('[ToolFactory] Validating all registered tools...')
    
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

        if (tool.getToolName() !== name) {
          errors.push(`Tool ${name}: Tool name mismatch (expected: ${name}, got: ${tool.getToolName()})`)
        }
        
        console.log(`[ToolFactory] Tool ${name} validation passed`)
        
      } catch (error) {
        const errorMsg = `Tool ${name}: Failed to instantiate - ${error}`
        errors.push(errorMsg)
        console.error(`[ToolFactory] ${errorMsg}`)
      }
    }
    
    const isValid = errors.length === 0
    console.log(`[ToolFactory] Tool validation ${isValid ? 'passed' : 'failed'}:`, {
      totalTools: this.tools.size,
      errors: errors.length
    })
    
    return {
      valid: isValid,
      errors
    }
  }

  /**
   * Health check for all tools
   */
  async healthCheck(): Promise<{ healthy: boolean; status: Record<string, boolean> }> {
    const status: Record<string, boolean> = {}
    let allHealthy = true

    for (const [name, factory] of this.tools.entries()) {
      try {
        const tool = factory()
        // Basic instantiation check
        status[name] = !!(tool.getToolName() && tool.getDescription())
        if (!status[name]) allHealthy = false
      } catch (error) {
        status[name] = false
        allHealthy = false
        console.error(`[ToolFactory] Health check failed for ${name}:`, error)
      }
    }

    return { healthy: allHealthy, status }
  }

  /**
   * Get tool usage statistics (could be enhanced with persistence)
   */
  getToolStats(): Record<string, any> {
    return {
      registeredTools: this.tools.size,
      availableTools: this.getAvailableTools(),
      lastHealthCheck: new Date().toISOString()
    }
  }
}