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

        const invoices = result.invoices
        const summary = result.summary

        // Summary header
        let dataText = `**Sales Invoices (AR) — ${invoices.length} invoice(s)**\n\n`
        if (summary) {
          dataText += `**Summary**\n`
          dataText += `- Total outstanding: ${summary.totalOutstanding?.toFixed(2) ?? '0.00'}\n`
          dataText += `- Total overdue: ${summary.totalOverdue?.toFixed(2) ?? '0.00'}\n\n`
        }

        invoices.forEach((inv: any, i: number) => {
          const statusEmoji: Record<string, string> = {
            paid: '✓ Paid', sent: '📤 Sent', overdue: '⚠️ Overdue',
            draft: '📝 Draft', partially_paid: '🔵 Partially Paid', void: '🚫 Void'
          }
          const statusLabel = statusEmoji[inv.status] ?? inv.status
          dataText += `### ${i + 1}. ${inv.clientName || inv.client_name || 'Customer'}\n`
          dataText += `- **Invoice #**: ${inv.invoiceNumber || inv.invoice_number || '—'}\n`
          dataText += `- **Amount**: ${inv.total?.toFixed(2) ?? inv.amount?.toFixed(2) ?? '—'} ${inv.currency ?? ''}\n`
          dataText += `- **Status**: ${statusLabel}\n`
          if (inv.dueDate || inv.due_date) dataText += `- **Due**: ${inv.dueDate ?? inv.due_date}\n`
          if (inv.invoiceDate || inv.invoice_date) dataText += `- **Date**: ${inv.invoiceDate ?? inv.invoice_date}\n`
          dataText += '\n'
        })

        return {
          success: true,
          data: dataText,
          metadata: { resultsCount: invoices.length, totalCount: result.totalCount, summary }
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
