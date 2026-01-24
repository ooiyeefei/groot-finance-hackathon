/**
 * MCP Analyze Vendor Risk Tool
 *
 * Wraps the MCP Server analyze_vendor_risk tool for the LangGraph agent.
 * Analyzes vendor concentration, spending changes, and risk factors.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from '../base-tool'
import { getMCPClient } from './mcp-client'
import type { AnalyzeVendorRiskOutput, MCPErrorResponse } from '@/lambda/mcp-server/contracts/mcp-tools'
import {
  recallVendorRiskPatterns,
  storeVendorRiskPatterns,
  formatRecalledPatternsForResponse
} from './mcp-memory-integration'

interface AnalyzeVendorRiskParameters {
  /** Filter to specific vendor names */
  vendor_filter?: string[]
  /** Lookback period in days (7-365) */
  analysis_period_days?: number
  /** Include vendor concentration risk analysis */
  include_concentration?: boolean
  /** Include spending trend analysis */
  include_spending_changes?: boolean
}

export class MCPAnalyzeVendorRiskTool extends BaseTool {
  getToolName(modelType: ModelType = 'openai'): string {
    return modelType === 'gemini' ? 'analyze_vendor_concentration' : 'mcp_analyze_vendor_risk'
  }

  getDescription(modelType: ModelType = 'openai'): string {
    if (modelType === 'gemini') {
      return 'VENDOR RISK ANALYSIS tool for analyzing vendor concentration, spending changes, and supplier risk factors. Use when user asks about vendor analysis, supplier risk, spending patterns by vendor, or dependency risks.'
    } else {
      return 'Vendor Risk Analysis Tool - Analyze vendor concentration, spending changes, and risk factors. Use this tool when users ask about vendor analysis, supplier risk, spending patterns by vendor, concentration risks, or want to understand their vendor dependencies. Identifies high-risk vendors and spending trends.'
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
            vendor_filter: {
              type: "array",
              items: { type: "string" },
              description: "Optional filter to analyze specific vendors only"
            },
            analysis_period_days: {
              type: "number",
              description: "Lookback period in days (7-365). Default is 90 days."
            },
            include_concentration: {
              type: "boolean",
              description: "Include vendor concentration risk analysis. Default is true."
            },
            include_spending_changes: {
              type: "boolean",
              description: "Include spending trend analysis showing significant changes. Default is true."
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as AnalyzeVendorRiskParameters

    // Validate analysis_period_days if provided
    if (params.analysis_period_days !== undefined) {
      if (typeof params.analysis_period_days !== 'number' || params.analysis_period_days < 7 || params.analysis_period_days > 365) {
        return { valid: false, error: 'analysis_period_days must be between 7 and 365' }
      }
    }

    // Validate vendor_filter if provided
    if (params.vendor_filter !== undefined) {
      if (!Array.isArray(params.vendor_filter)) {
        return { valid: false, error: 'vendor_filter must be an array of strings' }
      }
    }

    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as AnalyzeVendorRiskParameters

    try {
      console.log(`[MCPAnalyzeVendorRiskTool] Executing for business ${userContext.businessId}`)

      // Validate business context
      if (!userContext.businessId) {
        return {
          success: false,
          error: 'Missing business context. Please ensure you are logged into a business account.'
        }
      }

      // Phase 4: Recall past vendor risk patterns for context
      const memoryContext = {
        userId: userContext.userId,
        businessId: userContext.businessId,
        conversationId: userContext.conversationId
      }
      const pastPatterns = await recallVendorRiskPatterns(memoryContext, params.vendor_filter)
      if (pastPatterns.length > 0) {
        console.log(`[MCPAnalyzeVendorRiskTool] Recalled ${pastPatterns.length} past vendor risk patterns`)
      }

      // Call MCP Server
      const mcpClient = getMCPClient()
      const result = await mcpClient.callTool<AnalyzeVendorRiskOutput | MCPErrorResponse>('analyze_vendor_risk', {
        business_id: userContext.businessId,
        ...params,
      })

      if (!result.success) {
        console.error('[MCPAnalyzeVendorRiskTool] MCP call failed:', result.error)
        return {
          success: false,
          error: result.error?.message || 'Failed to analyze vendor risk'
        }
      }

      // Check for tool-level error
      const data = result.data as AnalyzeVendorRiskOutput | MCPErrorResponse
      if ('error' in data && data.error) {
        const errorData = data as MCPErrorResponse
        return {
          success: false,
          error: errorData.message || 'Vendor risk analysis failed'
        }
      }

      const vendorData = data as AnalyzeVendorRiskOutput
      const summary = vendorData.summary

      // Format response for agent
      let responseText = `## Vendor Risk Analysis\n`
      responseText += `**Period:** ${summary.analysis_period.start} to ${summary.analysis_period.end}\n`
      responseText += `**Total Vendors:** ${summary.total_vendors}\n`
      responseText += `**Total Spend:** $${summary.total_spend.toLocaleString()}\n`
      responseText += `**High Risk Vendors:** ${summary.high_risk_vendors}\n\n`

      // Top vendors by spend
      if (vendorData.vendors.length > 0) {
        responseText += `### Top Vendors by Spend\n`
        for (const vendor of vendorData.vendors.slice(0, 5)) {
          const riskIcon = vendor.risk_score >= 50 ? '🔴' : vendor.risk_score >= 25 ? '🟡' : '🟢'
          responseText += `${riskIcon} **${vendor.vendor_name}** - $${vendor.total_spend.toLocaleString()} (${vendor.spend_percentage}%)\n`
          responseText += `   Trend: ${vendor.spending_trend}${vendor.trend_percentage ? ` (${vendor.trend_percentage > 0 ? '+' : ''}${vendor.trend_percentage}%)` : ''}\n`
          if (vendor.risk_factors.length > 0) {
            responseText += `   Risk: ${vendor.risk_factors.join(', ')}\n`
          }
        }
      }

      // Concentration risks
      if (vendorData.concentration_risks.length > 0) {
        responseText += `\n### ⚠️ Concentration Risks\n`
        for (const risk of vendorData.concentration_risks) {
          const icon = risk.severity === 'critical' ? '🔴' : risk.severity === 'high' ? '🟠' : '🟡'
          responseText += `${icon} ${risk.message}\n`
          if (risk.recommendation) {
            responseText += `   → ${risk.recommendation}\n`
          }
        }
      }

      // Spending changes
      if (vendorData.spending_changes.length > 0) {
        responseText += `\n### 📊 Significant Spending Changes\n`
        for (const change of vendorData.spending_changes.slice(0, 5)) {
          const icon = change.change_direction === 'increase' ? '📈' : '📉'
          responseText += `${icon} **${change.vendor_name}**: ${change.change_percentage > 0 ? '+' : ''}${change.change_percentage}% `
          responseText += `($${change.previous_period_spend.toLocaleString()} → $${change.current_period_spend.toLocaleString()})\n`
        }
      }

      // Phase 4: Add historical context from past patterns
      if (pastPatterns.length > 0) {
        responseText += formatRecalledPatternsForResponse(pastPatterns)
      }

      // Phase 4: Store new vendor risk patterns for future learning
      await storeVendorRiskPatterns(
        memoryContext,
        vendorData.vendors.map(v => ({
          vendorName: v.vendor_name,
          riskScore: v.risk_score,
          totalSpend: v.total_spend,
          spendingTrend: v.spending_trend,
          riskFactors: v.risk_factors
        })),
        vendorData.concentration_risks.map(r => ({
          message: r.message,
          severity: r.severity
        }))
      )

      console.log(`[MCPAnalyzeVendorRiskTool] Analysis complete: ${summary.total_vendors} vendors, ${summary.concentration_risks_found} concentration risks`)

      return {
        success: true,
        data: responseText,
        metadata: {
          totalVendors: summary.total_vendors,
          totalSpend: summary.total_spend,
          highRiskVendors: summary.high_risk_vendors,
          concentrationRisks: summary.concentration_risks_found,
          spendingChanges: summary.significant_spending_changes,
          historyRecalled: pastPatterns.length,
          rawData: vendorData
        }
      }

    } catch (error) {
      console.error('[MCPAnalyzeVendorRiskTool] Execution error:', error)
      return {
        success: false,
        error: `Vendor risk analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      console.error('[MCPAnalyzeVendorRiskTool] Missing business context')
      return false
    }

    return true
  }
}
