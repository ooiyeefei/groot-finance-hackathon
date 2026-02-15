'use client'

import { TrendingUp, TrendingDown, AlertTriangle, Info } from 'lucide-react'

interface PriceAlertBadgeProps {
  alertLevel: 'none' | 'info' | 'warning' | 'alert'
  percentChange: number
  observationCount: number
  minObservations?: number
}

const ALERT_STYLES: Record<string, { color: string; icon: typeof TrendingUp }> = {
  info: { color: 'text-blue-500', icon: Info },
  warning: { color: 'text-amber-500', icon: AlertTriangle },
  alert: { color: 'text-destructive', icon: AlertTriangle },
}

export default function PriceAlertBadge({
  alertLevel,
  percentChange,
  observationCount,
  minObservations = 2,
}: PriceAlertBadgeProps) {
  if (alertLevel === 'none') return null

  if (observationCount < minObservations) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
        title={`Insufficient price history (${observationCount}/${minObservations} observations needed)`}
      >
        <Info className="w-3 h-3" />
        Insufficient data
      </span>
    )
  }

  const style = ALERT_STYLES[alertLevel]
  if (!style) return null

  const Icon = style.icon
  const direction = percentChange > 0 ? '+' : ''

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${style.color}`}
      title={`Price ${percentChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(percentChange).toFixed(1)}% vs last order`}
    >
      {percentChange > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {direction}{percentChange.toFixed(1)}% vs last
    </span>
  )
}
