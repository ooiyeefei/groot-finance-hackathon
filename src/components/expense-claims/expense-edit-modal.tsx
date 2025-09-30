/**
 * Expense Edit Modal - Edit existing expense claims in a popup dialog
 * Matches the upload receipt modal style with blurred background
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  X,
  Edit3,
  Save,
  Send,
  ArrowLeft,
  Tag,
  DollarSign,
  Calendar,
  Building,
  FileText,
  Loader2,
  AlertCircle,
  Trash2,
  RotateCcw,
  Plus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import { useExpenseCategories } from '@/hooks/use-expense-categories'
import { useHomeCurrency } from '@/components/settings/currency-settings'
import { formatCurrency } from '@/hooks/use-transactions'
import { SupportedCurrency } from '@/types/transaction'

interface ExpenseEditFormData {
  description: string
  business_purpose: string
  expense_category: string
  original_amount: number
  original_currency: string
  home_currency: string
  transaction_date: string
  vendor_name: string
  reference_number?: string
  notes?: string
  line_items?: Array<{
    description: string
    quantity: number
    unit_price: number
    total_amount: number
  }>
}

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  total_amount: number
  item_code?: string
  unit_measurement?: string
}

interface ExpenseEditModalProps {
  expenseClaimId: string
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
  onReprocess?: () => void
}

const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  'THB', 'IDR', 'MYR', 'SGD', 'USD', 'EUR', 'CNY', 'VND', 'PHP'
]

export default function ExpenseEditModal({
  expenseClaimId,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onReprocess
}: ExpenseEditModalProps) {
  const t = useTranslations('expenseClaims')
  const tCommon = useTranslations('common')
  const tTransactions = useTranslations('transactions')
  const tManager = useTranslations('manager')
  console.log('ExpenseEditModal render called - isOpen:', isOpen, 'expenseClaimId:', expenseClaimId)

  // Fetch dynamic categories and user home currency
  const { categories, loading: categoriesLoading, error: categoriesError } = useExpenseCategories()
  const userHomeCurrency = useHomeCurrency()

  const [formData, setFormData] = useState<ExpenseEditFormData>({
    description: '',
    business_purpose: '',
    expense_category: '',
    original_amount: 0,
    original_currency: userHomeCurrency || 'SGD', // Use user's home currency as default
    home_currency: userHomeCurrency || 'SGD',
    transaction_date: '',
    vendor_name: '',
    reference_number: '',
    notes: '',
    line_items: []
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isReprocessing, setIsReprocessing] = useState(false)
  const [claimStatus, setClaimStatus] = useState<string>('')
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const [previewAmount, setPreviewAmount] = useState<number | null>(null)
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([])

  // Update currencies when user's home currency preference loads/changes
  useEffect(() => {
    if (userHomeCurrency) {
      setFormData(prev => ({
        ...prev,
        home_currency: userHomeCurrency,
        // Also update original_currency if it's still at default and form is empty
        ...(prev.original_amount === 0 && prev.vendor_name === '' ? { original_currency: userHomeCurrency } : {})
      }))
    }
  }, [userHomeCurrency])

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

  // Line item management functions
  const addLineItem = () => {
    const newItem: LineItem = {
      description: '',
      quantity: 1,
      unit_price: 0,
      total_amount: 0,
      item_code: '',
      unit_measurement: ''
    }
    setLineItems([...lineItems, newItem])
  }

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems]
    updated[index] = { ...updated[index], [field]: value }

    // Recalculate total_amount when quantity or unit_price changes
    if (field === 'quantity' || field === 'unit_price') {
      updated[index].total_amount = (updated[index].quantity || 0) * (updated[index].unit_price || 0)
    }

    setLineItems(updated)

    // Update form total amount based on line items
    const newTotal = updated.reduce((sum, item) => sum + (item.total_amount || 0), 0)
    setFormData(prev => ({ ...prev, original_amount: newTotal }))
  }

  const removeLineItem = (index: number) => {
    const updated = lineItems.filter((_, i) => i !== index)
    setLineItems(updated)

    // Update form total amount
    const newTotal = updated.reduce((sum, item) => sum + (item.total_amount || 0), 0)
    setFormData(prev => ({ ...prev, original_amount: newTotal }))
  }

  const loadExpenseClaim = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      
      const response = await fetch(`/api/expense-claims/${expenseClaimId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('[ExpenseEditModal] Load error:', errorData)
        
        // Handle specific authentication errors with user-friendly messages
        if (response.status === 404 || errorData.error?.includes('not found') || errorData.error?.includes('access denied')) {
          throw new Error(t('cannotEditClaim'))
        }
        
        throw new Error(errorData.error || t('failedToLoadClaim'))
      }

      const result = await response.json()
      const claim = result.data

      if (!claim) {
        throw new Error(t('claimNotFound'))
      }

      // Capture claim status and processing status for reprocessing logic
      setClaimStatus(claim.status || '')
      setProcessingStatus(claim.processing_status || '')

      // Populate form with existing data
      // Priority: transaction data (if exists) > extracted data (from DSPy) > defaults

      // Extract line items from various sources with proper data structure
      let lineItems: Array<{ description: string; quantity: number; unit_price: number; total_amount: number }> = []

      // Debug logging to see what data we're getting
      console.log('[ExpenseEditModal] Raw claim data for line items:', {
        hasDirectLineItems: !!(claim.line_items && Array.isArray(claim.line_items)),
        directLineItemsCount: claim.line_items ? claim.line_items.length : 0,
        hasTransactionLineItems: !!(claim.transaction?.line_items && Array.isArray(claim.transaction.line_items)),
        transactionLineItemsCount: claim.transaction?.line_items ? claim.transaction.line_items.length : 0,
        hasExtractedLineItems: !!(claim.extracted_data?.line_items && Array.isArray(claim.extracted_data.line_items)),
        extractedLineItemsCount: claim.extracted_data?.line_items ? claim.extracted_data.line_items.length : 0,
        sampleDirectLineItem: claim.line_items?.[0] || null,
        sampleTransactionLineItem: claim.transaction?.line_items?.[0] || null,
        sampleExtractedLineItem: claim.extracted_data?.line_items?.[0] || null
      })

      // Try to get line items from various sources
      if (claim.line_items && Array.isArray(claim.line_items)) {
        // Direct from expense claim API response
        console.log('[ExpenseEditModal] Using direct line items from claim')
        lineItems = claim.line_items.map((item: any) => ({
          description: item.description || 'Item',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || item.unitPrice || 0,
          total_amount: item.total_amount || item.line_total || item.lineTotal || 0,
          item_code: item.item_code || '',
          unit_measurement: item.unit_measurement || ''
        }))
      } else if (claim.transaction?.line_items && Array.isArray(claim.transaction.line_items)) {
        // From linked transaction
        console.log('[ExpenseEditModal] Using line items from linked transaction')
        lineItems = claim.transaction.line_items.map((item: any) => ({
          description: item.description || item.item_description || 'Item',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || item.unitPrice || 0,
          total_amount: item.total_amount || item.line_total || item.lineTotal || 0,
          item_code: item.item_code || '',
          unit_measurement: item.unit_measurement || ''
        }))
      } else if (claim.extracted_data?.line_items && Array.isArray(claim.extracted_data.line_items)) {
        // From DSPy extraction result
        console.log('[ExpenseEditModal] Using line items from extracted data')
        lineItems = claim.extracted_data.line_items.map((item: any) => ({
          description: item.description || 'Item',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || item.unitPrice || 0,
          total_amount: item.total_amount || item.line_total || item.lineTotal || 0,
          item_code: item.item_code || '',
          unit_measurement: item.unit_measurement || ''
        }))
      }

      console.log('[ExpenseEditModal] Final processed line items:', lineItems)

      // Set line items state
      setLineItems(lineItems)

      setFormData({
        description: claim.transaction?.description ||
                    claim.description || '',
        business_purpose: claim.transaction?.business_purpose ||
                         claim.business_purpose || '',
        expense_category: claim.transaction?.expense_category ||
                         claim.expense_category || 'other',
        original_amount: claim.transaction?.original_amount ||
                        claim.total_amount || 0,
        original_currency: claim.transaction?.original_currency ||
                          claim.currency || userHomeCurrency || 'SGD',
        home_currency: claim.transaction?.home_currency || userHomeCurrency,
        transaction_date: (claim.transaction?.transaction_date?.split('T')[0]) ||
                         claim.transaction_date || '',
        vendor_name: claim.transaction?.vendor_name ||
                    claim.vendor_name || '',
        reference_number: claim.transaction?.reference_number ||
                         claim.reference_number || '',
        notes: claim.transaction?.notes || '',
        // Use the extracted and normalized line items
        line_items: lineItems
      })
    } catch (error) {
      console.error('Error loading expense claim:', error)
      setLoadError(error instanceof Error ? error.message : 'Failed to load expense claim')
    } finally {
      setLoading(false)
    }
  }, [expenseClaimId])

  // Load expense claim data when modal opens
  useEffect(() => {
    if (isOpen && expenseClaimId) {
      loadExpenseClaim()
    }
  }, [isOpen, expenseClaimId, loadExpenseClaim])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.description.trim()) {
      newErrors.description = t('descriptionRequired')
    }
    if (!formData.business_purpose.trim()) {
      newErrors.business_purpose = t('businessPurposeRequired')
    }
    if (!formData.expense_category) {
      newErrors.expense_category = t('categoryRequired')
    }
    if (formData.original_amount <= 0) {
      newErrors.original_amount = t('amountMustBeGreaterThanZero')
    }
    if (!formData.vendor_name.trim()) {
      newErrors.vendor_name = t('vendorNameRequired')
    }
    if (!formData.transaction_date) {
      newErrors.transaction_date = t('dateRequired')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async (action: 'draft' | 'submit' = 'draft') => {
    if (!validateForm()) return

    try {
      if (action === 'draft') {
        setSaving(true)
      } else {
        setSubmitting(true)
      }
      setSaveError(null)

      if (action === 'submit') {
        // For submit action, first save the draft data, then submit to workflow
        console.log('Submitting expense claim through workflow submission endpoint')

        // Step 1: Save the current form data as draft
        const updateData = {
          ...formData,
          line_items: lineItems, // Include editable line items
          status: 'draft' // Keep as draft during save
        }

        const updateResponse = await fetch(`/api/expense-claims/${expenseClaimId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData)
        })

        if (!updateResponse.ok) {
          const errorData = await updateResponse.json()
          throw new Error(errorData.error || 'Failed to save expense claim before submission')
        }

        // Step 2: Submit to workflow using the proper submission endpoint
        const submitResponse = await fetch(`/api/expense-claims/${expenseClaimId}/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'submit' })
        })

        const submitResult = await submitResponse.json()

        if (!submitResponse.ok) {
          throw new Error(submitResult.error || 'Failed to submit expense claim to workflow')
        }

        console.log('Expense claim submitted to workflow successfully:', submitResult.data.message)
      } else {
        // For draft action, just save the data
        const updateData = {
          ...formData,
          line_items: lineItems, // Include editable line items
          status: 'draft'
        }

        const response = await fetch(`/api/expense-claims/${expenseClaimId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData)
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to save expense claim as draft')
        }

        console.log('Expense claim saved as draft successfully')
      }

      onSave()
      onClose()

    } catch (error) {
      console.error('Save/Submit error:', error)
      setSaveError(error instanceof Error ? error.message : `Failed to ${action === 'submit' ? 'submit' : 'save'} expense claim`)
    } finally {
      setSaving(false)
      setSubmitting(false)
    }
  }

  // Handle delete click to show confirmation dialog
  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  // Handle confirmed delete
  const handleDeleteConfirmed = useCallback(async () => {
    try {
      setIsDeleting(true)
      setSaveError(null)
      
      const response = await fetch(`/api/expense-claims/${expenseClaimId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        const errorData = result
        throw new Error(errorData.error || 'Failed to delete expense claim')
      }

      console.log('Expense claim deleted successfully')
      
      // Close confirmation dialog
      setShowDeleteConfirm(false)
      
      // Call parent handlers
      if (onDelete) onDelete()
      onClose()
      
    } catch (error) {
      console.error('Delete error:', error)
      setSaveError(error instanceof Error ? error.message : 'Failed to delete expense claim')
    } finally {
      setIsDeleting(false)
    }
  }, [expenseClaimId, onDelete, onClose])

  // Handle closing delete confirmation
  const handleCloseDeleteConfirm = useCallback(() => {
    if (!isDeleting) {
      setShowDeleteConfirm(false)
    }
  }, [isDeleting])

  // Handle reprocess click
  const handleReprocessClick = useCallback(async () => {
    if (!onReprocess) return

    try {
      setIsReprocessing(true)
      setSaveError(null)

      // Call parent reprocess handler
      await onReprocess()

      console.log('Expense claim reprocessing initiated successfully')
      onClose()

    } catch (error) {
      console.error('Reprocess error:', error)
      setSaveError(error instanceof Error ? error.message : 'Failed to reprocess expense claim')
    } finally {
      setIsReprocessing(false)
    }
  }, [onReprocess, onClose])

  // Don't render if modal is not open
  if (!isOpen) {
    console.log('ExpenseEditModal returning null because isOpen is false')
    return null
  }

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-white">{t('edit')}</h2>
            <p className="text-gray-400 text-sm">
              {t('dashboard.reviewApproveTeam')}
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 mx-auto text-blue-500 mb-4 animate-spin" />
              <h3 className="text-lg font-semibold text-white mb-2">
                {tCommon('loading')}
              </h3>
              <p className="text-gray-400">
                {tCommon('loading')}...
              </p>
            </div>
          ) : loadError ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">
                {tCommon('error')}
              </h3>
              <p className="text-gray-400 mb-6">
                {loadError}
              </p>
              <Button 
                onClick={onClose}
                variant="outline"
                className="border-gray-600 text-gray-300"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {tCommon('close')}
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Save Error */}
              {saveError && (
                <Alert className="bg-red-900/20 border-red-700">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription className="text-red-400">
                    {saveError}
                  </AlertDescription>
                </Alert>
              )}

              {/* Form */}
              <Card className="bg-gray-700 border-gray-600">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    {t('expenseClaim')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white flex items-center gap-2">
                        <Building className="w-4 h-4" />
                        {tTransactions('vendor')} *
                      </Label>
                      <Input
                        value={formData.vendor_name}
                        onChange={(e) => setFormData({...formData, vendor_name: e.target.value})}
                        className="bg-gray-600 border-gray-500 text-white"
                        placeholder={tTransactions('vendorPlaceholder')}
                      />
                      {errors.vendor_name && <p className="text-red-400 text-sm">{errors.vendor_name}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        {tTransactions('amount')} *
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.original_amount}
                          onChange={(e) => setFormData({...formData, original_amount: parseFloat(e.target.value) || 0})}
                          className="bg-gray-600 border-gray-500 text-white flex-1"
                          placeholder={tTransactions('enterAmount')}
                        />
                        <Select
                          value={formData.original_currency}
                          onValueChange={(value) => setFormData({...formData, original_currency: value as SupportedCurrency})}
                        >
                          <SelectTrigger className="bg-gray-600 border-gray-500 text-white w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-700 border-gray-600">
                            {SUPPORTED_CURRENCIES.map(currency => (
                              <SelectItem key={currency} value={currency} className="text-white">{currency}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {errors.original_amount && <p className="text-red-400 text-sm">{errors.original_amount}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white">{tTransactions('homeCurrency')}</Label>
                      <Select
                        value={formData.home_currency}
                        onValueChange={(value) => setFormData({...formData, home_currency: value as SupportedCurrency})}
                      >
                        <SelectTrigger className="bg-gray-600 border-gray-500 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-700 border-gray-600">
                          {SUPPORTED_CURRENCIES.map(currency => (
                            <SelectItem key={currency} value={currency} className="text-white">{currency}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Exchange Rate Preview */}
                  {previewAmount !== null && exchangeRate !== null && (
                    <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
                      <div className="text-sm text-blue-300 mb-1">{tTransactions('currencyConversionPreview')}:</div>
                      <div className="text-white font-medium">
                        {formatCurrency(previewAmount, formData.home_currency as SupportedCurrency)}
                      </div>
                      <div className="text-xs text-blue-400">
{tTransactions('exchangeRateLabel')}: 1 {formData.original_currency} = {exchangeRate.toFixed(6)} {formData.home_currency}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {tTransactions('date')} *
                      </Label>
                      <Input
                        type="date"
                        value={formData.transaction_date}
                        onChange={(e) => setFormData({...formData, transaction_date: e.target.value})}
                        className="bg-gray-600 border-gray-500 text-white"
                      />
                      {errors.transaction_date && <p className="text-red-400 text-sm">{errors.transaction_date}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        {tTransactions('category')} *
                      </Label>
                      <Select 
                        value={formData.expense_category} 
                        onValueChange={(value) => setFormData({...formData, expense_category: value})}
                      >
                        <SelectTrigger className="bg-gray-600 border-gray-500 text-white">
                          <SelectValue placeholder={tTransactions('selectCategory')} />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-700 border-gray-600">
                          {categoriesLoading ? (
                            <SelectItem value="loading" className="text-gray-400" disabled>
{tCommon('loading')}...
                            </SelectItem>
                          ) : categoriesError ? (
                            <SelectItem value="error" className="text-red-400" disabled>
{tCommon('error')} loading categories
                            </SelectItem>
                          ) : categories.length > 0 ? (
                            categories.map((category) => (
                              <SelectItem key={category.category_code} value={category.category_code} className="text-white">
                                {category.category_name}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="empty" className="text-gray-400" disabled>
{tTransactions('allCategories')} available
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      {errors.expense_category && <p className="text-red-400 text-sm">{errors.expense_category}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">{tTransactions('description')} *</Label>
                    <Input
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="bg-gray-600 border-gray-500 text-white"
                      placeholder={tTransactions('enterDescription')}
                    />
                    {errors.description && <p className="text-red-400 text-sm">{errors.description}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">{tManager('businessPurpose')} *</Label>
                    <Textarea
                      value={formData.business_purpose}
                      onChange={(e) => setFormData({...formData, business_purpose: e.target.value})}
                      className="bg-gray-600 border-gray-500 text-white"
                      placeholder={tManager('businessPurposePlaceholder')}
                      rows={3}
                    />
                    {errors.business_purpose && <p className="text-red-400 text-sm">{errors.business_purpose}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white">{tTransactions('reference')}</Label>
                      <Input
                        value={formData.reference_number || ''}
                        onChange={(e) => setFormData({...formData, reference_number: e.target.value})}
                        className="bg-gray-600 border-gray-500 text-white"
                        placeholder={tTransactions('documentNumberPlaceholder')}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-white">{tTransactions('notes')}</Label>
                      <Input
                        value={formData.notes || ''}
                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                        className="bg-gray-600 border-gray-500 text-white"
                        placeholder={tTransactions('notesPlaceholder')}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Editable Line Items */}
              <Card className="bg-gray-700 border-gray-600">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white flex items-center gap-2">
                      <DollarSign className="w-5 h-5" />
{tCommon('lineItems')} ({lineItems.length})
                    </CardTitle>
                    <Button
                      type="button"
                      onClick={addLineItem}
                      variant="outline"
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                    >
                      <Plus className="w-4 h-4 mr-2" />
{tCommon('add')} {tCommon('item')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {lineItems.length > 0 ? (
                    <div className="bg-gray-800 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-900">
                            <tr>
                              <th className="px-3 py-2 text-left text-gray-400 font-medium">#</th>
                              <th className="px-3 py-2 text-left text-gray-400 font-medium">{tCommon('description')}</th>
                              <th className="px-3 py-2 text-left text-gray-400 font-medium">{tTransactions('itemCode')}</th>
                              <th className="px-3 py-2 text-right text-gray-400 font-medium">{tCommon('qty')}</th>
                              <th className="px-3 py-2 text-left text-gray-400 font-medium">{tTransactions('unit')}</th>
                              <th className="px-3 py-2 text-right text-gray-400 font-medium">{tCommon('unitPrice')}</th>
                              <th className="px-3 py-2 text-right text-gray-400 font-medium">{tCommon('total')}</th>
                              <th className="px-3 py-2 text-center text-gray-400 font-medium">{tTransactions('actions')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-700">
                            {lineItems.map((item, index) => (
                              <tr key={index} className="hover:bg-gray-700">
                                <td className="px-3 py-2 text-gray-400">{index + 1}</td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="text"
                                    value={item.description || ''}
                                    onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                                    className="w-full px-2 py-1 bg-gray-600 border-gray-500 text-white text-sm"
                                    placeholder={tTransactions('itemDescriptionPlaceholder')}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="text"
                                    value={item.item_code || ''}
                                    onChange={(e) => updateLineItem(index, 'item_code', e.target.value)}
                                    className="w-full px-2 py-1 bg-gray-600 border-gray-500 text-white text-sm"
                                    placeholder={tTransactions('skuPlaceholder')}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.quantity || ''}
                                    onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2 py-1 bg-gray-600 border-gray-500 text-white text-sm text-right"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="text"
                                    value={item.unit_measurement || ''}
                                    onChange={(e) => updateLineItem(index, 'unit_measurement', e.target.value)}
                                    className="w-full px-2 py-1 bg-gray-600 border-gray-500 text-white text-sm"
                                    placeholder={tTransactions('unitPlaceholder')}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.unit_price || ''}
                                    onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2 py-1 bg-gray-600 border-gray-500 text-white text-sm text-right"
                                  />
                                </td>
                                <td className="px-3 py-2 text-right text-green-400 font-medium">
                                  {formatCurrency(item.total_amount || 0, formData.original_currency as SupportedCurrency)}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <Button
                                    type="button"
                                    onClick={() => removeLineItem(index)}
                                    variant="ghost"
                                    size="sm"
                                    className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-600"
                                    title={tTransactions('removeItem')}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
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
                      <p className="text-sm">{tTransactions('noLineItemsYet')}</p>
                      <p className="text-xs mt-1">{tTransactions('clickAddItemToStart')}</p>
                    </div>
                  )}

                  {/* Transaction Summary */}
                  {lineItems.length > 0 && (
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-600 mt-4">
                      <h5 className="text-sm font-medium text-white mb-3">{tTransactions('transactionSummary')}</h5>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">{tTransactions('itemsCount')}:</span>
                          <span className="text-white">{lineItems.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">{tTransactions('subtotal')}:</span>
                          <span className="text-white">
                            {formatCurrency(
                              lineItems.reduce((sum, item) => sum + (item.total_amount || 0), 0),
                              formData.original_currency as SupportedCurrency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between font-medium border-t border-gray-600 pt-2">
                          <span className="text-blue-300">{tCommon('totalAmount')}:</span>
                          <span className="text-blue-300 text-lg">
                            {formatCurrency(formData.original_amount, formData.original_currency as SupportedCurrency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && !loadError && (
          <div className="p-6 border-t border-gray-700">
            <div className="flex items-center justify-center space-x-2">
              <button
                onClick={onClose}
                disabled={saving || submitting}
                className="inline-flex items-center px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 hover:text-gray-800 text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                {tCommon('cancel')}
              </button>
              {onDelete && (
                <button
                  onClick={handleDeleteClick}
                  disabled={saving || submitting || isReprocessing}
                  className="inline-flex items-center px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  {tCommon('delete')}
                </button>
              )}
              {onReprocess && (processingStatus === 'failed' || processingStatus === 'completed') && (
                <button
                  onClick={handleReprocessClick}
                  disabled={saving || submitting || isReprocessing}
                  className={`inline-flex items-center px-3 py-1.5 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 ${
                    processingStatus === 'failed'
                      ? 'bg-orange-600 hover:bg-orange-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isReprocessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      {processingStatus === 'failed' ? `${t('reprocess')}...` : `${t('reExtract')}...`}
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4 mr-1.5" />
                      {processingStatus === 'failed' ? t('reprocess') : t('reExtract')}
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => handleSave('draft')}
                disabled={saving || submitting || isReprocessing}
                className="inline-flex items-center px-4 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
{tCommon('loading')}...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1.5" />
{tCommon('save')} Draft
                  </>
                )}
              </button>
              <button
                onClick={() => handleSave('submit')}
                disabled={saving || submitting || isReprocessing}
                className="inline-flex items-center px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
{t('submitting')}...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-1.5" />
{t('submit')}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={handleCloseDeleteConfirm}
        onConfirm={handleDeleteConfirmed}
        title={t('deleteConfirmTitle')}
        message={t('deleteConfirmMessage')}
        confirmText={t('deleteText')}
        cancelText={t('cancelText')}
        confirmVariant="danger"
        isLoading={isDeleting}
      />
    </div>
  )
}