'use client'

/**
 * Monthly Cash Flow Forecast Card
 *
 * Renders monthly projection data from forecast_cash_flow (monthly granularity):
 * bar chart of income/expenses per month, running balance, runway, risk alerts.
 */

import { TrendingUp, TrendingDown, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format-number'
import { registerActionCard, type ActionCardProps } from './registry'
import { useState } from 'react'

interface ForecastMonth {
  month: string
  income: number
  expenses: number
  balance: number
  arDue?: number
  apDue?: number
}

interface ForecastRiskAlert {
  type: string
  severity: 'critical' | 'warning' | 'info'
  month?: string
  message: string
}

interface ForecastCardData {
  months: ForecastMonth[]
  runwayMonths: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  currency: string
  riskAlerts: ForecastRiskAlert[]
  knownAR?: number
  knownAP?: number
}

const RISK_COLORS = {
  low: 'text-emerald-500',
  medium: 'text-yellow-500',
  high: 'text-orange-500',
  critical: 'text-destructive',
} as const

const RISK_BG = {
  low: 'bg-emerald-500/10 border-emerald-500/30',
  medium: 'bg-yellow-500/10 border-yellow-500/30',
  high: 'bg-orange-500/10 border-orange-500/30',
  critical: 'bg-destructive/10 border-destructive/30',
} as const

function ForecastCard({ action }: ActionCardProps) {
  const data = action.data as unknown as ForecastCardData
  const [expanded, setExpanded] = useState(false)

  if (!data || !data.months || data.months.length === 0) return null

  const currency = data.currency || 'MYR'
  const maxAmount = Math.max(...data.months.flatMap(m => [m.income, m.expenses]))

  // Format month label: "2026-04" → "Apr", "Apr 2026" → "Apr", etc.
  const formatMonth = (m: string) => {
    if (!m) return '?'
    // Handle "YYYY-MM" format
    if (/^\d{4}-\d{2}$/.test(m)) {
      const [year, month] = m.split('-')
      return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en', { month: 'short' })
    }
    // Handle "Apr 2026" or "April 2026" — already formatted, extract short month
    const parsed = new Date(m + ' 1')
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en', { month: 'short' })
    }
    // Fallback: return first 3 chars
    return m.substring(0, 3)
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Cash Flow Forecast</span>
          <span className="text-xs text-muted-foreground">
            ({data.months.length} months)
          </span>
        </div>
        <div className={`text-xs font-medium px-2 py-0.5 rounded-full border ${RISK_BG[data.riskLevel]}`}>
          <span className={RISK_COLORS[data.riskLevel]}>
            {data.riskLevel === 'low' ? 'Healthy' : data.riskLevel.charAt(0).toUpperCase() + data.riskLevel.slice(1)} Risk
          </span>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-3 gap-3 px-3 py-2 border-b border-border">
        <div>
          <div className="text-xs text-muted-foreground">Runway</div>
          <div className="text-sm font-semibold">
            {data.runwayMonths >= 12 ? '12+' : data.runwayMonths.toFixed(1)} months
          </div>
        </div>
        {data.knownAR !== undefined && (
          <div>
            <div className="text-xs text-muted-foreground">Known AR</div>
            <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(data.knownAR, currency)}
            </div>
          </div>
        )}
        {data.knownAP !== undefined && (
          <div>
            <div className="text-xs text-muted-foreground">Known AP</div>
            <div className="text-sm font-semibold text-orange-600 dark:text-orange-400">
              {formatCurrency(data.knownAP, currency)}
            </div>
          </div>
        )}
      </div>

      {/* Monthly bar chart */}
      <div className="px-3 py-3">
        <div className="flex items-end gap-1 h-24">
          {data.months.map((month, i) => {
            const incomeHeight = maxAmount > 0 ? (month.income / maxAmount) * 100 : 0
            const expenseHeight = maxAmount > 0 ? (month.expenses / maxAmount) * 100 : 0
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="flex gap-px items-end w-full" style={{ height: '80px' }}>
                  <div
                    className="flex-1 bg-emerald-500/60 rounded-t-sm"
                    style={{ height: `${incomeHeight}%` }}
                    title={`Income: ${formatCurrency(month.income, currency)}`}
                  />
                  <div
                    className="flex-1 bg-orange-500/60 rounded-t-sm"
                    style={{ height: `${expenseHeight}%` }}
                    title={`Expenses: ${formatCurrency(month.expenses, currency)}`}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground">{formatMonth(month.month)}</div>
              </div>
            )
          })}
        </div>
        {/* Legend */}
        <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-emerald-500/60" /> Income
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-orange-500/60" /> Expenses
          </div>
        </div>
      </div>

      {/* Balance trend row */}
      <div className="px-3 pb-2 flex gap-1 items-center text-xs text-muted-foreground border-t border-border pt-2">
        <span className="font-medium">Balance:</span>
        {data.months.map((month, i) => {
          const isNegative = month.balance < 0
          return (
            <span key={i} className={`flex-1 text-center text-[10px] ${isNegative ? 'text-destructive font-medium' : ''}`}>
              {formatCurrency(month.balance, currency)}
            </span>
          )
        })}
      </div>

      {/* Risk alerts (expandable) */}
      {data.riskAlerts && data.riskAlerts.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs text-muted-foreground hover:bg-muted/30"
          >
            <div className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-yellow-500" />
              <span>{data.riskAlerts.length} risk alert{data.riskAlerts.length > 1 ? 's' : ''}</span>
            </div>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {expanded && (
            <div className="px-3 pb-2 space-y-1">
              {data.riskAlerts.map((alert, i) => (
                <div key={i} className={`text-xs p-2 rounded border ${
                  alert.severity === 'critical' ? 'bg-destructive/10 border-destructive/30 text-destructive' :
                  'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400'
                }`}>
                  {alert.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

registerActionCard('forecast_card', ForecastCard)
