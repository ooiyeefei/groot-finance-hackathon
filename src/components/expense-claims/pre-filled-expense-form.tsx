/**
 * Pre-filled Expense Form - Single Responsibility Component  
 * DSPy-Inspired Architecture: Displays pre-filled form from DSPy extraction results
 * Allows user to review, edit, and submit the expense claim
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  CheckCircle, 
  AlertCircle, 
  AlertTriangle,
  Edit3, 
  Brain, 
  Send, 
  ArrowLeft,
  Tag,
  DollarSign,
  Calendar,
  Building,
  FileText,
  Loader2,
  Save,
  Clock,
  Upload
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DSPyExtractionResult } from '@/types/expense-extraction'
import { useExpenseCategories, DynamicExpenseCategory } from '@/hooks/use-expense-categories'

interface ExpenseFormData {
  description: string
  business_purpose: string
  expense_category: string
  original_amount: number
  original_currency: string
  transaction_date: string
  vendor_name: string
  reference_number?: string
  notes?: string
  // document_id removed - using business_purpose_details for file tracking
  line_items?: any[]
}

interface PreFilledExpenseFormProps {
  extractionResult: DSPyExtractionResult
  onSubmit: (formData: ExpenseFormData) => Promise<any>
  onBack: () => void
  isSubmitting?: boolean
}

export default function PreFilledExpenseForm({ 
  extractionResult, 
  onSubmit, 
  onBack,
  isSubmitting = false 
}: PreFilledExpenseFormProps) {
  // Fetch dynamic categories
  const { categories, loading: categoriesLoading, error: categoriesError } = useExpenseCategories()
  
  // Initialize form with DSPy extracted data
  const [formData, setFormData] = useState<ExpenseFormData>({
    description: extractionResult.extractedData.lineItems?.[0]?.description || 'Business expense',
    business_purpose: '', // This needs user input
    expense_category: inferExpenseCategory(extractionResult, categories),
    original_amount: extractionResult.extractedData.totalAmount,
    original_currency: extractionResult.extractedData.currency,
    transaction_date: extractionResult.extractedData.transactionDate,
    vendor_name: extractionResult.extractedData.vendorName,
    reference_number: extractionResult.extractedData.receiptNumber || '',
    notes: '',
    // document_id removed - file info stored in business_purpose_details
    line_items: extractionResult.extractedData.lineItems?.map(item => ({
      description: item.description,
      quantity: item.quantity || 1,
      unit_price: item.unitPrice || (item.lineTotal / (item.quantity || 1)),
      total_amount: item.lineTotal
    })) || []
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState('form')
  const [isDraftSaving, setIsDraftSaving] = useState(false)
  const [isSubmittingForApproval, setIsSubmittingForApproval] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showSubmissionChoice, setShowSubmissionChoice] = useState(false)
  const [expenseClaimId, setExpenseClaimId] = useState<string | null>(null)
  const [submitStep, setSubmitStep] = useState<'form' | 'draft_saved' | 'submitted'>('form')

  // Duplicate detection state
  const [duplicateCheck, setDuplicateCheck] = useState({
    isChecking: false,
    isDuplicate: false,
    matchType: null as 'exact' | 'near' | 'reference_conflict' | null,
    duplicateData: null as any,
    message: '',
    variance: null as any
  })

  // Re-categorize when categories are loaded for the first time
  useEffect(() => {
    if (categories.length > 0 && !formData.expense_category) {
      const newCategory = inferExpenseCategory(extractionResult, categories)
      if (newCategory) {
        setFormData(prev => ({
          ...prev,
          expense_category: newCategory
        }))
      }
    }
  }, [categories, extractionResult, formData.expense_category])

  // Debounced duplicate checking function
  const checkForDuplicates = useCallback(async (
    reference_number: string, 
    transaction_date: string, 
    original_amount: number,
    vendor_name: string
  ) => {
    if (!reference_number || !transaction_date || !original_amount) {
      setDuplicateCheck(prev => ({ ...prev, isChecking: false, isDuplicate: false, message: '' }))
      return
    }

    setDuplicateCheck(prev => ({ ...prev, isChecking: true }))

    try {
      const response = await fetch('/api/expense-claims/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_number,
          transaction_date,
          original_amount,
          vendor_name,
          expense_category: formData.expense_category
        })
      })

      const result = await response.json()

      if (result.success && result.isDuplicate) {
        const duplicate = result.duplicateData
        let message = ''
        
        switch (result.matchType) {
          case 'exact':
            message = `This appears to be a duplicate of an expense submitted on ${new Date(duplicate.created_at).toLocaleDateString()} for ${duplicate.currency} ${duplicate.amount}. Status: ${duplicate.status.toUpperCase()}.`
            break
          case 'near':
            message = `Similar expense found: ${duplicate.reference_number} from ${new Date(duplicate.transaction_date).toLocaleDateString()} for ${duplicate.currency} ${duplicate.amount}. Please verify this is not a duplicate.`
            break
          case 'reference_conflict':
            message = result.warning || 'Same reference number found with different vendor. Please verify this is not a duplicate.'
            break
        }

        setDuplicateCheck({
          isChecking: false,
          isDuplicate: true,
          matchType: result.matchType,
          duplicateData: duplicate,
          message,
          variance: result.variance || null
        })
      } else {
        setDuplicateCheck({
          isChecking: false,
          isDuplicate: false,
          matchType: null,
          duplicateData: null,
          message: '',
          variance: null
        })
      }
    } catch (error) {
      console.error('Duplicate check failed:', error)
      // Fail open - don't block user if check fails
      setDuplicateCheck(prev => ({ ...prev, isChecking: false }))
    }
  }, [formData.expense_category])

  // Debounced effect for duplicate checking
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.reference_number && formData.transaction_date && formData.original_amount) {
        checkForDuplicates(
          formData.reference_number,
          formData.transaction_date,
          formData.original_amount,
          formData.vendor_name
        )
      }
    }, 800) // 800ms debounce

    return () => clearTimeout(timeoutId)
  }, [formData.reference_number, formData.transaction_date, formData.original_amount, formData.vendor_name, checkForDuplicates])

  // DSPy confidence indicators for each field
  const getFieldConfidence = (fieldName: string): 'high' | 'medium' | 'low' => {
    const confidence = extractionResult.extractedData.confidenceScore
    const missingFields = extractionResult.extractedData.missingFields || []
    
    if (missingFields.includes(fieldName)) return 'low'
    if (confidence >= 0.8) return 'high'
    if (confidence >= 0.6) return 'medium'
    return 'low'
  }

  // Auto-categorize based on vendor name and line items using dynamic categories
  function inferExpenseCategory(result: DSPyExtractionResult, availableCategories: DynamicExpenseCategory[]): string {
    if (!availableCategories.length) {
      // Fallback if no categories loaded yet
      return ''
    }

    const vendor = result.extractedData.vendorName.toLowerCase()
    const items = result.extractedData.lineItems.map(item => item.description.toLowerCase()).join(' ')
    const searchText = `${vendor} ${items}`
    
    let bestMatch: { category: string; confidence: number } = { category: '', confidence: 0 }
    
    // Check each category's vendor patterns and AI keywords
    for (const category of availableCategories) {
      let matchScore = 0
      
      // Check vendor patterns (if any)
      if (category.vendor_patterns) {
        for (const pattern of category.vendor_patterns) {
          if (searchText.includes(pattern.toLowerCase())) {
            matchScore += 0.4 // High weight for vendor patterns
          }
        }
      }
      
      // Check AI keywords (if any)
      if (category.ai_keywords) {
        for (const keyword of category.ai_keywords) {
          if (searchText.includes(keyword.toLowerCase())) {
            matchScore += 0.3 // Medium weight for AI keywords
          }
        }
      }
      
      // Update best match if this category scores higher
      if (matchScore > bestMatch.confidence) {
        bestMatch = {
          category: category.category_code,
          confidence: matchScore
        }
      }
    }
    
    // Return best match if confidence is reasonable, otherwise return first available category
    return bestMatch.confidence > 0.2 ? bestMatch.category : availableCategories[0]?.category_code || ''
  }

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

    // Block submission if exact duplicates are detected
    if (duplicateCheck.isDuplicate && duplicateCheck.matchType === 'exact') {
      newErrors.duplicate = 'Duplicate expense detected. Please review existing expense or use different reference number.'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle direct submission for approval (streamlined UX)
  const handleSubmitDirectly = async () => {
    if (!validateForm()) return
    
    try {
      setIsSubmittingForApproval(true)
      setSubmitError(null)
      
      // Step 1: Save expense claim as draft
      const draftResult = await onSubmit(formData)
      
      console.log('[Pre-filled Form] Draft result:', draftResult)
      console.log('[Pre-filled Form] Expected path:', draftResult?.data?.expense_claim?.id)
      
      if (!draftResult?.data?.expense_claim?.id) {
        throw new Error('Failed to create expense claim')
      }
      
      const claimId = draftResult.data.expense_claim.id
      
      // Step 2: Immediately submit for approval
      const response = await fetch(`/api/expense-claims/${claimId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'submit' })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to submit for approval')
      }
      
      const submitResult = await response.json()
      console.log('Successfully submitted for approval:', submitResult)
      
      setSubmitStep('submitted')
      
      // Close form after successful submission
      setTimeout(() => {
        onBack()
      }, 2000)
      
    } catch (error) {
      console.error('Direct submission error:', error)
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit expense claim')
    } finally {
      setIsSubmittingForApproval(false)
    }
  }

  // Save as draft first
  const handleSaveDraft = async () => {
    if (!validateForm()) return
    
    try {
      setIsDraftSaving(true)
      setSubmitError(null)
      
      // Save expense claim as draft
      const result = await onSubmit(formData)
      
      // Extract expense claim ID for workflow operations
      if (result?.data?.expense_claim?.id) {
        setExpenseClaimId(result.data.expense_claim.id)
        setSubmitStep('draft_saved')
        setShowSubmissionChoice(true)
      } else {
        // Fallback - close form if no workflow needed  
        onBack()
      }
    } catch (error) {
      console.error('Draft save error:', error)
      setSubmitError(error instanceof Error ? error.message : 'Failed to save expense claim')
    } finally {
      setIsDraftSaving(false)
    }
  }

  // Submit for manager approval
  const handleSubmitForApproval = async () => {
    if (!expenseClaimId) return
    
    try {
      setIsSubmittingForApproval(true)
      setSubmitError(null)
      
      const response = await fetch(`/api/expense-claims/${expenseClaimId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'submit' })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to submit for approval')
      }
      
      const result = await response.json()
      console.log('Successfully submitted for approval:', result)
      
      setSubmitStep('submitted')
      
      // Close form after successful submission
      setTimeout(() => {
        onBack()
      }, 2000)
      
    } catch (error) {
      console.error('Approval submission error:', error)
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit for approval')
    } finally {
      setIsSubmittingForApproval(false)
    }
  }

  // Keep as draft - just close the form
  const handleKeepAsDraft = () => {
    onBack()
  }

  const FieldConfidenceBadge = ({ confidence }: { confidence: 'high' | 'medium' | 'low' }) => {
    const colors = {
      high: 'bg-green-600 text-white',
      medium: 'bg-yellow-600 text-white', 
      low: 'bg-red-600 text-white'
    }
    
    return (
      <Badge variant="secondary" className={`text-xs ${colors[confidence]}`}>
        <CheckCircle className="w-3 h-3 mr-1" />
        Auto: {confidence}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <Edit3 className="w-16 h-16 mx-auto text-blue-500 mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">
          Review Extracted Data
        </h3>
        <p className="text-gray-400">
          AI has pre-filled your expense form. Please review and edit as needed.
        </p>
      </div>

      {/* Extraction Quality Summary */}
      <Card className={`border ${
        extractionResult.extractedData.extractionQuality === 'high' ? 'border-green-600 bg-green-900/20' :
        extractionResult.extractedData.extractionQuality === 'medium' ? 'border-yellow-600 bg-yellow-900/20' :
        'border-red-600 bg-red-900/20'
      }`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className="w-6 h-6 text-purple-400" />
              <div>
                <div className="text-white font-medium">
                  AI Extraction: {extractionResult.extractedData.extractionQuality} quality
                </div>
                <div className="text-gray-400 text-sm">
                  Confidence: {Math.round(extractionResult.extractedData.confidenceScore * 100)}%
                </div>
              </div>
            </div>
            {extractionResult.needsManualReview && (
              <Badge variant="secondary" className="bg-yellow-600">
                Review Required
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Duplicate Detection Warning */}
      {(duplicateCheck.isChecking || duplicateCheck.isDuplicate) && (
        <Alert className={`border ${
          duplicateCheck.matchType === 'exact' ? 'border-red-600 bg-red-900/20' :
          duplicateCheck.matchType === 'near' ? 'border-yellow-600 bg-yellow-900/20' :
          duplicateCheck.matchType === 'reference_conflict' ? 'border-orange-600 bg-orange-900/20' :
          'border-blue-600 bg-blue-900/20'
        }`}>
          <div className="flex items-center gap-3">
            {duplicateCheck.isChecking ? (
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            ) : (
              <AlertTriangle className={`h-5 w-5 ${
                duplicateCheck.matchType === 'exact' ? 'text-red-400' :
                duplicateCheck.matchType === 'near' ? 'text-yellow-400' :
                'text-orange-400'
              }`} />
            )}
            <AlertDescription className="text-white flex-1">
              {duplicateCheck.isChecking ? (
                <div>
                  <strong>Checking for duplicates...</strong>
                  <p className="text-sm text-gray-400 mt-1">
                    Verifying reference number, date, and amount against existing expenses.
                  </p>
                </div>
              ) : (
                <div>
                  <strong className={
                    duplicateCheck.matchType === 'exact' ? 'text-red-300' :
                    duplicateCheck.matchType === 'near' ? 'text-yellow-300' :
                    'text-orange-300'
                  }>
                    {duplicateCheck.matchType === 'exact' ? 'Duplicate Detected!' :
                     duplicateCheck.matchType === 'near' ? 'Similar Expense Found' :
                     'Reference Number Conflict'}
                  </strong>
                  <p className="text-sm text-gray-300 mt-1">
                    {duplicateCheck.message}
                  </p>
                  {duplicateCheck.duplicateData && (
                    <div className="mt-2 p-2 bg-gray-800/50 rounded text-xs">
                      <strong>Existing Expense:</strong> {duplicateCheck.duplicateData.description || 'N/A'} |{' '}
                      <strong>Status:</strong> {duplicateCheck.duplicateData.status?.toUpperCase()} |{' '}
                      <strong>Created:</strong> {new Date(duplicateCheck.duplicateData.created_at).toLocaleDateString()}
                    </div>
                  )}
                  {duplicateCheck.variance && (
                    <div className="mt-1 text-xs text-gray-400">
                      Amount difference: {duplicateCheck.duplicateData.currency} {duplicateCheck.variance.amountDifference?.toFixed(2)} |{' '}
                      Date difference: {Math.round(duplicateCheck.variance.dateDifferenceInDays)} days
                    </div>
                  )}
                </div>
              )}
            </AlertDescription>
          </div>
        </Alert>
      )}

      {/* Suggested Corrections */}
      {extractionResult.suggestedCorrections && extractionResult.suggestedCorrections.length > 0 && (
        <Alert className="bg-blue-900/20 border-blue-700">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-blue-400">
            <div className="space-y-1">
              <div className="font-medium">AI Suggestions:</div>
              {extractionResult.suggestedCorrections.map((suggestion, index) => (
                <div key={index} className="text-sm">• {suggestion}</div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 bg-gray-700 border border-gray-600">
          <TabsTrigger value="form" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            Expense Form
          </TabsTrigger>
          <TabsTrigger value="reasoning" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            AI Analysis
          </TabsTrigger>
        </TabsList>

        {/* Form Tab */}
        <TabsContent value="form" className="space-y-4">
          {/* Basic Information */}
          <Card className="bg-gray-700 border-gray-600">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white flex items-center gap-2">
                    <Building className="w-4 h-4" />
                    Vendor Name *
                    <FieldConfidenceBadge confidence={getFieldConfidence('vendorName')} />
                  </Label>
                  <Input
                    value={formData.vendor_name}
                    onChange={(e) => setFormData({...formData, vendor_name: e.target.value})}
                    className="bg-gray-600 border-gray-500 text-white"
                    placeholder="Vendor or merchant name"
                  />
                  {errors.vendor_name && <p className="text-red-400 text-sm">{errors.vendor_name}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-white flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Amount *
                    <FieldConfidenceBadge confidence={getFieldConfidence('totalAmount')} />
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.original_amount}
                      onChange={(e) => setFormData({...formData, original_amount: parseFloat(e.target.value) || 0})}
                      className="bg-gray-600 border-gray-500 text-white flex-1"
                      placeholder="0.00"
                    />
                    <Select 
                      value={formData.original_currency} 
                      onValueChange={(value) => setFormData({...formData, original_currency: value})}
                    >
                      <SelectTrigger className="bg-gray-600 border-gray-500 text-white w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-700 border-gray-600">
                        {['SGD', 'USD', 'EUR', 'MYR', 'THB', 'IDR', 'CNY', 'VND', 'PHP'].map(currency => (
                          <SelectItem key={currency} value={currency} className="text-white">{currency}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {errors.original_amount && <p className="text-red-400 text-sm">{errors.original_amount}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Transaction Date *
                    <FieldConfidenceBadge confidence={getFieldConfidence('transactionDate')} />
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
                    Category *
                  </Label>
                  <Select 
                    value={formData.expense_category} 
                    onValueChange={(value) => setFormData({...formData, expense_category: value})}
                  >
                    <SelectTrigger className="bg-gray-600 border-gray-500 text-white">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-700 border-gray-600">
                      {categoriesLoading ? (
                        <SelectItem value="loading" className="text-gray-400" disabled>
                          Loading categories...
                        </SelectItem>
                      ) : categoriesError ? (
                        <SelectItem value="error" className="text-red-400" disabled>
                          Error loading categories
                        </SelectItem>
                      ) : categories.length > 0 ? (
                        categories.map((category) => (
                          <SelectItem key={category.category_code} value={category.category_code} className="text-white">
                            {category.category_name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-categories" className="text-gray-400" disabled>
                          No categories available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {errors.expense_category && <p className="text-red-400 text-sm">{errors.expense_category}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white">Description *</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="bg-gray-600 border-gray-500 text-white"
                  placeholder="Brief description of expense"
                />
                {errors.description && <p className="text-red-400 text-sm">{errors.description}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-white">Business Purpose *</Label>
                <Textarea
                  value={formData.business_purpose}
                  onChange={(e) => setFormData({...formData, business_purpose: e.target.value})}
                  className="bg-gray-600 border-gray-500 text-white"
                  placeholder="Explain the business reason for this expense"
                  rows={3}
                />
                {errors.business_purpose && <p className="text-red-400 text-sm">{errors.business_purpose}</p>}
              </div>

              {/* Optional Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white">Reference Number</Label>
                  <Input
                    value={formData.reference_number || ''}
                    onChange={(e) => setFormData({...formData, reference_number: e.target.value})}
                    className="bg-gray-600 border-gray-500 text-white"
                    placeholder="Receipt or reference number"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-white">Additional Notes</Label>
                  <Input
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="bg-gray-600 border-gray-500 text-white"
                    placeholder="Any additional information"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items Display */}
          {extractionResult.extractedData.lineItems.length > 0 && (
            <Card className="bg-gray-700 border-gray-600">
              <CardHeader>
                <CardTitle className="text-white">Extracted Line Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {extractionResult.extractedData.lineItems.map((item, index) => (
                    <div key={index} className="flex justify-between items-center bg-gray-600 p-2 rounded">
                      <span className="text-white">{item.description}</span>
                      <span className="text-gray-300">
                        {item.quantity && `${item.quantity}x `}
                        ${item.lineTotal.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center bg-blue-900/20 p-2 rounded border border-blue-700">
                    <span className="text-blue-300 font-medium">Total</span>
                    <span className="text-blue-300 font-bold">
                      ${extractionResult.extractedData.totalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* DSPy Reasoning Tab */}
        <TabsContent value="reasoning" className="space-y-4">
          <Card className="bg-purple-900/20 border-purple-700">
            <CardHeader>
              <CardTitle className="text-purple-400 flex items-center gap-2">
                <Brain className="w-5 h-5" />
                AI Analysis Reasoning
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(extractionResult.thinking).map(([step, reasoning]) => (
                <div key={step} className="bg-gray-800 p-3 rounded">
                  <div className="text-purple-300 font-medium mb-1 text-sm">
                    {step.replace(/_/g, ' ').replace(/^step\d+\s*/, '').toUpperCase()}
                  </div>
                  <div className="text-gray-300 text-sm">{reasoning}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Submission Error */}
      {submitError && (
        <Alert className="bg-red-900/20 border-red-700">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-red-400">
            {submitError}
          </AlertDescription>
        </Alert>
      )}

      {/* Action Buttons - Streamlined UX */}
      {submitStep === 'form' && (
        <div className="flex gap-3 pt-4">
          <button
            onClick={onBack}
            disabled={isDraftSaving || isSubmittingForApproval}
            className="inline-flex items-center px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 hover:text-gray-800 text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </button>
          
          <button
            onClick={handleSaveDraft}
            disabled={isDraftSaving || isSubmittingForApproval}
            className="inline-flex items-center px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 hover:text-gray-800 text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {isDraftSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Draft
              </>
            )}
          </button>
          
          <button
            onClick={handleSubmitDirectly}
            disabled={isDraftSaving || isSubmittingForApproval}
            className="flex-1 inline-flex items-center justify-center px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {isSubmittingForApproval ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Submit for Approval
              </>
            )}
          </button>
        </div>
      )}

      {/* Draft Saved - Submission Choice */}
      {submitStep === 'draft_saved' && showSubmissionChoice && (
        <Card className="bg-blue-900/20 border-blue-700">
          <CardContent className="p-6">
            <div className="text-center mb-6">
              <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Expense Claim Saved Successfully
              </h3>
              <p className="text-gray-400">
                Choose what to do next with your expense claim:
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Keep as Draft */}
              <div className="p-4 bg-gray-700 rounded-lg border border-gray-600">
                <div className="flex items-center mb-2">
                  <Clock className="w-5 h-5 text-yellow-500 mr-2" />
                  <h4 className="font-medium text-white">Keep as Draft</h4>
                </div>
                <p className="text-sm text-gray-400 mb-4">
                  Save for later editing. You can submit for approval anytime.
                </p>
                <button
                  onClick={handleKeepAsDraft}
                  className="w-full inline-flex items-center justify-center px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 hover:text-gray-800 text-sm font-medium rounded-md transition-colors"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Keep as Draft
                </button>
              </div>
              
              {/* Submit for Approval */}
              <div className="p-4 bg-gray-700 rounded-lg border border-gray-600">
                <div className="flex items-center mb-2">
                  <Upload className="w-5 h-5 text-green-500 mr-2" />
                  <h4 className="font-medium text-white">Submit for Approval</h4>
                </div>
                <p className="text-sm text-gray-400 mb-4">
                  Send to your manager for review and approval immediately.
                </p>
                <button
                  onClick={handleSubmitForApproval}
                  disabled={isSubmittingForApproval}
                  className="w-full inline-flex items-center justify-center px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  {isSubmittingForApproval ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Submit for Approval
                    </>
                  )}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Successfully Submitted */}
      {submitStep === 'submitted' && (
        <Card className="bg-green-900/20 border-green-700">
          <CardContent className="p-6 text-center">
            <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">
              Submitted for Approval
            </h3>
            <p className="text-gray-400 mb-4">
              Your expense claim has been sent to your manager for review.
            </p>
            <p className="text-sm text-green-400">
              You will be notified when a decision is made.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}