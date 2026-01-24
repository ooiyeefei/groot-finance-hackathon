/**
 * MCP Tool Orchestration (Phase 5)
 *
 * Provides multi-tool orchestration for compound financial analysis:
 * - Comprehensive financial health check (all tools)
 * - Risk assessment (anomalies + vendor risk)
 * - Cash position analysis (cash flow + anomalies)
 *
 * These orchestration helpers allow the agent to perform
 * coordinated analysis across multiple domains.
 */

import { getMCPClient } from './mcp-client'
import type {
  DetectAnomaliesOutput,
  ForecastCashFlowOutput,
  AnalyzeVendorRiskOutput,
  MCPErrorResponse
} from '@/lambda/mcp-server/contracts/mcp-tools'

// ============================================================================
// Types
// ============================================================================

export interface OrchestrationContext {
  businessId: string
  userId: string
  conversationId?: string
}

export interface ComprehensiveAnalysisResult {
  success: boolean
  anomalies?: DetectAnomaliesOutput
  cashFlow?: ForecastCashFlowOutput
  vendorRisk?: AnalyzeVendorRiskOutput
  summary: string
  recommendations: string[]
  overallRiskScore: number
  errors: string[]
}

export interface RiskAssessmentResult {
  success: boolean
  anomalyData?: DetectAnomaliesOutput
  vendorData?: AnalyzeVendorRiskOutput
  summary: string
  riskFactors: Array<{
    category: string
    severity: 'critical' | 'high' | 'medium' | 'low'
    description: string
    recommendation: string
  }>
  overallRiskLevel: 'critical' | 'high' | 'medium' | 'low'
  errors: string[]
}

export interface CashPositionResult {
  success: boolean
  cashFlow?: ForecastCashFlowOutput
  anomalies?: DetectAnomaliesOutput
  summary: string
  alerts: string[]
  outlook: 'positive' | 'stable' | 'concerning' | 'critical'
  errors: string[]
}

// ============================================================================
// Orchestration Functions
// ============================================================================

/**
 * Run comprehensive financial health check
 * Combines anomaly detection, cash flow forecast, and vendor risk analysis
 */
export async function runComprehensiveAnalysis(
  context: OrchestrationContext,
  options?: {
    dateRange?: { start: string; end: string }
    forecastDays?: number
    sensitivity?: 'low' | 'medium' | 'high'
  }
): Promise<ComprehensiveAnalysisResult> {
  const errors: string[] = []
  const recommendations: string[] = []
  let overallRiskScore = 0

  const mcpClient = getMCPClient()

  // Run all three analyses in parallel for efficiency
  const [anomalyResult, cashFlowResult, vendorResult] = await Promise.allSettled([
    // Anomaly Detection
    mcpClient.callTool<DetectAnomaliesOutput | MCPErrorResponse>('detect_anomalies', {
      business_id: context.businessId,
      date_range: options?.dateRange,
      sensitivity: options?.sensitivity || 'medium'
    }),
    // Cash Flow Forecast
    mcpClient.callTool<ForecastCashFlowOutput | MCPErrorResponse>('forecast_cash_flow', {
      business_id: context.businessId,
      horizon_days: options?.forecastDays || 30,
      scenario: 'moderate'
    }),
    // Vendor Risk Analysis
    mcpClient.callTool<AnalyzeVendorRiskOutput | MCPErrorResponse>('analyze_vendor_risk', {
      business_id: context.businessId,
      analysis_period_days: 90,
      include_concentration: true,
      include_spending_changes: true
    })
  ])

  // Process anomaly results
  let anomalies: DetectAnomaliesOutput | undefined
  if (anomalyResult.status === 'fulfilled' && anomalyResult.value.success) {
    const data = anomalyResult.value.data
    if (data && !('error' in data)) {
      anomalies = data as DetectAnomaliesOutput
      const highSeverityCount = anomalies.anomalies.filter(a => a.severity === 'high').length
      const mediumSeverityCount = anomalies.anomalies.filter(a => a.severity === 'medium').length
      overallRiskScore += highSeverityCount * 20 + mediumSeverityCount * 10

      if (highSeverityCount > 0) {
        recommendations.push(`Review ${highSeverityCount} high-severity spending anomalies immediately`)
      }
      if (mediumSeverityCount > 2) {
        recommendations.push(`Investigate ${mediumSeverityCount} medium-severity anomalies for patterns`)
      }
    }
  } else {
    errors.push('Anomaly detection failed')
  }

  // Process cash flow results
  let cashFlow: ForecastCashFlowOutput | undefined
  if (cashFlowResult.status === 'fulfilled' && cashFlowResult.value.success) {
    const data = cashFlowResult.value.data
    if (data && !('error' in data)) {
      cashFlow = data as ForecastCashFlowOutput
      const summary = cashFlow.summary

      if (summary.net_change < 0) {
        overallRiskScore += Math.min(30, Math.abs(summary.net_change / 1000))
        recommendations.push('Cash outflow exceeds inflow - review expense reduction opportunities')
      }

      if (summary.runway_days !== undefined && summary.runway_days < 30) {
        overallRiskScore += 40
        recommendations.push(`Critical: Only ${summary.runway_days} days of runway - take immediate action`)
      }

      if (cashFlow.alerts.some(a => a.severity === 'critical')) {
        overallRiskScore += 20
      }
    }
  } else {
    errors.push('Cash flow forecast failed')
  }

  // Process vendor risk results
  let vendorRisk: AnalyzeVendorRiskOutput | undefined
  if (vendorResult.status === 'fulfilled' && vendorResult.value.success) {
    const data = vendorResult.value.data
    if (data && !('error' in data)) {
      vendorRisk = data as AnalyzeVendorRiskOutput
      const summary = vendorRisk.summary

      overallRiskScore += summary.high_risk_vendors * 10
      overallRiskScore += summary.concentration_risks_found * 15

      if (summary.high_risk_vendors > 0) {
        recommendations.push(`Evaluate ${summary.high_risk_vendors} high-risk vendor relationships`)
      }
      if (summary.concentration_risks_found > 0) {
        recommendations.push('Diversify vendor base to reduce concentration risk')
      }
    }
  } else {
    errors.push('Vendor risk analysis failed')
  }

  // Cap risk score at 100
  overallRiskScore = Math.min(100, overallRiskScore)

  // Generate summary
  const summary = generateComprehensiveSummary(anomalies, cashFlow, vendorRisk, overallRiskScore)

  return {
    success: errors.length < 3, // Success if at least one analysis worked
    anomalies,
    cashFlow,
    vendorRisk,
    summary,
    recommendations,
    overallRiskScore,
    errors
  }
}

/**
 * Run focused risk assessment
 * Combines anomaly detection with vendor risk analysis
 */
export async function runRiskAssessment(
  context: OrchestrationContext,
  options?: {
    dateRange?: { start: string; end: string }
    sensitivity?: 'low' | 'medium' | 'high'
  }
): Promise<RiskAssessmentResult> {
  const errors: string[] = []
  const riskFactors: RiskAssessmentResult['riskFactors'] = []

  const mcpClient = getMCPClient()

  // Run both analyses in parallel
  const [anomalyResult, vendorResult] = await Promise.allSettled([
    mcpClient.callTool<DetectAnomaliesOutput | MCPErrorResponse>('detect_anomalies', {
      business_id: context.businessId,
      date_range: options?.dateRange,
      sensitivity: options?.sensitivity || 'high' // Higher sensitivity for risk assessment
    }),
    mcpClient.callTool<AnalyzeVendorRiskOutput | MCPErrorResponse>('analyze_vendor_risk', {
      business_id: context.businessId,
      analysis_period_days: 90,
      include_concentration: true,
      include_spending_changes: true
    })
  ])

  // Process anomalies into risk factors
  let anomalyData: DetectAnomaliesOutput | undefined
  if (anomalyResult.status === 'fulfilled' && anomalyResult.value.success) {
    const data = anomalyResult.value.data
    if (data && !('error' in data)) {
      anomalyData = data as DetectAnomaliesOutput
      for (const anomaly of anomalyData.anomalies) {
        riskFactors.push({
          category: 'spending_anomaly',
          severity: anomaly.severity as 'high' | 'medium',
          description: `${anomaly.description}: $${anomaly.amount.toLocaleString()} (${anomaly.z_score.toFixed(1)}σ deviation)`,
          recommendation: `Review transaction and verify legitimacy`
        })
      }
    }
  } else {
    errors.push('Anomaly detection failed')
  }

  // Process vendor risks
  let vendorData: AnalyzeVendorRiskOutput | undefined
  if (vendorResult.status === 'fulfilled' && vendorResult.value.success) {
    const data = vendorResult.value.data
    if (data && !('error' in data)) {
      vendorData = data as AnalyzeVendorRiskOutput

      // Add concentration risks
      for (const risk of vendorData.concentration_risks) {
        riskFactors.push({
          category: 'vendor_concentration',
          severity: risk.severity as 'critical' | 'high' | 'medium',
          description: risk.message,
          recommendation: risk.recommendation || 'Diversify vendor relationships'
        })
      }

      // Add high-risk vendors
      for (const vendor of vendorData.vendors.filter(v => v.risk_score >= 50)) {
        riskFactors.push({
          category: 'vendor_risk',
          severity: vendor.risk_score >= 75 ? 'high' : 'medium',
          description: `${vendor.vendor_name}: Risk score ${vendor.risk_score} - ${vendor.risk_factors.join(', ')}`,
          recommendation: `Review relationship with ${vendor.vendor_name}`
        })
      }
    }
  } else {
    errors.push('Vendor risk analysis failed')
  }

  // Calculate overall risk level
  const overallRiskLevel = calculateOverallRiskLevel(riskFactors)
  const summary = generateRiskSummary(riskFactors, overallRiskLevel)

  return {
    success: errors.length < 2,
    anomalyData,
    vendorData,
    summary,
    riskFactors,
    overallRiskLevel,
    errors
  }
}

/**
 * Run cash position analysis
 * Combines cash flow forecast with anomaly detection for expense context
 */
export async function runCashPositionAnalysis(
  context: OrchestrationContext,
  options?: {
    forecastDays?: number
    scenario?: 'conservative' | 'moderate' | 'optimistic'
  }
): Promise<CashPositionResult> {
  const errors: string[] = []
  const alerts: string[] = []

  const mcpClient = getMCPClient()

  // Run cash flow and anomaly detection in parallel
  const [cashFlowResult, anomalyResult] = await Promise.allSettled([
    mcpClient.callTool<ForecastCashFlowOutput | MCPErrorResponse>('forecast_cash_flow', {
      business_id: context.businessId,
      horizon_days: options?.forecastDays || 30,
      scenario: options?.scenario || 'moderate',
      include_recurring: true
    }),
    mcpClient.callTool<DetectAnomaliesOutput | MCPErrorResponse>('detect_anomalies', {
      business_id: context.businessId,
      sensitivity: 'medium'
    })
  ])

  let cashFlow: ForecastCashFlowOutput | undefined
  let anomalies: DetectAnomaliesOutput | undefined
  let outlook: CashPositionResult['outlook'] = 'stable'

  // Process cash flow
  if (cashFlowResult.status === 'fulfilled' && cashFlowResult.value.success) {
    const data = cashFlowResult.value.data
    if (data && !('error' in data)) {
      cashFlow = data as ForecastCashFlowOutput
      const summary = cashFlow.summary

      // Determine outlook based on cash flow
      if (summary.runway_days !== undefined && summary.runway_days < 14) {
        outlook = 'critical'
        alerts.push(`CRITICAL: Only ${summary.runway_days} days of runway`)
      } else if (summary.net_change < -10000 || (summary.runway_days !== undefined && summary.runway_days < 30)) {
        outlook = 'concerning'
        alerts.push(`Warning: Negative cash trajectory`)
      } else if (summary.net_change > 0) {
        outlook = 'positive'
      }

      // Add cash flow alerts
      for (const alert of cashFlow.alerts) {
        alerts.push(`${alert.severity === 'critical' ? '🔴' : '🟡'} ${alert.message}`)
      }
    }
  } else {
    errors.push('Cash flow forecast failed')
    outlook = 'concerning' // Default to concerning if we can't forecast
  }

  // Process anomalies to add context
  if (anomalyResult.status === 'fulfilled' && anomalyResult.value.success) {
    const data = anomalyResult.value.data
    if (data && !('error' in data)) {
      anomalies = data as DetectAnomaliesOutput
      const highSeverity = anomalies.anomalies.filter(a => a.severity === 'high')

      if (highSeverity.length > 0) {
        alerts.push(`${highSeverity.length} unusual expenses may impact cash position`)
        if (outlook === 'stable') {
          outlook = 'concerning' // Downgrade if we have high-severity anomalies
        }
      }
    }
  } else {
    errors.push('Anomaly detection failed')
  }

  const summary = generateCashPositionSummary(cashFlow, anomalies, outlook)

  return {
    success: errors.length < 2,
    cashFlow,
    anomalies,
    summary,
    alerts,
    outlook,
    errors
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateComprehensiveSummary(
  anomalies?: DetectAnomaliesOutput,
  cashFlow?: ForecastCashFlowOutput,
  vendorRisk?: AnalyzeVendorRiskOutput,
  riskScore?: number
): string {
  const parts: string[] = ['## Financial Health Summary\n']

  if (riskScore !== undefined) {
    const riskLabel = riskScore >= 70 ? '🔴 High Risk' :
                      riskScore >= 40 ? '🟡 Medium Risk' :
                      '🟢 Low Risk'
    parts.push(`**Overall Risk Score:** ${riskScore}/100 (${riskLabel})\n`)
  }

  if (anomalies) {
    const s = anomalies.summary
    parts.push(`\n### Spending Analysis`)
    parts.push(`- Analyzed ${s.total_transactions_analyzed} transactions`)
    parts.push(`- Found ${s.anomalies_found} anomalies`)
  }

  if (cashFlow) {
    const s = cashFlow.summary
    parts.push(`\n### Cash Position`)
    parts.push(`- Current: $${s.current_balance.toLocaleString()}`)
    parts.push(`- ${s.horizon_days}-day projection: $${s.projected_end_balance.toLocaleString()}`)
    parts.push(`- Net change: ${s.net_change >= 0 ? '+' : ''}$${s.net_change.toLocaleString()}`)
    if (s.runway_days !== undefined) {
      parts.push(`- Runway: ${s.runway_days} days`)
    }
  }

  if (vendorRisk) {
    const s = vendorRisk.summary
    parts.push(`\n### Vendor Risk`)
    parts.push(`- Total vendors: ${s.total_vendors}`)
    parts.push(`- High-risk vendors: ${s.high_risk_vendors}`)
    parts.push(`- Concentration risks: ${s.concentration_risks_found}`)
  }

  return parts.join('\n')
}

function calculateOverallRiskLevel(
  riskFactors: RiskAssessmentResult['riskFactors']
): 'critical' | 'high' | 'medium' | 'low' {
  const criticalCount = riskFactors.filter(r => r.severity === 'critical').length
  const highCount = riskFactors.filter(r => r.severity === 'high').length
  const mediumCount = riskFactors.filter(r => r.severity === 'medium').length

  if (criticalCount > 0) return 'critical'
  if (highCount >= 3) return 'critical'
  if (highCount > 0) return 'high'
  if (mediumCount >= 5) return 'high'
  if (mediumCount > 0) return 'medium'
  return 'low'
}

function generateRiskSummary(
  riskFactors: RiskAssessmentResult['riskFactors'],
  overallRiskLevel: string
): string {
  const levelIcon = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢'
  }[overallRiskLevel] || '⚪'

  let summary = `## Risk Assessment\n`
  summary += `**Overall Risk Level:** ${levelIcon} ${overallRiskLevel.toUpperCase()}\n\n`
  summary += `**Risk Factors Found:** ${riskFactors.length}\n`

  if (riskFactors.length > 0) {
    summary += `\n### Top Risk Factors\n`
    for (const factor of riskFactors.slice(0, 5)) {
      const icon = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[factor.severity]
      summary += `- ${icon} [${factor.category}] ${factor.description}\n`
    }
  }

  return summary
}

function generateCashPositionSummary(
  cashFlow?: ForecastCashFlowOutput,
  anomalies?: DetectAnomaliesOutput,
  outlook?: string
): string {
  const outlookIcon = {
    positive: '🟢',
    stable: '🟡',
    concerning: '🟠',
    critical: '🔴'
  }[outlook || 'stable'] || '⚪'

  let summary = `## Cash Position Analysis\n`
  summary += `**Outlook:** ${outlookIcon} ${(outlook || 'unknown').toUpperCase()}\n\n`

  if (cashFlow) {
    const s = cashFlow.summary
    summary += `### Cash Flow Forecast (${s.horizon_days} days, ${s.scenario_used})\n`
    summary += `- Current Balance: $${s.current_balance.toLocaleString()}\n`
    summary += `- Projected Balance: $${s.projected_end_balance.toLocaleString()}\n`
    summary += `- Daily Burn Rate: $${s.burn_rate_daily.toLocaleString()}/day\n`
    if (s.runway_days !== undefined) {
      summary += `- Runway: ${s.runway_days} days\n`
    }
  }

  if (anomalies && anomalies.anomalies.length > 0) {
    summary += `\n### Expense Anomalies Affecting Position\n`
    summary += `${anomalies.anomalies.length} unusual expenses detected that may impact cash\n`
  }

  return summary
}
