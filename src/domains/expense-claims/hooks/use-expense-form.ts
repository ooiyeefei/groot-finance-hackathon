/**
 * useExpenseForm - Main business logic hook for expense form management
 * Handles data loading, form state, submission, and AI processing
 * Uses discriminated unions for type safety between create and edit modes
 */

import { useState, useEffect, useCallback } from 'react'
import { useExpenseCategories, validateCategorySelection } from './use-expense-categories'
import { useHomeCurrency } from '@/domains/users/hooks/use-home-currency'
import { formatCurrency } from '@/domains/accounting-entries/hooks/use-accounting-entries'
import { SupportedCurrency } from '@/domains/accounting-entries/types'
import { AIExtractionResult } from '@/domains/expense-claims/types/expense-extraction'
// Removed client-side Trigger.dev imports - now uses server-side API

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
  // Tax information from extraction
  tax_amount?: number
  subtotal_amount?: number
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
  extractionResult: AIExtractionResult
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
  processingMethod: 'ai' | 'manual_entry'
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
  // For edit mode, include disabled categories to handle cases where assigned category was disabled
  const { categories, loading: categoriesLoading, error: categoriesError } = useExpenseCategories({
    includeDisabled: props.mode === 'edit'
  })
  const { currency: userHomeCurrency } = useHomeCurrency()

  // Determine processing method based on mode
  const [processingMethod, setProcessingMethod] = useState<'ai' | 'manual_entry'>('ai')
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

      const response = await fetch(`/api/v1/expense-claims/${expenseClaimId}`, {
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

      // DEBUG: Log raw data from API/Convex
      console.log('[useExpenseForm] RAW API RESPONSE:', {
        expense_category: claim?.expense_category,
        expenseCategory: claim?.expenseCategory,
        transaction_expense_category: claim?.transaction?.expense_category,
        processingMetadata_category: claim?.processing_metadata?.category_mapping?.business_category,
        fullClaim: claim
      })

      if (!claim) {
        throw new Error('Expense claim not found')
      }

      // Set status information - separate workflow and AI processing status
      setClaimStatus(claim.status || '') // Workflow status (draft, submitted, approved, etc.)

      // Extract AI processing status from processing_metadata
      let aiProcessingStatus = 'idle' // Default status
      if (claim.processing_metadata) {
        if (claim.processing_metadata.ai_processing_status) {
          // Direct AI processing status from metadata (e.g., 'failed')
          aiProcessingStatus = claim.processing_metadata.ai_processing_status
        } else if (claim.processing_metadata.extraction_method === 'ai' && claim.processing_metadata.extraction_timestamp) {
          // AI extraction completed successfully
          aiProcessingStatus = 'completed'
        } else if (claim.status === 'analyzing') {
          // Currently processing
          aiProcessingStatus = 'processing'
        }
      }

      setProcessingStatusState(aiProcessingStatus)

      // Determine processing method
      const detectedMethod = claim.processing_metadata?.processing_method || 'ai'
      setProcessingMethod(detectedMethod as 'ai' | 'manual_entry')

      // Extract line items from various sources
      // Priority: direct line_items > transaction.line_items > processing_metadata.line_items > extracted_data.line_items
      let lineItems: Array<{ description: string; quantity: number; unit_price: number; total_amount: number }> = []

      // Helper to map line items with proper calculations
      // Handles two scenarios:
      // 1. Lambda extracts line_total but unit_price is null → back-calculate unit_price
      // 2. Data has unit_price but line_total is missing → calculate total from qty * unit_price
      const mapLineItem = (item: any) => {
        const qty = item.quantity || 1
        const unitPrice = item.unit_price || item.unitPrice || 0
        const lineTotal = item.total_amount || item.line_total || item.lineTotal || 0

        // Calculate final values ensuring consistency
        let finalUnitPrice = unitPrice
        let finalTotal = lineTotal

        if (lineTotal > 0 && unitPrice === 0 && qty > 0) {
          // Case 1: Lambda gave us line_total but not unit_price → back-calculate
          finalUnitPrice = lineTotal / qty
          finalTotal = lineTotal
        } else if (unitPrice > 0 && lineTotal === 0) {
          // Case 2: We have unit_price but no line_total → calculate total
          finalTotal = qty * unitPrice
        } else if (lineTotal === 0 && unitPrice === 0) {
          // Case 3: Neither available → keep as 0
          finalTotal = 0
          finalUnitPrice = 0
        }

        return {
          description: item.description || item.item_description || 'Item',
          quantity: qty,
          unit_price: finalUnitPrice,
          total_amount: finalTotal
        }
      }

      if (claim.line_items && Array.isArray(claim.line_items)) {
        lineItems = claim.line_items.map(mapLineItem)
      } else if (claim.transaction?.line_items && Array.isArray(claim.transaction.line_items)) {
        lineItems = claim.transaction.line_items.map(mapLineItem)
      } else if (claim.processing_metadata?.line_items && Array.isArray(claim.processing_metadata.line_items)) {
        // Lambda DSPy stores line_items in processing_metadata
        lineItems = claim.processing_metadata.line_items.map(mapLineItem)
      } else if (claim.extracted_data?.line_items && Array.isArray(claim.extracted_data.line_items)) {
        lineItems = claim.extracted_data.line_items.map(mapLineItem)
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

      // Extract tax information from processing metadata
      // Check multiple locations: financial_data (legacy), raw_extraction (legacy), or top-level (Lambda DSPy)
      const taxAmount = claim.processing_metadata?.financial_data?.tax_amount ||
                       claim.processing_metadata?.raw_extraction?.tax_amount ||
                       claim.processing_metadata?.tax_amount ||
                       0
      const subtotalAmount = claim.processing_metadata?.financial_data?.subtotal_amount ||
                            claim.processing_metadata?.raw_extraction?.subtotal_amount ||
                            claim.processing_metadata?.subtotal_amount

      // Set form data
      // Note: expense_category from API is a NAME (e.g., 'Miscellaneous'), but dropdown uses ID
      // We'll set the name here; a separate effect will resolve it to ID when categories load
      const categoryNameOrId = claim.transaction?.expense_category || claim.expense_category || ''

      // DEBUG: Log category value being set
      console.log('[useExpenseForm] CATEGORY VALUE BEING SET:', {
        categoryNameOrId,
        fromTransaction: claim.transaction?.expense_category,
        fromClaim: claim.expense_category
      })

      setFormData({
        description: claim.transaction?.description || claim.description || '',
        business_purpose: claim.transaction?.business_purpose || claim.business_purpose || '',
        expense_category: categoryNameOrId,
        original_amount: claim.transaction?.original_amount || claim.total_amount || 0,
        original_currency: claim.transaction?.original_currency || claim.currency || userHomeCurrency || 'SGD',
        home_currency: claim.transaction?.home_currency || userHomeCurrency || 'SGD',
        transaction_date: (claim.transaction?.transaction_date?.split('T')[0]) || claim.transaction_date || '',
        vendor_name: claim.transaction?.vendor_name || claim.vendor_name || '',
        reference_number: claim.transaction?.reference_number || claim.reference_number || '',
        notes: claim.transaction?.notes || '',
        storage_path: claim.storage_path,
        tax_amount: taxAmount,
        subtotal_amount: subtotalAmount,
        line_items: lineItems
      })

    } catch (error) {
      console.error('Error loading expense claim:', error)
      setLoadError(error instanceof Error ? error.message : 'Failed to load expense claim')
    } finally {
      setLoading(false)
    }
  }, [mode, expenseClaimId]) // Remove userHomeCurrency to prevent unnecessary re-renders

  // Initialize form data based on mode
  const initializeFormData = useCallback(async () => {
    if (mode === 'create' && extractionResult) {
      // Initialize from extraction result
      setProcessingMethod(extractionResult.extractedData.processingMethod as 'ai' | 'manual_entry')

      // Use AI-extracted description and business purpose, with smart fallbacks
      const aiDescription = extractionResult.extractedData.description ||
                           extractionResult.extractedData.lineItems?.[0]?.description ||
                           'Business expense'
      const aiBusinessPurpose = extractionResult.extractedData.businessPurpose ||
                               `Business expense - ${extractionResult.extractedData.vendorName || 'vendor'}`

      // Set form data from extraction result
      setFormData({
        description: aiDescription,
        business_purpose: aiBusinessPurpose,
        expense_category: inferExpenseCategory(extractionResult, categories),
        original_amount: extractionResult.extractedData.totalAmount || 0,
        original_currency: extractionResult.extractedData.currency || userHomeCurrency || 'SGD',
        home_currency: userHomeCurrency || 'SGD',
        transaction_date: extractionResult.extractedData.transactionDate || '',
        vendor_name: extractionResult.extractedData.vendorName || '',
        reference_number: extractionResult.extractedData.receiptNumber || extractionResult.extractedData.invoiceNumber || '',
        notes: '',
        storage_path: '', // Storage path comes from the processing pipeline, not extraction data
        tax_amount: extractionResult.extractedData.taxAmount || 0,
        subtotal_amount: extractionResult.extractedData.subtotalAmount,
        line_items: extractionResult.extractedData.lineItems?.map(item => {
          // Apply same robust calculation logic as edit mode's mapLineItem
          const qty = item.quantity || 1
          const unitPrice = item.unitPrice || 0
          const lineTotal = item.lineTotal || 0

          // Calculate final values ensuring consistency
          let finalUnitPrice = unitPrice
          let finalTotal = lineTotal

          if (lineTotal > 0 && unitPrice === 0 && qty > 0) {
            // Lambda gave us lineTotal but not unitPrice → back-calculate
            finalUnitPrice = lineTotal / qty
            finalTotal = lineTotal
          } else if (unitPrice > 0 && lineTotal === 0) {
            // We have unitPrice but no lineTotal → calculate total
            finalTotal = qty * unitPrice
          }

          return {
            description: item.description || 'Item',
            quantity: qty,
            unit_price: finalUnitPrice,
            total_amount: finalTotal
          }
        }) || []
      })

      setLoading(false)
    } else if (mode === 'edit') {
      // Load existing expense claim
      await loadExpenseClaim()
    }
  }, [mode, extractionResult, expenseClaimId, loadExpenseClaim]) // Reduce dependencies to essential ones

  // Initialize form on mount or prop changes
  useEffect(() => {
    initializeFormData()
  }, [mode, extractionResult, expenseClaimId]) // Only depend on essential props that should trigger re-initialization

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

  // Resolve category when categories load (fixes race condition and name-to-ID mapping)
  // Categories fetch asynchronously, so initial form setup may have empty categories
  // Also handles edit mode where API returns category NAME but dropdown uses ID
  useEffect(() => {
    // DEBUG: Log category resolution attempt
    console.log('[useExpenseForm] CATEGORY RESOLUTION CHECK:', {
      categoriesLength: categories.length,
      categoriesLoading,
      currentExpenseCategory: formData.expense_category,
      availableCategories: categories.map(c => ({ id: c.id, name: c.category_name }))
    })

    if (categories.length > 0 && !categoriesLoading) {
      const currentCategory = formData.expense_category
      const isCurrentCategoryValid = categories.some(cat => cat.id === currentCategory)

      // Skip if category is already a valid ID
      if (isCurrentCategoryValid) {
        return
      }

      let resolvedCategoryId = ''

      if (mode === 'create' && extractionResult) {
        // Create mode: use AI inference
        resolvedCategoryId = inferExpenseCategory(extractionResult, categories)
      } else if (mode === 'edit' && currentCategory) {
        // Edit mode: resolve category NAME to ID
        // The API returns category name (e.g., 'Miscellaneous'), but dropdown uses ID
        const matchedCategory = categories.find(cat =>
          cat.id === currentCategory ||
          cat.category_name?.toLowerCase() === currentCategory.toLowerCase()
        )

        // DEBUG: Log matching attempt
        console.log('[useExpenseForm] EDIT MODE CATEGORY MATCHING:', {
          currentCategory,
          matchedCategory: matchedCategory ? { id: matchedCategory.id, name: matchedCategory.category_name } : null,
          willFallbackToFirst: !matchedCategory,
          firstCategory: categories[0] ? { id: categories[0].id, name: categories[0].category_name } : null
        })

        resolvedCategoryId = matchedCategory?.id || categories[0]?.id || ''
      }

      if (resolvedCategoryId && resolvedCategoryId !== currentCategory) {
        console.log('[useExpenseForm] Resolved category:', currentCategory, '->', resolvedCategoryId)
        setFormData(prev => ({
          ...prev,
          expense_category: resolvedCategoryId
        }))
      }
    }
  }, [mode, extractionResult, categories, categoriesLoading, formData.expense_category])

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

  // Form validation with enhanced category validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}
    const newWarnings: Record<string, string> = {}

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }
    if (!formData.business_purpose.trim()) {
      newErrors.business_purpose = 'Business purpose is required'
    }

    // Enhanced category validation
    const categoryValidation = validateCategorySelection(formData.expense_category, categories)
    if (!categoryValidation.isValid) {
      newErrors.expense_category = categoryValidation.error || 'Category is required'
    } else if (categoryValidation.warning) {
      newWarnings.expense_category = categoryValidation.warning
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

    // Set both errors and warnings (warnings don't prevent form submission)
    setErrors({ ...newErrors, ...newWarnings })
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

          const updateResponse = await fetch(`/api/v1/expense-claims/${expenseClaimId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
          })

          if (!updateResponse.ok) {
            const errorData = await updateResponse.json()
            throw new Error(errorData.error || 'Failed to save expense claim before submission')
          }

          const submitResponse = await fetch(`/api/v1/expense-claims/${expenseClaimId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'submitted' })
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

          const response = await fetch(`/api/v1/expense-claims/${expenseClaimId}`, {
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

      const response = await fetch(`/api/v1/expense-claims/${expenseClaimId}`, {
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

  // AI reprocessing handler - Uses server-side API like Re-extract button
  const handleReprocessClick = async () => {
    if (mode !== 'edit') return
    if (!receiptInfo.hasReceipt || !receiptInfo.storagePath) {
      setSaveError('No receipt available for reprocessing')
      return
    }

    try {
      setIsReprocessing(true)
      setSaveError(null)

      console.log('[useExpenseForm] Starting AI reprocessing via server-side API for:', expenseClaimId)

      // Call server-side API endpoint (same pattern as Re-extract button in dashboard)
      const response = await fetch(`/api/v1/expense-claims/${expenseClaimId}/reprocess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to start reprocessing')
      }

      console.log('[useExpenseForm] Server-side reprocessing started:', result)

      // Start polling for completion
      await pollReprocessingCompletion(result.data?.task_id)

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

    console.log('[useExpenseForm] Starting polling for task:', taskId)

    while (attempts < maxAttempts) {
      try {
        await new Promise(resolve => setTimeout(resolve, 3000)) // Poll every 3 seconds

        // Check the expense claim for updated processing metadata
        const statusResponse = await fetch(`/api/v1/expense-claims/${expenseClaimId}`)

        if (!statusResponse.ok) {
          throw new Error('Failed to check reprocessing status')
        }

        const statusResult = await statusResponse.json()

        if (!statusResult.success) {
          throw new Error(statusResult.error || 'Status check failed')
        }

        const claimData = statusResult.data
        const processingMetadata = claimData.processing_metadata || {}

        console.log(`[useExpenseForm] Polling attempt ${attempts + 1}, metadata:`, {
          hasMetadata: !!processingMetadata,
          extractionMethod: processingMetadata.extraction_method,
          confidenceScore: processingMetadata.confidence_score
        })

        // Check if new extraction data is available
        if (processingMetadata.financial_data && processingMetadata.extraction_timestamp) {
          console.log('[useExpenseForm] New extraction data detected!')

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

            // Show success message
            setSaveError(null)
            console.log('[useExpenseForm] Reprocessing completed successfully!')
            return
          }
        }

        attempts++

        // Continue polling if we haven't found new data yet
        if (attempts < maxAttempts) {
          console.log(`[useExpenseForm] No new data yet, continuing to poll... (${attempts * 3}s elapsed)`)
        }

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
      throw new Error('Reprocessing is taking longer than expected. Please refresh the page to check for updates.')
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

// Helper function to infer expense category from AI extraction
function inferExpenseCategory(result: AIExtractionResult, availableCategories: any[]): string {
  // First, check if AI provided a suggested category
  const aiSuggestedCategory = result.extractedData.suggestedCategory

  if (aiSuggestedCategory && availableCategories.length > 0) {
    // Try to match AI suggestion against available categories
    const matchedCategory = availableCategories.find(cat =>
      cat.id === aiSuggestedCategory ||
      cat.category_name?.toLowerCase() === aiSuggestedCategory.toLowerCase() ||
      cat.category_code?.toLowerCase() === aiSuggestedCategory.toLowerCase()
    )

    if (matchedCategory) {
      return matchedCategory.id
    }
  }

  // Fallback: return first available category or 'other'
  return availableCategories.length > 0 ? availableCategories[0].id : 'other'
}