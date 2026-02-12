'use client'

import { useParams, useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useState, useCallback, useEffect } from 'react'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useActiveBusiness } from '@/contexts/business-context'
import { useSalesInvoice, useSalesInvoiceMutations } from '@/domains/sales-invoices/hooks/use-sales-invoices'
import { InvoiceStatusBadge } from '@/domains/sales-invoices/components/invoice-status-badge'
import InvoiceLineItemsTable from '@/domains/sales-invoices/components/invoice-line-items-table'
import CustomerSelector from '@/domains/sales-invoices/components/customer-selector'
import { formatCurrency } from '@/lib/utils/format-number'
import {
  SUPPORTED_CURRENCIES,
  PAYMENT_TERMS_LABELS,
  SALES_INVOICE_STATUSES,
  type PaymentTerms,
  type TaxMode,
  type LineItem,
  type CustomerSnapshot,
  type SalesInvoiceStatus,
} from '@/domains/sales-invoices/types'
import { calculateInvoiceTotals, recalculateLineItem } from '@/domains/sales-invoices/lib/invoice-calculations'
import { computeDueDate } from '@/domains/sales-invoices/lib/invoice-number-format'
import type { Id } from '../../../../../../convex/_generated/dataModel'

export default function EditSalesInvoicePage() {
  const params = useParams()
  const router = useRouter()
  const locale = useLocale()
  const invoiceId = params.id as string
  const { businessId } = useActiveBusiness()

  const { invoice, isLoading } = useSalesInvoice(invoiceId)
  const { updateInvoice } = useSalesInvoiceMutations()
  const [isSaving, setIsSaving] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [customerId, setCustomerId] = useState<string | undefined>()

  // Form state
  const [customerSnapshot, setCustomerSnapshot] = useState<CustomerSnapshot>({
    businessName: '',
    email: '',
  })
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { lineOrder: 0, description: '', quantity: 1, unitPrice: 0, totalAmount: 0, currency: 'SGD' },
  ])
  const [currency, setCurrency] = useState('SGD')
  const [taxMode, setTaxMode] = useState<TaxMode>('exclusive')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('net_30')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentInstructions, setPaymentInstructions] = useState('')
  const [templateId, setTemplateId] = useState('modern')

  // Initialize form from invoice data
  useEffect(() => {
    if (invoice && !initialized) {
      setCustomerSnapshot(invoice.customerSnapshot)
      setLineItems(invoice.lineItems as LineItem[])
      setCurrency(invoice.currency)
      setTaxMode(invoice.taxMode as TaxMode)
      setInvoiceDate(invoice.invoiceDate)
      setPaymentTerms(invoice.paymentTerms as PaymentTerms)
      setDueDate(invoice.dueDate)
      setNotes(invoice.notes ?? '')
      setPaymentInstructions(invoice.paymentInstructions ?? '')
      setTemplateId(invoice.templateId ?? 'modern')
      setCustomerId(invoice.customerId ?? undefined)
      setInitialized(true)
    }
  }, [invoice, initialized])

  // Line item operations
  const addLineItem = useCallback(() => {
    setLineItems((prev) => [
      ...prev,
      { lineOrder: prev.length, description: '', quantity: 1, unitPrice: 0, totalAmount: 0, currency },
    ])
  }, [currency])

  const removeLineItem = useCallback((index: number) => {
    setLineItems((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, lineOrder: i }))
    })
  }, [])

  const updateLineItem = useCallback(
    (index: number, updates: Partial<LineItem>) => {
      setLineItems((prev) =>
        prev.map((item, i) => {
          if (i !== index) return item
          const merged = { ...item, ...updates }
          return recalculateLineItem(merged, taxMode)
        })
      )
    },
    [taxMode]
  )

  // Calculated totals
  const totals = calculateInvoiceTotals(lineItems, taxMode)

  // Handle payment terms change
  const handlePaymentTermsChange = useCallback(
    (terms: PaymentTerms) => {
      setPaymentTerms(terms)
      if (terms !== 'custom') {
        setDueDate(computeDueDate(invoiceDate, terms))
      }
    },
    [invoiceDate]
  )

  // Save handler
  const handleSave = async () => {
    if (!businessId || !invoiceId) return

    setIsSaving(true)
    try {
      await updateInvoice({
        id: invoiceId as Id<'sales_invoices'>,
        businessId: businessId as Id<'businesses'>,
        customerId: customerId as Id<'customers'> | undefined,
        customerSnapshot,
        lineItems: lineItems.map((item) => ({
          lineOrder: item.lineOrder,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalAmount: item.totalAmount,
          currency: item.currency,
          taxRate: item.taxRate,
          taxAmount: item.taxAmount,
          discountAmount: item.discountAmount,
          itemCode: item.itemCode,
          unitMeasurement: item.unitMeasurement,
          catalogItemId: item.catalogItemId,
        })),
        currency,
        taxMode,
        invoiceDate,
        paymentTerms,
        dueDate,
        notes: notes || undefined,
        paymentInstructions: paymentInstructions || undefined,
        templateId,
      })
      router.push(`/${locale}/sales-invoices/${invoiceId}`)
    } catch (error) {
      console.error('Failed to update invoice:', error)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading || !initialized) {
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

  if (invoice.status !== SALES_INVOICE_STATUSES.DRAFT) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground">Only draft invoices can be edited.</p>
        <Link href={`/${locale}/sales-invoices/${invoiceId}`} className="mt-4 inline-block">
          <Button variant="outline">View Invoice</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/${locale}/sales-invoices/${invoiceId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Edit {invoice.invoiceNumber}
            </h1>
          </div>
          <InvoiceStatusBadge status={invoice.status as SalesInvoiceStatus} />
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          Save Changes
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main form area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-foreground">Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerSelector
                value={customerSnapshot}
                onChange={setCustomerSnapshot}
                onCustomerSelect={(c) => setCustomerId(c._id)}
              />
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-foreground">Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              <InvoiceLineItemsTable
                lineItems={lineItems}
                onUpdateItem={updateLineItem}
                onRemoveItem={removeLineItem}
                onAddItem={addLineItem}
                currency={currency}
                taxMode={taxMode}
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar settings */}
        <div className="space-y-4">
          {/* Settings */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-foreground">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Invoice Date</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => {
                    setInvoiceDate(e.target.value)
                    if (paymentTerms !== 'custom') {
                      setDueDate(computeDueDate(e.target.value, paymentTerms))
                    }
                  }}
                  className="h-9 text-sm mt-1"
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Payment Terms</Label>
                <Select value={paymentTerms} onValueChange={(v) => handlePaymentTermsChange(v as PaymentTerms)}>
                  <SelectTrigger className="h-9 text-sm mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_TERMS_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Due Date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={paymentTerms !== 'custom'}
                  className="h-9 text-sm mt-1"
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-9 text-sm mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Tax Mode</Label>
                <Select value={taxMode} onValueChange={(v) => setTaxMode(v as TaxMode)}>
                  <SelectTrigger className="h-9 text-sm mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclusive">Tax Exclusive</SelectItem>
                    <SelectItem value="inclusive">Tax Inclusive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger className="h-9 text-sm mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modern">Modern</SelectItem>
                    <SelectItem value="classic">Classic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-foreground">Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes to customer..."
                rows={3}
                className="text-sm"
              />
              <div>
                <Label className="text-xs text-muted-foreground">Payment Instructions</Label>
                <Textarea
                  value={paymentInstructions}
                  onChange={(e) => setPaymentInstructions(e.target.value)}
                  placeholder="Bank details, payment methods..."
                  rows={3}
                  className="text-sm mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Totals */}
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(totals.subtotal, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(totals.totalTax, currency)}
                </span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between font-semibold">
                <span className="text-foreground">Total</span>
                <span className="text-foreground">
                  {formatCurrency(totals.totalAmount, currency)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
