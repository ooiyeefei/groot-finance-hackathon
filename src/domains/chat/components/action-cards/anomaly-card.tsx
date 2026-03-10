'use client'

/**
 * Anomaly Card
 *
 * Renders detected anomalies with severity-coded badges,
 * navigation links, and action buttons.
 */

import { useRouter } from 'next/navigation'
import { AlertTriangle, ExternalLink, Bell } from 'lucide-react'
import { registerActionCard, type ActionCardProps } from './registry'

interface AnomalyItem {
  id: string
  severity: 'high' | 'medium' | 'low'
  title: string
  description: string
  amount?: number
  currency?: string
  date?: string
  resourceId?: string
  resourceType?: string
  actions?: Array<{ label: string; action: string; url?: string }>
}

interface AnomalyCardData {
  anomalies: AnomalyItem[]
  summary?: string
}

const SEVERITY_STYLES = {
  high: 'bg-destructive/10 text-destructive border-destructive/30',
  medium: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  low: 'bg-muted text-muted-foreground border-border',
} as const

const SEVERITY_BADGE = {
  high: 'bg-destructive/15 text-destructive',
  medium: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  low: 'bg-muted text-muted-foreground',
} as const

function AnomalyCard({ action, isHistorical }: ActionCardProps) {
  const router = useRouter()
  const data = action.data as unknown as AnomalyCardData

  if (!data?.anomalies?.length) return null

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-destructive/5 border-b border-border flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">
          {data.anomalies.length} {data.anomalies.length === 1 ? 'Anomaly' : 'Anomalies'} Detected
        </span>
      </div>

      {data.summary && (
        <p className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
          {data.summary}
        </p>
      )}

      {/* Anomaly list */}
      <div className="divide-y divide-border">
        {data.anomalies.map((anomaly) => (
          <div key={anomaly.id} className="px-3 py-2.5">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-foreground leading-tight">
                {anomaly.title}
              </span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${SEVERITY_BADGE[anomaly.severity]}`}>
                {anomaly.severity}
              </span>
            </div>

            <p className="text-xs text-muted-foreground mb-1.5 leading-relaxed">
              {anomaly.description}
            </p>

            {(anomaly.amount || anomaly.date) && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                {anomaly.amount && (
                  <span className="font-medium text-foreground">
                    {anomaly.currency || 'MYR'} {anomaly.amount.toLocaleString()}
                  </span>
                )}
                {anomaly.date && <span>{anomaly.date}</span>}
              </div>
            )}

            {/* Action buttons */}
            {!isHistorical && anomaly.actions && anomaly.actions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {anomaly.actions.map((btn, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (btn.action === 'navigate' && btn.url) {
                        router.push(btn.url)
                      }
                    }}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    {btn.action === 'navigate' ? (
                      <ExternalLink className="w-3 h-3" />
                    ) : (
                      <Bell className="w-3 h-3" />
                    )}
                    {btn.label}
                  </button>
                ))}
              </div>
            )}

            {/* Historical: show navigation link only */}
            {isHistorical && anomaly.resourceId && (
              <button
                onClick={() => router.push(`/en/expense-claims/submissions/${anomaly.resourceId}`)}
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                View Transaction
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Register the card type
registerActionCard('anomaly_card', AnomalyCard)

export { AnomalyCard }
