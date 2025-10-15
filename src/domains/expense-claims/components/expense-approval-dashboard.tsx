/**
 * Enhanced Approval Dashboard Component
 * Dedicated management interface for expense claim approvals and business operations
 * Consolidates manager and admin functionality with full employee selection for reports
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Camera, FileText, Clock, CheckCircle, XCircle, Edit3, User, BarChart3, Settings, DollarSign, TrendingUp, Eye, Tag, Calendar, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import ExpenseAnalytics from './expense-analytics'
import MonthlyReportGenerator from './monthly-report-generator'
import GoogleSheetsExport from './google-sheets-export'
import DocumentPreviewWithAnnotations from '@/domains/invoices/components/document-preview-with-annotations'
import UnifiedExpenseDetailsModal from './unified-expense-details-modal'

interface EnhancedApprovalDashboardProps {
  userId: string
}

interface UserRole {
  employee: boolean
  manager: boolean
  admin: boolean
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
        role: { employee: true, manager: true, admin: false },
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
    return <div className="text-center text-gray-400 p-8">Failed to load management dashboard data</div>
  }

  return (
    <div className="space-y-6">

      {/* Management Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
      <Tabs value={activeTab} onValueChange={(value) => {
        setActiveTab(value)
        // Refresh dashboard data when switching to reimbursement tab to show newly approved claims
        if (value === 'reimbursements') {
          fetchDashboardData()
        }
      }} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 bg-gray-800 border border-gray-700">
          <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            Overview
          </TabsTrigger>
          <TabsTrigger value="approvals" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
            Approvals
          </TabsTrigger>
          {dashboardData?.role?.admin && (
            <TabsTrigger value="reimbursements" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              Reimbursements
            </TabsTrigger>
          )}
          <TabsTrigger value="reports" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <ManagementOverviewContent data={dashboardData} setActiveTab={setActiveTab} />
        </TabsContent>

        <TabsContent value="approvals" className="space-y-4">
          <ApprovalTabContent data={dashboardData} onRefreshNeeded={fetchDashboardData} />
        </TabsContent>

        {dashboardData?.role?.admin && (
          <TabsContent value="reimbursements" className="space-y-4">
            <ReimbursementQueueContent data={dashboardData} />
          </TabsContent>
        )}

        <TabsContent value="reports" className="space-y-4">
          <ManagementReportsContent userRole={dashboardData?.role || { employee: true, manager: false, admin: false }} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Management Overview Content - 2:1 layout with Company Analytics (left, 2/3) and Priority Approvals (right, 1/3)
function ManagementOverviewContent({ data, setActiveTab }: {
  data: ManagementDashboardData
  setActiveTab: (tab: string) => void
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Company Analytics - Left side, takes 2/3 width */}
      <div className="lg:col-span-2">
        <Card className="bg-gray-800 border-gray-700 h-full">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Company Analytics
            </CardTitle>
            <CardDescription>Real-time expense insights</CardDescription>
          </CardHeader>
          <CardContent>
            <ExpenseAnalytics scope={data?.role?.admin ? "company" : "department"} />
          </CardContent>
        </Card>
      </div>

      {/* Priority Approvals Queue - Right side, takes 1/3 width, more compact */}
      <div className="lg:col-span-1">
        <Card className="bg-gray-800 border-gray-700 h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-lg">
              <Clock className="w-4 h-4" />
              Priority Approvals
            </CardTitle>
            <CardDescription className="text-sm">Claims requiring immediate attention</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {(data?.recent_claims || []).filter(claim => claim.status === 'submitted').length === 0 ? (
              <div className="text-center text-gray-400 py-6">
                <CheckCircle className="w-8 h-8 mx-auto mb-3" />
                <p className="text-sm">No pending approvals</p>
                <p className="text-xs">All claims reviewed</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(data?.recent_claims || []).filter(claim => claim.status === 'submitted').slice(0, 6).map((claim: any) => (
                  <button
                    key={claim.id}
                    className="w-full flex items-center justify-between p-2 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
                    onClick={() => {
                      setActiveTab('approvals')
                    }}
                  >
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-white text-xs font-medium truncate">
                        {claim.employee?.full_name || `Employee ID: ${claim.employee_id}`}
                      </p>
                      <p className="text-gray-400 text-xs truncate">
                        {claim.description?.length > 20
                          ? `${claim.description?.substring(0, 20)}...`
                          : claim.description
                        }
                      </p>
                      <p className="text-gray-500 text-xs">
                        {claim.expense_category?.replace('_', ' ').split(' ').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                      </p>
                    </div>
                    <div className="text-right ml-2">
                      <p className="text-white text-xs font-medium">
                        ${parseFloat(claim.home_currency_amount || claim.total_amount || '0').toFixed(0)}
                      </p>
                      <p className="text-yellow-400 text-xs">
                        {new Date(claim.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  </button>
                ))}
                {(data?.recent_claims || []).filter(claim => claim.status === 'submitted').length > 6 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-green-400 hover:text-green-300 text-xs"
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
function ReimbursementQueueContent({ data }: { data: ManagementDashboardData }) {
  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Reimbursement Processing
        </CardTitle>
        <CardDescription>Approved claims ready for payment processing</CardDescription>
      </CardHeader>
      <CardContent>
        {(data?.recent_claims || []).filter(claim => claim.status === 'approved').length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <CheckCircle className="w-12 h-12 mx-auto mb-4" />
            <p>No pending reimbursements</p>
            <p className="text-sm">All approved claims have been processed</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Bulk Actions */}
            <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
              <div className="flex items-center gap-4">
                <input type="checkbox" className="rounded border-gray-600" />
                <span className="text-white font-medium">Select All ({(data?.recent_claims || []).filter(claim => claim.status === 'approved').length} claims)</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                  <DollarSign className="w-4 h-4 mr-2" />
                  Process Selected
                </Button>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                  Export List
                </Button>
              </div>
            </div>

            {/* Reimbursement Items */}
            <div className="space-y-2">
              {(data?.recent_claims || []).filter(claim => claim.status === 'approved').map((claim: any) => (
                <div key={claim.id} className="flex items-center gap-4 p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">
                  <input type="checkbox" className="rounded border-gray-600" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium text-sm">
                          {claim.employee?.full_name || `Employee ID: ${claim.employee_id}`}
                        </p>
                        <p className="text-gray-400 text-xs">
                          {claim.employee?.department || 'No Department'} •
                          {claim.description || 'Expense Claim'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-white font-semibold">
                          ${parseFloat(claim.home_currency_amount || claim.total_amount || '0').toFixed(2)}
                        </p>
                        <p className="text-green-400 text-xs">
                          Approved {new Date(claim.approval_date || claim.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
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
    <div className="space-y-6">
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Management Reports
          </CardTitle>
          <CardDescription>Generate comprehensive expense reports with full employee selection</CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyReportGenerator personalOnly={false} />
        </CardContent>
      </Card>

      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Export & Integration</CardTitle>
          <CardDescription>Export data to external systems</CardDescription>
        </CardHeader>
        <CardContent>
          <GoogleSheetsExport userRole={userRole} />
        </CardContent>
      </Card>
    </div>
  )
}

// Management summary card component
function ManagementSummaryCard({ title, value, icon, variant }: {
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

// Approval Tab Content - Just the approval list without duplicate stats
function ApprovalTabContent({ data, onRefreshNeeded }: {
  data: ManagementDashboardData
  onRefreshNeeded: () => void
}) {
  return (
    <div className="space-y-6">
      {/* Just the approval list - stats are already shown above */}
      <ApprovalsList onRefreshNeeded={onRefreshNeeded} />
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


  useEffect(() => {
    fetchPendingClaims()
  }, [])

  const fetchPendingClaims = async () => {
    try {
      setLoading(true)
      console.log('[ApprovalsList] Fetching pending claims...')
      // Only fetch claims that are submitted and pending approval
      const response = await fetch('/api/v1/expense-claims?approver=me&status=submitted')

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      console.log('[ApprovalsList] API response:', result)

      if (result.success) {
        // Filter to only show submitted claims (double-check on client side)
        const submittedClaims = (result.data.claims || []).filter((claim: any) => claim.status === 'submitted')
        console.log('[ApprovalsList] Found submitted claims:', submittedClaims.length)
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

      console.log(`[ApprovalsList] ${action}ing claim ${claimId} with notes:`, notes)
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
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-12 text-center">
          <Clock className="w-8 h-8 mx-auto mb-4 animate-spin text-blue-400" />
          <p className="text-gray-400">Loading expense approvals...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-12 text-center">
          <XCircle className="w-8 h-8 mx-auto mb-4 text-red-400" />
          <p className="text-red-400">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (claims.length === 0) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-12 text-center">
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400" />
          <h3 className="text-xl font-semibold text-white mb-2">All Caught Up!</h3>
          <p className="text-gray-400">No expense claims pending your approval.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Claims Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {claims.map((claim) => {
          const isProcessing = processingClaims.has(claim.id)

          return (
            <Card key={claim.id} className="bg-gray-800 border-gray-700">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-white text-lg">{claim.description}</CardTitle>
                    <CardDescription className="text-gray-400">
                      By {claim.employee_name} • {new Date(claim.submission_date).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
                    {claim.status.replace('_', ' ')}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Amount and Category */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-gray-400" />
                    <span className="text-white font-semibold">
                      {claim.total_amount} {claim.currency}
                    </span>
                    {claim.currency !== claim.home_currency && (
                      <span className="text-gray-400 text-sm">
                        (${(claim.home_currency_amount || 0).toFixed(2)})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-300">
                      {claim.expense_category?.replace('_', ' ').split(' ').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </span>
                  </div>
                </div>

                {/* Vendor and Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-300">{claim.vendor_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-white" />
                    <span className="text-gray-300">
                      {new Date(claim.transaction_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Business Purpose */}
                <div>
                  <p className="text-gray-400 text-sm">Business Purpose:</p>
                  <p className="text-gray-300">{claim.business_purpose}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-gray-700">
                  <Button
                    size="sm"
                    onClick={() => setSelectedClaim(claim)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Review
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => handleApproval(claim.id, 'approve')}
                    disabled={isProcessing}
                    className="bg-green-600 hover:bg-green-700"
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
                    className="bg-red-600 hover:bg-red-700 text-white"
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
      )}

    </>
  )
}

// Loading skeleton
function ManagementDashboardSkeleton() {
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