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
// Category 3 Domain Intelligence Tools
import { DetectAnomaliesTool } from './detect-anomalies-tool'
import { AnalyzeCashFlowTool } from './analyze-cashflow-tool'
import { AnalyzeVendorRiskTool } from './analyze-vendor-risk-tool'
import { GetInsightTool } from './get-insight-tool'
// Manager cross-employee query tools
import { EmployeeExpenseTool } from './employee-expense-tool'
import { TeamSummaryTool } from './team-summary-tool'

export type ToolName =
  // Category 1-2: Data retrieval tools
  | 'search_documents'
  | 'get_transactions'
  | 'get_vendors'
  | 'analyze_cross_border_compliance'
  | 'searchRegulatoryKnowledgeBase'
  // Category 3: Domain intelligence tools (server-side analysis)
  | 'detect_anomalies'
  | 'analyze_cash_flow'
  | 'analyze_vendor_risk'
  | 'get_action_center_insight'
  // Manager cross-employee query tools
  | 'get_employee_expenses'
  | 'get_team_summary'

/**
 * Tool Factory implementing dependency injection pattern
 */
export class ToolFactory {
  private static tools: Map<ToolName, () => BaseTool> = new Map()

  /**
   * Register all available tools
   */
  static {
    // Category 1-2: Data retrieval tools
    this.registerTool('search_documents', () => new DocumentSearchTool())
    this.registerTool('get_transactions', () => new TransactionLookupTool())
    this.registerTool('get_vendors', () => new GetVendorsTool())
    this.registerTool('analyze_cross_border_compliance', () => new CrossBorderTaxComplianceTool())
    this.registerTool('searchRegulatoryKnowledgeBase', () => new RegulatoryKnowledgeTool())

    // Category 3: Domain Intelligence Tools
    // These perform server-side analysis and return structured insights
    // Following the Clockwise MCP model: "intelligence happens server-side"
    this.registerTool('detect_anomalies', () => new DetectAnomaliesTool())
    this.registerTool('analyze_cash_flow', () => new AnalyzeCashFlowTool())
    this.registerTool('analyze_vendor_risk', () => new AnalyzeVendorRiskTool())
    this.registerTool('get_action_center_insight', () => new GetInsightTool())

    // Manager cross-employee query tools (require manager/finance_admin/owner role)
    this.registerTool('get_employee_expenses', () => new EmployeeExpenseTool())
    this.registerTool('get_team_summary', () => new TeamSummaryTool())
  }

  /**
   * Tools that require manager/finance_admin/owner role.
   * These are excluded from tool schemas for regular employees.
   */
  private static readonly MANAGER_TOOLS: Set<ToolName> = new Set([
    'get_employee_expenses',
    'get_team_summary',
  ])

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
   * Get a tool instance by name
   */
  static getTool(name: string): BaseTool | null {
    if (!this.hasToolType(name)) {
      return null
    }
    
    const toolFactory = this.tools.get(name as ToolName)!
    return toolFactory()
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
      // ENHANCED ERROR HANDLING: Classify errors and provide appropriate responses
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[ToolFactory] TOOL EXECUTION ERROR for ${toolName}:`, {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : 'No stack trace',
        userContext: { userId: userContext.userId, businessId: userContext.businessId },
        parameters: JSON.stringify(parameters, null, 2),
        timestamp: new Date().toISOString()
      })

      // ERROR CLASSIFICATION: Provide user-friendly messages based on error type
      let userMessage = 'I encountered an error while processing your request.'
      let debugInfo = errorMessage

      if (errorMessage.includes('Authentication') || errorMessage.includes('Unauthorized')) {
        userMessage = 'You are not authorized to access this information. Please check your login status.'
        debugInfo = 'Authentication/Authorization error'
      } else if (errorMessage.includes('Network') || errorMessage.includes('ENOTFOUND') || errorMessage.includes('fetch failed')) {
        userMessage = 'I\'m experiencing connectivity issues. Please try again in a moment.'
        debugInfo = 'Network connectivity error'
      } else if (errorMessage.includes('Invalid') || errorMessage.includes('Validation')) {
        userMessage = 'The request parameters are invalid. Please check your query and try again.'
        debugInfo = `Parameter validation error: ${errorMessage}`
      } else if (errorMessage.includes('Missing user context') || errorMessage.includes('business ID required')) {
        userMessage = 'Missing required business context. Please ensure you are logged into a business account.'
        debugInfo = 'Business context validation error'
      } else if (errorMessage.includes('No transactions found') || errorMessage.includes('No results')) {
        userMessage = 'No matching data found for your query. Try adjusting your search criteria.'
        debugInfo = 'Empty result set (valid)'
      } else if (errorMessage.includes('Database') || errorMessage.includes('Query') || errorMessage.includes('SQL')) {
        userMessage = 'I\'m having trouble accessing your data right now. Please try again shortly.'
        debugInfo = `Database access error: ${errorMessage}`
      }

      return {
        success: false,
        error: userMessage,
        debugInfo: debugInfo,
        errorType: 'tool_execution_error',
        toolName: toolName,
        timestamp: new Date().toISOString()
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
   * Generate tool schemas filtered by user role.
   *
   * - Manager: all tools (existing + get_employee_expenses + get_team_summary)
   * - Finance admin / Owner: all tools
   * - Employee: all tools EXCEPT manager tools (shouldn't reach here per spec, but defensive)
   *
   * Falls back to getToolSchemas() if role cannot be determined.
   */
  static getToolSchemasForRole(
    modelType: ModelType = 'openai',
    userRole?: string
  ): OpenAIToolSchema[] {
    const allSchemas = this.getToolSchemas(modelType)

    if (!userRole) {
      // Role unknown — return all tools (backward compatible)
      return allSchemas
    }

    const role = userRole.toLowerCase()

    if (['manager', 'finance_admin', 'owner'].includes(role)) {
      // Manager+ roles: get all tools including manager-specific ones
      return allSchemas
    }

    // Employee role: exclude manager-specific tools
    return allSchemas.filter((schema) => {
      const toolName = schema.function?.name
      return !this.MANAGER_TOOLS.has(toolName as ToolName)
    })
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