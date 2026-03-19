/**
 * AP Aging Tool
 *
 * Aggregates purchase invoice data: outstanding balances by vendor,
 * aging buckets, and upcoming payment deadlines.
 * Finance admin/owner only.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { resolveDateRange } from '@/lib/ai/utils/date-range-resolver'

export class APAgingTool extends BaseTool {
  getToolName(_modelType?: ModelType): string {
    return 'get_ap_aging'
  }

  getDescription(_modelType?: ModelType): string {
    return `Get accounts payable (AP) aging report — outstanding vendor balances, aging buckets, and upcoming due dates.
Use for: "how much do we owe suppliers", "AP aging", "vendor balances", "what's due this week", "payables summary".`
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
              description: "Natural language date expression for invoice date filter."
            },
            start_date: {
              type: "string",
              description: "Explicit start date in YYYY-MM-DD format."
            },
            end_date: {
              type: "string",
              description: "Explicit end date in YYYY-MM-DD format."
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
        this.convexApi.functions.financialIntelligence.getAPAging,
        { businessId: userContext.businessId, startDate, endDate }
      )

      if ('error' in result && result.error) {
        return { success: false, error: result.error as string }
      }

      let dataText = `**Accounts Payable Aging**\n\n`
      dataText += `Total Outstanding: ${result.totalOutstanding.toFixed(2)} ${result.currency}\n`
      dataText += `Total Overdue: ${result.totalOverdue.toFixed(2)} ${result.currency}\n`

      if (result.agingBuckets.some((b: any) => b.amount > 0)) {
        dataText += `\nAging Breakdown:\n`
        for (const b of result.agingBuckets) {
          if (b.amount > 0) {
            dataText += `- ${b.bucket} days: ${b.amount.toFixed(2)} ${result.currency} (${b.count} invoice(s))\n`
          }
        }
      }

      if (result.vendorBreakdown.length > 0) {
        dataText += `\nTop Vendors (outstanding):\n`
        for (const v of result.vendorBreakdown.slice(0, 5)) {
          dataText += `- ${v.vendorName}: ${v.outstanding.toFixed(2)} ${result.currency}\n`
        }
      }

      if (result.upcomingDues.length > 0) {
        dataText += `\nUpcoming Dues (next 14 days):\n`
        for (const d of result.upcomingDues.slice(0, 5)) {
          dataText += `- ${d.vendorName} (${d.invoiceNumber}): ${d.amount.toFixed(2)} ${result.currency} — due ${d.dueDate}\n`
        }
      }

      return {
        success: true,
        data: dataText,
        metadata: {
          structured: result,
          resultsCount: result.vendorBreakdown.length,
        }
      }
    } catch (error) {
      console.error('[APAgingTool] Error:', error)
      return { success: false, error: `AP aging failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  protected formatResultData(data: any[]): string {
    return ''
  }
}
