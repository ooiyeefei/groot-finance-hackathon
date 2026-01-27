/**
 * Duplicate Report Table Component
 * Feature: 007-duplicate-expense-detection (User Story 3, T035)
 *
 * Displays duplicate matches in a sortable, filterable table with:
 * - Original claim info (vendor, amount, date)
 * - Matched claim info
 * - Match tier and confidence
 * - Status (pending/dismissed/confirmed)
 * - Action buttons for reviewing
 */

'use client'

import { useState, useMemo } from 'react'
import { ArrowUpDown, Eye, AlertTriangle, CheckCircle, XCircle, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatNumber } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'

// Types for duplicate match data
interface ClaimInfo {
  _id: string
  vendorName: string | null
  totalAmount: number | null
  currency: string | null
  transactionDate: string | null
  status: string
  businessPurpose: string
  submitter: {
    _id: string
    fullName: string
    email: string
  } | null
}

interface DuplicateMatch {
  _id: string
  businessId: string
  sourceClaimId: string
  matchedClaimId: string
  matchTier: 'exact' | 'strong' | 'fuzzy'
  matchedFields: string[]
  confidenceScore: number
  isCrossUser: boolean
  status: 'pending' | 'confirmed_duplicate' | 'dismissed'
  overrideReason?: string
  resolvedBy?: string
  resolvedAt?: number
  _creationTime: number
  sourceClaim: ClaimInfo | null
  matchedClaim: ClaimInfo | null
  resolver: {
    _id: string
    fullName: string
    email: string
  } | null
}

type SortField = 'date' | 'amount' | 'tier' | 'confidence' | 'status'
type SortDirection = 'asc' | 'desc'

interface DuplicateReportTableProps {
  matches: DuplicateMatch[]
  onViewMatch?: (match: DuplicateMatch) => void
  loading?: boolean
  selectedMatches?: Set<string>
  onSelectionChange?: (matchId: string, selected: boolean) => void
}

export default function DuplicateReportTable({
  matches,
  onViewMatch,
  loading = false,
  selectedMatches = new Set(),
  onSelectionChange,
}: DuplicateReportTableProps) {
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Sort matches based on current sort state
  const sortedMatches = useMemo(() => {
    const sorted = [...matches].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'date':
          const dateA = a.sourceClaim?.transactionDate || ''
          const dateB = b.sourceClaim?.transactionDate || ''
          comparison = dateA.localeCompare(dateB)
          break
        case 'amount':
          const amountA = a.sourceClaim?.totalAmount || 0
          const amountB = b.sourceClaim?.totalAmount || 0
          comparison = amountA - amountB
          break
        case 'tier':
          const tierOrder = { exact: 3, strong: 2, fuzzy: 1 }
          comparison = tierOrder[a.matchTier] - tierOrder[b.matchTier]
          break
        case 'confidence':
          comparison = a.confidenceScore - b.confidenceScore
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [matches, sortField, sortDirection])

  // Toggle sort direction or change sort field
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  // Get badge styling for match tier
  const getTierBadge = (tier: 'exact' | 'strong' | 'fuzzy') => {
    const styles = {
      exact: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30',
      strong: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30',
      fuzzy: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30',
    }
    const labels = {
      exact: 'Exact Match',
      strong: 'Strong Match',
      fuzzy: 'Fuzzy Match',
    }
    return (
      <Badge className={styles[tier]}>
        {labels[tier]}
      </Badge>
    )
  }

  // Get badge styling for status
  const getStatusBadge = (status: 'pending' | 'confirmed_duplicate' | 'dismissed') => {
    const styles = {
      pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30',
      confirmed_duplicate: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30',
      dismissed: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30',
    }
    const labels = {
      pending: 'Pending Review',
      confirmed_duplicate: 'Confirmed',
      dismissed: 'Dismissed',
    }
    const icons = {
      pending: <AlertTriangle className="w-3 h-3 mr-1" />,
      confirmed_duplicate: <XCircle className="w-3 h-3 mr-1" />,
      dismissed: <CheckCircle className="w-3 h-3 mr-1" />,
    }
    return (
      <Badge className={`${styles[status]} flex items-center`}>
        {icons[status]}
        {labels[status]}
      </Badge>
    )
  }

  // Sortable header component
  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-left font-medium text-foreground hover:text-primary transition-colors"
    >
      {children}
      <ArrowUpDown className={`w-4 h-4 ${sortField === field ? 'text-primary' : 'text-muted-foreground'}`} />
    </button>
  )

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-lg" />
        ))}
      </div>
    )
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CheckCircle className="w-12 h-12 mx-auto mb-4 text-success" />
        <p className="text-lg font-medium">No Duplicate Matches Found</p>
        <p className="text-sm">No potential duplicates match your current filters.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              {onSelectionChange && (
                <th className="px-4 py-3 w-10">
                  {/* Header checkbox intentionally empty - selection done via bulk button */}
                </th>
              )}
              <th className="px-4 py-3 text-left">
                <SortableHeader field="date">Date</SortableHeader>
              </th>
              <th className="px-4 py-3 text-left">Original Claim</th>
              <th className="px-4 py-3 text-left">Matched Claim</th>
              <th className="px-4 py-3 text-left">
                <SortableHeader field="amount">Amount</SortableHeader>
              </th>
              <th className="px-4 py-3 text-left">
                <SortableHeader field="tier">Match Tier</SortableHeader>
              </th>
              <th className="px-4 py-3 text-left">
                <SortableHeader field="confidence">Confidence</SortableHeader>
              </th>
              <th className="px-4 py-3 text-left">
                <SortableHeader field="status">Status</SortableHeader>
              </th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedMatches.map((match) => (
              <tr
                key={match._id}
                className="border-b border-border hover:bg-muted/50 transition-colors"
              >
                {onSelectionChange && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedMatches.has(match._id)}
                      onChange={(e) => onSelectionChange(match._id, e.target.checked)}
                      disabled={match.status !== 'pending'}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary disabled:opacity-50"
                    />
                  </td>
                )}
                <td className="px-4 py-3 text-foreground">
                  {formatBusinessDate(match.sourceClaim?.transactionDate)}
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <div className="text-foreground font-medium">
                      {match.sourceClaim?.vendorName || 'Unknown Vendor'}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {match.sourceClaim?.submitter?.fullName || 'Unknown'}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <div className="text-foreground font-medium">
                      {match.matchedClaim?.vendorName || 'Unknown Vendor'}
                    </div>
                    <div className="text-muted-foreground text-sm flex items-center gap-1">
                      {match.isCrossUser && <Users className="w-3 h-3" />}
                      {match.matchedClaim?.submitter?.fullName || 'Unknown'}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-foreground">
                  {formatNumber(match.sourceClaim?.totalAmount || 0, 2)} {match.sourceClaim?.currency}
                </td>
                <td className="px-4 py-3">
                  {getTierBadge(match.matchTier)}
                </td>
                <td className="px-4 py-3 text-foreground">
                  {Math.round(match.confidenceScore * 100)}%
                </td>
                <td className="px-4 py-3">
                  {getStatusBadge(match.status)}
                </td>
                <td className="px-4 py-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onViewMatch?.(match)}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Review
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-3">
        {sortedMatches.map((match) => (
          <div
            key={match._id}
            className="bg-card border border-border rounded-lg p-4 space-y-3"
          >
            {/* Header Row */}
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="text-foreground font-medium">
                  {match.sourceClaim?.vendorName || 'Unknown Vendor'}
                </div>
                <div className="text-muted-foreground text-sm">
                  {formatBusinessDate(match.sourceClaim?.transactionDate)}
                </div>
              </div>
              {getStatusBadge(match.status)}
            </div>

            {/* Amount and Tier */}
            <div className="flex items-center justify-between">
              <div className="text-foreground font-semibold">
                {formatNumber(match.sourceClaim?.totalAmount || 0, 2)} {match.sourceClaim?.currency}
              </div>
              {getTierBadge(match.matchTier)}
            </div>

            {/* Submitters */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Original:</div>
                <div className="text-foreground">{match.sourceClaim?.submitter?.fullName || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-muted-foreground flex items-center gap-1">
                  Matched:
                  {match.isCrossUser && <Users className="w-3 h-3" />}
                </div>
                <div className="text-foreground">{match.matchedClaim?.submitter?.fullName || 'Unknown'}</div>
              </div>
            </div>

            {/* Confidence and Action */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="text-muted-foreground text-sm">
                Confidence: {Math.round(match.confidenceScore * 100)}%
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onViewMatch?.(match)}
              >
                <Eye className="w-4 h-4 mr-1" />
                Review
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Export types for external use
export type { DuplicateMatch, ClaimInfo }
