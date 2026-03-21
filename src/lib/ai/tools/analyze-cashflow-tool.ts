/**
 * Analyze Cash Flow Tool - Category 3 Domain Intelligence
 *
 * THIS IS CATEGORY 3: Server calculates runway days, burn rate, expense ratios,
 * and generates actionable alerts. The LLM receives structured insights.
 *
 * Following the Clockwise MCP model:
 * "The intelligence happens server-side, not sent back for analysis by the agent's LLM."
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { convertForDisplay } from './currency-display-helper'

export class AnalyzeCashFlowTool extends BaseTool {
  getToolName(modelType?: ModelType): string {
    return 'analyze_cash_flow'
  }

  getDescription(modelType?: ModelType): string {
    return `Analyze cash flow health and calculate runway projections.
Returns runway days, monthly burn rate, expense-to-income ratio, and actionable alerts.
The financial analysis is performed server-side - no raw transaction data is returned.
Use this when users ask about cash flow, runway, burn rate, or financial health.
When forecast_months is provided (1-12), returns month-by-month projections with known AR/AP.`
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
            horizon_days: {
              type: "number",
              description: "Analysis period in days (default: 90). For multi-month forecasts, set to months×30 (e.g., 180 for 6 months). Values above 90 auto-switch to monthly projection mode."
            },
            display_currency: {
              type: "string",
              description: "Optional currency code (e.g., 'USD', 'SGD') to show converted amounts alongside home currency."
            },
            forecast_months: {
              type: "number",
              description: "Number of months to forecast (1-12). When set, returns monthly projections with known AR/AP factored in. Use for 'forecast cash flow for next N months'."
            },
            scenario: {
              type: "string",
              enum: ["conservative", "moderate", "optimistic"],
              description: "Projection scenario (default: moderate). Conservative reduces income 20% and increases expenses 20%."
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    if (parameters.horizon_days !== undefined && !parameters.forecast_months) {
      const days = parameters.horizon_days
      if (typeof days !== 'number' || days < 30 || days > 365) {
        return { valid: false, error: 'horizon_days must be between 30 and 365' }
      }
    }
    if (parameters.forecast_months !== undefined) {
      const months = parameters.forecast_months
      if (typeof months !== 'number' || months < 1 || months > 12) {
        return { valid: false, error: 'forecast_months must be between 1 and 12' }
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

    // Monthly forecast mode — call MCP tool
    // Auto-detect: if forecast_months is set, or if horizon_days > 90 (more than default),
    // switch to monthly mode. This compensates for LLMs that pass horizon_days: 180
    // instead of forecast_months: 6 when users ask for multi-month projections.
    // Threshold is >90 (not >=) so the default 90-day health check stays daily.
    let forecastMonths = parameters.forecast_months as number | undefined
    if (!forecastMonths && parameters.horizon_days && (parameters.horizon_days as number) > 90) {
      forecastMonths = Math.min(Math.round((parameters.horizon_days as number) / 30), 12)
    }
    if (forecastMonths) {
      return this.executeMonthlyForecast({ ...parameters, forecast_months: forecastMonths }, userContext)
    }

    try {
      console.log(`[AnalyzeCashFlowTool] Running cash flow analysis for business ${userContext.businessId}`)

      // Call the Category 3 intelligence query
      const result = await this.convex.query(
        this.convexApi.functions.financialIntelligence.analyzeCashFlow,
        {
          businessId: userContext.businessId,
          horizonDays: parameters.horizon_days,
        }
      )

      if (!result) {
        return {
          success: false,
          error: 'Failed to run cash flow analysis'
        }
      }

      console.log(`[AnalyzeCashFlowTool] Analysis complete. Runway: ${result.runwayDays} days, Alerts: ${result.alerts.length}`)

      // Apply currency conversion if requested
      const displayCurrency = parameters.display_currency as string | undefined
      const homeCurrency = userContext.homeCurrency || 'MYR'
      let enrichedResult = result

      if (displayCurrency && displayCurrency !== homeCurrency) {
        const conversion = await convertForDisplay(
          result.estimatedBalance || 0,
          homeCurrency,
          displayCurrency
        )
        if (conversion) {
          enrichedResult = {
            ...result,
            currencyConversion: {
              displayCurrency,
              exchangeRate: conversion.exchangeRate,
              estimatedBalance_converted: conversion.convertedAmount,
              monthlyBurnRate_converted: result.monthlyBurnRate
                ? Math.round(result.monthlyBurnRate * conversion.exchangeRate * 100) / 100
                : undefined,
              totalIncome_converted: result.totalIncome
                ? Math.round(result.totalIncome * conversion.exchangeRate * 100) / 100
                : undefined,
              totalExpenses_converted: result.totalExpenses
                ? Math.round(result.totalExpenses * conversion.exchangeRate * 100) / 100
                : undefined,
            },
          } as any
        }
      }

      return {
        success: true,
        data: enrichedResult,
        metadata: {
          runwayDays: result.runwayDays,
          monthlyBurnRate: result.monthlyBurnRate,
          alertCount: result.alerts.length,
          hasLowRunwayAlert: result.alerts.some(a => a.type === 'low_runway'),
          hasExpenseAlert: result.alerts.some(a => a.type === 'expense_exceeding_income'),
        }
      }
    } catch (error) {
      console.error('[AnalyzeCashFlowTool] Error:', error)
      return {
        success: false,
        error: `Cash flow analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  /**
   * Monthly forecast via MCP forecast_cash_flow tool.
   * Calls the MCP Lambda directly via HTTP with internal service key.
   */
  private async executeMonthlyForecast(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const endpointUrl = process.env.MCP_ENDPOINT_URL
    const serviceKey = process.env.MCP_INTERNAL_SERVICE_KEY

    if (!endpointUrl || !serviceKey) {
      console.warn('[AnalyzeCashFlowTool] MCP not configured, falling back to basic analysis')
      return {
        success: false,
        error: 'Monthly forecast is not available. MCP server not configured.'
      }
    }

    try {
      console.log(`[AnalyzeCashFlowTool] Running monthly forecast for ${parameters.forecast_months} months via MCP`)

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
              forecast_months: parameters.forecast_months,
              granularity: 'monthly',
              scenario: parameters.scenario || 'moderate',
              include_known_ar_ap: true,
            },
            _businessId: userContext.businessId,
          },
        }),
      })

      if (!response.ok) {
        console.error(`[AnalyzeCashFlowTool] MCP HTTP ${response.status}`)
        return { success: false, error: 'Failed to connect to forecast service' }
      }

      const data = await response.json()

      if (data.error) {
        return { success: false, error: data.error.message || 'Forecast failed' }
      }

      // MCP returns result in content[0].text as JSON string
      const textContent = data.result?.content?.find((c: { type: string }) => c.type === 'text')
      if (!textContent?.text) {
        return { success: false, error: 'Forecast returned empty results' }
      }

      const result = JSON.parse(textContent.text)

      if (result.error) {
        return { success: false, error: result.message || 'Forecast failed' }
      }

      console.log(`[AnalyzeCashFlowTool] Monthly forecast complete. Months: ${result.months?.length || 0}`)

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
      console.error('[AnalyzeCashFlowTool] Monthly forecast error:', error)
      return {
        success: false,
        error: `Monthly forecast failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  protected formatResultData(data: any[]): string {
    // This tool returns a single analysis object, not an array
    return ''
  }
}
