'use client'

import { CheckCircle, Clock, AlertTriangle, BarChart3 } from 'lucide-react'
import { useMatchDashboard } from '../hooks/use-matches'

export default function MatchingSummary() {
  const { summary, isLoading } = useMatchDashboard()

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-card-gap">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4">
            <div className="h-4 w-20 bg-muted rounded animate-pulse mb-2" />
            <div className="h-7 w-12 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  if (!summary || summary.totalMatches === 0) {
    return null
  }

  const cards = [
    {
      label: 'Total Matches',
      value: summary.totalMatches,
      icon: BarChart3,
      color: 'text-foreground',
    },
    {
      label: 'Auto Approved',
      value: summary.autoApproved + summary.approved,
      icon: CheckCircle,
      color: 'text-success-foreground',
    },
    {
      label: 'Pending Review',
      value: summary.pendingReview,
      icon: Clock,
      color: 'text-warning-foreground',
    },
    {
      label: 'Disputed',
      value: summary.disputed,
      icon: AlertTriangle,
      color: 'text-destructive',
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">3-Way Matching</h3>
        {summary.autoMatchRate > 0 && (
          <span className="text-xs text-muted-foreground">
            Auto-match rate: <span className="font-medium text-foreground">{summary.autoMatchRate}%</span>
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-card-gap">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${card.color}`} />
                <span className="text-xs text-muted-foreground">{card.label}</span>
              </div>
              <p className={`text-xl font-semibold ${card.color}`}>{card.value}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
