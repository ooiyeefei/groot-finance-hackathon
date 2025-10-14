/**
 * Personal Expense Claims Dashboard
 * Focused on individual user expense management
 * Includes personal reports functionality
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Camera, FileText, Clock, CheckCircle, XCircle, Edit3, BarChart3, Eye, Trash2, Loader2, RotateCcw, Brain } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ExpenseSubmissionFlow from './expense-submission-flow'
import MonthlyReportGenerator from './monthly-report-generator'
import EditExpenseModalNew from './edit-expense-modal-new'
import UnifiedExpenseDetailsModal from './unified-expense-details-modal'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'

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
      console.log('[PersonalExpenseDashboard] Fetching dashboard data...')

      const response = await fetch('/api/v1/expense-claims?limit=10&sort_order=desc', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      console.log('[PersonalExpenseDashboard] Response status:', response.status)
      console.log('[PersonalExpenseDashboard] Response ok:', response.ok)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[PersonalExpenseDashboard] Error response:', errorText)
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      console.log('[PersonalExpenseDashboard] API result:', JSON.stringify(result, null, 2))

      if (result.success) {
        // Transform v1 API response to dashboard format
        const claims = result.data?.claims || [];
        const pagination = result.data?.pagination || {};

        const summary = {
          total_claims: pagination.total || 0,
          pending_approval: claims.filter((claim: any) => claim.status === 'submitted').length,
          approved_amount: claims
            .filter((claim: any) => claim.status === 'approved' || claim.status === 'reimbursed')
            .reduce((sum: number, claim: any) => sum + (claim.total_amount || 0), 0),
          rejected_count: claims.filter((claim: any) => claim.status === 'rejected').length,
        };

        // Enrich claims with workflow progress
        const enrichedClaims = claims.map((claim: any) => ({
          ...claim,
          workflow_progress: getWorkflowProgress(claim.status)
        }))

        console.log('[PersonalExpenseDashboard] Setting dashboard data:', {
          summary: summary,
          recent_claims_count: enrichedClaims.length
        })

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

      console.log('[Dashboard] Starting AI reprocessing for claim:', claimId)

      // Call server-side API endpoint instead of client-side Trigger.dev call
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

      console.log('[Dashboard] Reprocessing API response:', result)

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

  // Polling for processing status updates
  useEffect(() => {
    if (!dashboardData?.recent_claims) return

    // Check if any claims are processing or uploading
    const hasProcessingClaims = dashboardData.recent_claims.some(claim =>
      claim.status === 'analyzing' || claim.status === 'uploading'
    )

    if (hasProcessingClaims) {
      console.log('[Dashboard Polling] Starting polling for processing claims')
      const interval = setInterval(() => {
        fetchDashboardData()
      }, 3000) // Poll every 3 seconds

      return () => {
        console.log('[Dashboard Polling] Stopping polling')
        clearInterval(interval)
      }
    }
  }, [dashboardData?.recent_claims, fetchDashboardData])

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
    return <div className="text-center text-gray-400 p-8">Failed to load dashboard data</div>
  }

  return (
    <div className="space-y-6">

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
        <TabsList className="grid w-full grid-cols-3 bg-gray-800 border border-gray-700">
          <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            Overview
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
            History
          </TabsTrigger>
          <TabsTrigger value="reports" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
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
              
              console.log('[Background Processing] Processing continues after dialog close')
            }
            
            // Refresh dashboard when form closes
            fetchDashboardData()
          }}
          onSubmit={async (data) => {
            try {
              console.log('Submitting expense claim:', data)
              
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
              console.log('Expense claim created successfully:', result)
              
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
      )}

      {/* Expense Edit Modal */}
      {showEditModal && editingClaimId && (
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
          onReprocess={async () => {
            // Reprocess NOT IMPLEMENTED in North Star v1 API
            // TODO: Reprocessing is not part of the 5 core CRUD endpoints
            throw new Error('Reprocess functionality not implemented yet')
          }}
        />
      )}

      {/* Expense Claim Details Modal */}
      {showDetailsModal && detailsClaimId && (
        <UnifiedExpenseDetailsModal
          claimId={detailsClaimId}
          isOpen={showDetailsModal}
          onClose={() => {
            setShowDetailsModal(false)
            setDetailsClaimId(null)
          }}
          viewMode="personal"
        />
      )}

      {/* Delete Confirmation Dialog */}
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

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 max-w-md">
          <div className={`${toastType === 'success' ? 'bg-green-600' : 'bg-red-600'} text-white px-6 py-4 rounded-lg shadow-lg flex items-center justify-between`}>
            <span className="text-sm font-medium">{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className={`ml-4 ${toastType === 'success' ? 'text-green-100 hover:text-white' : 'text-red-100 hover:text-white'}`}
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
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Quick Actions</CardTitle>
          <CardDescription>Submit new expense claims</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              onClick={() => onNewClaim('camera')}
              className="bg-blue-600 hover:bg-blue-700 text-white justify-center"
            >
              <Camera className="w-4 h-4 mr-2" />
              Capture or Upload
            </Button>
            <Button
              onClick={() => onNewClaim('manual')}
              className="bg-gray-200 hover:bg-gray-300 text-gray-900 justify-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Manual Entry
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Claims Status */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Recent Claims
          </CardTitle>
          <CardDescription>Your latest expense claim status</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recent_claims.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
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
                  className="w-full text-blue-400 hover:bg-gray-100 hover:text-blue-600"
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
    <div key={`${context}-${claim.id}-${index}`} className={`p-${context === 'overview' ? '3' : '4'} bg-gray-700 rounded-lg border border-gray-600 ${context === 'history' ? 'hover:border-gray-500 transition-colors' : ''}`}>
      {/* Claim Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <p className="text-white font-medium text-sm">
            {claim.transaction?.description || claim.description || 'Expense Claim'}
          </p>
          <p className="text-gray-400 text-xs">
            {claim.expense_category?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())} •
            {new Date(claim.transaction?.transaction_date || claim.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-white font-semibold text-sm">
            {claim.display_currency || claim.currency || 'SGD'} {parseFloat(claim.display_amount || claim.total_amount || '0').toFixed(2)}
          </p>
          {claim.home_currency_amount &&
           claim.display_currency !== claim.home_currency &&
           parseFloat(claim.home_currency_amount) !== parseFloat(claim.display_amount || claim.total_amount || '0') && (
            <p className="text-gray-400 text-xs">
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
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                // UNIFIED LOGIC: Dark theme pattern matching invoices/applications
                claim.status_display?.color === 'green' ? 'bg-green-900/20 text-green-300 border-green-700/50' :
                claim.status_display?.color === 'blue' ? 'bg-blue-900/20 text-blue-300 border-blue-700/50' :
                claim.status_display?.color === 'yellow' ? 'bg-yellow-900/20 text-yellow-300 border-yellow-700/50' :
                claim.status_display?.color === 'red' ? 'bg-red-900/20 text-red-300 border-red-700/50' :
                claim.status_display?.color === 'purple' ? 'bg-purple-900/20 text-purple-300 border-purple-700/50' :
                claim.status === 'draft' ? 'bg-blue-900/20 text-blue-300 border-blue-700/50' :
                'bg-gray-900/20 text-gray-300 border-gray-700/50'
              }`}
            >
              {/* Show appropriate processing icon based on status */}
              {claim.status === 'analyzing' ? (
                <Brain className="w-3 h-3 mr-1 text-blue-400 animate-pulse" />
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
            <span className="text-xs text-gray-400">
              With: {claim.current_approver_name}
            </span>
          )}
        </div>

        {/* Workflow Progress Bar */}
        <div className="w-full bg-gray-600 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              claim.status === 'rejected' ? 'bg-red-500' : 'bg-blue-500'
            }`}
            style={{ width: `${claim.workflow_progress || 0}%` }}
          />
        </div>

        <p className="text-xs text-gray-400">
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
            <button
              onClick={() => {
                setEditingClaimId(claim.id)
                setShowEditModal(true)
              }}
              className="inline-flex items-center px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 hover:text-gray-800 text-sm font-medium rounded-md transition-colors"
            >
              <Edit3 className="w-4 h-4 mr-1.5" />
              Edit
            </button>
            <button
              onClick={() => deleteClaim(claim.id)}
              className="inline-flex items-center px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </button>
            <button
              onClick={async () => {
                try {
                  const response = await fetch(`/api/v1/expense-claims/${claim.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'submitted' })
                  })

                  const result = await response.json()

                  if (response.ok && result.success) {
                    console.log('Claim submitted successfully:', result.data.message)
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
              className="inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
            >
              <CheckCircle className="w-4 h-4 mr-1.5" />
              Submit
            </button>
          </>
        )}

        {/* Re-extract button for draft claims with receipts - Triggers actual AI processing */}
        {claim.status === 'draft' && claim.storage_path && (
          <button
            onClick={() => handleReprocessClick(claim.id, claim.storage_path)}
            disabled={reprocessingClaims.has(claim.id)}
            className="inline-flex items-center px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
          >
            {reprocessingClaims.has(claim.id) ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4 mr-1.5" />
            )}
            {reprocessingClaims.has(claim.id) ? 'Processing...' : 'Re-extract'}
          </button>
        )}

        {/* View Details button for all non-draft claims (except when processing) */}
        {claim.status !== 'draft' && claim.status !== 'analyzing' && claim.status !== 'uploading' && (
          <button
            onClick={() => {
              setDetailsClaimId(claim.id)
              setShowDetailsModal(true)
            }}
            className="inline-flex items-center px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors"
          >
            <Eye className="w-4 h-4 mr-1.5" />
            View Details
          </button>
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
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white">Expense History</CardTitle>
        <CardDescription>All your expense claims over time</CardDescription>
      </CardHeader>
      <CardContent>
        {data.recent_claims.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
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
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          My Reports
        </CardTitle>
        <CardDescription>Generate personal expense reports</CardDescription>
      </CardHeader>
      <CardContent>
        <MonthlyReportGenerator personalOnly={true} />
      </CardContent>
    </Card>
  )
}

// Summary card component
function SummaryCard({ title, value, icon, variant }: {
  title: string
  value: string
  icon: React.ReactNode
  variant: 'default' | 'success' | 'warning' | 'error'
}) {
  const variantStyles = {
    default: 'bg-gray-800 border-gray-700',
    success: 'bg-green-900/20 border-green-700',
    warning: 'bg-yellow-900/20 border-yellow-700',
    error: 'bg-red-900/20 border-red-700'
  }

  const textStyles = {
    default: 'text-white',
    success: 'text-green-400',
    warning: 'text-yellow-400',
    error: 'text-red-400'
  }

  return (
    <Card className={variantStyles[variant]}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm font-medium">{title}</p>
            <p className={`text-2xl font-bold ${textStyles[variant]}`}>{value}</p>
          </div>
          <div className={`${textStyles[variant]}`}>
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
        <div className="h-8 bg-gray-700 rounded-lg w-1/3 mb-2"></div>
        <div className="h-4 bg-gray-700 rounded w-1/2"></div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-gray-800 rounded-lg p-6 animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-gray-700 rounded w-1/3"></div>
          </div>
        ))}
      </div>

      <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
        <div className="h-64 bg-gray-700 rounded"></div>
      </div>
    </div>
  )
}