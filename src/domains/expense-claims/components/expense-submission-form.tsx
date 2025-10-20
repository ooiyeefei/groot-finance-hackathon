/**
 * Expense Submission Form
 * Implements Mel's mobile-first receipt capture with OCR integration
 */

'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Camera, Upload, AlertCircle, CheckCircle, Loader2, Tag, RotateCcw, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/components/ui/toast'
import { SupportedCurrency } from '@/domains/accounting-entries/types'

interface ExpenseSubmissionFormProps {
  onClose: () => void
  onSubmit: (data: ExpenseFormData) => void
}

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
}

interface OCRResult {
  vendor_name?: string
  total_amount?: number
  currency?: string
  transaction_date?: string
  description?: string
  confidence_score?: number
  processing_status?: string
  requires_validation?: boolean
  missing_fields?: string[]
  expense_category?: string
  category_confidence?: number
  category_reasoning?: string
  processing_method?: string
  gemini_model?: string
  line_items?: Array<{
    description: string
    amount: number
    quantity?: number
  }>
}

interface CustomExpenseCategory {
  id: string
  category_name: string
  category_code: string
  description?: string
  is_active: boolean
  tax_treatment: 'deductible' | 'non_deductible' | 'partial'
  requires_receipt: boolean
  receipt_threshold?: number
  policy_limit?: number
  requires_manager_approval: boolean
}

export default function ExpenseSubmissionForm({ onClose, onSubmit }: ExpenseSubmissionFormProps) {
  const { addToast } = useToast()
  const [step, setStep] = useState<'capture' | 'form' | 'review'>('capture')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null)
  const [processing, setProcessing] = useState(false)
  const [formData, setFormData] = useState<ExpenseFormData>({
    description: '',
    business_purpose: '',
    expense_category: '',
    original_amount: 0,
    original_currency: 'SGD',
    transaction_date: new Date().toISOString().split('T')[0],
    vendor_name: '',
    reference_number: '',
    notes: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [categories, setCategories] = useState<CustomExpenseCategory[]>([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [processingFailed, setProcessingFailed] = useState(false)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [allowedCurrencies, setAllowedCurrencies] = useState<SupportedCurrency[]>([])
  const [loadingCurrencies, setLoadingCurrencies] = useState(true)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Fetch categories and allowed currencies on component mount
  useEffect(() => {
    const fetchCategoriesAndCurrencies = async () => {
      setLoadingCategories(true)
      setLoadingCurrencies(true)

      try {
        // Fetch categories
        const categoriesResponse = await fetch('/api/v1/expense-claims/categories')

        if (!categoriesResponse.ok) {
          throw new Error(`Failed to fetch categories: ${categoriesResponse.statusText}`)
        }

        const categoriesResult = await categoriesResponse.json()

        if (!categoriesResult.success) {
          throw new Error(categoriesResult.error || 'Failed to fetch categories')
        }

        if (!categoriesResult.data.categories || categoriesResult.data.categories.length === 0) {
          throw new Error('No expense categories configured. Please contact your business admin to set up categories.')
        }

        setCategories(categoriesResult.data.categories)
        console.log('[Categories] Loaded from API:', categoriesResult.data.categories.length)

        // Fetch business profile for allowed currencies
        const businessResponse = await fetch('/api/v1/account-management/businesses/profile')

        if (!businessResponse.ok) {
          throw new Error(`Failed to fetch business profile: ${businessResponse.statusText}`)
        }

        const businessResult = await businessResponse.json()

        if (!businessResult.success) {
          throw new Error(businessResult.error || 'Failed to fetch business profile')
        }

        const businessAllowedCurrencies = businessResult.data.allowed_currencies || ['USD', 'SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', 'CNY', 'EUR']
        setAllowedCurrencies(businessAllowedCurrencies)
        console.log('[Currencies] Loaded allowed currencies:', businessAllowedCurrencies)

        // Set default currency to business home currency if available
        const homeCurrency = businessResult.data.home_currency
        if (homeCurrency && businessAllowedCurrencies.includes(homeCurrency)) {
          setFormData(prev => ({ ...prev, original_currency: homeCurrency }))
        }

      } catch (error) {
        console.error('[Data Loading] Error fetching categories or currencies:', error)
        addToast({
          type: 'error',
          title: 'Setup Required',
          description: error instanceof Error ? error.message : 'Failed to load required data. Please contact your admin.'
        })
        // Close the form since we can't proceed without this data
        setTimeout(() => onClose(), 2000)
      } finally {
        setLoadingCategories(false)
        setLoadingCurrencies(false)
      }
    }

    fetchCategoriesAndCurrencies()
  }, [])

  // Auto-categorization when OCR results include suggested category
  useEffect(() => {
    if (ocrResult?.expense_category && categories.length > 0) {
      const matchingCategory = categories.find(cat => cat.category_code === ocrResult.expense_category)
      if (matchingCategory) {
        setFormData(prev => ({ ...prev, expense_category: matchingCategory.category_code }))
      }
    }
  }, [ocrResult, categories])

  // Mel's mobile-first file handling
  const handleFileSelect = useCallback((file: File) => {
    if (!file) return

    // Validate file
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      setErrors({ file: 'Please select a valid image (JPEG, PNG, WebP) or PDF file' })
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrors({ file: 'File size must be less than 10MB' })
      return
    }

    setSelectedFile(file)
    setErrors({})

    // Create preview
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
    }

    // Auto-advance to form with OCR processing
    handleOCRProcessing(file)
  }, [])

  const handleCameraCapture = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click()
    }
  }

  const handleFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  // OCR processing integration
  const handleOCRProcessing = async (file: File) => {
    setProcessing(true)
    setStep('form')

    try {
      // Upload file and trigger OCR
      const formDataUpload = new FormData()
      formDataUpload.append('receipt', file)
      // Only send expense_category if one is selected
      if (formData.expense_category) {
        formDataUpload.append('expense_category', formData.expense_category)
      }

      const uploadResponse = await fetch('/api/v1/expense-claims/upload', {
        method: 'POST',
        body: formDataUpload
      })

      const uploadResult = await uploadResponse.json()

      if (uploadResult.success) {
        const documentId = uploadResult.data.document.id

        // Poll for OCR results (Mel's progressive feedback)
        let attempts = 0
        const maxAttempts = 30 // 30 seconds

        const pollOCR = async (): Promise<void> => {
          if (attempts >= maxAttempts) {
            setProcessing(false)
            setProcessingFailed(true)
            setErrors({ ocr: 'Processing timeout. You can try reprocessing or enter details manually.' })
            return
          }

          try {
            // OCR handling updated to use business_purpose_details approach
            const ocrResponse = await fetch(`/api/v1/expense-claims/${documentId}`)
            const ocrData = await ocrResponse.json()

            if (ocrData.success && ocrData.data.processing_complete) {
              const extractedData = ocrData.data.expense_data

              // Update form with OCR results
              setFormData(prev => ({
                ...prev,
                vendor_name: extractedData.vendor_name || prev.vendor_name,
                original_amount: extractedData.total_amount || prev.original_amount,
                original_currency: extractedData.currency || prev.original_currency,
                transaction_date: extractedData.transaction_date || prev.transaction_date,
                description: extractedData.description || prev.description,
                // document_id removed - file info stored in business_purpose_details
              }))

              setOcrResult(extractedData)
              setProcessing(false)
              setProcessingFailed(false)
              setDocumentId(documentId)
            } else {
              attempts++
              setTimeout(pollOCR, 1000) // Poll every second
            }
          } catch (error) {
            attempts++
            setTimeout(pollOCR, 1000)
          }
        }

        // Start polling
        setTimeout(pollOCR, 2000) // Initial delay
      } else {
        throw new Error(uploadResult.error || 'Upload failed')
      }
    } catch (error) {
      console.error('OCR processing failed:', error)
      setProcessing(false)
      setProcessingFailed(true)
      setErrors({ ocr: 'Failed to process receipt. You can try reprocessing or enter details manually.' })
    }
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
      newErrors.expense_category = 'Expense category is required'
    }

    if (formData.original_amount <= 0) {
      newErrors.original_amount = 'Amount must be greater than 0'
    }

    if (!formData.transaction_date) {
      newErrors.transaction_date = 'Transaction date is required'
    }

    if (!formData.vendor_name.trim()) {
      newErrors.vendor_name = 'Vendor name is required'
    }

    if (!formData.original_currency) {
      newErrors.original_currency = 'Currency is required'
    } else if (allowedCurrencies.length > 0 && !allowedCurrencies.includes(formData.original_currency as SupportedCurrency)) {
      newErrors.original_currency = `Currency ${formData.original_currency} is not allowed by your business`
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) return

    setProcessing(true)

    try {
      const response = await fetch('/api/v1/expense-claims', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      const result = await response.json()

      if (result.success) {
        onSubmit(formData)
      } else {
        setErrors({ submit: result.error || 'Failed to create expense claim' })
      }
    } catch (error) {
      console.error('Submit failed:', error)
      setErrors({ submit: 'Network error. Please try again.' })
    } finally {
      setProcessing(false)
    }
  }

  // Re-upload functionality - reset everything and start over
  const handleReUpload = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    setOcrResult(null)
    setProcessing(false)
    setProcessingFailed(false)
    setDocumentId(null)
    setErrors({})
    setStep('capture')
  }

  // Reprocess functionality - retry OCR on the same file
  const handleReprocess = () => {
    if (selectedFile) {
      setOcrResult(null)
      setProcessingFailed(false)
      setErrors({})
      handleOCRProcessing(selectedFile)
    }
  }

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-white">Submit Expense Claim</h2>
            <p className="text-gray-400 text-sm">
              {step === 'capture' && 'Capture or upload your receipt'}
              {step === 'form' && 'Enter expense details'}
              {step === 'review' && 'Review and submit'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {step === 'capture' && (
            <CaptureStep
              onCameraCapture={handleCameraCapture}
              onFileUpload={handleFileUpload}
              onSkip={() => setStep('form')}
              error={errors.file}
            />
          )}

          {step === 'form' && (
            <FormStep
              formData={formData}
              setFormData={setFormData}
              errors={errors}
              processing={processing}
              processingFailed={processingFailed}
              ocrResult={ocrResult}
              selectedFile={selectedFile}
              previewUrl={previewUrl}
              categories={categories}
              loadingCategories={loadingCategories}
              allowedCurrencies={allowedCurrencies}
              loadingCurrencies={loadingCurrencies}
              onNext={() => setStep('review')}
              onBack={() => setStep('capture')}
              onReUpload={handleReUpload}
              onReprocess={handleReprocess}
            />
          )}

          {step === 'review' && (
            <ReviewStep
              formData={formData}
              ocrResult={ocrResult}
              selectedFile={selectedFile}
              processing={processing}
              onSubmit={handleSubmit}
              onBack={() => setStep('form')}
              errors={errors}
              categories={categories}
            />
          )}
        </div>

        {/* Hidden file inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          className="hidden"
        />
      </div>
    </div>
  )
}

// Step Components
function CaptureStep({ onCameraCapture, onFileUpload, onSkip, error }: {
  onCameraCapture: () => void
  onFileUpload: () => void
  onSkip: () => void
  error?: string
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <Camera className="w-16 h-16 mx-auto text-blue-500 mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">Capture Receipt</h3>
        <p className="text-gray-400">Take a photo or upload an image of your receipt for automatic data extraction</p>
      </div>

      {error && (
        <Alert className="bg-red-900/20 border-red-700">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-red-400">{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Button
          onClick={onCameraCapture}
          className="h-24 bg-blue-600 hover:bg-blue-700 flex flex-col items-center justify-center"
        >
          <Camera className="w-8 h-8 mb-2" />
          <span>Use Camera</span>
        </Button>

        <Button
          onClick={onFileUpload}
          variant="outline"
          className="h-24 border-gray-600 hover:bg-gray-700 flex flex-col items-center justify-center"
        >
          <Upload className="w-8 h-8 mb-2" />
          <span>Upload File</span>
        </Button>
      </div>

      <div className="text-center">
        <Button variant="ghost" onClick={onSkip} className="text-gray-400 hover:text-white">
          Skip receipt capture and enter manually
        </Button>
      </div>
    </div>
  )
}

function FormStep({ formData, setFormData, errors, processing, processingFailed, ocrResult, selectedFile, previewUrl, categories, loadingCategories, allowedCurrencies, loadingCurrencies, onNext, onBack, onReUpload, onReprocess }: any) {
  return (
    <div className="space-y-6">
      {/* OCR Processing Status */}
      {processing && (
        <Alert className="bg-blue-900/20 border-blue-700">
          <Loader2 className="w-4 h-4 animate-spin" />
          <AlertDescription className="text-blue-400">
            Processing receipt... This may take a few moments.
          </AlertDescription>
        </Alert>
      )}

      {/* OCR Results Quality Indicator */}
      {ocrResult && (
        <Alert className={`${ocrResult.requires_validation ? 'bg-yellow-900/20 border-yellow-700' : 'bg-green-900/20 border-green-700'}`}>
          <CheckCircle className="w-4 h-4" />
          <AlertDescription className={ocrResult.requires_validation ? 'text-yellow-400' : 'text-green-400'}>
            {ocrResult.requires_validation 
              ? 'Receipt processed with medium confidence. Please verify the details below.'
              : 'Receipt processed successfully! Please review the extracted details.'
            }
          </AlertDescription>
        </Alert>
      )}

      {/* Receipt Preview */}
      {selectedFile && previewUrl && (
        <Card className="bg-gray-700 border-gray-600">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <img src={previewUrl} alt="Receipt preview" className="w-20 h-20 object-cover rounded" />
              <div className="flex-1">
                <p className="text-white font-medium">{selectedFile.name}</p>
                <p className="text-gray-400 text-sm">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</p>
                
                {/* Action buttons for re-upload and reprocess */}
                <div className="flex gap-2 mt-2">
                  <Button
                    onClick={onReUpload}
                    variant="outline"
                    size="sm"
                    className="border-gray-600 text-gray-300 hover:bg-gray-600"
                    disabled={processing}
                  >
                    <Upload className="w-3 h-3 mr-1" />
                    Re-upload
                  </Button>
                  
                  {(processingFailed || errors.ocr) && (
                    <Button
                      onClick={onReprocess}
                      variant="outline"
                      size="sm"
                      className="border-blue-600 text-blue-300 hover:bg-blue-600/20"
                      disabled={processing}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Reprocess
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="expense_category" className="text-white">Expense Category *</Label>
          <Select 
            value={formData.expense_category} 
            onValueChange={(value) => setFormData({...formData, expense_category: value})}
            disabled={loadingCategories}
          >
            <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
              <SelectValue placeholder={loadingCategories ? "Loading categories..." : "Select category"} />
            </SelectTrigger>
            <SelectContent className="bg-gray-700 border-gray-600">
              {categories.map((category: any) => (
                <SelectItem key={category.id} value={category.category_code} className="text-white">
                  <div className="flex items-center gap-2">
                    <Tag className="w-3 h-3" />
                    <span>{category.category_name}</span>
                    {category.requires_manager_approval && (
                      <span className="text-xs text-orange-400">(Approval Required)</span>
                    )}
                  </div>
                </SelectItem>
              ))}
              {categories.length === 0 && !loadingCategories && (
                <SelectItem value="no-categories" disabled className="text-gray-500">
                  No categories available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {errors.expense_category && <p className="text-red-400 text-sm">{errors.expense_category}</p>}
          {errors.categories && (
            <Alert className="bg-yellow-900/20 border-yellow-700">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription className="text-yellow-400">
                {errors.categories}. Using basic categories for now.
              </AlertDescription>
            </Alert>
          )}
          {ocrResult?.expense_category && ocrResult?.category_confidence && (
            <Alert className="bg-blue-900/20 border-blue-700">
              <CheckCircle className="w-4 h-4" />
              <AlertDescription className="text-blue-400">
                Auto-categorized with {Math.round(ocrResult.category_confidence)}% confidence
                {ocrResult.category_reasoning && (
                  <div className="text-xs mt-1 text-blue-300">
                    {ocrResult.category_reasoning}
                  </div>
                )}
                {ocrResult.processing_method === 'gemini_ocr' && (
                  <div className="text-xs mt-1 text-blue-300">
                    Powered by {ocrResult.gemini_model || 'Gemini AI'}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="original_amount" className="text-white">Amount *</Label>
          <Input
            id="original_amount"
            type="number"
            step="0.01"
            value={formData.original_amount || ''}
            onChange={(e) => setFormData({...formData, original_amount: parseFloat(e.target.value) || 0})}
            className="bg-gray-700 border-gray-600 text-white"
            placeholder="0.00"
          />
          {errors.original_amount && <p className="text-red-400 text-sm">{errors.original_amount}</p>}
          {ocrResult?.total_amount && ocrResult?.confidence_score && ocrResult.confidence_score >= 80 && (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <CheckCircle className="w-3 h-3" />
              <span>Auto-extracted with {Math.round(ocrResult.confidence_score)}% confidence</span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="vendor_name" className="text-white">Vendor Name *</Label>
        <Input
          id="vendor_name"
          value={formData.vendor_name}
          onChange={(e) => setFormData({...formData, vendor_name: e.target.value})}
          className="bg-gray-700 border-gray-600 text-white"
          placeholder="Restaurant, store, or service provider name"
        />
        {errors.vendor_name && <p className="text-red-400 text-sm">{errors.vendor_name}</p>}
        {ocrResult?.vendor_name && ocrResult?.confidence_score && ocrResult.confidence_score >= 80 && (
          <div className="flex items-center gap-2 text-xs text-green-400">
            <CheckCircle className="w-3 h-3" />
            <span>Auto-extracted with high confidence</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description" className="text-white">Description *</Label>
        <Input
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          className="bg-gray-700 border-gray-600 text-white"
          placeholder="Brief description of the expense"
        />
        {errors.description && <p className="text-red-400 text-sm">{errors.description}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="business_purpose" className="text-white">Business Purpose *</Label>
        <Textarea
          id="business_purpose"
          value={formData.business_purpose}
          onChange={(e) => setFormData({...formData, business_purpose: e.target.value})}
          className="bg-gray-700 border-gray-600 text-white"
          placeholder="Explain the business reason for this expense"
          rows={3}
        />
        {errors.business_purpose && <p className="text-red-400 text-sm">{errors.business_purpose}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="transaction_date" className="text-white">Transaction Date *</Label>
          <Input
            id="transaction_date"
            type="date"
            value={formData.transaction_date}
            onChange={(e) => setFormData({...formData, transaction_date: e.target.value})}
            className="bg-gray-700 border-gray-600 text-white"
          />
          {errors.transaction_date && <p className="text-red-400 text-sm">{errors.transaction_date}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="original_currency" className="text-white">Currency *</Label>
          <Select
            value={formData.original_currency}
            onValueChange={(value) => setFormData({...formData, original_currency: value})}
            disabled={loadingCurrencies}
          >
            <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
              <SelectValue placeholder={loadingCurrencies ? "Loading currencies..." : "Select currency"} />
            </SelectTrigger>
            <SelectContent className="bg-gray-700 border-gray-600">
              {allowedCurrencies.map((currency: SupportedCurrency) => (
                <SelectItem key={currency} value={currency} className="text-white">{currency}</SelectItem>
              ))}
              {allowedCurrencies.length === 0 && !loadingCurrencies && (
                <SelectItem value="no-currencies" disabled className="text-gray-500">
                  No currencies available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {loadingCurrencies && (
            <p className="text-gray-400 text-sm">Loading allowed currencies...</p>
          )}
          {errors.original_currency && <p className="text-red-400 text-sm">{errors.original_currency}</p>}
          {!loadingCurrencies && allowedCurrencies.length === 0 && (
            <Alert className="bg-yellow-900/20 border-yellow-700">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription className="text-yellow-400">
                No currencies configured. Contact your business admin to set up allowed currencies.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex gap-3 pt-4">
        <Button variant="outline" onClick={onBack} className="border-gray-600 text-gray-300">
          Back
        </Button>
        <Button onClick={onNext} className="flex-1 bg-blue-600 hover:bg-blue-700">
          Review & Submit
        </Button>
      </div>
    </div>
  )
}

function ReviewStep({ formData, ocrResult, selectedFile, processing, onSubmit, onBack, errors, categories }: any) {
  const selectedCategory = categories.find((cat: CustomExpenseCategory) => cat.category_code === formData.expense_category)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Review Expense Claim</h3>
        <p className="text-gray-400">Please review all details before submitting your claim.</p>
      </div>

      {errors.submit && (
        <Alert className="bg-red-900/20 border-red-700">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-red-400">{errors.submit}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gray-700 border-gray-600">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base">Expense Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Category:</span>
              <Badge variant="secondary" className="flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {selectedCategory?.category_name || formData.expense_category}
                {selectedCategory?.requires_manager_approval && (
                  <span className="text-xs ml-1">(Approval Required)</span>
                )}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Amount:</span>
              <span className="text-white">{formData.original_amount} {formData.original_currency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Vendor:</span>
              <span className="text-white">{formData.vendor_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Date:</span>
              <span className="text-white">{formData.transaction_date}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-700 border-gray-600">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base">Additional Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="text-gray-400 block">Description:</span>
              <span className="text-white text-sm">{formData.description}</span>
            </div>
            <div>
              <span className="text-gray-400 block">Business Purpose:</span>
              <span className="text-white text-sm">{formData.business_purpose}</span>
            </div>
            {selectedFile && (
              <div>
                <span className="text-gray-400 block">Receipt:</span>
                <span className="text-white text-sm">{selectedFile.name}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Navigation Buttons */}
      <div className="flex gap-3 pt-4">
        <Button variant="outline" onClick={onBack} disabled={processing} className="border-gray-600 text-gray-300">
          Back
        </Button>
        <Button 
          onClick={onSubmit} 
          disabled={processing}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          {processing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit Expense Claim'
          )}
        </Button>
      </div>
    </div>
  )
}