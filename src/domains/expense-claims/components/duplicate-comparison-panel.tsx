/**
 * Duplicate Comparison Panel Component
 * Feature: 007-duplicate-expense-detection (User Story 2, T026)
 *
 * Side-by-side comparison view of potentially duplicate expense claims.
 * Allows managers to confirm or dismiss duplicates with justification.
 */

'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle, XCircle, User, Calendar, DollarSign, FileText, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { formatNumber } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import DuplicateBadge, { type MatchTier } from './duplicate-badge'

interface ClaimSummary {
  _id: string
  vendorName: string | null
  totalAmount: number | null
  currency: string | null
  transactionDate: string | null
  status: string
  businessPurpose?: string | null
  referenceNumber?: string | null
  submitter?: {
    _id: string
    fullName: string
    email: string
  } | null
}

interface DuplicateMatch {
  _id: string
  matchTier: MatchTier
  matchedFields: string[]
  confidenceScore: number
  isCrossUser: boolean
  status: 'pending' | 'confirmed_duplicate' | 'dismissed'
  overrideReason?: string
}

export interface DuplicateComparisonPanelProps {
  match: DuplicateMatch
  sourceClaim: ClaimSummary
  matchedClaim: ClaimSummary
  onDismiss?: (matchId: string, reason: string) => Promise<void>
  onConfirm?: (matchId: string) => Promise<void>
  onClose?: () => void
  isLoading?: boolean
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30' },
  submitted: { label: 'Submitted', className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30' },
  approved: { label: 'Approved', className: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30' },
  rejected: { label: 'Rejected', className: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30' },
  reimbursed: { label: 'Reimbursed', className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30' },
}

export default function DuplicateComparisonPanel({
  match,
  sourceClaim,
  matchedClaim,
  onDismiss,
  onConfirm,
  onClose,
  isLoading = false,
}: DuplicateComparisonPanelProps) {
  const [dismissReason, setDismissReason] = useState('')
  const [showDismissForm, setShowDismissForm] = useState(false)
  const [actionLoading, setActionLoading] = useState<'dismiss' | 'confirm' | null>(null)

  const handleDismiss = async () => {
    if (!dismissReason.trim()) return

    setActionLoading('dismiss')
    try {
      await onDismiss?.(match._id, dismissReason)
    } finally {
      setActionLoading(null)
      setShowDismissForm(false)
    }
  }

  const handleConfirm = async () => {
    setActionLoading('confirm')
    try {
      await onConfirm?.(match._id)
    } finally {
      setActionLoading(null)
    }
  }

  const renderClaimCard = (claim: ClaimSummary, label: string, isHighlighted: boolean = false) => {
    const statusBadge = STATUS_BADGES[claim.status] || STATUS_BADGES.draft

    return (
      <Card className={`bg-card border-border ${isHighlighted ? 'ring-2 ring-primary/30' : ''}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Vendor */}
          <div className="flex items-start gap-3">
            <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Vendor</p>
              <p className={`text-foreground font-medium ${match.matchedFields.includes('vendorName') ? 'bg-yellow-500/20 px-1 rounded' : ''}`}>
                {claim.vendorName || 'Unknown'}
              </p>
            </div>
          </div>

          {/* Amount */}
          <div className="flex items-start gap-3">
            <DollarSign className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className={`text-foreground font-medium ${match.matchedFields.includes('totalAmount') ? 'bg-yellow-500/20 px-1 rounded' : ''}`}>
                {formatNumber(claim.totalAmount || 0, 2)} {claim.currency || ''}
              </p>
            </div>
          </div>

          {/* Date */}
          <div className="flex items-start gap-3">
            <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Transaction Date</p>
              <p className={`text-foreground ${match.matchedFields.includes('transactionDate') ? 'bg-yellow-500/20 px-1 rounded' : ''}`}>
                {formatBusinessDate(claim.transactionDate)}
              </p>
            </div>
          </div>

          {/* Submitter */}
          <div className="flex items-start gap-3">
            <User className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Submitter</p>
              <p className="text-foreground">{claim.submitter?.fullName || 'Unknown'}</p>
              <p className="text-muted-foreground text-xs">{claim.submitter?.email || ''}</p>
            </div>
          </div>

          {/* Reference Number */}
          {claim.referenceNumber && (
            <div className="flex items-start gap-3">
              <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Reference</p>
                <p className={`text-foreground text-sm ${match.matchedFields.includes('referenceNumber') ? 'bg-yellow-500/20 px-1 rounded' : ''}`}>
                  {claim.referenceNumber}
                </p>
              </div>
            </div>
          )}

          {/* Business Purpose */}
          {claim.businessPurpose && (
            <div className="pt-2 border-t border-border">
              <p className="text-sm text-muted-foreground mb-1">Business Purpose</p>
              <p className="text-foreground text-sm">{claim.businessPurpose}</p>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-card border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <div>
              <h3 className="font-semibold text-foreground">Duplicate Comparison</h3>
              <p className="text-sm text-muted-foreground">
                Review and resolve this potential duplicate
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DuplicateBadge
              matchTier={match.matchTier}
              isCrossUser={match.isCrossUser}
              confidenceScore={match.confidenceScore}
              showTooltip={false}
            />
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Match Info */}
      <div className="bg-muted/50 p-3 border-b border-border">
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Confidence:</span>
            <span className="ml-1 text-foreground font-medium">
              {Math.round(match.confidenceScore * 100)}%
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Matched Fields:</span>
            <span className="ml-1 text-foreground">
              {match.matchedFields.join(', ')}
            </span>
          </div>
          {match.isCrossUser && (
            <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
              <User className="w-3 h-3 mr-1" />
              Cross-User
            </Badge>
          )}
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderClaimCard(sourceClaim, 'Original Claim', true)}
          {renderClaimCard(matchedClaim, 'Matched Claim')}
        </div>
      </div>

      {/* Actions */}
      {match.status === 'pending' && (
        <div className="bg-card border-t border-border p-4">
          {showDismissForm ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground font-medium">Why is this not a duplicate?</p>
              <Textarea
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                placeholder="e.g., Separate transactions at same vendor, different items purchased..."
                className="bg-input border-border text-foreground"
                rows={3}
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setShowDismissForm(false)}
                  disabled={actionLoading !== null}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  onClick={handleDismiss}
                  disabled={!dismissReason.trim() || actionLoading !== null}
                >
                  {actionLoading === 'dismiss' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Dismissing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Dismiss as Not Duplicate
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowDismissForm(true)}
                disabled={actionLoading !== null}
                className="flex-1"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Not a Duplicate
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={actionLoading !== null}
                className="flex-1"
              >
                {actionLoading === 'confirm' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 mr-2" />
                    Confirm Duplicate
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Already Resolved */}
      {match.status !== 'pending' && (
        <div className="bg-muted/50 border-t border-border p-4">
          <div className="flex items-center gap-2">
            {match.status === 'dismissed' ? (
              <>
                <CheckCircle className="w-4 h-4 text-success" />
                <span className="text-success font-medium">Dismissed</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-destructive" />
                <span className="text-destructive font-medium">Confirmed Duplicate</span>
              </>
            )}
          </div>
          {match.overrideReason && (
            <p className="mt-2 text-sm text-muted-foreground">
              Reason: {match.overrideReason}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
