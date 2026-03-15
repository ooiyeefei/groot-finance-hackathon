'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { Id } from '../../../../../convex/_generated/dataModel'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { formatCurrency } from '@/lib/utils/format-number'
import { Brain, ShieldCheck, AlertTriangle, ArrowRight } from 'lucide-react'

interface GLClassificationPanelProps {
  transactionId: Id<'bank_transactions'>
  businessId: Id<'businesses'>
  onClose: () => void
}

export default function GLClassificationPanel({
  transactionId,
  businessId,
  onClose,
}: GLClassificationPanelProps) {
  const tx = useQuery(api.functions.bankTransactions.getById, { id: transactionId })
  const coaAccounts = useQuery(api.functions.chartOfAccounts.list, {
    businessId,
    isActive: true,
  })

  const confirmClassification = useMutation(api.functions.bankTransactions.confirmClassification)
  const rejectClassification = useMutation(api.functions.bankTransactions.rejectClassification)
  const overrideClassification = useMutation(api.functions.bankTransactions.overrideClassification)

  const [showOverride, setShowOverride] = useState(false)
  const [overrideDebitId, setOverrideDebitId] = useState('')
  const [overrideCreditId, setOverrideCreditId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  if (!tx) return null

  const confidence = tx.classificationConfidence ?? 0
  const tier = tx.classificationTier ?? 0
  const reasoning = tx.classificationReasoning ?? ''

  // Resolve account names
  const debitAccount = coaAccounts?.find((a) => a._id === tx.suggestedDebitAccountId)
  const creditAccount = coaAccounts?.find((a) => a._id === tx.suggestedCreditAccountId)

  const confidenceColor =
    confidence >= 0.90
      ? 'text-emerald-500 bg-emerald-500/10'
      : confidence >= 0.70
        ? 'text-amber-500 bg-amber-500/10'
        : 'text-red-500 bg-red-500/10'

  const tierLabel = tier === 1 ? 'Rules' : tier === 2 ? 'AI' : 'Unknown'
  const tierColor = tier === 1 ? 'bg-muted text-muted-foreground' : 'bg-purple-500/10 text-purple-500'

  const handleConfirm = async () => {
    setIsSubmitting(true)
    setValidationError(null)
    try {
      await confirmClassification({ id: transactionId })
      onClose()
    } catch (err: any) {
      const message = err?.data?.message || err?.message || 'Failed to post to GL'
      setValidationError(message)
      console.error('Confirm failed:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReject = async () => {
    setIsSubmitting(true)
    setValidationError(null)
    try {
      await rejectClassification({ id: transactionId })
      onClose()
    } catch (err: any) {
      const message = err?.data?.message || err?.message || 'Failed to reject classification'
      setValidationError(message)
      console.error('Reject failed:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOverride = async () => {
    if (!overrideDebitId || !overrideCreditId) return
    // Client-side validation: accounts must be different
    if (overrideDebitId === overrideCreditId) {
      setValidationError('Debit and credit accounts must be different for a valid journal entry.')
      return
    }
    setIsSubmitting(true)
    setValidationError(null)
    try {
      await overrideClassification({
        id: transactionId,
        debitAccountId: overrideDebitId as Id<'chart_of_accounts'>,
        creditAccountId: overrideCreditId as Id<'chart_of_accounts'>,
      })
      onClose()
    } catch (err: any) {
      const message = err?.data?.message || err?.message || 'Failed to override classification'
      setValidationError(message)
      console.error('Override failed:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isPosted = tx.reconciliationStatus === 'posted'

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>GL Classification</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Transaction details */}
          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="text-sm font-medium text-foreground">{tx.description}</div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{tx.transactionDate}</span>
              {tx.reference && <span>Ref: {tx.reference}</span>}
            </div>
            <div className="flex items-center gap-3">
              {tx.debitAmount ? (
                <span className="text-sm font-medium text-red-500">
                  Debit: {formatCurrency(tx.debitAmount, 'MYR')}
                </span>
              ) : null}
              {tx.creditAmount ? (
                <span className="text-sm font-medium text-emerald-500">
                  Credit: {formatCurrency(tx.creditAmount, 'MYR')}
                </span>
              ) : null}
            </div>
          </div>

          {/* AI Suggestion */}
          {(debitAccount || creditAccount) && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Brain className="w-4 h-4 text-primary" />
                AI Suggestion
              </div>

              {/* Badges */}
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceColor}`}>
                  {Math.round(confidence * 100)}% confidence
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tierColor}`}>
                  {tierLabel}
                </span>
              </div>

              {/* Account mapping */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-red-500 font-medium">DR</span>
                  <span className="text-foreground">
                    {debitAccount
                      ? `${debitAccount.accountCode} — ${debitAccount.accountName}`
                      : 'Unknown account'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-emerald-500 font-medium">CR</span>
                  <span className="text-foreground">
                    {creditAccount
                      ? `${creditAccount.accountCode} — ${creditAccount.accountName}`
                      : 'Unknown account'}
                  </span>
                </div>
              </div>

              {/* Reasoning */}
              {reasoning && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                  {reasoning}
                </div>
              )}
            </div>
          )}

          {/* Posted badge */}
          {isPosted && tx.journalEntryId && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600">
              <ShieldCheck className="w-4 h-4" />
              Posted to GL — Journal Entry created
            </div>
          )}

          {/* Validation error display */}
          {validationError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Override controls */}
          {!isPosted && (
            <>
              {showOverride ? (
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <div className="text-sm font-medium text-foreground">Override Classification</div>
                  <div>
                    <label className="text-xs text-muted-foreground">Debit Account</label>
                    <select
                      value={overrideDebitId}
                      onChange={(e) => setOverrideDebitId(e.target.value)}
                      className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground"
                    >
                      <option value="">— Select Account —</option>
                      {coaAccounts?.map((coa) => (
                        <option key={coa._id} value={coa._id}>
                          {coa.accountCode} — {coa.accountName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-center">
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Credit Account</label>
                    <select
                      value={overrideCreditId}
                      onChange={(e) => setOverrideCreditId(e.target.value)}
                      className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground"
                    >
                      <option value="">— Select Account —</option>
                      {coaAccounts?.map((coa) => (
                        <option key={coa._id} value={coa._id}>
                          {coa.accountCode} — {coa.accountName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleOverride}
                      disabled={!overrideDebitId || !overrideCreditId || isSubmitting}
                      className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-50"
                    >
                      {isSubmitting ? 'Posting...' : 'Override & Post to GL'}
                    </button>
                    <button
                      onClick={() => setShowOverride(false)}
                      className="px-3 py-1.5 text-sm font-medium rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirm}
                    disabled={isSubmitting || !tx.suggestedDebitAccountId}
                    className="flex-1 px-3 py-2 text-sm font-medium rounded-md bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? 'Posting...' : 'Confirm & Post to GL'}
                  </button>
                  <button
                    onClick={() => setShowOverride(true)}
                    disabled={isSubmitting}
                    className="px-3 py-2 text-sm font-medium rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
                  >
                    Override
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={isSubmitting}
                    className="px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    Reject
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
