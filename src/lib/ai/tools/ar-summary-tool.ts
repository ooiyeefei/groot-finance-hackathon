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
import { callMCPToolFromAgent } from './mcp-tool-wrapper'

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
    // Resolve date range before delegating to MCP
    let startDate = parameters.start_date as string | undefined
    let endDate = parameters.end_date as string | undefined
    if (parameters.date_range && !startDate && !endDate) {
      const dateResult = resolveDateRange(parameters.date_range as string)
      startDate = dateResult.startDate
      endDate = dateResult.endDate
    }

    return callMCPToolFromAgent('get_ar_summary', {
      start_date: startDate,
      end_date: endDate,
    }, userContext)
  }

  protected formatResultData(data: any[]): string {
    return ''
  }
}
