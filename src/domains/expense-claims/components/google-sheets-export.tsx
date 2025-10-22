/**
 * Google Sheets Export Component
 * Allows managers and finance users to export expense reports to CSV or Google Sheets
 */

'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, Calendar, Filter, Users, CheckCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

interface GoogleSheetsExportProps {
  userRole: {
    employee: boolean
    manager: boolean
    admin: boolean
  }
}

interface ExportConfig {
  format: 'csv' | 'google_sheets'
  date_range: {
    start_date: string
    end_date: string
  }
  status_filter: string[]
  department_filter: string[]
  include_line_items: boolean
}

interface ExportResult {
  success: boolean
  data?: {
    export_format: string
    row_count: number
    sheets_data: any
    metadata: any
  }
  error?: string
}

export default function GoogleSheetsExport({ userRole }: GoogleSheetsExportProps) {
  const [exportConfig, setExportConfig] = useState<ExportConfig>({
    format: 'csv',
    date_range: {
      start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      end_date: new Date().toISOString().split('T')[0]
    },
    status_filter: [],
    department_filter: [],
    include_line_items: false
  })

  const [isExporting, setIsExporting] = useState(false)
  const [exportResult, setExportResult] = useState<ExportResult | null>(null)
  const [previewData, setPreviewData] = useState<any>(null)

  // Check if user has export permissions
  const canExport = userRole.manager || userRole.admin

  if (!canExport) {
    return (
      <Card className="bg-record-layer-1 border-record-border">
        <CardContent className="p-6 text-center">
          <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Export functionality is available for managers and finance users only.</p>
        </CardContent>
      </Card>
    )
  }

  const handleExport = async () => {
    setIsExporting(true)
    setExportResult(null)

    try {
      const response = await fetch('/api/v1/expense-claims/export/google-sheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(exportConfig)
      })

      if (exportConfig.format === 'csv') {
        // Handle CSV download
        if (response.ok) {
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `expense-report-${exportConfig.date_range.start_date}-to-${exportConfig.date_range.end_date}.csv`
          document.body.appendChild(a)
          a.click()
          window.URL.revokeObjectURL(url)
          document.body.removeChild(a)

          setExportResult({
            success: true,
            data: {
              export_format: 'csv',
              row_count: 0,
              sheets_data: null,
              metadata: null
            }
          })
        } else {
          const errorData = await response.json()
          setExportResult({
            success: false,
            error: errorData.error || 'Export failed'
          })
        }
      } else {
        // Handle Google Sheets data
        const result = await response.json()
        setExportResult(result)
        if (result.success) {
          setPreviewData(result.data.sheets_data)
        }
      }
    } catch (error) {
      console.error('Export error:', error)
      setExportResult({
        success: false,
        error: 'Network error occurred during export'
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleStatusFilterChange = (status: string, checked: boolean) => {
    setExportConfig(prev => ({
      ...prev,
      status_filter: checked 
        ? [...prev.status_filter, status]
        : prev.status_filter.filter(s => s !== status)
    }))
  }

  const copyToGoogleSheets = () => {
    if (!previewData) return

    // Create formatted text for easy copy-paste to Google Sheets
    const headers = previewData.headers.join('\t')
    const rows = previewData.rows.map((row: any[]) => row.join('\t')).join('\n')
    const formattedData = `${headers}\n${rows}`

    navigator.clipboard.writeText(formattedData).then(() => {
      alert('Data copied to clipboard! You can now paste it directly into Google Sheets.')
    })
  }

  return (
    <div className="space-y-6">
      <Card className="bg-record-layer-1 border-record-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Export Expense Report
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Generate comprehensive expense reports for {userRole.admin ? 'company-wide' : 'team'} analysis
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Export Format Selection */}
          <div className="space-y-3">
            <Label className="text-foreground">Export Format</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                onClick={() => setExportConfig(prev => ({ ...prev, format: 'csv' }))}
                variant={exportConfig.format === 'csv' ? 'primary' : 'outline'}
              >
                <Download className="w-4 h-4 mr-2" />
                Download CSV
              </Button>
              <Button
                onClick={() => setExportConfig(prev => ({ ...prev, format: 'google_sheets' }))}
                variant={exportConfig.format === 'google_sheets' ? 'primary' : 'outline'}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Google Sheets Format
              </Button>
            </div>
          </div>

          {/* Date Range Selection */}
          <div className="space-y-3">
            <Label className="text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Date Range
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-sm">Start Date</Label>
                <Input
                  type="date"
                  value={exportConfig.date_range.start_date}
                  onChange={(e) => setExportConfig(prev => ({
                    ...prev,
                    date_range: { ...prev.date_range, start_date: e.target.value }
                  }))}
                  className="bg-input border-input text-foreground"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">End Date</Label>
                <Input
                  type="date"
                  value={exportConfig.date_range.end_date}
                  onChange={(e) => setExportConfig(prev => ({
                    ...prev,
                    date_range: { ...prev.date_range, end_date: e.target.value }
                  }))}
                  className="bg-input border-input text-foreground"
                />
              </div>
            </div>
          </div>

          {/* Status Filter */}
          <div className="space-y-3">
            <Label className="text-foreground flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Status Filter
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {['pending', 'approved', 'rejected', 'reimbursed'].map(status => (
                <div key={status} className="flex items-center space-x-2">
                  <Checkbox
                    id={`status-${status}`}
                    checked={exportConfig.status_filter.includes(status)}
                    onCheckedChange={(checked) => handleStatusFilterChange(status, !!checked)}
                  />
                  <Label htmlFor={`status-${status}`} className="text-foreground capitalize">
                    {status}
                  </Label>
                </div>
              ))}
            </div>
            {exportConfig.status_filter.length === 0 && (
              <p className="text-muted-foreground text-sm">No filter selected - all statuses will be included</p>
            )}
          </div>

          {/* Additional Options */}
          <div className="space-y-3">
            <Label className="text-foreground">Additional Options</Label>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-line-items"
                checked={exportConfig.include_line_items}
                onCheckedChange={(checked) => setExportConfig(prev => ({
                  ...prev,
                  include_line_items: !!checked
                }))}
              />
              <Label htmlFor="include-line-items" className="text-foreground">
                Include detailed line items
              </Label>
            </div>
          </div>

          {/* Export Button */}
          <Button
            onClick={handleExport}
            disabled={isExporting}
            variant="primary"
            className="w-full"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Export...
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Generate Export
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Export Results */}
      {exportResult && (
        <Card className="bg-record-layer-1 border-record-border">
          <CardContent className="p-6">
            {exportResult.success ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">Export Generated Successfully</span>
                </div>

                {exportResult.data && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-foreground">{exportResult.data.row_count}</div>
                      <div className="text-muted-foreground text-sm">Total Records</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-foreground">{exportResult.data.export_format.toUpperCase()}</div>
                      <div className="text-muted-foreground text-sm">Format</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-foreground">
                        {new Date(exportResult.data.metadata?.generated_at).toLocaleDateString()}
                      </div>
                      <div className="text-muted-foreground text-sm">Generated</div>
                    </div>
                  </div>
                )}

                {previewData && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="text-foreground font-medium">Preview Data</h4>
                      <Button onClick={copyToGoogleSheets} size="sm" variant="primary">
                        Copy for Google Sheets
                      </Button>
                    </div>

                    <div className="bg-record-layer-2 p-4 rounded-lg overflow-x-auto">
                      <div className="text-xs text-foreground font-mono">
                        <div className="grid grid-cols-5 gap-4 mb-2 font-bold">
                          {previewData.headers.slice(0, 5).map((header: string, index: number) => (
                            <div key={index}>{header}</div>
                          ))}
                        </div>
                        {previewData.rows.slice(0, 3).map((row: any[], index: number) => (
                          <div key={index} className="grid grid-cols-5 gap-4 mb-1">
                            {row.slice(0, 5).map((cell: any, cellIndex: number) => (
                              <div key={cellIndex} className="truncate">{cell}</div>
                            ))}
                          </div>
                        ))}
                      </div>
                      {previewData.rows.length > 3 && (
                        <p className="text-muted-foreground text-sm mt-2">
                          ... and {previewData.rows.length - 3} more rows
                        </p>
                      )}
                    </div>

                    {/* Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <Badge variant="secondary">
                        Total: {previewData.summary.total_expenses}
                      </Badge>
                      <Badge variant="secondary">
                        Amount: ${previewData.summary.total_amount_sgd?.toFixed(2)}
                      </Badge>
                      <Badge variant="secondary">
                        Pending: {previewData.summary.pending_count}
                      </Badge>
                      <Badge variant="secondary">
                        Approved: {previewData.summary.approved_count}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Alert className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700">
                <AlertDescription className="text-red-900 dark:text-red-400">
                  {exportResult.error}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}