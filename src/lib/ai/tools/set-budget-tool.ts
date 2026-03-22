/**
 * Set Budget Tool
 *
 * Enables managers to set, update, or remove monthly budget limits for expense categories.
 * Used for queries like: "Set Travel budget to RM 5000" or "Remove the Travel budget"
 *
 * Authorization: manager, finance_admin, owner
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { callMCPToolFromAgent } from './mcp-tool-wrapper'

interface SetBudgetParameters {
  category_name: string
  monthly_limit: number
  currency?: string
}

export class SetBudgetTool extends BaseTool {
  getToolName(_modelType: ModelType = 'openai'): string {
    return 'set_budget'
  }

  getDescription(_modelType: ModelType = 'openai'): string {
    return "Set, update, or remove a monthly budget limit for an expense category. Use when a manager says 'Set Travel budget to RM 5000' or 'Remove the Travel budget'."
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
            category_name: {
              type: "string",
              description: "Name of the expense category (e.g., 'Travel', 'Meals', 'Office Supplies'). Case-insensitive match against existing categories."
            },
            monthly_limit: {
              type: "number",
              description: "Budget amount. Use a value greater than 0 to set/update the limit, or 0 to remove the budget limit."
            },
            currency: {
              type: "string",
              description: "ISO 4217 currency code (e.g., 'MYR', 'SGD', 'USD'). Defaults to the business home currency if not specified."
            }
          },
          required: ["category_name", "monthly_limit"]
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as SetBudgetParameters

    if (!params.category_name || typeof params.category_name !== 'string' || params.category_name.trim().length === 0) {
      return { valid: false, error: 'category_name is required and must be a non-empty string' }
    }

    if (params.monthly_limit === undefined || params.monthly_limit === null || typeof params.monthly_limit !== 'number') {
      return { valid: false, error: 'monthly_limit is required and must be a number' }
    }

    if (params.monthly_limit < 0) {
      return { valid: false, error: 'monthly_limit must be 0 (to remove) or a positive number (to set/update)' }
    }

    if (params.currency && (typeof params.currency !== 'string' || !/^[A-Z]{3}$/.test(params.currency))) {
      return { valid: false, error: 'currency must be a valid ISO 4217 currency code (e.g., MYR, SGD, USD)' }
    }

    return { valid: true }
  }

  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    // Only managers, finance_admins, and owners can set budgets
    const allowedRoles = ['manager', 'finance_admin', 'owner']
    if (!userContext.role || !allowedRoles.includes(userContext.role)) {
      console.warn(`[SetBudgetTool] Insufficient role: ${userContext.role}`)
      return false
    }
    return super.checkUserPermissions(userContext)
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    // 032-mcp-first: Delegate to MCP server (single source of truth)
    return callMCPToolFromAgent('set_budget', {
      category_name: parameters.category_name,
      monthly_limit: parameters.monthly_limit,
      currency: parameters.currency,
    }, userContext)
  }

  protected formatResultData(data: any[]): string {
    return data.map((item, index) => {
      return `${index + 1}. ${item.categoryName}: ${item.action} — ${item.newLimit ? `${item.newLimit} ${item.currency}/month` : 'removed'}`
    }).join('\n')
  }
}
