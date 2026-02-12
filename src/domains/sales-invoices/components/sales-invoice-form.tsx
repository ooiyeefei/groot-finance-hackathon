'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Save, Eye, Send, ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useActiveBusiness, useBusinessProfile } from '@/contexts/business-context'
import { useSalesInvoiceForm } from '../hooks/use-sales-invoice-form'
import { useSalesInvoiceMutations, useNextInvoiceNumber } from '../hooks/use-sales-invoices'
import { useCatalogItemSearch } from '../hooks/use-catalog-items'
import { useInvoicePdf } from '../hooks/use-invoice-pdf'
import { InvoicePreview } from './invoice-preview'
import { InvoiceStatusBadge } from './invoice-status-badge'
import CustomerSelector from './customer-selector'
import { formatCurrency } from '@/lib/utils/format-number'
import {
  SUPPORTED_CURRENCIES,
  PAYMENT_TERMS_LABELS,
  NOTE_TEMPLATES,
  PAYMENT_INSTRUCTION_TEMPLATES,
  type PaymentTerms,
  type CustomerSnapshot,
} from '../types'
import type { Id } from '../../../../convex/_generated/dataModel'

type FormMode = 'edit' | 'preview'

export function SalesInvoiceForm() {
  const router = useRouter()
  const locale = useLocale()
  const { businessId, business } = useActiveBusiness()
  const { profile: businessProfile } = useBusinessProfile()
  const [mode, setMode] = useState<FormMode>('edit')
  const [isSaving, setIsSaving] = useState(false)
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('')
  const [showCatalogDropdown, setShowCatalogDropdown] = useState(false)

  const invoiceSettings = (business as unknown as Record<string, unknown>)?.invoiceSettings as Record<string, unknown> | undefined

  const form = useSalesInvoiceForm({
    defaultCurrency: (invoiceSettings?.defaultCurrency as string) ?? (business as unknown as Record<string, unknown>)?.homeCurrency as string ?? 'SGD',
    defaultPaymentTerms: (invoiceSettings?.defaultPaymentTerms as PaymentTerms) ?? 'net_30',
    defaultPaymentInstructions: invoiceSettings?.defaultPaymentInstructions as string,
    defaultTemplateId: (invoiceSettings?.selectedTemplate as string) ?? 'modern',
  })

  const { createInvoice, sendInvoice, generateUploadUrl, storePdfStorageId } = useSalesInvoiceMutations()
  const nextInvoiceNumber = useNextInvoiceNumber()
  const { generatePdf, generatePdfBlob, isGenerating } = useInvoicePdf()
  const [isSending, setIsSending] = useState(false)

  const { results: catalogResults } = useCatalogItemSearch(catalogSearchQuery, showCatalogDropdown)

  /** Upload PDF blob to Convex storage and store the reference on the invoice */
  const uploadPdfToStorage = useCallback(async (invoiceId: Id<"sales_invoices">) => {
    try {
      const invoiceNum = nextInvoiceNumber ?? 'INV-XXXX-XXX'
      const pdfResult = await generatePdfBlob(invoiceNum)
      if (!pdfResult.success || !pdfResult.blob) return

      // Upload to Convex storage
      const uploadUrl = await generateUploadUrl()
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: pdfResult.blob,
      })
      if (!uploadResponse.ok) return

      const { storageId } = await uploadResponse.json()
      await storePdfStorageId({
        id: invoiceId,
        businessId: businessId as Id<"businesses">,
        storageId,
      })
    } catch {
      console.error('Failed to upload PDF to storage')
    }
  }, [nextInvoiceNumber, generatePdfBlob, generateUploadUrl, storePdfStorageId, businessId])

  const createInvoiceData = useCallback(() => ({
    businessId: businessId as Id<"businesses">,
    customerId: form.getFormData().customerId as Id<"customers"> | undefined,
    customerSnapshot: form.getFormData().customerSnapshot,
    lineItems: form.getFormData().lineItems,
    currency: form.getFormData().currency,
    taxMode: form.getFormData().taxMode,
    invoiceDate: form.getFormData().invoiceDate,
    paymentTerms: form.getFormData().paymentTerms,
    dueDate: form.getFormData().dueDate,
    notes: form.getFormData().notes,
    paymentInstructions: form.getFormData().paymentInstructions,
    templateId: form.getFormData().templateId,
    signatureName: form.getFormData().signatureName,
    invoiceDiscountType: form.getFormData().invoiceDiscountType,
    invoiceDiscountValue: form.getFormData().invoiceDiscountValue,
  }), [businessId, form])

  const handleSaveDraft = useCallback(async () => {
    if (!businessId || !form.isValid) return
    setIsSaving(true)
    try {
      const invoiceId = await createInvoice(createInvoiceData())

      // If in preview mode (template rendered), generate and store PDF
      if (mode === 'preview') {
        await uploadPdfToStorage(invoiceId)
      }

      router.push(`/${locale}/invoices#sales-invoices`)
    } catch (error) {
      console.error('Failed to save invoice:', error)
    } finally {
      setIsSaving(false)
    }
  }, [businessId, form, mode, createInvoice, createInvoiceData, uploadPdfToStorage, router, locale])

  const handleSaveAndSend = useCallback(async () => {
    if (!businessId || !form.isValid) return
    setIsSending(true)
    try {
      // 1. Create the invoice
      const invoiceId = await createInvoice(createInvoiceData())

      // 2. Upload PDF to Convex storage (template is rendered in preview)
      await uploadPdfToStorage(invoiceId)

      // 3. Mark as sent
      await sendInvoice({ id: invoiceId, businessId: businessId as Id<"businesses"> })

      // 4. Send email — the API will fetch the stored PDF via pdfUrl
      const resolvedBusinessName = businessProfile?.name || (business as unknown as Record<string, unknown>)?.businessName as string || 'Our Company'
      try {
        await fetch(`/api/v1/sales-invoices/${invoiceId}/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: form.customerSnapshot.email,
            recipientName: form.customerSnapshot.contactPerson || form.customerSnapshot.businessName,
            invoiceNumber: nextInvoiceNumber ?? 'INV-XXXX-XXX',
            invoiceDate: form.invoiceDate,
            dueDate: form.dueDate,
            totalAmount: form.totals.totalAmount,
            currency: form.currency,
            balanceDue: form.totals.totalAmount,
            subtotal: form.totals.subtotal,
            totalTax: form.totals.totalTax,
            paymentInstructions: form.paymentInstructions,
            businessName: resolvedBusinessName,
            businessAddress: businessProfile?.address || undefined,
            businessPhone: businessProfile?.contact_phone || undefined,
            businessEmail: businessProfile?.contact_email || undefined,
            lineItems: form.lineItems.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.totalAmount,
            })),
          }),
        })
      } catch (emailError) {
        console.error('Failed to send invoice email:', emailError)
      }

      router.push(`/${locale}/invoices#sales-invoices`)
    } catch (error) {
      console.error('Failed to save and send invoice:', error)
    } finally {
      setIsSending(false)
    }
  }, [businessId, business, businessProfile, form, nextInvoiceNumber, createInvoice, createInvoiceData, sendInvoice, uploadPdfToStorage, router, locale])

  const handleCustomerSelect = useCallback((customer: { _id: string; businessName: string; contactPerson?: string; email: string; phone?: string; address?: string; taxId?: string }) => {
    form.setCustomerId(customer._id)
  }, [form])

  const handleSelectCatalogItem = useCallback((item: {
    _id: string
    name: string
    description?: string
    unitPrice: number
    currency: string
    sku?: string
    unitMeasurement?: string
    taxRate?: number
  }) => {
    form.addCatalogItem(item)
    setShowCatalogDropdown(false)
    setCatalogSearchQuery('')
  }, [form])

  // Build preview invoice object
  const previewInvoice = {
    invoiceNumber: nextInvoiceNumber ?? 'INV-XXXX-XXX',
    invoiceDate: form.invoiceDate,
    dueDate: form.dueDate,
    customerSnapshot: form.customerSnapshot,
    lineItems: form.lineItems,
    subtotal: form.totals.subtotal,
    totalDiscount: form.totals.totalDiscount,
    totalTax: form.totals.totalTax,
    totalAmount: form.totals.totalAmount,
    balanceDue: form.totals.totalAmount,
    currency: form.currency,
    taxMode: form.taxMode,
    notes: form.notes,
    paymentInstructions: form.paymentInstructions,
    paymentTerms: form.paymentTerms,
    signatureName: form.signatureName,
    status: 'draft',
  }

  // Build business info from profile for invoice preview
  const businessInfo = businessProfile ? {
    companyName: businessProfile.name,
    companyAddress: businessProfile.address || undefined,
    companyPhone: businessProfile.contact_phone || undefined,
    companyEmail: businessProfile.contact_email || undefined,
  } : undefined

  if (mode === 'preview') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMode('edit')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Edit
          </Button>
        </div>
        <InvoicePreview
          invoice={previewInvoice}
          businessInfo={businessInfo}
          templateId={form.templateId}
          onDownloadPdf={() => generatePdf(previewInvoice.invoiceNumber)}
          onSend={form.isValid && !isSending ? handleSaveAndSend : undefined}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/invoices#sales-invoices`)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-foreground">New Sales Invoice</h2>
            <p className="text-sm text-muted-foreground">{nextInvoiceNumber ?? '...'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setMode('preview')} className="bg-green-600 hover:bg-green-700 text-white">
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </Button>
          <Button size="sm" onClick={handleSaveDraft} disabled={isSaving || !form.isValid} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Draft'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form - Left 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Section */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Bill To</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerSelector
                value={form.customerSnapshot}
                onChange={form.setCustomerSnapshot}
                onCustomerSelect={handleCustomerSelect}
              />
              {form.errors.customerName && <p className="text-destructive text-xs mt-2">{form.errors.customerName}</p>}
              {form.errors.customerEmail && <p className="text-destructive text-xs mt-1">{form.errors.customerEmail}</p>}
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-foreground text-base">Line Items</CardTitle>
              {/* Catalog item search */}
              <div className="relative">
                <Input
                  placeholder="Add from catalog..."
                  value={catalogSearchQuery}
                  onChange={(e) => {
                    setCatalogSearchQuery(e.target.value)
                    setShowCatalogDropdown(e.target.value.length > 0)
                  }}
                  onFocus={() => catalogSearchQuery.length > 0 && setShowCatalogDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCatalogDropdown(false), 200)}
                  className="bg-input border-border text-foreground w-48 text-sm"
                />
                {showCatalogDropdown && catalogResults.length > 0 && (
                  <div className="absolute z-10 right-0 w-64 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {catalogResults.map((item) => (
                      <button
                        key={item._id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted text-foreground text-sm"
                        onMouseDown={() => handleSelectCatalogItem(item)}
                      >
                        <div className="font-medium">{item.name}</div>
                        <div className="text-muted-foreground text-xs">
                          {formatCurrency(item.unitPrice, item.currency)}
                          {item.sku && ` · ${item.sku}`}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-muted-foreground font-medium py-2 px-2">Description</th>
                      <th className="text-right text-muted-foreground font-medium py-2 px-2 w-20">Qty</th>
                      <th className="text-right text-muted-foreground font-medium py-2 px-2 w-28">Unit Price</th>
                      <th className="text-right text-muted-foreground font-medium py-2 px-2 w-20">Tax %</th>
                      <th className="text-right text-muted-foreground font-medium py-2 px-2 w-28">Amount</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lineItems.map((item, index) => (
                      <tr key={index} className="border-b border-border/50">
                        <td className="py-2 px-2">
                          <Input
                            placeholder="Item description"
                            value={item.description}
                            onChange={(e) => form.updateLineItem(index, { description: e.target.value })}
                            className="bg-input border-border text-foreground text-sm h-8"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={item.quantity}
                            onChange={(e) => form.updateLineItem(index, { quantity: parseFloat(e.target.value) || 0 })}
                            className="bg-input border-border text-foreground text-sm h-8 text-right"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => form.updateLineItem(index, { unitPrice: parseFloat(e.target.value) || 0 })}
                            className="bg-input border-border text-foreground text-sm h-8 text-right"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={(item.taxRate ?? 0) * 100}
                            onChange={(e) => form.updateLineItem(index, { taxRate: (parseFloat(e.target.value) || 0) / 100 })}
                            className="bg-input border-border text-foreground text-sm h-8 text-right"
                          />
                        </td>
                        <td className="py-2 px-2 text-right text-foreground font-medium">
                          {formatCurrency(item.totalAmount, form.currency)}
                        </td>
                        <td className="py-2 px-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => form.removeLineItem(index)}
                            disabled={form.lineItems.length <= 1}
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-3">
                {form.lineItems.map((item, index) => (
                  <div key={index} className="bg-muted rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <Input
                        placeholder="Item description"
                        value={item.description}
                        onChange={(e) => form.updateLineItem(index, { description: e.target.value })}
                        className="bg-input border-border text-foreground text-sm flex-1 mr-2"
                      />
                      <Button variant="ghost" size="sm" onClick={() => form.removeLineItem(index)} disabled={form.lineItems.length <= 1}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Qty</Label>
                        <Input type="number" value={item.quantity} onChange={(e) => form.updateLineItem(index, { quantity: parseFloat(e.target.value) || 0 })} className="bg-input border-border text-foreground text-sm h-8" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Price</Label>
                        <Input type="number" value={item.unitPrice} onChange={(e) => form.updateLineItem(index, { unitPrice: parseFloat(e.target.value) || 0 })} className="bg-input border-border text-foreground text-sm h-8" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Tax %</Label>
                        <Input type="number" value={(item.taxRate ?? 0) * 100} onChange={(e) => form.updateLineItem(index, { taxRate: (parseFloat(e.target.value) || 0) / 100 })} className="bg-input border-border text-foreground text-sm h-8" />
                      </div>
                    </div>
                    <div className="text-right font-medium text-foreground text-sm">
                      {formatCurrency(item.totalAmount, form.currency)}
                    </div>
                  </div>
                ))}
              </div>

              <Button variant="outline" size="sm" className="mt-3" onClick={form.addLineItem}>
                <Plus className="w-4 h-4 mr-2" />
                Add Line Item
              </Button>

              {form.errors.lineItems && <p className="text-destructive text-xs mt-2">{form.errors.lineItems}</p>}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-foreground text-sm">Notes</Label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {NOTE_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => form.setNotes(form.notes ? `${form.notes}\n${tpl.text}` : tpl.text)}
                      className="text-xs px-2 py-1 rounded-md border border-border bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  placeholder="Additional notes for the customer..."
                  value={form.notes}
                  onChange={(e) => form.setNotes(e.target.value)}
                  rows={2}
                  className="bg-input border-border text-foreground"
                />
              </div>
              <div>
                <Label className="text-foreground text-sm">Payment Instructions</Label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {PAYMENT_INSTRUCTION_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => form.setPaymentInstructions(form.paymentInstructions ? `${form.paymentInstructions}\n${tpl.text}` : tpl.text)}
                      className="text-xs px-2 py-1 rounded-md border border-border bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  placeholder="Bank account details, payment methods..."
                  value={form.paymentInstructions}
                  onChange={(e) => form.setPaymentInstructions(e.target.value)}
                  rows={2}
                  className="bg-input border-border text-foreground"
                />
              </div>
              <div>
                <Label className="text-foreground text-sm">Signature Name</Label>
                <Input
                  placeholder="e.g. John Smith"
                  value={form.signatureName}
                  onChange={(e) => form.setSignatureName(e.target.value)}
                  className="bg-input border-border text-foreground"
                />
                {form.signatureName && (
                  <p
                    className="mt-2 text-lg text-muted-foreground"
                    style={{ fontFamily: "'Brush Script MT', 'Segoe Script', cursive" }}
                  >
                    {form.signatureName}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar - 1/3 */}
        <div className="space-y-6">
          {/* Invoice Settings */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-foreground text-sm">Invoice Date</Label>
                <Input
                  type="date"
                  value={form.invoiceDate}
                  onChange={(e) => form.setInvoiceDate(e.target.value)}
                  className="bg-input border-border text-foreground"
                />
              </div>
              <div>
                <Label className="text-foreground text-sm">Payment Terms</Label>
                <Select value={form.paymentTerms} onValueChange={(v) => form.setPaymentTerms(v as PaymentTerms)}>
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {Object.entries(PAYMENT_TERMS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value} className="text-foreground">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-foreground text-sm">Due Date</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => form.setDueDate(e.target.value)}
                  disabled={form.paymentTerms !== 'custom'}
                  className="bg-input border-border text-foreground"
                />
              </div>
              <div>
                <Label className="text-foreground text-sm">Currency</Label>
                <Select value={form.currency} onValueChange={form.setCurrency}>
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c} className="text-foreground">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-foreground text-sm">Tax Mode</Label>
                <Select value={form.taxMode} onValueChange={(v) => form.setTaxMode(v as 'exclusive' | 'inclusive')}>
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="exclusive" className="text-foreground">Tax Exclusive</SelectItem>
                    <SelectItem value="inclusive" className="text-foreground">Tax Inclusive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-foreground text-sm">Template</Label>
                <Select value={form.templateId} onValueChange={form.setTemplateId}>
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="modern" className="text-foreground">Modern</SelectItem>
                    <SelectItem value="classic" className="text-foreground">Classic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Totals */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-foreground">{formatCurrency(form.totals.subtotal, form.currency)}</span>
              </div>
              {form.totals.totalDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-foreground">-{formatCurrency(form.totals.totalDiscount, form.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="text-foreground">{formatCurrency(form.totals.totalTax, form.currency)}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between font-semibold">
                <span className="text-foreground">Total</span>
                <span className="text-foreground text-lg">{formatCurrency(form.totals.totalAmount, form.currency)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
