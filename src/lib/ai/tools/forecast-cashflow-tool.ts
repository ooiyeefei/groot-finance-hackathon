/**
 * Monthly Cash Flow Forecast Tool
 *
 * Dedicated tool for monthly cash flow projections (1-12 months).
 * Separate from analyze_cash_flow so the LLM can distinguish between:
 * - "What's my cash flow health?" → analyze_cash_flow (90-day daily)
 * - "Forecast cash flow for 6 months" → forecast_monthly_cashflow (monthly)
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'

export class ForecastCashFlowTool extends BaseTool {
  getToolName(modelType?: ModelType): string {
    return 'forecast_monthly_cashflow'
  }

  getDescription(modelType?: ModelType): string {
    return `Project monthly cash flow for the next 1-12 months.
Shows month-by-month projected income, expenses, and balance including known AR (receivables) and AP (payables).
Use this when the user asks to "forecast cash flow", "project cash flow for N months", "monthly cash projection", or "cash flow forecast".
Do NOT use analyze_cash_flow for monthly forecasts — use this tool instead.`
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
            months: {
              type: "number",
              description: "Number of months to forecast (1-12). Default: 6."
            },
            scenario: {
              type: "string",
              enum: ["conservative", "moderate", "optimistic"],
              description: "Projection scenario. Conservative: -20% income, +20% expenses. Optimistic: +20% income, -20% expenses. Default: moderate."
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    if (parameters.months !== undefined) {
      const months = parameters.months as number
      if (typeof months !== 'number' || months < 1 || months > 12) {
        return { valid: false, error: 'months must be between 1 and 12' }
      }
    }
    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const endpointUrl = process.env.MCP_ENDPOINT_URL
    const serviceKey = process.env.MCP_INTERNAL_SERVICE_KEY

    if (!endpointUrl || !serviceKey) {
      return { success: false, error: 'Monthly forecast service is not configured.' }
    }

    if (!userContext.businessId) {
      return { success: false, error: 'Missing business context' }
    }

    const months = (parameters.months as number) || 6
    const scenario = (parameters.scenario as string) || 'moderate'

    try {
      console.log(`[ForecastCashFlowTool] Forecasting ${months} months for business ${userContext.businessId}`)

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
            name: 'forecast_cash_flow',
            arguments: {
              forecast_months: months,
              granularity: 'monthly',
              scenario,
              include_known_ar_ap: true,
            },
            _businessId: userContext.businessId,
          },
        }),
      })

      if (!response.ok) {
        console.error(`[ForecastCashFlowTool] MCP HTTP ${response.status}`)
        return { success: false, error: 'Failed to connect to forecast service' }
      }

      const data = await response.json()

      if (data.error) {
        return { success: false, error: data.error.message || 'Forecast failed' }
      }

      const textContent = data.result?.content?.find((c: { type: string }) => c.type === 'text')
      if (!textContent?.text) {
        return { success: false, error: 'Forecast returned empty results' }
      }

      const result = JSON.parse(textContent.text)

      if (result.error) {
        return { success: false, error: result.message || 'Forecast failed' }
      }

      console.log(`[ForecastCashFlowTool] Forecast complete. Months: ${result.months?.length || 0}, Risk: ${result.summary?.risk_level}`)

      return {
        success: true,
        data: result,
        metadata: {
          forecastType: 'monthly',
          monthCount: result.months?.length || 0,
          runwayMonths: result.summary?.runway_months,
          riskLevel: result.summary?.risk_level,
        }
      }
    } catch (error) {
      console.error('[ForecastCashFlowTool] Error:', error)
      return {
        success: false,
        error: `Monthly forecast failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  protected formatResultData(data: any[]): string {
    return ''
  }
}
