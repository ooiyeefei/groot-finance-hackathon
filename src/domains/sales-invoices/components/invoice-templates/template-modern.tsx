'use client'

import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { formatAddress, hasStructuredAddress } from '@/lib/utils/format-address'

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
      tin?: string
      brn?: string
      idType?: string
      sstRegistration?: string
      addressLine1?: string
      addressLine2?: string
      addressLine3?: string
      city?: string
      stateCode?: string
      postalCode?: string
      countryCode?: string
    }
    customerFieldsVisibility?: {
      contactPerson?: boolean
      email?: boolean
      phone?: boolean
      address?: boolean
      tin?: boolean
      brn?: boolean
      sstRegistration?: boolean
      idType?: boolean
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
      itemNotes?: string
      supplyDateStart?: string
      supplyDateEnd?: string
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
}

// ============================================
// COMPONENT
// ============================================

export function ModernInvoiceTemplate({ invoice, businessInfo }: InvoiceTemplateProps) {
  const { customerSnapshot, lineItems, currency } = invoice
  // Default: all fields visible (backward compatible)
  const vis = {
    contactPerson: true, email: true, phone: true, address: true,
    tin: true, brn: true, sstRegistration: false, idType: false,
    ...invoice.customerFieldsVisibility,
  }
  const taxLabel = invoice.taxMode === 'inclusive' ? 'Tax (Inclusive)' : 'Tax'
  const hasDiscount = (invoice.totalDiscount ?? 0) > 0
  const hasAmountPaid = (invoice.amountPaid ?? 0) > 0
  const enabledPaymentMethods = businessInfo?.paymentMethods?.filter((m) => m.enabled && (m.details || m.qrCodeUrl)) ?? []

  return (
    <div
      id="invoice-template"
      className="bg-card text-foreground w-full max-w-[800px] mx-auto p-4 sm:p-10 border border-border rounded-lg shadow-sm overflow-x-auto"
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
            {businessInfo?.taxId && <p>TIN: {businessInfo.taxId}</p>}
            {businessInfo?.sstRegistrationNumber && (
              <p>SST Reg: {businessInfo.sstRegistrationNumber}</p>
            )}
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
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 py-6 sm:py-8 border-b border-border">
        {/* Bill To */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Bill To
          </h3>
          <p className="text-sm font-semibold text-foreground">
            {customerSnapshot.businessName}
          </p>
          {vis.contactPerson && customerSnapshot.contactPerson && (
            <p className="text-sm text-muted-foreground">
              {customerSnapshot.contactPerson}
            </p>
          )}
          {vis.address && (
            hasStructuredAddress(customerSnapshot) ? (
              <p className="text-sm text-muted-foreground whitespace-pre-line mt-1">
                {formatAddress(customerSnapshot)}
              </p>
            ) : customerSnapshot.address ? (
              <p className="text-sm text-muted-foreground whitespace-pre-line mt-1">
                {customerSnapshot.address}
              </p>
            ) : null
          )}
          <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {vis.email && customerSnapshot.email && <p>{customerSnapshot.email}</p>}
            {vis.phone && customerSnapshot.phone && <p>{customerSnapshot.phone}</p>}
            {vis.idType && customerSnapshot.idType && <p>ID Type: {customerSnapshot.idType}</p>}
            {vis.tin && (customerSnapshot.tin ? (
              <p>TIN: {customerSnapshot.tin}</p>
            ) : customerSnapshot.taxId ? (
              <p>Tax ID: {customerSnapshot.taxId}</p>
            ) : null)}
            {vis.brn && customerSnapshot.brn && <p>BRN: {customerSnapshot.brn}</p>}
            {vis.sstRegistration && customerSnapshot.sstRegistration && <p>SST: {customerSnapshot.sstRegistration}</p>}
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
      <section className="py-6 sm:py-8 overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
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
                  {item.itemNotes && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {item.itemNotes}
                    </div>
                  )}
                  {item.unitMeasurement && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Unit: {item.unitMeasurement}
                    </div>
                  )}
                  {item.supplyDateStart && item.supplyDateEnd && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatBusinessDate(item.supplyDateStart)} – {formatBusinessDate(item.supplyDateEnd)}
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

      {/* ── Custom Fields ── */}
      {invoice.customFields && invoice.customFields.length > 0 && (
        <section className="border-t border-border pt-6 pb-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {invoice.customFields.map((field, index) => (
              <div key={index} className="flex justify-between">
                <dt className="text-muted-foreground">{field.key}</dt>
                <dd className="font-medium text-foreground">{field.value}</dd>
              </div>
            ))}
          </div>
        </section>
      )}

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

      {/* ── Payment Methods ── */}
      {enabledPaymentMethods.length > 0 && (
        <section className="border-t border-border pt-6 mt-2" style={{ pageBreakInside: 'avoid' }}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Accepted Payment Methods
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {enabledPaymentMethods.map((method) => (
              <div key={method.id} className="flex gap-3">
                {method.qrCodeUrl && (
                  <img
                    src={method.qrCodeUrl}
                    alt={`${method.label} QR Code`}
                    className="w-16 h-16 rounded border border-border object-contain bg-white shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{method.label}</p>
                  {method.details && (
                    <p className="text-xs text-muted-foreground whitespace-pre-line mt-0.5">{method.details}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      {invoice.footer && (
        <div className="border-t border-border pt-4 mt-4">
          <p className="text-xs text-muted-foreground text-center whitespace-pre-line">
            {invoice.footer}
          </p>
        </div>
      )}

      {/* ── Signature ── */}
      {invoice.signatureName && (
        <div className="border-t border-border pt-8 mt-6" style={{ pageBreakInside: 'avoid' }}>
          <div className="flex justify-end">
            <div className="text-right">
              <p
                className="text-2xl text-foreground mb-1"
                style={{ fontFamily: "'Autography', cursive" }}
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
