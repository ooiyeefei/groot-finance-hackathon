'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useActiveBusiness } from '@/contexts/business-context'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { formatCurrency } from '@/lib/utils/format-number'
import type { Id } from '@/convex/_generated/dataModel'

function getTodayISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function ApAgingReportPage() {
  const router = useRouter()
  const params = useParams()
  const locale = params?.locale as string ?? 'en'
  const { businessId } = useActiveBusiness()
  const [asOfDate, setAsOfDate] = useState(getTodayISO())

  const apData = useQuery(
    api.functions.financialIntelligence.getAPAging,
    businessId ? { businessId } : 'skip'
  )

  const isLoading = apData === undefined

  const vendorBreakdown = apData?.vendorBreakdown || []
  const agingBuckets = apData?.agingBuckets || []

  // Build totals from agingBuckets array: [{ bucket, amount, count }]
  const bucketMap: Record<string, number> = {}
  for (const b of agingBuckets) {
    bucketMap[b.bucket] = b.amount
  }

  const totalOutstanding = apData?.totalOutstanding || 0

  const buckets = [
    { label: 'Current', amount: bucketMap['current'] || 0, color: 'bg-emerald-500/10 text-emerald-600' },
    { label: '1-30 Days', amount: bucketMap['1-30'] || 0, color: 'bg-yellow-500/10 text-yellow-600' },
    { label: '31-60 Days', amount: bucketMap['31-60'] || 0, color: 'bg-orange-500/10 text-orange-600' },
    { label: '61-90 Days', amount: bucketMap['61-90'] || 0, color: 'bg-red-500/10 text-red-600' },
    { label: '90+ Days', amount: bucketMap['90+'] || 0, color: 'bg-red-700/10 text-red-700' },
  ]

  const currency = apData?.currency || 'MYR'

  return (
    <div className="space-y-4 p-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(`/${locale}/invoices`)}
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Invoices
      </Button>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">AP Aging Report</h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="ap-as-of" className="text-sm">As of:</Label>
          <Input
            id="ap-as-of"
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {buckets.map((b) => (
          <Card key={b.label}>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">{b.label}</p>
              <p className={`text-lg font-bold ${b.color.split(' ')[1]}`}>
                {isLoading ? '...' : formatCurrency(b.amount, currency)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Total */}
      <Card>
        <CardContent className="py-3 px-4 flex justify-between items-center">
          <span className="font-medium">Total Outstanding</span>
          <span className="text-xl font-bold">
            {isLoading ? '...' : formatCurrency(totalOutstanding, currency)}
          </span>
        </CardContent>
      </Card>

      {/* Vendor breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vendor Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : vendorBreakdown.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No outstanding payables</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Vendor</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorBreakdown.map((v: any, i: number) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2 px-3 font-medium">{v.vendorName}</td>
                      <td className="py-2 px-3 text-right font-medium">{formatCurrency(v.outstanding, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
