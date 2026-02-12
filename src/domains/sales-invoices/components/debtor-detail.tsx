'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, ChevronDown, ChevronRight, FileText, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { useDebtorDetail } from '../hooks/use-debtor-management'

interface DebtorDetailProps {
  customerId: string
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  overdue: 'bg-destructive/10 text-destructive',
  partially_paid: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  void: 'bg-muted text-muted-foreground line-through',
}

export default function DebtorDetail({ customerId }: DebtorDetailProps) {
  const router = useRouter()
  const params = useParams()
  const locale = params?.locale as string ?? 'en'
  const { detail, isLoading } = useDebtorDetail(customerId)
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground">Debtor not found</p>
      </div>
    )
  }

  const { customer, summary, invoices, runningBalance } = detail

  return (
    <div className="space-y-6">
      {/* Header with back navigation */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/${locale}/invoices#debtors`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h2 className="text-xl font-semibold text-foreground">{customer.name}</h2>
          {customer.email && (
            <p className="text-sm text-muted-foreground">{customer.email}</p>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total Invoiced</p>
            <p className="text-lg font-semibold text-foreground">
              {formatCurrency(summary.totalInvoiced, summary.currency)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total Paid</p>
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(summary.totalPaid, summary.currency)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="text-lg font-semibold text-foreground">
              {formatCurrency(summary.totalOutstanding, summary.currency)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Overdue Invoices</p>
            <p className="text-lg font-semibold text-destructive">
              {summary.overdueCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Statement Link */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/${locale}/invoices/debtors/${customerId}/statement`)}
        >
          <FileText className="h-4 w-4 mr-2" />
          Generate Statement
        </Button>
      </div>

      {/* Invoice Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-foreground">
            Invoice History ({invoices.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No invoices found</p>
          ) : (
            <div className="divide-y divide-border">
              {invoices.map((inv) => (
                <div key={inv._id}>
                  <div
                    className="py-3 flex items-center justify-between cursor-pointer hover:bg-muted/50 -mx-2 px-2 rounded"
                    onClick={() => setExpandedInvoice(expandedInvoice === inv._id ? null : inv._id)}
                  >
                    <div className="flex items-center gap-3">
                      {expandedInvoice === inv._id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">{inv.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatBusinessDate(inv.issueDate)} • Due {formatBusinessDate(inv.dueDate)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge className={STATUS_COLORS[inv.status] ?? 'bg-muted text-muted-foreground'}>
                        {inv.status.replace(/_/g, ' ')}
                      </Badge>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          {formatCurrency(inv.totalAmount, summary.currency)}
                        </p>
                        {inv.balanceDue > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Due: {formatCurrency(inv.balanceDue, summary.currency)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Expanded: per-invoice payments */}
                  {expandedInvoice === inv._id && inv.payments && inv.payments.length > 0 && (
                    <div className="ml-8 mb-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payments</p>
                      {inv.payments.map((pmt, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 bg-muted/30 rounded">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={pmt.type === 'reversal' ? 'destructive' : 'secondary'}
                              className="text-xs"
                            >
                              {pmt.type}
                            </Badge>
                            <span className="text-muted-foreground">{formatBusinessDate(pmt.paymentDate)}</span>
                            {pmt.paymentMethod && (
                              <span className="text-muted-foreground">• {pmt.paymentMethod}</span>
                            )}
                          </div>
                          <span className="font-medium text-foreground">
                            {pmt.type === 'reversal' ? '-' : ''}{formatCurrency(pmt.allocatedAmount, summary.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Running Balance Ledger */}
      {runningBalance.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-foreground">Running Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Date</th>
                    <th className="pb-2 font-medium text-muted-foreground">Description</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Debit</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Credit</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {runningBalance.map((entry, i) => (
                    <tr key={i}>
                      <td className="py-2 text-foreground">{formatBusinessDate(entry.date)}</td>
                      <td className="py-2 text-foreground">{entry.description}</td>
                      <td className="py-2 text-right text-foreground">
                        {entry.debit > 0 ? formatCurrency(entry.debit, summary.currency) : ''}
                      </td>
                      <td className="py-2 text-right text-green-600 dark:text-green-400">
                        {entry.credit > 0 ? formatCurrency(entry.credit, summary.currency) : ''}
                      </td>
                      <td className="py-2 text-right font-medium text-foreground">
                        {formatCurrency(entry.balance, summary.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
