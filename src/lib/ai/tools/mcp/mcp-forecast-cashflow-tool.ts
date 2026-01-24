/**
 * MCP Forecast Cash Flow Tool
 *
 * Wraps the MCP Server forecast_cash_flow tool for the LangGraph agent.
 * Projects future cash balance based on historical income/expense patterns.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from '../base-tool'
import { getMCPClient } from './mcp-client'
import type { ForecastCashFlowOutput, MCPErrorResponse } from '@/lambda/mcp-server/contracts/mcp-tools'
import {
  recallCashFlowPatterns,
  storeCashFlowPatterns,
  formatRecalledPatternsForResponse
} from './mcp-memory-integration'

interface ForecastCashFlowParameters {
  /** Forecast horizon in days (7-90) */
  horizon_days?: number
  /** Projection scenario */
  scenario?: 'conservative' | 'moderate' | 'optimistic'
  /** Factor in recurring transactions */
  include_recurring?: boolean
}

export class MCPForecastCashFlowTool extends BaseTool {
  getToolName(modelType: ModelType = 'openai'): string {
    return modelType === 'gemini' ? 'forecast_cash_position' : 'mcp_forecast_cash_flow'
  }

  getDescription(modelType: ModelType = 'openai'): string {
    if (modelType === 'gemini') {
      return 'CASH FLOW FORECAST tool for projecting future cash balance based on historical patterns. Use when user asks about cash flow, runway, future balance, or financial projections.'
    } else {
      return 'Cash Flow Forecast Tool - Project future cash balance based on historical income/expense patterns. Use this tool when users ask about cash flow projections, runway estimates, future balance predictions, or want to understand their financial outlook. Supports conservative, moderate, and optimistic scenarios.'
    }
  }

  getToolSchema(modelType: ModelType = 'openai'): OpenAIToolSchema {
    const toolName = this.getToolName(modelType)
    const description = this.getDescription(modelType)

    return {
      type: "function",
      function: {
        name: toolName,
        description,
        parameters: {
          type: "object",
          properties: {
            horizon_days: {
              type: "number",
              description: "Forecast horizon in days (7-90). Default is 30 days."
            },
            scenario: {
              type: "string",
              enum: ["conservative", "moderate", "optimistic"],
              description: "Projection scenario: 'conservative' = pessimistic assumptions, 'moderate' = balanced (default), 'optimistic' = favorable assumptions"
            },
            include_recurring: {
              type: "boolean",
              description: "Whether to factor in detected recurring transactions. Default is true."
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as ForecastCashFlowParameters

    // Validate horizon_days if provided
    if (params.horizon_days !== undefined) {
      if (typeof params.horizon_days !== 'number' || params.horizon_days < 7 || params.horizon_days > 90) {
        return { valid: false, error: 'horizon_days must be between 7 and 90' }
      }
    }

    // Validate scenario if provided
    if (params.scenario && !['conservative', 'moderate', 'optimistic'].includes(params.scenario)) {
      return { valid: false, error: 'scenario must be: conservative, moderate, or optimistic' }
    }

    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as ForecastCashFlowParameters

    try {
      console.log(`[MCPForecastCashFlowTool] Executing for business ${userContext.businessId}`)

      // Validate business context
      if (!userContext.businessId) {
        return {
          success: false,
          error: 'Missing business context. Please ensure you are logged into a business account.'
        }
      }

      // Phase 4: Recall past cash flow patterns for context
      const memoryContext = {
        userId: userContext.userId,
        businessId: userContext.businessId,
        conversationId: userContext.conversationId
      }
      const pastPatterns = await recallCashFlowPatterns(memoryContext)
      if (pastPatterns.length > 0) {
        console.log(`[MCPForecastCashFlowTool] Recalled ${pastPatterns.length} past cash flow patterns`)
      }

      // Call MCP Server
      const mcpClient = getMCPClient()
      const result = await mcpClient.callTool<ForecastCashFlowOutput | MCPErrorResponse>('forecast_cash_flow', {
        business_id: userContext.businessId,
        ...params,
      })

      if (!result.success) {
        console.error('[MCPForecastCashFlowTool] MCP call failed:', result.error)
        return {
          success: false,
          error: result.error?.message || 'Failed to forecast cash flow'
        }
      }

      // Check for tool-level error
      const data = result.data as ForecastCashFlowOutput | MCPErrorResponse
      if ('error' in data && data.error) {
        const errorData = data as MCPErrorResponse
        return {
          success: false,
          error: errorData.message || 'Cash flow forecast failed'
        }
      }

      const forecastData = data as ForecastCashFlowOutput
      const summary = forecastData.summary

      // Format response for agent
      let responseText = `## Cash Flow Forecast (${summary.scenario_used} scenario, ${summary.horizon_days} days)\n\n`
      responseText += `**Current Balance:** $${summary.current_balance.toLocaleString()}\n`
      responseText += `**Projected End Balance:** $${summary.projected_end_balance.toLocaleString()}\n`
      responseText += `**Net Change:** ${summary.net_change >= 0 ? '+' : ''}$${summary.net_change.toLocaleString()}\n\n`

      responseText += `**Projections:**\n`
      responseText += `- Expected Income: $${summary.total_projected_income.toLocaleString()}\n`
      responseText += `- Expected Expenses: $${summary.total_projected_expenses.toLocaleString()}\n`
      responseText += `- Daily Burn Rate: $${summary.burn_rate_daily.toLocaleString()}/day\n`

      if (summary.runway_days !== undefined) {
        responseText += `- Estimated Runway: ${summary.runway_days} days\n`
      }

      // Add alerts
      if (forecastData.alerts.length > 0) {
        responseText += `\n**⚠️ Alerts:**\n`
        for (const alert of forecastData.alerts) {
          const icon = alert.severity === 'critical' ? '🔴' : '🟡'
          responseText += `${icon} ${alert.message}\n`
          if (alert.recommendation) {
            responseText += `   → ${alert.recommendation}\n`
          }
        }
      }

      // Phase 4: Add historical context from past patterns
      if (pastPatterns.length > 0) {
        responseText += formatRecalledPatternsForResponse(pastPatterns)
      }

      // Phase 4: Store new cash flow patterns for future learning
      await storeCashFlowPatterns(memoryContext, {
        currentBalance: summary.current_balance,
        projectedEndBalance: summary.projected_end_balance,
        netChange: summary.net_change,
        runwayDays: summary.runway_days,
        scenario: summary.scenario_used,
        horizonDays: summary.horizon_days,
        alerts: forecastData.alerts.map(a => ({
          message: a.message,
          severity: a.severity
        }))
      })

      console.log(`[MCPForecastCashFlowTool] Forecast complete with ${forecastData.alerts.length} alerts`)

      return {
        success: true,
        data: responseText,
        metadata: {
          currentBalance: summary.current_balance,
          projectedEndBalance: summary.projected_end_balance,
          netChange: summary.net_change,
          runwayDays: summary.runway_days,
          alertCount: forecastData.alerts.length,
          historyRecalled: pastPatterns.length,
          rawData: forecastData
        }
      }

    } catch (error) {
      console.error('[MCPForecastCashFlowTool] Execution error:', error)
      return {
        success: false,
        error: `Cash flow forecast failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  protected formatResultData(data: unknown[]): string {
    return JSON.stringify(data, null, 2)
  }

  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    const basePermission = await super.checkUserPermissions(userContext)
    if (!basePermission) return false

    // Requires business context
    if (!userContext.businessId) {
      console.error('[MCPForecastCashFlowTool] Missing business context')
      return false
    }

    return true
  }
}
