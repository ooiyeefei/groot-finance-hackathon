/**
 * Get Invoices Tool
 *
 * Retrieves OCR-processed AP invoices with optional search filters.
 * Supports vendor, date, amount, and invoice number filtering.
 * Finance admin/owner only.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { resolveDateRange } from '@/lib/ai/utils/date-range-resolver'
import { callMCPToolFromAgent } from './mcp-tool-wrapper'

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
    // Resolve date range before delegating to MCP
    let startDate = parameters.start_date as string | undefined
    let endDate = parameters.end_date as string | undefined
    if (parameters.date_range && !startDate && !endDate) {
      const dateResult = resolveDateRange(parameters.date_range as string)
      startDate = dateResult.startDate
      endDate = dateResult.endDate
    }

    return callMCPToolFromAgent('get_invoices', {
      vendor_name: parameters.vendor_name,
      invoice_number: parameters.invoice_number,
      start_date: startDate,
      end_date: endDate,
      min_amount: parameters.min_amount,
      max_amount: parameters.max_amount,
      limit: parameters.limit,
    }, userContext)
  }

  protected formatResultData(data: any[]): string {
    return ''
  }
}
