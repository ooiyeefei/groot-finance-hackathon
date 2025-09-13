/**
 * Personal Expense Claims Dashboard
 * Focused on individual user expense management
 * Includes personal reports functionality
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Camera, FileText, Clock, CheckCircle, XCircle, Edit3, BarChart3, Eye, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import DSPyExpenseSubmissionFlow from './dspy-expense-submission-flow'
import MonthlyReportGenerator from './monthly-report-generator'
import ExpenseEditModal from './expense-edit-modal'
import ExpenseClaimDetailsModal from './expense-claim-details-modal'
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

  // Fetch personal dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/expense-claims/dashboard', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      
      if (result.success) {
        // Extract only personal data
        setDashboardData({
          summary: result.data.summary,
          recent_claims: result.data.recent_claims
        })
      } else {
        throw new Error(result.error || 'Failed to fetch dashboard data')
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
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
  }, [])

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
      const response = await fetch(`/api/expense-claims/${deletingClaimId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })
      
      const result = await response.json()
      
      if (response.ok && result.success) {
        setToastMessage('Expense claim deleted successfully')
        fetchDashboardData() // Refresh data
        setShowDeleteConfirm(false)
        setDeletingClaimId(null)
      } else {
        setToastMessage(`Failed to delete claim: ${result.error}`)
      }
    } catch (error) {
      console.error('Error deleting claim:', error)
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

  useEffect(() => {
    if (userId) {
      fetchDashboardData()
    }
  }, [userId, fetchDashboardData])

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
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">My Expense Claims</h2>
          <p className="text-gray-400">Submit and track your expense claims</p>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3">
          <Button
            onClick={() => setShowSubmissionForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Camera className="w-4 h-4 mr-2" />
            Capture Receipt
          </Button>
          <Button
            variant="outline"
            className="border-gray-600 text-gray-300 hover:bg-gray-800"
            onClick={() => setShowSubmissionForm(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Manual Entry
          </Button>
        </div>
      </div>

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
            onNewClaim={() => setShowSubmissionForm(true)}
            setActiveTab={setActiveTab}
            fetchDashboardData={fetchDashboardData}
            setShowSubmissionForm={setShowSubmissionForm}
            setEditingClaimId={setEditingClaimId}
            setShowEditModal={setShowEditModal}
            setDetailsClaimId={setDetailsClaimId}
            setShowDetailsModal={setShowDetailsModal}
            deleteClaim={handleDeleteClick}
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
          />
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <PersonalReportsContent />
        </TabsContent>
      </Tabs>

      {/* DSPy Expense Submission Flow */}
      {showSubmissionForm && (
        <DSPyExpenseSubmissionFlow 
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
                transaction_date: data.transaction_date,
                vendor_name: data.vendor_name,
                reference_number: data.reference_number || undefined,
                notes: data.notes || undefined,
                document_id: data.document_id || undefined,
                line_items: data.line_items || []
              }
              
              const response = await fetch('/api/expense-claims', {
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
        <ExpenseEditModal
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
        />
      )}

      {/* Expense Claim Details Modal */}
      {showDetailsModal && detailsClaimId && (
        <ExpenseClaimDetailsModal
          claimId={detailsClaimId}
          isOpen={showDetailsModal}
          onClose={() => {
            setShowDetailsModal(false)
            setDetailsClaimId(null)
          }}
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
          <div className="bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg flex items-center justify-between">
            <span className="text-sm font-medium">{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-4 text-green-100 hover:text-white"
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
function PersonalOverviewContent({ data, onNewClaim, setActiveTab, fetchDashboardData, setShowSubmissionForm, setEditingClaimId, setShowEditModal, setDetailsClaimId, setShowDetailsModal, deleteClaim }: { 
  data: PersonalDashboardData
  onNewClaim: () => void
  setActiveTab: (tab: string) => void
  fetchDashboardData: () => void
  setShowSubmissionForm: (show: boolean) => void
  setEditingClaimId: (id: string | null) => void
  setShowEditModal: (show: boolean) => void
  setDetailsClaimId: (id: string | null) => void
  setShowDetailsModal: (show: boolean) => void
  deleteClaim: (claimId: string) => void
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Quick Actions */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Quick Actions</CardTitle>
          <CardDescription>Submit new expense claims</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button 
            onClick={onNewClaim}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white justify-start"
          >
            <Camera className="w-4 h-4 mr-2" />
            Capture Receipt with Camera
          </Button>
          <Button 
            variant="outline" 
            onClick={onNewClaim}
            className="w-full border-gray-600 text-gray-300 hover:bg-gray-700 justify-start"
          >
            <Plus className="w-4 h-4 mr-2" />
            Manual Entry
          </Button>
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
              {data.recent_claims.slice(0, 5).map((claim: any) => (
                <div key={claim.id} className="p-3 bg-gray-700 rounded-lg border border-gray-600">
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
                        {claim.transaction?.original_currency || 'SGD'} {parseFloat(claim.transaction?.original_amount || '0').toFixed(2)}
                      </p>
                      {claim.transaction?.home_currency_amount && claim.transaction.original_amount !== claim.transaction.home_currency_amount && (
                        <p className="text-gray-400 text-xs">
                          ≈ SGD {parseFloat(claim.transaction.home_currency_amount).toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Status and Progress */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge 
                        className={`text-xs px-2 py-1 ${
                          claim.status_display?.color === 'green' ? 'bg-green-600 text-white' :
                          claim.status_display?.color === 'blue' ? 'bg-blue-600 text-white' :
                          claim.status_display?.color === 'yellow' ? 'bg-yellow-600 text-white' :
                          claim.status_display?.color === 'red' ? 'bg-red-600 text-white' :
                          claim.status_display?.color === 'purple' ? 'bg-purple-600 text-white' :
                          'bg-gray-600 text-white'
                        }`}
                      >
                        {claim.status_display?.label || claim.status?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </Badge>
                      
                      {claim.current_approver_name && ['submitted', 'under_review', 'pending_approval'].includes(claim.status) && (
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
                      {claim.status_display?.description}
                    </p>
                  </div>
                  
                  {/* Action buttons for draft claims */}
                  {claim.status === 'draft' && (
                    <div className="mt-3 flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="text-xs border-gray-600 text-gray-300 hover:bg-gray-600"
                        onClick={() => {
                          // Open the edit modal for this claim
                          setEditingClaimId(claim.id)
                          setShowEditModal(true)
                          console.log('Edit claim:', claim.id)
                        }}
                      >
                        <Edit3 className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button 
                        size="sm"
                        variant="outline"
                        className="text-xs border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                        onClick={() => deleteClaim(claim.id)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete
                      </Button>
                      <Button 
                        size="sm"
                        className="text-xs bg-blue-600 hover:bg-blue-700"
                        onClick={async () => {
                          try {
                            const response = await fetch(`/api/expense-claims/${claim.id}/submit`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'submit' })
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
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Submit
                      </Button>
                    </div>
                  )}
                  
                  {/* View Details button for all claims */}
                  <div className="mt-3 flex justify-end">
                    <Button 
                      size="sm" 
                      variant="ghost"
                      className="text-xs text-blue-400 hover:text-blue-300 hover:bg-gray-600"
                      onClick={() => {
                        setDetailsClaimId(claim.id)
                        setShowDetailsModal(true)
                      }}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
              
              {data.recent_claims.length > 5 && (
                <Button 
                  variant="ghost" 
                  className="w-full text-blue-400 hover:text-blue-300"
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

// Personal History Content
function PersonalHistoryContent({ data, setEditingClaimId, setShowEditModal, setDetailsClaimId, setShowDetailsModal, deleteClaim }: { 
  data: PersonalDashboardData
  setEditingClaimId: (id: string | null) => void
  setShowEditModal: (show: boolean) => void
  setDetailsClaimId: (id: string | null) => void
  setShowDetailsModal: (show: boolean) => void
  deleteClaim: (claimId: string) => void
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
            {data.recent_claims.map((claim: any) => (
              <div key={claim.id} className="p-4 bg-gray-700 rounded-lg border border-gray-600 hover:border-gray-500 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-white font-medium">
                      {claim.transaction?.description || claim.description || 'Expense Claim'}
                    </p>
                    <p className="text-gray-400 text-sm">
                      {new Date(claim.created_at).toLocaleDateString()} • 
                      {claim.expense_category?.replace('_', ' ').toUpperCase()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-semibold">
                      {claim.transaction?.original_currency || 'SGD'} {parseFloat(claim.transaction?.original_amount || '0').toFixed(2)}
                    </p>
                    <Badge 
                      className={`text-xs ${
                        claim.status === 'approved' ? 'bg-green-600' :
                        claim.status === 'rejected' ? 'bg-red-600' :
                        claim.status === 'submitted' ? 'bg-blue-600' :
                        'bg-gray-600'
                      }`}
                    >
                      {claim.status?.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                </div>
                
                {/* Action buttons */}
                <div className="flex gap-2 justify-end">
                  {claim.status === 'draft' ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs border-gray-600 text-gray-300 hover:bg-gray-600"
                        onClick={() => {
                          setEditingClaimId(claim.id)
                          setShowEditModal(true)
                        }}
                      >
                        <Edit3 className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                        onClick={() => deleteClaim(claim.id)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-blue-400 hover:text-blue-300 hover:bg-gray-600"
                      onClick={() => {
                        setDetailsClaimId(claim.id)
                        setShowDetailsModal(true)
                      }}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View Details
                    </Button>
                  )}
                </div>
              </div>
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