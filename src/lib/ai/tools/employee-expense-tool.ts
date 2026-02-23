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

    try {
      if (!userContext.businessId || !userContext.convexUserId) {
        return { success: false, error: 'Missing business context. Please ensure you are logged into a business account.' }
      }

      // Step 1: Resolve employee name to user ID
      console.log(`[EmployeeExpenseTool] Resolving employee name: "${params.employee_name}"`)

      const nameResult = await this.convex!.query(
        this.convexApi.functions.memberships.resolveEmployeeByName,
        {
          businessId: userContext.businessId as any,
          requestingUserId: userContext.convexUserId as any,
          nameQuery: params.employee_name.trim(),
        }
      )

      if (!nameResult.matches || nameResult.matches.length === 0) {
        // No match - list direct reports
        return {
          success: true,
          data: `I couldn't find an employee named "${params.employee_name}" in your team. You have ${nameResult.totalDirectReports} direct report(s). Please check the name and try again.`,
          metadata: { queryProcessed: params.employee_name, resultsCount: 0 }
        }
      }

      // Check for ambiguous match
      if (nameResult.matches.length > 1 && nameResult.matches[0].confidence !== 'exact') {
        const matchList = nameResult.matches
          .map((m: { fullName: string; email: string }) => `• ${m.fullName} (${m.email})`)
          .join('\n')
        return {
          success: true,
          data: `Multiple matches found for "${params.employee_name}":\n${matchList}\n\nPlease specify which employee you mean.`,
          metadata: { queryProcessed: params.employee_name, ambiguousMatches: nameResult.matches.length }
        }
      }

      const targetEmployee = nameResult.matches[0]
      console.log(`[EmployeeExpenseTool] Resolved to: ${targetEmployee.fullName} (${targetEmployee.userId})`)

      // Step 2: Resolve date range
      let startDate = params.start_date
      let endDate = params.end_date

      if (params.date_range && !startDate && !endDate) {
        const dateResult = resolveDateRange(params.date_range)
        startDate = dateResult.startDate
        endDate = dateResult.endDate
        console.log(`[EmployeeExpenseTool] Date range resolved: ${params.date_range} → ${startDate} to ${endDate}`)
      }

      // Step 3: Map category if provided
      let categoryId: string | undefined
      let categoryNote: string | undefined
      if (params.category) {
        const categoryMatch = mapCategoryTerm(params.category)
        if (categoryMatch) {
          categoryId = categoryMatch.categoryId
          categoryNote = `Category "${params.category}" mapped to "${categoryMatch.categoryName}" (${categoryMatch.confidence} match)`
          console.log(`[EmployeeExpenseTool] ${categoryNote}`)
        } else {
          console.log(`[EmployeeExpenseTool] No category mapping for "${params.category}", using as-is`)
          categoryId = params.category
        }
      }

      // Step 4: Query Convex for employee expenses
      const result = await this.convex!.query(
        this.convexApi.functions.financialIntelligence.getEmployeeExpensesForManager,
        {
          businessId: userContext.businessId,
          requestingUserId: userContext.convexUserId,
          targetEmployeeId: targetEmployee.userId,
          filters: {
            vendorName: params.vendor,
            category: categoryId,
            startDate,
            endDate,
            transactionType: params.transaction_type,
            limit: params.limit || 50,
          },
        }
      )

      if (!result.authorized) {
        return {
          success: true,
          data: result.error || 'You can only view data for your direct reports.',
          metadata: { authorized: false }
        }
      }

      // Step 5: Format structured response
      const response = {
        summary: {
          total_amount: result.totalAmount,
          currency: result.currency,
          record_count: result.totalCount,
          date_range: {
            start: startDate || 'all time',
            end: endDate || 'present',
          },
        },
        employee: {
          name: result.employeeName,
          id: targetEmployee.userId,
        },
        items: result.entries.map((e: any) => ({
          date: e.transactionDate,
          description: e.description,
          vendor_name: e.vendorName,
          amount: e.homeCurrencyAmount,
          currency: e.homeCurrency,
          category: e.category,
          transaction_type: e.transactionType,
        })),
        truncated: result.totalCount > result.entries.length,
        truncated_count: Math.max(0, result.totalCount - result.entries.length),
      }

      // Validate output against Zod schema
      const parsed = EmployeeExpenseResponseSchema.safeParse(response)
      if (!parsed.success) {
        console.warn(`[EmployeeExpenseTool] Output schema validation warning:`, parsed.error.issues)
      }

      // Derive actual display currency from entries (homeCurrency on entries may differ from business.homeCurrency)
      const displayCurrency = result.entries.length > 0
        ? (result.entries[0].homeCurrency || result.currency)
        : result.currency

      // Format for LLM consumption
      let dataText = `Employee Expenses for ${result.employeeName}:\n\n`
      dataText += `Summary: ${result.totalCount} transaction(s) totaling ${result.totalAmount.toFixed(2)} ${displayCurrency}`
      if (startDate && endDate) {
        dataText += ` (${startDate} to ${endDate})`
      }
      if (categoryNote) {
        dataText += `\nNote: ${categoryNote}`
      }
      dataText += '\n'

      if (result.entries.length > 0) {
        dataText += '\nTransactions:\n'
        result.entries.forEach((e: any, i: number) => {
          dataText += `${i + 1}. ${e.transactionDate} | ${e.vendorName || 'Unknown vendor'}\n`
          // Show original currency amount; also show home currency if different
          const origStr = `${e.originalAmount?.toFixed(2) ?? e.homeCurrencyAmount.toFixed(2)} ${e.originalCurrency || e.homeCurrency}`
          const homeStr = `${e.homeCurrencyAmount.toFixed(2)} ${e.homeCurrency}`
          const amountStr = (e.originalCurrency && e.originalCurrency !== e.homeCurrency)
            ? `${origStr} (≈ ${homeStr})`
            : homeStr
          dataText += `   Amount: ${amountStr}\n`
          dataText += `   Description: ${e.description || '—'} | Category: ${e.category || 'Uncategorized'}\n`
        })
      }

      if (response.truncated) {
        dataText += `\n(Showing ${result.entries.length} of ${result.totalCount} total transactions)`
      }

      // Audit log
      console.log(JSON.stringify({
        event: 'cross_employee_query',
        managerId: userContext.convexUserId,
        targetEmployeeId: targetEmployee.userId,
        toolName: 'get_employee_expenses',
        queryParams: { vendor: params.vendor, category: categoryId, startDate, endDate },
        resultCount: result.totalCount,
        timestamp: new Date().toISOString(),
      }))

      return {
        success: true,
        data: dataText,
        metadata: {
          structured: response,
          queryProcessed: params.employee_name,
          resultsCount: result.totalCount,
        }
      }

    } catch (error) {
      console.error('[EmployeeExpenseTool] Execution error:', error)
      return {
        success: false,
        error: `Employee expense lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  protected formatResultData(data: any[]): string {
    return data.map((item, index) => {
      return `${index + 1}. ${item.date} - ${item.description}\n   Amount: ${item.amount} ${item.currency}\n   Vendor: ${item.vendor_name}`
    }).join('\n\n')
  }
}
