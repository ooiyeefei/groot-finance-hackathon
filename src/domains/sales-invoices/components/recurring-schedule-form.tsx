'use client'

import { useState, useCallback, useMemo } from 'react'
import { Plus, Trash2, Save, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/lib/utils/format-number'
import {
  SUPPORTED_CURRENCIES,
  PAYMENT_TERMS_LABELS,
  TAX_MODES,
  RECURRING_FREQUENCIES,
  type PaymentTerms,
  type TaxMode,
  type RecurringFrequency,
} from '../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplateLineItem {
  description: string
  quantity: number
  unitPrice: number
  currency: string
  taxRate?: number
}

export interface RecurringScheduleFormProps {
  mode: 'create' | 'edit'
  initialData?: {
    customerId?: string
    customerSnapshot?: { businessName: string; email: string }
    frequency: string
    dayOfMonth?: number
    dayOfWeek?: number
    startDate: string
    endDate?: string
    templateInvoice: {
      lineItems: Array<{
        description: string
        quantity: number
        unitPrice: number
        currency: string
        taxRate?: number
      }>
      currency: string
      taxMode: string
      notes?: string
      paymentInstructions?: string
      paymentTerms: string
    }
  }
  onSubmit: (data: Record<string, unknown>) => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FREQUENCY_LABELS: Record<string, string> = {
  [RECURRING_FREQUENCIES.WEEKLY]: 'Weekly',
  [RECURRING_FREQUENCIES.MONTHLY]: 'Monthly',
  [RECURRING_FREQUENCIES.QUARTERLY]: 'Quarterly',
  [RECURRING_FREQUENCIES.YEARLY]: 'Yearly',
}

const DAY_OF_WEEK_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
]

const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, i) => i + 1)

function getDefaultLineItem(currency: string): TemplateLineItem {
  return {
    description: '',
    quantity: 1,
    unitPrice: 0,
    currency,
    taxRate: undefined,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RecurringScheduleForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
}: RecurringScheduleFormProps) {
  // Customer info
  const [customerName, setCustomerName] = useState(
    initialData?.customerSnapshot?.businessName ?? ''
  )
  const [customerEmail, setCustomerEmail] = useState(
    initialData?.customerSnapshot?.email ?? ''
  )

  // Schedule fields
  const [frequency, setFrequency] = useState<RecurringFrequency>(
    (initialData?.frequency as RecurringFrequency) ?? RECURRING_FREQUENCIES.MONTHLY
  )
  const [dayOfMonth, setDayOfMonth] = useState(initialData?.dayOfMonth ?? 1)
  const [dayOfWeek, setDayOfWeek] = useState(initialData?.dayOfWeek ?? 1)
  const [startDate, setStartDate] = useState(
    initialData?.startDate ?? new Date().toISOString().split('T')[0]
  )
  const [endDate, setEndDate] = useState(initialData?.endDate ?? '')

  // Template invoice fields
  const [lineItems, setLineItems] = useState<TemplateLineItem[]>(
    initialData?.templateInvoice?.lineItems?.length
      ? initialData.templateInvoice.lineItems
      : [getDefaultLineItem(initialData?.templateInvoice?.currency ?? 'SGD')]
  )
  const [currency, setCurrency] = useState(
    initialData?.templateInvoice?.currency ?? 'SGD'
  )
  const [taxMode, setTaxMode] = useState<TaxMode>(
    (initialData?.templateInvoice?.taxMode as TaxMode) ?? 'exclusive'
  )
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(
    (initialData?.templateInvoice?.paymentTerms as PaymentTerms) ?? 'net_30'
  )
  const [notes, setNotes] = useState(initialData?.templateInvoice?.notes ?? '')
  const [paymentInstructions, setPaymentInstructions] = useState(
    initialData?.templateInvoice?.paymentInstructions ?? ''
  )

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Show day-of-month picker for monthly/quarterly/yearly
  const showDayOfMonth = frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly'
  // Show day-of-week picker for weekly
  const showDayOfWeek = frequency === 'weekly'

  // Computed total
  const templateTotal = useMemo(() => {
    return lineItems.reduce((sum, item) => {
      const lineTotal = item.quantity * item.unitPrice
      const tax = item.taxRate ? lineTotal * item.taxRate : 0
      return sum + lineTotal + (taxMode === 'exclusive' ? tax : 0)
    }, 0)
  }, [lineItems, taxMode])

  // Line item handlers
  const addLineItem = useCallback(() => {
    setLineItems((prev) => [...prev, getDefaultLineItem(currency)])
  }, [currency])

  const removeLineItem = useCallback((index: number) => {
    setLineItems((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const updateLineItem = useCallback((index: number, updates: Partial<TemplateLineItem>) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item))
    )
  }, [])

  // Validation
  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}

    if (!customerName.trim()) {
      newErrors.customerName = 'Customer name is required'
    }
    if (!customerEmail.trim()) {
      newErrors.customerEmail = 'Customer email is required'
    }
    if (!startDate) {
      newErrors.startDate = 'Start date is required'
    }
    if (endDate && endDate < startDate) {
      newErrors.endDate = 'End date must be after start date'
    }

    const hasValidLineItem = lineItems.some(
      (item) => item.description.trim() && item.quantity > 0 && item.unitPrice >= 0
    )
    if (!hasValidLineItem) {
      newErrors.lineItems = 'At least one valid line item is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [customerName, customerEmail, startDate, endDate, lineItems])

  // Submit handler
  const handleSubmit = useCallback(() => {
    if (!validate()) return

    const data = {
      customerSnapshot: {
        businessName: customerName.trim(),
        email: customerEmail.trim(),
      },
      frequency,
      dayOfMonth: showDayOfMonth ? dayOfMonth : undefined,
      dayOfWeek: showDayOfWeek ? dayOfWeek : undefined,
      startDate,
      endDate: endDate || undefined,
      templateInvoice: {
        lineItems: lineItems.filter(
          (item) => item.description.trim() && item.quantity > 0
        ),
        currency,
        taxMode,
        paymentTerms,
        notes: notes || undefined,
        paymentInstructions: paymentInstructions || undefined,
      },
    }

    onSubmit(data)
  }, [
    validate, customerName, customerEmail, frequency, dayOfMonth, dayOfWeek,
    showDayOfMonth, showDayOfWeek, startDate, endDate, lineItems, currency,
    taxMode, paymentTerms, notes, paymentInstructions, onSubmit,
  ])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">
          {mode === 'create' ? 'Create Recurring Schedule' : 'Edit Recurring Schedule'}
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit}>
            <Save className="w-4 h-4 mr-2" />
            {mode === 'create' ? 'Create Schedule' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left - Main form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-foreground text-sm">Customer Name *</Label>
                  <Input
                    placeholder="Business name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="bg-input border-border text-foreground"
                  />
                  {errors.customerName && (
                    <p className="text-destructive text-xs mt-1">{errors.customerName}</p>
                  )}
                </div>
                <div>
                  <Label className="text-foreground text-sm">Email *</Label>
                  <Input
                    type="email"
                    placeholder="customer@example.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="bg-input border-border text-foreground"
                  />
                  {errors.customerEmail && (
                    <p className="text-destructive text-xs mt-1">{errors.customerEmail}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Template Line Items */}
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-foreground text-base">Template Line Items</CardTitle>
              <Button variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-muted-foreground font-medium py-2 px-2">
                        Description
                      </th>
                      <th className="text-right text-muted-foreground font-medium py-2 px-2 w-20">
                        Qty
                      </th>
                      <th className="text-right text-muted-foreground font-medium py-2 px-2 w-28">
                        Unit Price
                      </th>
                      <th className="text-right text-muted-foreground font-medium py-2 px-2 w-20">
                        Tax %
                      </th>
                      <th className="text-right text-muted-foreground font-medium py-2 px-2 w-28">
                        Amount
                      </th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, index) => {
                      const lineTotal = item.quantity * item.unitPrice
                      return (
                        <tr key={index} className="border-b border-border/50">
                          <td className="py-2 px-2">
                            <Input
                              placeholder="Item description"
                              value={item.description}
                              onChange={(e) =>
                                updateLineItem(index, { description: e.target.value })
                              }
                              className="bg-input border-border text-foreground text-sm h-8"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateLineItem(index, {
                                  quantity: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="bg-input border-border text-foreground text-sm h-8 text-right"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) =>
                                updateLineItem(index, {
                                  unitPrice: parseFloat(e.target.value) || 0,
                                })
                              }
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
                              onChange={(e) =>
                                updateLineItem(index, {
                                  taxRate: (parseFloat(e.target.value) || 0) / 100,
                                })
                              }
                              className="bg-input border-border text-foreground text-sm h-8 text-right"
                            />
                          </td>
                          <td className="py-2 px-2 text-right text-foreground font-medium">
                            {formatCurrency(lineTotal, currency)}
                          </td>
                          <td className="py-2 px-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeLineItem(index)}
                              disabled={lineItems.length <= 1}
                              className="h-8 w-8 p-0"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-3">
                {lineItems.map((item, index) => {
                  const lineTotal = item.quantity * item.unitPrice
                  return (
                    <div key={index} className="bg-muted rounded-lg p-3 space-y-2">
                      <div className="flex justify-between items-start">
                        <Input
                          placeholder="Item description"
                          value={item.description}
                          onChange={(e) =>
                            updateLineItem(index, { description: e.target.value })
                          }
                          className="bg-input border-border text-foreground text-sm flex-1 mr-2"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLineItem(index)}
                          disabled={lineItems.length <= 1}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Qty</Label>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) =>
                              updateLineItem(index, {
                                quantity: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="bg-input border-border text-foreground text-sm h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Price</Label>
                          <Input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) =>
                              updateLineItem(index, {
                                unitPrice: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="bg-input border-border text-foreground text-sm h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Tax %</Label>
                          <Input
                            type="number"
                            value={(item.taxRate ?? 0) * 100}
                            onChange={(e) =>
                              updateLineItem(index, {
                                taxRate: (parseFloat(e.target.value) || 0) / 100,
                              })
                            }
                            className="bg-input border-border text-foreground text-sm h-8"
                          />
                        </div>
                      </div>
                      <div className="text-right font-medium text-foreground text-sm">
                        {formatCurrency(lineTotal, currency)}
                      </div>
                    </div>
                  )
                })}
              </div>

              {errors.lineItems && (
                <p className="text-destructive text-xs mt-2">{errors.lineItems}</p>
              )}

              {/* Template total */}
              <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Estimated Total per Invoice</span>
                <span className="text-foreground font-semibold text-lg">
                  {formatCurrency(templateTotal, currency)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Additional Text */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-foreground text-sm">Notes</Label>
                <Textarea
                  placeholder="Notes to include on each generated invoice..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="bg-input border-border text-foreground"
                />
              </div>
              <div>
                <Label className="text-foreground text-sm">Payment Instructions</Label>
                <Textarea
                  placeholder="Bank account details, payment methods..."
                  value={paymentInstructions}
                  onChange={(e) => setPaymentInstructions(e.target.value)}
                  rows={2}
                  className="bg-input border-border text-foreground"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Schedule & Settings */}
        <div className="space-y-6">
          {/* Schedule Configuration */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-foreground text-sm">Frequency</Label>
                <Select
                  value={frequency}
                  onValueChange={(v) => setFrequency(v as RecurringFrequency)}
                >
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value} className="text-foreground">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {showDayOfMonth && (
                <div>
                  <Label className="text-foreground text-sm">Day of Month</Label>
                  <Select
                    value={String(dayOfMonth)}
                    onValueChange={(v) => setDayOfMonth(parseInt(v))}
                  >
                    <SelectTrigger className="bg-input border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border max-h-48">
                      {DAYS_OF_MONTH.map((day) => (
                        <SelectItem key={day} value={String(day)} className="text-foreground">
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs mt-1">
                    Invoice generated on this day each period
                  </p>
                </div>
              )}

              {showDayOfWeek && (
                <div>
                  <Label className="text-foreground text-sm">Day of Week</Label>
                  <Select
                    value={String(dayOfWeek)}
                    onValueChange={(v) => setDayOfWeek(parseInt(v))}
                  >
                    <SelectTrigger className="bg-input border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {DAY_OF_WEEK_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={String(option.value)}
                          className="text-foreground"
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label className="text-foreground text-sm">Start Date *</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-input border-border text-foreground"
                />
                {errors.startDate && (
                  <p className="text-destructive text-xs mt-1">{errors.startDate}</p>
                )}
              </div>

              <div>
                <Label className="text-foreground text-sm">End Date (optional)</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="bg-input border-border text-foreground"
                />
                {errors.endDate && (
                  <p className="text-destructive text-xs mt-1">{errors.endDate}</p>
                )}
                <p className="text-muted-foreground text-xs mt-1">
                  Leave blank for indefinite recurrence
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Invoice Defaults */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Invoice Defaults</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-foreground text-sm">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c} className="text-foreground">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-foreground text-sm">Tax Mode</Label>
                <Select
                  value={taxMode}
                  onValueChange={(v) => setTaxMode(v as TaxMode)}
                >
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value={TAX_MODES.EXCLUSIVE} className="text-foreground">
                      Tax Exclusive
                    </SelectItem>
                    <SelectItem value={TAX_MODES.INCLUSIVE} className="text-foreground">
                      Tax Inclusive
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-foreground text-sm">Payment Terms</Label>
                <Select
                  value={paymentTerms}
                  onValueChange={(v) => setPaymentTerms(v as PaymentTerms)}
                >
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {Object.entries(PAYMENT_TERMS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value} className="text-foreground">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
