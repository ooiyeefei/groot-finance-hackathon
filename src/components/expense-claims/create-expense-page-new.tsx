/**
 * CreateExpensePage (New Hook-Based Version) - Create new expense claims using compositional pattern
 * Uses useExpenseForm hook for business logic and ExpenseFormFields for UI presentation
 * Supports both AI extraction and manual entry modes with proper mode detection
 */

'use client'

import React from 'react'
import { ArrowLeft, Save, Send, Loader2, AlertCircle, Upload, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useExpenseForm } from '@/hooks/use-expense-form'
import { useLineItems } from '@/hooks/use-line-items'
import ExpenseFormFields, { ReceiptUploadSection, ExpenseSummaryCompact } from './expense-form-fields'
import LineItemTable from './line-item-table'
import { DSPyExtractionResult } from '@/types/expense-extraction'

interface CreateExpensePageNewProps {
  // DSPy extraction result (required for create mode)
  extractionResult: DSPyExtractionResult

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
  hideHeader?: boolean  // Hide redundant headers when used in DSPy flow
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

  // Handle form submission with proper validation
  const handleFormSubmit = async (action: 'draft' | 'submit' = 'draft') => {
    try {
      // Create submission data with current line items
      const submissionData = {
        ...formData,
        line_items: lineItems
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

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <Loader2 className="w-12 h-12 mx-auto text-blue-500 mb-4 animate-spin" />
          <h3 className="text-lg font-semibold text-white mb-2">
            Loading Expense Form
          </h3>
          <p className="text-gray-400">
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
          <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            Cannot Load Expense Form
          </h3>
          <p className="text-gray-400 mb-6">
            {loadError}
          </p>
          {onBack && (
            <Button onClick={onBack} variant="outline" className="border-gray-600 text-gray-300">
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
      {/* Header - Hidden when used in DSPy flow */}
      {!hideHeader && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{pageTitle}</h1>
              <p className="text-gray-400">{pageDescription}</p>
            </div>
            {showBackButton && onBack && (
              <Button
                onClick={onBack}
                variant="outline"
                className="border-gray-600 text-gray-300 hover:border-gray-500"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}
          </div>

          {/* Processing Method Indicator */}
          <Card className="bg-gray-800 border-gray-600">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                {isManualEntry ? (
                  <>
                    <FileText className="w-5 h-5 text-blue-400" />
                    <div>
                      <p className="text-white font-medium">Manual Entry</p>
                      <p className="text-gray-400 text-sm">Creating expense claim with manual data entry</p>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-green-400" />
                    <div>
                      <p className="text-white font-medium">AI Extracted</p>
                      <p className="text-gray-400 text-sm">
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
                    onReceiptUpload={undefined} // Will be implemented if needed
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
                  onReceiptUpload={undefined} // Will be implemented if needed

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
              onReceiptUpload={undefined} // Will be implemented if needed

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
            />
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="bg-gray-800 border-t border-gray-700 p-6">
        <div className="flex items-center justify-center space-x-4">
          <Button
            onClick={() => handleFormSubmit('draft')}
            disabled={saving || submitting}
            className="bg-gray-600 hover:bg-gray-700 text-white"
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
            disabled={saving || submitting}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {submitting ? (
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
    </div>
  )
}