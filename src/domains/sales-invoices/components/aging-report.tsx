'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Download, Loader2, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils/format-number'
import { useAgingReport } from '../hooks/use-debtor-management'
import { exportAgingReportCsv, getTodayISO } from '../lib/aging-calculations'

interface AgingDebtor {
  customerId?: string
  customerName: string
  current: number
  days1to30: number
  days31to60: number
  days61to90: number
  days90plus: number
  total: number
}

export default function AgingReport() {
  const router = useRouter()
  const params = useParams()
  const locale = params?.locale as string ?? 'en'
  const [asOfDate, setAsOfDate] = useState(getTodayISO())
  const { report, isLoading } = useAgingReport(asOfDate)

  const handleExportCsv = () => {
    if (!report) return
    exportAgingReportCsv({
      debtors: report.debtors.map((d: AgingDebtor) => ({
        customerName: d.customerName,
        current: d.current,
        days1to30: d.days1to30,
        days31to60: d.days31to60,
        days61to90: d.days61to90,
        days90plus: d.days90plus,
        total: d.total,
      })),
      summary: {
        current: report.summary.current,
        days1to30: report.summary.days1to30,
        days31to60: report.summary.days31to60,
        days61to90: report.summary.days61to90,
        days90plus: report.summary.days90plus,
        total: report.summary.total,
      },
      asOfDate: report.asOfDate,
      currency: report.currency,
    })
  }

  const currency = report?.currency ?? 'USD'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/${locale}/invoices`)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h2 className="text-xl font-semibold text-foreground">AR Aging Report</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-foreground whitespace-nowrap">As of</Label>
            <Input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-[180px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!report}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Row */}
      {report && (
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-6 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Current</p>
                <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                  {formatCurrency(report.summary.current, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">1-30 Days</p>
                <p className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
                  {formatCurrency(report.summary.days1to30, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">31-60 Days</p>
                <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                  {formatCurrency(report.summary.days31to60, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">61-90 Days</p>
                <p className="text-sm font-semibold text-red-500">
                  {formatCurrency(report.summary.days61to90, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">90+ Days</p>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                  {formatCurrency(report.summary.days90plus, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total</p>
                <p className="text-sm font-bold text-foreground">
                  {formatCurrency(report.summary.total, currency)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Debtor Breakdown */}
      {report && report.debtors.length > 0 ? (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-foreground">
              Per-Debtor Breakdown ({report.debtors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Customer</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Current</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">1-30</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">31-60</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">61-90</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">90+</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.debtors.map((debtor: AgingDebtor) => (
                    <tr key={debtor.customerId}>
                      <td className="py-2 font-medium text-foreground">{debtor.customerName}</td>
                      <td className="py-2 text-right text-foreground">
                        {debtor.current > 0 ? formatCurrency(debtor.current, currency) : '-'}
                      </td>
                      <td className="py-2 text-right text-foreground">
                        {debtor.days1to30 > 0 ? formatCurrency(debtor.days1to30, currency) : '-'}
                      </td>
                      <td className="py-2 text-right text-foreground">
                        {debtor.days31to60 > 0 ? formatCurrency(debtor.days31to60, currency) : '-'}
                      </td>
                      <td className="py-2 text-right text-foreground">
                        {debtor.days61to90 > 0 ? formatCurrency(debtor.days61to90, currency) : '-'}
                      </td>
                      <td className="py-2 text-right text-foreground">
                        {debtor.days90plus > 0 ? formatCurrency(debtor.days90plus, currency) : '-'}
                      </td>
                      <td className="py-2 text-right font-semibold text-foreground">
                        {formatCurrency(debtor.total, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-bold">
                    <td className="py-2 text-foreground">TOTAL</td>
                    <td className="py-2 text-right text-foreground">{formatCurrency(report.summary.current, currency)}</td>
                    <td className="py-2 text-right text-foreground">{formatCurrency(report.summary.days1to30, currency)}</td>
                    <td className="py-2 text-right text-foreground">{formatCurrency(report.summary.days31to60, currency)}</td>
                    <td className="py-2 text-right text-foreground">{formatCurrency(report.summary.days61to90, currency)}</td>
                    <td className="py-2 text-right text-foreground">{formatCurrency(report.summary.days90plus, currency)}</td>
                    <td className="py-2 text-right text-foreground">{formatCurrency(report.summary.total, currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : report ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-foreground">No Outstanding Receivables</p>
            <p className="text-sm text-muted-foreground mt-1">
              All invoices are paid as of {asOfDate}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
