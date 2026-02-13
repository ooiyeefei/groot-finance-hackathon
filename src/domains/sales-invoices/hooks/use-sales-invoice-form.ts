'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import type { LineItem, TaxMode, PaymentTerms, DiscountType, CustomerSnapshot, SalesInvoiceFormInput } from '../types'
import { PAYMENT_TERMS_DAYS } from '../types'
import { calculateLineTotal, calculateInvoiceTotals, recalculateLineItem } from '../lib/invoice-calculations'
import { computeDueDate } from '../lib/invoice-number-format'

interface UseInvoiceFormOptions {
  defaultCurrency?: string
  defaultPaymentTerms?: PaymentTerms
  defaultPaymentInstructions?: string
  defaultTaxMode?: TaxMode
  defaultTemplateId?: string
  initialData?: SalesInvoiceFormInput
  invoiceId?: string
  onAutoSave?: (data: SalesInvoiceFormInput) => Promise<string | void>
}

export function useSalesInvoiceForm(options: UseInvoiceFormOptions = {}) {
  const today = new Date().toISOString().split('T')[0]
  const { initialData } = options

  // Customer state
  const [customerId, setCustomerId] = useState<string | undefined>(
    initialData?.customerId ?? undefined
  )
  const [customerSnapshot, setCustomerSnapshot] = useState<CustomerSnapshot>(
    initialData?.customerSnapshot ?? { businessName: '', email: '' }
  )

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>(
    initialData?.lineItems ?? [
      {
        lineOrder: 0,
        description: '',
        quantity: 1,
        unitPrice: 0,
        totalAmount: 0,
        currency: options.defaultCurrency ?? 'SGD',
      },
    ]
  )

  // Invoice settings
  const [currency, setCurrency] = useState(
    initialData?.currency ?? options.defaultCurrency ?? 'SGD'
  )
  const [taxMode, setTaxMode] = useState<TaxMode>(
    initialData?.taxMode ?? options.defaultTaxMode ?? 'exclusive'
  )
  const [invoiceDate, setInvoiceDate] = useState(
    initialData?.invoiceDate ?? today
  )
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(
    initialData?.paymentTerms ?? options.defaultPaymentTerms ?? 'net_30'
  )
  const [dueDate, setDueDate] = useState(
    initialData?.dueDate ?? computeDueDate(today, options.defaultPaymentTerms ?? 'net_30')
  )
  const [notes, setNotes] = useState(initialData?.notes ?? '')
  const [paymentInstructions, setPaymentInstructions] = useState(
    initialData?.paymentInstructions ?? options.defaultPaymentInstructions ?? ''
  )
  const [templateId, setTemplateId] = useState(
    initialData?.templateId ?? options.defaultTemplateId ?? 'modern'
  )
  const [signatureName, setSignatureName] = useState(
    initialData?.signatureName ?? ''
  )
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<DiscountType | undefined>(
    initialData?.invoiceDiscountType
  )
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState<number | undefined>(
    initialData?.invoiceDiscountValue
  )

  // New fields (012-stripe-invoice-ux)
  const [footer, setFooter] = useState(initialData?.footer ?? '')
  const [customFields, setCustomFields] = useState<Array<{ key: string; value: string }>>(
    initialData?.customFields ?? []
  )
  const [showTaxId, setShowTaxId] = useState(initialData?.showTaxId ?? false)

  // Auto-save state
  const [isDraftCreated, setIsDraftCreated] = useState(!!options.invoiceId)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftIdRef = useRef<string | undefined>(options.invoiceId)

  // Recalculate due date when invoice date or terms change
  const handlePaymentTermsChange = useCallback((terms: PaymentTerms) => {
    setPaymentTerms(terms)
    if (terms !== 'custom') {
      setDueDate(computeDueDate(invoiceDate, terms))
    }
  }, [invoiceDate])

  const handleInvoiceDateChange = useCallback((date: string) => {
    setInvoiceDate(date)
    if (paymentTerms !== 'custom') {
      setDueDate(computeDueDate(date, paymentTerms))
    }
  }, [paymentTerms])

  // Line item operations
  const addLineItem = useCallback(() => {
    setLineItems((prev) => [
      ...prev,
      {
        lineOrder: prev.length,
        description: '',
        quantity: 1,
        unitPrice: 0,
        totalAmount: 0,
        currency,
      },
    ])
  }, [currency])

  const removeLineItem = useCallback((index: number) => {
    setLineItems((prev) => {
      if (prev.length <= 1) return prev // Keep at least one line
      return prev
        .filter((_, i) => i !== index)
        .map((item, i) => ({ ...item, lineOrder: i }))
    })
  }, [])

  const updateLineItem = useCallback((index: number, updates: Partial<LineItem>) => {
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const merged = { ...item, ...updates }
        return recalculateLineItem(merged, taxMode)
      })
    )
  }, [taxMode])

  const addCatalogItem = useCallback((catalogItem: {
    name: string
    description?: string
    unitPrice: number
    currency: string
    sku?: string
    unitMeasurement?: string
    taxRate?: number
    _id: string
  }) => {
    setLineItems((prev) => [
      ...prev,
      recalculateLineItem(
        {
          lineOrder: prev.length,
          description: catalogItem.description || catalogItem.name,
          quantity: 1,
          unitPrice: catalogItem.unitPrice,
          currency: catalogItem.currency || currency,
          itemCode: catalogItem.sku,
          unitMeasurement: catalogItem.unitMeasurement,
          taxRate: catalogItem.taxRate,
          catalogItemId: catalogItem._id,
        },
        taxMode
      ),
    ])
  }, [currency, taxMode])

  // Calculated totals
  const totals = useMemo(() => {
    return calculateInvoiceTotals(
      lineItems,
      taxMode,
      invoiceDiscountType,
      invoiceDiscountValue
    )
  }, [lineItems, taxMode, invoiceDiscountType, invoiceDiscountValue])

  // Build form data for submission
  const getFormData = useCallback((): SalesInvoiceFormInput => {
    return {
      customerSnapshot,
      customerId,
      lineItems,
      currency,
      taxMode,
      invoiceDate,
      paymentTerms,
      dueDate,
      notes: notes || undefined,
      paymentInstructions: paymentInstructions || undefined,
      templateId,
      signatureName: signatureName || undefined,
      invoiceDiscountType,
      invoiceDiscountValue,
      footer: footer || undefined,
      customFields: customFields.length > 0 ? customFields : undefined,
      showTaxId: showTaxId || undefined,
    }
  }, [
    customerSnapshot, customerId, lineItems, currency, taxMode,
    invoiceDate, paymentTerms, dueDate, notes, paymentInstructions,
    templateId, signatureName, invoiceDiscountType, invoiceDiscountValue,
    footer, customFields, showTaxId,
  ])

  // Validate form
  const errors = useMemo(() => {
    const errs: Record<string, string> = {}
    if (!customerSnapshot.businessName) errs.customerName = 'Customer name is required'
    if (!customerSnapshot.email) errs.customerEmail = 'Customer email is required'
    if (lineItems.length === 0) errs.lineItems = 'At least one line item is required'
    if (lineItems.some((item) => !item.description)) errs.lineItemDescription = 'All line items need a description'
    if (lineItems.some((item) => item.quantity <= 0)) errs.lineItemQuantity = 'Quantity must be greater than 0'
    if (totals.totalAmount <= 0) errs.totalAmount = 'Invoice total must be greater than 0'
    if (!invoiceDate) errs.invoiceDate = 'Invoice date is required'
    if (!dueDate) errs.dueDate = 'Due date is required'
    return errs
  }, [customerSnapshot, lineItems, totals.totalAmount, invoiceDate, dueDate])

  const isValid = Object.keys(errors).length === 0

  // Check if form has meaningful input (for auto-save trigger)
  const hasMeaningfulInput = useMemo(() => {
    return customerSnapshot.businessName.length > 0 ||
      lineItems.some((item) => item.description.length > 0 && item.unitPrice > 0)
  }, [customerSnapshot.businessName, lineItems])

  // Auto-save with 1.5s debounce
  const formDataRef = useRef(getFormData)
  formDataRef.current = getFormData

  useEffect(() => {
    if (!options.onAutoSave || !hasMeaningfulInput) return

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      setIsSaving(true)
      try {
        const result = await options.onAutoSave!(formDataRef.current())
        if (result) {
          draftIdRef.current = result
          setIsDraftCreated(true)
        }
        setLastSavedAt(new Date())
      } catch {
        // Auto-save failures are non-blocking
      } finally {
        setIsSaving(false)
      }
    }, 1500)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    customerSnapshot, lineItems, currency, taxMode, invoiceDate, paymentTerms,
    dueDate, notes, paymentInstructions, templateId, signatureName,
    invoiceDiscountType, invoiceDiscountValue, footer, customFields, showTaxId,
    hasMeaningfulInput,
  ])

  return {
    // Customer
    customerId,
    setCustomerId,
    customerSnapshot,
    setCustomerSnapshot,

    // Line items
    lineItems,
    setLineItems,
    addLineItem,
    removeLineItem,
    updateLineItem,
    addCatalogItem,

    // Invoice settings
    currency,
    setCurrency,
    taxMode,
    setTaxMode,
    invoiceDate,
    setInvoiceDate: handleInvoiceDateChange,
    paymentTerms,
    setPaymentTerms: handlePaymentTermsChange,
    dueDate,
    setDueDate,
    notes,
    setNotes,
    paymentInstructions,
    setPaymentInstructions,
    templateId,
    setTemplateId,
    signatureName,
    setSignatureName,
    invoiceDiscountType,
    setInvoiceDiscountType,
    invoiceDiscountValue,
    setInvoiceDiscountValue,

    // New fields (012-stripe-invoice-ux)
    footer,
    setFooter,
    customFields,
    setCustomFields,
    showTaxId,
    setShowTaxId,

    // Auto-save
    isDraftCreated,
    lastSavedAt,
    isSaving,
    draftId: draftIdRef.current,

    // Calculated
    totals,

    // Form
    getFormData,
    errors,
    isValid,
  }
}
