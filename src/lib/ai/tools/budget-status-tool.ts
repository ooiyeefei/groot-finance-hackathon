/**
 * Budget Status Tool
 *
 * Checks budget utilization status across expense categories.
 * Shows spending vs budget limits with visual status indicators.
 * Used for queries like: "What is our budget status?" or "How is Travel spending?"
 *
 * Authorization: manager, finance_admin, owner
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { callMCPToolFromAgent } from './mcp-tool-wrapper'

interface BudgetStatusParameters {
  category?: string
  period?: string
}

export class BudgetStatusTool extends BaseTool {
  getToolName(_modelType: ModelType = 'openai'): string {
    return 'check_budget_status'
  }

  getDescription(_modelType: ModelType = 'openai'): string {
    return "Check budget utilization status across expense categories. Shows spending vs configured budget limits with visual status indicators. Use when a manager asks 'What is our budget status?' or 'How is Travel spending vs budget?'. If no budgets are configured, the response will indicate this — you should then proactively offer to help the manager set up budgets using the set_budget tool."
  }

  getToolSchema(_modelType: ModelType = 'openai'): OpenAIToolSchema {
    return {
      type: "function",
      function: {
        name: this.getToolName(_modelType),
        description: this.getDescription(_modelType),
        parameters: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "Optional: filter to a specific expense category name (e.g., 'Travel', 'Meals'). Case-insensitive. If omitted, returns all budgeted categories."
            },
            period: {
              type: "string",
              description: "Budget period in YYYY-MM format (e.g., '2026-03'). Defaults to the current month if not specified."
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as BudgetStatusParameters

    if (params.period && !/^\d{4}-\d{2}$/.test(params.period)) {
      return { valid: false, error: 'period must be in YYYY-MM format (e.g., 2026-03)' }
    }

    return { valid: true }
  }

  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    const allowedRoles = ['manager', 'finance_admin', 'owner']
    if (!userContext.role || !allowedRoles.includes(userContext.role)) {
      console.warn(`[BudgetStatusTool] Insufficient role: ${userContext.role}`)
      return false
    }
    return super.checkUserPermissions(userContext)
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    // 032-mcp-first: Delegate to MCP server (single source of truth)
    return callMCPToolFromAgent('check_budget_status', {
      category: parameters.category,
      period: parameters.period,
    }, userContext)
  }

  /**
   * Render a simple text-based utilization bar
   */
  private renderUtilizationBar(utilization: number): string {
    const totalBlocks = 10
    const filledBlocks = Math.min(totalBlocks, Math.round((utilization / 100) * totalBlocks))
    const emptyBlocks = totalBlocks - filledBlocks
    return '[' + '='.repeat(filledBlocks) + '-'.repeat(emptyBlocks) + ']'
  }

  protected formatResultData(data: any[]): string {
    return data.map((item, index) => {
      return `${index + 1}. ${item.categoryName}: ${item.spent.toFixed(2)} / ${item.budgetLimit.toFixed(2)} (${item.utilization}%) [${item.status}]`
    }).join('\n')
  }
}
