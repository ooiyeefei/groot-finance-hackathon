'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Calendar, Building, Hash, DollarSign, FileText, Clock, AlertCircle, Copy, Eye, EyeOff, Loader2 } from 'lucide-react'
import MultiPageDocumentPreview from './multi-page-document-preview'
import type { AccountingEntry, CreateAccountingEntryRequest, LineItem } from '@/domains/accounting-entries/lib/data-access'
import type { SupportedCurrency, TransactionType } from '@/domains/accounting-entries/types'
import { TRANSACTION_CATEGORIES } from '@/domains/accounting-entries/types'
import { formatCurrency } from '@/domains/accounting-entries/hooks/use-accounting-entries'
import { useHomeCurrency } from '@/domains/users/hooks/use-home-currency'
import { useExpenseCategories, DynamicExpenseCategory } from '@/domains/expense-claims/hooks/use-expense-categories'
import { useCOGSCategories, DynamicCOGSCategory } from '@/lib/hooks/accounting/use-cogs-categories'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { TRANSACTION_STATUSES, type TransactionStatus } from '@/domains/accounting-entries/constants/transaction-status'

interface AccountingEntryFormModalProps {
  transaction?: AccountingEntry
  prefilledData?: Partial<CreateAccountingEntryRequest>
  onClose: () => void
  onSubmit: (data: CreateAccountingEntryRequest) => Promise<void>
  onSave?: (data: Partial<CreateAccountingEntryRequest>) => Promise<void>
  showSaveOption?: boolean
}

const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  'THB', 'IDR', 'MYR', 'SGD', 'USD', 'EUR', 'CNY', 'VND', 'PHP', 'INR'
]

const getAvailableCategories = (accountingEntryType: TransactionType, expenseCategories: DynamicExpenseCategory[], cogsCategories: DynamicCOGSCategory[]) => {
  if (accountingEntryType === 'Cost of Goods Sold') {
    return cogsCategories.map(cat => cat.id)
  } else if (accountingEntryType === 'Expense') {
    return expenseCategories.map(cat => cat.id)
  } else if (accountingEntryType === 'Income') {
    if (accountingEntryType in TRANSACTION_CATEGORIES) {
      return Object.keys(TRANSACTION_CATEGORIES[accountingEntryType as keyof typeof TRANSACTION_CATEGORIES])
    }
  }
  return []
}

const TRANSACTION_TYPES = ['Income', 'Cost of Goods Sold', 'Expense'] as const

export default function AccountingEntryFormModal({
  transaction,
  prefilledData,
  onClose,
  onSubmit,
  onSave,
  showSaveOption = false
}: AccountingEntryFormModalProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Combined loading state for disabling both buttons
  const isLoading = isSaving || isSubmitting
  const { currency: userHomeCurrency } = useHomeCurrency()

  const { categories: expenseCategories, loading: expenseCategoriesLoading } = useExpenseCategories()
  const { categories: cogsCategories, loading: cogsCategoriesLoading } = useCOGSCategories()

  const getDefaultCategory = (accountingEntryType: TransactionType) => {
    const availableCategories = getAvailableCategories(accountingEntryType, expenseCategories, cogsCategories)
    return availableCategories[0] || ''
  }

  const initialTransactionType = (transaction?.transaction_type || prefilledData?.transaction_type || 'Expense') as TransactionType
  const initialCategory = transaction?.category || prefilledData?.category || getDefaultCategory(initialTransactionType)

  const [formData, setFormData] = useState({
    transaction_type: initialTransactionType,
    description: transaction?.description || prefilledData?.description || '',
    original_amount: transaction?.original_amount || prefilledData?.original_amount || 0,
    original_currency: transaction?.original_currency || prefilledData?.original_currency || userHomeCurrency,
    home_currency: transaction?.home_currency || prefilledData?.home_currency || userHomeCurrency,
    transaction_date: transaction?.transaction_date?.split('T')[0] || prefilledData?.transaction_date || new Date().toISOString().split('T')[0],
    category: initialCategory,
    vendor_name: transaction?.vendor_name || prefilledData?.vendor_name || '',
    document_number: transaction?.reference_number || prefilledData?.reference_number || '',
    status: transaction?.status || prefilledData?.status || 'pending',
    due_date: transaction?.due_date?.split('T')[0] || prefilledData?.due_date?.split('T')[0] || undefined,
    payment_date: transaction?.payment_date?.split('T')[0] || undefined,
    payment_method: transaction?.payment_method || '',
    notes: transaction?.notes || '',
    source_record_id: prefilledData?.source_record_id || undefined
  })

  useEffect(() => {
    if (userHomeCurrency) {
      setFormData(prev => {
        // For existing transactions, preserve business's home_currency (e.g., SGD)
        // Only use user's preferred currency for NEW records without existing home_currency
        const existingHomeCurrency = transaction?.home_currency || prefilledData?.home_currency

        const newFormData = {
          ...prev,
          original_currency: transaction?.original_currency || prefilledData?.original_currency || userHomeCurrency,
          home_currency: existingHomeCurrency || userHomeCurrency
        }

        if (newFormData.original_currency === newFormData.home_currency) {
          setPreviewAmount(null)
          setExchangeRate(null)
        }

        return newFormData
      })
    }
  }, [userHomeCurrency, transaction?.original_currency, prefilledData?.original_currency, transaction?.home_currency, prefilledData?.home_currency])

  // Fix race condition: When COGS categories finish loading, re-apply the prefilled category
  // This ensures the controlled <select> properly shows the value that was set before options loaded
  useEffect(() => {
    if (!cogsCategoriesLoading && formData.transaction_type === 'Cost of Goods Sold') {
      const availableCategories = getAvailableCategories(formData.transaction_type, expenseCategories, cogsCategories)
      const prefilledCategory = prefilledData?.category || transaction?.category

      if (prefilledCategory && availableCategories.includes(prefilledCategory)) {
        setFormData(prev => {
          if (prev.category !== prefilledCategory) {
            return { ...prev, category: prefilledCategory }
          }
          return prev
        })
      }
    }
  }, [cogsCategoriesLoading, cogsCategories, formData.transaction_type, prefilledData?.category, transaction?.category, expenseCategories])

  // Same fix for Expense categories
  useEffect(() => {
    if (!expenseCategoriesLoading && formData.transaction_type === 'Expense') {
      const availableCategories = getAvailableCategories(formData.transaction_type, expenseCategories, cogsCategories)
      const prefilledCategory = prefilledData?.category || transaction?.category

      if (prefilledCategory && availableCategories.includes(prefilledCategory)) {
        setFormData(prev => {
          if (prev.category !== prefilledCategory) {
            return { ...prev, category: prefilledCategory }
          }
          return prev
        })
      }
    }
  }, [expenseCategoriesLoading, expenseCategories, formData.transaction_type, prefilledData?.category, transaction?.category, cogsCategories])

  const [lineItems, setLineItems] = useState<Partial<LineItem>[]>([])

  useEffect(() => {
    if (transaction?.line_items && transaction.line_items.length > 0) {
      const prefilledItems = prefilledData?.line_items || []

      const existingItems = transaction.line_items.map((item, index) => {
        const matchingPrefilledItem = prefilledItems.find(prefilled =>
          prefilled.item_description?.toLowerCase().trim() === item.item_description.toLowerCase().trim()
        )

        return {
          ...item,
          item_description: item.item_description,
          tax_amount: item.tax_amount || 0,
          tax_rate: item.tax_rate || 0,
          item_code: item.item_code || matchingPrefilledItem?.item_code || '',
          unit_measurement: item.unit_measurement || matchingPrefilledItem?.unit_measurement || ''
        }
      })
      setLineItems(existingItems)
    } else if (prefilledData?.line_items && prefilledData.line_items.length > 0) {
      const itemsWithTotals = prefilledData.line_items.map((item, index) => {
        return {
          ...item,
          item_description: item.item_description || '',
          tax_amount: 0,
          tax_rate: item.tax_rate || 0
        };
      })
      setLineItems(itemsWithTotals)
    } else {
      setLineItems([])
    }
  }, [transaction?.line_items, prefilledData?.line_items])

  const [previewAmount, setPreviewAmount] = useState<number | null>(null)
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [isPreviewVisible, setIsPreviewVisible] = useState(false)

  useEffect(() => {
    const hasSourceDocument = transaction?.source_record_id || prefilledData?.source_record_id
    if (hasSourceDocument && !isPreviewVisible) {
      setIsPreviewVisible(true)
    }
  }, [transaction?.source_record_id, prefilledData?.source_record_id])

  useEffect(() => {
    if (lineItems.length > 0) {
      const calculatedTotal = lineItems.reduce((sum, item) => {
        return sum + ((item.quantity || 0) * (item.unit_price || 0))
      }, 0)

      if (Math.abs(calculatedTotal - formData.original_amount) > 0.01) {
        setFormData(prev => ({
          ...prev,
          original_amount: calculatedTotal
        }))
      }
    }
  }, [lineItems])

  useEffect(() => {
    const areCurrenciesSame = formData.original_currency === formData.home_currency
    const hasValidAmount = formData.original_amount > 0

    if (!areCurrenciesSame && hasValidAmount) {
      fetchExchangeRatePreview()
    } else {
      setPreviewAmount(null)
      setExchangeRate(null)
    }
  }, [formData.original_currency, formData.home_currency, formData.original_amount])

  const fetchExchangeRatePreview = async () => {
    if (formData.original_currency === formData.home_currency) {
      setPreviewAmount(null)
      setExchangeRate(null)
      return
    }

    const conversionParams = {
      amount: formData.original_amount,
      from_currency: formData.original_currency,
      to_currency: formData.home_currency
    }

    try {
      const response = await fetch('/api/v1/utils/currency/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conversionParams)
      })

      if (response.ok) {
        const result = await response.json()

        if (result.success && result.data) {
          setPreviewAmount(result.data.conversion.converted_amount)
          setExchangeRate(result.data.conversion.exchange_rate)
        }
      }
    } catch (error) {
      // Exchange rate fetch failed - continue without preview
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const validLineItems = lineItems.filter(item => {
        return item.item_description &&
               item.quantity &&
               item.unit_price &&
               item.quantity > 0 &&
               item.unit_price > 0
      })

      // Clean up date fields - convert empty strings to undefined for optional fields
      const cleanFormData = {
        ...formData,
        reference_number: formData.document_number,
        original_currency: formData.original_currency as SupportedCurrency,
        home_currency: formData.home_currency as SupportedCurrency,
        status: formData.status as TransactionStatus | undefined,
        payment_date: formData.payment_date || undefined,
        due_date: formData.due_date || undefined,
        payment_method: formData.payment_method || undefined,
        notes: formData.notes || undefined
      }

      const submitData: CreateAccountingEntryRequest = {
        ...cleanFormData,
        line_items: validLineItems.map((item, index) => ({
          item_description: item.item_description!,
          quantity: item.quantity!,
          unit_price: item.unit_price!,
          total_amount: (item.quantity! * item.unit_price!),
          currency: formData.original_currency as SupportedCurrency,
          item_code: item.item_code,
          unit_measurement: item.unit_measurement,
          tax_rate: item.tax_rate || 0,
          tax_amount: item.tax_amount || 0,
          line_order: index + 1
        }))
      }

      await onSubmit(submitData)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create transaction. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSave = async () => {
    if (!onSave) return

    setIsSaving(true)
    setError(null)

    try {
      const saveData = {
        ...formData,
        reference_number: formData.document_number,
        original_currency: formData.original_currency as SupportedCurrency,
        home_currency: formData.home_currency as SupportedCurrency,
        status: formData.status as TransactionStatus | undefined,
        source_record_id: prefilledData?.source_record_id || formData.source_record_id,
        source_document_type: (prefilledData?.source_document_type || 'invoice') as 'invoice' | 'expense_claim'
      }

      await onSave(saveData)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save data. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const addLineItem = () => {
    setLineItems([...lineItems, {
      item_description: '',
      item_code: '',
      quantity: 1,
      unit_measurement: '',
      unit_price: 0,
      tax_amount: 0,
      tax_rate: 0
    }])
  }

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updatedItems = [...lineItems]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    setLineItems(updatedItems)
  }

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  const formatCategoryName = (categoryId: string, accountingEntryType: TransactionType) => {
    if (accountingEntryType === 'Cost of Goods Sold') {
      const cogsCategory = cogsCategories.find(cat => cat.id === categoryId)
      return cogsCategory ? cogsCategory.category_name : categoryId
    } else if (accountingEntryType === 'Expense') {
      const expenseCategory = expenseCategories.find(cat => cat.id === categoryId)
      return expenseCategory ? expenseCategory.category_name : categoryId
    } else {
      return categoryId
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
    }
  }

  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscapeKey)
    return () => document.removeEventListener('keydown', handleEscapeKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-background z-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
    >
      <div className="w-full h-full flex flex-col max-w-full overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary rounded-lg">
              <DollarSign className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground" id="modal-title">
                {transaction ? 'Edit Record' : prefilledData ? 'Create Account Record from Document' : 'Create New Record'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1" id="modal-description">
                {prefilledData?.source_record_id ? 'Pre-filled from document extraction' : 'Manual transaction entry'}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            {(transaction?.source_record_id || prefilledData?.source_record_id) && (
              <Button
                type="button"
                onClick={() => setIsPreviewVisible(!isPreviewVisible)}
                variant="default"
                title={isPreviewVisible ? 'Hide Document' : 'Show Document'}
                aria-expanded={isPreviewVisible}
                aria-controls="document-preview-pane"
                aria-label={`${isPreviewVisible ? 'Hide' : 'Show'} document preview pane`}
              >
                {isPreviewVisible ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                <span className="hidden sm:inline">{isPreviewVisible ? 'Hide Document' : 'Show Document'}</span>
                <span className="sm:hidden">{isPreviewVisible ? 'Hide' : 'Show'}</span>
              </Button>
            )}
            <div className="flex items-center gap-2 sm:gap-3">
              {showSaveOption && onSave && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSave}
                  disabled={isLoading}
                  size="default"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
              )}
              <Button
                type="submit"
                form="transaction-form"
                disabled={isLoading}
                variant="primary"
                size="default"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {transaction ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  transaction ? 'Update Record' : (prefilledData?.source_document_type === 'invoice' ? 'Create Payable' : 'Create Record')
                )}
              </Button>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          {/* Document Preview - Left Side */}
          {isPreviewVisible && (transaction?.source_record_id || prefilledData?.source_record_id) && (
            <div
              id="document-preview-pane"
              className="w-full lg:w-1/2 lg:border-r lg:border-border flex flex-col min-h-0 mt-4 lg:mt-0"
              aria-label="Document preview"
            >
              <MultiPageDocumentPreview
                sourceRecordId={transaction?.source_record_id || prefilledData?.source_record_id!}
                documentType={transaction?.source_document_type as 'invoice' | 'expense_claim' || 'invoice'}
                className="flex-1 min-h-[400px] lg:min-h-0"
              />
            </div>
          )}

          {/* Main Content Area */}
          <div className={`${isPreviewVisible && (transaction?.source_record_id || prefilledData?.source_record_id) ? 'w-full lg:w-1/2' : 'w-full'} flex flex-col min-h-0 transition-all duration-300`}>
            <div className={`flex ${isPreviewVisible && (transaction?.source_record_id || prefilledData?.source_record_id) ? 'flex-col' : 'flex-col xl:flex-row'} min-h-0 h-full`}>

              {/* Form Section */}
              <div className={`${isPreviewVisible && (transaction?.source_record_id || prefilledData?.source_record_id) ? 'w-full' : 'w-full xl:w-1/2'} overflow-y-auto ${isPreviewVisible && (transaction?.source_record_id || prefilledData?.source_record_id) ? '' : 'xl:border-r xl:border-border'}`}>
                <form id="transaction-form" onSubmit={handleSubmit} className="p-4 sm:p-6 h-full">
                  <div className="space-y-4">
                    {error && (
                      <Alert className="bg-destructive/10 border-destructive/20">
                        <AlertCircle className="w-4 h-4" />
                        <AlertDescription className="text-destructive">{error}</AlertDescription>
                      </Alert>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Transaction Type *
                      </label>
                      <select
                        value={formData.transaction_type}
                        onChange={(e) => {
                          const newType = e.target.value as TransactionType
                          const availableCategories = getAvailableCategories(newType, expenseCategories, cogsCategories)
                          const currentCategoryValid = availableCategories.includes(formData.category)

                          setFormData({
                            ...formData,
                            transaction_type: newType,
                            category: currentCategoryValid ? formData.category : (availableCategories[0] || '')
                          })
                        }}
                        className="w-full px-3 py-2 bg-input border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        required
                      >
                        {TRANSACTION_TYPES.map(type => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Description *
                      </label>
                      <input
                        type="text"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-3 py-2 bg-input border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="Enter transaction description"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Category *
                      </label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full px-3 py-2 bg-input border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        required
                        disabled={
                          (formData.transaction_type === 'Cost of Goods Sold' && cogsCategoriesLoading) ||
                          (formData.transaction_type === 'Expense' && expenseCategoriesLoading)
                        }
                      >
                        {(formData.transaction_type === 'Cost of Goods Sold' && cogsCategoriesLoading) ||
                         (formData.transaction_type === 'Expense' && expenseCategoriesLoading) ? (
                          <option value="">Loading categories...</option>
                        ) : (
                          getAvailableCategories(formData.transaction_type, expenseCategories, cogsCategories).map(category => (
                            <option key={category} value={category}>
                              {formatCategoryName(category, formData.transaction_type)}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        <Calendar className="w-4 h-4 inline mr-1" />
                        Transaction Date *
                      </label>
                      <input
                        type="date"
                        value={formData.transaction_date}
                        onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                        className="w-full px-3 py-2 bg-input border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        <DollarSign className="w-4 h-4 inline mr-1" />
                        Amount *
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.original_amount}
                          onChange={(e) => setFormData({ ...formData, original_amount: parseFloat(e.target.value) || 0 })}
                          className="flex-1 px-3 py-2 bg-input border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          placeholder="0.00"
                          required
                        />
                        <select
                          value={formData.original_currency}
                          onChange={(e) => setFormData({ ...formData, original_currency: e.target.value as SupportedCurrency })}
                          className="px-3 py-2 bg-input border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {[userHomeCurrency, ...SUPPORTED_CURRENCIES]
                            .filter((currency, index, array) => currency && array.indexOf(currency) === index)
                            .map(currency => (
                              <option key={currency} value={currency}>
                                {currency}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Home Currency
                      </label>
                      <select
                        value={formData.home_currency}
                        onChange={(e) => setFormData({ ...formData, home_currency: e.target.value as SupportedCurrency })}
                        className="w-full px-3 py-2 bg-input border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {[userHomeCurrency, ...SUPPORTED_CURRENCIES]
                          .filter((currency, index, array) => currency && array.indexOf(currency) === index)
                          .map(currency => (
                            <option key={currency} value={currency}>
                              {currency}
                            </option>
                          ))}
                      </select>
                    </div>

                    {previewAmount !== null && exchangeRate !== null && (
                      <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                        <div className="text-sm text-primary mb-1">Currency Conversion Preview:</div>
                        <div className="text-foreground font-medium">
                          {formatCurrency(previewAmount, formData.home_currency as SupportedCurrency)}
                        </div>
                        <div className="text-xs text-primary/80">
                          Rate: 1 {formData.original_currency} = {exchangeRate.toFixed(6)} {formData.home_currency}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        <Building className="w-4 h-4 inline mr-1" />
                        Vendor Name
                      </label>
                      <input
                        type="text"
                        value={formData.vendor_name}
                        onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                        className="w-full px-3 py-2 bg-input border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="Company or vendor name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        <Hash className="w-4 h-4 inline mr-1" />
                        Document Number
                      </label>
                      <input
                        type="text"
                        value={formData.document_number}
                        onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                        className="w-full px-3 py-2 bg-input border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="Document number, reference ID, etc."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        <Clock className="w-4 h-4 inline mr-1" />
                        Status
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                        className="w-full px-3 py-2 bg-input border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {TRANSACTION_STATUSES.map(status => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {(formData.status === 'overdue' || formData.status === 'pending' ||
                      ((formData.transaction_type === 'Expense' || formData.transaction_type === 'Cost of Goods Sold') && prefilledData?.source_document_type === 'invoice')) && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          <Calendar className="w-4 h-4 inline mr-1" />
                          Due Date
                        </label>
                        <input
                          type="date"
                          value={formData.due_date || ''}
                          onChange={(e) => setFormData({ ...formData, due_date: e.target.value || undefined })}
                          className="w-full px-3 py-2 bg-input border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    )}

                    {formData.status === 'paid' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            <Calendar className="w-4 h-4 inline mr-1" />
                            Payment Date
                          </label>
                          <input
                            type="date"
                            value={formData.payment_date || ''}
                            onChange={(e) => setFormData({ ...formData, payment_date: e.target.value || undefined })}
                            className="w-full px-3 py-2 bg-input border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Payment Method
                          </label>
                          <input
                            type="text"
                            value={formData.payment_method}
                            onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                            className="w-full px-3 py-2 bg-input border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder="Cash, Card, Transfer, etc."
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Notes
                      </label>
                      <textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="w-full px-3 py-2 bg-input border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="Additional notes or details..."
                        rows={3}
                      />
                    </div>
                  </div>
                </form>
              </div>

              {/* Line Items Section */}
              <div className={`${isPreviewVisible && (transaction?.source_record_id || prefilledData?.source_record_id) ? 'w-full' : 'w-full xl:w-1/2'} overflow-y-auto p-4 sm:p-6`}>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-foreground flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Line Items ({lineItems.length})
                    </h4>
                    <Button
                      type="button"
                      onClick={addLineItem}
                      variant="primary"
                      size="sm"
                    >
                      <Plus className="w-4 h-4" />
                      Add Item
                    </Button>
                  </div>

                  {lineItems.length > 0 ? (
                    <div className="bg-card rounded-lg overflow-hidden border border-border">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted">
                            <tr>
                              <th className="px-3 py-2 text-left text-muted-foreground font-medium">#</th>
                              <th className="px-3 py-2 text-left text-muted-foreground font-medium">Description</th>
                              <th className="px-3 py-2 text-left text-muted-foreground font-medium">Item Code</th>
                              <th className="px-3 py-2 text-right text-muted-foreground font-medium">Qty</th>
                              <th className="px-3 py-2 text-left text-muted-foreground font-medium">Unit</th>
                              <th className="px-3 py-2 text-right text-muted-foreground font-medium">Unit Price</th>
                              <th className="px-3 py-2 text-right text-muted-foreground font-medium">Total</th>
                              <th className="px-3 py-2 text-center text-muted-foreground font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {lineItems.map((item, index) => (
                              <tr key={index} className="hover:bg-muted/50">
                                <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                                <td className="px-3 py-2">
                                  <input
                                    type="text"
                                    value={item.item_description || ''}
                                    onChange={(e) => updateLineItem(index, 'item_description', e.target.value)}
                                    className="w-full px-2 py-1 bg-input border border-input rounded text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                    placeholder="Item description"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="text"
                                    value={item.item_code || ''}
                                    onChange={(e) => updateLineItem(index, 'item_code', e.target.value)}
                                    className="w-full px-2 py-1 bg-input border border-input rounded text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                    placeholder="SKU"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.quantity || ''}
                                    onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2 py-1 bg-input border border-input rounded text-foreground text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="text"
                                    value={item.unit_measurement || ''}
                                    onChange={(e) => updateLineItem(index, 'unit_measurement', e.target.value)}
                                    className="w-full px-2 py-1 bg-input border border-input rounded text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                    placeholder="kg, pkt"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.unit_price || ''}
                                    onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2 py-1 bg-input border border-input rounded text-foreground text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
                                  />
                                </td>
                                <td className="px-3 py-2 text-right text-green-600 dark:text-green-400 font-medium">
                                  {formatCurrency((item.quantity || 0) * (item.unit_price || 0), formData.original_currency as SupportedCurrency)}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => removeLineItem(index)}
                                    className="p-1 text-muted-foreground hover:text-destructive hover:bg-muted rounded transition-colors"
                                    title="Remove item"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No line items added yet</p>
                      <p className="text-xs mt-1">Click "Add Item" to start adding line items</p>
                    </div>
                  )}

                  {lineItems.length > 0 && (
                    <div className="bg-card rounded-lg p-4 border border-border">
                      <h5 className="text-sm font-medium text-foreground mb-3">Summary</h5>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Items Count:</span>
                          <span className="text-foreground">{lineItems.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Subtotal:</span>
                          <span className="text-foreground">
                            {formatCurrency(
                              lineItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0),
                              formData.original_currency as SupportedCurrency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-border pt-2">
                          <span className="text-foreground font-medium">Total Amount:</span>
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            {formatCurrency(formData.original_amount, formData.original_currency as SupportedCurrency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {transaction?.id && (
                    <div className="flex flex-col items-end pt-4 border-t border-border space-y-2">
                      <div className="flex items-center gap-2 bg-muted/90 backdrop-blur-sm px-3 py-1.5 rounded-md border border-border">
                        <span className="text-muted-foreground text-xs font-mono">Record ID: {transaction.id}</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(transaction.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Copy Record ID"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>

                      {transaction.source_record_id && (
                        <div className="flex items-center gap-2 bg-muted/20 backdrop-blur-sm px-3 py-1.5 rounded-md border border-border/30">
                          <span className="text-muted-foreground text-xs font-mono">
                            {transaction.source_document_type === 'invoice' ? 'Invoice ID' :
                             transaction.source_document_type === 'expense_claim' ? 'Expense ID' :
                             'Source ID'}: {transaction.source_record_id}
                          </span>
                          <button
                            onClick={() => navigator.clipboard.writeText(transaction.source_record_id!)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title={`Copy ${transaction.source_document_type === 'invoice' ? 'Invoice ID' :
                                          transaction.source_document_type === 'expense_claim' ? 'Expense ID' :
                                          'Source ID'}`}
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}