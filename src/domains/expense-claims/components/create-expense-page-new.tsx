/**
 * CreateExpensePage (New Hook-Based Version) - Create new expense claims using compositional pattern
 * Uses useExpenseForm hook for business logic and ExpenseFormFields for UI presentation
 * Supports both AI extraction and manual entry modes with proper mode detection
 */

'use client'

import React, { useState } from 'react'
import { usePathname } from 'next/navigation'
import { ArrowLeft, Save, Send, Loader2, AlertCircle, Upload, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useExpenseForm } from '@/domains/expense-claims/hooks/use-expense-form'
import { useLineItems } from '@/lib/hooks/use-line-items'
import ExpenseFormFields, { ReceiptUploadSection, ExpenseSummaryCompact } from './expense-form-fields'
import LineItemTable from './line-item-table'
import DuplicateWarningModal from './duplicate-warning-modal'
import { AIExtractionResult } from '@/domains/expense-claims/types/expense-extraction'
import type { DuplicateOverride } from '@/domains/expense-claims/types/duplicate-detection'

interface CreateExpensePageNewProps {
  // AI extraction result (required for create mode)
  extractionResult: AIExtractionResult

  // Navigation handlers
  onSubmit?: (formData: any) => Promise<any>
  onBack?: () => void

  // Loading states
  isSubmitting?: boolean

  // Mode detection
  showBackButton?: boolean
  pageTitle?: string
  pageDescription?: string

  // UI control
  hideHeader?: boolean  // Hide redundant headers when used in AI flow
}

export default function CreateExpensePageNew({
  extractionResult,
  onSubmit,
  onBack,
  isSubmitting = false,
  showBackButton = true,
  pageTitle = 'Create Expense Claim',
  pageDescription = 'Fill out the expense details below',
  hideHeader = false
}: CreateExpensePageNewProps) {

  // Get current pathname to extract locale for navigation
  const pathname = usePathname()
  const locale = pathname?.split('/')[1] || 'en'

  // Main business logic hook with create mode
  const {
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
    isManualRate,
    setManualRate,

    // Processing method detection
    processingMethod,
    isManualEntry,

    // Categories and currency
    categories,
    categoriesLoading,
    categoriesError,
    userHomeCurrency,

    // Form actions
    validateForm,
    handleSave,

    // Duplicate detection
    duplicateCheckResult,
    setDuplicateCheckResult,
    performDuplicateCheck,
    isCheckingDuplicates,

    // AI suggestion handlers
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleAcceptAllSuggestions,
    handleRejectAllSuggestions

  } = useExpenseForm({
    mode: 'create',
    extractionResult,
    onSubmit,
    onBack,
    isSubmitting
  })

  // State for duplicate warning modal
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [pendingSubmitAction, setPendingSubmitAction] = useState<'draft' | 'submit' | null>(null)
  const [duplicateOverride, setDuplicateOverride] = useState<DuplicateOverride | null>(null)

  // Memoized callback to prevent infinite re-renders
  const handleTotalChange = React.useCallback((newTotal: number) => {
    setFormData(prev => ({ ...prev, original_amount: newTotal }))
  }, [setFormData])

  // Line items management hook - initialize from extraction result, not formData
  const {
    lineItems,
    totalAmount,
    addLineItem,
    updateLineItem,
    removeLineItem,
    setLineItems
  } = useLineItems({
    initialItems: extractionResult?.extractedData.lineItems?.map(item => ({
      description: item.description || 'Item',
      quantity: item.quantity || 1,
      unit_price: item.unitPrice || 0,
      total_amount: item.lineTotal || 0
    })) || [],
    onTotalChange: handleTotalChange,
    currency: formData.original_currency
  })

  // Handle receipt upload with proper API integration
  const handleReceiptUpload = React.useCallback(async (file: File) => {
    console.log('Receipt upload started:', file.name)

    // File validation (matching existing patterns)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      alert('Please select a valid image (JPEG, PNG, WebP) or PDF file')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB')
      return
    }

    try {
      // Create FormData following existing upload patterns
      const formData = new FormData()
      formData.append('file', file)
      formData.append('processing_mode', 'ai') // Use AI processing for uploaded receipts

      // Add required fields with defaults for AI processing
      formData.append('description', 'Receipt Upload - AI Processing')
      formData.append('business_purpose', 'Business Expense - Processing via AI')
      formData.append('original_amount', '0') // Will be updated by AI
      formData.append('original_currency', 'SGD')
      formData.append('transaction_date', new Date().toISOString().split('T')[0])

      console.log('Uploading file to expense claims API...')

      // Call the unified expense claims upload API
      const response = await fetch('/api/v1/expense-claims', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (result.success) {
        const { expense_claim, processing_mode, message, task_id } = result.data
        console.log('Upload successful:', expense_claim.id)

        // Update form data with the uploaded expense claim info
        setFormData(prev => ({
          ...prev,
          vendor_name: expense_claim.vendor_name || '',
          original_amount: expense_claim.total_amount || 0,
          original_currency: expense_claim.currency || 'MYR',
          transaction_date: expense_claim.transaction_date || new Date().toISOString().split('T')[0],
          expense_category: expense_claim.expense_category || 'other_business',
          business_purpose: expense_claim.business_purpose || '',
          reference_number: expense_claim.reference_number || ''
        }))

        if (processing_mode === 'ai' && task_id) {
          alert(`Receipt uploaded successfully! AI processing started. Task ID: ${task_id}`)
        } else {
          alert(`Receipt uploaded successfully: ${message}`)
        }
      } else {
        throw new Error(result.error || 'Upload failed')
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [setFormData])

  // Handle form submission with duplicate check
  const handleFormSubmit = async (action: 'draft' | 'submit' = 'draft', override?: DuplicateOverride) => {
    try {
      // Only check for duplicates on 'submit' action (not draft saves)
      // and only if we don't already have an override
      if (action === 'submit' && !override) {
        const result = await performDuplicateCheck()
        if (result?.hasDuplicates) {
          // Store the pending action and show the modal
          setPendingSubmitAction(action)
          setShowDuplicateModal(true)
          return
        }
      }

      // Create submission data with current line items and optional override
      const submissionData = {
        ...formData,
        line_items: lineItems,
        ...(override ? { duplicateOverride: override } : {})
      }

      // Call onSubmit directly with the complete data if in create mode
      if (onSubmit) {
        await onSubmit(submissionData)
      } else {
        // Update formData and call handleSave for edit mode
        setFormData(submissionData)
        await handleSave(action)
      }
    } catch (error) {
      console.error('Form submission error:', error)
    }
  }

  // Handle proceeding after duplicate warning
  const handleDuplicateProceed = (override: DuplicateOverride) => {
    setShowDuplicateModal(false)
    setDuplicateOverride(override)
    // Resume the pending submit action with the override
    if (pendingSubmitAction) {
      handleFormSubmit(pendingSubmitAction, override)
      setPendingSubmitAction(null)
    }
  }

  // Handle closing duplicate modal (user cancelled)
  const handleDuplicateClose = () => {
    setShowDuplicateModal(false)
    setPendingSubmitAction(null)
    setDuplicateCheckResult(null)
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <Loader2 className="w-12 h-12 mx-auto text-primary mb-4 animate-spin" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Loading Expense Form
          </h3>
          <p className="text-muted-foreground">
            Please wait while we prepare the form...
          </p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Cannot Load Expense Form
          </h3>
          <p className="text-muted-foreground mb-6">
            {loadError}
          </p>
          {onBack && (
            <Button onClick={onBack} variant="outline" className="border-border text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={hideHeader ? "" : "container mx-auto p-6"}>
      {/* Header - Hidden when used in AI flow */}
      {!hideHeader && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
              <p className="text-muted-foreground">{pageDescription}</p>
            </div>
            {showBackButton && onBack && (
              <Button
                onClick={onBack}
                variant="outline"
                className="border-border text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}
          </div>

          {/* Processing Method Indicator */}
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                {isManualEntry ? (
                  <>
                    <FileText className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-foreground font-medium">Manual Entry</p>
                      <p className="text-muted-foreground text-sm">Creating expense claim with manual data entry</p>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <div>
                      <p className="text-foreground font-medium">AI Extracted</p>
                      <p className="text-muted-foreground text-sm">
                        Data extracted from receipt using AI • {extractionResult.extractedData.processingMethod}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <div className={hideHeader ? "space-y-6" : "max-h-[calc(100vh-16rem)] overflow-y-auto"}>
        {hideHeader ? (
          <>
            {/* 2x2 Grid Layout */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Top Row */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:col-span-2">
                {/* Top Left: Receipt Upload */}
                <div>
                  <ReceiptUploadSection
                    receiptInfo={receiptInfo}
                    onReprocessClick={undefined} // Not needed for create mode
                    isReprocessing={false}
                    onReceiptUpload={handleReceiptUpload}
                  />
                </div>

                {/* Top Right: Expense Summary */}
                <div>
                  <ExpenseSummaryCompact
                    formData={formData}
                    receiptInfo={receiptInfo}
                    categories={categories}
                  />
                </div>
              </div>

              {/* Bottom Left: Expense Details */}
              <div>
                <ExpenseFormFields
                  // Form state
                  formData={formData}
                  setFormData={setFormData}

                  // Validation
                  errors={errors}
                  saveError={saveError}

                  // Receipt info
                  receiptInfo={receiptInfo}

                  // AI suggestions
                  aiSuggestions={aiSuggestions}
                  dismissedSuggestions={dismissedSuggestions}
                  onAcceptSuggestion={handleAcceptSuggestion}
                  onRejectSuggestion={handleRejectSuggestion}
                  onAcceptAllSuggestions={handleAcceptAllSuggestions}
                  onRejectAllSuggestions={handleRejectAllSuggestions}

                  // Currency conversion
                  previewAmount={previewAmount}
                  exchangeRate={exchangeRate}
                  isManualRate={isManualRate}
                  onManualRateChange={setManualRate}

                  // Categories
                  categories={categories}
                  categoriesLoading={categoriesLoading}
                  categoriesError={categoriesError}

                  // Processing method
                  processingMethod={processingMethod}
                  isManualEntry={isManualEntry}

                  // Actions (not needed for create mode)
                  onReprocessClick={undefined}
                  isReprocessing={false}

                  // Mode-specific props
                  mode="create"
                  showReceiptUpload={isManualEntry}
                  onReceiptUpload={handleReceiptUpload}

                  // Loading states
                  loading={false}
                />
              </div>

              {/* Bottom Right: Line Items */}
              <div>
                <LineItemTable
                  lineItems={lineItems}
                  totalAmount={totalAmount}
                  addLineItem={addLineItem}
                  updateLineItem={updateLineItem}
                  removeLineItem={removeLineItem}
                  currency={formData.original_currency}
                  showAddButton={true}
                  disabled={saving || submitting}
                  variant="compact"
                  subtotalAmount={extractionResult?.extractedData.subtotalAmount}
                  additionalCharges={formData.additional_charges}
                  taxAmount={extractionResult?.extractedData.taxAmount || 0}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-6">
            {/* Form Fields Component (Pure UI) */}
            <ExpenseFormFields
              // Form state
              formData={formData}
              setFormData={setFormData}

              // Validation
              errors={errors}
              saveError={saveError}

              // Receipt info
              receiptInfo={receiptInfo}

              // AI suggestions
              aiSuggestions={aiSuggestions}
              dismissedSuggestions={dismissedSuggestions}
              onAcceptSuggestion={handleAcceptSuggestion}
              onRejectSuggestion={handleRejectSuggestion}
              onAcceptAllSuggestions={handleAcceptAllSuggestions}
              onRejectAllSuggestions={handleRejectAllSuggestions}

              // Currency conversion
              previewAmount={previewAmount}
              exchangeRate={exchangeRate}
              isManualRate={isManualRate}
              onManualRateChange={setManualRate}

              // Categories
              categories={categories}
              categoriesLoading={categoriesLoading}
              categoriesError={categoriesError}

              // Processing method
              processingMethod={processingMethod}
              isManualEntry={isManualEntry}

              // Actions (not needed for create mode)
              onReprocessClick={undefined}
              isReprocessing={false}

              // Mode-specific props
              mode="create"
              showReceiptUpload={isManualEntry}
              onReceiptUpload={handleReceiptUpload}

              // Loading states
              loading={false}
            />

            {/* Line Items Table Component */}
            <LineItemTable
              lineItems={lineItems}
              totalAmount={totalAmount}
              addLineItem={addLineItem}
              updateLineItem={updateLineItem}
              removeLineItem={removeLineItem}
              currency={formData.original_currency}
              showAddButton={true}
              disabled={saving || submitting}
              variant="default"
              subtotalAmount={extractionResult?.extractedData.subtotalAmount}
              additionalCharges={formData.additional_charges}
              taxAmount={extractionResult?.extractedData.taxAmount || 0}
            />
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="bg-card border-t border-border p-6">
        <div className="flex items-center justify-center space-x-4">
          <Button
            onClick={() => handleFormSubmit('draft')}
            disabled={saving || submitting || isCheckingDuplicates}
            variant="secondary"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving Draft...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save as Draft
              </>
            )}
          </Button>

          <Button
            onClick={() => handleFormSubmit('submit')}
            disabled={saving || submitting || isCheckingDuplicates}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isCheckingDuplicates ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : submitting ? (
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
          </Button>
        </div>
      </div>

      {/* Duplicate Warning Modal */}
      <DuplicateWarningModal
        isOpen={showDuplicateModal}
        onClose={handleDuplicateClose}
        onProceed={handleDuplicateProceed}
        duplicates={duplicateCheckResult?.matches || []}
        highestTier={duplicateCheckResult?.highestTier || null}
        currentExpense={{
          claimId: undefined, // New expense, not saved yet
          vendorName: formData.vendor_name,
          transactionDate: formData.transaction_date,
          totalAmount: formData.original_amount,
          currency: formData.original_currency,
          status: 'new',
          referenceNumber: formData.reference_number
        }}
        onViewExpense={(claimId) => {
          // Navigate to the matched expense in same window
          window.location.href = `/${locale}/expense-claims?view=${claimId}`
        }}
      />
    </div>
  )
}