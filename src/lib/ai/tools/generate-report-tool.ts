/**
 * Generate Report PDF Tool — Tool-factory wrapper for MCP generate_report_pdf
 *
 * Calls the MCP Lambda via HTTP to generate a multi-section board report PDF.
 * Returns a download URL for the generated PDF.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'

export class GenerateReportTool extends BaseTool {
  getToolName(modelType?: ModelType): string {
    return 'generate_report_pdf'
  }

  getDescription(modelType?: ModelType): string {
    return `Generate a downloadable PDF board report for a specified date range.
Sections include: P&L summary, Cash Flow, AR Aging, AP Aging, Top Vendors, and Monthly Trends.
Use this when the user asks for a board deck, quarterly report, or financial summary PDF.
Returns a download link valid for 7 days.`
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
            date_range: {
              type: "object",
              properties: {
                start: { type: "string", description: "Start date (YYYY-MM-DD)" },
                end: { type: "string", description: "End date (YYYY-MM-DD)" }
              },
              required: ["start", "end"],
              description: "Date range for the report period"
            },
            report_type: {
              type: "string",
              enum: ["board_report"],
              description: "Type of report (default: board_report)"
            },
            sections: {
              type: "array",
              items: {
                type: "string",
                enum: ["pnl", "cash_flow", "ar_aging", "ap_aging", "top_vendors", "trends"]
              },
              description: "Sections to include (defaults to all)"
            }
          },
          required: ["date_range"]
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const dateRange = parameters.date_range as { start?: string; end?: string } | undefined
    if (!dateRange?.start || !dateRange?.end) {
      return { valid: false, error: 'date_range with start and end dates is required' }
    }
    if (dateRange.start > dateRange.end) {
      return { valid: false, error: 'start date must be before end date' }
    }
    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const endpointUrl = process.env.MCP_ENDPOINT_URL
    const serviceKey = process.env.MCP_INTERNAL_SERVICE_KEY

    if (!endpointUrl || !serviceKey) {
      return { success: false, error: 'Report generation service is not configured.' }
    }

    try {
      console.log(`[GenerateReportTool] Generating report for business ${userContext.businessId}`)

      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': serviceKey,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'generate_report_pdf',
            arguments: {
              report_type: parameters.report_type || 'board_report',
              date_range: parameters.date_range,
              sections: parameters.sections,
            },
            _businessId: userContext.businessId,
          },
        }),
      })

      if (!response.ok) {
        console.error(`[GenerateReportTool] MCP HTTP ${response.status}`)
        return { success: false, error: 'Failed to connect to report generation service' }
      }

      const data = await response.json()

      if (data.error) {
        return { success: false, error: data.error.message || 'Report generation failed' }
      }

      const textContent = data.result?.content?.find((c: { type: string }) => c.type === 'text')
      if (!textContent?.text) {
        return { success: false, error: 'Report generation returned empty results' }
      }

      const result = JSON.parse(textContent.text)

      if (result.error) {
        return { success: false, error: result.message || 'Report generation failed' }
      }

      console.log(`[GenerateReportTool] Report generated: ${result.filename}, ${result.page_count} pages`)

      return {
        success: true,
        data: result,
        metadata: {
          reportType: 'board_report',
          filename: result.filename,
          pageCount: result.page_count,
          sectionsIncluded: result.sections_included,
        }
      }
    } catch (error) {
      console.error('[GenerateReportTool] Error:', error)
      return {
        success: false,
        error: `Report generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  protected formatResultData(data: any[]): string {
    return ''
  }
}
