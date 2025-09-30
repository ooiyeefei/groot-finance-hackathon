/**
 * Monthly Report Generator Component
 * Implements Otto's compliance reporting with Mel's export functionality
 */

'use client'

import { useState, useEffect } from 'react'
import { Download, FileText, Calendar, User, Printer } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EXPENSE_CATEGORY_CONFIG } from '@/types/expense-claims'

interface ReportData {
  employee_name: string
  report_month: string
  home_currency: string
  summary: {
    total_amount: number
    claim_count: number
    approved_amount: number
    pending_amount: number
    rejected_amount: number
  }
  category_totals: Record<string, { amount: number; count: number }>
  claims: any[]
  generated_at: string
}

interface MonthlyReportGeneratorProps {
  personalOnly?: boolean
}

export default function MonthlyReportGenerator({ personalOnly = false }: MonthlyReportGeneratorProps) {
  const t = useTranslations('reports.monthlyReport')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [employees, setEmployees] = useState([
    { id: 'current', name: 'My Reports' }
  ])
  const [loadingEmployees, setLoadingEmployees] = useState(false)

  // Generate available months (last 12 months)
  const generateMonthOptions = () => {
    const months = []
    const now = new Date()
    
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthValue = date.toISOString().slice(0, 7) // YYYY-MM
      const monthLabel = date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      })
      months.push({ value: monthValue, label: monthLabel })
    }
    
    return months
  }

  const monthOptions = generateMonthOptions()

  // Fetch employees from API (only if not personal mode)
  useEffect(() => {
    if (personalOnly) {
      // In personal mode, only show current user
      setEmployees([{ id: 'current', name: 'My Reports' }])
      setSelectedEmployee('current')
      return
    }

    const fetchEmployees = async () => {
      try {
        setLoadingEmployees(true)
        const response = await fetch('/api/user/team')
        const result = await response.json()
        
        if (result.success && result.data.length > 0) {
          const teamMembers = result.data.map((member: any) => ({
            id: member.id || member.user_id,
            name: member.full_name || member.email || `Employee ID: ${member.id || member.user_id}`
          }))
          
          setEmployees([
            { id: 'current', name: 'My Reports' },
            ...teamMembers
          ])
        }
      } catch (error) {
        console.error('Failed to fetch employees:', error)
        // Keep default "My Reports" only if API fails
      } finally {
        setLoadingEmployees(false)
      }
    }

    fetchEmployees()
  }, [personalOnly])

  const generateReport = async (format: 'json' | 'pdf' | 'csv' = 'json') => {
    if (!selectedMonth) {
      setError(t('pleaseSelectMonth'))
      return
    }

    setGenerating(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        month: selectedMonth,
        format: format
      })

      if (selectedEmployee && selectedEmployee !== 'current') {
        params.append('employee_id', selectedEmployee)
      }

      const response = await fetch(`/api/expense-claims/reports/monthly?${params}`)

      if (format === 'json') {
        const result = await response.json()
        if (result.success) {
          setReportData(result.data)
        } else {
          setError(result.error || t('failedToGenerate'))
        }
      } else {
        // Handle file downloads for PDF/CSV
        if (response.ok) {
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          
          const employee = selectedEmployee && selectedEmployee !== 'current' 
            ? employees.find(e => e.id === selectedEmployee)?.name.replace(/\s+/g, '-') || 'employee'
            : 'my'
          
          link.download = `expense-report-${employee}-${selectedMonth}.${format}`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          window.URL.revokeObjectURL(url)
        } else {
          const result = await response.json()
          setError(result.error || t('failedToGenerate'))
        }
      }
    } catch (error) {
      console.error('Report generation failed:', error)
      setError(t('networkError'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Report Configuration */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">{t('generateTitle')}</CardTitle>
          <CardDescription>
            {t('generateDescription')}
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
              <label className="text-white text-sm font-medium">{t('reportMonthLabel')} *</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                  <SelectValue placeholder={t('selectMonthPlaceholder')} />
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
              <label className="text-white text-sm font-medium">{t('employeeLabel')}</label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                  <SelectValue placeholder={t('selectEmployeePlaceholder')} />
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
              onClick={() => generateReport('json')}
              disabled={generating}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <FileText className="w-4 h-4 mr-2" />
              {t('previewReportButton')}
            </Button>
            
            <Button
              onClick={() => generateReport('pdf')}
              disabled={generating}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              {t('downloadPdfButton')}
            </Button>

            <Button
              onClick={() => generateReport('csv')}
              disabled={generating}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              {t('exportCsvButton')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Preview */}
      {reportData && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white">{t('monthlyExpenseReport')}</CardTitle>
                <CardDescription>
                  {reportData.employee_name} - {new Date(reportData.report_month + '-01').toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long'
                  })}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="border-gray-600 text-gray-300"
              >
                <Printer className="w-4 h-4 mr-2" />
                {t('printButton')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <ReportSummaryCard
                title={t('totalClaims')}
                value={reportData.summary.claim_count.toString()}
                variant="default"
              />
              <ReportSummaryCard
                title={t('totalAmount')}
                value={`${reportData.summary.total_amount.toFixed(2)} ${reportData.home_currency}`}
                variant="default"
              />
              <ReportSummaryCard
                title={t('approved')}
                value={`${reportData.summary.approved_amount.toFixed(2)} ${reportData.home_currency}`}
                variant="success"
              />
              <ReportSummaryCard
                title={t('pending')}
                value={`${reportData.summary.pending_amount.toFixed(2)} ${reportData.home_currency}`}
                variant="warning"
              />
              <ReportSummaryCard
                title={t('rejected')}
                value={`${reportData.summary.rejected_amount.toFixed(2)} ${reportData.home_currency}`}
                variant="error"
              />
            </div>

            {/* Category Breakdown */}
            <div className="space-y-4">
              <h4 className="text-white font-semibold">{t('categoryBreakdownTitle')}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(reportData.category_totals).map(([category, data]) => {
                  const categoryConfig = EXPENSE_CATEGORY_CONFIG[category as keyof typeof EXPENSE_CATEGORY_CONFIG]
                  
                  if (data.count === 0) return null
                  
                  return (
                    <div key={category} className="bg-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="secondary" className="bg-gray-600">
                          {categoryConfig?.icon} {categoryConfig?.label}
                        </Badge>
                        <span className="text-gray-400 text-sm">{data.count} {t('claimsText')}</span>
                      </div>
                      <div className="text-white font-semibold">
                        {data.amount.toFixed(2)} {reportData.home_currency}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Report Metadata */}
            <div className="border-t border-gray-700 pt-4 text-gray-400 text-sm">
              <p>{t('reportGeneratedOn')} {new Date(reportData.generated_at).toLocaleString()}</p>
              <p>{t('dataAsOf')} {new Date().toLocaleDateString()}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Access to Recent Reports */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">{t('recentReportsTitle')}</CardTitle>
          <CardDescription>{t('quickAccessDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-400 py-8">
            <FileText className="w-12 h-12 mx-auto mb-4" />
            <p>{t('noRecentReports')}</p>
            <p className="text-sm">{t('generateFirstReport')}</p>
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