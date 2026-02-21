'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InvoiceStatusBadge } from './invoice-status-badge'
import { PeppolStatusBadge } from './peppol-status-badge'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { useCreditNotes, useNetOutstandingAmount } from '@/domains/sales-invoices/hooks/use-sales-invoices'
import type { SalesInvoiceStatus } from '@/domains/sales-invoices/types'
import type { PeppolStatus } from '@/lib/constants/statuses'
import Link from 'next/link'
import { useLocale } from 'next-intl'

interface CreditNoteListProps {
  invoiceId: string
  currency: string
}

export function CreditNoteList({ invoiceId, currency }: CreditNoteListProps) {
  const locale = useLocale()
  const { creditNotes, isLoading } = useCreditNotes(invoiceId)
  const netAmount = useNetOutstandingAmount(invoiceId)

  if (isLoading || creditNotes.length === 0) return null

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Credit Notes ({creditNotes.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {creditNotes.map((cn) => (
          <Link
            key={cn._id}
            href={`/${locale}/sales-invoices/${cn._id}`}
            className="block"
          >
            <div className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/50 transition-colors border border-border">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {cn.invoiceNumber}
                </p>
                <p className="text-xs text-muted-foreground">
                  {cn.creditNoteReason}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBusinessDate(
                    new Date(cn._creationTime).toISOString().split('T')[0]
                  )}
                </p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-sm font-medium text-foreground">
                  -{formatCurrency(cn.totalAmount, currency)}
                </p>
                <div className="flex items-center gap-1.5 justify-end">
                  <InvoiceStatusBadge status={cn.status as SalesInvoiceStatus} />
                  {cn.peppolStatus && (
                    <PeppolStatusBadge status={cn.peppolStatus as PeppolStatus} />
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))}

        {/* Net outstanding summary */}
        {netAmount && (
          <div className="border-t border-border pt-2 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Original Amount</span>
              <span>{formatCurrency(netAmount.originalAmount, currency)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Total Credited</span>
              <span>-{formatCurrency(netAmount.totalCredited, currency)}</span>
            </div>
            <div className="flex justify-between font-semibold text-foreground">
              <span>Net Outstanding</span>
              <span>{formatCurrency(netAmount.netOutstanding, currency)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
