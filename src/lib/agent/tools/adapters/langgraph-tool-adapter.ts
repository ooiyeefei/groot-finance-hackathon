/**
 * LangGraph Tool Adapter - Clean LangGraph Integration
 * Adapts the secure tool system for seamless LangGraph integration
 */

import { ToolFactory } from '../registry/tool-factory'
import { UserContext, ToolParameters, ToolResult } from '../base/tool-interfaces'

/**
 * LangGraph Tool Adapter
 * Provides a clean interface between LangGraph agents and the secure tool system
 */
export class LangGraphToolAdapter {
  private static toolFactory = ToolFactory.getInstance()

  /**
   * Execute a tool through the secure tool system
   * This is the primary interface for LangGraph agents
   */
  static async executeTool(
    toolName: string,
    parameters: ToolParameters,
    userContext: UserContext
  ): Promise<ToolResult> {
    console.log(`[LangGraphAdapter] Executing tool ${toolName} for user ${userContext.userId}`)
    
    try {
      const result = await this.toolFactory.executeTool(toolName, parameters, userContext)
      
      console.log(`[LangGraphAdapter] Tool ${toolName} execution result:`, {
        success: result.success,
        hasData: !!result.data,
        hasError: !!result.error,
        userId: userContext.userId
      })

      return result
    } catch (error) {
      console.error(`[LangGraphAdapter] Tool execution error for ${toolName}:`, error)
      
      return {
        success: false,
        error: `Tool adapter error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: {
          adapterId: 'langgraph-adapter',
          toolName,
          userId: userContext.userId,
          timestamp: new Date().toISOString()
        }
      }
    }
  }

  /**
   * Get available tools for LangGraph system prompts
   */
  static getAvailableTools(): string[] {
    return this.toolFactory.getAvailableTools()
  }

  /**
   * Get tool descriptions for LangGraph system prompts
   */
  static getToolDescriptions(): Record<string, string> {
    return this.toolFactory.getToolDescriptions()
  }

  /**
   * Validate that a tool name is supported
   */
  static isValidTool(toolName: string): boolean {
    return this.toolFactory.hasToolType(toolName)
  }

  /**
   * Generate system prompt fragment for available tools
   */
  static generateToolPrompt(): string {
    const toolDescriptions = this.getToolDescriptions()
    const availableTools = Object.entries(toolDescriptions)
      .map(([name, desc]) => `${name}: ${desc}`)
      .join('\n')

    return `Available Tools:
${availableTools}

When you need to use a tool, respond with JSON in this exact format:
{
  "tool_call": {
    "name": "tool_name",
    "parameters": {
      "query": "user's search query here"
    }
  },
  "reasoning": "Why you need to use this tool"
}`
  }

  /**
   * Parse tool call from LLM response
   */
  static parseToolCall(response: string): { toolName: string; parameters: ToolParameters; reasoning?: string } | null {
    try {
      const parsed = JSON.parse(response)
      
      if (!parsed.tool_call || !parsed.tool_call.name) {
        return null
      }

      return {
        toolName: parsed.tool_call.name,
        parameters: parsed.tool_call.parameters || {},
        reasoning: parsed.reasoning
      }
    } catch (error) {
      console.warn('[LangGraphAdapter] Failed to parse tool call:', error)
      return null
    }
  }

  /**
   * Format tool result for LangGraph message system
   */
  static formatToolResult(result: ToolResult): string {
    if (result.success) {
      return result.data || 'Tool executed successfully'
    } else {
      return result.error || 'Tool execution failed'
    }
  }

  /**
   * Health check for the adapter and underlying tools
   */
  static async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const toolHealth = await this.toolFactory.healthCheck()
      const toolValidation = await this.toolFactory.validateTools()
      
      const healthy = toolHealth.healthy && toolValidation.valid
      
      return {
        healthy,
        details: {
          toolFactory: toolHealth,
          toolValidation,
          availableTools: this.getAvailableTools(),
          timestamp: new Date().toISOString()
        }
      }
    } catch (error) {
      console.error('[LangGraphAdapter] Health check failed:', error)
      
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }
      }
    }
  }

  /**
   * Get adapter statistics
   */
  static getStats(): Record<string, any> {
    return {
      adapter: 'langgraph-tool-adapter',
      version: '1.0.0',
      toolFactory: this.toolFactory.getToolStats(),
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Validate user context format for LangGraph integration
   */
  static validateUserContext(userContext: any): userContext is UserContext {
    return (
      userContext &&
      typeof userContext === 'object' &&
      typeof userContext.userId === 'string' &&
      userContext.userId.length > 0
    )
  }

  /**
   * Create safe user context from LangGraph agent state
   */
  static createUserContext(userId: string, conversationId?: string): UserContext {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId provided to LangGraph adapter')
    }

    return {
      userId,
      conversationId
    }
  }
}