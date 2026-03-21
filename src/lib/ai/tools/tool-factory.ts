/**
 * Tool Factory with Dependency Injection
 * Centralized, secure tool registration and instantiation
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { DocumentSearchTool } from './document-search-tool'
import { TransactionLookupTool } from './transaction-lookup-tool'
import { GetVendorsTool } from './get-vendors-tool'
// CrossBorderTaxComplianceTool removed — deprecated
import { RegulatoryKnowledgeTool } from './regulatory-knowledge-tool'
// Category 3 Domain Intelligence Tools
import { DetectAnomaliesTool } from './detect-anomalies-tool'
import { AnalyzeCashFlowTool } from './analyze-cashflow-tool'
import { AnalyzeVendorRiskTool } from './analyze-vendor-risk-tool'
import { GetInsightTool } from './get-insight-tool'
// Invoice retrieval tools
import { GetInvoicesTool } from './get-invoices-tool'
import { GetSalesInvoicesTool } from './get-sales-invoices-tool'
// Manager cross-employee query tools
import { EmployeeExpenseTool } from './employee-expense-tool'
import { TeamSummaryTool } from './team-summary-tool'
// Finance admin/owner tools
import { ARSummaryTool } from './ar-summary-tool'
import { APAgingTool } from './ap-aging-tool'
import { BusinessTransactionsTool } from './business-transactions-tool'
// Trend analysis tools (031-multi-curr-history-analysis)
import { AnalyzeTrendsTool } from './analyze-trends-tool'
// Memory tools (029-dspy-mem0-activation)
import { MemoryStoreTool } from './memory/memory-store-tool'
import { MemorySearchTool } from './memory/memory-search-tool'
import { MemoryRecallTool } from './memory/memory-recall-tool'
import { MemoryForgetTool } from './memory/memory-forget-tool'
// Budget & manager team tools (031-budget-track-manager-team)
import { SetBudgetTool } from './set-budget-tool'
import { BudgetStatusTool } from './budget-status-tool'
import { LateApprovalsTool } from './late-approvals-tool'
import { TeamComparisonTool } from './team-comparison-tool'
// CFO copilot tools (031-cfo-copilot-tools)
import { GenerateReportTool } from './generate-report-tool'
// Receipt processing tool (031-chat-receipt-process)
import { ReceiptClaimTool } from './receipt-claim-tool'
// Chat-driven scheduled reports & bank reconciliation (031)
import { ScheduleReportTool } from './schedule-report-tool'
import { RunBankReconTool } from './run-bank-recon-tool'
import { AcceptReconMatchTool } from './accept-recon-match-tool'
import { ShowReconStatusTool } from './show-recon-status-tool'

export type ToolName =
  // Category 1-2: Data retrieval tools
  | 'search_documents'
  | 'get_transactions'
  | 'get_vendors'
  | 'searchRegulatoryKnowledgeBase'
  // Category 3: Domain intelligence tools (server-side analysis)
  | 'detect_anomalies'
  | 'analyze_cash_flow'
  | 'analyze_vendor_risk'
  | 'get_action_center_insight'
  // Invoice retrieval tools
  | 'get_invoices'
  | 'get_sales_invoices'
  // Manager cross-employee query tools
  | 'get_employee_expenses'
  | 'get_team_summary'
  // Finance admin/owner tools
  | 'get_ar_summary'
  | 'get_ap_aging'
  | 'get_business_transactions'
  // Trend analysis tools (031-multi-curr-history-analysis)
  | 'analyze_trends'
  // CFO copilot tools (031-cfo-copilot-tools)
  | 'generate_report_pdf'
  // Memory tools (029-dspy-mem0-activation)
  | 'memory_store'
  | 'memory_search'
  | 'memory_recall'
  | 'memory_forget'
  // Budget & manager team tools (031-budget-track-manager-team)
  | 'set_budget'
  | 'check_budget_status'
  | 'get_late_approvals'
  | 'compare_team_spending'
  // Receipt processing tool (031-chat-receipt-process)
  | 'create_expense_from_receipt'
  // Chat-driven scheduled reports & bank reconciliation (031)
  | 'schedule_report'
  | 'run_bank_reconciliation'
  | 'accept_recon_match'
  | 'show_recon_status'
  // Email + benchmarking MCP tools (031-chat-cross-biz-voice)
  | 'send_email_report'
  | 'compare_to_industry'
  | 'toggle_benchmarking'

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
    this.registerTool('searchRegulatoryKnowledgeBase', () => new RegulatoryKnowledgeTool())

    // Category 3: Domain Intelligence Tools
    // These perform server-side analysis and return structured insights
    // Following the Clockwise MCP model: "intelligence happens server-side"
    this.registerTool('detect_anomalies', () => new DetectAnomaliesTool())
    this.registerTool('analyze_cash_flow', () => new AnalyzeCashFlowTool())
    this.registerTool('analyze_vendor_risk', () => new AnalyzeVendorRiskTool())
    this.registerTool('get_action_center_insight', () => new GetInsightTool())

    // Invoice retrieval tools
    this.registerTool('get_invoices', () => new GetInvoicesTool())
    this.registerTool('get_sales_invoices', () => new GetSalesInvoicesTool())

    // Manager cross-employee query tools (require manager/finance_admin/owner role)
    this.registerTool('get_employee_expenses', () => new EmployeeExpenseTool())
    this.registerTool('get_team_summary', () => new TeamSummaryTool())

    // Finance admin/owner tools (business-wide financial data)
    this.registerTool('get_ar_summary', () => new ARSummaryTool())
    this.registerTool('get_ap_aging', () => new APAgingTool())
    this.registerTool('get_business_transactions', () => new BusinessTransactionsTool())

    // Trend analysis tools (031-multi-curr-history-analysis)
    this.registerTool('analyze_trends', () => new AnalyzeTrendsTool())

    // CFO copilot tools (031-cfo-copilot-tools)
    this.registerTool('generate_report_pdf', () => new GenerateReportTool())

    // Memory tools (029-dspy-mem0-activation)
    this.registerTool('memory_store', () => new MemoryStoreTool())
    this.registerTool('memory_search', () => new MemorySearchTool())
    this.registerTool('memory_recall', () => new MemoryRecallTool())
    this.registerTool('memory_forget', () => new MemoryForgetTool())

    // Budget & manager team tools (031-budget-track-manager-team)
    this.registerTool('set_budget', () => new SetBudgetTool())
    this.registerTool('check_budget_status', () => new BudgetStatusTool())
    this.registerTool('get_late_approvals', () => new LateApprovalsTool())
    this.registerTool('compare_team_spending', () => new TeamComparisonTool())

    // Receipt processing tool (031-chat-receipt-process)
    this.registerTool('create_expense_from_receipt', () => new ReceiptClaimTool())

    // Chat-driven scheduled reports & bank reconciliation (031)
    this.registerTool('schedule_report', () => new ScheduleReportTool())
    this.registerTool('run_bank_reconciliation', () => new RunBankReconTool())
    this.registerTool('accept_recon_match', () => new AcceptReconMatchTool())
    this.registerTool('show_recon_status', () => new ShowReconStatusTool())
  }

  /**
   * Tools that require manager/finance_admin/owner role.
   * These are excluded from tool schemas for regular employees.
   */
  private static readonly MANAGER_TOOLS: Set<ToolName> = new Set([
    'get_employee_expenses',
    'get_team_summary',
    'get_action_center_insight',
    'analyze_trends',
    // Budget & manager team tools (031-budget-track-manager-team)
    'set_budget',
    'check_budget_status',
    'get_late_approvals',
    'compare_team_spending',
    'analyze_cash_flow',  // CFO copilot: managers can view cash flow forecasts
    'generate_report_pdf',  // CFO copilot: managers can generate board reports
  ])

  /**
   * Tools that require finance_admin/owner role.
   * These expose business-wide financial data (invoices, anomalies, vendor risk).
   */
  private static readonly FINANCE_TOOLS: Set<ToolName> = new Set([
    'get_invoices',
    'get_sales_invoices',
    'detect_anomalies',
    'analyze_vendor_risk',
    'get_ar_summary',
    'get_ap_aging',
    'get_business_transactions',
    // 031: Bank recon tools (admin/manager only)
    'run_bank_reconciliation',
    'accept_recon_match',
    'show_recon_status',
    // NOTE: schedule_report is NOT here — it has granular RBAC
    // (employees can schedule expense_summary, but not financial reports)
    // 031-chat-cross-biz-voice: Email + benchmarking (finance_admin/owner only)
    'send_email_report',
    'compare_to_industry',
    'toggle_benchmarking',
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

    // DEFENSE-IN-DEPTH: Reject tool execution if user's role doesn't match the tool's tier
    const role = (userContext.role || '').toLowerCase()
    const tn = toolName as ToolName
    if (this.FINANCE_TOOLS.has(tn) && !['finance_admin', 'owner'].includes(role)) {
      console.warn(`[ToolFactory] RBAC DENIED: ${toolName} requires finance_admin/owner, user has role=${role}`)
      return {
        success: false,
        error: "Per your organization's access policy, financial reports like this are only available to Finance Admins and Business Owners. Please contact your admin if you need access to this data.",
        metadata: { rbacDenied: true, requiredTier: 'finance', userRole: role }
      }
    }
    if (this.MANAGER_TOOLS.has(tn) && !['manager', 'finance_admin', 'owner'].includes(role)) {
      console.warn(`[ToolFactory] RBAC DENIED: ${toolName} requires manager+, user has role=${role}`)
      return {
        success: false,
        error: "Per your organization's access policy, team data is only available to Managers, Finance Admins, and Business Owners. Please contact your admin if you need access.",
        metadata: { rbacDenied: true, requiredTier: 'manager', userRole: role }
      }
    }

    // RBAC: Restrict get_transactions for non-finance roles
    if (tn === 'get_transactions' && !['finance_admin', 'owner'].includes(role)) {
      const txnType = (parameters as Record<string, unknown>)?.transactionType as string | undefined
      if (txnType && ['Income', 'income', 'Revenue', 'revenue'].includes(txnType)) {
        console.warn(`[ToolFactory] RBAC DENIED: get_transactions(transactionType=${txnType}) blocked for role=${role}`)
        return {
          success: false,
          error: "Per your organization's access policy, revenue and income data is only available to Finance Admins and Business Owners. Please contact your admin if you need access.",
          metadata: { rbacDenied: true, requiredTier: 'finance', userRole: role }
        }
      }
    }

    try {
      // Create tool instance with dependency injection
      const toolFactory = this.tools.get(toolName as ToolName)!
      const tool = toolFactory()

      console.log(`[ToolFactory] Executing ${toolName} for user ${userContext.userId} (role: ${role})`)
      
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
      // SECURITY: Role unknown — return personal tools only (fail-closed)
      console.warn('[ToolFactory] No user role provided — restricting to personal tools only')
      return allSchemas.filter((schema) => {
        const toolName = schema.function?.name as ToolName
        return !this.MANAGER_TOOLS.has(toolName) && !this.FINANCE_TOOLS.has(toolName)
      })
    }

    const role = userRole.toLowerCase()

    if (['finance_admin', 'owner'].includes(role)) {
      // Finance admin / Owner: all tools (personal + manager + finance)
      return allSchemas
    }

    if (role === 'manager') {
      // Manager: personal + MANAGER_TOOLS (intentionally included), exclude FINANCE_TOOLS only.
      // MANAGER_TOOLS (get_employee_expenses, get_team_summary, get_action_center_insight)
      // are explicitly allowed for managers — do NOT add them to the exclusion filter here.
      return allSchemas.filter((schema) => {
        const toolName = schema.function?.name as ToolName
        return !this.FINANCE_TOOLS.has(toolName)
      })
    }

    // Employee role: personal tools only (exclude manager + finance tools)
    return allSchemas.filter((schema) => {
      const toolName = schema.function?.name as ToolName
      return !this.MANAGER_TOOLS.has(toolName) && !this.FINANCE_TOOLS.has(toolName)
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