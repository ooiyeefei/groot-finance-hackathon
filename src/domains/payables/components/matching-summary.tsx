'use client'

import { CheckCircle, Clock, AlertTriangle, BarChart3, Sparkles, TrendingUp, Zap } from 'lucide-react'
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

  // Compute AI metrics from summary
  const automationRate = summary.totalMatches > 0
    ? Math.round(((summary.autoApproved + summary.approved) / summary.totalMatches) * 100)
    : 0
  const aiEnhancedCount = (summary as any).aiEnhancedCount ?? 0
  const avgConfidence = (summary as any).avgAiConfidence ?? 0

  // Estimate time saved: ~8 min per manual review, ~0.5 min for AI-assisted review
  const manualReviewMinutes = 8
  const aiReviewMinutes = 0.5
  const aiResolvedCount = aiEnhancedCount > 0 ? aiEnhancedCount : summary.autoApproved
  const timeSavedMinutes = aiResolvedCount * (manualReviewMinutes - aiReviewMinutes)
  const timeSavedHours = Math.round(timeSavedMinutes / 60 * 10) / 10

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
    <div className="space-y-4">
      {/* Status Cards */}
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

      {/* AI Intelligence ROI Row */}
      {(automationRate > 0 || aiEnhancedCount > 0) && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-primary">AI Matching Intelligence</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {/* Automation Rate */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs text-muted-foreground">Automation Rate</span>
              </div>
              <p className="text-lg font-bold text-foreground">{automationRate}%</p>
              <div className="w-full h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${automationRate}%` }}
                />
              </div>
            </div>

            {/* Time Saved */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                <span className="text-xs text-muted-foreground">Time Saved</span>
              </div>
              <p className="text-lg font-bold text-foreground">
                {timeSavedHours > 0 ? `${timeSavedHours}h` : '--'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                est. review hours
              </p>
            </div>

            {/* AI Confidence */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs text-muted-foreground">Avg AI Confidence</span>
              </div>
              <p className="text-lg font-bold text-foreground">
                {avgConfidence > 0 ? `${Math.round(avgConfidence * 100)}%` : '--'}
              </p>
              {avgConfidence > 0 && (
                <div className="w-full h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      avgConfidence >= 0.8 ? 'bg-green-500' :
                      avgConfidence >= 0.6 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${Math.round(avgConfidence * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
