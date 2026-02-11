'use client'

import { useParams, useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useSalesInvoice } from '@/domains/sales-invoices/hooks/use-sales-invoices'
import { PaymentRecorder } from '@/domains/sales-invoices/components/payment-recorder'
import { InvoiceStatusBadge } from '@/domains/sales-invoices/components/invoice-status-badge'
import { formatCurrency } from '@/lib/utils/format-number'
import type { SalesInvoiceStatus } from '@/domains/sales-invoices/types'

export default function RecordPaymentPage() {
  const params = useParams()
  const router = useRouter()
  const locale = useLocale()
  const invoiceId = params.id as string

  const { invoice, isLoading } = useSalesInvoice(invoiceId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground">Invoice not found.</p>
        <Link href={`/${locale}/invoices#sales-invoices`} className="mt-4 inline-block">
          <Button variant="outline">Back to Invoices</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/${locale}/sales-invoices/${invoiceId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Record Payment
          </h1>
          <p className="text-sm text-muted-foreground">
            {invoice.invoiceNumber} &mdash; {invoice.customerSnapshot.businessName}
          </p>
        </div>
        <InvoiceStatusBadge status={invoice.status as SalesInvoiceStatus} />
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between bg-muted/50 border border-border rounded-lg px-4 py-3">
        <div>
          <p className="text-sm text-muted-foreground">Invoice Total</p>
          <p className="text-lg font-semibold text-foreground">
            {formatCurrency(invoice.totalAmount, invoice.currency)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Balance Due</p>
          <p className="text-lg font-bold text-foreground">
            {formatCurrency(invoice.balanceDue, invoice.currency)}
          </p>
        </div>
      </div>

      {/* Payment Form */}
      <PaymentRecorder
        invoiceId={invoiceId}
        balanceDue={invoice.balanceDue}
        currency={invoice.currency}
        onSuccess={() => router.push(`/${locale}/sales-invoices/${invoiceId}`)}
        onCancel={() => router.push(`/${locale}/sales-invoices/${invoiceId}`)}
      />
    </div>
  )
}
