'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Calendar, Building, Hash, DollarSign, FileText } from 'lucide-react'
import { Transaction, CreateTransactionRequest, LineItem, SupportedCurrency, TRANSACTION_CATEGORIES, TransactionType } from '@/types/transaction'
import { formatCurrency } from '@/hooks/use-transactions'
import { useHomeCurrency } from '@/components/settings/currency-settings'

interface TransactionFormModalProps {
  transaction?: Transaction
  prefilledData?: Partial<CreateTransactionRequest>
  onClose: () => void
  onSubmit: (data: CreateTransactionRequest) => Promise<void>
}

const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  'THB', 'IDR', 'MYR', 'SGD', 'USD', 'EUR', 'CNY', 'VND', 'PHP'
]

// Get available categories based on transaction type
const getAvailableCategories = (transactionType: TransactionType) => {
  // Ensure we handle all transaction types safely
  if (transactionType in TRANSACTION_CATEGORIES) {
    return Object.keys(TRANSACTION_CATEGORIES[transactionType as keyof typeof TRANSACTION_CATEGORIES])
  }
  return [] // Return empty array for unknown transaction types
}

const TRANSACTION_TYPES = ['income', 'expense', 'transfer', 'asset', 'liability', 'equity'] as const

export default function TransactionFormModal({
  transaction,
  prefilledData,
  onClose,
  onSubmit
}: TransactionFormModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const userHomeCurrency = useHomeCurrency()
  
  // Get default category based on transaction type
  const getDefaultCategory = (transactionType: TransactionType) => {
    const availableCategories = getAvailableCategories(transactionType)
    return availableCategories[0] || ''
  }

  const initialTransactionType = transaction?.transaction_type || prefilledData?.transaction_type || 'expense' as const

  const [formData, setFormData] = useState({
    transaction_type: initialTransactionType,
    description: transaction?.description || prefilledData?.description || '',
    original_amount: transaction?.original_amount || prefilledData?.original_amount || 0,
    original_currency: transaction?.original_currency || prefilledData?.original_currency || userHomeCurrency,
    home_currency: transaction?.home_currency || prefilledData?.home_currency || userHomeCurrency,
    transaction_date: transaction?.transaction_date?.split('T')[0] || prefilledData?.transaction_date || new Date().toISOString().split('T')[0],
    category: transaction?.category || prefilledData?.category || getDefaultCategory(initialTransactionType),
    subcategory: transaction?.subcategory || prefilledData?.subcategory || '',
    vendor_name: transaction?.vendor_name || prefilledData?.vendor_name || '',
    reference_number: transaction?.reference_number || prefilledData?.reference_number || '',
    document_type: transaction?.document_type || prefilledData?.document_type || undefined,
    vendor_details: transaction?.vendor_details || {},
    source_document_id: prefilledData?.source_document_id || undefined
  })

  // Update currencies when user's home currency preference loads/changes
  useEffect(() => {
    if (userHomeCurrency && userHomeCurrency !== 'USD') { // Only update if different from default
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
      const existingItems = transaction.line_items.map(item => ({
        ...item,
        // Use the correct database field names
        description: item.item_description || item.description || '',  // Map item_description to description for form
        line_total: item.total_amount || item.line_total || ((item.quantity || 0) * (item.unit_price || 0) + (item.tax_amount || 0)),  // Use total_amount from DB
        tax_amount: item.tax_amount || 0,
        tax_rate: item.tax_rate || 0
      }))
      setLineItems(existingItems)
    } else if (prefilledData?.line_items && prefilledData.line_items.length > 0) {
      console.log('[Transaction Form] Loading prefilled line items:', prefilledData.line_items)
      const itemsWithTotals = prefilledData.line_items.map(item => ({
        ...item,
        line_total: (item.quantity || 0) * (item.unit_price || 0),
        tax_amount: 0, // Initialize tax_amount for form
        tax_rate: item.tax_rate || 0
      }))
      setLineItems(itemsWithTotals)
    } else {
      setLineItems([])
    }
  }, [transaction?.line_items, prefilledData?.line_items])

  const [previewAmount, setPreviewAmount] = useState<number | null>(null)
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)

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
      const response = await fetch('/api/currency/convert', {
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

    try {
      const submitData: CreateTransactionRequest = {
        ...formData,
        line_items: lineItems
          .filter(item => 
            item.description && item.quantity && item.unit_price
          )
          .map(item => ({
            description: item.description!,
            quantity: item.quantity!,
            unit_price: item.unit_price!,
            tax_rate: item.tax_rate,
            item_category: item.item_category
          }))
      }

      console.log('[Transaction Form] Submit data:', JSON.stringify(submitData, null, 2))
      console.log('[Transaction Form] Home currency in submit data:', submitData.home_currency)
      
      await onSubmit(submitData)
    } catch (error) {
      console.error('Failed to submit transaction:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const addLineItem = () => {
    setLineItems([...lineItems, {
      description: '',
      quantity: 1,
      unit_price: 0,
      line_total: 0,
      tax_amount: 0,
      tax_rate: 0,
      item_category: ''
    }])
  }

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updatedItems = [...lineItems]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    
    // Recalculate line total
    if (field === 'quantity' || field === 'unit_price' || field === 'tax_amount') {
      const item = updatedItems[index]
      const subtotal = (item.quantity || 0) * (item.unit_price || 0)
      item.line_total = subtotal + (item.tax_amount || 0)
    }
    
    setLineItems(updatedItems)
  }

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  const formatCategoryName = (category: string) => {
    return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">
            {transaction ? 'Edit Transaction' : prefilledData ? 'Create Transaction from Document' : 'Create New Transaction'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Transaction Type *
                </label>
                <select
                  value={formData.transaction_type}
                  onChange={(e) => {
                    const newType = e.target.value as TransactionType
                    const availableCategories = getAvailableCategories(newType)
                    setFormData({ 
                      ...formData, 
                      transaction_type: newType,
                      category: availableCategories[0] || '' // Set to first available category or empty
                    })
                  }}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {TRANSACTION_TYPES.map(type => (
                    <option key={type} value={type}>
                      {formatCategoryName(type)}
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
                >
                  {getAvailableCategories(formData.transaction_type).map(category => (
                    <option key={category} value={category}>
                      {formatCategoryName(category)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Subcategory
                </label>
                <input
                  type="text"
                  value={formData.subcategory}
                  onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional subcategory"
                />
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
            </div>

            {/* Right Column */}
            <div className="space-y-4">
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
                    {SUPPORTED_CURRENCIES.map(currency => (
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
                  {SUPPORTED_CURRENCIES.map(currency => (
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
                  Reference Number
                </label>
                <input
                  type="text"
                  value={formData.reference_number}
                  onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Invoice number, receipt ID, etc."
                />
              </div>
              
              {/* Document Type - Read-only field from OCR */}
              {formData.document_type && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <FileText className="w-4 h-4 inline mr-1" />
                    Document Type
                  </label>
                  <div className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-400">
                    <span className="capitalize">{formData.document_type}</span>
                    <span className="text-xs ml-2 text-blue-400">(from OCR)</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Line Items
              </h3>
              <button
                type="button"
                onClick={addLineItem}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            </div>

            {lineItems.length > 0 && (
              <div className="space-y-3">
                {lineItems.map((item, index) => (
                  <div key={index} className="bg-gray-700/30 rounded-lg p-4 border border-gray-600">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          value={item.description || ''}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Item description"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          Quantity
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.quantity || ''}
                          onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          Unit Price
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price || ''}
                          onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-400 mb-1">
                            Total
                          </label>
                          <div className="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm">
                            {formatCurrency(item.line_total || 0, formData.original_currency)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : (transaction ? 'Update Transaction' : 'Create Transaction')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}