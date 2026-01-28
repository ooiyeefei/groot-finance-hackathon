/**
 * Analyze Vendor Risk Tool - Category 3 Domain Intelligence
 *
 * THIS IS CATEGORY 3: Server calculates risk scores using domain heuristics
 * (missing info, payment irregularity, inactivity). Returns structured risk assessments.
 *
 * Following the Clockwise MCP model:
 * "The intelligence happens server-side, not sent back for analysis by the agent's LLM."
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'

export class AnalyzeVendorRiskTool extends BaseTool {
  getToolName(modelType?: ModelType): string {
    return 'analyze_vendor_risk'
  }

  getDescription(modelType?: ModelType): string {
    return `Analyze vendor risk using domain-specific heuristics and scoring.
Returns risk scores (0-100) with detailed risk factors for each flagged vendor.
Risk factors include: missing contact info, no tax ID, irregular payments, inactivity.
The risk analysis is performed server-side - no raw vendor data is returned.
Use this when users ask about vendor risk, supplier reliability, or compliance issues.`
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
            vendor_id: {
              type: "string",
              description: "Optional: Analyze a specific vendor by ID. If not provided, analyzes all vendors."
            },
            risk_threshold: {
              type: "number",
              description: "Minimum risk score to include in results (default: 70). Lower = more vendors returned."
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    if (parameters.risk_threshold !== undefined) {
      const threshold = parameters.risk_threshold
      if (typeof threshold !== 'number' || threshold < 0 || threshold > 100) {
        return { valid: false, error: 'risk_threshold must be between 0 and 100' }
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
      console.log(`[AnalyzeVendorRiskTool] Running vendor risk analysis for business ${userContext.businessId}`)

      // Call the Category 3 intelligence query
      const result = await this.convex.query(
        this.convexApi.functions.financialIntelligence.analyzeVendorRisk,
        {
          businessId: userContext.businessId,
          vendorId: parameters.vendor_id,
          riskThreshold: parameters.risk_threshold,
        }
      )

      if (!result) {
        return {
          success: false,
          error: 'Failed to run vendor risk analysis'
        }
      }

      console.log(`[AnalyzeVendorRiskTool] Analysis complete. High-risk vendors: ${result.highRiskCount}/${result.totalVendorsAnalyzed}`)

      return {
        success: true,
        data: result,
        metadata: {
          vendorsAnalyzed: result.totalVendorsAnalyzed,
          highRiskCount: result.highRiskCount,
          flaggedVendorCount: result.vendors.length,
        }
      }
    } catch (error) {
      console.error('[AnalyzeVendorRiskTool] Error:', error)
      return {
        success: false,
        error: `Vendor risk analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  protected formatResultData(data: any[]): string {
    return data.map((vendor, i) =>
      `${i + 1}. ${vendor.vendorName} (Risk Score: ${vendor.riskScore}/100)\n` +
      `   Severity: ${vendor.severity}\n` +
      `   Risk Factors: ${vendor.riskFactors.join(', ')}\n` +
      `   Recent Spend: ${vendor.recentSpend.toLocaleString()}`
    ).join('\n\n')
  }
}
