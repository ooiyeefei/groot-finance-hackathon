'use client'

import { useState, useCallback, useMemo } from 'react'
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
}

export function useSalesInvoiceForm(options: UseInvoiceFormOptions = {}) {
  const today = new Date().toISOString().split('T')[0]

  // Customer state
  const [customerId, setCustomerId] = useState<string | undefined>()
  const [customerSnapshot, setCustomerSnapshot] = useState<CustomerSnapshot>({
    businessName: '',
    email: '',
  })

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      lineOrder: 0,
      description: '',
      quantity: 1,
      unitPrice: 0,
      totalAmount: 0,
      currency: options.defaultCurrency ?? 'SGD',
    },
  ])

  // Invoice settings
  const [currency, setCurrency] = useState(options.defaultCurrency ?? 'SGD')
  const [taxMode, setTaxMode] = useState<TaxMode>(options.defaultTaxMode ?? 'exclusive')
  const [invoiceDate, setInvoiceDate] = useState(today)
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(
    options.defaultPaymentTerms ?? 'net_30'
  )
  const [dueDate, setDueDate] = useState(
    computeDueDate(today, options.defaultPaymentTerms ?? 'net_30')
  )
  const [notes, setNotes] = useState('')
  const [paymentInstructions, setPaymentInstructions] = useState(
    options.defaultPaymentInstructions ?? ''
  )
  const [templateId, setTemplateId] = useState(options.defaultTemplateId ?? 'modern')
  const [signatureName, setSignatureName] = useState('')
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<DiscountType | undefined>()
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState<number | undefined>()

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
    }
  }, [
    customerSnapshot, customerId, lineItems, currency, taxMode,
    invoiceDate, paymentTerms, dueDate, notes, paymentInstructions,
    templateId, signatureName, invoiceDiscountType, invoiceDiscountValue,
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

    // Calculated
    totals,

    // Form
    getFormData,
    errors,
    isValid,
  }
}
