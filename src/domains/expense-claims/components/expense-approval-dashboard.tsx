/**
 * Enhanced Approval Dashboard Component
 * Dedicated management interface for expense claim approvals and business operations
 * Consolidates manager and admin functionality with full employee selection for reports
 */

'use client'

import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Clock, CheckCircle, BarChart3, DollarSign, Loader2, Send, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useActiveBusiness } from '@/contexts/business-context'
import { usePendingApprovals, useManagerSubmissions } from '../hooks/use-expense-submissions'
import { Badge } from '@/components/ui/badge'

// PERFORMANCE OPTIMIZATION: Dynamic imports for heavy components (only load when needed)
const ExpenseAnalytics = lazy(() => import('./expense-analytics'))
const LeaveApprovalsContent = lazy(() => import('@/domains/leave-management/components/leave-approvals-content'))
const TimesheetApprovalsContent = lazy(() => import('@/domains/timesheet-attendance/components/timesheet-approvals-content'))
const PaymentProcessingTab = lazy(() => import('./payment-processing-tab'))

interface EnhancedApprovalDashboardProps {
  userId: string
}

interface UserRole {
  employee: boolean
  manager: boolean
  finance_admin: boolean
}

interface ManagementDashboardData {
  role: UserRole
  summary: {
    total_claims: number
    pending_approval: number
    approved_amount: number
    rejected_count: number
  }
  recent_claims: any[]
}

export default function EnhancedApprovalDashboard({ userId }: EnhancedApprovalDashboardProps) {
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const [activeTab, setActiveTab] = useState('overview')
  const [dashboardData, setDashboardData] = useState<ManagementDashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch submission approvals (pending + full history)
  const { businessId } = useActiveBusiness()
  const { submissions: pendingSubmissions, isLoading: pendingSubmissionsLoading } = usePendingApprovals(businessId || '')
  const { submissions: allManagerSubmissions, isLoading: allSubmissionsLoading } = useManagerSubmissions(businessId || '')

  // Fetch management dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/v1/expense-claims?approver=me', {
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
        throw new Error(result.error || 'Failed to fetch management dashboard data')
      }
    } catch (error) {
      console.error('Failed to fetch management dashboard data:', error)
      // Set minimal fallback data
      setDashboardData({
        role: { employee: true, manager: true, finance_admin: false },
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

  if (loading) {
    return <ManagementDashboardSkeleton />
  }

  if (!dashboardData) {
    return <div className="text-center text-muted-foreground p-8">Failed to load management dashboard data</div>
  }

  return (
    <div className="space-y-section-gap">

      {/* Management Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className={`grid w-full h-auto p-1 gap-1 bg-muted border border-border relative z-10 ${dashboardData?.role?.finance_admin ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'}`}>
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Overview
          </TabsTrigger>
          <TabsTrigger value="approvals" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Expenses
          </TabsTrigger>
          <TabsTrigger value="leave-requests" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Leave
          </TabsTrigger>
          <TabsTrigger value="timesheets" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Timesheets
          </TabsTrigger>
          {dashboardData?.role?.finance_admin && (
            <TabsTrigger value="reimbursements" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Reimburse
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <ManagementOverviewContent data={dashboardData} setActiveTab={setActiveTab} pendingSubmissions={pendingSubmissions} pendingSubmissionsLoading={pendingSubmissionsLoading} locale={locale} />
        </TabsContent>

        <TabsContent value="approvals" className="space-y-4">
          {/* Pending Submission Approvals */}
          {pendingSubmissions.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-foreground flex items-center gap-2 text-lg">
                  <Send className="w-4 h-4" />
                  Pending Submissions ({pendingSubmissions.length})
                </CardTitle>
                <CardDescription className="text-sm">Batch expense submissions awaiting your approval</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pendingSubmissions.map((sub: any) => (
                    <div
                      key={sub._id}
                      className="flex items-center justify-between p-3 rounded-md border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/${locale}/manager/approvals/submissions/${sub._id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{sub.title}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {sub.claimCount || 0} claims
                          </span>
                          {sub.submitterName && (
                            <span className="text-xs text-muted-foreground">by {sub.submitterName}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {pendingSubmissions.length === 0 && !pendingSubmissionsLoading && (
            <Card className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-700/50">
              <CardContent className="p-8 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                <h3 className="text-lg font-semibold text-green-900 dark:text-white mb-1">All Caught Up!</h3>
                <p className="text-sm text-green-700 dark:text-gray-300">No expense submissions pending your approval.</p>
              </CardContent>
            </Card>
          )}

          {/* Submission History (approved, rejected, reimbursed) */}
          {(() => {
            const historySubmissions = allManagerSubmissions.filter(
              (s: any) => s.status !== 'submitted'
            )
            if (allSubmissionsLoading || historySubmissions.length === 0) return null
            return (
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-foreground flex items-center gap-2 text-lg">
                    <Clock className="w-4 h-4" />
                    Submission History ({historySubmissions.length})
                  </CardTitle>
                  <CardDescription className="text-sm">Previously reviewed submissions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {historySubmissions.map((sub: any) => (
                      <div
                        key={sub._id}
                        className="flex items-center justify-between p-3 rounded-md border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => router.push(`/${locale}/manager/approvals/submissions/${sub._id}`)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{sub.title}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {sub.claimCount || 0} claims
                            </span>
                            {sub.submitterName && (
                              <span className="text-xs text-muted-foreground">by {sub.submitterName}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <SubmissionStatusBadge status={sub.status} />
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })()}
        </TabsContent>

        <TabsContent value="leave-requests" className="space-y-4">
          <Suspense fallback={
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          }>
            <LeaveApprovalsContent onRefreshNeeded={fetchDashboardData} />
          </Suspense>
        </TabsContent>

        <TabsContent value="timesheets" className="space-y-4">
          <Suspense fallback={
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          }>
            <TimesheetApprovalsContent onRefreshNeeded={fetchDashboardData} />
          </Suspense>
        </TabsContent>

        {dashboardData?.role?.finance_admin && (
          <TabsContent value="reimbursements" className="space-y-4">
            <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
              <PaymentProcessingTab />
            </Suspense>
          </TabsContent>
        )}

      </Tabs>
    </div>
  )
}

// Management Overview Content - 2:1 layout with Company Analytics (left, 2/3) and Priority Approvals (right, 1/3)
function ManagementOverviewContent({ data, setActiveTab, pendingSubmissions, pendingSubmissionsLoading, locale }: {
  data: ManagementDashboardData
  setActiveTab: (tab: string) => void
  pendingSubmissions: any[]
  pendingSubmissionsLoading: boolean
  locale: string
}) {
  const router = useRouter()
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-card-gap">
      {/* Company Analytics - Left side, takes 2/3 width */}
      <div className="lg:col-span-2">
        <Card className="bg-record-layer-1 border-record-border h-full">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              {data?.role?.finance_admin ? 'Company Analytics' : 'Team Analytics'}
            </CardTitle>
            <CardDescription>Real-time expense insights</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="flex items-center justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
              <ExpenseAnalytics scope={data?.role?.finance_admin ? "company" : "department"} />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      {/* Priority Approvals Queue - Right side, takes 1/3 width, more compact */}
      <div className="lg:col-span-1">
        <Card className="bg-record-layer-1 border-record-border h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-foreground flex items-center gap-2 text-lg">
              <Clock className="w-4 h-4" />
              Priority Approvals
            </CardTitle>
            <CardDescription className="text-sm">Claims requiring immediate attention</CardDescription>
          </CardHeader>
          <CardContent className="p-card-padding">
            {pendingSubmissionsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : pendingSubmissions.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle className="w-8 h-8 mx-auto mb-3 text-green-500" />
                <p className="text-sm text-green-700 dark:text-green-400">No pending approvals</p>
                <p className="text-xs text-green-600 dark:text-green-500">All submissions reviewed</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingSubmissions.slice(0, 6).map((sub: any) => (
                  <button
                    key={sub._id}
                    className="w-full flex items-center justify-between p-2 bg-record-layer-2 rounded-md hover:bg-accent transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
                    onClick={() => router.push(`/${locale}/manager/approvals/submissions/${sub._id}`)}
                  >
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-foreground text-xs font-medium truncate">
                        {sub.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-muted-foreground text-xs">
                          {sub.claimCount || 0} claims
                        </span>
                        {sub.submitterName && (
                          <span className="text-muted-foreground text-xs">by {sub.submitterName}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0 ml-2" />
                  </button>
                ))}
                {pendingSubmissions.length > 6 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-primary hover:text-primary/80 text-xs"
                    onClick={() => setActiveTab('approvals')}
                  >
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Review all {pendingSubmissions.length}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Reimbursement Queue Content (Admin Only)
function ReimbursementQueueContent({
  data,
  onRefreshNeeded
}: {
  data: ManagementDashboardData
  onRefreshNeeded: () => void
}) {
  // State for tracking selected claims
  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(new Set())
  const [isProcessing, setIsProcessing] = useState(false)

  // Get approved claims for reimbursement
  const approvedClaims = (data?.recent_claims || []).filter(claim => claim.status === 'approved')

  // Handle Select All checkbox
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Select all approved claims
      const allIds = new Set(approvedClaims.map((claim: any) => claim.id))
      setSelectedClaims(allIds)
    } else {
      // Deselect all
      setSelectedClaims(new Set())
    }
  }

  // Handle individual claim selection
  const handleSelectClaim = (claimId: string, checked: boolean) => {
    setSelectedClaims(prev => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(claimId)
      } else {
        newSet.delete(claimId)
      }
      return newSet
    })
  }

  // Check if all claims are selected
  const isAllSelected = approvedClaims.length > 0 && selectedClaims.size === approvedClaims.length

  // Handle individual reimbursement processing
  const handleReimbursement = async (claimId: string) => {
    try {
      const response = await fetch(`/api/v1/expense-claims/${claimId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'reimbursed',
          comment: 'Processed by admin via reimbursement queue'
        })
      })

      const result = await response.json()

      if (result.success) {
        // Remove from selection and refresh data
        setSelectedClaims(prev => {
          const newSet = new Set(prev)
          newSet.delete(claimId)
          return newSet
        })
        onRefreshNeeded()
      } else {
        console.error('Failed to process reimbursement:', result.error)
        alert(`Failed to process reimbursement: ${result.error}`)
      }
    } catch (error) {
      console.error('Network error processing reimbursement:', error)
      alert('Network error while processing reimbursement')
    }
  }

  // Handle bulk processing of selected claims
  const handleProcessSelected = async () => {
    if (selectedClaims.size === 0) {
      alert('Please select at least one claim to process')
      return
    }

    setIsProcessing(true)
    const claimIds = Array.from(selectedClaims)
    let successCount = 0
    let failCount = 0

    try {
      // Process each selected claim sequentially
      for (const claimId of claimIds) {
        try {
          const response = await fetch(`/api/v1/expense-claims/${claimId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'reimbursed',
              comment: 'Bulk processed by admin via reimbursement queue'
            })
          })

          const result = await response.json()
          if (result.success) {
            successCount++
          } else {
            failCount++
            console.error(`Failed to process claim ${claimId}:`, result.error)
          }
        } catch (error) {
          failCount++
          console.error(`Network error processing claim ${claimId}:`, error)
        }
      }

      // Clear selection and refresh
      setSelectedClaims(new Set())
      onRefreshNeeded()

      // Show result summary
      if (failCount === 0) {
        alert(`Successfully processed ${successCount} claim(s)`)
      } else {
        alert(`Processed ${successCount} claim(s). Failed: ${failCount}`)
      }
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle export to CSV
  const handleExportList = async () => {
    if (approvedClaims.length === 0) {
      alert('No claims to export')
      return
    }

    // Build CSV content
    const headers = ['Employee Name', 'Department', 'Description', 'Amount', 'Currency', 'Approved Date', 'Claim ID']
    const rows = approvedClaims.map((claim: any) => [
      claim.employee?.full_name || `Employee ID: ${claim.employee_id}`,
      claim.employee?.department || 'No Department',
      claim.description || 'Expense Claim',
      parseFloat(claim.home_currency_amount || claim.total_amount || '0').toFixed(2),
      claim.home_currency || claim.currency || 'USD',
      new Date(claim.approval_date || claim.created_at).toLocaleDateString(),
      claim.id
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const { downloadBlob } = await import('@/lib/capacitor/native-download')
    await downloadBlob(blob, `reimbursement-queue-${new Date().toISOString().split('T')[0]}.csv`)
  }

  return (
    <Card className="bg-record-layer-1 border-record-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Reimbursement Processing
        </CardTitle>
        <CardDescription>Approved claims ready for payment processing</CardDescription>
      </CardHeader>
      <CardContent>
        {approvedClaims.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <CheckCircle className="w-12 h-12 mx-auto mb-4" />
            <p>No pending reimbursements</p>
            <p className="text-sm">All approved claims have been processed</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Bulk Actions */}
            <div className="flex items-center justify-between p-4 bg-record-layer-2 rounded-lg">
              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  className="rounded border h-4 w-4 cursor-pointer"
                  checked={isAllSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
                <span className="text-foreground font-medium">
                  {selectedClaims.size > 0
                    ? `${selectedClaims.size} of ${approvedClaims.length} selected`
                    : `Select All (${approvedClaims.length} claims)`
                  }
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="success"
                  onClick={handleProcessSelected}
                  disabled={selectedClaims.size === 0 || isProcessing}
                >
                  {isProcessing ? (
                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <DollarSign className="w-4 h-4 mr-2" />
                  )}
                  Process Selected ({selectedClaims.size})
                </Button>
                <Button size="sm" variant="primary" onClick={handleExportList}>
                  Export List
                </Button>
              </div>
            </div>

            {/* Reimbursement Items */}
            <div className="space-y-2">
              {approvedClaims.map((claim: any) => (
                <div key={claim.id} className="flex items-center gap-4 p-3 bg-record-layer-2 rounded-lg hover:bg-accent transition-colors">
                  <input
                    type="checkbox"
                    className="rounded border h-4 w-4 cursor-pointer"
                    checked={selectedClaims.has(claim.id)}
                    onChange={(e) => handleSelectClaim(claim.id, e.target.checked)}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-foreground font-medium text-sm">
                          {claim.employee?.full_name || `Employee ID: ${claim.employee_id}`}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {claim.employee?.department || 'No Department'} •
                          {claim.description || 'Expense Claim'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-foreground font-semibold">
                          ${parseFloat(claim.home_currency_amount || claim.total_amount || '0').toFixed(2)}
                        </p>
                        <p className="text-success-foreground text-xs">
                          Approved {new Date(claim.approval_date || claim.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => handleReimbursement(claim.id)}
                  >
                    Process
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Management summary card component with layer1-2-3 semantic design system
function ManagementSummaryCard({ title, value, icon, variant }: {
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



// Status badge for submission history
function SubmissionStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    approved: { label: 'Approved', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    reimbursed: { label: 'Reimbursed', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    draft: { label: 'Draft', className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' },
  }
  const { label, className } = config[status] || { label: status, className: 'bg-gray-100 text-gray-800' }
  return <Badge variant="outline" className={`text-xs px-2 py-0.5 border-0 ${className}`}>{label}</Badge>
}

// Loading skeleton
function ManagementDashboardSkeleton() {
  return (
    <div className="space-y-section-gap">
      <div className="animate-pulse">
        <div className="h-8 bg-record-layer-2 rounded-lg w-1/3 mb-2"></div>
        <div className="h-4 bg-record-layer-2 rounded w-1/2"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-card-gap">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-record-layer-1 border-record-border rounded-lg p-6 animate-pulse">
            <div className="h-4 bg-record-layer-2 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-record-layer-2 rounded w-1/3"></div>
          </div>
        ))}
      </div>

      <div className="bg-record-layer-1 border-record-border rounded-lg p-6 animate-pulse">
        <div className="h-64 bg-record-layer-2 rounded"></div>
      </div>
    </div>
  )
}