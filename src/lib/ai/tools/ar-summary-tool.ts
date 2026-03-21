/**
 * AR Summary Tool
 *
 * Aggregates sales invoice data: total revenue, outstanding balances,
 * aging buckets, and customer-level breakdown.
 * Finance admin/owner only.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { convertForDisplay } from './currency-display-helper'
import { resolveDateRange } from '@/lib/ai/utils/date-range-resolver'

export class ARSummaryTool extends BaseTool {
  getToolName(_modelType?: ModelType): string {
    return 'get_ar_summary'
  }

  getDescription(_modelType?: ModelType): string {
    return `Get accounts receivable (AR) summary — total revenue, outstanding balances, overdue aging, and customer breakdown.
Use for: "total revenue this month", "which customers are overdue", "AR aging report", "money owed to us", "outstanding receivables".`
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
            date_range: {
              type: "string",
              description: "Natural language date expression (e.g., 'this month', 'Q1 2026', 'last 90 days')."
            },
            start_date: {
              type: "string",
              description: "Explicit start date in YYYY-MM-DD format."
            },
            end_date: {
              type: "string",
              description: "Explicit end date in YYYY-MM-DD format."
            },
            display_currency: {
              type: "string",
              description: "Optional currency code (e.g., 'USD', 'SGD') to show converted amounts alongside home currency."
            },
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    if (parameters.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(parameters.start_date)) {
      return { valid: false, error: 'start_date must be in YYYY-MM-DD format' }
    }
    if (parameters.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(parameters.end_date)) {
      return { valid: false, error: 'end_date must be in YYYY-MM-DD format' }
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

    try {
      const result = await this.convex.query(
        this.convexApi.functions.financialIntelligence.getARSummary,
        { businessId: userContext.businessId, startDate, endDate }
      )

      if ('error' in result && result.error) {
        return { success: false, error: result.error as string }
      }

      // Currency conversion if requested
      const displayCurrency = parameters.display_currency as string | undefined
      const homeCurrency = result.currency || userContext.homeCurrency || 'MYR'
      const conversion = displayCurrency ? await convertForDisplay(1, homeCurrency, displayCurrency) : null
      const rate = conversion?.exchangeRate || 1
      const convertSuffix = (amount: number) =>
        conversion ? ` (~ ${displayCurrency} ${(amount * rate).toFixed(2)})` : ''

      // Format conversational text
      let dataText = `**Accounts Receivable Summary**\n\n`
      dataText += `Total Revenue: ${result.totalRevenue.toFixed(2)} ${result.currency}${convertSuffix(result.totalRevenue)}\n`
      dataText += `Outstanding: ${result.totalOutstanding.toFixed(2)} ${result.currency}${convertSuffix(result.totalOutstanding)}\n`
      dataText += `Overdue: ${result.totalOverdue.toFixed(2)} ${result.currency}${convertSuffix(result.totalOverdue)}\n`
      dataText += `Outstanding Invoices: ${result.invoiceCount}\n`
      if (result.totalInvoiceCount) {
        dataText += `Total Invoices (all statuses): ${result.totalInvoiceCount}\n`
      }

      if (result.statusBreakdown.length > 0) {
        dataText += `\nBy Status:\n`
        for (const s of result.statusBreakdown) {
          dataText += `- ${s.status}: ${s.count} invoice(s), ${s.totalAmount.toFixed(2)} ${result.currency}\n`
        }
      }

      if (result.agingBuckets.some((b: any) => b.amount > 0)) {
        dataText += `\nAging:\n`
        for (const b of result.agingBuckets) {
          if (b.amount > 0) {
            dataText += `- ${b.bucket} days: ${b.amount.toFixed(2)} ${result.currency} (${b.count} invoice(s))\n`
          }
        }
      }

      if (result.topCustomers.length > 0) {
        dataText += `\nTop Customers (outstanding):\n`
        for (const c of result.topCustomers.slice(0, 5)) {
          const overdueNote = c.overdueDays > 0 ? ` (${c.overdueDays} days overdue)` : ''
          dataText += `- ${c.clientName}: ${c.outstanding.toFixed(2)} ${result.currency}${overdueNote}\n`
        }
      }

      return {
        success: true,
        data: dataText,
        metadata: {
          structured: result,
          resultsCount: result.invoiceCount,
        }
      }
    } catch (error) {
      console.error('[ARSummaryTool] Error:', error)
      return { success: false, error: `AR summary failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  protected formatResultData(data: any[]): string {
    return ''
  }
}
