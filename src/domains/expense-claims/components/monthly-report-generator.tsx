/**
 * Monthly Report Generator Component
 * Implements Otto's compliance reporting with Mel's export functionality
 */

'use client'

import { useState, useEffect } from 'react'
import { Download, FileText, Calendar, User, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import FormattedExpenseReport from './formatted-expense-report'

interface ReportData {
  month: string
  employeeName: string
  totalAmount: number
  currency: string
  groupedClaims: Record<string, {
    categoryCode: string
    categoryName: string
    accountingCategory: string
    totalAmount: number
    claimsCount: number
    claims: any[]
  }>
  summary: {
    totalClaims: number
    totalAmount: number
    byStatus: {
      draft: number
      submitted: number
      approved: number
      rejected: number
      reimbursed: number
    }
  }
  metadata: {
    generatedAt: string
    generatedBy: string
    businessId: string
    requestedByRole: string
    scope: string
  }
}

// Enhanced formatted report interfaces
interface CategoryLineItem {
  date: string
  description: string
  amount: number
  referenceNumber?: string
  claimId: string
  vendor: string
  duplicateStatus?: string
  duplicateOverrideReason?: string
  isSplitExpense?: boolean
}

interface CategorySection {
  categoryName: string
  categoryId: string
  accountingCategory: string
  lineItems: CategoryLineItem[]
  subtotal: number
  currency: string
}

interface EnhancedReportHeader {
  businessName: string
  reportTitle: string
  employeeName: string
  employeeDesignation: string
  reportMonth: string
  approvedBy?: string
  generatedDate: string
}

interface FormattedReportData {
  header: EnhancedReportHeader
  categorySections: CategorySection[]
  summary: {
    totalAmount: number
    totalClaims: number
    currency: string
    statusBreakdown: {
      approved: number
      submitted: number
      rejected: number
      reimbursed: number
    }
  }
  metadata: {
    reportScope: string
    generatedAt: string
    dataAsOf: string
  }
}

interface MonthlyReportGeneratorProps {
  personalOnly?: boolean
}

// Status options for filtering
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted (Pending)' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'reimbursed', label: 'Reimbursed' },
]

export default function MonthlyReportGenerator({ personalOnly = false }: MonthlyReportGeneratorProps) {
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [formattedReportData, setFormattedReportData] = useState<FormattedReportData | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generatingFormatted, setGeneratingFormatted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [employees, setEmployees] = useState([
    { id: 'current', name: 'My Reports' }
  ])
  const [activePreview, setActivePreview] = useState<'summary' | 'formatted' | null>(null)
  const [userRole, setUserRole] = useState<{ manager: boolean; finance_admin: boolean } | null>(null)
  const [roleLoading, setRoleLoading] = useState(!personalOnly)

  // Generate available months (last 12 months)
  const generateMonthOptions = () => {
    const months = []
    const now = new Date()

    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)

      // Use consistent date formatting to avoid timezone issues
      const year = date.getFullYear()
      const month = (date.getMonth() + 1).toString().padStart(2, '0')
      const monthValue = `${year}-${month}` // YYYY-MM

      const monthLabel = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long'
      })
      months.push({ value: monthValue, label: monthLabel })
    }

    return months
  }

  const monthOptions = generateMonthOptions()

  // Fetch user role and employees from API (only if not personal mode)
  useEffect(() => {
    console.log('[Monthly Report] 🚀 useEffect triggered - personalOnly:', personalOnly)

    if (personalOnly) {
      // In personal mode, only show current user
      console.log('[Monthly Report] 📝 Personal mode - setting default employees')
      setEmployees([{ id: 'current', name: 'My Reports' }])
      setSelectedEmployee('current')
      return
    }

    const fetchRoleAndEmployees = async () => {
      try {
        // First fetch user role to determine access level
        console.log('[Monthly Report] 🔐 Fetching user role...')
        const roleResponse = await fetch('/api/v1/users/role')
        const roleResult = await roleResponse.json()

        if (roleResult.success && roleResult.data?.permissions) {
          const permissions = roleResult.data.permissions
          setUserRole(permissions)
          console.log('[Monthly Report] 👤 User permissions:', permissions)

          // Finance admin sees ALL employees, managers see only direct reports
          const isFinanceAdmin = permissions.finance_admin
          const apiUrl = isFinanceAdmin
            ? '/api/v1/users/team'  // All employees for admins
            : '/api/v1/users/team?directReportsOnly=true'  // Direct reports for managers

          console.log('[Monthly Report] 🌐 Fetching employees from:', apiUrl)
          const response = await fetch(apiUrl)
          const result = await response.json()

          console.log('[Monthly Report] 📊 Team API response:', result)

          if (result.success && result.data && result.data.users && result.data.users.length > 0) {
            console.log('[Monthly Report] ✅ Processing team data - found', result.data.users.length, 'users')

            const teamMembers = result.data.users.map((member: any) => ({
              id: member.user_id,
              name: member.full_name || member.email || `Employee ID: ${member.user_id}`
            }))

            console.log('[Monthly Report] 👥 Team members processed:', teamMembers)

            const finalEmployees = [
              { id: 'all', name: isFinanceAdmin ? 'All Employees' : 'All Direct Reports' },
              { id: 'current', name: 'My Reports' },
              ...teamMembers
            ]

            console.log('[Monthly Report] 📋 Final employees list:', finalEmployees)
            setEmployees(finalEmployees)
          } else {
            console.log('[Monthly Report] ❌ No team data found:', {
              success: result.success,
              hasData: !!result.data,
              hasUsers: !!result.data?.users,
              userCount: result.data?.users?.length || 0,
              error: result.error
            })
          }
        } else {
          console.log('[Monthly Report] ❌ Failed to get user role:', roleResult.error)
        }
      } catch (error) {
        console.error('[Monthly Report] 💥 Failed to fetch role/employees:', error)
      } finally {
        setRoleLoading(false)
      }
    }

    fetchRoleAndEmployees()
  }, [personalOnly])

  // Generate CSV export URL for server-side download
  const generateCSVExportURL = (): string => {
    if (!selectedMonth) return ''

    const params = new URLSearchParams({ month: selectedMonth })

    // Scope based on role: admins get all, managers get direct reports
    if (!personalOnly) {
      if (!userRole?.finance_admin) {
        params.append('directReportsOnly', 'true')
      }
    }

    if (selectedEmployee && selectedEmployee !== 'current' && selectedEmployee !== 'all') {
      params.append('employeeId', selectedEmployee)
    }

    // Add status filter if not "all"
    if (selectedStatus && selectedStatus !== 'all') {
      params.append('status', selectedStatus)
    }

    return `/api/v1/expense-claims/reports/export?${params.toString()}`
  }

  const generateReport = async () => {
    if (!selectedMonth) {
      setError('Please select a month')
      return
    }

    setGenerating(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        month: selectedMonth
      })

      // Scope based on role: admins get all, managers get direct reports
      if (!personalOnly) {
        if (!userRole?.finance_admin) {
          params.append('directReportsOnly', 'true')
        }
      }

      if (selectedEmployee && selectedEmployee !== 'current' && selectedEmployee !== 'all') {
        params.append('employeeId', selectedEmployee)
      }

      // Add status filter if not "all"
      if (selectedStatus && selectedStatus !== 'all') {
        params.append('status', selectedStatus)
      }

      // Use the comprehensive reports API endpoint for JSON preview
      const response = await fetch(`/api/v1/expense-claims/reports?${params}`)
      const result = await response.json()

      if (result.success) {
        setReportData(result.data)
        setActivePreview('summary')
        setFormattedReportData(null) // Clear formatted data when generating summary
      } else {
        setError(result.error || 'Failed to generate report')
      }
    } catch (error) {
      console.error('Report generation failed:', error)
      setError('Network error. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const generateFormattedReport = async () => {
    if (!selectedMonth) {
      setError('Please select a month')
      return
    }

    setGeneratingFormatted(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        month: selectedMonth
      })

      // Scope based on role: admins get all, managers get direct reports
      if (!personalOnly) {
        if (!userRole?.finance_admin) {
          params.append('directReportsOnly', 'true')
        }
      }

      if (selectedEmployee && selectedEmployee !== 'current' && selectedEmployee !== 'all') {
        params.append('employeeId', selectedEmployee)
      }

      // Add status filter if not "all"
      if (selectedStatus && selectedStatus !== 'all') {
        params.append('status', selectedStatus)
      }

      // Use the new formatted reports API endpoint
      const response = await fetch(`/api/v1/expense-claims/reports/formatted?${params}`)
      const result = await response.json()

      if (result.success) {
        setFormattedReportData(result.data)
        setActivePreview('formatted')
        setReportData(null) // Clear summary data when generating formatted
      } else {
        setError(result.error || 'Failed to generate formatted report')
      }
    } catch (error) {
      console.error('Formatted report generation failed:', error)
      setError('Network error. Please try again.')
    } finally {
      setGeneratingFormatted(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Report Configuration */}
      <Card className="bg-record-layer-1 border-record-border">
        <CardHeader>
          <CardTitle className="text-record-title">Generate Monthly Report</CardTitle>
          <CardDescription className="text-record-supporting">
            Create detailed expense reports for compliance and reimbursement processing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert className="bg-danger/20 border-danger/30">
              <AlertDescription className="text-danger">{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Month Selection */}
            <div className="space-y-2">
              <label className="text-record-title text-sm font-medium">Report Month *</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="bg-record-layer-2 border-record-border text-record-title">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent className="bg-record-layer-2 border-record-border">
                  {monthOptions.map((month) => (
                    <SelectItem key={month.value} value={month.value} className="text-record-title">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {month.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Employee Selection (for managers/finance) */}
            <div className="space-y-2">
              <label className="text-record-title text-sm font-medium">Employee</label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="bg-record-layer-2 border-record-border text-record-title">
                  <SelectValue placeholder="Select employee (optional)" />
                </SelectTrigger>
                <SelectContent className="bg-record-layer-2 border-record-border">
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id} className="text-record-title">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        {employee.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <label className="text-record-title text-sm font-medium">Status Filter</label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="bg-record-layer-2 border-record-border text-record-title">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent className="bg-record-layer-2 border-record-border">
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status.value} value={status.value} className="text-record-title">
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Generate Buttons */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={generateReport}
              disabled={generating || generatingFormatted || roleLoading}
              variant="view"
            >
              <FileText className="w-4 h-4 mr-2" />
              {roleLoading ? 'Loading...' : generating ? 'Generating...' : 'Summary Preview'}
            </Button>

            <Button
              onClick={generateFormattedReport}
              disabled={generating || generatingFormatted || roleLoading}
              variant="view"
            >
              <Eye className="w-4 h-4 mr-2" />
              {roleLoading ? 'Loading...' : generatingFormatted ? 'Generating...' : 'Formatted Preview'}
            </Button>

            {/* CSV Export as direct download link */}
            {selectedMonth && !roleLoading ? (
              <Button
                asChild
                variant="primary"
              >
                <a
                  href={generateCSVExportURL()}
                  download
                  className="inline-flex items-center"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </a>
              </Button>
            ) : (
              <Button
                disabled
                variant="primary"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report Preview */}
      {activePreview === 'summary' && reportData && (
        <Card className="bg-record-layer-1 border-record-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-record-title">Monthly Expense Report</CardTitle>
                <CardDescription className="text-record-supporting">
                  {reportData.employeeName} - {new Date(reportData.month + '-01').toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long'
                  })}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <ReportSummaryCard
                title="Total Claims"
                value={reportData.summary.totalClaims.toString()}
                variant="default"
              />
              <ReportSummaryCard
                title="Total Amount"
                value={`${reportData.summary.totalAmount.toFixed(2)} ${reportData.currency}`}
                variant="default"
              />
              <ReportSummaryCard
                title="Approved"
                value={`${(reportData.summary.byStatus.approved + reportData.summary.byStatus.reimbursed).toString()} claims`}
                variant="success"
              />
              <ReportSummaryCard
                title="Submitted"
                value={`${reportData.summary.byStatus.submitted.toString()} claims`}
                variant="warning"
              />
              <ReportSummaryCard
                title="Rejected"
                value={`${reportData.summary.byStatus.rejected.toString()} claims`}
                variant="error"
              />
            </div>

            {/* Category Breakdown */}
            <div className="space-y-4">
              <h4 className="text-record-title font-semibold">Category Breakdown</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(reportData.groupedClaims).map(([categoryCode, categoryData]) => {
                  if (categoryData.claimsCount === 0) return null

                  return (
                    <div key={categoryCode} className="bg-record-layer-2 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge
                          variant="secondary"
                          className="bg-muted/20 text-record-title border border-muted/30 hover:bg-muted/40 transition-colors cursor-default"
                        >
                          {categoryData.categoryName}
                        </Badge>
                        <span className="text-record-supporting text-sm">{categoryData.claimsCount} claims</span>
                      </div>
                      <div className="text-record-title font-semibold">
                        {categoryData.totalAmount.toFixed(2)} {reportData.currency}
                      </div>
                      <div className="text-xs text-record-supporting mt-1">
                        {categoryData.accountingCategory}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Report Metadata */}
            <div className="border-t border-record-border pt-4 text-record-supporting text-sm">
              <p>Report generated on: {new Date(reportData.metadata.generatedAt).toLocaleString()}</p>
              <p>Report scope: {reportData.metadata.scope.replace(/_/g, ' ')}</p>
              <p>Generated by: {reportData.metadata.requestedByRole}</p>
              <p>Data as of: {new Date().toLocaleDateString()}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Formatted Report Preview */}
      {activePreview === 'formatted' && formattedReportData && (
        <FormattedExpenseReport reportData={formattedReportData} />
      )}

      {/* Quick Access to Recent Reports */}
      <Card className="bg-record-layer-1 border-record-border">
        <CardHeader>
          <CardTitle className="text-record-title">Recent Reports</CardTitle>
          <CardDescription className="text-record-supporting">Quick access to previously generated reports</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-record-supporting py-8">
            <FileText className="w-12 h-12 mx-auto mb-4" />
            <p>No recent reports</p>
            <p className="text-sm">Generate your first monthly report to see it here</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ReportSummaryCard({ title, value, variant }: {
  title: string
  value: string
  variant: 'default' | 'success' | 'warning' | 'error'
}) {
  const variantStyles = {
    default: 'bg-primary/20 border border-primary/30 text-primary',
    success: 'bg-success/20 border border-success/30 text-success',
    warning: 'bg-warning/20 border border-warning/30 text-warning',
    error: 'bg-danger/20 border border-danger/30 text-danger'
  }

  return (
    <div className={`p-4 rounded-lg ${variantStyles[variant]}`}>
      <div className="text-xs opacity-75 mb-1">{title}</div>
      <div className="font-semibold">{value}</div>
    </div>
  )
}