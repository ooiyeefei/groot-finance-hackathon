/**
 * Enhanced Approval Dashboard Component
 * Dedicated management interface for expense claim approvals and business operations
 * Consolidates manager and admin functionality with full employee selection for reports
 */

'use client'

import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Plus, Camera, FileText, Clock, CheckCircle, XCircle, Edit3, User, BarChart3, Settings, DollarSign, TrendingUp, Eye, Tag, Calendar, X, Loader2, AlertCircle, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import DuplicateBadge from './duplicate-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatBusinessDate } from '@/lib/utils'
import { formatNumber } from '@/lib/utils/format-number'
import { useExpenseCategories, getCategoryName, type DynamicExpenseCategory } from '../hooks/use-expense-categories'

// PERFORMANCE OPTIMIZATION: Dynamic imports for heavy components (only load when needed)
const ExpenseAnalytics = lazy(() => import('./expense-analytics'))
const MonthlyReportGenerator = lazy(() => import('./monthly-report-generator'))
const GoogleSheetsExport = lazy(() => import('./google-sheets-export'))
const DocumentPreviewWithAnnotations = lazy(() => import('@/domains/invoices/components/document-preview-with-annotations'))
const UnifiedExpenseDetailsModal = lazy(() => import('./unified-expense-details-modal'))
const MobileApprovalList = lazy(() => import('./mobile-approval-list'))

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
  const [activeTab, setActiveTab] = useState('overview')
  const [dashboardData, setDashboardData] = useState<ManagementDashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch expense categories for displaying category names instead of IDs
  const { categories } = useExpenseCategories({ includeDisabled: true })

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

      {/* Management Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-card-gap">
        <ManagementSummaryCard
          title="Pending Approvals"
          value={dashboardData?.summary?.pending_approval?.toString() || '0'}
          icon={<Clock className="w-5 h-5" />}
          variant="warning"
        />
        <ManagementSummaryCard
          title="Approved Amount"
          value={`$${(dashboardData?.summary?.approved_amount || 0).toFixed(2)}`}
          icon={<CheckCircle className="w-5 h-5" />}
          variant="success"
        />
        <ManagementSummaryCard
          title="Total Claims"
          value={dashboardData?.summary?.total_claims?.toString() || '0'}
          icon={<User className="w-5 h-5" />}
          variant="default"
        />
        <ManagementSummaryCard
          title="Rejected Claims"
          value={dashboardData?.summary?.rejected_count?.toString() || '0'}
          icon={<XCircle className="w-5 h-5" />}
          variant="error"
        />
      </div>

      {/* Management Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto p-1 gap-1 bg-muted border border-border relative z-10">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Overview
          </TabsTrigger>
          <TabsTrigger value="approvals" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Approvals
          </TabsTrigger>
          {dashboardData?.role?.finance_admin && (
            <TabsTrigger value="reimbursements" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Reimbursements
            </TabsTrigger>
          )}
          <TabsTrigger value="reports" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <ManagementOverviewContent data={dashboardData} categories={categories} setActiveTab={setActiveTab} />
        </TabsContent>

        <TabsContent value="approvals" className="space-y-4">
          <ApprovalTabContent data={dashboardData} onRefreshNeeded={fetchDashboardData} />
        </TabsContent>

        {dashboardData?.role?.finance_admin && (
          <TabsContent value="reimbursements" className="space-y-4">
            <ReimbursementQueueContent data={dashboardData} onRefreshNeeded={fetchDashboardData} />
          </TabsContent>
        )}

        <TabsContent value="reports" className="space-y-4">
          <ManagementReportsContent userRole={dashboardData?.role || { employee: true, manager: false, finance_admin: false }} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Management Overview Content - 2:1 layout with Company Analytics (left, 2/3) and Priority Approvals (right, 1/3)
function ManagementOverviewContent({ data, categories, setActiveTab }: {
  data: ManagementDashboardData
  categories: DynamicExpenseCategory[]
  setActiveTab: (tab: string) => void
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-card-gap">
      {/* Company Analytics - Left side, takes 2/3 width */}
      <div className="lg:col-span-2">
        <Card className="bg-record-layer-1 border-record-border h-full">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Company Analytics
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
            {(data?.recent_claims || []).filter(claim => claim.status === 'submitted').length === 0 ? (
              <div className="text-center text-muted-foreground py-6">
                <CheckCircle className="w-8 h-8 mx-auto mb-3" />
                <p className="text-sm">No pending approvals</p>
                <p className="text-xs">All claims reviewed</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(data?.recent_claims || []).filter(claim => claim.status === 'submitted').slice(0, 6).map((claim: any) => (
                  <button
                    key={claim.id}
                    className="w-full flex items-center justify-between p-2 bg-record-layer-2 rounded-md hover:bg-accent transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
                    onClick={() => {
                      setActiveTab('approvals')
                    }}
                  >
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-foreground text-xs font-medium truncate">
                        {claim.employee?.full_name || `Employee ID: ${claim.employee_id}`}
                      </p>
                      <p className="text-muted-foreground text-xs truncate">
                        {claim.description?.length > 20
                          ? `${claim.description?.substring(0, 20)}...`
                          : claim.description
                        }
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {getCategoryName(claim.expense_category, categories)}
                      </p>
                    </div>
                    <div className="text-right ml-2">
                      <p className="text-foreground text-xs font-medium">
                        ${parseFloat(claim.home_currency_amount || claim.total_amount || '0').toFixed(0)}
                      </p>
                      <div className="flex items-center justify-end gap-1">
                        {!claim.reference_number && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30" title="No receipt reference number">
                            <AlertCircle className="w-2.5 h-2.5" />
                            No Ref
                          </span>
                        )}
                        {claim.duplicateStatus && claim.duplicateStatus !== 'none' && (
                          <DuplicateBadge
                            matchTier={claim.duplicateStatus === 'potential' ? 'strong' : 'exact'}
                            size="sm"
                            showTooltip={false}
                          />
                        )}
                        <p className="text-warning-foreground text-xs">
                          {new Date(claim.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
                {(data?.recent_claims || []).filter(claim => claim.status === 'submitted').length > 6 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-primary hover:text-primary/80 text-xs"
                    onClick={() => setActiveTab('approvals')}
                  >
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Review all {(data?.recent_claims || []).filter(claim => claim.status === 'submitted').length}
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
  const handleExportList = () => {
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
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `reimbursement-queue-${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
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

// Management Reports Content - Full employee selection
function ManagementReportsContent({ userRole }: { userRole: UserRole }) {
  return (
    <div className="space-y-section-gap">
      {/* Duplicate Expense Report - Audit Compliance Card */}
      <Card className="bg-record-layer-1 border-record-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Copy className="w-5 h-5" />
            Duplicate Expense Report
          </CardTitle>
          <CardDescription>Review and manage potential duplicate expense claims for audit compliance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-record-layer-2 rounded-lg">
            <div className="space-y-1">
              <p className="text-foreground font-medium">View Duplicate Report</p>
              <p className="text-muted-foreground text-sm">
                Analyze duplicate matches, dismiss false positives, or confirm duplicates
              </p>
            </div>
            <a
              href="/expense-claims/duplicate-report"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open Report
            </a>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-record-layer-1 border-record-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Management Reports
          </CardTitle>
          <CardDescription>Generate comprehensive expense reports with full employee selection</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="flex items-center justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
            <MonthlyReportGenerator personalOnly={false} />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="bg-record-layer-1 border-record-border">
        <CardHeader>
          <CardTitle className="text-foreground">Export & Integration</CardTitle>
          <CardDescription>Export data to external systems</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="flex items-center justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
            <GoogleSheetsExport userRole={userRole} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
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

// Approval Tab Content - Responsive: mobile list on small screens, desktop grid on larger
function ApprovalTabContent({ data, onRefreshNeeded }: {
  data: ManagementDashboardData
  onRefreshNeeded: () => void
}) {
  return (
    <div className="space-y-section-gap">
      {/* Mobile: Use MobileApprovalList with swipe gestures */}
      <div className="sm:hidden">
        <Suspense fallback={<div className="flex items-center justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
          <MobileApprovalList onRefreshNeeded={onRefreshNeeded} />
        </Suspense>
      </div>

      {/* Desktop: Use standard ApprovalsList with grid layout */}
      <div className="hidden sm:block">
        <ApprovalsList onRefreshNeeded={onRefreshNeeded} />
      </div>
    </div>
  )
}

// Streamlined Approvals List Component - Core approval functionality without nested UI
function ApprovalsList({ onRefreshNeeded }: { onRefreshNeeded: () => void }) {
  const [claims, setClaims] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processingClaims, setProcessingClaims] = useState<Set<string>>(new Set())
  const [selectedClaim, setSelectedClaim] = useState<any | null>(null)
  const [approvalNotes, setApprovalNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Fetch expense categories for displaying category names instead of IDs
  const { categories } = useExpenseCategories({ includeDisabled: true })


  useEffect(() => {
    fetchPendingClaims()
  }, [])

  const fetchPendingClaims = async () => {
    try {
      setLoading(true)
      // Only fetch claims that are submitted and pending approval
      const response = await fetch('/api/v1/expense-claims?approver=me&status=submitted')

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.success) {
        // Filter to only show submitted claims (double-check on client side)
        const submittedClaims = (result.data.claims || []).filter((claim: any) => claim.status === 'submitted')
        setClaims(submittedClaims)
        setError(null)
      } else {
        console.error('[ApprovalsList] API error:', result.error)
        setError(result.error || 'Failed to fetch pending claims')
      }
    } catch (error) {
      console.error('[ApprovalsList] Network error:', error)
      setError(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleApproval = async (claimId: string, action: 'approve' | 'reject', notes?: string) => {
    try {
      setProcessingClaims(prev => new Set([...prev, claimId]))

      const response = await fetch(`/api/v1/expense-claims/${claimId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action === 'approve' ? 'approved' : 'rejected', comment: notes })
      })

      const result = await response.json()

      if (result.success) {
        await fetchPendingClaims()
        setSelectedClaim(null)
        setApprovalNotes('')
        // Notify parent component to refresh dashboard data for cross-tab synchronization
        onRefreshNeeded()
      } else {
        setError(result.error || `Failed to ${action} claim`)
      }
    } catch (error) {
      console.error(`Failed to ${action} claim:`, error)
      setError(`Network error while ${action === 'approve' ? 'approving' : 'rejecting'} claim`)
    } finally {
      setProcessingClaims(prev => {
        const newSet = new Set(prev)
        newSet.delete(claimId)
        return newSet
      })
    }
  }

  if (loading) {
    return (
      <Card className="bg-record-layer-1 border-record-border">
        <CardContent className="p-12 text-center">
          <Clock className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading expense approvals...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="bg-record-layer-1 border-record-border">
        <CardContent className="p-12 text-center">
          <XCircle className="w-8 h-8 mx-auto mb-4 text-danger" />
          <p className="text-danger">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (claims.length === 0) {
    return (
      <Card className="bg-green-50 dark:bg-gray-800 dark:bg-green-900/10 border border-green-200 dark:border-green-700/50">
        <CardContent className="p-12 text-center">
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-success" />
          <h3 className="text-xl font-semibold text-green-900 dark:text-white mb-2">All Caught Up!</h3>
          <p className="text-green-700 dark:text-gray-300">No expense claims pending your approval.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Claims Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-card-gap">
        {claims.map((claim) => {
          const isProcessing = processingClaims.has(claim.id)

          return (
            <Card key={claim.id} className="bg-record-layer-1 border-0 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-foreground text-lg">{claim.description}</CardTitle>
                    <CardDescription>
                      By {claim.employee?.full_name || 'Unknown'} • {claim.submitted_at ? formatBusinessDate(claim.submitted_at) : 'Not submitted'}
                    </CardDescription>
                  </div>
                  <Badge variant="success">
                    {claim.status.replace('_', ' ')}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Amount and Category */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground font-semibold">
                      {formatNumber(claim.total_amount, 2)} {claim.currency}
                    </span>
                    {claim.home_currency_amount &&
                     claim.currency !== claim.home_currency &&
                     parseFloat(String(claim.home_currency_amount)) !== parseFloat(String(claim.total_amount || '0')) && (
                      <span className="text-muted-foreground text-sm">
                        (≈ {claim.home_currency} {formatNumber(claim.home_currency_amount, 2)})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">
                      {getCategoryName(claim.expense_category, categories)}
                    </span>
                  </div>
                </div>

                {/* Vendor and Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{claim.vendor_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-foreground" />
                    <span className="text-foreground">
                      {formatBusinessDate(claim.transaction_date)}
                    </span>
                  </div>
                </div>

                {/* Business Purpose */}
                <div>
                  <p className="text-muted-foreground text-sm">Business Purpose:</p>
                  <p className="text-foreground">{claim.business_purpose}</p>
                </div>

                {/* Missing Reference Number Warning */}
                {!claim.reference_number && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/30">
                    <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      No receipt reference number provided - verify receipt authenticity
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <Button
                    size="sm"
                    onClick={() => setSelectedClaim(claim)}
                    variant="primary"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Review
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => handleApproval(claim.id, 'approve')}
                    disabled={isProcessing}
                    variant="success"
                  >
                    {isProcessing ? (
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    )}
                    Approve
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => handleApproval(claim.id, 'reject')}
                    disabled={isProcessing}
                    variant="destructive"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Unified Expense Details Modal - Manager View */}
      {selectedClaim && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"><Loader2 className="w-8 h-8 animate-spin text-primary-foreground" /></div>}>
          <UnifiedExpenseDetailsModal
            claimId={selectedClaim.id}
            isOpen={Boolean(selectedClaim)}
            onClose={() => {
              setSelectedClaim(null)
              setApprovalNotes('')
            }}
            viewMode="manager"
            onApprove={async (claimId: string, notes?: string) => {
              await handleApproval(claimId, 'approve', notes)
            }}
            onReject={async (claimId: string, notes?: string) => {
              await handleApproval(claimId, 'reject', notes)
            }}
            onRefreshNeeded={() => {
              fetchPendingClaims()
              if (onRefreshNeeded) {
                onRefreshNeeded()
              }
            }}
          />
        </Suspense>
      )}

    </>
  )
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