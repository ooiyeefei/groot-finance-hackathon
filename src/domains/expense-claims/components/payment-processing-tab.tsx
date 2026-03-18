'use client'
// Batch Payment Processing — Issue #260
import { useState, useMemo } from 'react'
import { useQuery, useMutation } from 'convex/react'
import {
  DollarSign,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Undo2,
  CreditCard,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { useActiveBusiness } from '@/contexts/business-context'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import SharedDuplicateReviewModal from './shared-duplicate-review-modal'

const PAYMENT_METHODS = [
  'Bank Transfer',
  'Cheque',
  'Cash',
  'Online Transfer',
  'PayNow',
  'DuitNow',
]

export default function PaymentProcessingTab() {
  const { businessId } = useActiveBusiness()
  const data = useQuery(
    api.functions.expenseClaims.getPendingPaymentClaims,
    businessId ? { businessId: businessId as Id<'businesses'> } : 'skip'
  )
  const batchPay = useMutation(api.functions.expenseClaims.batchMarkAsPaid)
  const sendBack = useMutation(api.functions.expenseClaims.sendBackClaim)

  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(new Set())
  const [expandedSubmissions, setExpandedSubmissions] = useState<Set<string>>(new Set())
  const [isProcessing, setIsProcessing] = useState(false)
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [sendBackClaimId, setSendBackClaimId] = useState<string | null>(null)
  const [sendBackReason, setSendBackReason] = useState('')
  const [isSendingBack, setIsSendingBack] = useState(false)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  // Duplicate review modal state
  const [showDuplicateReview, setShowDuplicateReview] = useState(false)
  const [reviewingClaim, setReviewingClaim] = useState<any>(null)
  const [duplicateMatches, setDuplicateMatches] = useState<any[]>([])

  // Filter state
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterCategory, setFilterCategory] = useState('')

  const isLoading = data === undefined

  // Collect all claims for selection/filtering
  const allClaims = useMemo(() => {
    if (!data) return []
    const claims: Array<{
      _id: string
      description: string
      vendorName: string
      expenseCategory: string
      totalAmount: number
      currency: string
      referenceNumber: string
      submittedAt?: number
      employeeName: string
      submissionId?: string
      submissionTitle?: string
    }> = []

    for (const sub of data.submissions) {
      for (const c of sub.claims) {
        claims.push({
          ...c,
          submissionId: sub._id,
          submissionTitle: sub.title,
        })
      }
    }
    for (const c of data.ungroupedClaims) {
      claims.push({ ...c, submissionId: undefined, submissionTitle: undefined })
    }
    return claims
  }, [data])

  // Apply filters
  const filteredSubmissions = useMemo(() => {
    if (!data) return []
    return data.submissions
      .map((sub) => ({
        ...sub,
        claims: sub.claims.filter((c) => {
          if (filterEmployee && !sub.employeeName.toLowerCase().includes(filterEmployee.toLowerCase())) return false
          if (filterCategory && c.expenseCategory !== filterCategory) return false
          return true
        }),
      }))
      .filter((sub) => sub.claims.length > 0)
  }, [data, filterEmployee, filterCategory])

  const filteredUngrouped = useMemo(() => {
    if (!data) return []
    return data.ungroupedClaims.filter((c) => {
      if (filterEmployee && !c.employeeName.toLowerCase().includes(filterEmployee.toLowerCase())) return false
      if (filterCategory && c.expenseCategory !== filterCategory) return false
      return true
    })
  }, [data, filterEmployee, filterCategory])

  // Get unique categories and employees for filters
  const categories = useMemo(() => {
    const cats = new Set(allClaims.map((c) => c.expenseCategory).filter(Boolean))
    return Array.from(cats).sort()
  }, [allClaims])

  const employees = useMemo(() => {
    const emps = new Set(allClaims.map((c) => c.employeeName).filter(Boolean))
    return Array.from(emps).sort()
  }, [allClaims])

  // Running totals per currency (only selected + visible)
  const selectedTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const claim of allClaims) {
      if (selectedClaims.has(claim._id)) {
        const cur = claim.currency || 'MYR'
        totals[cur] = (totals[cur] || 0) + claim.totalAmount
      }
    }
    return totals
  }, [allClaims, selectedClaims])

  // All visible claim IDs (after filtering)
  const visibleClaimIds = useMemo(() => {
    const ids: string[] = []
    for (const sub of filteredSubmissions) {
      for (const c of sub.claims) ids.push(c._id)
    }
    for (const c of filteredUngrouped) ids.push(c._id)
    return ids
  }, [filteredSubmissions, filteredUngrouped])

  const isAllSelected = visibleClaimIds.length > 0 && visibleClaimIds.every((id) => selectedClaims.has(id))

  // Toggle helpers
  const toggleSubmission = (subId: string) => {
    setExpandedSubmissions((prev) => {
      const next = new Set(prev)
      if (next.has(subId)) next.delete(subId)
      else next.add(subId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedClaims(new Set())
    } else {
      setSelectedClaims(new Set(visibleClaimIds))
    }
  }

  const toggleSubmissionSelect = (sub: typeof filteredSubmissions[0]) => {
    const subClaimIds = sub.claims.map((c) => c._id)
    const allSelected = subClaimIds.every((id) => selectedClaims.has(id))
    setSelectedClaims((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        subClaimIds.forEach((id) => next.delete(id))
      } else {
        subClaimIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const toggleClaimSelect = (claimId: string) => {
    setSelectedClaims((prev) => {
      const next = new Set(prev)
      if (next.has(claimId)) next.delete(claimId)
      else next.add(claimId)
      return next
    })
  }

  // Mark as Paid
  const handleMarkAsPaid = async () => {
    if (!businessId || selectedClaims.size === 0) return
    setIsProcessing(true)
    setResultMessage(null)
    try {
      const result = await batchPay({
        businessId: businessId as Id<'businesses'>,
        claimIds: Array.from(selectedClaims) as Id<'expense_claims'>[],
        paymentMethod: paymentMethod || undefined,
        paymentReference: paymentReference || undefined,
        paymentDate: new Date().toISOString().split('T')[0],
      })
      setSelectedClaims(new Set())
      setShowPaymentDialog(false)
      setPaymentMethod('')
      setPaymentReference('')
      const totalStr = Object.entries(result.currencyTotals)
        .map(([cur, amt]) => formatCurrency(amt, cur))
        .join(' + ')
      setResultMessage(
        `Processed ${result.processedCount} claim(s) — ${totalStr}${result.skippedCount > 0 ? ` (${result.skippedCount} skipped)` : ''}`
      )
      setTimeout(() => setResultMessage(null), 8000)
    } catch (error) {
      console.error('Batch payment failed:', error)
      setResultMessage(`Error: ${error instanceof Error ? error.message : 'Payment processing failed'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  // Send Back
  const handleSendBack = async () => {
    if (!businessId || !sendBackClaimId || !sendBackReason.trim()) return
    setIsSendingBack(true)
    try {
      await sendBack({
        businessId: businessId as Id<'businesses'>,
        claimId: sendBackClaimId as Id<'expense_claims'>,
        reason: sendBackReason,
      })
      setSendBackClaimId(null)
      setSendBackReason('')
      setResultMessage('Claim sent back to employee for correction.')
      setTimeout(() => setResultMessage(null), 5000)
    } catch (error) {
      console.error('Send back failed:', error)
      setResultMessage(`Error: ${error instanceof Error ? error.message : 'Send back failed'}`)
    } finally {
      setIsSendingBack(false)
    }
  }

  // Handle duplicate review (finance admin view)
  const handleReviewDuplicates = async (claim: any) => {
    try {
      const response = await fetch('/api/v1/expense-claims/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorName: claim.vendorName || '',
          transactionDate: claim.transactionDate || '',
          totalAmount: claim.totalAmount || 0,
          currency: claim.currency || 'MYR',
          referenceNumber: claim.referenceNumber || undefined,
        }),
      })

      const result = await response.json()
      if (result.success && result.data.matches) {
        const matches = result.data.matches.filter(
          (m: any) => m.matchedClaim._id !== claim._id
        )
        setReviewingClaim(claim)
        setDuplicateMatches(matches)
        setShowDuplicateReview(true)
      }
    } catch (err) {
      console.error('[Payment Processing] Error fetching duplicates:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const totalPendingCount = visibleClaimIds.length

  return (
    <>
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Payment Processing
        </CardTitle>
        <CardDescription>Approved expense claims ready for reimbursement</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Result message */}
        {resultMessage && (
          <div className={`p-3 rounded-md text-sm ${resultMessage.startsWith('Error') ? 'bg-destructive/10 text-destructive' : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'}`}>
            {resultMessage}
          </div>
        )}

        {/* Filters */}
        {totalPendingCount > 0 && (
          <div className="flex flex-wrap gap-3">
            <div className="w-48">
              <Select value={filterEmployee || '__all__'} onValueChange={(v) => setFilterEmployee(v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Employees</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Select value={filterCategory || '__all__'} onValueChange={(v) => setFilterCategory(v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Empty state */}
        {totalPendingCount === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <CheckCircle className="w-12 h-12 mx-auto mb-4" />
            <p>No approved claims pending payment</p>
            <p className="text-sm">All approved claims have been processed</p>
          </div>
        ) : (
          <>
            {/* Bulk actions bar */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm text-foreground font-medium">
                  {selectedClaims.size > 0
                    ? `${selectedClaims.size} of ${totalPendingCount} selected`
                    : `Select All (${totalPendingCount} claims)`}
                </span>
                {selectedClaims.size > 0 && Object.keys(selectedTotals).length > 0 && (
                  <span className="text-sm text-muted-foreground ml-2">
                    Total: {Object.entries(selectedTotals).map(([cur, amt]) => formatCurrency(amt, cur)).join(' + ')}
                  </span>
                )}
              </div>
              <Button
                size="sm"
                onClick={() => setShowPaymentDialog(true)}
                disabled={selectedClaims.size === 0 || isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <DollarSign className="w-4 h-4 mr-2" />
                )}
                Mark as Paid ({selectedClaims.size})
              </Button>
            </div>

            {/* Submissions list */}
            <div className="space-y-2">
              {filteredSubmissions.map((sub) => {
                const isExpanded = expandedSubmissions.has(sub._id)
                const subClaimIds = sub.claims.map((c) => c._id)
                const allSubSelected = subClaimIds.every((id) => selectedClaims.has(id))
                const someSubSelected = subClaimIds.some((id) => selectedClaims.has(id))

                // Totals per currency for this submission
                const subTotals: Record<string, number> = {}
                for (const c of sub.claims) {
                  const cur = c.currency || 'MYR'
                  subTotals[cur] = (subTotals[cur] || 0) + c.totalAmount
                }

                return (
                  <div key={sub._id} className="border border-border rounded-lg overflow-hidden">
                    {/* Submission header */}
                    <div
                      className="flex items-center gap-3 p-3 bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => toggleSubmission(sub._id)}
                    >
                      <Checkbox
                        checked={allSubSelected}
                        // @ts-expect-error indeterminate is valid
                        indeterminate={someSubSelected && !allSubSelected}
                        onCheckedChange={() => toggleSubmissionSelect(sub)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{sub.title}</span>
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {sub.claims.length} claim{sub.claims.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {sub.employeeName}
                          {sub.submittedAt && <> &bull; {formatBusinessDate(new Date(sub.submittedAt).toISOString().split('T')[0])}</>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground">
                          {Object.entries(subTotals).map(([cur, amt]) => formatCurrency(amt, cur)).join(' + ')}
                        </p>
                      </div>
                    </div>

                    {/* Expanded claims */}
                    {isExpanded && (
                      <div className="divide-y divide-border">
                        {sub.claims.map((claim) => (
                          <ClaimRow
                            key={claim._id}
                            claim={claim}
                            isSelected={selectedClaims.has(claim._id)}
                            onToggleSelect={() => toggleClaimSelect(claim._id)}
                            onSendBack={() => {
                              setSendBackClaimId(claim._id)
                              setSendBackReason('')
                            }}
                            onReviewDuplicates={handleReviewDuplicates}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Ungrouped claims */}
              {filteredUngrouped.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="p-3 bg-muted/30">
                    <span className="text-sm font-medium text-muted-foreground">Individual Claims (no submission)</span>
                  </div>
                  <div className="divide-y divide-border">
                    {filteredUngrouped.map((claim) => (
                      <ClaimRow
                        key={claim._id}
                        claim={claim}
                        isSelected={selectedClaims.has(claim._id)}
                        onToggleSelect={() => toggleClaimSelect(claim._id)}
                        onSendBack={() => {
                          setSendBackClaimId(claim._id)
                          setSendBackReason('')
                        }}
                        onReviewDuplicates={handleReviewDuplicates}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Payment confirmation dialog */}
        {showPaymentDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPaymentDialog(false)}>
            <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-foreground">Confirm Payment</h3>
              <p className="text-sm text-muted-foreground">
                Process <strong>{selectedClaims.size}</strong> claim(s) totaling{' '}
                <strong>{Object.entries(selectedTotals).map(([cur, amt]) => formatCurrency(amt, cur)).join(' + ')}</strong>
              </p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Payment Method (optional)</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Payment Reference (optional)</Label>
                  <Input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="e.g. TXN-2026-0301"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowPaymentDialog(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleMarkAsPaid} disabled={isProcessing}>
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <DollarSign className="w-4 h-4 mr-2" />
                  )}
                  Confirm Payment
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Send back dialog */}
        {sendBackClaimId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSendBackClaimId(null)}>
            <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-foreground">Send Back for Correction</h3>
              <p className="text-sm text-muted-foreground">
                This claim will be returned to the employee for correction. After fixing, it will come back directly to Payment Processing (no manager re-approval needed).
              </p>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Reason (required)</Label>
                <Input
                  value={sendBackReason}
                  onChange={(e) => setSendBackReason(e.target.value)}
                  placeholder="e.g. Missing receipt, incorrect amount"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setSendBackClaimId(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleSendBack}
                  disabled={!sendBackReason.trim() || isSendingBack}
                >
                  {isSendingBack ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Undo2 className="w-4 h-4 mr-2" />
                  )}
                  Send Back
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Shared Duplicate Review Modal - Finance Admin View */}
    <SharedDuplicateReviewModal
      isOpen={showDuplicateReview && duplicateMatches.length > 0 && !!reviewingClaim}
      onClose={() => {
        setShowDuplicateReview(false)
        setDuplicateMatches([])
        setReviewingClaim(null)
      }}
      currentClaim={{
        id: reviewingClaim?._id || '',
        vendor_name: reviewingClaim?.vendorName,
        total_amount: String(reviewingClaim?.totalAmount || 0),
        currency: reviewingClaim?.currency,
        transaction_date: reviewingClaim?.transactionDate,
        reference_number: reviewingClaim?.referenceNumber,
      }}
      duplicateMatches={duplicateMatches}
      viewMode="finance"
      onViewMatchedClaim={undefined}
    />
    </>
  )
}

// Individual claim row
function ClaimRow({
  claim,
  isSelected,
  onToggleSelect,
  onSendBack,
  onReviewDuplicates,
}: {
  claim: {
    _id: string
    description: string
    vendorName: string
    expenseCategory: string
    totalAmount: number
    currency: string
    referenceNumber: string
    submittedAt?: number
    employeeName: string
    transactionDate?: string
    duplicateStatus?: string
    duplicateOverrideReason?: string
    isSplitExpense?: boolean
  }
  isSelected: boolean
  onToggleSelect: () => void
  onSendBack: () => void
  onReviewDuplicates: (claim: any) => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
      <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground truncate">
            {claim.vendorName || claim.description || 'Expense'}
          </span>
          {claim.expenseCategory && (
            <Badge variant="outline" className="text-[10px] shrink-0">{claim.expenseCategory}</Badge>
          )}
          {claim.duplicateStatus && claim.duplicateStatus !== 'none' && (
            <Badge
              className="text-[10px] shrink-0 bg-yellow-500/20 text-yellow-700 border-yellow-500/30 hover:bg-yellow-500/30 cursor-pointer transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                onReviewDuplicates(claim)
              }}
            >
              <AlertTriangle className="w-3 h-3 mr-0.5" />
              {claim.isSplitExpense ? 'Split' : 'Duplicate'}
            </Badge>
          )}
        </div>
        {claim.duplicateStatus && claim.duplicateStatus !== 'none' && claim.duplicateOverrideReason && (
          <p className="text-[10px] text-yellow-600 truncate">
            Justification: {claim.duplicateOverrideReason}
          </p>
        )}
        <p className="text-xs text-muted-foreground truncate">
          {claim.employeeName}
          {claim.referenceNumber && <> &bull; Ref: {claim.referenceNumber}</>}
          {claim.submittedAt && <> &bull; {formatBusinessDate(new Date(claim.submittedAt).toISOString().split('T')[0])}</>}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-medium text-foreground">
          {formatCurrency(claim.totalAmount, claim.currency)}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-muted-foreground hover:text-destructive shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          onSendBack()
        }}
        title="Send back for correction"
      >
        <Undo2 className="w-3 h-3" />
      </Button>
    </div>
  )
}
