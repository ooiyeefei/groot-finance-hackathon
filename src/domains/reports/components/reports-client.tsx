'use client'

import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useActiveBusiness } from '@/contexts/business-context'
import { FileBarChart, Plus, Download, Loader2, AlertCircle, Info, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import GenerateReportDialog from './generate-report-dialog'
import HowItWorksDrawer from './how-it-works-drawer'
import type { GeneratedReport } from '../lib/types'

export default function ReportsClient() {
  const { businessId, isLoading: isBusinessLoading } = useActiveBusiness()
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const reports = useQuery(
    api.functions.reports.listReports,
    businessId ? { businessId, limit: 50 } : 'skip'
  )

  const pendingCount = useQuery(
    api.functions.reports.getPendingStatementCount,
    businessId ? { businessId } : 'skip'
  )

  const handleDownload = async (report: GeneratedReport) => {
    setDownloadingId(report._id)
    try {
      const res = await fetch(`/api/v1/reports/download?reportId=${report._id}`)
      const data = await res.json()
      if (data.downloadUrl) {
        window.open(data.downloadUrl, '_blank')
      }
    } catch (err) {
      console.error('Download failed:', err)
    } finally {
      setDownloadingId(null)
    }
  }

  if (isBusinessLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!businessId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p>No business selected</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Aging Reports</h2>
          <p className="text-sm text-muted-foreground">
            Generate AP and AR aging reports with debtor statements
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHowItWorks(true)}
          >
            <Info className="h-4 w-4" />
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => setShowGenerateDialog(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
        </div>
      </div>

      {/* Pending review banner */}
      {pendingCount !== undefined && pendingCount > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">
                {pendingCount} debtor statement{pendingCount > 1 ? 's' : ''} pending review
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-amber-600 hover:text-amber-700"
              onClick={() => {
                window.location.href = `${window.location.pathname}/statements-review`
              }}
            >
              Review & Send
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Report history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Report History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reports === undefined ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileBarChart className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">No reports generated yet</p>
              <p className="text-xs mt-1">Click "Generate Report" to create your first aging report</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Period</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">As Of</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Outstanding</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Generated</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Method</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report: GeneratedReport) => (
                    <tr key={report._id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-3">
                        <Badge variant="outline" className="text-xs">
                          {report.reportType === 'ar_aging' ? 'AR Aging' : 'AP Aging'}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{report.periodMonth}</td>
                      <td className="py-2 px-3">{formatBusinessDate(report.asOfDate)}</td>
                      <td className="py-2 px-3 text-right font-medium">
                        {formatCurrency(report.totalOutstanding, report.currency)}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground text-xs">
                        {new Date(report._creationTime).toLocaleDateString()}
                      </td>
                      <td className="py-2 px-3">
                        <Badge
                          variant="secondary"
                          className="text-xs"
                        >
                          {report.generationMethod === 'auto_monthly' ? 'Auto' : 'Manual'}
                        </Badge>
                        {report.hasWarnings && (
                          <Badge variant="outline" className="text-xs ml-1 text-amber-600 border-amber-500/50">
                            Warnings
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(report)}
                          disabled={downloadingId === report._id}
                        >
                          {downloadingId === report._id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <GenerateReportDialog
        open={showGenerateDialog}
        onClose={() => setShowGenerateDialog(false)}
        businessId={businessId}
      />
      <HowItWorksDrawer
        open={showHowItWorks}
        onClose={() => setShowHowItWorks(false)}
      />
    </div>
  )
}
