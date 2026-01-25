/**
 * MCP Detect Anomalies Tool
 *
 * Wraps the MCP Server detect_anomalies tool for the LangGraph agent.
 * Detects unusual financial transactions using statistical outlier analysis.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from '../base-tool'
import { getMCPClient } from './mcp-client'
import type { DetectAnomaliesOutput, MCPErrorResponse } from '@/lambda/mcp-server/contracts/mcp-tools'
import {
  recallAnomalyPatterns,
  storeAnomalyPatterns,
  formatRecalledPatternsForResponse
} from './mcp-memory-integration'

interface DetectAnomaliesParameters {
  /** Date range to analyze */
  date_range?: {
    start: string
    end: string
  }
  /** Filter to specific expense categories */
  category_filter?: string[]
  /** Detection sensitivity: low, medium, high */
  sensitivity?: 'low' | 'medium' | 'high'
}

export class MCPDetectAnomaliesTool extends BaseTool {
  getToolName(modelType: ModelType = 'openai'): string {
    return modelType === 'gemini' ? 'detect_spending_anomalies' : 'mcp_detect_anomalies'
  }

  getDescription(modelType: ModelType = 'openai'): string {
    if (modelType === 'gemini') {
      return 'ANOMALY DETECTION tool for finding unusual financial transactions using statistical analysis. Use when user asks about unusual expenses, spending outliers, or suspicious transactions.'
    } else {
      return 'Anomaly Detection Tool - Detect unusual financial transactions using statistical outlier analysis (z-score). Use this tool when users ask about anomalies, unusual expenses, spending outliers, or want to identify suspicious transactions. Returns transactions that deviate significantly from historical patterns.'
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
            date_range: {
              type: "object",
              properties: {
                start: { type: "string", description: "Start date YYYY-MM-DD" },
                end: { type: "string", description: "End date YYYY-MM-DD" }
              },
              required: ["start", "end"],
              description: "Date range to analyze (defaults to last 30 days if not specified)"
            },
            category_filter: {
              type: "array",
              items: { type: "string" },
              description: "Optional filter to specific expense categories"
            },
            sensitivity: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "Detection sensitivity: 'low' = only extreme outliers, 'medium' = balanced (default), 'high' = more sensitive"
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as DetectAnomaliesParameters

    // Validate date range if provided
    if (params.date_range) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(params.date_range.start) || !dateRegex.test(params.date_range.end)) {
        return { valid: false, error: 'Date range must use YYYY-MM-DD format' }
      }
      if (params.date_range.start > params.date_range.end) {
        return { valid: false, error: 'Start date must be before end date' }
      }
    }

    // Validate sensitivity if provided
    if (params.sensitivity && !['low', 'medium', 'high'].includes(params.sensitivity)) {
      return { valid: false, error: 'Sensitivity must be: low, medium, or high' }
    }

    // Validate category filter if provided
    if (params.category_filter !== undefined) {
      if (!Array.isArray(params.category_filter)) {
        return { valid: false, error: 'category_filter must be an array of strings' }
      }
    }

    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as DetectAnomaliesParameters

    try {
      console.log(`[MCPDetectAnomaliesTool] Executing for business ${userContext.businessId}`)

      // Validate business context
      if (!userContext.businessId) {
        return {
          success: false,
          error: 'Missing business context. Please ensure you are logged into a business account.'
        }
      }

      // Phase 4: Recall past anomaly patterns for context
      const memoryContext = {
        userId: userContext.userId,
        businessId: userContext.businessId,
        conversationId: userContext.conversationId
      }
      const pastPatterns = await recallAnomalyPatterns(
        memoryContext,
        params.date_range,
        params.category_filter
      )
      if (pastPatterns.length > 0) {
        console.log(`[MCPDetectAnomaliesTool] Recalled ${pastPatterns.length} past anomaly patterns`)
      }

      // Call MCP Server
      const mcpClient = getMCPClient()
      const result = await mcpClient.callTool<DetectAnomaliesOutput | MCPErrorResponse>('detect_anomalies', {
        business_id: userContext.businessId,
        ...params,
      })

      if (!result.success) {
        console.error('[MCPDetectAnomaliesTool] MCP call failed:', result.error)
        return {
          success: false,
          error: result.error?.message || 'Failed to detect anomalies'
        }
      }

      // Check for tool-level error
      const data = result.data as DetectAnomaliesOutput | MCPErrorResponse
      if ('error' in data && data.error) {
        const errorData = data as MCPErrorResponse
        return {
          success: false,
          error: errorData.message || 'Anomaly detection failed'
        }
      }

      const anomalyData = data as DetectAnomaliesOutput

      // Format response for agent
      const summary = anomalyData.summary
      let responseText = `Analyzed ${summary.total_transactions_analyzed} transactions from ${summary.date_range.start} to ${summary.date_range.end}.\n`
      responseText += `Found ${summary.anomalies_found} anomalies using ${summary.sensitivity_used} sensitivity.\n`

      if (anomalyData.anomalies.length > 0) {
        responseText += '\nTop anomalies detected:\n'
        for (const anomaly of anomalyData.anomalies.slice(0, 5)) {
          responseText += `- [${anomaly.severity.toUpperCase()}] ${anomaly.description}: $${anomaly.amount.toLocaleString()} `
          responseText += `(${anomaly.z_score.toFixed(1)}σ above ${anomaly.category_name} average of $${anomaly.category_mean.toLocaleString()})\n`
        }
      } else {
        responseText += '\nNo significant anomalies detected in this period.'
      }

      // Phase 4: Add historical context from past patterns
      if (pastPatterns.length > 0) {
        responseText += formatRecalledPatternsForResponse(pastPatterns)
      }

      // Phase 4: Store new patterns for future learning
      if (anomalyData.anomalies.length > 0) {
        await storeAnomalyPatterns(memoryContext, anomalyData.anomalies.map(a => ({
          description: a.description,
          severity: a.severity,
          category: a.category_name,
          amount: a.amount,
          vendor: a.vendor_name
        })))
      }

      console.log(`[MCPDetectAnomaliesTool] Found ${summary.anomalies_found} anomalies`)

      return {
        success: true,
        data: responseText,
        metadata: {
          anomaliesFound: summary.anomalies_found,
          transactionsAnalyzed: summary.total_transactions_analyzed,
          dateRange: summary.date_range,
          historyRecalled: pastPatterns.length,
          rawData: anomalyData
        }
      }

    } catch (error) {
      console.error('[MCPDetectAnomaliesTool] Execution error:', error)
      return {
        success: false,
        error: `Anomaly detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      console.error('[MCPDetectAnomaliesTool] Missing business context')
      return false
    }

    return true
  }
}
