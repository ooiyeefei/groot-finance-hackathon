/**
 * Get Invoices Tool
 *
 * Retrieves OCR-processed AP invoices with optional search filters.
 * Supports vendor, date, amount, and invoice number filtering.
 * Finance admin/owner only.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { resolveDateRange } from '@/lib/ai/utils/date-range-resolver'

export class GetInvoicesTool extends BaseTool {
  getToolName(modelType?: ModelType): string {
    return 'get_invoices'
  }

  getDescription(modelType?: ModelType): string {
    return `Search and retrieve incoming/purchase invoices (Account Payables).
Returns invoices with vendor name, amount, date, invoice number, line items, and payment status.
Supports filtering by vendor name, date range, amount range, and invoice number.
Use for: "invoices from ABC Supplier", "purchase invoices this quarter", "line items for invoice INV-001", "how much did we buy from vendor X".`
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
            vendor_name: {
              type: "string",
              description: "Filter by vendor/supplier name (case-insensitive partial match)."
            },
            invoice_number: {
              type: "string",
              description: "Filter by invoice number (exact or partial match)."
            },
            date_range: {
              type: "string",
              description: "Natural language date expression (e.g., 'this quarter', 'February 2026', 'last 60 days')."
            },
            start_date: {
              type: "string",
              description: "Explicit start date in YYYY-MM-DD format."
            },
            end_date: {
              type: "string",
              description: "Explicit end date in YYYY-MM-DD format."
            },
            min_amount: {
              type: "number",
              description: "Minimum invoice amount filter."
            },
            max_amount: {
              type: "number",
              description: "Maximum invoice amount filter."
            },
            limit: {
              type: "number",
              description: "Maximum number of invoices to return (default: 20, max: 50)."
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
      return {
        success: false,
        error: 'Missing authenticated Convex client or business context'
      }
    }

    // Resolve date range
    let startDate = parameters.start_date as string | undefined
    let endDate = parameters.end_date as string | undefined
    if (parameters.date_range && !startDate && !endDate) {
      const dateResult = resolveDateRange(parameters.date_range as string)
      startDate = dateResult.startDate
      endDate = dateResult.endDate
    }

    const hasFilters = parameters.vendor_name || parameters.invoice_number || startDate || endDate || parameters.min_amount !== undefined || parameters.max_amount !== undefined

    try {
      console.log(`[GetInvoicesTool] Searching invoices for business ${userContext.businessId}`, {
        vendor: parameters.vendor_name, invoiceNumber: parameters.invoice_number,
        dateRange: startDate ? `${startDate} to ${endDate}` : 'all',
      })

      // Use searchForAI if filters are provided, otherwise fall back to getCompletedForAI
      const result = hasFilters
        ? await this.convex.query(
            this.convexApi.functions.invoices.searchForAI,
            {
              businessId: userContext.businessId,
              vendorName: parameters.vendor_name as string | undefined,
              invoiceNumber: parameters.invoice_number as string | undefined,
              startDate,
              endDate,
              minAmount: parameters.min_amount as number | undefined,
              maxAmount: parameters.max_amount as number | undefined,
              limit: parameters.limit as number | undefined,
            }
          )
        : await this.convex.query(
            this.convexApi.functions.invoices.getCompletedForAI,
            {
              businessId: userContext.businessId,
              limit: parameters.limit,
            }
          )

      if (!result || !result.invoices || result.invoices.length === 0) {
        const filterDesc = parameters.vendor_name ? ` from "${parameters.vendor_name}"` : ''
        const dateDesc = startDate ? ` between ${startDate} and ${endDate}` : ''
        return {
          success: true,
          data: `No invoices found${filterDesc}${dateDesc}. Invoices appear here after OCR processing completes.`,
          metadata: { resultsCount: 0 }
        }
      }

      console.log(`[GetInvoicesTool] Found ${result.invoices.length} invoice(s)`)

      const invoices = result.invoices.map((inv: any) => ({
        _id: inv._id,
        vendorName: inv.vendorName,
        invoiceNumber: inv.invoiceNumber || null,
        invoiceDate: inv.invoiceDate || null,
        amount: inv.amount,
        currency: inv.currency,
        isPosted: inv.isPosted,
        paymentStatus: inv.paymentStatus || (inv.isPosted ? 'posted' : 'pending'),
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
        data: JSON.stringify({ invoices, totalCount: (result as any).totalCount || invoices.length, summary: (result as any).summary }),
        metadata: { resultsCount: invoices.length }
      }
    } catch (error) {
      console.error('[GetInvoicesTool] Error:', error)
      return {
        success: false,
        error: `Failed to fetch invoices: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  protected formatResultData(data: any[]): string {
    return ''
  }
}
