/**
 * Business-Wide Transactions Tool
 *
 * Queries ALL business transactions across all employees.
 * Unlike get_transactions (personal-scoped), this returns business-wide data
 * with employee attribution.
 * Finance admin/owner only.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { convertForDisplay } from './currency-display-helper'
import { resolveDateRange } from '@/lib/ai/utils/date-range-resolver'
import { mapCategoryTerm } from '@/lib/ai/utils/category-mapper'
import { callMCPToolFromAgent } from './mcp-tool-wrapper'

export class BusinessTransactionsTool extends BaseTool {
  getToolName(_modelType?: ModelType): string {
    return 'get_business_transactions'
  }

  getDescription(_modelType?: ModelType): string {
    return `Query business-wide transactions across ALL employees. Returns transactions with employee attribution.
Use for: "all business expenses this month", "total company spending", "show all office supply expenses", "business-wide transactions".
This differs from get_transactions which only returns the current user's own data.`
  }

  getToolSchema(_modelType?: ModelType): OpenAIToolSchema {
    return {
      type: "function",
      function: {
        name: this.getToolName(_modelType),
        description: this.getDescription(_modelType),
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search vendor/description (e.g., 'Starbucks', 'office supplies'). Leave empty for all transactions."
            },
            category: {
              type: "string",
              description: "Category filter in natural language (e.g., 'meals', 'travel', 'office supplies')."
            },
            transaction_type: {
              type: "string",
              enum: ["Income", "Expense", "Cost of Goods Sold"],
              description: "Filter by transaction type."
            },
            date_range: {
              type: "string",
              description: "Natural language date expression (e.g., 'this month', 'Q1 2026')."
            },
            start_date: {
              type: "string",
              description: "Explicit start date in YYYY-MM-DD format."
            },
            end_date: {
              type: "string",
              description: "Explicit end date in YYYY-MM-DD format."
            },
            limit: {
              type: "number",
              description: "Max transactions to return (default: 50, max: 100)."
            },
            display_currency: {
              type: "string",
              description: "Optional currency code (e.g., 'USD', 'SGD') to show converted amounts alongside home currency."
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    if (parameters.limit !== undefined) {
      const limit = Number(parameters.limit)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return { valid: false, error: 'limit must be between 1 and 100' }
      }
    }
    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    // Resolve date range before delegating to MCP
    let startDate = parameters.start_date as string | undefined
    let endDate = parameters.end_date as string | undefined
    if (parameters.date_range && !startDate && !endDate) {
      const dateResult = resolveDateRange(parameters.date_range as string)
      startDate = dateResult.startDate
      endDate = dateResult.endDate
    }

    // Map category term to category ID if needed
    let categoryId: string | undefined
    if (parameters.category) {
      const categoryMatch = mapCategoryTerm(parameters.category as string)
      categoryId = categoryMatch ? categoryMatch.categoryId : (parameters.category as string)
    }

    return callMCPToolFromAgent('get_business_transactions', {
      query: parameters.query,
      category: categoryId,
      transaction_type: parameters.transaction_type,
      start_date: startDate,
      end_date: endDate,
      limit: parameters.limit,
    }, userContext)
  }

  protected formatResultData(data: any[]): string {
    return ''
  }
}
