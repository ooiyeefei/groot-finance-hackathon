/**
 * Personal Expense Claims Dashboard
 * Focused on individual user expense management
 * Includes personal reports functionality
 */

'use client'

import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Plus, Camera, FileText, Clock, CheckCircle, XCircle, Edit3, BarChart3, Eye, Trash2, Loader2, RotateCcw, Brain } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// PERFORMANCE OPTIMIZATION: Dynamic imports for heavy components (only load when needed)
const ExpenseSubmissionFlow = lazy(() => import('./expense-submission-flow'))
const MonthlyReportGenerator = lazy(() => import('./monthly-report-generator'))
const EditExpenseModalNew = lazy(() => import('./edit-expense-modal-new'))
const UnifiedExpenseDetailsModal = lazy(() => import('./unified-expense-details-modal'))
const ConfirmationDialog = lazy(() => import('@/components/ui/confirmation-dialog'))
const FileUploadZone = lazy(() => import('@/domains/utilities/components/file-upload-zone'))

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

  const [activeTab, setActiveTab] = useState('overview')
  const [dashboardData, setDashboardData] = useState<PersonalDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSubmissionForm, setShowSubmissionForm] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [detailsClaimId, setDetailsClaimId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingClaimId, setDeletingClaimId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [submissionMode, setSubmissionMode] = useState<'camera' | 'manual'>('camera')
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

  // Fetch personal dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/v1/expense-claims?limit=10&sort_order=desc', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[PersonalExpenseDashboard] Error response:', errorText)
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()

      if (result.success) {
        // Transform v1 API response to dashboard format
        const claims = result.data?.claims || [];
        const pagination = result.data?.pagination || {};

        const summary = {
          total_claims: pagination.total || 0,
          pending_approval: claims.filter((claim: any) => claim.status === 'submitted').length,
          approved_amount: claims
            .filter((claim: any) => claim.status === 'approved' || claim.status === 'reimbursed')
            .reduce((sum: number, claim: any) => sum + (claim.home_currency_amount || claim.total_amount || 0), 0),
          rejected_count: claims.filter((claim: any) => claim.status === 'rejected').length,
        };

        // Enrich claims with workflow progress
        const enrichedClaims = claims.map((claim: any) => ({
          ...claim,
          workflow_progress: getWorkflowProgress(claim.status)
        }))

        setDashboardData({
          summary: summary,
          recent_claims: enrichedClaims
        })
      } else {
        console.error('[PersonalExpenseDashboard] API returned success: false, error:', result.error)
        throw new Error(result.error || 'Failed to fetch dashboard data')
      }
    } catch (error) {
      console.error('[PersonalExpenseDashboard] Failed to fetch dashboard data:', error)
      console.error('[PersonalExpenseDashboard] Error details:', error instanceof Error ? error.message : 'Unknown error')

      // Set minimal fallback data
      setDashboardData({
        summary: {
          total_claims: 0,
          pending_approval: 0,
          approved_amount: 0,
          rejected_count: 0
        },
        recent_claims: []
      })
    } finally {
      setLoading(false)
    }
  }, [getWorkflowProgress])

  // Handle delete click to show confirmation dialog
  const handleDeleteClick = useCallback((claimId: string) => {
    setDeletingClaimId(claimId)
    setShowDeleteConfirm(true)
  }, [])

  // Delete expense claim function
  const deleteClaim = useCallback(async () => {
    if (!deletingClaimId) return
    
    setIsDeleting(true)

    try {
      const response = await fetch(`/api/v1/expense-claims/${deletingClaimId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })
      
      const result = await response.json()
      
      if (response.ok && result.success) {
        setToastType('success')
        setToastMessage('Expense claim deleted successfully')
        fetchDashboardData() // Refresh data
        setShowDeleteConfirm(false)
        setDeletingClaimId(null)
      } else {
        setToastType('error')
        setToastMessage(`Failed to delete claim: ${result.error}`)
      }
    } catch (error) {
      console.error('Error deleting claim:', error)
      setToastType('error')
      setToastMessage('An error occurred while deleting the claim')
    } finally {
      setIsDeleting(false)
    }
  }, [deletingClaimId, fetchDashboardData])

  const handleCloseDeleteConfirm = useCallback(() => {
    if (!isDeleting) {
      setShowDeleteConfirm(false)
      setDeletingClaimId(null)
    }
  }, [isDeleting])

  // AI reprocessing handler - Calls server-side API to fix TRIGGER_SECRET_KEY error
  const handleReprocessClick = useCallback(async (claimId: string, storagePath: string) => {
    try {
      setReprocessingClaims(prev => new Set(prev).add(claimId))
      setToastType('success')
      setToastMessage('Starting AI reprocessing...')


      // Step 1: Update status to 'analyzing' immediately for UI feedback
      try {
        const statusResponse = await fetch(`/api/v1/expense-claims/${claimId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'analyzing' })
        })

        if (statusResponse.ok) {
          // Refresh UI immediately to show analyzing status
          fetchDashboardData()
        }
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
      setToastMessage('AI reprocessing started successfully! Results will appear in a few moments.')

      // Refresh dashboard data after a short delay to show processing status
      setTimeout(() => {
        fetchDashboardData()
      }, 2000)

    } catch (error) {
      console.error('Reprocess error:', error)
      setToastType('error')
      setToastMessage(error instanceof Error ? error.message : 'Failed to reprocess expense claim')

      // If reprocessing failed, refresh data to show current status
      fetchDashboardData()
    } finally {
      setReprocessingClaims(prev => {
        const newSet = new Set(prev)
        newSet.delete(claimId)
        return newSet
      })
    }
  }, [fetchDashboardData])

  useEffect(() => {
    if (userId) {
      fetchDashboardData()
    }
  }, [userId, fetchDashboardData])

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

  // ✅ FIXED: Smart polling that only updates processing claims without full refresh
  useEffect(() => {
    if (!dashboardData?.recent_claims) return

    // Get IDs of claims that are currently processing
    const processingClaimIds = dashboardData.recent_claims
      .filter(claim => claim.status === 'analyzing' || claim.status === 'uploading')
      .map(claim => claim.id)

    if (processingClaimIds.length === 0) return


    const interval = setInterval(async () => {
      try {
        // Only fetch status for processing claims - much lighter API call
        const statusPromises = processingClaimIds.map(async (claimId) => {
          const response = await fetch(`/api/v1/expense-claims/${claimId}`)
          if (response.ok) {
            const result = await response.json()
            return result.success ? { claimId, claim: result.data } : null
          }
          return null
        })

        const statusResults = await Promise.all(statusPromises)

        // Update only the specific claims that changed status
        let shouldRefreshAll = false

        statusResults.forEach((result) => {
          if (result && result.claim) {
            const { claimId, claim } = result

            // If claim is no longer processing, we need a full refresh to update summary
            if (claim.status !== 'analyzing' && claim.status !== 'uploading') {
              shouldRefreshAll = true
            }
          }
        })

        // Only do full refresh when processing is complete, not during processing
        if (shouldRefreshAll) {
          fetchDashboardData()
        }

      } catch (error) {
        console.error('[Smart Polling] Error checking claim status:', error)
        // On error, fall back to full refresh but less frequently
        fetchDashboardData()
      }
    }, 5000) // Poll every 5 seconds (less aggressive)

    return () => {
      clearInterval(interval)
    }
  }, [dashboardData?.recent_claims?.map(c => `${c.id}:${c.status}`).join(',')]) // Only re-run when claim statuses actually change

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
          <PersonalOverviewContent
            data={dashboardData}
            onNewClaim={(mode: 'camera' | 'manual' = 'camera') => {
              setSubmissionMode(mode)
              setShowSubmissionForm(true)
            }}
            setActiveTab={setActiveTab}
            fetchDashboardData={fetchDashboardData}
            setShowSubmissionForm={setShowSubmissionForm}
            setEditingClaimId={setEditingClaimId}
            setShowEditModal={setShowEditModal}
            setDetailsClaimId={setDetailsClaimId}
            setShowDetailsModal={setShowDetailsModal}
            deleteClaim={handleDeleteClick}
            setToastMessage={setToastMessage}
            setToastType={setToastType}
            handleReprocessClick={handleReprocessClick}
            reprocessingClaims={reprocessingClaims}
          />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <PersonalHistoryContent
            data={dashboardData}
            setEditingClaimId={setEditingClaimId}
            setShowEditModal={setShowEditModal}
            setDetailsClaimId={setDetailsClaimId}
            setShowDetailsModal={setShowDetailsModal}
            deleteClaim={handleDeleteClick}
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

      {/* AI Expense Submission Flow */}
      {showSubmissionForm && (
        <Suspense fallback={<div className="flex items-center justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>}>
          <ExpenseSubmissionFlow
            initialStep={submissionMode === 'manual' ? 'form' : 'upload'}
            onClose={(hasBackgroundProcessing = false) => {
              setShowSubmissionForm(false)

              // If there's background processing, show a notification
              if (hasBackgroundProcessing) {
                // Store background processing notification in localStorage
                localStorage.setItem('backgroundProcessing', JSON.stringify({
                  message: 'Receipt processing continues in background',
                  timestamp: new Date().toISOString(),
                  type: 'info'
                }))
              }

              // Refresh dashboard when form closes
              fetchDashboardData()
            }}
            onSubmit={async (data) => {
              try {
                // Transform form data to API format
                const requestBody = {
                  description: data.description,
                  business_purpose: data.business_purpose,
                  expense_category: data.expense_category,
                  original_amount: data.original_amount,
                  original_currency: data.original_currency,
                  home_currency: data.home_currency, // Include home currency for conversion
                  transaction_date: data.transaction_date,
                  vendor_name: data.vendor_name,
                  reference_number: data.reference_number || undefined,
                  notes: data.notes || undefined,
                  // Include storage_path for manual receipt uploads
                  storage_path: data.storage_path || undefined,
                  line_items: data.line_items || []
                }

                const response = await fetch('/api/v1/expense-claims', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(requestBody)
                })

                if (!response.ok) {
                  const errorData = await response.json()
                  throw new Error(errorData.error || 'Failed to submit expense claim')
                }

                const result = await response.json()

                // Close the form after successful submission
                setShowSubmissionForm(false)

                // Refresh dashboard data to show new claim
                fetchDashboardData()

                // Return result for any additional processing
                return result

              } catch (error) {
                console.error('Error submitting expense claim:', error)
                throw error // Let the form handle the error display
              }
            }}
          />
        </Suspense>
      )}

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
      {showDetailsModal && detailsClaimId && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><Loader2 className="w-8 h-8 animate-spin text-white" /></div>}>
          <UnifiedExpenseDetailsModal
            claimId={detailsClaimId}
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

// Personal Overview Content
function PersonalOverviewContent({ data, onNewClaim, setActiveTab, fetchDashboardData, setShowSubmissionForm, setEditingClaimId, setShowEditModal, setDetailsClaimId, setShowDetailsModal, deleteClaim, setToastMessage, setToastType, handleReprocessClick, reprocessingClaims }: {
  data: PersonalDashboardData
  onNewClaim: (mode: 'camera' | 'manual') => void
  setActiveTab: (tab: string) => void
  fetchDashboardData: () => void
  setShowSubmissionForm: (show: boolean) => void
  setEditingClaimId: (id: string | null) => void
  setShowEditModal: (show: boolean) => void
  setDetailsClaimId: (id: string | null) => void
  setShowDetailsModal: (show: boolean) => void
  deleteClaim: (claimId: string) => void
  setToastMessage: (message: string | null) => void
  setToastType: (type: 'success' | 'error') => void
  handleReprocessClick: (claimId: string, storagePath: string) => Promise<void>
  reprocessingClaims: Set<string>
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Quick Actions */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Quick Actions</CardTitle>
          <CardDescription>Submit new expense claims</CardDescription>
        </CardHeader>
        <CardContent>
          {/* File Upload Zone - Above the buttons */}
          <div className="mb-6">
            <Suspense fallback={<div className="border-2 border-dashed border-border rounded-lg p-card-padding text-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /></div>}>
              <FileUploadZone
                domain="expense-claims"
                allowMultiple={true}
                autoProcess={true}
                onUploadSuccess={(document) => {
                  // Refresh dashboard to show new claims
                  fetchDashboardData()
                }}
                onBatchUploadSuccess={(documents) => {
                  // Refresh dashboard to show all new claims
                  fetchDashboardData()
                }}
                onUploadStart={() => {
                  // Upload started
                }}
              />
            </Suspense>
          </div>

          {/* Existing buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              onClick={() => onNewClaim('camera')}
              variant="primary"
              className="justify-center"
            >
              <Camera className="w-4 h-4 mr-2" />
              Capture or Upload
            </Button>
            <Button
              onClick={() => onNewClaim('manual')}
              variant="secondary"
              className="justify-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Manual Entry
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Claims Status */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Recent Claims
          </CardTitle>
          <CardDescription>Your latest expense claim status</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recent_claims.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <FileText className="w-12 h-12 mx-auto mb-4" />
              <p>No expense claims yet</p>
              <p className="text-sm">Submit your first expense claim to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.recent_claims.slice(0, 5).map((claim: any, index: number) => (
                <ExpenseClaimCard
                  key={`overview-${claim.id}-${index}`}
                  claim={claim}
                  index={index}
                  context="overview"
                  setEditingClaimId={setEditingClaimId}
                  setShowEditModal={setShowEditModal}
                  setDetailsClaimId={setDetailsClaimId}
                  setShowDetailsModal={setShowDetailsModal}
                  deleteClaim={deleteClaim}
                  fetchDashboardData={fetchDashboardData}
                  setToastMessage={setToastMessage}
                  setToastType={setToastType}
                  handleReprocessClick={handleReprocessClick}
                  reprocessingClaims={reprocessingClaims}
                />
              ))}
              
              {data.recent_claims.length > 5 && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setActiveTab('history')}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  View all {data.recent_claims.length} claims
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Unified Expense Claim Card Component
function ExpenseClaimCard({ claim, index, context, setEditingClaimId, setShowEditModal, setDetailsClaimId, setShowDetailsModal, deleteClaim, fetchDashboardData, setToastMessage, setToastType, handleReprocessClick, reprocessingClaims }: {
  claim: any
  index: number
  context: 'overview' | 'history'
  setEditingClaimId: (id: string | null) => void
  setShowEditModal: (show: boolean) => void
  setDetailsClaimId: (id: string | null) => void
  setShowDetailsModal: (show: boolean) => void
  deleteClaim: (claimId: string) => void
  fetchDashboardData: () => void
  setToastMessage: (message: string | null) => void
  setToastType: (type: 'success' | 'error') => void
  handleReprocessClick: (claimId: string, storagePath: string) => Promise<void>
  reprocessingClaims: Set<string>
}) {
  return (
    <div key={`${context}-${claim.id}-${index}`} className={`p-${context === 'overview' ? '3' : '4'} bg-muted/50 rounded-lg border border-border ${context === 'history' ? 'hover:border-muted-foreground transition-colors' : ''}`}>
      {/* Claim Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <p className="text-foreground font-medium text-sm">
            {claim.transaction?.description || claim.description || 'Expense Claim'}
          </p>
          <p className="text-muted-foreground text-xs">
            {claim.expense_category?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())} •
            {new Date(claim.transaction?.transaction_date || claim.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-foreground font-semibold text-sm">
            {claim.display_currency || claim.currency || 'SGD'} {parseFloat(claim.display_amount || claim.total_amount || '0').toFixed(2)}
          </p>
          {claim.home_currency_amount &&
           claim.display_currency !== claim.home_currency &&
           parseFloat(claim.home_currency_amount) !== parseFloat(claim.display_amount || claim.total_amount || '0') && (
            <p className="text-muted-foreground text-xs">
              ≈ {claim.home_currency} {parseFloat(claim.home_currency_amount).toFixed(2)}
            </p>
          )}
        </div>
      </div>

      {/* Status and Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-1">
          {/* Primary Status Badge */}
          <div className="flex items-center gap-2">
            <Badge
              variant={
                // Use proper CVA variants for semantic design system
                claim.status === 'submitted' ? 'success' :
                claim.status === 'approved' ? 'success' :
                claim.status === 'rejected' ? 'error' :
                claim.status === 'reimbursed' ? 'success' :
                // Unified logic with semantic colors based on status_display
                claim.status_display?.color === 'green' ? 'success' :
                claim.status_display?.color === 'blue' ? 'primary' :
                claim.status_display?.color === 'yellow' ? 'warning' :
                claim.status_display?.color === 'red' ? 'error' :
                claim.status_display?.color === 'purple' ? 'secondary' :
                claim.status === 'draft' ? 'primary' :
                'default'
              }
            >
              {/* Show appropriate processing icon based on status */}
              {claim.status === 'analyzing' ? (
                <Brain className="w-3 h-3 mr-1 text-blue-400 animate-spin" />
              ) : claim.status_display?.isProcessing ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : null}
              {/* UNIFIED PRIORITY: API status_display > unified status > fallback */}
              {claim.status_display?.label ||
                (claim.status === 'analyzing' ? 'AI Analyzing...' :
                 claim.status === 'draft' ? 'Ready to Submit' :
                 claim.status?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()))
              }
            </Badge>

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

      {/* Action buttons - Unified row for all claim states */}
      <div className="mt-3 flex items-center space-x-2">
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
            <Button
              onClick={() => deleteClaim(claim.id)}
              variant="destructive"
              size="sm"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>
            <Button
              onClick={async () => {
                try {
                  const response = await fetch(`/api/v1/expense-claims/${claim.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'submitted' })
                  })

                  const result = await response.json()

                  if (response.ok && result.success) {
                    fetchDashboardData() // Refresh data
                  } else {
                    console.error('Submit failed:', result.error)
                    alert(`Failed to submit claim: ${result.error}`)
                  }
                } catch (error) {
                  console.error('Failed to submit claim:', error)
                  alert('Failed to submit claim. Please try again.')
                }
              }}
              variant="primary"
              size="sm"
            >
              <CheckCircle className="w-4 h-4 mr-1.5" />
              Submit
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

        {/* Reprocess button for failed claims - Retry AI extraction */}
        {claim.status === 'failed' && claim.storage_path && (
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

        {/* View Details button for all non-draft claims (except when processing or failed with reprocess option) */}
        {claim.status !== 'draft' &&
         claim.status !== 'analyzing' &&
         claim.status !== 'uploading' &&
         !(claim.status === 'failed' && claim.storage_path) && (
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
function PersonalHistoryContent({ data, setEditingClaimId, setShowEditModal, setDetailsClaimId, setShowDetailsModal, deleteClaim, fetchDashboardData, setToastMessage, setToastType, handleReprocessClick, reprocessingClaims }: {
  data: PersonalDashboardData
  setEditingClaimId: (id: string | null) => void
  setShowEditModal: (show: boolean) => void
  setDetailsClaimId: (id: string | null) => void
  setShowDetailsModal: (show: boolean) => void
  deleteClaim: (claimId: string) => void
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
                setEditingClaimId={setEditingClaimId}
                setShowEditModal={setShowEditModal}
                setDetailsClaimId={setDetailsClaimId}
                setShowDetailsModal={setShowDetailsModal}
                deleteClaim={deleteClaim}
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

// Loading skeleton
function PersonalDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="animate-pulse">
        <div className="h-8 bg-record-layer-2 rounded-lg w-1/3 mb-2"></div>
        <div className="h-4 bg-record-layer-2 rounded w-1/2"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-record-layer-1 border border-record-border rounded-lg p-6 animate-pulse">
            <div className="h-4 bg-record-layer-2 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-record-layer-2 rounded w-1/3"></div>
          </div>
        ))}
      </div>

      <div className="bg-record-layer-1 border border-record-border rounded-lg p-6 animate-pulse">
        <div className="h-64 bg-record-layer-2 rounded"></div>
      </div>
    </div>
  )
}