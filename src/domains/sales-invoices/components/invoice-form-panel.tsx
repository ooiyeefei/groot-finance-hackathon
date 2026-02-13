'use client'

import CustomerSelector from './customer-selector'
import { CurrencySection } from './currency-section'
import InvoiceLineItemsTable from './invoice-line-items-table'
import { PaymentCollectionSection } from './payment-collection-section'
import { AdditionalOptionsSection } from './additional-options-section'
import { formatCurrency } from '@/lib/utils/format-number'
import type { Customer, InvoiceTemplateItem, LineItem, PaymentTerms, TaxMode, DiscountType, CustomerSnapshot } from '../types'

interface InvoiceFormPanelProps {
  form: {
    // Customer
    customerId: string | undefined
    setCustomerId: (id: string | undefined) => void
    customerSnapshot: CustomerSnapshot
    setCustomerSnapshot: (snapshot: CustomerSnapshot) => void
    // Line items
    lineItems: LineItem[]
    addLineItem: () => void
    removeLineItem: (index: number) => void
    updateLineItem: (index: number, updates: Partial<LineItem>) => void
    addCatalogItem: (item: { name: string; description?: string; unitPrice: number; currency: string; sku?: string; unitMeasurement?: string; taxRate?: number; _id: string }) => void
    // Settings
    currency: string
    setCurrency: (currency: string) => void
    taxMode: TaxMode
    setTaxMode: (mode: TaxMode) => void
    invoiceDate: string
    setInvoiceDate: (date: string) => void
    paymentTerms: PaymentTerms
    setPaymentTerms: (terms: PaymentTerms) => void
    dueDate: string
    setDueDate: (date: string) => void
    notes: string
    setNotes: (notes: string) => void
    paymentInstructions: string
    setPaymentInstructions: (instructions: string) => void
    templateId: string
    setTemplateId: (id: string) => void
    signatureName: string
    setSignatureName: (name: string) => void
    invoiceDiscountType: DiscountType | undefined
    setInvoiceDiscountType: (type: DiscountType | undefined) => void
    invoiceDiscountValue: number | undefined
    setInvoiceDiscountValue: (value: number | undefined) => void
    // New fields
    footer: string
    setFooter: (footer: string) => void
    customFields: Array<{ key: string; value: string }>
    setCustomFields: (fields: Array<{ key: string; value: string }>) => void
    showTaxId: boolean
    setShowTaxId: (show: boolean) => void
    // Totals
    totals: { subtotal: number; totalDiscount: number; totalTax: number; totalAmount: number }
    errors: Record<string, string>
  }
  businessSettings?: Record<string, unknown>
  onDraftCreated?: (invoiceId: string) => void
  customNoteTemplates?: InvoiceTemplateItem[]
  customPaymentTemplates?: InvoiceTemplateItem[]
  onAddTemplate?: (type: 'note' | 'payment', label: string, text: string) => Promise<void>
  onDeleteTemplate?: (type: 'note' | 'payment', templateId: string) => Promise<void>
}

export function InvoiceFormPanel({
  form,
  customNoteTemplates,
  customPaymentTemplates,
  onAddTemplate,
  onDeleteTemplate,
}: InvoiceFormPanelProps) {
  const handleCustomerSelect = (customer: Customer) => {
    form.setCustomerId(customer._id)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Section 1: Customer */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Customer <span className="text-destructive">*</span></h2>
        <CustomerSelector
          value={form.customerSnapshot}
          onChange={form.setCustomerSnapshot}
          onCustomerSelect={handleCustomerSelect}
        />
      </section>

      {/* Section 2: Currency & Tax */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Currency & Tax</h2>
        <CurrencySection
          currency={form.currency}
          onCurrencyChange={form.setCurrency}
          taxMode={form.taxMode}
          onTaxModeChange={form.setTaxMode}
          hasLineItems={form.lineItems.some((item) => item.description.length > 0 || item.unitPrice > 0)}
        />
      </section>

      {/* Section 3: Line Items */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Items <span className="text-destructive">*</span></h2>
        <InvoiceLineItemsTable
          lineItems={form.lineItems}
          onUpdateItem={form.updateLineItem}
          onRemoveItem={form.removeLineItem}
          onAddItem={form.addLineItem}
          currency={form.currency}
          taxMode={form.taxMode}
        />

        {/* Invoice totals */}
        <div className="mt-4 bg-muted/30 rounded-lg p-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-foreground font-medium tabular-nums">
              {formatCurrency(form.totals.subtotal, form.currency)}
            </span>
          </div>
          {form.totals.totalDiscount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="text-foreground tabular-nums">
                -{formatCurrency(form.totals.totalDiscount, form.currency)}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span className="text-foreground tabular-nums">
              {formatCurrency(form.totals.totalTax, form.currency)}
            </span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 font-semibold">
            <span className="text-foreground">Total</span>
            <span className="text-foreground tabular-nums">
              {formatCurrency(form.totals.totalAmount, form.currency)}
            </span>
          </div>
        </div>
      </section>

      {/* Section 4: Payment Collection */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Payment collection</h2>
        <PaymentCollectionSection
          invoiceDate={form.invoiceDate}
          onInvoiceDateChange={form.setInvoiceDate}
          paymentTerms={form.paymentTerms}
          onPaymentTermsChange={form.setPaymentTerms}
          dueDate={form.dueDate}
          onDueDateChange={form.setDueDate}
        />
      </section>

      {/* Section 5: Additional Options */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Additional options</h2>
        <AdditionalOptionsSection
          templateId={form.templateId}
          onTemplateChange={form.setTemplateId}
          memo={form.notes}
          onMemoChange={form.setNotes}
          footer={form.footer}
          onFooterChange={form.setFooter}
          customFields={form.customFields}
          onCustomFieldsChange={form.setCustomFields}
          showTaxId={form.showTaxId}
          onToggleTaxId={form.setShowTaxId}
          paymentInstructions={form.paymentInstructions}
          onPaymentInstructionsChange={form.setPaymentInstructions}
          signatureName={form.signatureName}
          onSignatureNameChange={form.setSignatureName}
          customNoteTemplates={customNoteTemplates}
          customPaymentTemplates={customPaymentTemplates}
          onAddTemplate={onAddTemplate}
          onDeleteTemplate={onDeleteTemplate}
        />
      </section>

      {/* Validation errors */}
      {Object.keys(form.errors).length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
          <p className="text-sm font-medium text-destructive mb-2">Please fix the following:</p>
          <ul className="text-sm text-destructive space-y-1">
            {Object.values(form.errors).map((error, i) => (
              <li key={i}>• {error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
