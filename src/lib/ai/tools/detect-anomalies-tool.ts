/**
 * Detect Anomalies Tool - Category 3 Domain Intelligence
 *
 * THIS IS CATEGORY 3: Server performs statistical analysis (Z-score, standard deviation)
 * and returns structured anomaly insights. The LLM does NOT analyze raw transaction data.
 *
 * Following the Clockwise MCP model:
 * "The intelligence happens server-side, not sent back for analysis by the agent's LLM."
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'

export class DetectAnomaliesTool extends BaseTool {
  getToolName(modelType?: ModelType): string {
    return 'detect_anomalies'
  }

  getDescription(modelType?: ModelType): string {
    return `Detect unusual expenses using statistical anomaly detection (Z-score analysis).
Returns transactions with amounts significantly above category averages (>2 standard deviations).
The analysis is performed server-side - no raw transaction data is returned for LLM analysis.
Use this when users ask about unusual expenses, outliers, or suspicious transactions.`
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
            date_range_days: {
              type: "number",
              description: "Number of days to analyze (default: 90). Larger ranges provide better baselines."
            },
            sensitivity: {
              type: "string",
              enum: ["high", "medium", "low"],
              description: "Detection sensitivity. 'high' = 1.5σ (more anomalies), 'medium' = 2σ (balanced), 'low' = 3σ (only extreme outliers)"
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    // All parameters are optional with sensible defaults
    if (parameters.date_range_days !== undefined) {
      const days = parameters.date_range_days
      if (typeof days !== 'number' || days < 7 || days > 365) {
        return { valid: false, error: 'date_range_days must be between 7 and 365' }
      }
    }

    if (parameters.sensitivity !== undefined) {
      const valid = ['high', 'medium', 'low'].includes(parameters.sensitivity)
      if (!valid) {
        return { valid: false, error: 'sensitivity must be "high", "medium", or "low"' }
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
      console.log(`[DetectAnomaliesTool] Running anomaly detection for business ${userContext.businessId}`)

      // Call the Category 3 intelligence query
      const result = await this.convex.query(
        this.convexApi.functions.financialIntelligence.detectAnomalies,
        {
          businessId: userContext.businessId,
          dateRangeDays: parameters.date_range_days,
          sensitivity: parameters.sensitivity,
        }
      )

      if (!result) {
        return {
          success: false,
          error: 'Failed to run anomaly detection'
        }
      }

      console.log(`[DetectAnomaliesTool] Found ${result.anomalies.length} anomalies in ${result.analyzedTransactions} transactions`)

      return {
        success: true,
        data: result,
        metadata: {
          anomalyCount: result.anomalies.length,
          analyzedTransactions: result.analyzedTransactions,
          categoriesAnalyzed: result.categoriesAnalyzed,
          periodDays: result.periodDays,
        }
      }
    } catch (error) {
      console.error('[DetectAnomaliesTool] Error:', error)
      return {
        success: false,
        error: `Anomaly detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  protected formatResultData(data: any[]): string {
    return data.map((anomaly, i) =>
      `${i + 1}. ${anomaly.description} (${anomaly.category})\n` +
      `   Amount: ${anomaly.amount.toLocaleString()}\n` +
      `   Z-Score: ${anomaly.zScore}σ (${anomaly.severity} severity)\n` +
      `   Baseline: ${anomaly.baseline.toLocaleString()}`
    ).join('\n\n')
  }
}
