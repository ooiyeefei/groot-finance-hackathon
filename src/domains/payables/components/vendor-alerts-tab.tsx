'use client'

/**
 * Vendor Alerts Tab — AP Invoices sub-tab
 *
 * Consolidates anomaly alerts from #320 Smart Vendor Intelligence.
 * Shows price anomalies, frequency changes, new item alerts, recommended actions.
 */

import { useActiveBusiness } from '@/contexts/business-context'
import { useAnomalyAlerts } from '@/domains/vendor-intelligence/hooks/use-anomaly-alerts'
import { useRecommendedActions } from '@/domains/vendor-intelligence/hooks/use-recommended-actions'
import { AnomalyAlertCard } from '@/domains/vendor-intelligence/components/anomaly-alert-card'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Filter, RotateCcw } from 'lucide-react'
import type { Id } from '../../../../convex/_generated/dataModel'

export default function VendorAlertsTab() {
  const { businessId: rawBusinessId, isLoading: isBusinessLoading } =
    useActiveBusiness()
  const businessId = rawBusinessId
    ? (rawBusinessId as Id<'businesses'>)
    : undefined

  const {
    alerts,
    isLoading,
    dismissAlert,
    setStatus,
    setSeverityLevel,
    setAlertType,
    resetFilters,
    filters,
  } = useAnomalyAlerts(businessId)

  const { actions, markComplete, dismissAction } =
    useRecommendedActions(businessId)

  if (isBusinessLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const activeCount = alerts.filter((a) => a.status === 'active').length
  const highImpactCount = alerts.filter(
    (a) => a.severityLevel === 'high-impact' && a.status === 'active'
  ).length

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-foreground">
          Vendor Price Alerts
        </h2>
        <Badge variant="warning">{activeCount} active</Badge>
        {highImpactCount > 0 && (
          <Badge variant="error">{highImpactCount} high impact</Badge>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />

        <Select
          value={filters.status ?? 'all'}
          onValueChange={(v) =>
            setStatus(
              v === 'all' ? undefined : (v as 'active' | 'dismissed')
            )
          }
        >
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.severityLevel ?? 'all'}
          onValueChange={(v) =>
            setSeverityLevel(
              v === 'all'
                ? undefined
                : (v as 'standard' | 'high-impact')
            )
          }
        >
          <SelectTrigger className="w-[150px] h-8 text-sm">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="high-impact">High Impact</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.alertType ?? 'all'}
          onValueChange={(v) =>
            setAlertType(
              v === 'all'
                ? undefined
                : (v as
                    | 'per-invoice'
                    | 'trailing-average'
                    | 'new-item'
                    | 'frequency-change')
            )
          }
        >
          <SelectTrigger className="w-[170px] h-8 text-sm">
            <SelectValue placeholder="Alert Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="per-invoice">Price Increase</SelectItem>
            <SelectItem value="trailing-average">Trailing Avg Spike</SelectItem>
            <SelectItem value="new-item">New Charge</SelectItem>
            <SelectItem value="frequency-change">Frequency Change</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="sm"
          onClick={resetFilters}
          className="h-8"
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1" />
          Reset
        </Button>
      </div>

      {/* Alerts List */}
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <AlertTriangle className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">No price alerts found</p>
          <p className="text-xs mt-1">
            Alerts appear here when price anomalies are detected from incoming
            invoices
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => {
            // Find recommended actions for this alert
            const alertActions = actions.filter(
              (a: any) => a.anomalyAlertId === alert._id
            )
            return (
              <AnomalyAlertCard
                key={alert._id}
                alert={alert}
                onDismiss={dismissAlert}
                recommendedActions={alertActions}
                onCompleteAction={markComplete}
                onDismissAction={dismissAction}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
