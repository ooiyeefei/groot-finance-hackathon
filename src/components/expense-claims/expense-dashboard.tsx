/**
 * Expense Claims Dashboard
 * Implements Mel's role-adaptive progressive disclosure design
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Camera, FileText, Clock, CheckCircle, XCircle, Edit3, User } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import DSPyExpenseSubmissionFlow from './dspy-expense-submission-flow'
import ExpenseApprovalDashboard from '../manager/expense-approval-dashboard'
import ExpenseAnalytics from './expense-analytics'
import MonthlyReportGenerator from './monthly-report-generator'
import GoogleSheetsExport from './google-sheets-export'
import CategoryManagement from './category-management'
import ExpenseEditModal from './expense-edit-modal'

interface ExpenseDashboardProps {
  userId: string
}

interface UserRole {
  employee: boolean
  manager: boolean
  admin: boolean
}

interface DashboardData {
  role: UserRole
  summary: {
    total_claims: number
    pending_approval: number
    approved_amount: number
    rejected_count: number
  }
  recent_claims: any[]
}

export default function ExpenseDashboard({ userId }: ExpenseDashboardProps) {
  const t = useTranslations('expenseClaims');
  const [activeTab, setActiveTab] = useState('overview')
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSubmissionForm, setShowSubmissionForm] = useState(false)
  const [submissionMode, setSubmissionMode] = useState<'camera' | 'manual'>('camera')
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null)

  // Fetch dashboard data and user role
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
        setDashboardData(result.data)
      } else {
        throw new Error(result.error || 'Failed to fetch dashboard data')
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
      // Set minimal fallback data so UI doesn't break
      setDashboardData({
        role: { employee: true, manager: false, admin: false },
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

  useEffect(() => {
    if (userId) {
      fetchDashboardData()
    }
  }, [userId, fetchDashboardData])

  // Debug modal state changes
  useEffect(() => {
    console.log('Modal state changed - showEditModal:', showEditModal, 'editingClaimId:', editingClaimId)
  }, [showEditModal, editingClaimId])

  // Handle edit modal
  const handleEditClaim = (claimId: string) => {
    console.log('Edit claim clicked:', claimId)
    setEditingClaimId(claimId)
    setShowEditModal(true)
    console.log('Modal state set - showEditModal:', true, 'editingClaimId:', claimId)
  }

  const handleCloseEditModal = () => {
    setShowEditModal(false)
    setEditingClaimId(null)
  }

  const handleEditSave = () => {
    // Refresh dashboard data after successful edit
    fetchDashboardData()
  }

  if (loading) {
    return <ExpenseDashboardSkeleton />
  }

  if (!dashboardData) {
    return <div className="text-center text-gray-400 p-8">{t('dashboard.failedToLoadDashboard')}</div>
  }

  // Mel's role-adaptive content based on user permissions
  const renderRoleBasedContent = () => {
    const { role } = dashboardData

    if (role.admin) {
      return <AdminDashboardContent data={dashboardData} />
    } else if (role.manager) {
      return <ManagerDashboardContent data={dashboardData} />
    } else {
      return <EmployeeDashboardContent
        data={dashboardData}
        onNewClaim={(mode: 'camera' | 'manual') => {
          setSubmissionMode(mode)
          setShowSubmissionForm(true)
        }}
        onEditClaim={handleEditClaim}
        t={t}
      />
    }
  }

  return (
    <div className="space-y-6">
      {/* Quick Action Header - Mel's mobile-first approach */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {dashboardData.role.admin && t('dashboard.adminDashboard')}
            {dashboardData.role.manager && !dashboardData.role.admin && t('dashboard.teamExpenseManagement')}
            {!dashboardData.role.manager && !dashboardData.role.admin && t('dashboard.myExpenseClaims')}
          </h2>
          <p className="text-gray-400">
            {dashboardData.role.admin && t('dashboard.processReimbursements')}
            {dashboardData.role.manager && !dashboardData.role.admin && t('dashboard.reviewApproveTeam')}
            {!dashboardData.role.manager && !dashboardData.role.admin && t('dashboard.submitTrackClaims')}
          </p>
        </div>

        {/* Role-specific quick actions */}
        <div className="flex gap-3">
          {/* Everyone can submit expense claims */}
          <Button
            onClick={() => {
              setSubmissionMode('camera')
              setShowSubmissionForm(true)
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Camera className="w-4 h-4 mr-2" />
            {t('dashboard.captureReceipt')}
          </Button>
          <Button
            variant="outline"
            className="border-gray-600 text-gray-300 hover:bg-gray-800"
            onClick={() => {
              setSubmissionMode('manual')
              setShowSubmissionForm(true)
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('dashboard.manualEntry')}
          </Button>
          
          {/* Manager-specific actions */}
          {dashboardData.role.manager && (
            <Button
              onClick={() => setActiveTab('approvals')}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {t('dashboard.reviewClaims')}
            </Button>
          )}
          
          {/* Admin-specific actions */}
          {dashboardData.role.admin && (
            <Button
              onClick={() => setActiveTab('reimbursements')}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <FileText className="w-4 h-4 mr-2" />
              {t('dashboard.processPayments')}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards - Common to all roles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title={t('dashboard.totalClaims')}
          value={dashboardData.summary.total_claims.toString()}
          icon={<FileText className="w-5 h-5" />}
          variant="default"
        />
        <SummaryCard
          title={t('dashboard.pendingApproval')}
          value={dashboardData.summary.pending_approval.toString()}
          icon={<Clock className="w-5 h-5" />}
          variant="warning"
        />
        <SummaryCard
          title={t('dashboard.approvedAmount')}
          value={`$${dashboardData.summary.approved_amount.toFixed(2)}`}
          icon={<CheckCircle className="w-5 h-5" />}
          variant="success"
        />
        <SummaryCard
          title={t('dashboard.rejected')}
          value={dashboardData.summary.rejected_count.toString()}
          icon={<XCircle className="w-5 h-5" />}
          variant="error"
        />
      </div>

      {/* Role-Adaptive Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className={`grid w-full ${dashboardData.role.manager || dashboardData.role.admin ? 'grid-cols-3 lg:grid-cols-5' : 'grid-cols-2'} bg-gray-800 border border-gray-700`}>
          <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            {t('overview')}
          </TabsTrigger>
          
          {dashboardData.role.manager && (
            <TabsTrigger value="approvals" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
              {t('navigation.approvals')}
            </TabsTrigger>
          )}
          
          {dashboardData.role.admin && (
            <TabsTrigger value="reimbursements" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              {t('dashboard.reimbursements')}
            </TabsTrigger>
          )}
          
          {(dashboardData.role.manager || dashboardData.role.admin) && (
            <TabsTrigger value="categories" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white">
              {t('navigation.categories')}
            </TabsTrigger>
          )}
          
          <TabsTrigger value="reports" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
            {t('dashboard.reports')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {renderRoleBasedContent()}
        </TabsContent>

        {dashboardData.role.manager && (
          <TabsContent value="approvals" className="space-y-4">
            <ExpenseApprovalDashboard />
          </TabsContent>
        )}

        {dashboardData.role.admin && (
          <TabsContent value="reimbursements" className="space-y-4">
            {/* TODO: Implement ReimbursementQueue component */}
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="p-6">
                <div className="text-center text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-4" />
                  <p>{t('dashboard.reimbursementProcessing')}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {(dashboardData.role.manager || dashboardData.role.admin) && (
          <TabsContent value="categories" className="space-y-4">
            <CategoryManagement userRole={dashboardData.role} />
          </TabsContent>
        )}

        <TabsContent value="reports" className="space-y-4">
          <div className="space-y-6">
            <GoogleSheetsExport userRole={dashboardData.role} />
            <MonthlyReportGenerator />
          </div>
        </TabsContent>
      </Tabs>

      {/* DSPy Expense Submission Flow */}
      {showSubmissionForm && (
        <DSPyExpenseSubmissionFlow
          initialStep={submissionMode === 'manual' ? 'form' : 'upload'}
          onClose={() => {
            setShowSubmissionForm(false)
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
                // document_id removed - using business_purpose_details for file tracking
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
      {showEditModal && editingClaimId ? (
        <ExpenseEditModal
          expenseClaimId={editingClaimId}
          isOpen={showEditModal}
          onClose={handleCloseEditModal}
          onSave={handleEditSave}
        />
      ) : null}
    </div>
  )
}

// Role-specific dashboard content components
function EmployeeDashboardContent({ data, onNewClaim, onEditClaim, t }: { data: DashboardData; onNewClaim: (mode: 'camera' | 'manual') => void; onEditClaim: (claimId: string) => void; t: any }) {
  const tEmployee = useTranslations('expenseClaims.employee');
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Quick Actions */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">{tEmployee('quickActions')}</CardTitle>
          <CardDescription>{tEmployee('submitNewClaims')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={() => onNewClaim('camera')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white justify-start"
          >
            <Camera className="w-4 h-4 mr-2" />
            {t('employee.captureReceiptCamera')}
          </Button>
          <Button
            variant="outline"
            className="w-full border-gray-600 text-gray-300 hover:bg-gray-700 justify-start"
            onClick={() => onNewClaim('manual')}
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('dashboard.manualEntry')}
          </Button>
        </CardContent>
      </Card>

      {/* My Expense Claims with Status Visibility */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {t('employee.myExpenseClaims')}
          </CardTitle>
          <CardDescription>{t('employee.trackApprovalWorkflow')}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recent_claims.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <FileText className="w-12 h-12 mx-auto mb-4" />
              <p>{t('employee.noClaimsYet')}</p>
              <p className="text-sm">{t('employee.submitFirstClaim')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.recent_claims.slice(0, 5).map((claim: any) => (
                <div key={claim.id} className="p-4 bg-gray-700 rounded-lg border border-gray-600">
                  {/* Claim Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <p className="text-white font-medium">
                        {claim.transaction?.description || claim.description || t('expenseClaim')}
                      </p>
                      <p className="text-gray-400 text-sm">
                        {claim.expense_category?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())} • 
                        {new Date(claim.transaction?.transaction_date || claim.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-semibold">
                        {claim.transaction?.original_currency} ${parseFloat(claim.transaction?.original_amount || '0').toFixed(2)}
                      </p>
                      {claim.transaction?.home_currency_amount && claim.transaction.original_amount !== claim.transaction.home_currency_amount && (
                        <p className="text-gray-400 text-sm">
                          ≈ SGD ${parseFloat(claim.transaction.home_currency_amount).toFixed(2)}
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
                          {t('with')} {claim.current_approver_name}
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
                  
                  {/* Action buttons - TEMPORARILY ALWAYS SHOW FOR TESTING */}
                  {true && (
                    <div className="mt-3 flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="text-xs border-gray-600 text-gray-300 hover:bg-gray-600"
                        onClick={() => onEditClaim(claim.id)}
                      >
                        <Edit3 className="w-3 h-3 mr-1" />
                        {t('edit')}
                      </Button>
                      <Button 
                        size="sm"
                        className="text-xs bg-blue-600 hover:bg-blue-700"
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {t('submit')}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              
              {data.recent_claims.length > 5 && (
                <Button variant="ghost" className="w-full text-blue-400 hover:text-blue-300">
                  <FileText className="w-4 h-4 mr-2" />
                  {t('employee.viewAllClaims', { count: data.recent_claims.length })}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ManagerDashboardContent({ data }: { data: DashboardData }) {
  const t = useTranslations('expenseClaims.manager');
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Pending Approvals */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">{t('pendingApprovals')}</CardTitle>
          <CardDescription>{t('claimsAwaitingReview')}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recent_claims.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <Clock className="w-12 h-12 mx-auto mb-4" />
              <p>{t('noPendingApprovals')}</p>
              <p className="text-sm">{t('allClaimsReviewed')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.recent_claims.slice(0, 5).map((claim: any) => (
                <div key={claim.id} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">
                      {claim.employee?.full_name || `Employee ID: ${claim.employee_id}`}
                    </p>
                    <p className="text-gray-400 text-xs">
                      {claim.description || t('expenseClaim')} • 
                      {claim.expense_category?.replace('_', ' ').toUpperCase()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-white text-sm font-medium">
                      ${parseFloat(claim.converted_amount || '0').toFixed(2)} {claim.home_currency}
                    </p>
                    <p className="text-gray-400 text-xs">
                      {new Date(claim.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
              {data.recent_claims.length > 5 && (
                <Button variant="ghost" className="w-full text-blue-400 hover:text-blue-300">
                  {t('viewAllPendingClaims')}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Analytics */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">{t('teamOverview')}</CardTitle>
          <CardDescription>{t('monthlyExpenseTrends')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ExpenseAnalytics scope="department" />
        </CardContent>
      </Card>
    </div>
  )
}

function AdminDashboardContent({ data }: { data: DashboardData }) {
  const t = useTranslations('expenseClaims.admin');
  // Separate personal claims from company claims
  const personalClaims = data.recent_claims.filter((claim: any) => claim._is_personal)
  const companyClaims = data.recent_claims.filter((claim: any) => !claim._is_personal)

  return (
    <div className="grid grid-cols-1 gap-6">
      {/* Personal Claims Section - Show if admin has personal claims */}
      {personalClaims.length > 0 && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <User className="w-5 h-5" />
              {t('myPersonalClaims')}
            </CardTitle>
            <CardDescription>{t('yourOwnClaims')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {personalClaims.slice(0, 3).map((claim: any) => (
                <div key={claim.id} className="p-3 bg-gray-700 rounded-lg border border-gray-600">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="text-white font-medium text-sm">
                        {claim.transaction?.description || claim.description || t('expenseClaim')}
                      </p>
                      <p className="text-gray-400 text-xs">
                        {claim.expense_category?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())} • 
                        {new Date(claim.transaction?.transaction_date || claim.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-semibold text-sm">
                        ${parseFloat(claim.transaction?.home_currency_amount || '0').toFixed(2)}
                      </p>
                      <Badge 
                        className={`text-xs px-2 py-1 ${
                          claim.status_display?.color === 'green' ? 'bg-green-600 text-white' :
                          claim.status_display?.color === 'blue' ? 'bg-blue-600 text-white' :
                          claim.status_display?.color === 'yellow' ? 'bg-yellow-600 text-white' :
                          claim.status_display?.color === 'red' ? 'bg-red-600 text-white' :
                          'bg-gray-600 text-white'
                        }`}
                      >
                        {claim.status_display?.label || claim.status}
                      </Badge>
                    </div>
                  </div>
                  {/* Workflow Progress Bar */}
                  <div className="w-full bg-gray-600 rounded-full h-1.5">
                    <div 
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        claim.status === 'rejected' ? 'bg-red-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${claim.workflow_progress || 0}%` }}
                    />
                  </div>
                </div>
              ))}
              {personalClaims.length > 3 && (
                <Button variant="ghost" className="w-full text-blue-400 hover:text-blue-300 text-sm">
                  {t('viewAllPersonalClaims', { count: personalClaims.length })}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Company-wide content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Reimbursement Queue */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">{t('reimbursementQueue')}</CardTitle>
            <CardDescription>{t('approvedClaimsPayment')}</CardDescription>
          </CardHeader>
          <CardContent>
            {companyClaims.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <CheckCircle className="w-12 h-12 mx-auto mb-4" />
                <p>{t('noPendingReimbursements')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {companyClaims.slice(0, 5).map((claim: any) => (
                <button 
                  key={claim.id} 
                  className="w-full flex items-center justify-between p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={() => {
                    // TODO: Navigate to claim details or open modal
                    console.log('Clicked claim:', claim.id)
                  }}
                >
                  <div className="flex-1 text-left">
                    <p className="text-white text-sm font-medium">
                      {claim.employee?.full_name || `Employee ID: ${claim.employee_id}`}
                    </p>
                    <p className="text-gray-400 text-xs">
                      {claim.employee?.department || t('noDepartment')} • 
                      {claim.transaction?.description || t('expenseClaim')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-white text-sm font-medium">
                      ${parseFloat(claim.transaction?.home_currency_amount || '0').toFixed(2)}
                    </p>
                    <p className="text-green-400 text-xs">
                      {t('approved')} {new Date(claim.approval_date || claim.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </button>
                ))}
                {companyClaims.length > 5 && (
                  <Button variant="ghost" className="w-full text-blue-400 hover:text-blue-300">
                    {t('viewAllReimbursements')}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Company Analytics */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">{t('companyOverview')}</CardTitle>
            <CardDescription>{t('enterpriseExpenseAnalytics')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ExpenseAnalytics scope="company" />
          </CardContent>
        </Card>
      </div>
    </div>
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
function ExpenseDashboardSkeleton() {
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