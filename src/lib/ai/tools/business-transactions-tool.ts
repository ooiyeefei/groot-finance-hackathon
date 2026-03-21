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
    if (!this.convex || !userContext.businessId) {
      return { success: false, error: 'Missing authenticated Convex client or business context' }
    }

    let startDate = parameters.start_date as string | undefined
    let endDate = parameters.end_date as string | undefined
    if (parameters.date_range && !startDate && !endDate) {
      const dateResult = resolveDateRange(parameters.date_range as string)
      startDate = dateResult.startDate
      endDate = dateResult.endDate
    }

    let categoryId: string | undefined
    if (parameters.category) {
      const categoryMatch = mapCategoryTerm(parameters.category as string)
      categoryId = categoryMatch ? categoryMatch.categoryId : (parameters.category as string)
    }

    try {
      const result = await this.convex.query(
        this.convexApi.functions.financialIntelligence.getBusinessTransactions,
        {
          businessId: userContext.businessId,
          query: parameters.query as string | undefined,
          category: categoryId,
          transactionType: parameters.transaction_type as string | undefined,
          startDate,
          endDate,
          limit: parameters.limit as number | undefined,
        }
      )

      if ('error' in result && result.error) {
        return { success: false, error: result.error as string }
      }

      const transactions = result.transactions as Array<{
        transactionDate: string; vendorName: string; amount: number; currency: string;
        category: string; description: string; transactionType: string; employeeName?: string;
      }>

      if (transactions.length === 0) {
        return {
          success: true,
          data: `No business transactions found for the selected criteria.`,
          metadata: { resultsCount: 0 }
        }
      }

      // Currency conversion if requested
      const displayCurrency = parameters.display_currency as string | undefined
      const homeCurrency = result.currency || userContext.homeCurrency || 'MYR'
      const conversion = displayCurrency ? await convertForDisplay(1, homeCurrency, displayCurrency) : null
      const rate = conversion?.exchangeRate || 1
      const convertSuffix = (amount: number) =>
        conversion ? ` (~ ${displayCurrency} ${(amount * rate).toFixed(2)})` : ''

      let dataText = `**Business-Wide Transactions** (${result.totalCount} total, showing ${transactions.length})\n\n`
      dataText += `Total: ${result.totalAmount.toFixed(2)} ${result.currency}${convertSuffix(result.totalAmount)}\n\n`

      dataText += `Transactions:\n`
      for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i]
        const employeeTag = t.employeeName ? ` [${t.employeeName}]` : ''
        dataText += `${i + 1}. ${t.transactionDate} | ${t.vendorName}${employeeTag}\n`
        dataText += `   ${t.amount.toFixed(2)} ${t.currency} — ${t.category || 'Uncategorized'}\n`
        if (t.description) dataText += `   ${t.description}\n`
      }

      if (result.totalCount > transactions.length) {
        dataText += `\n(Showing ${transactions.length} of ${result.totalCount} total transactions)`
      }

      return {
        success: true,
        data: dataText,
        metadata: {
          structured: result,
          resultsCount: result.totalCount,
        }
      }
    } catch (error) {
      console.error('[BusinessTransactionsTool] Error:', error)
      return { success: false, error: `Business transaction query failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  protected formatResultData(data: any[]): string {
    return ''
  }
}
