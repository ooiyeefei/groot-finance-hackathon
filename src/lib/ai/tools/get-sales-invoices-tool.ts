/**
 * Get Sales Invoices Tool
 *
 * Retrieves outgoing sales invoices (account receivables).
 * Queries the sales_invoices table for invoices sent to customers.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import type { Id } from '@/convex/_generated/dataModel'

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
    if (!this.convex || !userContext.businessId) {
      return {
        success: false,
        error: 'Missing authenticated Convex client or business context'
      }
    }

    const maxRetries = 2
    let lastError: unknown

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[GetSalesInvoicesTool] Fetching sales invoices for business ${userContext.businessId} (attempt ${attempt + 1})`)

        const result = await this.convex.query(
          this.convexApi.functions.salesInvoices.list,
          {
            businessId: userContext.businessId as Id<'businesses'>,
            status: parameters.status as string | undefined,
            limit: parameters.limit as number | undefined,
          }
        )

        if (!result || !result.invoices || result.invoices.length === 0) {
          return {
            success: true,
            data: `No sales invoices found${parameters.status ? ` with status "${parameters.status}"` : ''}. Sales invoices appear here when you create and send invoices to customers.`,
            metadata: { resultsCount: 0, summary: result?.summary }
          }
        }

        console.log(`[GetSalesInvoicesTool] Found ${result.invoices.length} sales invoice(s), summary: ${JSON.stringify(result.summary)}`)

        return {
          success: true,
          data: result,
          metadata: {
            resultsCount: result.invoices.length,
            totalCount: result.totalCount,
            summary: result.summary,
          }
        }
      } catch (error) {
        lastError = error
        console.error(`[GetSalesInvoicesTool] Attempt ${attempt + 1} failed:`, error)
        if (attempt < maxRetries) {
          const delayMs = 1000 * (attempt + 1)
          console.log(`[GetSalesInvoicesTool] Retrying in ${delayMs}ms...`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
        }
      }
    }

    const errorMsg = lastError instanceof Error ? lastError.message : 'Unknown error'
    return {
      success: false,
      error: `Failed to fetch sales invoices after ${maxRetries + 1} attempts: ${errorMsg}. This may be a temporary server issue — please try again.`
    }
  }

  protected formatResultData(data: any[]): string {
    return ''
  }
}
