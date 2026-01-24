/**
 * MCP Memory Integration (Phase 4)
 *
 * Provides memory-enhanced analysis for MCP tools by:
 * 1. Recalling relevant past patterns before analysis
 * 2. Storing new patterns after analysis for future learning
 *
 * This creates a self-improving loop where the agent learns from
 * historical patterns to provide better insights over time.
 */

import { mem0Service, type Memory } from '../../agent/memory/mem0-service'

// ============================================================================
// Types
// ============================================================================

export interface PatternMemory {
  type: 'anomaly' | 'vendor_risk' | 'cash_flow' | 'spending_pattern'
  summary: string
  confidence: number
  entities: string[]
  detectedAt: string
  metadata?: Record<string, unknown>
}

export interface MemoryContext {
  userId: string
  businessId: string
  conversationId?: string
}

export interface RecalledPatterns {
  anomalies: PatternMemory[]
  vendorRisks: PatternMemory[]
  cashFlowTrends: PatternMemory[]
  relevantMemories: Memory[]
}

// ============================================================================
// Memory Recall Functions
// ============================================================================

/**
 * Recall relevant patterns before anomaly detection
 * Returns past anomaly patterns to help contextualize new findings
 */
export async function recallAnomalyPatterns(
  context: MemoryContext,
  dateRange?: { start: string; end: string },
  categories?: string[]
): Promise<PatternMemory[]> {
  try {
    const isAvailable = await mem0Service.isAvailable()
    if (!isAvailable) {
      console.log('[MCPMemory] Memory service unavailable, skipping pattern recall')
      return []
    }

    // Build search query based on context
    const queryParts = ['anomaly detection', 'unusual transactions', 'spending outliers']
    if (categories?.length) {
      queryParts.push(...categories)
    }
    if (dateRange) {
      queryParts.push(`from ${dateRange.start} to ${dateRange.end}`)
    }

    const memories = await mem0Service.searchMemories(
      queryParts.join(' '),
      context.userId,
      context.businessId,
      5 // Limit to most relevant
    )

    // Parse pattern memories from raw memories
    return parsePatternMemories(memories, 'anomaly')
  } catch (error) {
    console.error('[MCPMemory] Error recalling anomaly patterns:', error)
    return []
  }
}

/**
 * Recall vendor risk patterns before analysis
 * Returns past vendor risk assessments for comparison
 */
export async function recallVendorRiskPatterns(
  context: MemoryContext,
  vendorNames?: string[]
): Promise<PatternMemory[]> {
  try {
    const isAvailable = await mem0Service.isAvailable()
    if (!isAvailable) {
      return []
    }

    const queryParts = ['vendor risk', 'supplier analysis', 'spending concentration']
    if (vendorNames?.length) {
      queryParts.push(...vendorNames)
    }

    const memories = await mem0Service.searchMemories(
      queryParts.join(' '),
      context.userId,
      context.businessId,
      5
    )

    return parsePatternMemories(memories, 'vendor_risk')
  } catch (error) {
    console.error('[MCPMemory] Error recalling vendor risk patterns:', error)
    return []
  }
}

/**
 * Recall cash flow patterns before forecasting
 * Returns past cash flow trends and forecasts for accuracy comparison
 */
export async function recallCashFlowPatterns(
  context: MemoryContext
): Promise<PatternMemory[]> {
  try {
    const isAvailable = await mem0Service.isAvailable()
    if (!isAvailable) {
      return []
    }

    const memories = await mem0Service.searchMemories(
      'cash flow forecast balance projection runway',
      context.userId,
      context.businessId,
      5
    )

    return parsePatternMemories(memories, 'cash_flow')
  } catch (error) {
    console.error('[MCPMemory] Error recalling cash flow patterns:', error)
    return []
  }
}

// ============================================================================
// Memory Store Functions
// ============================================================================

/**
 * Store anomaly detection results as pattern memory
 */
export async function storeAnomalyPatterns(
  context: MemoryContext,
  anomalies: Array<{
    description: string
    severity: string
    category?: string
    amount?: number
    vendor?: string
  }>
): Promise<boolean> {
  if (anomalies.length === 0) {
    return true // Nothing to store
  }

  try {
    const isAvailable = await mem0Service.isAvailable()
    if (!isAvailable) {
      console.log('[MCPMemory] Memory service unavailable, skipping pattern store')
      return false
    }

    // Create a summary of detected anomalies for memory
    const summaries = anomalies.slice(0, 3).map(a => {
      let summary = `Anomaly detected: ${a.description}`
      if (a.severity) summary += ` (${a.severity} severity)`
      if (a.vendor) summary += ` for vendor ${a.vendor}`
      if (a.amount) summary += ` amount $${a.amount.toLocaleString()}`
      return summary
    })

    const memoryContent = [
      {
        role: 'assistant' as const,
        content: `I detected ${anomalies.length} anomal${anomalies.length === 1 ? 'y' : 'ies'} in the financial data:\n${summaries.join('\n')}`
      }
    ]

    const result = await mem0Service.addConversationMemories(
      memoryContent,
      context.userId,
      context.businessId,
      {
        type: 'anomaly_detection',
        category: 'pattern',
        anomalyCount: anomalies.length,
        severities: [...new Set(anomalies.map(a => a.severity))],
        conversationId: context.conversationId,
        source: 'mcp_detect_anomalies'
      }
    )

    console.log(`[MCPMemory] Stored ${result?.results?.length || 0} anomaly pattern memories`)
    return true
  } catch (error) {
    console.error('[MCPMemory] Error storing anomaly patterns:', error)
    return false
  }
}

/**
 * Store vendor risk analysis results as pattern memory
 */
export async function storeVendorRiskPatterns(
  context: MemoryContext,
  vendors: Array<{
    vendorName: string
    riskScore: number
    totalSpend: number
    spendingTrend: string
    riskFactors: string[]
  }>,
  concentrationRisks: Array<{ message: string; severity: string }>
): Promise<boolean> {
  if (vendors.length === 0) {
    return true
  }

  try {
    const isAvailable = await mem0Service.isAvailable()
    if (!isAvailable) {
      return false
    }

    // Create summary of high-risk vendors
    const highRiskVendors = vendors.filter(v => v.riskScore >= 50)
    const topVendors = vendors.slice(0, 3)

    let memoryText = `Vendor risk analysis completed:\n`
    memoryText += `Top vendors by spend: ${topVendors.map(v => `${v.vendorName} ($${v.totalSpend.toLocaleString()})`).join(', ')}\n`

    if (highRiskVendors.length > 0) {
      memoryText += `High-risk vendors identified: ${highRiskVendors.map(v => `${v.vendorName} (risk score: ${v.riskScore})`).join(', ')}\n`
    }

    if (concentrationRisks.length > 0) {
      memoryText += `Concentration risks: ${concentrationRisks.map(r => r.message).join('; ')}`
    }

    const result = await mem0Service.addConversationMemories(
      [{ role: 'assistant' as const, content: memoryText }],
      context.userId,
      context.businessId,
      {
        type: 'vendor_risk_analysis',
        category: 'pattern',
        vendorCount: vendors.length,
        highRiskCount: highRiskVendors.length,
        concentrationRiskCount: concentrationRisks.length,
        conversationId: context.conversationId,
        source: 'mcp_analyze_vendor_risk'
      }
    )

    console.log(`[MCPMemory] Stored vendor risk pattern memories`)
    return true
  } catch (error) {
    console.error('[MCPMemory] Error storing vendor risk patterns:', error)
    return false
  }
}

/**
 * Store cash flow forecast results as pattern memory
 */
export async function storeCashFlowPatterns(
  context: MemoryContext,
  forecast: {
    currentBalance: number
    projectedEndBalance: number
    netChange: number
    runwayDays?: number
    scenario: string
    horizonDays: number
    alerts: Array<{ message: string; severity: string }>
  }
): Promise<boolean> {
  try {
    const isAvailable = await mem0Service.isAvailable()
    if (!isAvailable) {
      return false
    }

    let memoryText = `Cash flow forecast (${forecast.scenario} scenario, ${forecast.horizonDays} days):\n`
    memoryText += `Current balance: $${forecast.currentBalance.toLocaleString()}\n`
    memoryText += `Projected end balance: $${forecast.projectedEndBalance.toLocaleString()}\n`
    memoryText += `Net change: ${forecast.netChange >= 0 ? '+' : ''}$${forecast.netChange.toLocaleString()}\n`

    if (forecast.runwayDays !== undefined) {
      memoryText += `Estimated runway: ${forecast.runwayDays} days\n`
    }

    if (forecast.alerts.length > 0) {
      memoryText += `Alerts: ${forecast.alerts.map(a => a.message).join('; ')}`
    }

    const result = await mem0Service.addConversationMemories(
      [{ role: 'assistant' as const, content: memoryText }],
      context.userId,
      context.businessId,
      {
        type: 'cash_flow_forecast',
        category: 'pattern',
        scenario: forecast.scenario,
        horizonDays: forecast.horizonDays,
        projectedBalance: forecast.projectedEndBalance,
        alertCount: forecast.alerts.length,
        conversationId: context.conversationId,
        source: 'mcp_forecast_cash_flow'
      }
    )

    console.log(`[MCPMemory] Stored cash flow pattern memories`)
    return true
  } catch (error) {
    console.error('[MCPMemory] Error storing cash flow patterns:', error)
    return false
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse raw memories into structured pattern memories
 */
function parsePatternMemories(
  memories: Memory[],
  expectedType: PatternMemory['type']
): PatternMemory[] {
  return memories
    .filter(m => {
      // Filter to memories that match the expected type based on metadata or content
      const metadata = m.metadata as Record<string, unknown> | undefined
      if (metadata?.type === expectedType + '_detection' || metadata?.type === expectedType + '_analysis' || metadata?.type === expectedType + '_forecast') {
        return true
      }
      // Fallback to content-based detection
      const content = m.memory.toLowerCase()
      switch (expectedType) {
        case 'anomaly':
          return content.includes('anomal') || content.includes('unusual') || content.includes('outlier')
        case 'vendor_risk':
          return content.includes('vendor') && (content.includes('risk') || content.includes('concentration'))
        case 'cash_flow':
          return content.includes('cash flow') || content.includes('forecast') || content.includes('runway')
        default:
          return false
      }
    })
    .map(m => {
      const metadata = m.metadata as Record<string, unknown> | undefined
      return {
        type: expectedType,
        summary: m.memory,
        confidence: (m.score ?? 0.5) * 100,
        entities: extractEntities(m.memory),
        detectedAt: m.created_at,
        metadata
      }
    })
}

/**
 * Extract entity names from memory text (vendors, amounts, etc.)
 */
function extractEntities(text: string): string[] {
  const entities: string[] = []

  // Extract vendor names (capitalized words after "vendor" or before "spending")
  const vendorMatch = text.match(/vendor[s]?\s+([A-Z][a-zA-Z0-9\s]+?)(?:\s+\(|,|\.|\s+-)/gi)
  if (vendorMatch) {
    entities.push(...vendorMatch.map(m => m.replace(/vendor[s]?\s+/i, '').replace(/[\s(,.\-]+$/, '').trim()))
  }

  // Extract amounts (numbers with $ or currency format)
  const amountMatch = text.match(/\$[\d,]+(?:\.\d{2})?/g)
  if (amountMatch) {
    entities.push(...amountMatch)
  }

  return [...new Set(entities)].slice(0, 10) // Dedupe and limit
}

/**
 * Format recalled patterns for inclusion in tool response
 */
export function formatRecalledPatternsForResponse(patterns: PatternMemory[]): string {
  if (patterns.length === 0) {
    return ''
  }

  let text = '\n### Historical Context\n'
  text += 'Based on past analyses:\n'

  for (const pattern of patterns.slice(0, 3)) {
    const confidence = Math.round(pattern.confidence)
    text += `- ${pattern.summary.substring(0, 150)}${pattern.summary.length > 150 ? '...' : ''} (${confidence}% relevance)\n`
  }

  return text
}
