/**
 * Shared Duplicate Review Modal
 * Standardized duplicate view for employee, manager, and finance admin roles
 *
 * Features:
 * - Shows all matched duplicates with complete information
 * - Displays submitter names, dates, amounts, justifications
 * - Clickable "View Details" to open matched claims
 * - Role-appropriate UI (read-only for finance admin)
 */

'use client'

import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatBusinessDate } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/format-number'

interface DuplicateMatch {
  tier: 'exact' | 'strong' | 'fuzzy'
  confidenceScore: number
  matchedFields: string[]
  isCrossUser: boolean
  matchedClaim: {
    _id: string
    vendorName: string
    transactionDate: string
    totalAmount: number
    currency: string
    referenceNumber?: string | null
    status: string
    submittedByName?: string
    submittedAt?: number | null
    duplicateOverrideReason?: string | null
  }
}

interface CurrentClaim {
  id: string
  vendor_name?: string
  total_amount?: string
  currency?: string
  transaction_date?: string
  reference_number?: string
}

interface SharedDuplicateReviewModalProps {
  isOpen: boolean
  onClose: () => void
  currentClaim: CurrentClaim
  duplicateMatches: DuplicateMatch[]
  viewMode: 'employee' | 'manager' | 'finance'
  onViewMatchedClaim?: (claimId: string) => void
}

export default function SharedDuplicateReviewModal({
  isOpen,
  onClose,
  currentClaim,
  duplicateMatches,
  viewMode,
  onViewMatchedClaim,
}: SharedDuplicateReviewModalProps) {
  if (!isOpen) return null

  const roleLabels = {
    employee: 'Potential Duplicate Detected',
    manager: 'Duplicate Review',
    finance: 'Duplicate Audit Trail',
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full max-h-[90vh] overflow-hidden bg-card rounded-lg shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <div>
              <h3 className="font-semibold text-foreground">{roleLabels[viewMode]}</h3>
              <p className="text-sm text-muted-foreground">
                {duplicateMatches.length} potential duplicate{duplicateMatches.length !== 1 ? 's' : ''} found
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Current Expense Summary */}
        <div className="px-6 py-4 bg-muted/30 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">Current Expense</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {currentClaim.vendor_name || 'Unknown Vendor'}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatBusinessDate(currentClaim.transaction_date || '')}
                {currentClaim.reference_number && <> &bull; Ref: {currentClaim.reference_number}</>}
              </p>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {formatCurrency(parseFloat(currentClaim.total_amount || '0'), currentClaim.currency || 'MYR')}
            </p>
          </div>
        </div>

        {/* All matching duplicates */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-280px)] space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Matching Expenses ({duplicateMatches.length})</p>
          {duplicateMatches.map((match: DuplicateMatch, idx: number) => (
            <div key={match.matchedClaim?._id || idx} className="p-4 rounded-lg border border-border bg-card hover:bg-card/80 transition-colors">
              {/* Header row with badges and submitter */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`text-[10px] ${match.tier === 'exact' ? 'bg-red-500/20 text-red-700 border-red-500/30' : 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30'}`}>
                    {match.tier === 'exact' ? 'Exact Match' : 'Strong Match'}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {Math.round((match.confidenceScore || 0.5) * 100)}% confidence
                  </span>
                  {match.matchedClaim?.submittedByName && (
                    <Badge variant="outline" className="text-[10px]">
                      {match.matchedClaim.submittedByName}
                    </Badge>
                  )}
                </div>
                {onViewMatchedClaim && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      if (match.matchedClaim?._id) {
                        onViewMatchedClaim(match.matchedClaim._id)
                      }
                    }}
                  >
                    View Details
                  </Button>
                )}
              </div>

              {/* Claim details */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{match.matchedClaim?.vendorName || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">
                      Transaction: {formatBusinessDate(match.matchedClaim?.transactionDate || '')}
                      {match.matchedClaim?.submittedAt && (
                        <> &bull; Submitted: {new Date(match.matchedClaim.submittedAt).toLocaleDateString()}</>
                      )}
                    </p>
                    {match.matchedClaim?.referenceNumber && (
                      <p className="text-xs text-muted-foreground">
                        Ref: {match.matchedClaim.referenceNumber}
                      </p>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-foreground ml-3">
                    {formatCurrency(match.matchedClaim?.totalAmount || 0, match.matchedClaim?.currency || 'MYR')}
                  </p>
                </div>

                {/* Matched fields */}
                {match.matchedFields?.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Matched on: {match.matchedFields.join(', ')}
                  </p>
                )}

                {/* Justification from other submitter */}
                {match.matchedClaim?.duplicateOverrideReason && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Their Justification:</p>
                    <p className="text-xs text-foreground bg-muted/50 rounded px-2 py-1">
                      {match.matchedClaim.duplicateOverrideReason}
                    </p>
                  </div>
                )}

                {/* Claim ID for reference */}
                <p className="text-[10px] text-muted-foreground font-mono">
                  ID: {(match.matchedClaim?._id || '').slice(0, 12)}...
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer with role-specific message */}
        <div className="px-6 py-3 border-t border-border">
          {viewMode === 'employee' && (
            <p className="text-xs text-muted-foreground mb-3">
              Please review these potential duplicates. If this is a legitimate expense, provide a justification when submitting.
            </p>
          )}
          {viewMode === 'manager' && (
            <p className="text-xs text-muted-foreground mb-3">
              Review the duplicate matches above. Employee justifications are shown if provided. Approve only if you're confident these are separate transactions.
            </p>
          )}
          {viewMode === 'finance' && (
            <p className="text-xs text-muted-foreground mb-3">
              Audit trail for reference. This claim was approved by a manager despite duplicate warnings.
            </p>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
