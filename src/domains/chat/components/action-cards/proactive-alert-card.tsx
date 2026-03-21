'use client'

/**
 * Proactive Alert Card
 *
 * Renders Action Center insights pushed to chat with
 * severity-coded styling, Investigate/Dismiss actions,
 * and batch summary view.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { AlertTriangle, ShieldAlert, Search, X, ChevronRight, Loader2 } from 'lucide-react'
import { registerActionCard, type ActionCardProps } from './registry'

interface AlertData {
  insightId?: string
  category?: string
  priority?: string
  title?: string
  description?: string
  recommendedAction?: string
  affectedEntities?: string[]
  // Batch summary fields
  batchSummary?: boolean
  batchedInsights?: Array<{
    insightId: string
    category: string
    priority: string
  }>
  totalCount?: number
  criticalCount?: number
}

const CATEGORY_LABELS: Record<string, string> = {
  anomaly: 'Anomaly',
  compliance: 'Compliance',
  deadline: 'Deadline',
  cashflow: 'Cash Flow',
  optimization: 'Optimization',
  categorization: 'Categorization',
}

const PRIORITY_STYLES = {
  critical: {
    header: 'bg-destructive/10 border-destructive/30',
    badge: 'bg-destructive/15 text-destructive',
    icon: ShieldAlert,
  },
  high: {
    header: 'bg-yellow-500/10 border-yellow-500/30',
    badge: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
    icon: AlertTriangle,
  },
} as const

function ProactiveAlertCard({ action, isHistorical, onActionComplete }: ActionCardProps) {
  const router = useRouter()
  // @ts-ignore — new Convex module, types not yet generated (will resolve after convex deploy)
  const handleAction = useMutation(api.functions.proactiveAlerts.handleAction)
  const [loading, setLoading] = useState<'investigate' | 'dismiss' | null>(null)
  const [actionTaken, setActionTaken] = useState<'investigated' | 'dismissed' | null>(null)

  const data = action.data as unknown as AlertData
  if (!data) return null

  // Batch summary view
  if (data.batchSummary && data.batchedInsights) {
    return (
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="px-3 py-2 bg-destructive/5 border-b border-border flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
          <span className="text-xs font-medium text-foreground">
            {data.totalCount} Alerts Detected
            {data.criticalCount ? ` (${data.criticalCount} critical)` : ''}
          </span>
        </div>
        <div className="px-3 py-2 space-y-1.5">
          {data.batchedInsights.slice(0, 5).map((insight, idx) => (
            <div key={insight.insightId || idx} className="flex items-center gap-2 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                insight.priority === 'critical' ? 'bg-destructive' : 'bg-yellow-500'
              }`} />
              <span className="text-muted-foreground capitalize">
                {CATEGORY_LABELS[insight.category] || insight.category}
              </span>
            </div>
          ))}
          {(data.totalCount ?? 0) > 5 && (
            <p className="text-xs text-muted-foreground">
              +{(data.totalCount ?? 0) - 5} more
            </p>
          )}
        </div>
        <div className="px-3 py-2 border-t border-border">
          <button
            onClick={() => router.push('/en/action-center')}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded
              bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <ChevronRight className="w-3 h-3" />
            View All Alerts
          </button>
        </div>
      </div>
    )
  }

  // Single alert view
  const priority = (data.priority || 'high') as 'critical' | 'high'
  const style = PRIORITY_STYLES[priority] || PRIORITY_STYLES.high
  const Icon = style.icon
  const messageId = action.id

  const onInvestigate = async () => {
    if (!messageId || isHistorical || actionTaken) return
    setLoading('investigate')
    try {
      await handleAction({ messageId: messageId as any, action: 'investigate' })
      setActionTaken('investigated')
      onActionComplete?.({ success: true, message: 'Investigating alert...' })
    } catch (err) {
      console.error('[ProactiveAlertCard] Investigate failed:', err)
      onActionComplete?.({ success: false, message: 'Failed to investigate' })
    } finally {
      setLoading(null)
    }
  }

  const onDismiss = async () => {
    if (!messageId || isHistorical || actionTaken) return
    setLoading('dismiss')
    try {
      await handleAction({ messageId: messageId as any, action: 'dismiss' })
      setActionTaken('dismissed')
      onActionComplete?.({ success: true, message: 'Alert dismissed' })
    } catch (err) {
      console.error('[ProactiveAlertCard] Dismiss failed:', err)
      onActionComplete?.({ success: false, message: 'Failed to dismiss' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className={`px-3 py-2 border-b border-border flex items-center gap-2 ${style.header}`}>
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${style.badge}`}>
          {priority}
        </span>
        <span className="text-xs text-muted-foreground capitalize">
          {CATEGORY_LABELS[data.category || ''] || data.category}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        {data.title && (
          <p className="text-xs font-medium text-foreground mb-1">{data.title}</p>
        )}
        {data.description && (
          <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
            {data.description}
          </p>
        )}
        {data.recommendedAction && (
          <p className="text-xs text-muted-foreground italic mb-2">
            Recommended: {data.recommendedAction}
          </p>
        )}

        {/* Action state indicator */}
        {actionTaken === 'dismissed' && (
          <p className="text-xs text-muted-foreground italic">Dismissed</p>
        )}
        {actionTaken === 'investigated' && (
          <p className="text-xs text-primary italic">Investigating...</p>
        )}

        {/* Action buttons */}
        {!isHistorical && !actionTaken && (
          <div className="flex gap-2 mt-1">
            <button
              onClick={onInvestigate}
              disabled={loading !== null}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded
                bg-primary text-primary-foreground hover:bg-primary/90
                disabled:opacity-50 transition-colors"
            >
              {loading === 'investigate' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Search className="w-3 h-3" />
              )}
              Investigate
            </button>
            <button
              onClick={onDismiss}
              disabled={loading !== null}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded
                bg-secondary text-secondary-foreground hover:bg-secondary/80
                disabled:opacity-50 transition-colors"
            >
              {loading === 'dismiss' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <X className="w-3 h-3" />
              )}
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

registerActionCard('proactive_alert_card', ProactiveAlertCard)

export { ProactiveAlertCard }
