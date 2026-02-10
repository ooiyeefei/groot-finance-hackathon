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
  CheckCircle,
  XCircle,
  ArrowLeft,
  Pencil,
  X,
  AlertCircle,
  Loader2,
  Upload,
} from 'lucide-react'
import { useExpenseCategories, getCategoryName } from '../hooks/use-expense-categories'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import DocumentStatusBadge from '@/domains/invoices/components/document-status-badge'

// Lazy load the existing file upload component (handles full upload + AI processing pipeline)
const FileUploadZone = lazy(() => import('@/domains/utilities/components/file-upload-zone'))

interface SubmissionDetailPageProps {
  submissionId: string
  locale: string
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
  classification_failed: { className: 'bg-red-500/10 text-red-600 dark:text-red-400', label: 'Failed' },
}

export function SubmissionDetailPage({ submissionId, locale }: SubmissionDetailPageProps) {
  const router = useRouter()
  const { businessId } = useActiveBusiness()
  const { data, isLoading, error, refetch } = useSubmissionDetail(submissionId)
  const { categories } = useExpenseCategories({ includeDisabled: true })
  const { updateSubmission, deleteSubmission, submitForApproval, approveSubmission, rejectSubmission, removeClaim } = useSubmissionMutations()

  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showEmptyWarning, setShowEmptyWarning] = useState(true)

  // Confirmation dialog states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [showRemoveClaimConfirm, setShowRemoveClaimConfirm] = useState(false)
  const [isConfirmLoading, setIsConfirmLoading] = useState(false)
  const pendingRemoveClaimId = useRef<string | null>(null)

  const submission = data?.submission
  const claims = data?.claims || []
  const totalsByCurrency = data?.totalsByCurrency || []

  const isDraft = submission?.status === 'draft'
  const isRejected = submission?.status === 'rejected'
  const isSubmitted = submission?.status === 'submitted'

  const processingStatuses = ['uploading', 'classifying', 'analyzing', 'extracting', 'processing']
  const hasProcessingClaims = claims.some((c) => processingStatuses.includes(c.status))
  const canSubmit = isDraft && claims.length > 0 && !hasProcessingClaims

  // Determine which modal to show based on claim status
  const selectedClaim = claims.find((c) => c._id === selectedClaimId)
  const showEditModal = !!selectedClaimId && selectedClaim?.status === 'draft'
  const showViewModal = !!selectedClaimId && selectedClaim?.status !== 'draft'

  // Handle receipt upload success - the FileUploadZone handles the full pipeline
  const handleUploadSuccess = useCallback(() => {
    refetch()
  }, [refetch])

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

  const handleDeleteConfirmed = useCallback(async () => {
    try {
      setIsConfirmLoading(true)
      await deleteSubmission.mutateAsync(submissionId)
      setShowDeleteConfirm(false)
      router.push(`/${locale}/expense-claims`)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setIsConfirmLoading(false)
    }
  }, [submissionId, deleteSubmission, router, locale])

  // Handle approve
  const handleApproveClick = useCallback(() => {
    setShowApproveConfirm(true)
  }, [])

  const handleApproveConfirmed = useCallback(async () => {
    try {
      setIsConfirmLoading(true)
      await approveSubmission.mutateAsync({ id: submissionId })
      setShowApproveConfirm(false)
      refetch()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setIsConfirmLoading(false)
    }
  }, [submissionId, approveSubmission, refetch])

  // Handle reject
  const handleReject = useCallback(async () => {
    if (!rejectReason.trim()) return
    try {
      await rejectSubmission.mutateAsync({ id: submissionId, reason: rejectReason.trim() })
      setShowRejectDialog(false)
      setRejectReason('')
      refetch()
    } catch (e: any) {
      alert(e.message)
    }
  }, [submissionId, rejectReason, rejectSubmission, refetch])

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !submission) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">{error || 'Submission not found'}</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.push(`/${locale}/expense-claims`)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Expense Claims
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
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="flex-shrink-0" onClick={() => router.push(`/${locale}/expense-claims`)}>
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
              <Button variant="ghost" size="sm" className="flex-shrink-0" onClick={() => router.push(`/${locale}/expense-claims`)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-2xl font-semibold text-foreground truncate">{submission.title}</h1>
              {isDraft && (
                <Button variant="ghost" size="sm" onClick={() => { setEditTitle(submission.title); setIsEditingTitle(true) }}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 mt-1 ml-10">
            <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
            <span className="text-sm text-muted-foreground">
              {claims.length} {claims.length === 1 ? 'claim' : 'claims'}
            </span>
            {data?.submitter && (
              <span className="text-sm text-muted-foreground">by {data.submitter.name}</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
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
          {isSubmitted && (
            <>
              <Button onClick={handleApproveClick} disabled={approveSubmission.isPending} className="bg-green-600 hover:bg-green-700 text-white">
                {approveSubmission.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Approve All
              </Button>
              <Button variant="destructive" onClick={() => setShowRejectDialog(true)}>
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Reject dialog */}
      {showRejectDialog && (
        <Card className="border-red-500/30">
          <CardContent className="p-6">
            <h3 className="font-medium text-foreground mb-2">Rejection Reason</h3>
            <textarea
              className="w-full p-3 border border-border rounded-md bg-input text-foreground min-h-[100px]"
              placeholder="Explain why this submission is being rejected..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              <Button variant="destructive" onClick={handleReject} disabled={!rejectReason.trim() || rejectSubmission.isPending}>
                {rejectSubmission.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Confirm Rejection
              </Button>
              <Button variant="ghost" onClick={() => { setShowRejectDialog(false); setRejectReason('') }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload zone (always visible for drafts) */}
      {isDraft && (
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
      )}

      {/* Claims card with table and totals */}
      <Card>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">
            Claims
            {totalsByCurrency.length > 0 && (
              <span className="ml-3 text-base font-normal text-muted-foreground">
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
                    <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Vendor</th>
                    <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Amount</th>
                    <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Category</th>
                    <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Date</th>
                    <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Status</th>
                    {isDraft && (
                      <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Actions</th>
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
                        <td className="px-4 py-3 text-foreground">
                          {claim.vendorName || <span className="text-muted-foreground italic">Pending extraction</span>}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {claim.totalAmount && claim.currency
                            ? formatCurrency(claim.totalAmount, claim.currency)
                            : <span className="text-muted-foreground">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-foreground text-sm">
                          {claim.expenseCategory ? getCategoryName(claim.expenseCategory, categories) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-foreground text-sm">
                          {claim.transactionDate ? formatBusinessDate(claim.transactionDate) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {processingStatuses.includes(claim.status) ? (
                            <DocumentStatusBadge status={claim.status as any} />
                          ) : (
                            <Badge className={claimBadge.className}>{claimBadge.label}</Badge>
                          )}
                        </td>
                        {isDraft && (
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleRemoveClaimClick(claim._id) }}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
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
                      <span className="text-sm text-muted-foreground">Total ({currency})</span>
                      <span className="text-xl font-semibold text-foreground">{formatCurrency(total, currency)}</span>
                    </div>
                  ))}
                </div>

                {/* Reimbursement progress */}
                {data?.reimbursementProgress && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-sm text-muted-foreground">
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
                    <p className="text-sm text-muted-foreground">
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
              <p className="text-base">No claims yet</p>
              <p className="text-sm mt-1">
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
          viewMode="personal"
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
        isOpen={showApproveConfirm}
        onClose={() => !isConfirmLoading && setShowApproveConfirm(false)}
        onConfirm={handleApproveConfirmed}
        title="Approve Submission"
        message="Approve this submission? Accounting entries will be created for all claims."
        confirmText="Approve"
        cancelText="Cancel"
        confirmVariant="primary"
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
    </div>
  )
}
