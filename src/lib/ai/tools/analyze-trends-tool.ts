/**
 * Analyze Trends Tool - Period comparison, trend analysis, and growth rates
 *
 * Category 3 Domain Intelligence: Server-side aggregation of journal entries
 * by financial metric and time period. Returns structured insights with
 * action card data for visualization.
 *
 * Modes:
 * - compare: Two-period side-by-side comparison
 * - trend: Multi-period time series with granularity
 * - growth: Growth rate calculation (defaults to YoY)
 *
 * RBAC: MANAGER_TOOLS (manager, finance_admin, owner)
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { resolveDateRange } from '@/lib/ai/utils/date-range-resolver'
import { convertForDisplay } from './currency-display-helper'
import { formatCurrency } from '@/lib/utils/format-number'

const VALID_METRICS = ['revenue', 'expenses', 'profit', 'cash_flow'] as const
const VALID_MODES = ['compare', 'trend', 'growth'] as const
const VALID_GRANULARITIES = ['monthly', 'quarterly', 'yearly'] as const

export class AnalyzeTrendsTool extends BaseTool {
  getToolName(_modelType?: ModelType): string {
    return 'analyze_trends'
  }

  getDescription(_modelType?: ModelType): string {
    return `Analyze financial trends, compare periods, or calculate growth rates. Returns structured analysis with visual action card.
Use for:
- Period comparisons: "Compare Q1 2025 vs Q1 2026", "January vs February expenses"
- Trends: "6-month expense trend", "revenue trend for the past year"
- Growth rates: "revenue growth rate", "expense growth rate year over year"
Supports optional currency conversion: "Show revenue in USD", "Compare Q1 vs Q2 in SGD".`
  }

  getToolSchema(_modelType?: ModelType): OpenAIToolSchema {
    return {
      type: "function",
      function: {
        name: this.getToolName(_modelType),
        description: this.getDescription(_modelType),
        parameters: {
          type: "object",
          properties: {
            mode: {
              type: "string",
              enum: [...VALID_MODES],
              description: "Analysis mode: 'compare' for two-period comparison, 'trend' for multi-period time series, 'growth' for growth rate calculation."
            },
            metric: {
              type: "string",
              enum: [...VALID_METRICS],
              description: "Financial metric to analyze: revenue, expenses, profit, or cash_flow."
            },
            period_a: {
              type: "string",
              description: "First period (compare mode) or start of range. Natural language: 'Q1 2025', 'January 2026', 'last quarter'."
            },
            period_b: {
              type: "string",
              description: "Second period for comparison (compare mode only). E.g., 'Q1 2026'."
            },
            date_range: {
              type: "string",
              description: "Time range for trend mode. E.g., 'past 6 months', 'last year', 'past 12 months'."
            },
            granularity: {
              type: "string",
              enum: [...VALID_GRANULARITIES],
              description: "Data aggregation granularity for trend mode. Default: 'monthly'."
            },
            display_currency: {
              type: "string",
              description: "Optional currency code (e.g., 'USD', 'SGD') to show converted amounts alongside home currency."
            }
          },
          required: ["mode", "metric"]
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const mode = parameters.mode as string
    const metric = parameters.metric as string

    if (!VALID_MODES.includes(mode as any)) {
      return { valid: false, error: `Invalid mode '${mode}'. Must be one of: ${VALID_MODES.join(', ')}` }
    }
    if (!VALID_METRICS.includes(metric as any)) {
      return { valid: false, error: `Invalid metric '${metric}'. Must be one of: ${VALID_METRICS.join(', ')}` }
    }

    if (mode === 'compare') {
      if (!parameters.period_a || !parameters.period_b) {
        return { valid: false, error: 'Compare mode requires both period_a and period_b' }
      }
    }
    if (mode === 'trend' && !parameters.date_range && !parameters.period_a) {
      return { valid: false, error: 'Trend mode requires date_range or period_a' }
    }

    if (parameters.granularity && !VALID_GRANULARITIES.includes(parameters.granularity as any)) {
      return { valid: false, error: `Invalid granularity. Must be one of: ${VALID_GRANULARITIES.join(', ')}` }
    }

    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    if (!this.convex || !userContext.businessId) {
      return { success: false, error: 'Missing authenticated Convex client or business context' }
    }

    const mode = parameters.mode as string
    const metric = parameters.metric as string
    const displayCurrency = parameters.display_currency as string | undefined
    const homeCurrency = userContext.homeCurrency || 'MYR'

    try {
      if (mode === 'compare') {
        return await this.executeCompare(parameters, userContext, homeCurrency, displayCurrency)
      } else if (mode === 'trend') {
        return await this.executeTrend(parameters, userContext, homeCurrency, displayCurrency)
      } else {
        return await this.executeGrowth(parameters, userContext, homeCurrency, displayCurrency)
      }
    } catch (error) {
      console.error(`[AnalyzeTrendsTool] Error in ${mode} mode:`, error)
      return {
        success: false,
        error: `Trend analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  private async executeCompare(
    parameters: ToolParameters,
    userContext: UserContext,
    homeCurrency: string,
    displayCurrency?: string
  ): Promise<ToolResult> {
    const metric = parameters.metric as string
    const rangeA = resolveDateRange(parameters.period_a as string)
    const rangeB = resolveDateRange(parameters.period_b as string)

    const result = await this.convex!.action(
      this.convexApi.functions.trendAnalysis.analyzeTrends,
      {
        businessId: userContext.businessId!,
        mode: 'compare' as const,
        metric: metric as any,
        startDateA: rangeA.startDate,
        endDateA: rangeA.endDate,
        startDateB: rangeB.startDate,
        endDateB: rangeB.endDate,
      }
    )

    if ('error' in result) {
      return { success: false, error: result.error as string }
    }

    // Apply currency conversion
    let conversion = null
    if (displayCurrency && displayCurrency !== homeCurrency) {
      conversion = await convertForDisplay(1, homeCurrency, displayCurrency)
    }
    const rate = conversion?.exchangeRate || 1

    const periodA = result.periodA as any
    const periodB = result.periodB as any
    const direction = result.direction as string
    const percentageChange = result.percentageChange as number

    // Build text response
    const metricLabel = metric.replace('_', ' ')
    const amountA = periodA.amount as number
    const amountB = periodB.amount as number
    const convertedA = conversion ? ` (~ ${formatCurrency(amountA * rate, displayCurrency)})` : ''
    const convertedB = conversion ? ` (~ ${formatCurrency(amountB * rate, displayCurrency)})` : ''
    const arrow = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→'
    const changeWord = direction === 'up' ? 'increased' : direction === 'down' ? 'decreased' : 'remained stable'

    let text = `**${metricLabel.charAt(0).toUpperCase() + metricLabel.slice(1)} Comparison**\n\n`
    text += `${rangeA.description}: ${formatCurrency(amountA, homeCurrency)}${convertedA}\n`
    text += `${rangeB.description}: ${formatCurrency(amountB, homeCurrency)}${convertedB}\n\n`
    text += `${arrow} ${metricLabel} ${changeWord} by ${Math.abs(percentageChange)}%`
    text += ` (${formatCurrency(Math.abs(result.absoluteChange as number), homeCurrency)})`

    return {
      success: true,
      data: text,
      metadata: {
        actionCard: {
          type: 'trend_comparison_card',
          data: {
            chartType: 'comparison',
            title: `${metricLabel.charAt(0).toUpperCase() + metricLabel.slice(1)} Comparison`,
            currency: homeCurrency,
            displayCurrency: displayCurrency || undefined,
            exchangeRate: conversion?.exchangeRate,
            periodA: {
              label: rangeA.description,
              amount: amountA,
              convertedAmount: conversion ? Math.round(amountA * rate * 100) / 100 : undefined,
            },
            periodB: {
              label: rangeB.description,
              amount: amountB,
              convertedAmount: conversion ? Math.round(amountB * rate * 100) / 100 : undefined,
            },
            absoluteChange: result.absoluteChange,
            percentageChange,
            direction,
          }
        }
      }
    }
  }

  private async executeTrend(
    parameters: ToolParameters,
    userContext: UserContext,
    homeCurrency: string,
    displayCurrency?: string
  ): Promise<ToolResult> {
    const metric = parameters.metric as string
    const dateExpr = (parameters.date_range || parameters.period_a) as string
    const range = resolveDateRange(dateExpr)
    const granularity = (parameters.granularity || 'monthly') as string

    const result = await this.convex!.action(
      this.convexApi.functions.trendAnalysis.analyzeTrends,
      {
        businessId: userContext.businessId!,
        mode: 'trend' as const,
        metric: metric as any,
        startDateA: range.startDate,
        endDateA: range.endDate,
        granularity: granularity as any,
      }
    )

    if ('error' in result) {
      return { success: false, error: result.error as string }
    }

    // Apply currency conversion
    let conversion = null
    if (displayCurrency && displayCurrency !== homeCurrency) {
      conversion = await convertForDisplay(1, homeCurrency, displayCurrency)
    }
    const rate = conversion?.exchangeRate || 1

    const periods = result.periods as any[]
    const metricLabel = metric.replace('_', ' ')
    const overallDirection = result.overallDirection as string
    const overallChangePercent = result.overallChangePercent as number

    // Build text summary table
    const arrow = overallDirection === 'up' ? '↑' : overallDirection === 'down' ? '↓' : '→'
    let text = `**${metricLabel.charAt(0).toUpperCase() + metricLabel.slice(1)} Trend** (${range.description})\n\n`

    for (let i = 0; i < periods.length; i++) {
      const p = periods[i]
      const converted = conversion ? ` (~ ${formatCurrency(p.amount * rate, displayCurrency)})` : ''
      const changeFromPrev = i > 0 && periods[i - 1].amount !== 0
        ? ` ${((p.amount - periods[i - 1].amount) / Math.abs(periods[i - 1].amount) * 100).toFixed(1)}%`
        : ''
      const changeArrow = i > 0
        ? p.amount > periods[i - 1].amount ? ' ↑' : p.amount < periods[i - 1].amount ? ' ↓' : ' →'
        : ''
      text += `• ${p.label}: ${formatCurrency(p.amount, homeCurrency)}${converted}${changeArrow}${changeFromPrev}\n`
    }

    text += `\nOverall: ${arrow} ${Math.abs(overallChangePercent)}% ${overallDirection === 'up' ? 'increase' : overallDirection === 'down' ? 'decrease' : 'stable'}`

    return {
      success: true,
      data: text,
      metadata: {
        actionCard: {
          type: 'trend_comparison_card',
          data: {
            chartType: 'trend',
            title: `${metricLabel.charAt(0).toUpperCase() + metricLabel.slice(1)} Trend`,
            currency: homeCurrency,
            displayCurrency: displayCurrency || undefined,
            exchangeRate: conversion?.exchangeRate,
            periods: periods.map((p: any) => ({
              label: p.label,
              amount: p.amount,
              convertedAmount: conversion ? Math.round(p.amount * rate * 100) / 100 : undefined,
            })),
            overallDirection,
            overallChangePercent,
          }
        }
      }
    }
  }

  private async executeGrowth(
    parameters: ToolParameters,
    userContext: UserContext,
    homeCurrency: string,
    displayCurrency?: string
  ): Promise<ToolResult> {
    const metric = parameters.metric as string

    // Default: compare most recent complete quarter to same quarter last year
    let rangeA: ReturnType<typeof resolveDateRange>
    let rangeB: ReturnType<typeof resolveDateRange>

    if (parameters.period_a && parameters.period_b) {
      rangeA = resolveDateRange(parameters.period_a as string)
      rangeB = resolveDateRange(parameters.period_b as string)
    } else {
      // Auto-detect: last complete quarter vs same quarter previous year
      const now = new Date()
      const currentQ = Math.floor(now.getMonth() / 3)
      const prevQ = currentQ === 0 ? 3 : currentQ - 1
      const prevQYear = currentQ === 0 ? now.getFullYear() - 1 : now.getFullYear()
      const yoyYear = prevQYear - 1

      rangeA = resolveDateRange(`Q${prevQ + 1} ${yoyYear}`)
      rangeB = resolveDateRange(`Q${prevQ + 1} ${prevQYear}`)
    }

    const result = await this.convex!.action(
      this.convexApi.functions.trendAnalysis.analyzeTrends,
      {
        businessId: userContext.businessId!,
        mode: 'compare' as const,
        metric: metric as any,
        startDateA: rangeA.startDate,
        endDateA: rangeA.endDate,
        startDateB: rangeB.startDate,
        endDateB: rangeB.endDate,
      }
    )

    if ('error' in result) {
      return { success: false, error: result.error as string }
    }

    const periodA = result.periodA as any
    const periodB = result.periodB as any
    const percentageChange = result.percentageChange as number
    const direction = result.direction as string

    const metricLabel = metric.replace('_', ' ')
    const growthWord = direction === 'up' ? 'grew' : direction === 'down' ? 'declined' : 'remained stable'

    // Apply currency conversion
    let conversion = null
    if (displayCurrency && displayCurrency !== homeCurrency) {
      conversion = await convertForDisplay(1, homeCurrency, displayCurrency)
    }

    const convertedCurrent = conversion
      ? ` (~ ${formatCurrency(periodB.amount * conversion.exchangeRate, displayCurrency)})`
      : ''

    let text = `**${metricLabel.charAt(0).toUpperCase() + metricLabel.slice(1)} Growth Rate**\n\n`
    text += `${metricLabel.charAt(0).toUpperCase() + metricLabel.slice(1)} ${growthWord} **${Math.abs(percentageChange)}%** `
    text += `compared to ${rangeA.description}.\n\n`
    text += `Current (${rangeB.description}): ${formatCurrency(periodB.amount, homeCurrency)}${convertedCurrent}\n`
    text += `Previous (${rangeA.description}): ${formatCurrency(periodA.amount, homeCurrency)}`

    return {
      success: true,
      data: text,
      metadata: {
        growthRate: percentageChange,
        direction,
        currentPeriod: rangeB.description,
        previousPeriod: rangeA.description,
      }
    }
  }

  protected formatResultData(_data: any[]): string {
    return ''
  }
}
