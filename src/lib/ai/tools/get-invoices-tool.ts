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
    return `Retrieve OCR-processed invoices that are ready to post to accounting.
Returns completed invoices with extracted vendor name, amount, date, confidence score, and line items.
Use this when users ask about invoices ready to post, recently processed invoices, or OCR results.
This tool queries the invoices table (NOT accounting_entries).`
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

        return {
          success: true,
          data: result,
          metadata: {
            resultsCount: result.invoices.length,
          }
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
