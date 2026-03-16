/**
 * Personal Expense Claims Dashboard
 * Focused on individual user expense management
 * Includes personal reports functionality
 */

'use client'

import { useState, useEffect, useCallback, lazy, Suspense, useMemo } from 'react'
import { useSearchParams, useRouter, useParams } from 'next/navigation'
import { FileText, Clock, CheckCircle, XCircle, Edit3, BarChart3, Eye, Trash2, Loader2, RotateCcw, Brain, AlertCircle, Send, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import ExpenseStatusBadge from './expense-status-badge'
import DuplicateBadge from './duplicate-badge'
import EinvoiceStatusBadge from './einvoice-status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatBusinessDate } from '@/lib/utils'

// ✅ CONVEX REAL-TIME: Import hooks for automatic real-time updates
import { useActiveBusiness } from '@/contexts/business-context'
import { useExpenseClaimsRealtime } from '../hooks/use-expense-claims-realtime'
import { useExpenseCategories, getCategoryName, type DynamicExpenseCategory } from '../hooks/use-expense-categories'

// PERFORMANCE OPTIMIZATION: Dynamic imports for heavy components (only load when needed)
const MonthlyReportGenerator = lazy(() => import('./monthly-report-generator'))
const EditExpenseModalNew = lazy(() => import('./edit-expense-modal-new'))
const UnifiedExpenseDetailsModal = lazy(() => import('./unified-expense-details-modal'))
const ConfirmationDialog = lazy(() => import('@/components/ui/confirmation-dialog'))
const SubmissionList = lazy(() => import('./submission-list'))

interface PersonalExpenseDashboardProps {
  userId: string
}

interface PersonalDashboardData {
  summary: {
    total_claims: number
    pending_approval: number
    approved_amount: number
    rejected_count: number
  }
  recent_claims: any[]
}

export default function PersonalExpenseDashboard({ userId }: PersonalExpenseDashboardProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || 'en'

  // ✅ CONVEX REAL-TIME: Get business context for multi-tenancy
  const { businessId, isLoading: isBusinessLoading } = useActiveBusiness()

  // ✅ CONVEX REAL-TIME: Real-time expense claims data - automatically updates when Trigger.dev changes status
  // This replaces the REST API polling approach with instant WebSocket-based updates
  const {
    dashboardData: convexDashboardData,
    loading: convexLoading,
    deleteClaim: convexDeleteClaim,
    deleting: convexDeleting,
    submitClaim: convexSubmitClaim,
    submitting: convexSubmitting,
  } = useExpenseClaimsRealtime(businessId, { limit: 10 })

  // Fetch expense categories for displaying category names instead of IDs
  const { categories, loading: categoriesLoading } = useExpenseCategories({ includeDisabled: true })

  const [activeTab, setActiveTab] = useState('overview')
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [detailsClaimId, setDetailsClaimId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingClaimId, setDeletingClaimId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [reprocessingClaims, setReprocessingClaims] = useState<Set<string>>(new Set())
  const [highlightProcessed, setHighlightProcessed] = useState(false)

  // Helper function to get workflow progress - matching unified modal
  const getWorkflowProgress = useCallback((status: string): number => {
    const progressMap: Record<string, number> = {
      'draft': 10,
      'uploading': 20,
      'analyzing': 30,
      'submitted': 50,
      'approved': 75,
      'reimbursed': 100,
      'rejected': 0,
      'failed': 0,
    }
    return progressMap[status] || 0
  }, [])

  // ✅ CONVEX REAL-TIME: Enrich claims with workflow progress using memoization
  // This transforms Convex data to match the expected dashboard format
  const enrichedDashboardData = useMemo(() => {
    if (!convexDashboardData) return null

    const enrichedClaims = convexDashboardData.recent_claims.map((claim: any) => ({
      ...claim,
      workflow_progress: getWorkflowProgress(claim.status)
    }))

    return {
      summary: convexDashboardData.summary,
      recent_claims: enrichedClaims
    }
  }, [convexDashboardData, getWorkflowProgress])

  // ✅ CONVEX MIGRATION: Use enriched data and combined loading state
  const dashboardData = enrichedDashboardData
  const loading = convexLoading || isBusinessLoading

  // ✅ CONVEX REAL-TIME: No-op function for backward compatibility with child components
  // Child components still receive this prop but don't need to call it anymore
  // Convex subscriptions automatically update the UI when data changes
  const fetchDashboardData = useCallback(() => {
    // No-op: Convex useQuery handles real-time updates automatically
    console.log('[Dashboard] fetchDashboardData called - no-op, Convex handles updates')
  }, [])

  // Handle delete click to show confirmation dialog
  const handleDeleteClick = useCallback((claimId: string) => {
    setDeletingClaimId(claimId)
    setShowDeleteConfirm(true)
  }, [])

  // ✅ CONVEX MIGRATION: Delete expense claim using Convex mutation
  // No manual refresh needed - Convex automatically updates the UI
  const deleteClaim = useCallback(async () => {
    if (!deletingClaimId) return

    setIsDeleting(true)

    try {
      // Use Convex mutation for real-time update
      await convexDeleteClaim(deletingClaimId)

      setToastType('success')
      setToastMessage('Expense claim deleted successfully')
      // ✅ No fetchDashboardData() needed - Convex subscription auto-updates
      setShowDeleteConfirm(false)
      setDeletingClaimId(null)
    } catch (error) {
      console.error('Error deleting claim:', error)
      setToastType('error')
      setToastMessage(error instanceof Error ? error.message : 'An error occurred while deleting the claim')
    } finally {
      setIsDeleting(false)
    }
  }, [deletingClaimId, convexDeleteClaim])

  const handleCloseDeleteConfirm = useCallback(() => {
    if (!isDeleting) {
      setShowDeleteConfirm(false)
      setDeletingClaimId(null)
    }
  }, [isDeleting])

  // Submit claim handler with confirmation
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [submittingClaimId, setSubmittingClaimId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmitClick = useCallback((claimId: string) => {
    setSubmittingClaimId(claimId)
    setShowSubmitConfirm(true)
  }, [])

  const submitClaim = useCallback(async () => {
    if (!submittingClaimId) return
    setIsSubmitting(true)
    try {
      await convexSubmitClaim(submittingClaimId)
      setToastType('success')
      setToastMessage('Expense claim submitted for approval')
      setShowSubmitConfirm(false)
      setSubmittingClaimId(null)
    } catch (error) {
      console.error('Error submitting claim:', error)
      setToastType('error')
      setToastMessage(error instanceof Error ? error.message : 'Failed to submit expense claim')
    } finally {
      setIsSubmitting(false)
    }
  }, [submittingClaimId, convexSubmitClaim])

  const handleCloseSubmitConfirm = useCallback(() => {
    if (!isSubmitting) {
      setShowSubmitConfirm(false)
      setSubmittingClaimId(null)
    }
  }, [isSubmitting])

  // ✅ CONVEX REAL-TIME: AI reprocessing handler - no manual refresh needed
  // Convex subscription auto-updates when Trigger.dev changes status
  const handleReprocessClick = useCallback(async (claimId: string, storagePath: string) => {
    try {
      setReprocessingClaims(prev => new Set(prev).add(claimId))
      setToastType('success')
      setToastMessage('Starting AI reprocessing...')

      // Step 1: Update status to 'analyzing' immediately for UI feedback
      // ✅ Convex subscription will auto-update UI when status changes
      try {
        const statusResponse = await fetch(`/api/v1/expense-claims/${claimId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'analyzing' })
        })

        if (!statusResponse.ok) {
          console.warn('[Dashboard] Failed to update status to analyzing')
        }
        // ✅ No fetchDashboardData() needed - Convex subscription auto-updates
      } catch (statusError) {
        console.warn('[Dashboard] Failed to update status to analyzing:', statusError)
        // Continue with reprocessing even if status update fails
      }

      // Step 2: Call server-side API endpoint to start Trigger.dev job
      const response = await fetch(`/api/v1/expense-claims/${claimId}/reprocess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to start reprocessing')
      }

      setToastType('success')
      setToastMessage('AI reprocessing started successfully! Results will appear automatically.')
      // ✅ No fetchDashboardData() or setTimeout needed - Convex subscription auto-updates

    } catch (error) {
      console.error('Reprocess error:', error)
      setToastType('error')
      setToastMessage(error instanceof Error ? error.message : 'Failed to reprocess expense claim')
      // ✅ No fetchDashboardData() needed - Convex will show current state
    } finally {
      setReprocessingClaims(prev => {
        const newSet = new Set(prev)
        newSet.delete(claimId)
        return newSet
      })
    }
  }, []) // ✅ No dependencies on fetchDashboardData

  // ✅ CONVEX REAL-TIME: No initial fetchDashboardData() needed
  // Convex useQuery automatically fetches data when component mounts
  // and keeps it in sync via WebSocket subscription

  // Handle highlight parameter to auto-open expense claim details modal
  useEffect(() => {
    const highlightId = searchParams.get('highlight')

    if (highlightId && !highlightProcessed && !showDetailsModal && !loading && dashboardData?.recent_claims) {
      // Find the expense claim with the matching ID
      const targetClaim = dashboardData.recent_claims.find(claim => claim.id === highlightId)

      if (targetClaim) {
        setDetailsClaimId(highlightId)
        setShowDetailsModal(true)
        setHighlightProcessed(true)

        // Remove highlight parameter from URL
        const url = new URL(window.location.href)
        url.searchParams.delete('highlight')
        router.push(url.pathname + url.search, { scroll: false })
      }
    }
  }, [searchParams, highlightProcessed, showDetailsModal, loading, dashboardData?.recent_claims, router])

  // Reset highlight processed when highlight parameter is removed
  useEffect(() => {
    const highlightId = searchParams.get('highlight')
    if (!highlightId && highlightProcessed) {
      setHighlightProcessed(false)
    }
  }, [searchParams, highlightProcessed])

  // Handle view parameter to auto-open expense claim modal (used by duplicate detection)
  // Opens edit modal for draft claims, view details modal for submitted/approved/etc.
  useEffect(() => {
    const viewId = searchParams.get('view')

    if (viewId && !showEditModal && !showDetailsModal && !loading && dashboardData?.recent_claims) {
      // Find the expense claim to determine which modal to open
      const targetClaim = dashboardData.recent_claims.find(claim => claim.id === viewId)

      if (targetClaim) {
        // Draft claims → edit modal, all others → view details modal
        if (targetClaim.status === 'draft' || targetClaim.status === 'failed' || targetClaim.status === 'classification_failed') {
          setEditingClaimId(viewId)
          setShowEditModal(true)
        } else {
          setDetailsClaimId(viewId)
          setShowDetailsModal(true)
        }
      } else {
        // Claim not found in recent list - try opening details modal as fallback
        setDetailsClaimId(viewId)
        setShowDetailsModal(true)
      }

      // Remove view parameter from URL
      const url = new URL(window.location.href)
      url.searchParams.delete('view')
      router.replace(url.pathname + url.search, { scroll: false })
    }
  }, [searchParams, showEditModal, showDetailsModal, loading, dashboardData?.recent_claims, router])

  // ✅ CONVEX REAL-TIME: No polling needed!
  // Convex WebSocket subscriptions provide instant updates (~50ms latency)
  // when Trigger.dev calls internalUpdateStatus/internalUpdateExtraction
  // This replaces the previous REST API polling (3-30s with exponential backoff)

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [toastMessage])

  if (loading) {
    return <PersonalDashboardSkeleton />
  }

  if (!dashboardData) {
    return <div className="text-center text-muted-foreground p-card-padding">Failed to load dashboard data</div>
  }

  return (
    <div className="space-y-section-gap">

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Claims"
          value={dashboardData.summary.total_claims.toString()}
          icon={<FileText className="w-5 h-5" />}
          variant="default"
        />
        <SummaryCard
          title="Pending Approval"
          value={dashboardData.summary.pending_approval.toString()}
          icon={<Clock className="w-5 h-5" />}
          variant="warning"
        />
        <SummaryCard
          title="Approved Amount"
          value={`$${dashboardData.summary.approved_amount.toFixed(2)}`}
          icon={<CheckCircle className="w-5 h-5" />}
          variant="success"
        />
        <SummaryCard
          title="Rejected"
          value={dashboardData.summary.rejected_count.toString()}
          icon={<XCircle className="w-5 h-5" />}
          variant="error"
        />
      </div>

      {/* Personal Tabs */}
      <Tabs value={activeTab} onValueChange={(tab) => {
        setActiveTab(tab)
        // Close forms and modals when switching tabs
        setShowEditModal(false)
        setEditingClaimId(null)
        setShowDetailsModal(false)
        setDetailsClaimId(null)
      }} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 bg-muted border border-border">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Overview
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            History
          </TabsTrigger>
          <TabsTrigger value="reports" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            My Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Expense Submissions */}
          <Suspense fallback={<div className="flex items-center justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
            <SubmissionList locale={locale} />
          </Suspense>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <PersonalHistoryContent
            data={dashboardData}
            categories={categories}
            setEditingClaimId={setEditingClaimId}
            setShowEditModal={setShowEditModal}
            setDetailsClaimId={setDetailsClaimId}
            setShowDetailsModal={setShowDetailsModal}
            deleteClaim={handleDeleteClick}
            submitClaim={handleSubmitClick}
            submittingClaims={convexSubmitting}
            fetchDashboardData={fetchDashboardData}
            setToastMessage={setToastMessage}
            setToastType={setToastType}
            handleReprocessClick={handleReprocessClick}
            reprocessingClaims={reprocessingClaims}
          />
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <PersonalReportsContent />
        </TabsContent>
      </Tabs>

      {/* Expense Edit Modal */}
      {showEditModal && editingClaimId && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><Loader2 className="w-8 h-8 animate-spin text-white" /></div>}>
          <EditExpenseModalNew
            expenseClaimId={editingClaimId}
            isOpen={showEditModal}
            onClose={() => {
              setShowEditModal(false)
              setEditingClaimId(null)
            }}
            onSave={() => {
              setShowEditModal(false)
              setEditingClaimId(null)
              // Refresh dashboard data to show updated claim
              fetchDashboardData()
            }}
            onDelete={() => {
              setShowEditModal(false)
              setEditingClaimId(null)
              // Refresh dashboard data after deletion
              fetchDashboardData()
            }}
            onReprocess={() => {
              // Trigger refresh after reprocessing is complete
              fetchDashboardData()
            }}
          />
        </Suspense>
      )}

      {/* Expense Claim Details Modal */}
      {showDetailsModal && detailsClaimId && businessId && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><Loader2 className="w-8 h-8 animate-spin text-white" /></div>}>
          <UnifiedExpenseDetailsModal
            claimId={detailsClaimId}
            businessId={businessId}
            isOpen={showDetailsModal}
            onClose={() => {
              setShowDetailsModal(false)
              setDetailsClaimId(null)
            }}
            viewMode="personal"
          />
        </Suspense>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><Loader2 className="w-6 h-6 animate-spin text-white" /></div>}>
          <ConfirmationDialog
            isOpen={showDeleteConfirm}
            onClose={handleCloseDeleteConfirm}
            onConfirm={deleteClaim}
            title="Delete Expense Claim"
            message="Are you sure you want to delete this draft expense claim? This action cannot be undone."
            confirmText="Delete"
            cancelText="Cancel"
            confirmVariant="danger"
            isLoading={isDeleting}
          />
        </Suspense>
      )}

      {/* Submit Confirmation Dialog */}
      {showSubmitConfirm && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><Loader2 className="w-6 h-6 animate-spin text-white" /></div>}>
          <ConfirmationDialog
            isOpen={showSubmitConfirm}
            onClose={handleCloseSubmitConfirm}
            onConfirm={submitClaim}
            title="Submit Expense Claim"
            message="Submit this expense claim for approval? You won't be able to edit it after submission."
            confirmText="Submit"
            cancelText="Cancel"
            isLoading={isSubmitting}
          />
        </Suspense>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 max-w-md">
          <div className={`${toastType === 'success' ? 'bg-success text-success-foreground' : 'bg-danger text-danger-foreground'} px-6 py-4 rounded-lg shadow-lg flex items-center justify-between`}>
            <span className="text-sm font-medium">{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className={`ml-4 ${toastType === 'success' ? 'text-success-foreground/80 hover:text-success-foreground' : 'text-danger-foreground/80 hover:text-danger-foreground'}`}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Unified Expense Claim Card Component
function ExpenseClaimCard({ claim, index, context, categories, setEditingClaimId, setShowEditModal, setDetailsClaimId, setShowDetailsModal, deleteClaim, submitClaim, submittingClaims, fetchDashboardData, setToastMessage, setToastType, handleReprocessClick, reprocessingClaims }: {
  claim: any
  index: number
  context: 'overview' | 'history'
  categories: DynamicExpenseCategory[]
  setEditingClaimId: (id: string | null) => void
  setShowEditModal: (show: boolean) => void
  setDetailsClaimId: (id: string | null) => void
  setShowDetailsModal: (show: boolean) => void
  deleteClaim: (claimId: string) => void
  submitClaim?: (claimId: string) => void
  submittingClaims?: Set<string>
  fetchDashboardData: () => void
  setToastMessage: (message: string | null) => void
  setToastType: (type: 'success' | 'error') => void
  handleReprocessClick: (claimId: string, storagePath: string) => Promise<void>
  reprocessingClaims: Set<string>
}) {
  return (
    <div key={`${context}-${claim.id}-${index}`} className={`p-${context === 'overview' ? '3' : '4'} bg-muted/50 rounded-lg border border-border min-h-[140px] ${context === 'history' ? 'hover:border-muted-foreground transition-colors' : ''}`}>
      {/* Claim Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <p className="text-foreground font-medium text-sm">
            {claim.transaction?.description || claim.description || 'Expense Claim'}
          </p>
          <p className="text-muted-foreground text-xs">
            {getCategoryName(claim.expense_category, categories)} •
            {formatBusinessDate(claim.transaction?.transaction_date || claim.created_at)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-foreground font-semibold text-sm">
            {claim.currency || 'MYR'} {parseFloat(claim.total_amount || '0').toFixed(2)}
          </p>
          {Number(claim.home_currency_amount) > 0 &&
           claim.home_currency &&
           claim.currency !== claim.home_currency &&
           Number(claim.home_currency_amount) !== Number(claim.total_amount || 0) && (
            <p className="text-muted-foreground text-xs">
              ≈ {claim.home_currency} {Number(claim.home_currency_amount).toFixed(2)}
            </p>
          )}
        </div>
      </div>

      {/* Status and Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-1">
          {/* Primary Status Badge - Animated like invoice page */}
          <div className="flex items-center gap-2">
            <ExpenseStatusBadge
              status={claim.status}
              errorMessage={claim.error_message}
              processingStage={claim.status_display?.isProcessing ? claim.status as any : undefined}
              animated={true}
            />
            {/* E-Invoice Badge */}
            <EinvoiceStatusBadge
              einvoiceRequestStatus={claim.einvoiceRequestStatus}
              einvoiceAttached={claim.einvoiceAttached}
              einvoiceSource={claim.einvoiceSource}
              merchantFormUrl={claim.merchantFormUrl}
              lhdnReceivedStatus={claim.lhdnReceivedStatus}
            />
            {/* Duplicate Badge - shows when claim has potential duplicates */}
            {claim.duplicateStatus && claim.duplicateStatus !== 'none' && (
              <DuplicateBadge
                matchTier={claim.duplicateStatus === 'potential' ? 'strong' : 'exact'}
                size="sm"
                onClick={() => {
                  setDetailsClaimId(claim.id)
                  setShowDetailsModal(true)
                }}
              />
            )}
            {/* E-Invoice Rejected Warning Badge */}
            {claim.einvoiceRejectionWarning && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 cursor-help">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      E-Invoice Rejected
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                    The linked e-invoice was rejected. Finance admin review required before reimbursement.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {claim.current_approver_name && ['submitted'].includes(claim.status) && (
            <span className="text-xs text-muted-foreground">
              With: {claim.current_approver_name}
            </span>
          )}
        </div>

        {/* Workflow Progress Bar */}
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              claim.status === 'rejected' ? 'bg-danger' : 'bg-primary'
            }`}
            style={{ width: `${claim.workflow_progress || 0}%` }}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {/* UNIFIED PRIORITY: API status_display > unified status */}
          {claim.status_display?.description ||
            (claim.status === 'draft'
              ? 'Ready for editing - click Edit to modify or Submit to proceed'
              : 'Status pending update')
          }
        </p>
      </div>

      {/* Error Message Display for Failed Claims */}
      {claim.status === 'failed' && (claim.error_message || claim.processing_metadata?.error_message) && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/30 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-800 dark:text-red-300 mt-0.5 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <p className="text-sm text-red-800 dark:text-red-300 font-medium">
                {/* Handle error_message as either string or object */}
                {typeof claim.error_message === 'string'
                  ? claim.error_message
                  : claim.error_message?.message ||
                    (typeof claim.processing_metadata?.error_message === 'string'
                      ? claim.processing_metadata?.error_message
                      : claim.processing_metadata?.error_message?.message || 'Processing failed')
                }
              </p>

              {/* Suggestions - can come from error_message object or processing_metadata */}
              {(() => {
                // Collect suggestions from various sources
                const suggestions: string[] = []

                // From error_message object
                if (typeof claim.error_message === 'object' && claim.error_message?.suggestions) {
                  if (Array.isArray(claim.error_message.suggestions)) {
                    suggestions.push(...claim.error_message.suggestions)
                  } else if (typeof claim.error_message.suggestions === 'string') {
                    suggestions.push(claim.error_message.suggestions)
                  }
                }

                // From processing_metadata.error_message object
                if (typeof claim.processing_metadata?.error_message === 'object' && claim.processing_metadata.error_message?.suggestions) {
                  if (Array.isArray(claim.processing_metadata.error_message.suggestions)) {
                    suggestions.push(...claim.processing_metadata.error_message.suggestions)
                  } else if (typeof claim.processing_metadata.error_message.suggestions === 'string') {
                    suggestions.push(claim.processing_metadata.error_message.suggestions)
                  }
                }

                // From processing_metadata.suggestions directly
                if (claim.processing_metadata?.suggestions && Array.isArray(claim.processing_metadata.suggestions)) {
                  suggestions.push(...claim.processing_metadata.suggestions)
                }

                // Remove duplicates
                const uniqueSuggestions = [...new Set(suggestions)]

                if (uniqueSuggestions.length > 0) {
                  return (
                    <div className="space-y-1">
                      <p className="text-xs text-red-800 dark:text-red-300 font-medium">Suggestions:</p>
                      <ul className="space-y-1">
                        {uniqueSuggestions.map((suggestion: string, idx: number) => (
                          <li key={idx} className="text-xs text-red-800 dark:text-red-300 flex items-start gap-1">
                            <span className="text-red-800 dark:text-red-300 mt-0.5">•</span>
                            <span>{suggestion}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                }
                return null
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Action buttons - Unified row for all claim states */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Draft claim actions */}
        {claim.status === 'draft' && (
          <>
            <Button
              onClick={() => {
                setEditingClaimId(claim.id)
                setShowEditModal(true)
              }}
              variant="primary"
              size="sm"
            >
              <Edit3 className="w-4 h-4 mr-1.5" />
              Edit
            </Button>
            {submitClaim && (
              <Button
                onClick={() => submitClaim(claim.id)}
                disabled={submittingClaims?.has(claim.id)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                size="sm"
              >
                {submittingClaims?.has(claim.id) ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-1.5" />
                )}
                Submit
              </Button>
            )}
            <Button
              onClick={() => deleteClaim(claim.id)}
              variant="destructive"
              size="sm"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>
          </>
        )}

        {/* Re-extract button for draft claims with receipts - Triggers actual AI processing */}
        {claim.status === 'draft' && claim.storage_path && (
          <Button
            onClick={() => handleReprocessClick(claim.id, claim.storage_path)}
            disabled={reprocessingClaims.has(claim.id)}
            variant="primary"
            size="sm"
          >
            {reprocessingClaims.has(claim.id) ? (
              <Brain className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4 mr-1.5" />
            )}
            {reprocessingClaims.has(claim.id) ? 'AI Analyzing...' : 'Re-extract'}
          </Button>
        )}

        {/* Failed claims actions - Edit, Delete, and Reprocess */}
        {(claim.status === 'failed' || claim.status === 'classification_failed') && (
          <>
            <Button
              onClick={() => {
                setEditingClaimId(claim.id)
                setShowEditModal(true)
              }}
              variant="primary"
              size="sm"
            >
              <Edit3 className="w-4 h-4 mr-1.5" />
              Edit
            </Button>
            <Button
              onClick={() => deleteClaim(claim.id)}
              variant="destructive"
              size="sm"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>
            {claim.storage_path && (
              <Button
                onClick={() => handleReprocessClick(claim.id, claim.storage_path)}
                disabled={reprocessingClaims.has(claim.id)}
                variant="primary"
                size="sm"
              >
                {reprocessingClaims.has(claim.id) ? (
                  <Brain className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-1.5" />
                )}
                {reprocessingClaims.has(claim.id) ? 'AI Analyzing...' : 'Reprocess'}
              </Button>
            )}
          </>
        )}

        {/* Delete button for processing/stuck states */}
        {['uploading', 'analyzing', 'classifying', 'processing'].includes(claim.status) && (
          <Button
            onClick={() => deleteClaim(claim.id)}
            variant="destructive"
            size="sm"
          >
            <Trash2 className="w-4 h-4 mr-1.5" />
            Delete
          </Button>
        )}

        {/* View Details button for all non-draft claims (except processing or failed states) */}
        {claim.status !== 'draft' &&
         claim.status !== 'analyzing' &&
         claim.status !== 'uploading' &&
         claim.status !== 'classifying' &&
         claim.status !== 'processing' &&
         claim.status !== 'failed' &&
         claim.status !== 'classification_failed' && (
          <Button
            onClick={() => {
              setDetailsClaimId(claim.id)
              setShowDetailsModal(true)
            }}
            variant="view"
            size="sm"
          >
            <Eye className="w-4 h-4 mr-1.5" />
            View Details
          </Button>
        )}
      </div>
    </div>
  )
}

// Personal History Content - Now uses unified card
function PersonalHistoryContent({ data, categories, setEditingClaimId, setShowEditModal, setDetailsClaimId, setShowDetailsModal, deleteClaim, submitClaim, submittingClaims, fetchDashboardData, setToastMessage, setToastType, handleReprocessClick, reprocessingClaims }: {
  data: PersonalDashboardData
  categories: DynamicExpenseCategory[]
  setEditingClaimId: (id: string | null) => void
  setShowEditModal: (show: boolean) => void
  setDetailsClaimId: (id: string | null) => void
  setShowDetailsModal: (show: boolean) => void
  deleteClaim: (claimId: string) => void
  submitClaim: (claimId: string) => void
  submittingClaims: Set<string>
  fetchDashboardData: () => void
  setToastMessage: (message: string | null) => void
  setToastType: (type: 'success' | 'error') => void
  handleReprocessClick: (claimId: string, storagePath: string) => Promise<void>
  reprocessingClaims: Set<string>
}) {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">Expense History</CardTitle>
        <CardDescription>All your expense claims over time</CardDescription>
      </CardHeader>
      <CardContent>
        {data.recent_claims.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <FileText className="w-12 h-12 mx-auto mb-4" />
            <p>No expense history yet</p>
            <p className="text-sm">Your submitted claims will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.recent_claims.map((claim: any, index: number) => (
              <ExpenseClaimCard
                key={`history-${claim.id}-${index}`}
                claim={claim}
                index={index}
                context="history"
                categories={categories}
                setEditingClaimId={setEditingClaimId}
                setShowEditModal={setShowEditModal}
                setDetailsClaimId={setDetailsClaimId}
                setShowDetailsModal={setShowDetailsModal}
                deleteClaim={deleteClaim}
                submitClaim={submitClaim}
                submittingClaims={submittingClaims}
                fetchDashboardData={fetchDashboardData}
                setToastMessage={setToastMessage}
                setToastType={setToastType}
                handleReprocessClick={handleReprocessClick}
                reprocessingClaims={reprocessingClaims}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Personal Reports Content - "My Reports" functionality
function PersonalReportsContent() {
  return (
    <Card className="bg-record-layer-1 border-record-border">
      <CardHeader>
        <CardTitle className="text-record-title flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          My Reports
        </CardTitle>
        <CardDescription className="text-record-supporting">Generate personal expense reports</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<div className="flex items-center justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
          <MonthlyReportGenerator personalOnly={true} />
        </Suspense>
      </CardContent>
    </Card>
  )
}

// Summary card component with layer1-2-3 semantic design system
function SummaryCard({ title, value, icon, variant }: {
  title: string
  value: string
  icon: React.ReactNode
  variant: 'default' | 'success' | 'warning' | 'error'
}) {
  const variantStyles = {
    // Total Claims - Blue translucent (both light and dark modes)
    default: 'bg-blue-50 dark:bg-gray-800 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-700/50',
    // Approved Amount - Green translucent (both light and dark modes)
    success: 'bg-green-50 dark:bg-gray-800 dark:bg-green-900/10 border border-green-200 dark:border-green-700/50',
    // Pending Approval - Yellow/Orange translucent (both light and dark modes)
    warning: 'bg-yellow-50 dark:bg-gray-800 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-700/50',
    // Rejected - Red translucent (both light and dark modes)
    error: 'bg-red-50 dark:bg-gray-800 dark:bg-red-900/10 border border-red-200 dark:border-red-700/50'
  }

  const textStyles = {
    // Light mode: dark text, Dark mode: white text
    default: 'text-blue-900 dark:text-white',
    success: 'text-green-900 dark:text-white',
    warning: 'text-yellow-900 dark:text-white',
    error: 'text-red-900 dark:text-white'
  }

  const labelStyles = {
    // Light mode: medium colored text, Dark mode: light gray text
    default: 'text-blue-700 dark:text-gray-300',
    success: 'text-green-700 dark:text-gray-300',
    warning: 'text-yellow-700 dark:text-gray-300',
    error: 'text-red-700 dark:text-gray-300'
  }

  const iconStyles = {
    // Light mode: darker colored icons, Dark mode: light gray icons
    default: 'text-blue-700 dark:text-gray-400',
    success: 'text-green-700 dark:text-gray-400',
    warning: 'text-yellow-700 dark:text-gray-400',
    error: 'text-red-700 dark:text-gray-400'
  }

  return (
    <Card className={variantStyles[variant]}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-medium ${labelStyles[variant]}`}>{title}</p>
            <p className={`text-2xl font-bold ${textStyles[variant]}`}>{value}</p>
          </div>
          <div className={iconStyles[variant]}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ✅ PERFORMANCE OPTIMIZATION: Enhanced skeleton loaders to prevent layout shifts
// CLS FIX: Skeleton must match EXACT dimensions of loaded content
function PersonalDashboardSkeleton() {
  return (
    <div className="space-y-section-gap" style={{ contain: 'layout' }}>
      {/* Summary Cards Skeleton - Matches exact structure with fixed heights */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="bg-card border-border min-h-[106px]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between animate-pulse">
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-24"></div>
                  <div className="h-8 bg-muted rounded w-16"></div>
                </div>
                <div className="w-5 h-5 bg-muted rounded"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs Skeleton - Fixed height matching TabsList */}
      <div className="space-y-4">
        <div className="grid w-full grid-cols-3 bg-muted border border-border rounded-lg h-10">
          <div className="bg-primary/20 rounded-lg m-1 animate-pulse"></div>
          <div className="bg-transparent rounded-lg m-1"></div>
          <div className="bg-transparent rounded-lg m-1"></div>
        </div>

        {/* Submission List Skeleton */}
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="animate-pulse space-y-2">
              <div className="h-6 bg-muted rounded w-48"></div>
              <div className="h-4 bg-muted rounded w-32"></div>
            </div>
            <div className="h-10 bg-muted rounded w-40 animate-pulse"></div>
          </div>
          <div className="animate-pulse h-10 bg-muted rounded w-full"></div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse h-[76px] bg-muted/50 rounded-lg border border-border" />
          ))}
        </div>
      </div>
    </div>
  )
}

