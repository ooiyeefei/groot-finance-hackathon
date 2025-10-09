/**
 * EditExpenseModal (New Hook-Based Version) - Edit existing expense claims using compositional pattern
 * Uses useExpenseForm hook for business logic and ExpenseFormFields for UI presentation
 * Maintains all existing features while following separation of concerns principles
 */

'use client'

import React from 'react'
import { X, Save, Send, ArrowLeft, Trash2, Loader2, AlertCircle, Receipt, FileText, Brain, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import { useExpenseForm } from '@/hooks/use-expense-form'
import { useLineItems } from '@/hooks/use-line-items'
import ExpenseFormFields from './expense-form-fields'
import LineItemTable from './line-item-table'
import DocumentPreviewWithAnnotations from '@/components/invoices/document-preview-with-annotations'
import { useState, useCallback, useEffect } from 'react'

interface EditExpenseModalNewProps {
  expenseClaimId: string
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
  onReprocess?: () => void
}

export default function EditExpenseModalNew({
  expenseClaimId,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onReprocess
}: EditExpenseModalNewProps) {
  console.log('EditExpenseModalNew render called - isOpen:', isOpen, 'expenseClaimId:', expenseClaimId)

  // State for delete confirmation dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // State for receipt preview
  const [signedImageUrl, setSignedImageUrl] = useState<string | null>(null)
  const [imageLoading, setImageLoading] = useState(false)

  // Main business logic hook with edit mode
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

    // Status info
    claimStatus,
    processingStatus,

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
    handleDelete,
    handleReprocessClick,

    // AI suggestion handlers
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleAcceptAllSuggestions,
    handleRejectAllSuggestions

  } = useExpenseForm({
    mode: 'edit',
    expenseClaimId,
    onSave,
    onDelete,
    onClose
  })

  // Memoized callback to prevent infinite re-renders
  const handleTotalChange = useCallback((newTotal: number) => {
    setFormData(prev => ({ ...prev, original_amount: newTotal }))
  }, [setFormData])

  // Line items management hook
  const {
    lineItems,
    totalAmount,
    addLineItem,
    updateLineItem,
    removeLineItem,
    setLineItems,
    clearLineItems
  } = useLineItems({
    initialItems: formData.line_items || [],
    onTotalChange: handleTotalChange,
    currency: formData.original_currency
  })

  // Sync line items with form data (only when form data changes from external sources)
  React.useEffect(() => {
    if (formData.line_items && formData.line_items.length > 0) {
      // Only update if the line items are actually different to avoid circular updates
      const currentItems = JSON.stringify(lineItems)
      const newItems = JSON.stringify(formData.line_items)
      if (currentItems !== newItems) {
        setLineItems(formData.line_items)
      }
    }
  }, [formData.line_items]) // Removed setLineItems from dependencies to avoid circular updates

  // Update form data when line items change (but only when needed for submission)
  const updateFormDataLineItems = useCallback(() => {
    setFormData(prev => ({ ...prev, line_items: lineItems }))
  }, [lineItems, setFormData])

  // Handle delete click to show confirmation dialog
  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  // Handle confirmed delete
  const handleDeleteConfirmed = useCallback(async () => {
    try {
      setIsDeleting(true)
      await handleDelete()
      setShowDeleteConfirm(false)
    } catch (error) {
      console.error('Delete error in modal:', error)
    } finally {
      setIsDeleting(false)
    }
  }, [handleDelete])

  // Handle closing delete confirmation
  const handleCloseDeleteConfirm = useCallback(() => {
    if (!isDeleting) {
      setShowDeleteConfirm(false)
    }
  }, [isDeleting])

  // Generate signed URL when receipt info is loaded
  useEffect(() => {
    const generateSignedUrl = async () => {
      if (!receiptInfo.storagePath) {
        console.log('🔍 [Edit Modal] No storage_path available:', receiptInfo.storagePath)
        return
      }

      try {
        setImageLoading(true)
        console.log('🔍 [Edit Modal] Generating signed URL for storage path:', receiptInfo.storagePath)

        const response = await fetch('/api/invoices/image-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storagePath: receiptInfo.storagePath,
            documentId: expenseClaimId,
            useRawFile: true,
            bucketName: 'expense_claims'
          })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to generate signed URL')
        }

        const result = await response.json()
        const imageUrl = result?.data?.imageUrl || result?.imageUrl || result?.signedUrl || null

        if (imageUrl) {
          console.log('✅ [Edit Modal] Generated signed URL:', imageUrl)
          setSignedImageUrl(imageUrl)
        } else {
          console.error('❌ [Edit Modal] No imageUrl found in response:', result)
          setSignedImageUrl(null)
        }
      } catch (error) {
        console.error('❌ [Edit Modal] Failed to generate signed URL:', error)
        setSignedImageUrl(null)
      } finally {
        setImageLoading(false)
      }
    }

    generateSignedUrl()
  }, [receiptInfo.storagePath, expenseClaimId])

  // Handle reprocess with proper callback integration
  const handleReprocessWrapper = useCallback(async () => {
    try {
      await handleReprocessClick()
      if (onReprocess) {
        onReprocess()
      }
    } catch (error) {
      console.error('Reprocess error in modal:', error)
    }
  }, [handleReprocessClick, onReprocess])

  // Wrapper for handleSave to include line items in form data
  const handleSaveWithLineItems = useCallback(async (action: 'draft' | 'submit') => {
    try {
      // Update form data with current line items before saving
      updateFormDataLineItems()
      await handleSave(action)
    } catch (error) {
      console.error('Save error in modal:', error)
    }
  }, [updateFormDataLineItems, handleSave])

  // Don't render if modal is not open
  if (!isOpen) {
    console.log('EditExpenseModalNew returning null because isOpen is false')
    return null
  }

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-7xl max-h-[96vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-white">Edit Expense Claim</h2>
            <p className="text-gray-400 text-sm">
              Modify your expense claim details
            </p>
          </div>

          {/* Action Buttons in Header */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              disabled={saving || submitting}
              className="inline-flex items-center px-3 py-1.5 bg-gray-700 text-white hover:bg-gray-800 text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Cancel
            </button>
            {onDelete && (
              <button
                onClick={handleDeleteClick}
                disabled={saving || submitting || isReprocessing}
                className="inline-flex items-center px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete
              </button>
            )}
            <button
              onClick={() => handleSaveWithLineItems('draft')}
              disabled={saving || submitting || isReprocessing}
              className="inline-flex items-center px-4 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1.5" />
                  Save Draft
                </>
              )}
            </button>
            <button
              onClick={() => handleSaveWithLineItems('submit')}
              disabled={saving || submitting || isReprocessing}
              className="inline-flex items-center px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1.5" />
                  Submit
                </>
              )}
            </button>

            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-gray-800 hover:text-gray-900 bg-gray-200 hover:bg-gray-300 rounded transition-colors ml-2"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-hidden h-[calc(95vh-80px)]">
          <div className="p-0 h-full">
            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 mx-auto text-blue-500 mb-4 animate-spin" />
                <p className="text-gray-400">Loading expense details...</p>
              </div>
            ) : loadError ? (
              <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
                <p className="text-red-400 mb-4">{loadError}</p>
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="border-gray-600 text-gray-300"
                >
                  Try Again
                </Button>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Top Banner - Expense Summary (compact height) */}
                <div className="bg-gray-700 p-4 border-b border-gray-600">
                  <div className="flex items-center justify-between mb-3">
                    {/* Left side - Status and key info */}
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="bg-blue-900/20 text-blue-300 border border-blue-700/50 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium">
                          {claimStatus || 'Draft'}
                        </span>
                      </div>

                      {/* Key expense summary info - Enhanced prominence */}
                      <div className="flex items-center gap-8 text-white">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-2xl text-green-400">
                            {formData.original_currency} {formData.original_amount.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-lg">{formData.vendor_name || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-lg">
                            {formData.transaction_date ? new Date(formData.transaction_date).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right side - Progress indicator for drafts */}
                    <div className="text-right text-gray-400 flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-lg">10%</span>
                        <div className="w-16 bg-gray-600 rounded-full h-2">
                          <div className="h-2 rounded-full bg-blue-500 transition-all duration-300" style={{ width: '10%' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Section - 50/50 Split */}
                <div className="flex flex-1 overflow-hidden">
                  {/* Left Panel - Receipt Preview (50%) */}
                  <div className="w-1/2 border-r border-gray-700 flex flex-col">
                    <div className="flex-1 bg-gray-900 p-4">
                      {receiptInfo.hasReceipt ? (
                        <div className="h-full flex flex-col">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <FileText className="w-5 h-5 text-green-400" />
                              <div>
                                <p className="text-white font-medium text-sm">{receiptInfo.filename}</p>
                                <p className="text-gray-400 text-xs">
                                  {receiptInfo.fileType?.toUpperCase()} • {receiptInfo.processingStatus?.replace('_', ' ').toUpperCase()}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {handleReprocessWrapper && (
                                <Button
                                  size="sm"
                                  onClick={handleReprocessWrapper}
                                  disabled={isReprocessing}
                                  className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                                >
                                  {isReprocessing ? (
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
                            </div>
                          </div>
                          <div className="flex-1 bg-gray-900">
                            {imageLoading ? (
                              <div className="flex items-center justify-center h-full">
                                <div className="text-center text-gray-400">
                                  <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                                  <p className="text-xs">Loading preview...</p>
                                </div>
                              </div>
                            ) : signedImageUrl ? (
                              <DocumentPreviewWithAnnotations
                                imageUrl={signedImageUrl}
                                fileName={receiptInfo.filename || 'Receipt'}
                                fileType={receiptInfo.fileType || 'image/jpeg'}
                                fileSize={0}
                                boundingBoxes={[]}
                              />
                            ) : receiptInfo.storagePath ? (
                              <div className="flex items-center justify-center h-full">
                                <div className="text-center text-gray-400">
                                  <Receipt className="w-12 h-12 mx-auto mb-2" />
                                  <p className="text-xs">Failed to generate secure URL</p>
                                  <p className="text-xs text-gray-500">Please contact support if this persists</p>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <div className="text-center text-gray-400">
                                  <Receipt className="w-12 h-12 mx-auto mb-2" />
                                  <p className="text-xs">No receipt attached</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center text-gray-400">
                            <Receipt className="w-12 h-12 mx-auto mb-2" />
                            <p className="text-xs">No receipt attached</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Panel - Editable Details (50%) */}
                  <div className="w-1/2 overflow-y-auto">
                    <div className="p-6 space-y-6">
                      {/* Save Error Alert */}
                      {saveError && (
                        <Alert className="bg-red-900/20 border-red-700">
                          <AlertCircle className="w-4 h-4" />
                          <AlertDescription className="text-red-400">
                            {saveError}
                          </AlertDescription>
                        </Alert>
                      )}


                      {/* Basic Information - Editable */}
                      <Card className="bg-gray-800 border-gray-600">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-gray-300 text-sm flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-400" />
                            Basic Information
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <ExpenseFormFields
                            formData={formData}
                            setFormData={setFormData}
                            errors={errors}
                            saveError={null}
                            receiptInfo={receiptInfo}
                            aiSuggestions={aiSuggestions}
                            dismissedSuggestions={dismissedSuggestions}
                            onAcceptSuggestion={handleAcceptSuggestion}
                            onRejectSuggestion={handleRejectSuggestion}
                            onAcceptAllSuggestions={handleAcceptAllSuggestions}
                            onRejectAllSuggestions={handleRejectAllSuggestions}
                            previewAmount={previewAmount}
                            exchangeRate={exchangeRate}
                            categories={categories}
                            categoriesLoading={categoriesLoading}
                            categoriesError={categoriesError}
                            processingMethod={processingMethod}
                            isManualEntry={isManualEntry}
                            mode="edit"
                            showReceiptUpload={false}
                            loading={false}
                          />
                        </CardContent>
                      </Card>

                      {/* Line Items - Editable */}
                      <Card className="bg-gray-800 border-gray-600">
                        <CardHeader>
                          <CardTitle className="text-gray-300 text-sm flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-gray-400" />
                            Line Items {lineItems && lineItems.length > 0 ? `(${lineItems.length})` : '(0)'}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <LineItemTable
                            lineItems={lineItems}
                            totalAmount={totalAmount}
                            addLineItem={addLineItem}
                            updateLineItem={updateLineItem}
                            removeLineItem={removeLineItem}
                            currency={formData.original_currency}
                            showAddButton={true}
                            disabled={saving || submitting || isReprocessing}
                            variant="compact"
                          />
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={handleCloseDeleteConfirm}
        onConfirm={handleDeleteConfirmed}
        title="Delete Expense Claim"
        message="Are you sure you want to delete this draft expense claim? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        isLoading={isDeleting}
      />
    </div>
  )
}