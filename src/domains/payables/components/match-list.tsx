'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Link2, AlertTriangle } from 'lucide-react'
import { useMatches } from '../hooks/use-matches'
import type { Id } from '../../../../convex/_generated/dataModel'

interface MatchListProps {
  onSelectMatch: (matchId: Id<'po_matches'>) => void
}

type MatchStatus = 'auto_approved' | 'pending_review' | 'approved' | 'disputed' | 'on_hold'

const STATUS_LABELS: Record<string, string> = {
  auto_approved: 'Auto Approved',
  pending_review: 'Pending Review',
  approved: 'Approved',
  disputed: 'Disputed',
  on_hold: 'On Hold',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  auto_approved: 'success',
  pending_review: 'warning',
  approved: 'success',
  disputed: 'error',
  on_hold: 'default',
}

const FILTER_TABS: Array<{ value: MatchStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'auto_approved', label: 'Auto Approved' },
  { value: 'disputed', label: 'Disputed' },
]

export default function MatchList({ onSelectMatch }: MatchListProps) {
  const [statusFilter, setStatusFilter] = useState<MatchStatus | ''>('')

  const { matches, isLoading } = useMatches({
    status: statusFilter || undefined,
  })

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="h-5 w-40 bg-muted rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Match Records</h3>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 overflow-x-auto">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value as MatchStatus | '')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === tab.value
                ? 'bg-card text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {matches.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <Link2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No match records found</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">PO Number</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Invoice / Vendor</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Match Type</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Variances</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match: any) => {
                  const varianceSummary = match.overallVarianceSummary
                  const hasExceedingVariances = (varianceSummary?.exceedsToleranceCount ?? 0) > 0

                  return (
                    <tr
                      key={match._id}
                      className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => onSelectMatch(match._id)}
                    >
                      <td className="px-4 py-2.5 font-medium text-foreground">{match.poNumber}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-foreground">{match.vendorName}</div>
                        {match.invoiceNumber && (
                          <div className="text-xs text-muted-foreground">Inv: {match.invoiceNumber}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant={match.matchType === 'three_way' ? 'info' : 'default'}>
                          {match.matchType === 'three_way' ? '3-Way' : '2-Way'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant={STATUS_VARIANTS[match.status] ?? 'default'}>
                          {STATUS_LABELS[match.status] ?? match.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {hasExceedingVariances ? (
                          <span className="flex items-center justify-center gap-1 text-warning-foreground">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span className="text-xs">{varianceSummary.exceedsToleranceCount}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {varianceSummary?.totalVariances ?? 0}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
