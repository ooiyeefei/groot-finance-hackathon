/**
 * Get Invoices Tool
 *
 * Retrieves OCR-processed invoices ready to post to accounting.
 * Queries the invoices table for completed documents with extracted data.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'

export class GetInvoicesTool extends BaseTool {
  getToolName(modelType?: ModelType): string {
    return 'get_invoices'
  }

  getDescription(modelType?: ModelType): string {
    return `Retrieve incoming/purchase invoices (Account Payables) that have been OCR-processed.
Returns invoices with extracted vendor name, amount, date, invoice number, confidence score, and line items.
Use this when users ask about: "my invoices", "recent invoices", "incoming invoices", "purchase invoices",
"invoices ready to post", "AP invoices", or any question about supplier/vendor invoices.
This tool queries the AP invoices table (NOT accounting_entries and NOT sales invoices).`
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
            limit: {
              type: "number",
              description: "Maximum number of invoices to return (default: 10)"
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
        console.log(`[GetInvoicesTool] Fetching completed invoices for business ${userContext.businessId} (attempt ${attempt + 1})`)

        const result = await this.convex.query(
          this.convexApi.functions.invoices.getCompletedForAI,
          {
            businessId: userContext.businessId,
            limit: parameters.limit,
          }
        )

        if (!result || !result.invoices || result.invoices.length === 0) {
          return {
            success: true,
            data: 'No completed invoices with extracted data found. Invoices appear here after OCR processing completes.',
            metadata: { resultsCount: 0 }
          }
        }

        console.log(`[GetInvoicesTool] Found ${result.invoices.length} completed invoice(s)`)

        // Format as structured text so LLM produces clean markdown output
        const invoices = result.invoices
        let dataText = `Found ${invoices.length} invoice(s):\n\n`

        invoices.forEach((inv: any, i: number) => {
          const status = inv.isPosted ? '✓ Posted to Accounting' : '⏳ Pending — not yet posted'
          dataText += `### ${i + 1}. ${inv.vendorName}\n`
          dataText += `- **Invoice #**: ${inv.invoiceNumber || '—'}\n`
          dataText += `- **Date**: ${inv.invoiceDate || '—'}\n`
          dataText += `- **Total**: ${inv.amount?.toFixed(2)} ${inv.currency}\n`
          dataText += `- **Status**: ${status}\n`
          dataText += `- **OCR Confidence**: ${Math.round((inv.confidenceScore ?? 0) * 100)}%\n`

          if (inv.lineItems && inv.lineItems.length > 0) {
            dataText += `- **Line items**:\n`
            inv.lineItems.forEach((item: any) => {
              const amt = item.totalAmount ?? item.total_amount ?? 0
              const desc = item.description ?? item.item_description ?? 'Item'
              const qty = item.quantity ?? 1
              dataText += `  - ${desc} × ${qty} — ${amt.toFixed(2)} ${inv.currency}\n`
            })
          }
          dataText += '\n'
        })

        return {
          success: true,
          data: dataText,
          metadata: { resultsCount: invoices.length }
        }
      } catch (error) {
        lastError = error
        console.error(`[GetInvoicesTool] Attempt ${attempt + 1} failed:`, error)
        if (attempt < maxRetries) {
          const delayMs = 1000 * (attempt + 1)
          console.log(`[GetInvoicesTool] Retrying in ${delayMs}ms...`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
        }
      }
    }

    const errorMsg = lastError instanceof Error ? lastError.message : 'Unknown error'
    return {
      success: false,
      error: `Failed to fetch invoices after ${maxRetries + 1} attempts: ${errorMsg}. This may be a temporary server issue — please try again.`
    }
  }

  protected formatResultData(data: any[]): string {
    return ''
  }
}
