/**
 * Monthly Report Generator Component
 * Implements Otto's compliance reporting with Mel's export functionality
 */

'use client'

import { useState, useEffect } from 'react'
import { Download, FileText, Calendar, User, Printer, Eye } from 'lucide-react'
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
}

interface CategorySection {
  categoryName: string
  categoryCode: string
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

export default function MonthlyReportGenerator({ personalOnly = false }: MonthlyReportGeneratorProps) {
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [formattedReportData, setFormattedReportData] = useState<FormattedReportData | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generatingFormatted, setGeneratingFormatted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [employees, setEmployees] = useState([
    { id: 'current', name: 'My Reports' }
  ])
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [categories, setCategories] = useState<Array<{business_category_code: string, business_category_name: string}>>([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [activePreview, setActivePreview] = useState<'summary' | 'formatted' | null>(null)

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

  // Fetch categories on component mount
  useEffect(() => {
    const fetchCategories = async () => {
      setLoadingCategories(true)
      try {
        const response = await fetch('/api/v1/expense-claims/categories')
        const result = await response.json()

        if (result.success && result.data.categories) {
          setCategories(result.data.categories)
        }
      } catch (error) {
        console.error('[Monthly Report] Failed to fetch categories:', error)
        // Don't block report generation if categories fail to load
      } finally {
        setLoadingCategories(false)
      }
    }

    fetchCategories()
  }, [])

  // Fetch employees from API (only if not personal mode)
  useEffect(() => {
    console.log('[Monthly Report] 🚀 useEffect triggered - personalOnly:', personalOnly)

    if (personalOnly) {
      // In personal mode, only show current user
      console.log('[Monthly Report] 📝 Personal mode - setting default employees')
      setEmployees([{ id: 'current', name: 'My Reports' }])
      setSelectedEmployee('current')
      return
    }

    const fetchEmployees = async () => {
      try {
        console.log('[Monthly Report] 🌐 Fetching team members from /api/v1/users/team')
        setLoadingEmployees(true)
        const response = await fetch('/api/v1/users/team')

        console.log('[Monthly Report] 📡 Response status:', response.status, response.statusText)

        const result = await response.json()
        console.log('[Monthly Report] 📊 Team API response:', result)

        if (result.success && result.data && result.data.users && result.data.users.length > 0) {
          console.log('[Monthly Report] ✅ Processing team data - found', result.data.users.length, 'users')

          const teamMembers = result.data.users.map((member: any) => ({
            id: member.user_id, // Use user_id for the reports API employeeId parameter
            name: member.full_name || member.email || `Employee ID: ${member.user_id}`
          }))

          console.log('[Monthly Report] 👥 Team members processed:', teamMembers)

          const finalEmployees = [
            { id: 'current', name: 'My Reports' },
            ...teamMembers
          ]

          console.log('[Monthly Report] 📋 Final employees list:', finalEmployees)
          setEmployees(finalEmployees)
        } else {
          console.log('[Monthly Report] ❌ No team data found or API failed:', {
            success: result.success,
            hasData: !!result.data,
            hasUsers: !!result.data?.users,
            userCount: result.data?.users?.length || 0,
            error: result.error
          })
        }
      } catch (error) {
        console.error('[Monthly Report] 💥 Failed to fetch employees:', error)
        // Keep default "My Reports" only if API fails
      } finally {
        console.log('[Monthly Report] 🏁 Fetch employees completed')
        setLoadingEmployees(false)
      }
    }

    fetchEmployees()
  }, [personalOnly])

  // Generate CSV export URL for server-side download
  const generateCSVExportURL = (): string => {
    if (!selectedMonth) return ''

    const params = new URLSearchParams({ month: selectedMonth })

    if (selectedEmployee && selectedEmployee !== 'current') {
      params.append('employeeId', selectedEmployee)
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

      if (selectedEmployee && selectedEmployee !== 'current') {
        params.append('employeeId', selectedEmployee)
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

      if (selectedEmployee && selectedEmployee !== 'current') {
        params.append('employeeId', selectedEmployee)
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
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Generate Monthly Report</CardTitle>
          <CardDescription>
            Create detailed expense reports for compliance and reimbursement processing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert className="bg-red-900/20 border-red-700">
              <AlertDescription className="text-red-400">{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Month Selection */}
            <div className="space-y-2">
              <label className="text-white text-sm font-medium">Report Month *</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  {monthOptions.map((month) => (
                    <SelectItem key={month.value} value={month.value} className="text-white">
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
              <label className="text-white text-sm font-medium">Employee</label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                  <SelectValue placeholder="Select employee (optional)" />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id} className="text-white">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        {employee.name}
                      </div>
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
              disabled={generating || generatingFormatted}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <FileText className="w-4 h-4 mr-2" />
              {generating ? 'Generating...' : 'Summary Preview'}
            </Button>

            <Button
              onClick={generateFormattedReport}
              disabled={generating || generatingFormatted}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Eye className="w-4 h-4 mr-2" />
              {generatingFormatted ? 'Generating...' : 'Formatted Preview'}
            </Button>

            {/* CSV Export as direct download link */}
            {selectedMonth ? (
              <Button
                asChild
                className="bg-green-600 hover:bg-green-700 text-white"
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
                className="bg-gray-600 text-gray-400 cursor-not-allowed"
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
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white">Monthly Expense Report</CardTitle>
                <CardDescription>
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
              <h4 className="text-white font-semibold">Category Breakdown</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(reportData.groupedClaims).map(([categoryCode, categoryData]) => {
                  if (categoryData.claimsCount === 0) return null

                  return (
                    <div key={categoryCode} className="bg-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge
                          variant="secondary"
                          className="bg-gray-900/20 text-gray-300 border border-gray-700/50 hover:bg-gray-200/90 hover:text-gray-900 transition-colors cursor-default"
                        >
                          {categoryData.categoryName}
                        </Badge>
                        <span className="text-gray-400 text-sm">{categoryData.claimsCount} claims</span>
                      </div>
                      <div className="text-white font-semibold">
                        {categoryData.totalAmount.toFixed(2)} {reportData.currency}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {categoryData.accountingCategory}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Report Metadata */}
            <div className="border-t border-gray-700 pt-4 text-gray-400 text-sm">
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
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Recent Reports</CardTitle>
          <CardDescription>Quick access to previously generated reports</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-400 py-8">
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
    default: 'bg-gray-700 text-white',
    success: 'bg-green-900/20 border border-green-700 text-green-400',
    warning: 'bg-yellow-900/20 border border-yellow-700 text-yellow-400',
    error: 'bg-red-900/20 border border-red-700 text-red-400'
  }

  return (
    <div className={`p-4 rounded-lg ${variantStyles[variant]}`}>
      <div className="text-xs opacity-75 mb-1">{title}</div>
      <div className="font-semibold">{value}</div>
    </div>
  )
}