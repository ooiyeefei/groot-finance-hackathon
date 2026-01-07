/**
 * ExpenseFormFields - Pure UI component for expense form fields
 * Receives all state and handlers from hooks, handles presentation only
 * Supports both AI-extracted and manual entry modes
 */

'use client'

import React, { useRef } from 'react'
import {
  Tag,
  DollarSign,
  Calendar,
  Building,
  FileText,
  AlertCircle,
  Paperclip,
  Eye,
  Brain,
  Loader2,
  XCircle,
  CheckCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { BulkSuggestions } from './field-suggestion'
import { formatCurrency } from '@/domains/accounting-entries/hooks/use-accounting-entries'
import { SupportedCurrency } from '@/domains/accounting-entries/types'
import { ExpenseFormData, ReceiptInfo, AISuggestion } from '@/domains/expense-claims/hooks/use-expense-form'

const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  'THB', 'IDR', 'MYR', 'SGD', 'USD', 'EUR', 'CNY', 'VND', 'PHP'
]

// Props interface
export interface ExpenseFormFieldsProps {
  // Form state
  formData: ExpenseFormData
  setFormData: (data: ExpenseFormData | ((prev: ExpenseFormData) => ExpenseFormData)) => void

  // Validation
  errors: Record<string, string>
  saveError: string | null

  // Receipt info
  receiptInfo: ReceiptInfo

  // AI suggestions
  aiSuggestions: AISuggestion[]
  dismissedSuggestions: Set<string>
  onAcceptSuggestion: (fieldName: string, value: string | number) => void
  onRejectSuggestion: (fieldName: string) => void
  onAcceptAllSuggestions: (suggestions: Record<string, string | number>) => Promise<void>
  onRejectAllSuggestions: () => void

  // Currency conversion
  previewAmount: number | null
  exchangeRate: number | null

  // Categories
  categories: any[]
  categoriesLoading: boolean
  categoriesError: any

  // Processing method
  processingMethod: 'ai' | 'manual_entry'
  isManualEntry: boolean

  // Actions
  onReprocessClick?: () => void
  isReprocessing?: boolean

  // AI Processing status (NEW)
  aiProcessingStatus?: 'idle' | 'processing' | 'completed' | 'failed'

  // Mode-specific props
  mode?: 'create' | 'edit'
  showReceiptUpload?: boolean
  onReceiptUpload?: (file: File) => void
  onAIExtractClick?: () => void
  isAIExtracting?: boolean
  stagedFile?: File | null
  onViewClick?: () => void

  // Loading states
  loading?: boolean
}

// Split component into separate sections for 2x2 layout
interface ReceiptUploadSectionProps {
  receiptInfo: ReceiptInfo
  onReprocessClick?: () => void
  isReprocessing?: boolean
  onReceiptUpload?: (file: File) => void
  onViewClick?: () => void
  onAIExtractClick?: () => void
  isAIExtracting?: boolean
  stagedFile?: File | null
}

function ReceiptUploadSection({
  receiptInfo,
  onReprocessClick,
  isReprocessing = false,
  onReceiptUpload,
  onViewClick,
  onAIExtractClick,
  isAIExtracting = false,
  stagedFile
}: ReceiptUploadSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="bg-card rounded-lg p-4 border border-border h-full">
      {receiptInfo.hasReceipt || stagedFile ? (
        <div className="flex items-center justify-between h-full">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-foreground font-medium">
                {stagedFile ? stagedFile.name : receiptInfo.filename}
              </p>
              <p className="text-muted-foreground text-sm">
                {stagedFile
                  ? stagedFile.type.toUpperCase()
                  : receiptInfo.fileType?.toUpperCase()
                }
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {/* AI Extract Button - Show for staged files or if reprocess available */}
            {(onAIExtractClick || onReprocessClick) && (
              <Button
                size="sm"
                onClick={onAIExtractClick || onReprocessClick}
                disabled={isAIExtracting || isReprocessing}
                className="bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
                title="Extract data using AI"
              >
                {(isAIExtracting || isReprocessing) ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4 mr-1" />
                    AI Extract
                  </>
                )}
              </Button>
            )}
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={onViewClick}
              disabled={!onViewClick}
              title="View receipt"
            >
              <Eye className="w-4 h-4 mr-1" />
              View
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-border rounded-lg p-6 h-full flex items-center justify-center">
          <div className="text-center">
            <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-foreground mb-2">Upload Receipt (Required)</p>
            <p className="text-muted-foreground text-sm mb-4">Drag and drop or click to select</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file && onReceiptUpload) {
                  onReceiptUpload(file)
                }
              }}
              className="hidden"
            />
            <Button
              type="button"
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              size="sm"
              onClick={() => {
                fileInputRef.current?.click()
              }}
            >
              Choose File
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface ExpenseSummaryCompactProps {
  formData: ExpenseFormData
  receiptInfo: ReceiptInfo
  categories: any[]
}

function ExpenseSummaryCompact({ formData, receiptInfo, categories }: ExpenseSummaryCompactProps) {
  return (
    <Card className="bg-card border-border h-full">
      <CardHeader className="pb-1">
        <CardTitle className="text-foreground text-base">Expense Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5 py-3">
        <div className="flex justify-between items-center py-0.5 text-sm border-b border-border">
          <span className="text-muted-foreground">Vendor</span>
          <span className="text-foreground text-sm">{formData.vendor_name || 'Not specified'}</span>
        </div>
        <div className="flex justify-between items-center py-0.5 text-sm border-b border-border">
          <span className="text-muted-foreground">Amount</span>
          <span className="text-foreground font-semibold text-sm">
            {formData.original_currency} {formData.original_amount.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between items-center py-0.5 text-sm border-b border-border">
          <span className="text-muted-foreground">Date</span>
          <span className="text-foreground text-sm">
            {formData.transaction_date ? new Date(formData.transaction_date).toLocaleDateString() : 'Not specified'}
          </span>
        </div>
        <div className="flex justify-between items-center py-0.5 text-sm border-b border-border">
          <span className="text-muted-foreground">Category</span>
          <span className="text-foreground text-sm">
            {categories.find(c => c.id === formData.expense_category)?.category_name || 'Not specified'}
          </span>
        </div>
        <div className="flex justify-between items-center py-0.5 text-sm">
          <span className="text-muted-foreground">Receipt</span>
          <span className="text-foreground text-sm">
            {receiptInfo.hasReceipt ? (
              <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Attached
              </span>
            ) : (
              <span className="text-muted-foreground flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                No receipt
              </span>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ExpenseFormFields({
  formData,
  setFormData,
  errors,
  saveError,
  receiptInfo,
  aiSuggestions,
  dismissedSuggestions,
  onAcceptSuggestion,
  onRejectSuggestion,
  onAcceptAllSuggestions,
  onRejectAllSuggestions,
  previewAmount,
  exchangeRate,
  categories,
  categoriesLoading,
  categoriesError,
  processingMethod,
  isManualEntry,
  onReprocessClick,
  isReprocessing = false,
  aiProcessingStatus = 'idle',
  mode = 'edit',
  showReceiptUpload = false,
  onReceiptUpload,
  onAIExtractClick,
  isAIExtracting = false,
  stagedFile,
  onViewClick,
  loading = false
}: ExpenseFormFieldsProps) {

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-12 h-12 mx-auto text-primary mb-4 animate-spin" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Loading Expense Details
        </h3>
        <p className="text-muted-foreground">
          Please wait while we load the expense information...
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Save Error Alert */}
      {saveError && (
        <Alert className="bg-destructive/10 border-destructive/30">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <AlertDescription className="text-destructive">
            {saveError}
          </AlertDescription>
        </Alert>
      )}

      {/* AI Suggestions - Show bulk suggestions when available or processing */}
      {(aiSuggestions.length > 0 || aiProcessingStatus === 'processing' || aiProcessingStatus === 'failed') && (
        <BulkSuggestions
          suggestions={aiSuggestions}
          onAcceptAll={onAcceptAllSuggestions}
          onRejectAll={onRejectAllSuggestions}
          onFieldAccept={onAcceptSuggestion}
          onFieldReject={onRejectSuggestion}
          dismissedFields={dismissedSuggestions}
          isProcessing={isReprocessing}
          processingStatus={aiProcessingStatus || 'idle'}
        />
      )}

      {/* Expense Details Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground text-base flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Expense Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1: Vendor Name, Transaction Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-foreground flex items-center gap-2 h-6">
                <Building className="w-4 h-4" />
                Vendor Name *
              </Label>
              <Input
                value={formData.vendor_name}
                onChange={(e) => setFormData({...formData, vendor_name: e.target.value})}
                className="bg-input border-border text-foreground"
                placeholder="Vendor or merchant name"
              />
              {errors.vendor_name && <p className="text-destructive text-sm">{errors.vendor_name}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-foreground flex items-center gap-2 h-6">
                <Calendar className="w-4 h-4 text-foreground" />
                Transaction Date *
              </Label>
              <Input
                type="date"
                value={formData.transaction_date}
                onChange={(e) => setFormData({...formData, transaction_date: e.target.value})}
                className="bg-input border-border text-foreground w-full"
              />
              {errors.transaction_date && <p className="text-destructive text-sm">{errors.transaction_date}</p>}
            </div>
          </div>

          {/* Row 2: Category, Reference Number */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-foreground flex items-center gap-2 h-6">
                <Tag className="w-4 h-4" />
                Category *
              </Label>
              <Select
                value={formData.expense_category}
                onValueChange={(value) => setFormData({...formData, expense_category: value})}
              >
                <SelectTrigger className="bg-input border-border text-foreground text-left">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {categoriesLoading ? (
                    <SelectItem value="loading" className="text-muted-foreground" disabled>
                      Loading categories...
                    </SelectItem>
                  ) : categoriesError ? (
                    <SelectItem value="error" className="text-destructive" disabled>
                      Error loading categories
                    </SelectItem>
                  ) : categories.length > 0 ? (
                    categories.map((category) => (
                      <SelectItem key={category.id} value={category.id} className="text-foreground">
                        {category.category_name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="empty" className="text-muted-foreground" disabled>
                      No categories available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.expense_category && <p className="text-destructive text-sm">{errors.expense_category}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-foreground flex items-center h-6">Reference Number</Label>
              <Input
                value={formData.reference_number || ''}
                onChange={(e) => setFormData({...formData, reference_number: e.target.value})}
                className="bg-input border-border text-foreground"
                placeholder="Receipt or reference number"
              />
            </div>
          </div>

          {/* Row 3: Amount, Currency, Home Currency - Compact Layout */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-3">
              {/* Amount Field - Shorter Width */}
              <div className="flex-1 min-w-[120px] max-w-[160px] space-y-2">
                <Label className="text-foreground flex items-center gap-2 h-6">
                  <DollarSign className="w-4 h-4" />
                  Amount *
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.original_amount}
                  onChange={(e) => setFormData({...formData, original_amount: parseFloat(e.target.value) || 0})}
                  className="bg-input border-border text-foreground"
                  placeholder="0.00"
                />
              </div>

              {/* Currency Dropdown - Compact */}
              <div className="w-20 space-y-2">
                <Label className="text-foreground h-6 text-xs">Currency</Label>
                <Select
                  value={formData.original_currency}
                  onValueChange={(value) => setFormData({...formData, original_currency: value as SupportedCurrency})}
                >
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {SUPPORTED_CURRENCIES.map(currency => (
                      <SelectItem key={currency} value={currency} className="text-foreground">{currency}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Home Currency Dropdown - Compact */}
              <div className="w-24 space-y-2">
                <Label className="text-foreground h-6 text-xs">Home Currency</Label>
                <Select
                  value={formData.home_currency}
                  onValueChange={(value) => setFormData({...formData, home_currency: value as SupportedCurrency})}
                >
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {SUPPORTED_CURRENCIES.map(currency => (
                      <SelectItem key={currency} value={currency} className="text-foreground">{currency}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Currency Conversion Preview - Inline on Same Row */}
              {previewAmount !== null && exchangeRate !== null && formData.original_currency !== formData.home_currency && (
                <div className="flex-1 min-w-[200px] space-y-2">
                  <Label className="text-foreground h-6 text-xs">Conversion Preview</Label>
                  <div className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded px-3 py-2 h-10 flex items-center">
                    <div className="font-medium text-sm">
                      {formatCurrency(previewAmount, formData.home_currency as SupportedCurrency)}
                      <span className="text-xs ml-1">
                        (Rate: {exchangeRate.toFixed(4)})
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {errors.original_amount && <p className="text-destructive text-sm">{errors.original_amount}</p>}
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Description *</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="bg-input border-border text-foreground"
              placeholder="Brief description of expense"
            />
            {errors.description && <p className="text-destructive text-sm">{errors.description}</p>}
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Business Purpose *</Label>
            <Textarea
              value={formData.business_purpose}
              onChange={(e) => setFormData({...formData, business_purpose: e.target.value})}
              className="bg-input border-border text-foreground"
              placeholder="Explain the business reason for this expense"
              rows={3}
            />
            {errors.business_purpose && <p className="text-destructive text-sm">{errors.business_purpose}</p>}
          </div>

          {/* Optional Fields */}
          <div className="space-y-2">
            <Label className="text-foreground">Additional Notes</Label>
            <Input
              value={formData.notes || ''}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              className="bg-input border-border text-foreground"
              placeholder="Any additional information"
            />
          </div>

        </CardContent>
      </Card>
    </div>
  )
}

// Export the sub-components for use in the parent
export { ReceiptUploadSection, ExpenseSummaryCompact }