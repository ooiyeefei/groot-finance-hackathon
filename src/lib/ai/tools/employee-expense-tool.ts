/**
 * Employee Expense Tool
 *
 * Enables managers to query a specific employee's approved expense transactions.
 * Used for queries like: "How much did Sarah spend at Starbucks in January 2026?"
 *
 * Authorization: manager (direct reports only), finance_admin/owner (any employee)
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { resolveDateRange } from '@/lib/ai/utils/date-range-resolver'
import { mapCategoryTerm } from '@/lib/ai/utils/category-mapper'
import { callMCPToolFromAgent } from './mcp-tool-wrapper'
import { z } from 'zod'

interface EmployeeExpenseParameters {
  employee_name: string
  vendor?: string
  category?: string
  date_range?: string
  start_date?: string
  end_date?: string
  transaction_type?: 'Income' | 'Expense' | 'Cost of Goods Sold'
  limit?: number
}

// Zod output schema for structured response validation
const EmployeeExpenseResponseSchema = z.object({
  summary: z.object({
    total_amount: z.number(),
    currency: z.string(),
    record_count: z.number(),
    date_range: z.object({
      start: z.string(),
      end: z.string(),
    }),
  }),
  employee: z.object({
    name: z.string(),
    id: z.string(),
  }),
  items: z.array(z.object({
    date: z.string(),
    description: z.string(),
    vendor_name: z.string(),
    amount: z.number(),
    currency: z.string(),
    category: z.string(),
    transaction_type: z.string(),
  })),
  truncated: z.boolean(),
  truncated_count: z.number(),
})

export class EmployeeExpenseTool extends BaseTool {
  getToolName(_modelType: ModelType = 'openai'): string {
    return 'get_employee_expenses'
  }

  getDescription(_modelType: ModelType = 'openai'): string {
    return "Look up a specific employee's approved expense transactions. Use this tool when a manager asks about a specific team member's spending (e.g., 'How much did Sarah spend at Starbucks in January 2026?'). Requires the manager to have the employee as a direct report. Only returns approved/posted financial records."
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
            employee_name: {
              type: "string",
              description: "The employee's name (first name, last name, or partial name). The system will match against direct reports."
            },
            vendor: {
              type: "string",
              description: "Optional vendor name filter. Case-insensitive partial match (e.g., 'starbucks' matches 'STARBUCKS COFFEE SDN BHD')."
            },
            category: {
              type: "string",
              description: "Optional expense category in natural language (e.g., 'meals', 'travel', 'office supplies'). Mapped to system categories."
            },
            date_range: {
              type: "string",
              description: "Natural language date expression (e.g., 'January 2026', 'last quarter', 'past 60 days', 'this month'). Converted to exact dates deterministically."
            },
            start_date: {
              type: "string",
              description: "Explicit start date in YYYY-MM-DD format. Use instead of date_range for precise dates."
            },
            end_date: {
              type: "string",
              description: "Explicit end date in YYYY-MM-DD format. Use instead of date_range for precise dates."
            },
            transaction_type: {
              type: "string",
              enum: ["Income", "Expense", "Cost of Goods Sold"],
              description: "Optional transaction type filter."
            },
            limit: {
              type: "number",
              description: "Max transactions to return in detail (1-50, default 50). Summary always covers all matches."
            }
          },
          required: ["employee_name"]
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as EmployeeExpenseParameters

    if (!params.employee_name || typeof params.employee_name !== 'string' || params.employee_name.trim().length === 0) {
      return { valid: false, error: 'employee_name is required and must be a non-empty string' }
    }

    if (params.limit !== undefined) {
      const limit = Number(params.limit)
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        return { valid: false, error: 'limit must be an integer between 1 and 50' }
      }
    }

    if (params.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(params.start_date)) {
      return { valid: false, error: 'start_date must be in YYYY-MM-DD format' }
    }

    if (params.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(params.end_date)) {
      return { valid: false, error: 'end_date must be in YYYY-MM-DD format' }
    }

    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as EmployeeExpenseParameters

    // Resolve date range before delegating to MCP
    let startDate = params.start_date
    let endDate = params.end_date
    if (params.date_range && !startDate && !endDate) {
      const dateResult = resolveDateRange(params.date_range)
      startDate = dateResult.startDate
      endDate = dateResult.endDate
    }

    // Map category if provided
    let categoryId: string | undefined
    if (params.category) {
      const categoryMatch = mapCategoryTerm(params.category)
      categoryId = categoryMatch ? categoryMatch.categoryId : params.category
    }

    return callMCPToolFromAgent('get_employee_expenses', {
      employee_name: params.employee_name,
      vendor: params.vendor,
      category: categoryId,
      start_date: startDate,
      end_date: endDate,
      transaction_type: params.transaction_type,
      limit: params.limit,
    }, userContext)
  }

  protected formatResultData(data: any[]): string {
    return data.map((item, index) => {
      return `${index + 1}. ${item.date} - ${item.description}\n   Amount: ${item.amount} ${item.currency}\n   Vendor: ${item.vendor_name}`
    }).join('\n\n')
  }
}
