'use client'

import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'

// ============================================
// TYPES
// ============================================

interface InvoiceTemplateProps {
  invoice: {
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
    amountPaid?: number
    currency: string
    taxMode: string
    notes?: string
    paymentInstructions?: string
    paymentTerms?: string
    signatureName?: string
    status: string
  }
  businessInfo?: {
    companyName?: string
    companyAddress?: string
    companyPhone?: string
    companyEmail?: string
    registrationNumber?: string
    taxId?: string
    logoUrl?: string
  }
}

// ============================================
// COMPONENT
// ============================================

export function ModernInvoiceTemplate({ invoice, businessInfo }: InvoiceTemplateProps) {
  const { customerSnapshot, lineItems, currency } = invoice
  const taxLabel = invoice.taxMode === 'inclusive' ? 'Tax (Inclusive)' : 'Tax'
  const hasDiscount = (invoice.totalDiscount ?? 0) > 0
  const hasAmountPaid = (invoice.amountPaid ?? 0) > 0

  return (
    <div
      id="invoice-template"
      className="bg-card text-foreground w-full max-w-[800px] mx-auto p-10 border border-border rounded-lg shadow-sm"
    >
      {/* ── Header ── */}
      <header className="flex items-start justify-between gap-6 pb-8 border-b border-border" style={{ pageBreakInside: 'avoid' }}>
        {/* Left: company info */}
        <div className="flex-1 min-w-0">
          {businessInfo?.logoUrl && (
            <img
              src={businessInfo.logoUrl}
              alt={businessInfo.companyName ?? 'Company logo'}
              className="h-12 w-auto mb-3 object-contain"
            />
          )}
          {businessInfo?.companyName && (
            <h2 className="text-lg font-semibold text-foreground truncate">
              {businessInfo.companyName}
            </h2>
          )}
          {businessInfo?.companyAddress && (
            <p className="text-sm text-muted-foreground whitespace-pre-line mt-1">
              {businessInfo.companyAddress}
            </p>
          )}
          <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
            {businessInfo?.companyPhone && <p>{businessInfo.companyPhone}</p>}
            {businessInfo?.companyEmail && <p>{businessInfo.companyEmail}</p>}
            {businessInfo?.registrationNumber && (
              <p>Reg: {businessInfo.registrationNumber}</p>
            )}
            {businessInfo?.taxId && <p>Tax ID: {businessInfo.taxId}</p>}
          </div>
        </div>

        {/* Right: invoice title & number */}
        <div className="text-right shrink-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            INVOICE
          </h1>
          <p className="mt-1 text-base font-medium text-muted-foreground">
            {invoice.invoiceNumber}
          </p>
        </div>
      </header>

      {/* ── Dates & Bill To ── */}
      <section className="grid grid-cols-2 gap-8 py-8 border-b border-border">
        {/* Bill To */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Bill To
          </h3>
          <p className="text-sm font-semibold text-foreground">
            {customerSnapshot.businessName}
          </p>
          {customerSnapshot.contactPerson && (
            <p className="text-sm text-muted-foreground">
              {customerSnapshot.contactPerson}
            </p>
          )}
          {customerSnapshot.address && (
            <p className="text-sm text-muted-foreground whitespace-pre-line mt-1">
              {customerSnapshot.address}
            </p>
          )}
          <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {customerSnapshot.email && <p>{customerSnapshot.email}</p>}
            {customerSnapshot.phone && <p>{customerSnapshot.phone}</p>}
            {customerSnapshot.taxId && <p>Tax ID: {customerSnapshot.taxId}</p>}
          </div>
        </div>

        {/* Invoice dates */}
        <div className="text-right">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Invoice Details
          </h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-end gap-2">
              <dt className="text-muted-foreground">Invoice Date:</dt>
              <dd className="font-medium text-foreground">
                {formatBusinessDate(invoice.invoiceDate)}
              </dd>
            </div>
            <div className="flex justify-end gap-2">
              <dt className="text-muted-foreground">Due Date:</dt>
              <dd className="font-medium text-foreground">
                {formatBusinessDate(invoice.dueDate)}
              </dd>
            </div>
            {invoice.paymentTerms && (
              <div className="flex justify-end gap-2">
                <dt className="text-muted-foreground">Payment Terms:</dt>
                <dd className="font-medium text-foreground">
                  {invoice.paymentTerms.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </dd>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <dt className="text-muted-foreground">Currency:</dt>
              <dd className="font-medium text-foreground">{currency}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ── Line Items Table ── */}
      <section className="py-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="text-left py-3 pr-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">
                Item Code
              </th>
              <th className="text-left py-3 pr-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">
                Description
              </th>
              <th className="text-right py-3 px-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">
                Qty
              </th>
              <th className="text-right py-3 px-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">
                Unit Price
              </th>
              <th className="text-right py-3 px-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">
                Tax
              </th>
              <th className="text-right py-3 pl-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, index) => (
              <tr
                key={index}
                className="border-b border-border last:border-b-0"
              >
                <td className="py-3 pr-4 text-muted-foreground tabular-nums">
                  {item.itemCode || '-'}
                </td>
                <td className="py-3 pr-4 text-foreground">
                  <div className="font-medium">{item.description}</div>
                  {item.unitMeasurement && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Unit: {item.unitMeasurement}
                    </div>
                  )}
                  {(item.discountAmount ?? 0) > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Discount: -{formatCurrency(item.discountAmount, currency)}
                    </div>
                  )}
                </td>
                <td className="py-3 px-4 text-right text-foreground tabular-nums">
                  {item.quantity}
                </td>
                <td className="py-3 px-4 text-right text-foreground tabular-nums">
                  {formatCurrency(item.unitPrice, currency)}
                </td>
                <td className="py-3 px-4 text-right text-muted-foreground tabular-nums">
                  {item.taxRate != null && item.taxRate > 0
                    ? `${(item.taxRate * 100).toFixed(1)}%`
                    : '-'}
                </td>
                <td className="py-3 pl-4 text-right font-medium text-foreground tabular-nums">
                  {formatCurrency(item.totalAmount, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── Totals ── */}
      <section className="flex justify-end border-t border-border pt-6 pb-8" style={{ pageBreakInside: 'avoid' }}>
        <dl className="w-72 space-y-2 text-sm">
          {/* Subtotal */}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {formatCurrency(invoice.subtotal, currency)}
            </dd>
          </div>

          {/* Discount */}
          {hasDiscount && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="font-medium text-foreground tabular-nums">
                -{formatCurrency(invoice.totalDiscount, currency)}
              </dd>
            </div>
          )}

          {/* Tax */}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{taxLabel}</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {formatCurrency(invoice.totalTax, currency)}
            </dd>
          </div>

          {/* Total */}
          <div className="flex justify-between border-t border-border pt-2">
            <dt className="text-foreground font-semibold">Total</dt>
            <dd className="font-bold text-foreground tabular-nums">
              {formatCurrency(invoice.totalAmount, currency)}
            </dd>
          </div>

          {/* Amount Paid */}
          {hasAmountPaid && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Amount Paid</dt>
              <dd className="font-medium text-foreground tabular-nums">
                -{formatCurrency(invoice.amountPaid, currency)}
              </dd>
            </div>
          )}

          {/* Balance Due */}
          <div className="flex justify-between border-t border-border pt-2">
            <dt className="text-foreground font-bold text-base">Balance Due</dt>
            <dd className="font-bold text-foreground text-base tabular-nums">
              {formatCurrency(invoice.balanceDue, currency)}
            </dd>
          </div>
        </dl>
      </section>

      {/* ── Notes & Payment Instructions ── */}
      {(invoice.notes || invoice.paymentInstructions) && (
        <footer className="border-t border-border pt-6 space-y-4">
          {invoice.notes && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Notes
              </h3>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {invoice.notes}
              </p>
            </div>
          )}
          {invoice.paymentInstructions && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Payment Instructions
              </h3>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {invoice.paymentInstructions}
              </p>
            </div>
          )}
        </footer>
      )}

      {/* ── Signature ── */}
      {invoice.signatureName && (
        <div className="border-t border-border pt-8 mt-6" style={{ pageBreakInside: 'avoid' }}>
          <div className="flex justify-end">
            <div className="text-right">
              <p
                className="text-2xl text-foreground mb-1"
                style={{ fontFamily: "'Brush Script MT', 'Segoe Script', cursive" }}
              >
                {invoice.signatureName}
              </p>
              <div className="border-t border-border pt-1">
                <p className="text-xs text-muted-foreground">Authorized Signature</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
