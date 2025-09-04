/**
 * Tool Factory with Dependency Injection
 * Centralized, secure tool registration and instantiation
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { DocumentSearchTool } from './document-search-tool'
import { TransactionLookupTool } from './transaction-lookup-tool'
import { GetVendorsTool } from './get-vendors-tool'
import { CrossBorderTaxComplianceTool } from './cross-border-tax-compliance-tool'
import { RegulatoryKnowledgeTool } from './regulatory-knowledge-tool'

export type ToolName = 'search_documents' | 'get_transactions' | 'get_vendors' | 'analyze_cross_border_compliance' | 'searchRegulatoryKnowledgeBase'

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
    this.registerTool('get_vendors', () => new GetVendorsTool())
    this.registerTool('analyze_cross_border_compliance', () => new CrossBorderTaxComplianceTool())
    this.registerTool('searchRegulatoryKnowledgeBase', () => new RegulatoryKnowledgeTool())
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
  static getToolDescriptions(modelType: ModelType = 'openai'): Record<ToolName, string> {
    const descriptions: Record<string, string> = {}
    
    for (const [name, factory] of this.tools.entries()) {
      try {
        const tool = factory()
        descriptions[name] = tool.getDescription(modelType)
      } catch (error) {
        console.error(`[ToolFactory] Error getting description for ${name}:`, error)
        descriptions[name] = 'Tool description unavailable'
      }
    }
    
    return descriptions as Record<ToolName, string>
  }

  /**
   * Generate OpenAI-compatible tool schemas for all registered tools
   * This is the new single source of truth for tool schemas
   */
  static getToolSchemas(modelType: ModelType = 'openai'): OpenAIToolSchema[] {
    const schemas: OpenAIToolSchema[] = []
    
    for (const [name, factory] of this.tools.entries()) {
      try {
        const tool = factory()
        const schema = tool.getToolSchema(modelType)
        
        // CRITICAL: Validate schema has required fields with comprehensive checks
        if (!schema) {
          console.error(`[ToolFactory] NULL SCHEMA for ${name}`)
          throw new Error(`Tool ${name} returned null schema`)
        }
        
        if (!schema.function || !schema.function.name) {
          console.error(`[ToolFactory] MISSING FUNCTION NAME for ${name}:`, JSON.stringify(schema, null, 2))
          throw new Error(`Tool ${name} schema missing function.name property`)
        }
        
        if (typeof schema.function.name !== 'string' || schema.function.name.trim().length === 0) {
          console.error(`[ToolFactory] INVALID FUNCTION NAME for ${name}:`, JSON.stringify(schema.function.name, null, 2))
          throw new Error(`Tool ${name} has invalid function name: ${schema.function.name}`)
        }
        
        // COMPREHENSIVE SCHEMA VALIDATION: Ensure all required SGLang/OpenAI fields are present
        const validatedSchema: OpenAIToolSchema = {
          type: "function",
          function: {
            name: schema.function.name.toString().trim(),
            description: schema.function.description || `${name} tool`,
            parameters: schema.function.parameters || {
              type: "object",
              properties: {},
              required: []
            }
          }
        }
        
        schemas.push(validatedSchema)
        console.log(`[ToolFactory] Generated valid schema for tool: ${name} (name: ${validatedSchema.function.name})`)
      } catch (error) {
        console.error(`[ToolFactory] Error generating schema for ${name}:`, error)
        // Continue with other tools, don't fail completely
      }
    }
    
    console.log(`[ToolFactory] Generated ${schemas.length} valid tool schemas dynamically`)
    
    // ADDITIONAL VALIDATION: Log all schemas for debugging
    schemas.forEach((schema, index) => {
      console.log(`[ToolFactory] Schema ${index}: ${schema.function?.name || 'MISSING NAME'}`)
    })
    
    return schemas
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

        // Validate schema generation
        try {
          const schema = tool.getToolSchema()
          if (!schema || !schema.function || !schema.function.name) {
            errors.push(`Tool ${name}: Invalid schema structure`)
          }
        } catch (error) {
          errors.push(`Tool ${name}: Schema generation failed - ${error}`)
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