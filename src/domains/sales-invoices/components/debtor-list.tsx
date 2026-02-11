'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Users, ArrowUpDown, Loader2, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils/format-number'
import { useDebtorList } from '../hooks/use-debtor-management'

interface AgingBuckets {
  current: number
  days1to30: number
  days31to60: number
  days61to90: number
  days90plus: number
}

interface DebtorRow {
  customerId?: string
  customerName: string
  openInvoiceCount: number
  totalOutstanding: number
  currency: string
  oldestOverdueDays: number
  aging: AgingBuckets
}

const AGING_LABELS: Record<string, string> = {
  current: 'Current',
  days1to30: '1-30',
  days31to60: '31-60',
  days61to90: '61-90',
  days90plus: '90+',
}

export default function DebtorList() {
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) ?? 'en'

  const [overdueOnly, setOverdueOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'outstanding' | 'daysOverdue' | 'customerName'>('outstanding')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const { debtors, summary, isLoading } = useDebtorList({
    overdueOnly,
    sortBy,
    sortOrder,
  })

  const handleDebtorClick = (customerId?: string) => {
    if (!customerId) return
    router.push(`/${locale}/invoices/debtors/${customerId}`)
  }

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const displayCurrency = debtors[0]?.currency ?? summary.currency ?? 'USD'

  return (
    <div className="space-y-6">
      {/* Aging Summary */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Aging Summary
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => router.push(`/${locale}/invoices/aging-report`)}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            View Full Report
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-6 gap-4">
            {Object.entries(AGING_LABELS).map(([key, label]) => (
              <div key={key} className="text-center">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatCurrency(
                    (summary.aging as Record<string, number>)[key] ?? 0,
                    displayCurrency
                  )}
                </p>
              </div>
            ))}
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Total</p>
              <p className="text-sm font-bold text-foreground">
                {formatCurrency(summary.totalOutstanding, displayCurrency)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters & Sort */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="overdue-only"
              checked={overdueOnly}
              onCheckedChange={(checked) => setOverdueOnly(checked === true)}
            />
            <Label htmlFor="overdue-only" className="text-sm text-foreground">
              Overdue Only
            </Label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="outstanding">Outstanding Amount</SelectItem>
              <SelectItem value="daysOverdue">Days Overdue</SelectItem>
              <SelectItem value="customerName">Customer Name</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={toggleSortOrder}>
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Debtor Rows */}
      {debtors.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-foreground">No Outstanding Receivables</p>
            <p className="text-sm text-muted-foreground mt-1">
              All invoices have been paid. Great work!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(debtors as DebtorRow[]).map((debtor) => (
            <Card
              key={`${debtor.customerId}-${debtor.currency}`}
              className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => handleDebtorClick(debtor.customerId)}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{debtor.customerName}</p>
                      {debtor.oldestOverdueDays > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {debtor.oldestOverdueDays}d overdue
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {debtor.openInvoiceCount} open invoice{debtor.openInvoiceCount !== 1 ? 's' : ''} &bull; {debtor.currency}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">
                      {formatCurrency(debtor.totalOutstanding, debtor.currency)}
                    </p>
                    {/* Mini aging bars */}
                    <div className="flex gap-0.5 mt-1 justify-end">
                      {debtor.aging.current > 0 && (
                        <div
                          className="h-1.5 bg-green-500 rounded-full"
                          style={{ width: Math.max(4, (debtor.aging.current / debtor.totalOutstanding) * 80) }}
                        />
                      )}
                      {debtor.aging.days1to30 > 0 && (
                        <div
                          className="h-1.5 bg-yellow-500 rounded-full"
                          style={{ width: Math.max(4, (debtor.aging.days1to30 / debtor.totalOutstanding) * 80) }}
                        />
                      )}
                      {debtor.aging.days31to60 > 0 && (
                        <div
                          className="h-1.5 bg-orange-500 rounded-full"
                          style={{ width: Math.max(4, (debtor.aging.days31to60 / debtor.totalOutstanding) * 80) }}
                        />
                      )}
                      {debtor.aging.days61to90 > 0 && (
                        <div
                          className="h-1.5 bg-red-400 rounded-full"
                          style={{ width: Math.max(4, (debtor.aging.days61to90 / debtor.totalOutstanding) * 80) }}
                        />
                      )}
                      {debtor.aging.days90plus > 0 && (
                        <div
                          className="h-1.5 bg-red-600 rounded-full"
                          style={{ width: Math.max(4, (debtor.aging.days90plus / debtor.totalOutstanding) * 80) }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
