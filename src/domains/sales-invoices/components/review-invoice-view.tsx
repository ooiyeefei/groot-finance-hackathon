'use client'

import { ArrowLeft, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InvoicePreview } from './invoice-preview'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'

interface ReviewInvoiceViewProps {
  invoiceData: {
    invoiceNumber: string
    invoiceDate: string
    dueDate: string
    customerSnapshot: {
      businessName: string
      contactPerson?: string
      email: string
      phone?: string
      address?: string
      taxId?: string
    }
    lineItems: Array<{
      description: string
      quantity: number
      unitPrice: number
      taxRate?: number
      taxAmount?: number
      discountAmount?: number
      totalAmount: number
      currency: string
      itemCode?: string
      unitMeasurement?: string
    }>
    subtotal: number
    totalDiscount?: number
    totalTax: number
    totalAmount: number
    balanceDue: number
    currency: string
    taxMode: string
    notes?: string
    paymentInstructions?: string
    paymentTerms?: string
    signatureName?: string
    status: string
    footer?: string
    customFields?: Array<{ key: string; value: string }>
    showTaxId?: boolean
  }
  businessInfo?: {
    companyName?: string
    companyAddress?: string
    companyPhone?: string
    companyEmail?: string
    registrationNumber?: string
    taxId?: string
    sstRegistrationNumber?: string
    logoUrl?: string
    paymentMethods?: Array<{
      id: string
      label: string
      enabled: boolean
      details?: string
      qrCodeUrl?: string
    }>
  }
  onSendInvoice: () => Promise<void>
  onBackToEdit: () => void
  isSending: boolean
}

export function ReviewInvoiceView({
  invoiceData,
  businessInfo,
  onSendInvoice,
  onBackToEdit,
  isSending,
}: ReviewInvoiceViewProps) {
  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBackToEdit}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to editing
          </Button>
        </div>

        <h1 className="text-sm font-semibold text-foreground">Review invoice</h1>

        <Button
          size="sm"
          onClick={onSendInvoice}
          disabled={isSending}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-1.5" />
          )}
          {isSending ? 'Sending...' : 'Send invoice'}
        </Button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
          {/* Summary card */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Invoice Summary</h2>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block">Invoice number</span>
                <span className="text-foreground font-medium">{invoiceData.invoiceNumber}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Total amount</span>
                <span className="text-foreground font-bold text-lg">
                  {formatCurrency(invoiceData.totalAmount, invoiceData.currency)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Customer</span>
                <span className="text-foreground font-medium">{invoiceData.customerSnapshot.businessName}</span>
                <span className="text-muted-foreground block text-xs">{invoiceData.customerSnapshot.email}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Due date</span>
                <span className="text-foreground font-medium">{formatBusinessDate(invoiceData.dueDate)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Invoice date</span>
                <span className="text-foreground">{formatBusinessDate(invoiceData.invoiceDate)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Line items</span>
                <span className="text-foreground">{invoiceData.lineItems.length} item{invoiceData.lineItems.length !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Totals breakdown */}
            <div className="border-t border-border pt-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-foreground tabular-nums">{formatCurrency(invoiceData.subtotal, invoiceData.currency)}</span>
              </div>
              {(invoiceData.totalDiscount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-foreground tabular-nums">-{formatCurrency(invoiceData.totalDiscount, invoiceData.currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="text-foreground tabular-nums">{formatCurrency(invoiceData.totalTax, invoiceData.currency)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-border pt-2">
                <span className="text-foreground">Total</span>
                <span className="text-foreground tabular-nums">{formatCurrency(invoiceData.totalAmount, invoiceData.currency)}</span>
              </div>
            </div>
          </div>

          {/* Invoice preview */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Invoice preview</h3>
            <InvoicePreview
              invoice={invoiceData}
              businessInfo={businessInfo}
              showActions={false}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
