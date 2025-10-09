/**
 * useExpenseForm - Main business logic hook for expense form management
 * Handles data loading, form state, submission, and AI processing
 * Uses discriminated unions for type safety between create and edit modes
 */

import { useState, useEffect, useCallback } from 'react'
import { useExpenseCategories } from './use-expense-categories'
import { useHomeCurrency } from '@/components/settings/currency-settings'
import { formatCurrency } from './use-transactions'
import { SupportedCurrency } from '@/types/transaction'
import { DSPyExtractionResult } from '@/types/expense-extraction'

// Form data interface
export interface ExpenseFormData {
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
  storage_path?: string
  line_items?: Array<{
    description: string
    quantity: number
    unit_price: number
    total_amount: number
  }>
}

// Receipt information interface
export interface ReceiptInfo {
  hasReceipt: boolean
  filename?: string
  fileType?: string
  processingStatus?: string
  storagePath?: string
}

// AI suggestions interface
export interface AISuggestion {
  fieldName: string
  currentValue: string | number
  suggestedValue: string | number
  fieldLabel: string
  confidence?: number
  suggestionReason?: string
}

// Base props shared by both modes
interface UseExpenseFormBaseProps {
  onSuccess?: () => void
  onDelete?: () => void
  onClose?: () => void
}

// Props specific to 'create' mode
export interface UseExpenseFormCreateProps extends UseExpenseFormBaseProps {
  mode: 'create'
  extractionResult: DSPyExtractionResult
  onSubmit?: (formData: ExpenseFormData) => Promise<any>
  onBack?: () => void
  isSubmitting?: boolean
}

// Props specific to 'edit' mode
export interface UseExpenseFormEditProps extends UseExpenseFormBaseProps {
  mode: 'edit'
  expenseClaimId: string
  onSave?: () => void
  onReprocess?: () => void
}

// Type-safe discriminated union
export type UseExpenseFormProps = UseExpenseFormCreateProps | UseExpenseFormEditProps

// Hook return interface
export interface UseExpenseFormReturn {
  // Form state
  formData: ExpenseFormData
  setFormData: React.Dispatch<React.SetStateAction<ExpenseFormData>>

  // Loading states
  loading: boolean
  saving: boolean
  submitting: boolean
  isReprocessing: boolean

  // Error states
  errors: Record<string, string>
  saveError: string | null
  loadError: string | null

  // Receipt info
  receiptInfo: ReceiptInfo

  // AI suggestions
  aiSuggestions: AISuggestion[]
  dismissedSuggestions: Set<string>

  // Currency/exchange
  previewAmount: number | null
  exchangeRate: number | null

  // Status info (for edit mode)
  claimStatus: string
  processingStatus: string

  // Processing method detection
  processingMethod: 'dspy' | 'manual_entry'
  isManualEntry: boolean

  // Categories and currency
  categories: any[]
  categoriesLoading: boolean
  categoriesError: any
  userHomeCurrency: string

  // Form actions
  validateForm: () => boolean
  handleSave: (action?: 'draft' | 'submit') => Promise<void>
  handleDelete: () => Promise<void>
  handleReprocessClick: () => Promise<void>

  // AI suggestion handlers
  handleAcceptSuggestion: (fieldName: string, value: string | number) => void
  handleRejectSuggestion: (fieldName: string) => void
  handleAcceptAllSuggestions: (acceptedSuggestions: Record<string, string | number>) => Promise<void>
  handleRejectAllSuggestions: () => void
}

export function useExpenseForm(props: UseExpenseFormProps): UseExpenseFormReturn {
  // Fetch dynamic categories and user home currency
  const { categories, loading: categoriesLoading, error: categoriesError } = useExpenseCategories()
  const userHomeCurrency = useHomeCurrency()

  // Determine processing method based on mode
  const [processingMethod, setProcessingMethod] = useState<'dspy' | 'manual_entry'>('dspy')
  const isManualEntry = processingMethod === 'manual_entry'

  // Form state
  const [formData, setFormData] = useState<ExpenseFormData>({
    description: '',
    business_purpose: '',
    expense_category: '',
    original_amount: 0,
    original_currency: userHomeCurrency || 'SGD',
    home_currency: userHomeCurrency || 'SGD',
    transaction_date: '',
    vendor_name: '',
    reference_number: '',
    notes: '',
    line_items: []
  })

  // Loading states
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [isReprocessing, setIsReprocessing] = useState(false)

  // Error states
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Receipt and status info
  const [receiptInfo, setReceiptInfo] = useState<ReceiptInfo>({ hasReceipt: false })
  const [claimStatus, setClaimStatus] = useState<string>('')
  const [processingStatusState, setProcessingStatusState] = useState<string>('')

  // Currency conversion
  const [previewAmount, setPreviewAmount] = useState<number | null>(null)
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)

  // AI suggestions state
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([])
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set())

  // Extract stable values from props to avoid infinite re-renders
  const mode = props.mode
  const extractionResult = props.mode === 'create' ? props.extractionResult : null
  const expenseClaimId = props.mode === 'edit' ? props.expenseClaimId : undefined

  // Extract callback props as stable references
  const onSubmit = props.mode === 'create' ? props.onSubmit : undefined
  const onBack = props.mode === 'create' ? props.onBack : undefined
  const isSubmitting = props.mode === 'create' ? props.isSubmitting : false
  const onSave = props.mode === 'edit' ? props.onSave : undefined
  const onReprocess = props.mode === 'edit' ? props.onReprocess : undefined
  const onSuccess = props.onSuccess
  const onDelete = props.onDelete
  const onClose = props.onClose

  // Load expense claim for edit mode
  const loadExpenseClaim = useCallback(async () => {
    if (mode !== 'edit' || !expenseClaimId) return

    try {
      setLoading(true)
      setLoadError(null)

      const response = await fetch(`/api/expense-claims/${expenseClaimId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('[useExpenseForm] Load error:', errorData)

        if (response.status === 404 || errorData.error?.includes('not found') || errorData.error?.includes('access denied')) {
          throw new Error('This expense claim cannot be edited. It may belong to a different user or may have been deleted.')
        }

        throw new Error(errorData.error || 'Failed to load expense claim')
      }

      const result = await response.json()
      const claim = result.data

      if (!claim) {
        throw new Error('Expense claim not found')
      }

      // Set status information
      setClaimStatus(claim.status || '')
      setProcessingStatusState(claim.processing_status || '')

      // Determine processing method
      const detectedMethod = claim.processing_metadata?.processing_method || 'dspy'
      setProcessingMethod(detectedMethod as 'dspy' | 'manual_entry')

      // Extract line items from various sources
      let lineItems: Array<{ description: string; quantity: number; unit_price: number; total_amount: number }> = []

      if (claim.line_items && Array.isArray(claim.line_items)) {
        lineItems = claim.line_items.map((item: any) => ({
          description: item.description || 'Item',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || item.unitPrice || 0,
          total_amount: item.total_amount || item.line_total || item.lineTotal || 0
        }))
      } else if (claim.transaction?.line_items && Array.isArray(claim.transaction.line_items)) {
        lineItems = claim.transaction.line_items.map((item: any) => ({
          description: item.description || item.item_description || 'Item',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || item.unitPrice || 0,
          total_amount: item.total_amount || item.line_total || item.lineTotal || 0
        }))
      } else if (claim.extracted_data?.line_items && Array.isArray(claim.extracted_data.line_items)) {
        lineItems = claim.extracted_data.line_items.map((item: any) => ({
          description: item.description || 'Item',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || item.unitPrice || 0,
          total_amount: item.total_amount || item.line_total || item.lineTotal || 0
        }))
      }

      // Set receipt information
      const hasReceipt = !!(claim.storage_path || claim.processing_metadata?.storage_path)
      setReceiptInfo({
        hasReceipt,
        filename: claim.processing_metadata?.original_filename || 'Receipt',
        fileType: claim.processing_metadata?.file_type || 'image/jpeg',
        processingStatus: claim.processing_metadata?.processing_status || 'completed',
        storagePath: claim.storage_path || claim.processing_metadata?.storage_path
      })

      // Set form data
      setFormData({
        description: claim.transaction?.description || claim.description || '',
        business_purpose: claim.transaction?.business_purpose || claim.business_purpose || '',
        expense_category: claim.transaction?.expense_category || claim.expense_category || 'other',
        original_amount: claim.transaction?.original_amount || claim.total_amount || 0,
        original_currency: claim.transaction?.original_currency || claim.currency || userHomeCurrency || 'SGD',
        home_currency: claim.transaction?.home_currency || userHomeCurrency || 'SGD',
        transaction_date: (claim.transaction?.transaction_date?.split('T')[0]) || claim.transaction_date || '',
        vendor_name: claim.transaction?.vendor_name || claim.vendor_name || '',
        reference_number: claim.transaction?.reference_number || claim.reference_number || '',
        notes: claim.transaction?.notes || '',
        storage_path: claim.storage_path,
        line_items: lineItems
      })

    } catch (error) {
      console.error('Error loading expense claim:', error)
      setLoadError(error instanceof Error ? error.message : 'Failed to load expense claim')
    } finally {
      setLoading(false)
    }
  }, [mode, expenseClaimId, userHomeCurrency])

  // Initialize form data based on mode
  const initializeFormData = useCallback(async () => {
    if (mode === 'create' && extractionResult) {
      // Initialize from extraction result
      setProcessingMethod(extractionResult.extractedData.processingMethod as 'dspy' | 'manual_entry')

      // Set form data from extraction result
      setFormData({
        description: extractionResult.extractedData.lineItems?.[0]?.description || 'Business expense',
        business_purpose: '',
        expense_category: inferExpenseCategory(extractionResult, categories),
        original_amount: extractionResult.extractedData.totalAmount || 0,
        original_currency: extractionResult.extractedData.currency || userHomeCurrency || 'SGD',
        home_currency: userHomeCurrency || 'SGD',
        transaction_date: extractionResult.extractedData.transactionDate || '',
        vendor_name: extractionResult.extractedData.vendorName || '',
        reference_number: extractionResult.extractedData.receiptNumber || extractionResult.extractedData.invoiceNumber || '',
        notes: '',
        storage_path: '', // Storage path comes from the processing pipeline, not extraction data
        line_items: extractionResult.extractedData.lineItems?.map(item => ({
          description: item.description || 'Item',
          quantity: item.quantity || 1,
          unit_price: item.unitPrice || (item.lineTotal / (item.quantity || 1)),
          total_amount: item.lineTotal || 0
        })) || []
      })

      setLoading(false)
    } else if (mode === 'edit') {
      // Load existing expense claim
      await loadExpenseClaim()
    }
  }, [mode, extractionResult, expenseClaimId, categories, userHomeCurrency, loadExpenseClaim])

  // Initialize form on mount or prop changes
  useEffect(() => {
    initializeFormData()
  }, [initializeFormData])

  // Update currencies when user's home currency preference loads/changes
  useEffect(() => {
    if (userHomeCurrency) {
      setFormData(prev => ({
        ...prev,
        home_currency: userHomeCurrency,
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

  // Form validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }
    if (!formData.business_purpose.trim()) {
      newErrors.business_purpose = 'Business purpose is required'
    }
    if (!formData.expense_category) {
      newErrors.expense_category = 'Category is required'
    }
    if (formData.original_amount <= 0) {
      newErrors.original_amount = 'Amount must be greater than 0'
    }
    if (!formData.vendor_name.trim()) {
      newErrors.vendor_name = 'Vendor name is required'
    }
    if (!formData.transaction_date) {
      newErrors.transaction_date = 'Date is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Form submission handler
  const handleSave = async (action: 'draft' | 'submit' = 'draft') => {
    if (!validateForm()) return

    try {
      if (action === 'draft') {
        setSaving(true)
      } else {
        setSubmitting(true)
      }
      setSaveError(null)

      if (mode === 'create') {
        // Create mode submission
        if (onSubmit) {
          await onSubmit(formData)
        }
      } else {
        // Edit mode submission
        if (action === 'submit') {
          // Two-step submission for edit mode
          const updateData = {
            ...formData,
            line_items: formData.line_items,
            status: 'draft'
          }

          const updateResponse = await fetch(`/api/expense-claims/${expenseClaimId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
          })

          if (!updateResponse.ok) {
            const errorData = await updateResponse.json()
            throw new Error(errorData.error || 'Failed to save expense claim before submission')
          }

          const submitResponse = await fetch(`/api/expense-claims/${expenseClaimId}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'submit' })
          })

          const submitResult = await submitResponse.json()

          if (!submitResponse.ok) {
            throw new Error(submitResult.error || 'Failed to submit expense claim to workflow')
          }

          console.log('Expense claim submitted to workflow successfully:', submitResult.data.message)
        } else {
          // Draft save for edit mode
          const updateData = {
            ...formData,
            line_items: formData.line_items,
            status: 'draft'
          }

          const response = await fetch(`/api/expense-claims/${expenseClaimId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to save expense claim as draft')
          }

          console.log('Expense claim saved as draft successfully')
        }

        if (onSave) {
          onSave()
        }
      }

      if (onSuccess) {
        onSuccess()
      }

      if (onClose) {
        onClose()
      }

    } catch (error) {
      console.error('Save/Submit error:', error)
      setSaveError(error instanceof Error ? error.message : `Failed to ${action === 'submit' ? 'submit' : 'save'} expense claim`)
    } finally {
      setSaving(false)
      setSubmitting(false)
    }
  }

  // Delete handler (edit mode only)
  const handleDelete = async () => {
    if (mode !== 'edit') return

    try {
      setSaveError(null)

      const response = await fetch(`/api/expense-claims/${expenseClaimId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete expense claim')
      }

      console.log('Expense claim deleted successfully')

      if (onDelete) {
        onDelete()
      }

      if (onClose) {
        onClose()
      }

    } catch (error) {
      console.error('Delete error:', error)
      setSaveError(error instanceof Error ? error.message : 'Failed to delete expense claim')
    }
  }

  // AI reprocessing handler
  const handleReprocessClick = async () => {
    if (mode !== 'edit') return
    if (!receiptInfo.hasReceipt || !receiptInfo.storagePath) {
      setSaveError('No receipt available for reprocessing')
      return
    }

    try {
      setIsReprocessing(true)
      setSaveError(null)

      console.log('[useExpenseForm] Starting AI reprocessing for existing receipt')

      const response = await fetch(`/api/expense-claims/${expenseClaimId}/reprocess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to start AI reprocessing')
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'AI reprocessing failed to start')
      }

      // Poll for completion and generate suggestions
      await pollReprocessingCompletion(result.data.task_id)

    } catch (error) {
      console.error('Reprocess error:', error)
      setSaveError(error instanceof Error ? error.message : 'Failed to reprocess expense claim')
    } finally {
      setIsReprocessing(false)
    }
  }

  // Poll for AI reprocessing completion
  const pollReprocessingCompletion = async (taskId: string) => {
    if (mode !== 'edit') return

    const maxAttempts = 60 // 2 minutes max polling
    let attempts = 0

    while (attempts < maxAttempts) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000)) // Poll every 2 seconds

        const statusResponse = await fetch(`/api/expense-claims/${expenseClaimId}`)

        if (!statusResponse.ok) {
          throw new Error('Failed to check reprocessing status')
        }

        const statusResult = await statusResponse.json()

        if (!statusResult.success) {
          throw new Error(statusResult.error || 'Status check failed')
        }

        const claimData = statusResult.data
        const processingMetadata = claimData.processing_metadata || {}
        const processingStatus = processingMetadata.processing_status

        if (processingStatus === 'processing' || processingStatus === 'pending') {
          console.log(`[useExpenseForm] Still reprocessing... (${attempts * 2}s elapsed)`)
          attempts++
          continue
        }

        // Processing completed successfully
        if (processingStatus === 'completed') {
          console.log('[useExpenseForm] Reprocessing completed successfully!')

          // Transform the result and generate suggestions
          const extractedData = processingMetadata.financial_data

          if (extractedData) {
            const suggestions: AISuggestion[] = []
            const confidenceScore = processingMetadata.confidence_score || 70

            // Helper function to create suggestion
            const createSuggestion = (fieldName: string, fieldLabel: string, currentValue: any, suggestedValue: any, reason?: string) => {
              if (suggestedValue && suggestedValue !== currentValue && suggestedValue !== '') {
                suggestions.push({
                  fieldName,
                  fieldLabel,
                  currentValue: currentValue || '',
                  suggestedValue,
                  confidence: confidenceScore,
                  suggestionReason: reason
                })
              }
            }

            // Generate field suggestions
            createSuggestion('vendor_name', 'Vendor Name', formData.vendor_name, extractedData.vendor_name, 'Extracted from receipt header')
            createSuggestion('original_amount', 'Amount', formData.original_amount, extractedData.total_amount, 'Extracted from receipt total')
            createSuggestion('original_currency', 'Currency', formData.original_currency, extractedData.original_currency, 'Detected from receipt format')
            createSuggestion('transaction_date', 'Transaction Date', formData.transaction_date, extractedData.transaction_date, 'Extracted from receipt date')
            createSuggestion('description', 'Description', formData.description, extractedData.description, 'Generated from receipt content')

            if (extractedData.reference_number) {
              createSuggestion('reference_number', 'Reference Number', formData.reference_number, extractedData.reference_number, 'Found on receipt')
            }

            console.log('[useExpenseForm] Generated suggestions:', suggestions)
            setAiSuggestions(suggestions)
            setDismissedSuggestions(new Set()) // Reset dismissed suggestions
          }

          return
        }

        // Processing failed
        if (processingStatus === 'failed') {
          const errorMessage = processingMetadata.error_message || 'AI reprocessing failed'
          throw new Error(errorMessage)
        }

        attempts++
      } catch (pollError) {
        console.error('[useExpenseForm] Polling error:', pollError)
        attempts++

        if (attempts >= 10) {
          throw new Error('Unable to check reprocessing status. Please try again.')
        }
      }
    }

    // Polling timed out
    if (attempts >= maxAttempts) {
      throw new Error('Reprocessing is taking longer than expected. Please try again.')
    }
  }

  // AI suggestion handlers
  const handleAcceptSuggestion = useCallback((fieldName: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }))

    // Remove this suggestion from the list
    setAiSuggestions(prev => prev.filter(s => s.fieldName !== fieldName))
  }, [])

  const handleRejectSuggestion = useCallback((fieldName: string) => {
    // Add to dismissed suggestions and remove from active suggestions
    setDismissedSuggestions(prev => new Set([...prev, fieldName]))
    setAiSuggestions(prev => prev.filter(s => s.fieldName !== fieldName))
  }, [])

  const handleAcceptAllSuggestions = useCallback(async (acceptedSuggestions: Record<string, string | number>) => {
    // Apply all suggestions to form data
    setFormData(prev => ({
      ...prev,
      ...acceptedSuggestions
    }))

    // Clear all suggestions
    setAiSuggestions([])
  }, [])

  const handleRejectAllSuggestions = useCallback(() => {
    // Dismiss all current suggestions
    const fieldNames = aiSuggestions.map(s => s.fieldName)
    setDismissedSuggestions(prev => new Set([...prev, ...fieldNames]))
    setAiSuggestions([])
  }, [aiSuggestions])

  return {
    // Form state
    formData,
    setFormData,

    // Loading states
    loading,
    saving,
    submitting,
    isReprocessing,

    // Error states
    errors,
    saveError,
    loadError,

    // Receipt info
    receiptInfo,

    // AI suggestions
    aiSuggestions,
    dismissedSuggestions,

    // Currency/exchange
    previewAmount,
    exchangeRate,

    // Status info
    claimStatus,
    processingStatus: processingStatusState,

    // Processing method detection
    processingMethod,
    isManualEntry,

    // Categories and currency
    categories,
    categoriesLoading,
    categoriesError,
    userHomeCurrency: userHomeCurrency || 'SGD',

    // Form actions
    validateForm,
    handleSave,
    handleDelete,
    handleReprocessClick,

    // AI suggestion handlers
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleAcceptAllSuggestions,
    handleRejectAllSuggestions
  }
}

// Helper function to infer expense category (from original form)
function inferExpenseCategory(result: DSPyExtractionResult, availableCategories: any[]): string {
  // DSPy extraction doesn't provide expense category directly
  // We'll use vendor name or line items to infer category in future iterations
  // For now, return the first available category or 'other' as fallback
  return availableCategories.length > 0 ? availableCategories[0].category_code : 'other'
}