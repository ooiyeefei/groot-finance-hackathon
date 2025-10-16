'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Calendar, Building, Hash, DollarSign, FileText, Clock, AlertCircle, Copy } from 'lucide-react'
import { AccountingEntry, CreateAccountingEntryRequest, LineItem, SupportedCurrency, TRANSACTION_CATEGORIES, TransactionType } from '@/domains/accounting-entries/types'
import { formatCurrency } from '@/domains/accounting-entries/hooks/use-accounting-entries'
import { useHomeCurrency } from '@/domains/account-management/components/business-profile-settings'
import { useExpenseCategories, formatCategoriesForSelect, DynamicExpenseCategory } from '@/domains/expense-claims/hooks/use-expense-categories'
import { useCOGSCategories, formatCOGSCategoriesForSelect, DynamicCOGSCategory } from '@/lib/hooks/accounting/use-cogs-categories'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface AccountingEntryFormModalProps {
  transaction?: AccountingEntry
  prefilledData?: Partial<CreateAccountingEntryRequest>
  onClose: () => void
  onSubmit: (data: CreateAccountingEntryRequest) => Promise<void>
}

const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  'THB', 'IDR', 'MYR', 'SGD', 'USD', 'EUR', 'CNY', 'VND', 'PHP', 'INR'
]

// Get available categories based on transaction type - now supports dynamic categories
const getAvailableCategories = (accountingEntryType: TransactionType, expenseCategories: DynamicExpenseCategory[], cogsCategories: DynamicCOGSCategory[]) => {
  if (accountingEntryType === 'Cost of Goods Sold') {
    // Use dynamic COGS categories
    return cogsCategories.map(cat => cat.category_code)
  } else if (accountingEntryType === 'Expense') {
    // Use dynamic expense categories
    return expenseCategories.map(cat => cat.category_code)
  } else if (accountingEntryType === 'Income') {
    // Use hardcoded income categories (can be made dynamic later)
    if (accountingEntryType in TRANSACTION_CATEGORIES) {
      return Object.keys(TRANSACTION_CATEGORIES[accountingEntryType as keyof typeof TRANSACTION_CATEGORIES])
    }
  }
  return [] // Return empty array for unknown transaction types
}

const TRANSACTION_TYPES = ['Income', 'Cost of Goods Sold', 'Expense'] as const

const TRANSACTION_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'awaiting_payment', label: 'Awaiting Payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'disputed', label: 'Disputed' }
] as const

export default function AccountingEntryFormModal({
  transaction,
  prefilledData,
  onClose,
  onSubmit
}: AccountingEntryFormModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const userHomeCurrency = useHomeCurrency()

  // Dynamic category hooks
  const { categories: expenseCategories, loading: expenseCategoriesLoading } = useExpenseCategories()
  const { categories: cogsCategories, loading: cogsCategoriesLoading } = useCOGSCategories()
  
  // Get default category based on transaction type
  const getDefaultCategory = (accountingEntryType: TransactionType) => {
    const availableCategories = getAvailableCategories(accountingEntryType, expenseCategories, cogsCategories)
    return availableCategories[0] || ''
  }

  const initialTransactionType = transaction?.transaction_type || prefilledData?.transaction_type || 'Expense' as const

  const [formData, setFormData] = useState({
    transaction_type: initialTransactionType,
    description: transaction?.description || prefilledData?.description || '',
    original_amount: transaction?.original_amount || prefilledData?.original_amount || 0,
    original_currency: transaction?.original_currency || prefilledData?.original_currency || userHomeCurrency,
    home_currency: transaction?.home_currency || prefilledData?.home_currency || userHomeCurrency,
    transaction_date: transaction?.transaction_date?.split('T')[0] || prefilledData?.transaction_date || new Date().toISOString().split('T')[0],
    category: transaction?.category || prefilledData?.category || getDefaultCategory(initialTransactionType),
    vendor_name: transaction?.vendor_name || prefilledData?.vendor_name || '',
    document_number: transaction?.reference_number || prefilledData?.reference_number || '',
    status: transaction?.status || prefilledData?.status || 'pending',
    due_date: transaction?.due_date?.split('T')[0] || '',
    payment_date: transaction?.payment_date?.split('T')[0] || '',
    payment_method: transaction?.payment_method || '',
    notes: transaction?.notes || '',
    vendor_details: transaction?.vendor_details || {},
    source_record_id: prefilledData?.source_record_id || undefined
  })

  // Update currencies when user's home currency preference loads/changes
  useEffect(() => {
    if (userHomeCurrency) {
      setFormData(prev => ({
        ...prev,
        // Only update if not already set by transaction or prefilled data
        original_currency: transaction?.original_currency || prefilledData?.original_currency || userHomeCurrency,
        home_currency: transaction?.home_currency || prefilledData?.home_currency || userHomeCurrency
      }))
    }
  }, [userHomeCurrency, transaction?.original_currency, transaction?.home_currency, prefilledData?.original_currency, prefilledData?.home_currency])

  const [lineItems, setLineItems] = useState<Partial<LineItem>[]>([])

  // Initialize line items from transaction or prefilled data
  useEffect(() => {
    if (transaction?.line_items && transaction.line_items.length > 0) {
      console.log('[Transaction Form] Loading existing line items:', transaction.line_items)
      
      // Check if we have prefilled data with new OCR fields to merge
      const prefilledItems = prefilledData?.line_items || []
      
      const existingItems = transaction.line_items.map((item, index) => {
        // Try to find matching prefilled item by description
        const matchingPrefilledItem = prefilledItems.find(prefilled =>
          prefilled.description?.toLowerCase().trim() === item.item_description.toLowerCase().trim()
        )

        return {
          ...item,
          // Map database fields to form fields
          item_description: item.item_description,  // Keep database field name for consistency
          // Use total_amount from DB - no legacy line_total needed
          tax_amount: item.tax_amount || 0,
          tax_rate: item.tax_rate || 0,
          // Merge new OCR fields if available from prefilled data
          item_code: item.item_code || matchingPrefilledItem?.item_code || '',
          unit_measurement: item.unit_measurement || matchingPrefilledItem?.unit_measurement || ''
        }
      })
      setLineItems(existingItems)
    } else if (prefilledData?.line_items && prefilledData.line_items.length > 0) {
      console.log('[Transaction Form] Loading prefilled line items:', prefilledData.line_items)
      const itemsWithTotals = prefilledData.line_items.map((item, index) => {
        console.log(`[Transaction Form] Processing prefilled line item ${index + 1}:`, {
          original_item: item,
          description_field: item.description,
          mapping_to_item_description: item.description || ''
        });

        return {
          ...item,
          // Ensure proper field mapping from extraction data
          item_description: item.description || '',
          // Calculate line total from quantity * unit_price - no need to store separately
          tax_amount: 0, // Initialize tax_amount for form
          tax_rate: item.tax_rate || 0
        };
      })
      console.log('[Transaction Form] Final prefilled line items after mapping:', itemsWithTotals)
      setLineItems(itemsWithTotals)
    } else {
      setLineItems([])
    }
  }, [transaction?.line_items, prefilledData?.line_items])

  const [previewAmount, setPreviewAmount] = useState<number | null>(null)
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)

  // Smart auto-calculation: Update total amount when line items change
  useEffect(() => {
    if (lineItems.length > 0) {
      const calculatedTotal = lineItems.reduce((sum, item) => {
        return sum + ((item.quantity || 0) * (item.unit_price || 0))
      }, 0)

      // Only update if there's a meaningful difference (avoid floating point issues)
      if (Math.abs(calculatedTotal - formData.original_amount) > 0.01) {
        console.log('[Transaction Form] Auto-updating amount from line items:', {
          oldAmount: formData.original_amount,
          newAmount: calculatedTotal,
          lineItemsCount: lineItems.length
        })
        setFormData(prev => ({
          ...prev,
          original_amount: calculatedTotal
        }))
      }
    }
  }, [lineItems]) // Only depend on lineItems, not formData to avoid circular updates

  // Fetch exchange rate preview when currencies change
  useEffect(() => {
    if (formData.original_currency !== formData.home_currency && formData.original_amount > 0) {
      fetchExchangeRatePreview()
    } else {
      setPreviewAmount(null)
      setExchangeRate(null)
    }
  }, [formData.original_currency, formData.home_currency, formData.original_amount])

  const fetchExchangeRatePreview = async () => {
    try {
      const response = await fetch('/api/v1/utils/currency/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: formData.original_amount,
          from_currency: formData.original_currency,
          to_currency: formData.home_currency
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          setPreviewAmount(result.data.conversion.converted_amount)
          setExchangeRate(result.data.conversion.exchange_rate)
        }
      }
    } catch (error) {
      console.error('Failed to fetch exchange rate:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      // Enhanced validation and logging for line items
      console.log('[Transaction Form] Raw line items before processing:', lineItems)

      const validLineItems = lineItems.filter(item => {
        const isValid = item.item_description &&
                       item.quantity &&
                       item.unit_price &&
                       item.quantity > 0 &&
                       item.unit_price > 0

        if (!isValid) {
          console.log('[Transaction Form] Filtering out invalid line item:', {
            item_description: item.item_description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            reason: !item.item_description ? 'missing description' :
                   !item.quantity ? 'missing quantity' :
                   !item.unit_price ? 'missing unit_price' :
                   item.quantity <= 0 ? 'invalid quantity' :
                   item.unit_price <= 0 ? 'invalid unit_price' : 'unknown'
          })
        }
        return isValid
      })

      console.log('[Transaction Form] Valid line items after filtering:', validLineItems.length, 'out of', lineItems.length)

      const submitData: CreateAccountingEntryRequest = {
        ...formData,
        reference_number: formData.document_number, // Map document_number to reference_number for API
        line_items: validLineItems.map(item => ({
          description: item.item_description!,
          item_code: item.item_code || '',
          quantity: item.quantity!,
          unit_measurement: item.unit_measurement || '',
          unit_price: item.unit_price!,
          tax_rate: item.tax_rate || 0,
          item_category: item.item_category || ''
        }))
      }

      console.log('[Transaction Form] Submit data:', JSON.stringify(submitData, null, 2))
      console.log('[Transaction Form] Home currency in submit data:', submitData.home_currency)
      
      await onSubmit(submitData)
    } catch (error) {
      console.error('Failed to submit transaction:', error)
      setError(error instanceof Error ? error.message : 'Failed to create transaction. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const addLineItem = () => {
    setLineItems([...lineItems, {
      item_description: '',
      item_code: '',
      quantity: 1,
      unit_measurement: '',
      unit_price: 0,
      // No need for separate line_total field - calculated from quantity * unit_price
      tax_amount: 0,
      tax_rate: 0,
      item_category: ''
    }])
  }

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updatedItems = [...lineItems]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    
    // Calculate total amount for display (quantity * unit_price + tax)
    if (field === 'quantity' || field === 'unit_price' || field === 'tax_amount') {
      const item = updatedItems[index]
      // Total is calculated for display only - no need to store in item
    }
    
    setLineItems(updatedItems)
  }

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  // Format category name - supports both dynamic categories and hardcoded ones
  const formatCategoryName = (categoryCode: string, accountingEntryType: TransactionType) => {
    if (accountingEntryType === 'Cost of Goods Sold') {
      const cogsCategory = cogsCategories.find(cat => cat.category_code === categoryCode)
      return cogsCategory ? cogsCategory.category_name : categoryCode
    } else if (accountingEntryType === 'Expense') {
      const expenseCategory = expenseCategories.find(cat => cat.category_code === categoryCode)
      return expenseCategory ? expenseCategory.category_name : categoryCode
    } else {
      // Fallback to formatted hardcoded category names
      return categoryCode.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-800 z-50 flex flex-col">
      <div className="w-full h-full flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">
                {transaction ? 'Edit Record' : prefilledData ? 'Create Account Record from Document' : 'Create New Record'}
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                {prefilledData?.source_record_id ? 'Pre-filled from document extraction' : 'Manual transaction entry'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              form="transaction-form"
              disabled={isLoading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : (transaction ? 'Update Record' : 'Create Record')}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Modal Content - Two Pane Layout */}
        <div className="flex-1 flex min-h-0">
          {/* Left Pane - Form Fields (Scrollable) */}
          <div className="w-1/2 border-r border-gray-700 flex flex-col min-h-0">
            <form id="transaction-form" onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6">
              <div className="space-y-4">
                {/* Error Alert */}
                {error && (
                  <Alert className="bg-red-900/20 border-red-700">
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription className="text-red-400">{error}</AlertDescription>
                  </Alert>
                )}

                {/* Transaction Details */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Transaction Type *
                  </label>
                  <select
                    value={formData.transaction_type}
                    onChange={(e) => {
                      const newType = e.target.value as TransactionType
                      const availableCategories = getAvailableCategories(newType, expenseCategories, cogsCategories)

                      // Only reset category if current category is not valid for new transaction type
                      // This preserves prefilled categories from document extraction
                      const currentCategoryValid = availableCategories.includes(formData.category)

                      setFormData({
                        ...formData,
                        transaction_type: newType,
                        category: currentCategoryValid ? formData.category : (availableCategories[0] || '')
                      })
                    }}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description *
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter transaction description"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Transaction Date *
                  </label>
                  <input
                    type="date"
                    value={formData.transaction_date}
                    onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
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
                      className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                      required
                    />
                    <select
                      value={formData.original_currency}
                      onChange={(e) => setFormData({ ...formData, original_currency: e.target.value as SupportedCurrency })}
                      className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {[userHomeCurrency, ...SUPPORTED_CURRENCIES]
                        .filter((currency, index, array) => currency && array.indexOf(currency) === index) // Remove duplicates and nulls
                        .map(currency => (
                          <option key={currency} value={currency}>
                            {currency}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Home Currency
                  </label>
                  <select
                    value={formData.home_currency}
                    onChange={(e) => setFormData({ ...formData, home_currency: e.target.value as SupportedCurrency })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {[userHomeCurrency, ...SUPPORTED_CURRENCIES]
                      .filter((currency, index, array) => currency && array.indexOf(currency) === index) // Remove duplicates and nulls
                      .map(currency => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Exchange Rate Preview */}
                {previewAmount !== null && exchangeRate !== null && (
                  <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
                    <div className="text-sm text-blue-300 mb-1">Currency Conversion Preview:</div>
                    <div className="text-white font-medium">
                      {formatCurrency(previewAmount, formData.home_currency)}
                    </div>
                    <div className="text-xs text-blue-400">
                      Rate: 1 {formData.original_currency} = {exchangeRate.toFixed(6)} {formData.home_currency}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <Building className="w-4 h-4 inline mr-1" />
                    Vendor Name
                  </label>
                  <input
                    type="text"
                    value={formData.vendor_name}
                    onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Company or vendor name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <Hash className="w-4 h-4 inline mr-1" />
                    Document Number
                  </label>
                  <input
                    type="text"
                    value={formData.document_number}
                    onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Document number, reference ID, etc."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Transaction Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {TRANSACTION_STATUSES.map(status => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Conditional Date Fields Based on Status */}
                {(formData.status === 'awaiting_payment' || formData.status === 'overdue') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      <Calendar className="w-4 h-4 inline mr-1" />
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                {formData.status === 'paid' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        <Calendar className="w-4 h-4 inline mr-1" />
                        Payment Date
                      </label>
                      <input
                        type="date"
                        value={formData.payment_date}
                        onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Payment Method
                      </label>
                      <input
                        type="text"
                        value={formData.payment_method}
                        onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Cash, Card, Transfer, etc."
                      />
                    </div>
                  </>
                )}

                {/* Notes field for additional details */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Additional notes or details..."
                    rows={3}
                  />
                </div>

              </div>
            </form>
          </div>

          {/* Right Pane - Line Items Table */}
          <div className="w-1/2 flex flex-col min-h-0">
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="space-y-6">
                {/* Line Items Header */}
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                    <FileText className="w-4 h-4 mr-2" />
                    Line Items ({lineItems.length})
                  </h4>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Item
                  </button>
                </div>

                {/* Line Items Table */}
                {lineItems.length > 0 ? (
                  <div className="bg-gray-900 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-800">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-400 font-medium">#</th>
                            <th className="px-3 py-2 text-left text-gray-400 font-medium">Description</th>
                            <th className="px-3 py-2 text-left text-gray-400 font-medium">Item Code</th>
                            <th className="px-3 py-2 text-right text-gray-400 font-medium">Qty</th>
                            <th className="px-3 py-2 text-left text-gray-400 font-medium">Unit</th>
                            <th className="px-3 py-2 text-right text-gray-400 font-medium">Unit Price</th>
                            <th className="px-3 py-2 text-right text-gray-400 font-medium">Total</th>
                            <th className="px-3 py-2 text-center text-gray-400 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                          {lineItems.map((item, index) => (
                            <tr key={index} className="hover:bg-gray-800">
                              <td className="px-3 py-2 text-gray-400">{index + 1}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={item.item_description || ''}
                                  onChange={(e) => updateLineItem(index, 'item_description', e.target.value)}
                                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="Item description"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={item.item_code || ''}
                                  onChange={(e) => updateLineItem(index, 'item_code', e.target.value)}
                                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={item.unit_measurement || ''}
                                  onChange={(e) => updateLineItem(index, 'unit_measurement', e.target.value)}
                                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-3 py-2 text-right text-green-400 font-medium">
                                {formatCurrency((item.quantity || 0) * (item.unit_price || 0), formData.original_currency)}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeLineItem(index)}
                                  className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded transition-colors"
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
                  <div className="text-center py-8 text-gray-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No line items added yet</p>
                    <p className="text-xs mt-1">Click &quot;Add Item&quot; to start adding line items</p>
                  </div>
                )}

                {/* Summary */}
                {lineItems.length > 0 && (
                  <div className="bg-gray-900 rounded-lg p-4 border border-gray-600">
                    <h5 className="text-sm font-medium text-white mb-3">Summary</h5>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Items Count:</span>
                        <span className="text-white">{lineItems.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Subtotal:</span>
                        <span className="text-white">
                          {formatCurrency(
                            lineItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0),
                            formData.original_currency
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-gray-700 pt-2">
                        <span className="text-gray-300 font-medium">Total Amount:</span>
                        <span className="text-green-400 font-medium">
                          {formatCurrency(formData.original_amount, formData.original_currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Record ID and Invoice/Expense Claims ID at bottom of right pane */}
                {transaction?.id && (
                  <div className="flex flex-col items-end mt-6 pt-4 border-t border-gray-600 space-y-2">
                    {/* Record ID */}
                    <div className="flex items-center gap-2 bg-gray-700/90 backdrop-blur-sm px-3 py-1.5 rounded-md border border-gray-600">
                      <span className="text-gray-300 text-xs font-mono">Record ID: {transaction.id}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(transaction.id)}
                        className="text-gray-400 hover:text-gray-200 transition-colors"
                        title="Copy Record ID"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Invoice ID */}
                    {transaction.source_record_id && (
                      <div className="flex items-center gap-2 bg-green-700/20 backdrop-blur-sm px-3 py-1.5 rounded-md border border-green-600/30">
                        <span className="text-green-300 text-xs font-mono">Invoice ID: {transaction.source_record_id}</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(transaction.source_record_id!)}
                          className="text-green-400 hover:text-green-200 transition-colors"
                          title="Copy Invoice ID"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* Expense Claims ID */}
                    {transaction.expense_claims && transaction.expense_claims.length > 0 && (
                      <div className="flex items-center gap-2 bg-blue-700/20 backdrop-blur-sm px-3 py-1.5 rounded-md border border-blue-600/30">
                        <span className="text-blue-300 text-xs font-mono">Expense ID: {transaction.expense_claims[0].id}</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(transaction.expense_claims?.[0]?.id || '')}
                          className="text-blue-400 hover:text-blue-200 transition-colors"
                          title="Copy Expense Claims ID"
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
  )
}