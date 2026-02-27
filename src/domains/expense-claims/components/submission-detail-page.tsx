'use client'

import { useState, useCallback, lazy, Suspense, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSubmissionDetail, useSubmissionMutations } from '../hooks/use-expense-submissions'
import { useActiveBusiness } from '@/contexts/business-context'
import EditExpenseModalNew from './edit-expense-modal-new'
import UnifiedExpenseDetailsModal from './unified-expense-details-modal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import {
  Trash2,
  Send,
  XCircle,
  CheckCircle,
  ArrowLeft,
  Pencil,
  X,
  AlertCircle,
  Loader2,
  Upload,
  PenLine,
} from 'lucide-react'
import { useExpenseCategories, getCategoryName } from '../hooks/use-expense-categories'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import DocumentStatusBadge from '@/domains/invoices/components/document-status-badge'

// Lazy load the existing file upload component (handles full upload + AI processing pipeline)
const FileUploadZone = lazy(() => import('@/domains/utilities/components/file-upload-zone'))

interface SubmissionDetailPageProps {
  submissionId: string
  locale: string
  viewMode?: 'employee' | 'manager'
}

const STATUS_BADGES: Record<string, { className: string; label: string }> = {
  draft: { className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30', label: 'Draft' },
  submitted: { className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30', label: 'Pending Approval' },
  approved: { className: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30', label: 'Approved' },
  rejected: { className: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30', label: 'Rejected' },
  reimbursed: { className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30', label: 'Reimbursed' },
}

const CLAIM_STATUS_BADGES: Record<string, { className: string; label: string }> = {
  draft: { className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', label: 'Draft' },
  uploading: { className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400', label: 'Uploading' },
  classifying: { className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400', label: 'Classifying' },
  analyzing: { className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400', label: 'Analyzing' },
  processing: { className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400', label: 'Processing' },
  submitted: { className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400', label: 'Submitted' },
  approved: { className: 'bg-green-500/10 text-green-600 dark:text-green-400', label: 'Approved' },
  rejected: { className: 'bg-red-500/10 text-red-600 dark:text-red-400', label: 'Rejected' },
  reimbursed: { className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400', label: 'Reimbursed' },
  failed: { className: 'bg-red-500/10 text-red-600 dark:text-red-400', label: 'Failed' },
  classification_failed: { className: 'bg-red-500/10 text-red-600 dark:text-red-400', label: 'Invalid Document' },
}

export function SubmissionDetailPage({ submissionId, locale, viewMode = 'employee' }: SubmissionDetailPageProps) {
  const router = useRouter()
  const { businessId } = useActiveBusiness()
  const { data, isLoading, error, refetch } = useSubmissionDetail(submissionId)
  const { categories } = useExpenseCategories({ includeDisabled: true })
  const { updateSubmission, deleteSubmission, submitForApproval, removeClaim, approveSubmission, rejectSubmission, approvePartialSubmission } = useSubmissionMutations()

  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [showEmptyWarning, setShowEmptyWarning] = useState(true)

  // Confirmation dialog states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRemoveClaimConfirm, setShowRemoveClaimConfirm] = useState(false)
  const [isConfirmLoading, setIsConfirmLoading] = useState(false)
  const pendingRemoveClaimId = useRef<string | null>(null)

  // Manager-specific state
  const isManagerView = viewMode === 'manager'
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)

  // Partial approval selection state
  const [selectedClaimIds, setSelectedClaimIds] = useState<Set<string>>(new Set())
  const [showPartialApproveConfirm, setShowPartialApproveConfirm] = useState(false)
  const [partialRejectionReason, setPartialRejectionReason] = useState('')

  const submission = data?.submission
  const claims = data?.claims || []
  const totalsByCurrency = data?.totalsByCurrency || []

  const isDraft = submission?.status === 'draft'
  const canApproveReject = isManagerView && submission?.status === 'submitted'
  const backPath = isManagerView ? `/${locale}/manager/approvals` : `/${locale}/expense-claims`

  const processingStatuses = ['uploading', 'classifying', 'analyzing', 'extracting', 'processing']
  const hasProcessingClaims = claims.some((c) => processingStatuses.includes(c.status))
  const canSubmit = isDraft && claims.length > 0 && !hasProcessingClaims

  // Claim selection helpers (manager partial approval)
  const isAllSelected = claims.length > 0 && selectedClaimIds.size === claims.length
  const isPartialSelection = selectedClaimIds.size > 0 && selectedClaimIds.size < claims.length

  const toggleClaimSelection = useCallback((claimId: string) => {
    setSelectedClaimIds((prev) => {
      const next = new Set(prev)
      if (next.has(claimId)) next.delete(claimId)
      else next.add(claimId)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedClaimIds(new Set())
    } else {
      setSelectedClaimIds(new Set(claims.map((c) => c._id)))
    }
  }, [isAllSelected, claims])

  // Determine which modal to show based on claim status
  const selectedClaim = claims.find((c) => c._id === selectedClaimId)
  const showEditModal = !!selectedClaimId && selectedClaim?.status === 'draft'
  const showViewModal = !!selectedClaimId && selectedClaim?.status !== 'draft'

  const [manualEntryLoading, setManualEntryLoading] = useState(false)

  // Handle receipt upload success - the FileUploadZone handles the full pipeline
  const handleUploadSuccess = useCallback(() => {
    refetch()
  }, [refetch])

  // Handle manual entry - creates a blank draft claim linked to submission
  const handleManualEntry = useCallback(async () => {
    setManualEntryLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const response = await fetch('/api/v1/expense-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Manual entry',
          business_purpose: 'To be filled',
          original_amount: 0.01,
          original_currency: 'MYR',
          transaction_date: today,
          vendor_name: '',
          processing_mode: 'manual',
          submissionId,
        }),
      })
      const result = await response.json()
      console.log('[Submission] Manual entry response:', result)
      if (result.success && result.data?.expense_claim_id) {
        await refetch()
        setSelectedClaimId(result.data.expense_claim_id)
      } else {
        console.error('[Submission] Manual entry failed:', result.error || result)
      }
    } catch (err) {
      console.error('[Submission] Manual entry creation failed:', err)
    } finally {
      setManualEntryLoading(false)
    }
  }, [submissionId, refetch])

  // Handle title edit
  const handleSaveTitle = useCallback(async () => {
    if (!editTitle.trim()) return
    await updateSubmission.mutateAsync({ id: submissionId, title: editTitle.trim() })
    setIsEditingTitle(false)
    refetch()
  }, [editTitle, submissionId, updateSubmission, refetch])

  // Handle submit
  const handleSubmit = useCallback(async () => {
    try {
      await submitForApproval.mutateAsync(submissionId)
      refetch()
    } catch (e: any) {
      alert(e.message)
    }
  }, [submissionId, submitForApproval, refetch])

  // Handle delete
  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  const [isDeleted, setIsDeleted] = useState(false)

  const handleDeleteConfirmed = useCallback(async () => {
    try {
      setIsConfirmLoading(true)
      await deleteSubmission.mutateAsync(submissionId)
      setIsDeleted(true)
      setShowDeleteConfirm(false)
      router.push(`/${locale}/expense-claims`)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setIsConfirmLoading(false)
    }
  }, [submissionId, deleteSubmission, router, locale])

  // Handle remove claim
  const handleRemoveClaimClick = useCallback((claimId: string) => {
    pendingRemoveClaimId.current = claimId
    setShowRemoveClaimConfirm(true)
  }, [])

  const handleRemoveClaimConfirmed = useCallback(async () => {
    const claimId = pendingRemoveClaimId.current
    if (!claimId) return
    try {
      setIsConfirmLoading(true)
      await removeClaim.mutateAsync({ submissionId, claimId })
      setShowRemoveClaimConfirm(false)
      pendingRemoveClaimId.current = null
      refetch()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setIsConfirmLoading(false)
    }
  }, [submissionId, removeClaim, refetch])

  const handleClaimModalClose = useCallback(() => {
    setSelectedClaimId(null)
    refetch()
  }, [refetch])

  // Manager approve/reject handlers
  const handleApproveConfirmed = useCallback(async () => {
    try {
      setIsConfirmLoading(true)
      await approveSubmission.mutateAsync({ id: submissionId })
      setShowApproveConfirm(false)
      router.push(backPath)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setIsConfirmLoading(false)
    }
  }, [submissionId, approveSubmission, router, backPath])

  const handlePartialApproveConfirmed = useCallback(async () => {
    try {
      setIsConfirmLoading(true)
      await approvePartialSubmission.mutateAsync({
        id: submissionId,
        approvedClaimIds: Array.from(selectedClaimIds),
        rejectionReason: partialRejectionReason.trim() || undefined,
      })
      setShowPartialApproveConfirm(false)
      setPartialRejectionReason('')
      setSelectedClaimIds(new Set())
      router.push(backPath)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setIsConfirmLoading(false)
    }
  }, [submissionId, selectedClaimIds, partialRejectionReason, approvePartialSubmission, router, backPath])

  const handleRejectConfirmed = useCallback(async () => {
    if (!rejectionReason.trim()) return
    try {
      setIsConfirmLoading(true)
      await rejectSubmission.mutateAsync({ id: submissionId, reason: rejectionReason.trim() })
      setShowRejectDialog(false)
      setRejectionReason('')
      router.push(backPath)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setIsConfirmLoading(false)
    }
  }, [submissionId, rejectSubmission, rejectionReason, router, backPath])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !submission) {
    if (isDeleted) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )
    }
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">{error || 'Submission not found'}</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.push(backPath)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> {isManagerView ? 'Back to Approvals' : 'Back to Expense Claims'}
        </Button>
      </div>
    )
  }

  const statusBadge = STATUS_BADGES[submission.status] || STATUS_BADGES.draft

  return (
    <div className="space-y-4">
      {/* Rejection banner */}
      {submission.rejectedAt && submission.rejectionReason && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-600 dark:text-red-400">Submission was rejected</p>
                <p className="text-sm text-muted-foreground mt-1">{submission.rejectionReason}</p>
                {submission.claimNotes && submission.claimNotes.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-sm font-medium">Per-claim notes:</p>
                    {submission.claimNotes.map((note, i) => (
                      <p key={i} className="text-sm text-muted-foreground">• {note.note}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty draft warning */}
      {isDraft && claims.length === 0 && showEmptyWarning && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-yellow-600 dark:text-yellow-400">Empty draft</p>
                  <p className="text-sm text-muted-foreground">Upload receipts to get started. Empty drafts are automatically deleted after 24 hours.</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowEmptyWarning(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header row - title + actions */}
      <div className="space-y-3">
        <div className="min-w-0">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="flex-shrink-0" onClick={() => router.push(backPath)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="max-w-xs"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
              />
              <Button size="sm" onClick={handleSaveTitle}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setIsEditingTitle(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="flex-shrink-0" onClick={() => router.push(backPath)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-xl sm:text-[27px] font-semibold text-foreground truncate">{submission.title}</h1>
              {isDraft && (
                <Button variant="ghost" size="sm" onClick={() => { setEditTitle(submission.title); setIsEditingTitle(true) }}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 mt-1 ml-10 flex-wrap">
            <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
            <span className="text-sm sm:text-base text-muted-foreground">
              {claims.length} {claims.length === 1 ? 'claim' : 'claims'}
            </span>
            {data?.submitter && (
              <span className="text-sm sm:text-base text-muted-foreground">by {data.submitter.name}</span>
            )}
          </div>
        </div>

        {/* Action buttons - stack on mobile, row on desktop */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 ml-10">
          {isDraft && (
            <>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || submitForApproval.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                title={!canSubmit ? (claims.length === 0 ? 'Add at least one claim' : hasProcessingClaims ? 'Wait for claims to finish processing' : '') : ''}
              >
                {submitForApproval.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Submit for Approval
              </Button>
              <Button variant="destructive" onClick={handleDeleteClick} disabled={deleteSubmission.isPending}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Draft
              </Button>
            </>
          )}
          {canApproveReject && (
            <>
              <Button variant="destructive" onClick={() => setShowRejectDialog(true)}>
                <XCircle className="h-4 w-4 mr-2" /> Reject
              </Button>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => setShowApproveConfirm(true)}>
                <CheckCircle className="h-4 w-4 mr-2" /> Approve All
              </Button>
            </>
          )}
        </div>
      </div>


      {/* Upload zone + manual entry (always visible for drafts) */}
      {isDraft && (
        <div className="space-y-3">
          <Suspense fallback={<div className="flex items-center justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
            <FileUploadZone
              domain="expense-claims"
              allowMultiple={true}
              autoProcess={true}
              submissionId={submissionId}
              onUploadSuccess={handleUploadSuccess}
              onBatchUploadSuccess={handleUploadSuccess}
            />
          </Suspense>
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualEntry}
              disabled={manualEntryLoading}
            >
              {manualEntryLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PenLine className="h-4 w-4 mr-2" />
              )}
              Enter Manually
            </Button>
          </div>
        </div>
      )}

      {/* Bulk action bar for partial approval */}
      {canApproveReject && selectedClaimIds.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <span className="text-base font-medium text-foreground">
                {selectedClaimIds.size} of {claims.length} claims selected
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedClaimIds(new Set())}>
                  Clear Selection
                </Button>
                <Button
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={() => {
                    if (selectedClaimIds.size === claims.length) {
                      setShowApproveConfirm(true)
                    } else {
                      setShowPartialApproveConfirm(true)
                    }
                  }}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve Selected ({selectedClaimIds.size})
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Claims card with table and totals */}
      <Card>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-xl font-semibold text-foreground">
            Claims
            {totalsByCurrency.length > 0 && (
              <span className="ml-3 text-lg font-normal text-muted-foreground">
                {totalsByCurrency.map(({ currency, total }) => formatCurrency(total, currency)).join(' + ')}
              </span>
            )}
          </h3>
        </div>

        {/* Claims table */}
        {claims.length > 0 ? (
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    {canApproveReject && (
                      <th className="px-4 py-3 w-10">
                        <Checkbox
                          checked={isAllSelected ? true : isPartialSelection ? 'indeterminate' : false}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-foreground font-medium text-base">Vendor</th>
                    <th className="px-4 py-3 text-left text-foreground font-medium text-base">Amount</th>
                    <th className="px-4 py-3 text-left text-foreground font-medium text-base">Category</th>
                    <th className="px-4 py-3 text-left text-foreground font-medium text-base">Date</th>
                    <th className="px-4 py-3 text-left text-foreground font-medium text-base">Status</th>
                    {isDraft && (
                      <th className="px-4 py-3 text-right text-foreground font-medium text-base">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {claims.map((claim) => {
                    const claimBadge = CLAIM_STATUS_BADGES[claim.status] || CLAIM_STATUS_BADGES.draft
                    return (
                      <tr
                        key={claim._id}
                        className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => setSelectedClaimId(claim._id)}
                      >
                        {canApproveReject && (
                          <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedClaimIds.has(claim._id)}
                              onCheckedChange={() => toggleClaimSelection(claim._id)}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-foreground text-base">
                          {claim.vendorName || <span className="text-muted-foreground italic">Pending extraction</span>}
                        </td>
                        <td className="px-4 py-3 text-foreground text-base">
                          {claim.totalAmount && claim.currency
                            ? formatCurrency(claim.totalAmount, claim.currency)
                            : <span className="text-muted-foreground">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-foreground text-base">
                          {claim.expenseCategory ? getCategoryName(claim.expenseCategory, categories) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-foreground text-base">
                          {claim.transactionDate ? formatBusinessDate(claim.transactionDate) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {processingStatuses.includes(claim.status) ? (
                            <DocumentStatusBadge status={claim.status as any} />
                          ) : (
                            <Badge
                              className={claimBadge.className}
                              title={claim.status === 'classification_failed'
                                ? ((claim as any).errorMessage || 'This document does not appear to be a receipt or invoice. Please delete and upload a valid receipt.')
                                : claim.status === 'failed'
                                ? ((claim as any).errorMessage || 'Processing failed. Please try re-uploading.')
                                : undefined}
                            >
                              {claimBadge.label}
                            </Badge>
                          )}
                        </td>
                        {isDraft && (
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="hover:bg-red-500/10"
                              onClick={(e) => { e.stopPropagation(); handleRemoveClaimClick(claim._id) }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals footer inside the card */}
            {totalsByCurrency.length > 0 && (
              <div className="px-6 py-4 border-t border-border bg-muted/30">
                <div className="flex flex-wrap items-center gap-6">
                  {totalsByCurrency.map(({ currency, total }) => (
                    <div key={currency} className="flex items-baseline gap-2">
                      <span className="text-base text-muted-foreground">Total ({currency})</span>
                      <span className="text-[22.6px] font-semibold text-foreground">{formatCurrency(total, currency)}</span>
                    </div>
                  ))}
                </div>

                {/* Reimbursement progress */}
                {data?.reimbursementProgress && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-base text-muted-foreground">
                      Reimbursement: {data.reimbursementProgress.reimbursed} of {data.reimbursementProgress.total} claims reimbursed
                    </p>
                    <div className="w-full bg-muted rounded-full h-2 mt-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${(data.reimbursementProgress.reimbursed / data.reimbursementProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Approver info */}
                {data?.approver && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-base text-muted-foreground">
                      {submission.status === 'submitted' ? 'Pending approval from' : 'Approved by'}: <span className="text-foreground font-medium">{data.approver.name}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        ) : (
          <CardContent className="p-8">
            <div className="text-center text-muted-foreground">
              <Upload className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-lg">No claims yet</p>
              <p className="text-base mt-1">
                {isDraft ? 'Click "Upload Receipts" above to add expense claims' : 'This submission has no claims'}
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Edit modal for draft claims (image preview + edit fields + line items) */}
      {showEditModal && selectedClaimId && (
        <EditExpenseModalNew
          expenseClaimId={selectedClaimId}
          isOpen={true}
          onClose={handleClaimModalClose}
          onSave={handleClaimModalClose}
          hideSubmit={true}
        />
      )}

      {/* View modal for non-draft claims (image preview + read-only details + line items) */}
      {showViewModal && selectedClaimId && businessId && (
        <UnifiedExpenseDetailsModal
          claimId={selectedClaimId}
          businessId={businessId}
          isOpen={true}
          onClose={handleClaimModalClose}
          viewMode={isManagerView ? 'manager' : 'personal'}
        />
      )}

      {/* Confirmation dialogs */}
      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => !isConfirmLoading && setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConfirmed}
        title="Delete Draft Submission"
        message="Are you sure you want to delete this draft submission and all its claims? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        isLoading={isConfirmLoading}
      />
      <ConfirmationDialog
        isOpen={showRemoveClaimConfirm}
        onClose={() => { if (!isConfirmLoading) { setShowRemoveClaimConfirm(false); pendingRemoveClaimId.current = null } }}
        onConfirm={handleRemoveClaimConfirmed}
        title="Remove Claim"
        message="Remove this claim from the submission? The claim will be unlinked but not deleted."
        confirmText="Remove"
        cancelText="Cancel"
        confirmVariant="danger"
        isLoading={isConfirmLoading}
      />

      {/* Manager approve confirmation */}
      <ConfirmationDialog
        isOpen={showApproveConfirm}
        onClose={() => !isConfirmLoading && setShowApproveConfirm(false)}
        onConfirm={handleApproveConfirmed}
        title="Approve Submission"
        message={`Approve all ${claims.length} claim(s) in "${submission?.title}"? This will mark the entire submission as approved.`}
        confirmText="Approve All"
        cancelText="Cancel"
        confirmVariant="primary"
        isLoading={isConfirmLoading}
      />

      {/* Partial approval confirmation dialog */}
      {showPartialApproveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 transition-opacity"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            onClick={() => !isConfirmLoading && setShowPartialApproveConfirm(false)}
          />
          <div className="relative transform overflow-hidden rounded-xl bg-card shadow-2xl text-left transition-all w-full max-w-md">
            <div className="p-6 space-y-5">
              <div className="text-center">
                <h3 className="text-lg font-semibold leading-6 text-foreground">Partial Approval</h3>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Approving {selectedClaimIds.size} of {claims.length} claims. Remaining {claims.length - selectedClaimIds.size} claim(s) will be returned to the employee as a new draft.
              </p>
              <div>
                <label className="text-sm font-medium text-foreground">Reason for returning claims (optional)</label>
                <Textarea
                  className="mt-2"
                  rows={3}
                  placeholder="Explain why some claims are being returned..."
                  value={partialRejectionReason}
                  onChange={(e) => setPartialRejectionReason(e.target.value)}
                />
              </div>
              <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
                <Button variant="secondary" onClick={() => setShowPartialApproveConfirm(false)} disabled={isConfirmLoading} className="min-w-[100px] sm:min-w-[120px]">
                  Cancel
                </Button>
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[100px] sm:min-w-[120px]" onClick={handlePartialApproveConfirmed} disabled={isConfirmLoading}>
                  {isConfirmLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Approving...</> : `Approve ${selectedClaimIds.size} Claims`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manager reject dialog with reason */}
      {showRejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 transition-opacity"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            onClick={() => !isConfirmLoading && setShowRejectDialog(false)}
          />
          <div className="relative transform overflow-hidden rounded-xl bg-card shadow-2xl text-left transition-all w-full max-w-md">
            <div className="p-6 space-y-5">
              <div className="text-center">
                <h3 className="text-lg font-semibold leading-6 text-foreground">Reject Submission</h3>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Reason for rejection</label>
                <Textarea
                  className="mt-2"
                  rows={3}
                  placeholder="Explain why this submission is being rejected..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>
              <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
                <Button variant="secondary" onClick={() => setShowRejectDialog(false)} disabled={isConfirmLoading} className="min-w-[100px] sm:min-w-[120px]">
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleRejectConfirmed} disabled={!rejectionReason.trim() || isConfirmLoading} className="min-w-[100px] sm:min-w-[120px]">
                  {isConfirmLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Rejecting...</> : 'Reject'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
