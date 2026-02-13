'use client'

import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'

interface EmailPreviewProps {
  recipientEmail: string
  companyName: string
  invoiceNumber: string
  totalAmount: number
  currency: string
  dueDate: string
  fromName: string
  toName: string
  lineItems: Array<{
    description: string
    quantity: number
    unitPrice: number
    totalAmount: number
  }>
  subtotal: number
  totalTax: number
  amountPaid?: number
}

export function EmailPreview({
  recipientEmail,
  companyName,
  invoiceNumber,
  totalAmount,
  currency,
  dueDate,
  fromName,
  toName,
  lineItems,
  subtotal,
  totalTax,
  amountPaid = 0,
}: EmailPreviewProps) {
  const balanceDue = totalAmount - amountPaid

  return (
    <div className="bg-muted/30 p-6 rounded-lg">
      {/* Email envelope header */}
      <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
        {/* Email meta */}
        <div className="px-6 py-4 border-b border-border bg-muted/30">
          <div className="space-y-1 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-12 shrink-0">To:</span>
              <span className="text-foreground">{recipientEmail || 'customer@example.com'}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-12 shrink-0">From:</span>
              <span className="text-foreground">{companyName || 'Your Company'}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-12 shrink-0">Subject:</span>
              <span className="text-foreground font-medium">
                Invoice {invoiceNumber} from {companyName || 'Your Company'}
              </span>
            </div>
          </div>
        </div>

        {/* Email body */}
        <div className="p-6 space-y-6">
          {/* Company name header */}
          <div className="text-center pb-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">
              {companyName || 'Your Company'}
            </h2>
          </div>

          {/* Amount due hero */}
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">Amount due</p>
            <p className="text-3xl font-bold text-foreground">
              {formatCurrency(balanceDue, currency)}
            </p>
            <p className="text-sm text-muted-foreground">
              Due {formatBusinessDate(dueDate)}
            </p>
          </div>

          {/* Invoice details */}
          <div className="bg-muted/30 rounded-lg p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice</span>
              <span className="text-foreground font-medium">{invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">To</span>
              <span className="text-foreground">{toName || 'Customer'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">From</span>
              <span className="text-foreground">{fromName || 'Your Company'}</span>
            </div>
          </div>

          {/* Line items summary */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">Items</h3>
            <div className="space-y-1">
              {lineItems.map((item, index) => (
                <div key={index} className="flex justify-between text-sm py-1.5 border-b border-border last:border-b-0">
                  <div className="flex-1 min-w-0">
                    <span className="text-foreground truncate block">{item.description || 'Item'}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.quantity} x {formatCurrency(item.unitPrice, currency)}
                    </span>
                  </div>
                  <span className="text-foreground font-medium ml-4 tabular-nums">
                    {formatCurrency(item.totalAmount, currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="border-t border-border pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-foreground tabular-nums">{formatCurrency(subtotal, currency)}</span>
            </div>
            {totalTax > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="text-foreground tabular-nums">{formatCurrency(totalTax, currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t border-border pt-2">
              <span className="text-foreground">Total</span>
              <span className="text-foreground tabular-nums">{formatCurrency(totalAmount, currency)}</span>
            </div>
            {amountPaid > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount paid</span>
                  <span className="text-foreground tabular-nums">-{formatCurrency(amountPaid, currency)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-foreground">Amount due</span>
                  <span className="text-foreground tabular-nums">{formatCurrency(balanceDue, currency)}</span>
                </div>
              </>
            )}
          </div>

          {/* CTA Button */}
          <div className="text-center pt-2">
            <div className="inline-block px-8 py-3 bg-primary text-primary-foreground font-medium rounded-md text-sm cursor-default">
              Pay this invoice
            </div>
          </div>

          {/* Download link */}
          <p className="text-center text-xs text-muted-foreground">
            <span className="underline cursor-default">Download invoice PDF</span>
          </p>
        </div>

        {/* Email footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/20 text-center">
          <p className="text-xs text-muted-foreground">
            This invoice was sent by {companyName || 'Your Company'}
          </p>
        </div>
      </div>
    </div>
  )
}
