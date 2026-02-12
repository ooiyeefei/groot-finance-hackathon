'use client'

import { useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { useDebtorStatement } from '../hooks/use-debtor-management'

interface StatementTransaction {
  date: string
  type: 'invoice' | 'payment' | 'reversal'
  reference: string
  description: string
  debit: number
  credit: number
  balance: number
}

interface DebtorStatementProps {
  customerId: string
}

function getDefaultDates() {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const format = (d: Date) => d.toISOString().split('T')[0]
  return { from: format(firstDay), to: format(lastDay) }
}

export default function DebtorStatement({ customerId }: DebtorStatementProps) {
  const router = useRouter()
  const params = useParams()
  const locale = params?.locale as string ?? 'en'
  const defaults = getDefaultDates()
  const [dateFrom, setDateFrom] = useState(defaults.from)
  const [dateTo, setDateTo] = useState(defaults.to)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  const { statement, isLoading } = useDebtorStatement(customerId, dateFrom, dateTo)

  const handleDownloadPdf = useCallback(async () => {
    setIsGeneratingPdf(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default
      const element = document.getElementById('statement-content')
      if (!element) throw new Error('Statement element not found')

      const customerName = statement?.customer?.name ?? 'customer'
      const filename = `statement-${customerName.replace(/\s+/g, '-').toLowerCase()}-${dateFrom}-to-${dateTo}.pdf`

      await html2pdf()
        .set({
          margin: 10,
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(element)
        .save()
    } catch (error) {
      console.error('[DebtorStatement] PDF generation failed:', error)
    } finally {
      setIsGeneratingPdf(false)
    }
  }, [statement, dateFrom, dateTo])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/${locale}/invoices/debtors/${customerId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Detail
        </Button>
        <h2 className="text-xl font-semibold text-foreground">Statement of Account</h2>
      </div>

      {/* Date Range Picker */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4">
          <div className="flex items-end gap-4">
            <div className="space-y-2">
              <Label className="text-foreground">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf || !statement}
            >
              {isGeneratingPdf ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Statement Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : statement ? (
        <div id="statement-content" className="bg-white dark:bg-card p-8 rounded-lg border border-border">
          {/* Statement Header */}
          <div className="flex justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-foreground">{statement.business?.name ?? 'Business'}</h3>
              {statement.business?.address && (
                <p className="text-sm text-muted-foreground">{statement.business.address}</p>
              )}
              {statement.business?.registrationNumber && (
                <p className="text-xs text-muted-foreground">Reg: {statement.business.registrationNumber}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Statement of Account</p>
              <p className="text-sm text-foreground">
                {formatBusinessDate(dateFrom)} — {formatBusinessDate(dateTo)}
              </p>
            </div>
          </div>

          {/* Customer */}
          <div className="mb-6 p-4 bg-muted/30 rounded">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Bill To</p>
            <p className="font-medium text-foreground">{statement.customer?.name}</p>
            {statement.customer?.email && (
              <p className="text-sm text-muted-foreground">{statement.customer.email}</p>
            )}
            {statement.customer?.address && (
              <p className="text-sm text-muted-foreground">{statement.customer.address}</p>
            )}
          </div>

          {/* Opening Balance */}
          <div className="flex justify-between py-3 border-b-2 border-border font-medium">
            <span className="text-foreground">Opening Balance</span>
            <span className="text-foreground">
              {formatCurrency(statement.openingBalance, statement.currency)}
            </span>
          </div>

          {/* Transactions */}
          {statement.transactions.length > 0 ? (
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 font-medium text-muted-foreground">Date</th>
                  <th className="py-2 font-medium text-muted-foreground">Reference</th>
                  <th className="py-2 font-medium text-muted-foreground">Description</th>
                  <th className="py-2 font-medium text-muted-foreground text-right">Debit</th>
                  <th className="py-2 font-medium text-muted-foreground text-right">Credit</th>
                  <th className="py-2 font-medium text-muted-foreground text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {statement.transactions.map((txn: StatementTransaction, i: number) => (
                  <tr key={i}>
                    <td className="py-2 text-foreground">{formatBusinessDate(txn.date)}</td>
                    <td className="py-2 text-foreground">{txn.reference}</td>
                    <td className="py-2 text-foreground">{txn.description}</td>
                    <td className="py-2 text-right text-foreground">
                      {txn.debit > 0 ? formatCurrency(txn.debit, statement.currency) : ''}
                    </td>
                    <td className="py-2 text-right text-green-600 dark:text-green-400">
                      {txn.credit > 0 ? formatCurrency(txn.credit, statement.currency) : ''}
                    </td>
                    <td className="py-2 text-right font-medium text-foreground">
                      {formatCurrency(txn.balance, statement.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No transactions in this period</p>
          )}

          {/* Totals & Closing Balance */}
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Total Debits</span>
              <span>{formatCurrency(statement.totals?.totalDebits ?? 0, statement.currency)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Total Credits</span>
              <span>{formatCurrency(statement.totals?.totalCredits ?? 0, statement.currency)}</span>
            </div>
            <div className="flex justify-between py-3 border-t-2 border-border font-bold text-foreground">
              <span>Closing Balance</span>
              <span>{formatCurrency(statement.closingBalance, statement.currency)}</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-8">Select a date range to generate statement</p>
      )}
    </div>
  )
}
