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

export class AnalyzeCashFlowTool extends BaseTool {
  getToolName(modelType?: ModelType): string {
    return 'analyze_cash_flow'
  }

  getDescription(modelType?: ModelType): string {
    return `Analyze cash flow health and calculate runway projections.
Returns runway days, monthly burn rate, expense-to-income ratio, and actionable alerts.
The financial analysis is performed server-side - no raw transaction data is returned.
Use this when users ask about cash flow, runway, burn rate, or financial health.`
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
              description: "Analysis period in days (default: 90). Uses historical data to calculate burn rate and projections."
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    if (parameters.horizon_days !== undefined) {
      const days = parameters.horizon_days
      if (typeof days !== 'number' || days < 30 || days > 365) {
        return { valid: false, error: 'horizon_days must be between 30 and 365' }
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

      return {
        success: true,
        data: result,
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

  protected formatResultData(data: any[]): string {
    // This tool returns a single analysis object, not an array
    return ''
  }
}
