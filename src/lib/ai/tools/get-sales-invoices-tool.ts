/**
 * Get Sales Invoices Tool
 *
 * Retrieves outgoing sales invoices (account receivables).
 * Queries the sales_invoices table for invoices sent to customers.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import type { Id } from '@/convex/_generated/dataModel'
import { callMCPToolFromAgent } from './mcp-tool-wrapper'

export class GetSalesInvoicesTool extends BaseTool {
  getToolName(modelType?: ModelType): string {
    return 'get_sales_invoices'
  }

  getDescription(modelType?: ModelType): string {
    return `Retrieve outgoing sales invoices (account receivables) — invoices sent to customers.
Returns sales invoices with status (draft, sent, overdue, paid, partially_paid), amounts, due dates, and a summary of outstanding balances.
Use this when users ask about sales invoices, account receivables, AR, money owed by customers, or pending customer payments.
This queries the sales_invoices table, NOT incoming/purchase invoices.`
  }

  getToolSchema(modelType?: ModelType): OpenAIToolSchema {
    return {
      type: "function",
      function: {
        name: this.getToolName(modelType),
        description: this.getDescription(modelType),
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: "Filter by invoice status: draft, sent, overdue, paid, partially_paid, void. Omit for all statuses.",
              enum: ["draft", "sent", "overdue", "paid", "partially_paid", "void"]
            },
            limit: {
              type: "number",
              description: "Maximum number of invoices to return (default: 20)"
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
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        return { valid: false, error: 'limit must be between 1 and 50' }
      }
    }
    const validStatuses = ['draft', 'sent', 'overdue', 'paid', 'partially_paid', 'void']
    if (parameters.status && !validStatuses.includes(parameters.status as string)) {
      return { valid: false, error: `status must be one of: ${validStatuses.join(', ')}` }
    }
    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    return callMCPToolFromAgent('get_sales_invoices', {
      status: parameters.status,
      limit: parameters.limit,
    }, userContext)
  }

  protected formatResultData(data: any[]): string {
    return ''
  }
}
