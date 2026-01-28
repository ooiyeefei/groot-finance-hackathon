/**
 * Duplicate Warning Modal
 * Feature: 007-duplicate-expense-detection
 *
 * Displays when duplicates are detected during expense claim submission.
 * Handles both same-user duplicates and cross-user (shared expense) scenarios.
 */

'use client'

import React, { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle, Users, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatBusinessDate } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/format-number'
import type {
  DuplicateMatchPreview,
  DuplicateOverride,
  MatchTier
} from '@/domains/expense-claims/types/duplicate-detection'

// Current expense info for comparison display
interface CurrentExpenseInfo {
  claimId?: string
  vendorName: string
  transactionDate: string
  totalAmount: number
  currency: string
  status: string
  referenceNumber?: string
}

interface DuplicateWarningModalProps {
  isOpen: boolean
  onClose: () => void
  onProceed: (override: DuplicateOverride) => void
  duplicates: DuplicateMatchPreview[]
  highestTier: MatchTier | null
  onViewExpense?: (claimId: string) => void
  currentExpense?: CurrentExpenseInfo
}

/**
 * Get badge variant and label for match tier
 */
function getTierBadgeProps(tier: MatchTier): { variant: 'error' | 'warning' | 'info'; label: string } {
  switch (tier) {
    case 'exact':
      return { variant: 'error', label: 'Exact Match' }
    case 'strong':
      return { variant: 'warning', label: 'Strong Match' }
    case 'fuzzy':
      return { variant: 'info', label: 'Possible Match' }
    default:
      return { variant: 'info', label: 'Match' }
  }
}

/**
 * Format matched fields for display
 */
function formatMatchedFields(fields: string[]): string {
  return fields.map(f => f.replace(/_/g, ' ')).join(', ')
}

export default function DuplicateWarningModal({
  isOpen,
  onClose,
  onProceed,
  duplicates,
  highestTier,
  onViewExpense,
  currentExpense
}: DuplicateWarningModalProps) {
  // Local state
  const [justificationReason, setJustificationReason] = useState('')
  const [isSplitExpense, setIsSplitExpense] = useState(false)
  const [acknowledgedCrossUser, setAcknowledgedCrossUser] = useState(false)

  // Check if any duplicate is cross-user
  const hasCrossUserDuplicates = useMemo(
    () => duplicates.some(d => d.isCrossUser),
    [duplicates]
  )

  // Determine if proceed button should be enabled
  const canProceed = useMemo(() => {
    // Must have justification reason
    if (!justificationReason.trim()) return false

    // If cross-user duplicates exist, must acknowledge
    if (hasCrossUserDuplicates && !acknowledgedCrossUser) return false

    return true
  }, [justificationReason, hasCrossUserDuplicates, acknowledgedCrossUser])

  // Handle proceed action
  const handleProceed = () => {
    const override: DuplicateOverride = {
      reason: justificationReason.trim(),
      isSplitExpense: isSplitExpense,
      acknowledgedDuplicates: duplicates.map(d => d.matchedClaimId)
    }
    onProceed(override)
  }

  // Reset state when modal closes
  const handleClose = () => {
    setJustificationReason('')
    setIsSplitExpense(false)
    setAcknowledgedCrossUser(false)
    onClose()
  }

  // Don't render if not open
  if (!isOpen) return null

  // SSR safety check
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden relative shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-yellow-500/10">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Potential Duplicate Detected
              </h2>
              <p className="text-sm text-muted-foreground">
                {duplicates.length === 1
                  ? 'This expense may already exist'
                  : `${duplicates.length} potential duplicates found`}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)] space-y-6">
          {/* Cross-user warning alert */}
          {hasCrossUserDuplicates && (
            <Alert className="bg-blue-500/10 border border-blue-500/30">
              <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <AlertDescription className="text-blue-700 dark:text-blue-300">
                <strong>Potential Shared Expense:</strong> One or more matches are from other team members.
                If this is a split expense where multiple people are claiming their portion,
                please indicate this below.
              </AlertDescription>
            </Alert>
          )}

          {/* Current expense card */}
          {currentExpense && (
            <div className="space-y-3">
              <Label className="text-foreground font-medium">
                Current Expense (Being Edited)
              </Label>
              <div className="p-4 rounded-lg border-2 border-primary bg-primary/5">
                {/* Header row with Current tag */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default" size="sm" className="bg-primary text-primary-foreground">
                      ★ Current
                    </Badge>
                    <span className="text-xs text-muted-foreground capitalize">
                      {currentExpense.status}
                    </span>
                  </div>
                  {currentExpense.claimId && (
                    <span className="text-xs text-muted-foreground font-mono">
                      ID: {currentExpense.claimId.slice(0, 8)}...
                    </span>
                  )}
                </div>

                {/* Expense details */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Reference:</span>
                    <span className="ml-2 text-foreground font-medium">
                      {currentExpense.referenceNumber || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Vendor:</span>
                    <span className="ml-2 text-foreground">
                      {currentExpense.vendorName}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Date:</span>
                    <span className="ml-2 text-foreground">
                      {formatBusinessDate(currentExpense.transactionDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Amount:</span>
                    <span className="ml-2 text-foreground font-medium">
                      {formatCurrency(currentExpense.totalAmount, currentExpense.currency)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Duplicate matches list */}
          <div className="space-y-3">
            <Label className="text-foreground font-medium">
              Matching Expenses (Potential Duplicates)
            </Label>
            <div className="space-y-3">
              {duplicates.map((duplicate, index) => {
                const tierProps = getTierBadgeProps(duplicate.matchTier)
                return (
                  <div
                    key={duplicate.matchedClaimId}
                    className={`p-4 rounded-lg border border-border bg-muted/50 ${
                      onViewExpense
                        ? 'cursor-pointer hover:bg-muted hover:border-primary/50 transition-all'
                        : ''
                    }`}
                    onClick={() => onViewExpense?.(duplicate.matchedClaimId)}
                    role={onViewExpense ? 'button' : undefined}
                    tabIndex={onViewExpense ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (onViewExpense && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        onViewExpense(duplicate.matchedClaimId)
                      }
                    }}
                  >
                    {/* Header row with badges */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={tierProps.variant} size="sm">
                          {tierProps.label}
                        </Badge>
                        {duplicate.isCrossUser && (
                          <Badge variant="info" size="sm">
                            <Users className="w-3 h-3 mr-1" />
                            Other User
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {Math.round(duplicate.confidenceScore * 100)}% confidence
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">
                          ID: {duplicate.matchedClaimId.slice(0, 8)}...
                        </span>
                        {onViewExpense && (
                          <span className="text-xs text-primary flex items-center gap-1">
                            <ExternalLink className="w-3.5 h-3.5" />
                            View
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            navigator.clipboard.writeText(duplicate.matchedClaimId)
                          }}
                          className="text-muted-foreground hover:text-foreground transition-colors p-1"
                          title="Copy expense ID"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expense details */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Reference:</span>
                        <span className="ml-2 text-foreground font-medium">
                          {duplicate.matchedClaimRef}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Vendor:</span>
                        <span className="ml-2 text-foreground">
                          {duplicate.matchedClaim.vendorName}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Date:</span>
                        <span className="ml-2 text-foreground">
                          {formatBusinessDate(duplicate.matchedClaim.transactionDate)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Amount:</span>
                        <span className="ml-2 text-foreground font-medium">
                          {formatCurrency(
                            duplicate.matchedClaim.totalAmount,
                            duplicate.matchedClaim.currency
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <span className="ml-2 text-foreground capitalize">
                          {duplicate.matchedClaim.status}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Submitted by:</span>
                        <span className="ml-2 text-foreground">
                          {duplicate.matchedClaim.submittedBy}
                        </span>
                      </div>
                    </div>

                    {/* Matched fields */}
                    <div className="mt-3 pt-3 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        Matched on: {formatMatchedFields(duplicate.matchedFields)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Cross-user acknowledgment checkbox */}
          {hasCrossUserDuplicates && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/30">
                <Checkbox
                  id="split-expense"
                  checked={isSplitExpense}
                  onCheckedChange={(checked) => setIsSplitExpense(checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="split-expense" className="text-foreground font-medium cursor-pointer">
                    This is a split expense - I am claiming my portion
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Check this if multiple team members are each claiming their share of a shared expense.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/30">
                <Checkbox
                  id="acknowledge-cross-user"
                  checked={acknowledgedCrossUser}
                  onCheckedChange={(checked) => setAcknowledgedCrossUser(checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="acknowledge-cross-user" className="text-foreground font-medium cursor-pointer">
                    I acknowledge this may overlap with another team member&apos;s claim
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    You must acknowledge this before proceeding with submission.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Justification reason */}
          <div className="space-y-2">
            <Label htmlFor="justification" className="text-foreground font-medium">
              Justification Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="justification"
              value={justificationReason}
              onChange={(e) => setJustificationReason(e.target.value)}
              placeholder="Please explain why this is not a duplicate or provide additional context..."
              className="min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground">
              This explanation will be recorded for audit purposes.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleProceed}
            disabled={!canProceed}
          >
            Proceed Anyway
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
