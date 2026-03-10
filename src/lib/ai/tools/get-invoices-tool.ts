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

        // Return structured JSON so the auto-card builder can generate invoice_posting cards.
        // The LLM also reads this JSON to produce its text summary.
        const invoices = result.invoices.map((inv: any) => ({
          _id: inv._id,
          vendorName: inv.vendorName,
          invoiceNumber: inv.invoiceNumber || null,
          invoiceDate: inv.invoiceDate || null,
          amount: inv.amount,
          currency: inv.currency,
          isPosted: inv.isPosted,
          confidenceScore: inv.confidenceScore ?? 0,
          lineItems: (inv.lineItems || []).map((item: any) => ({
            description: item.description ?? item.item_description ?? 'Item',
            quantity: item.quantity ?? 1,
            unitPrice: item.unitPrice ?? item.unit_price ?? 0,
            totalAmount: item.totalAmount ?? item.total_amount ?? Math.round((item.unit_price ?? 0) * (item.quantity ?? 1) * 100) / 100,
          })),
        }))

        return {
          success: true,
          data: JSON.stringify({ invoices }),
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
