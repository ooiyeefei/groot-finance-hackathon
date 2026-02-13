'use client'

import { useParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useLocale } from 'next-intl'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useSalesInvoice } from '@/domains/sales-invoices/hooks/use-sales-invoices'
import { InvoiceEditorLayout } from '@/domains/sales-invoices/components/invoice-editor-layout'
import { SALES_INVOICE_STATUSES } from '@/domains/sales-invoices/types'
import type { SalesInvoiceFormInput, PaymentTerms, TaxMode, LineItem } from '@/domains/sales-invoices/types'

export default function EditSalesInvoicePage() {
  const params = useParams()
  const locale = useLocale()
  const invoiceId = params.id as string

  const { invoice, isLoading } = useSalesInvoice(invoiceId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-4">
        <p className="text-muted-foreground">Invoice not found.</p>
        <Link href={`/${locale}/invoices#sales-invoices`}>
          <Button variant="outline">Back to Invoices</Button>
        </Link>
      </div>
    )
  }

  if (invoice.status !== SALES_INVOICE_STATUSES.DRAFT) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-4">
        <p className="text-muted-foreground">Only draft invoices can be edited.</p>
        <Link href={`/${locale}/sales-invoices/${invoiceId}`}>
          <Button variant="outline">View Invoice</Button>
        </Link>
      </div>
    )
  }

  const initialData: SalesInvoiceFormInput = {
    customerSnapshot: invoice.customerSnapshot,
    customerId: invoice.customerId ?? undefined,
    lineItems: invoice.lineItems as LineItem[],
    currency: invoice.currency,
    taxMode: invoice.taxMode as TaxMode,
    invoiceDate: invoice.invoiceDate,
    paymentTerms: invoice.paymentTerms as PaymentTerms,
    dueDate: invoice.dueDate,
    notes: invoice.notes,
    paymentInstructions: invoice.paymentInstructions,
    templateId: invoice.templateId,
    signatureName: (invoice as Record<string, unknown>).signatureName as string | undefined,
    invoiceDiscountType: (invoice as Record<string, unknown>).invoiceDiscountType as 'percentage' | 'fixed' | undefined,
    invoiceDiscountValue: (invoice as Record<string, unknown>).invoiceDiscountValue as number | undefined,
    footer: (invoice as Record<string, unknown>).footer as string | undefined,
    customFields: (invoice as Record<string, unknown>).customFields as Array<{ key: string; value: string }> | undefined,
    showTaxId: (invoice as Record<string, unknown>).showTaxId as boolean | undefined,
  }

  return <InvoiceEditorLayout mode="edit" invoiceId={invoiceId} initialData={initialData} />
}
