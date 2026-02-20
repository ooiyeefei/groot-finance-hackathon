'use client'

import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { formatAddress, hasStructuredAddress } from '@/lib/utils/format-address'

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
      addressLine1?: string
      addressLine2?: string
      addressLine3?: string
      city?: string
      stateCode?: string
      postalCode?: string
      countryCode?: string
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

export function ClassicInvoiceTemplate({ invoice, businessInfo }: InvoiceTemplateProps) {
  const {
    invoiceNumber,
    invoiceDate,
    dueDate,
    customerSnapshot,
    lineItems,
    subtotal,
    totalDiscount,
    totalTax,
    totalAmount,
    balanceDue,
    amountPaid,
    currency,
    taxMode,
    notes,
    paymentInstructions,
  } = invoice

  const enabledPaymentMethods = businessInfo?.paymentMethods?.filter((m) => m.enabled && (m.details || m.qrCodeUrl)) ?? []

  return (
    <div id="invoice-template" className="bg-card text-foreground p-10 max-w-[800px] mx-auto">
      {/* Company Header - Centered */}
      <div className="text-center border-b-2 border-border pb-6 mb-6" style={{ pageBreakInside: 'avoid' }}>
        {businessInfo?.logoUrl && (
          <div className="mb-3">
            <img
              src={businessInfo.logoUrl}
              alt={businessInfo.companyName ?? 'Company logo'}
              className="h-16 mx-auto object-contain"
            />
          </div>
        )}
        {businessInfo?.companyName && (
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {businessInfo.companyName}
          </h1>
        )}
        <div className="mt-2 text-sm text-muted-foreground space-y-0.5">
          {businessInfo?.companyAddress && <p>{businessInfo.companyAddress}</p>}
          <p className="flex items-center justify-center gap-3">
            {businessInfo?.companyPhone && <span>{businessInfo.companyPhone}</span>}
            {businessInfo?.companyPhone && businessInfo?.companyEmail && (
              <span className="text-border">|</span>
            )}
            {businessInfo?.companyEmail && <span>{businessInfo.companyEmail}</span>}
          </p>
          {businessInfo?.registrationNumber && (
            <p>Reg. No: {businessInfo.registrationNumber}</p>
          )}
          {businessInfo?.taxId && <p>TIN: {businessInfo.taxId}</p>}
          {businessInfo?.sstRegistrationNumber && (
            <p>SST Reg: {businessInfo.sstRegistrationNumber}</p>
          )}
        </div>
      </div>

      {/* Invoice Title */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold tracking-widest text-foreground uppercase">
          Invoice
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {invoiceNumber}
        </p>
      </div>

      {/* Invoice Details & Billing Info */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        {/* Invoice Dates */}
        <div>
          <table className="text-sm">
            <tbody>
              <tr>
                <td className="text-muted-foreground pr-4 py-1 font-medium">Invoice Date:</td>
                <td className="text-foreground py-1">{formatBusinessDate(invoiceDate)}</td>
              </tr>
              <tr>
                <td className="text-muted-foreground pr-4 py-1 font-medium">Due Date:</td>
                <td className="text-foreground py-1">{formatBusinessDate(dueDate)}</td>
              </tr>
              {invoice.paymentTerms && (
                <tr>
                  <td className="text-muted-foreground pr-4 py-1 font-medium">Payment Terms:</td>
                  <td className="text-foreground py-1">
                    {invoice.paymentTerms.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </td>
                </tr>
              )}
              <tr>
                <td className="text-muted-foreground pr-4 py-1 font-medium">Tax Mode:</td>
                <td className="text-foreground py-1 capitalize">{taxMode}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bill To - Bordered Box */}
        <div className="border border-border rounded p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Bill To
          </h3>
          <p className="font-semibold text-foreground">{customerSnapshot.businessName}</p>
          {customerSnapshot.contactPerson && (
            <p className="text-sm text-muted-foreground">{customerSnapshot.contactPerson}</p>
          )}
          {hasStructuredAddress(customerSnapshot) ? (
            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">
              {formatAddress(customerSnapshot)}
            </p>
          ) : customerSnapshot.address ? (
            <p className="text-sm text-muted-foreground mt-1">{customerSnapshot.address}</p>
          ) : null}
          <p className="text-sm text-muted-foreground mt-1">{customerSnapshot.email}</p>
          {customerSnapshot.phone && (
            <p className="text-sm text-muted-foreground">{customerSnapshot.phone}</p>
          )}
          {customerSnapshot.tin ? (
            <p className="text-sm text-muted-foreground">TIN: {customerSnapshot.tin}</p>
          ) : customerSnapshot.taxId ? (
            <p className="text-sm text-muted-foreground">Tax ID: {customerSnapshot.taxId}</p>
          ) : null}
          {customerSnapshot.brn && (
            <p className="text-sm text-muted-foreground">BRN: {customerSnapshot.brn}</p>
          )}
        </div>
      </div>

      {/* Line Items Table with Visible Borders */}
      <div className="mb-8">
        <table className="w-full border-collapse border border-border text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="border border-border px-3 py-2.5 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                #
              </th>
              <th className="border border-border px-3 py-2.5 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Description
              </th>
              {lineItems.some((item) => item.itemCode) && (
                <th className="border border-border px-3 py-2.5 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  Code
                </th>
              )}
              <th className="border border-border px-3 py-2.5 text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Qty
              </th>
              <th className="border border-border px-3 py-2.5 text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Unit Price
              </th>
              {lineItems.some((item) => item.taxRate != null && item.taxRate > 0) && (
                <th className="border border-border px-3 py-2.5 text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  Tax
                </th>
              )}
              {lineItems.some((item) => item.discountAmount != null && item.discountAmount > 0) && (
                <th className="border border-border px-3 py-2.5 text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  Discount
                </th>
              )}
              <th className="border border-border px-3 py-2.5 text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, index) => (
              <tr key={index} className="even:bg-muted/30">
                <td className="border border-border px-3 py-2 text-muted-foreground">
                  {index + 1}
                </td>
                <td className="border border-border px-3 py-2 text-foreground">
                  <span>{item.description}</span>
                  {item.itemNotes && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {item.itemNotes}
                    </div>
                  )}
                  {item.unitMeasurement && (
                    <span className="text-muted-foreground text-xs ml-1">
                      ({item.unitMeasurement})
                    </span>
                  )}
                  {item.supplyDateStart && item.supplyDateEnd && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatBusinessDate(item.supplyDateStart)} – {formatBusinessDate(item.supplyDateEnd)}
                    </div>
                  )}
                </td>
                {lineItems.some((li) => li.itemCode) && (
                  <td className="border border-border px-3 py-2 text-muted-foreground">
                    {item.itemCode ?? '-'}
                  </td>
                )}
                <td className="border border-border px-3 py-2 text-right text-foreground">
                  {item.quantity}
                </td>
                <td className="border border-border px-3 py-2 text-right text-foreground">
                  {formatCurrency(item.unitPrice, currency)}
                </td>
                {lineItems.some((li) => li.taxRate != null && li.taxRate > 0) && (
                  <td className="border border-border px-3 py-2 text-right text-muted-foreground">
                    {item.taxRate != null
                      ? `${(item.taxRate * 100).toFixed(0)}%`
                      : '-'}
                  </td>
                )}
                {lineItems.some(
                  (li) => li.discountAmount != null && li.discountAmount > 0
                ) && (
                  <td className="border border-border px-3 py-2 text-right text-muted-foreground">
                    {item.discountAmount != null && item.discountAmount > 0
                      ? `(${formatCurrency(item.discountAmount, currency)})`
                      : '-'}
                  </td>
                )}
                <td className="border border-border px-3 py-2 text-right font-medium text-foreground">
                  {formatCurrency(item.totalAmount, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals Section - Aligned Right */}
      <div className="flex justify-end mb-8" style={{ pageBreakInside: 'avoid' }}>
        <div className="w-72">
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1.5 text-muted-foreground">Subtotal</td>
                <td className="py-1.5 text-right text-foreground">
                  {formatCurrency(subtotal, currency)}
                </td>
              </tr>
              {totalDiscount != null && totalDiscount > 0 && (
                <tr>
                  <td className="py-1.5 text-muted-foreground">Discount</td>
                  <td className="py-1.5 text-right text-foreground">
                    ({formatCurrency(totalDiscount, currency)})
                  </td>
                </tr>
              )}
              <tr>
                <td className="py-1.5 text-muted-foreground">
                  Tax {taxMode === 'inclusive' && '(Inclusive)'}
                </td>
                <td className="py-1.5 text-right text-foreground">
                  {formatCurrency(totalTax, currency)}
                </td>
              </tr>
              <tr className="border-t-2 border-border">
                <td className="py-2 font-bold text-foreground">Total</td>
                <td className="py-2 text-right font-bold text-foreground text-base">
                  {formatCurrency(totalAmount, currency)}
                </td>
              </tr>
              {amountPaid != null && amountPaid > 0 && (
                <tr>
                  <td className="py-1.5 text-muted-foreground">Amount Paid</td>
                  <td className="py-1.5 text-right text-foreground">
                    ({formatCurrency(amountPaid, currency)})
                  </td>
                </tr>
              )}
              {(amountPaid != null && amountPaid > 0) && (
                <tr className="border-t border-border">
                  <td className="py-2 font-bold text-foreground">Balance Due</td>
                  <td className="py-2 text-right font-bold text-foreground text-base">
                    {formatCurrency(balanceDue, currency)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Section */}
      <div className="border-t border-border pt-6 space-y-4">
        {notes && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Notes
            </h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{notes}</p>
          </div>
        )}
        {paymentInstructions && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Payment Instructions
            </h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {paymentInstructions}
            </p>
          </div>
        )}
      </div>

      {/* Payment Methods */}
      {enabledPaymentMethods.length > 0 && (
        <div className="border-t border-border pt-4 mt-4" style={{ pageBreakInside: 'avoid' }}>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Accepted Payment Methods
          </h4>
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
        </div>
      )}

      {/* Signature */}
      {invoice.signatureName && (
        <div className="mt-8 pt-6" style={{ pageBreakInside: 'avoid' }}>
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

      {/* Custom Fields */}
      {invoice.customFields && invoice.customFields.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
            {invoice.customFields.map((field, index) => (
              <div key={index} className="flex justify-between">
                <span className="text-muted-foreground">{field.key}</span>
                <span className="font-medium text-foreground">{field.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      {invoice.footer && (
        <div className="mt-4 border-t border-border pt-4 text-center">
          <p className="text-xs text-muted-foreground whitespace-pre-line">{invoice.footer}</p>
        </div>
      )}

      {/* Bottom Border Line */}
      <div className="mt-8 border-t-2 border-border pt-4 text-center" style={{ pageBreakInside: 'avoid' }}>
        <p className="text-xs text-muted-foreground">
          {invoice.footer ? '' : 'Thank you for your business.'}
        </p>
      </div>
    </div>
  )
}
