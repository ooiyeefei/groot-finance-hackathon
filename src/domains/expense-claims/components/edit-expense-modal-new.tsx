/**
 * EditExpenseModal (New Hook-Based Version) - Edit existing expense claims using compositional pattern
 * Uses useExpenseForm hook for business logic and ExpenseFormFields for UI presentation
 * Maintains all existing features while following separation of concerns principles
 */

'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { X, Save, Send, ArrowLeft, Trash2, Loader2, AlertCircle, Receipt, FileText, Brain, DollarSign, Copy, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import { useExpenseForm } from '@/domains/expense-claims/hooks/use-expense-form'
import { useLineItems } from '@/domains/accounting-entries/hooks/use-line-items'
import ExpenseFormFields from './expense-form-fields'
import LineItemTable from './line-item-table'
import DuplicateWarningModal from './duplicate-warning-modal'
import DocumentPreviewWithAnnotations from '@/domains/invoices/components/document-preview-with-annotations'
import { useState, useCallback, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { formatBusinessDate } from '@/lib/utils'
import type { DuplicateMatchPreview, DuplicateOverride, MatchTier } from '@/domains/expense-claims/types/duplicate-detection'
import EinvoiceSection from './einvoice-section'
import { useBusinessProfile } from '@/contexts/business-context'

interface EditExpenseModalNewProps {
  expenseClaimId: string
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
  onReprocess?: () => void
  /** Hide the individual Submit button (used when editing within a batch submission) */
  hideSubmit?: boolean
}

export default function EditExpenseModalNew({
  expenseClaimId,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onReprocess,
  hideSubmit = false
}: EditExpenseModalNewProps) {
  console.log('EditExpenseModalNew render called - isOpen:', isOpen, 'expenseClaimId:', expenseClaimId)

  // Get current pathname to extract locale for navigation
  const pathname = usePathname()
  const locale = pathname?.split('/')[1] || 'en'

  // State for delete confirmation dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // State for receipt preview
  const [signedImageUrl, setSignedImageUrl] = useState<string | null>(null)
  const [imageLoading, setImageLoading] = useState(false)

  // State for success messaging
  const [showSuccess, setShowSuccess] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  // State for e-invoice data (fetched from claim API)
  const [einvoiceData, setEinvoiceData] = useState<Record<string, any> | null>(null)

  // Business profile from reactive context (for e-invoice warnings)
  const { profile: bizProfile } = useBusinessProfile()

  // State for duplicate detection
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatchPreview[]>([])
  const [duplicateHighestTier, setDuplicateHighestTier] = useState<MatchTier | null>(null)
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [duplicateOverride, setDuplicateOverride] = useState<DuplicateOverride | null>(null)

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
    isManualRate,
    setManualRate,

    // Status info
    claimStatus,

    // Line items status (for two-phase extraction)
    lineItemsStatus,

    // Processing method detection
    processingMethod,
    isManualEntry,

    // Categories and currency
    categories,
    categoriesLoading,
    categoriesError,

    // Form actions
    handleSave,
    handleDelete,
    handleReprocessClick,

    // AI suggestion handlers
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleAcceptAllSuggestions,
    handleRejectAllSuggestions,

    // Duplicate detection
    duplicateCheckResult,
    setDuplicateCheckResult,
    performDuplicateCheck,
    isCheckingDuplicates

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

  // Automatic duplicate detection when form data loads
  // This shows duplicate warnings on drafts immediately, not just at submit time
  useEffect(() => {
    // Only check for duplicates when form data is loaded and modal is open
    if (!isOpen || loading) return
    // Only check if we have the required fields
    if (!formData.vendor_name || !formData.transaction_date || !formData.original_amount) return
    // Only check if we haven't already checked for these values
    if (duplicateCheckResult) return

    const checkDuplicatesOnLoad = async () => {
      console.log('[EditExpenseModal] Auto-checking for duplicates on load')
      setCheckingDuplicates(true)
      try {
        const result = await performDuplicateCheck()
        if (result?.hasDuplicates && result.matches) {
          // Use matches directly - they're already in DuplicateMatchPreview format
          setDuplicateMatches(result.matches)
          setDuplicateHighestTier(result.highestTier || null)
        }
      } catch (err) {
        console.error('[EditExpenseModal] Duplicate check error:', err)
      } finally {
        setCheckingDuplicates(false)
      }
    }

    checkDuplicatesOnLoad()
  }, [isOpen, loading, formData.vendor_name, formData.transaction_date, formData.original_amount, duplicateCheckResult, performDuplicateCheck])

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

  // Fetch e-invoice data for the EinvoiceSection
  useEffect(() => {
    if (!isOpen || !expenseClaimId) return
    const fetchEinvoiceData = async () => {
      try {
        const res = await fetch(`/api/v1/expense-claims/${expenseClaimId}`)
        const result = await res.json()
        if (result.success && result.data) {
          setEinvoiceData(result.data)
        }
      } catch {
        // Non-fatal
      }
    }
    fetchEinvoiceData()
  }, [isOpen, expenseClaimId])

  const refreshEinvoiceData = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/expense-claims/${expenseClaimId}`)
      const result = await res.json()
      if (result.success && result.data) setEinvoiceData(result.data)
    } catch { /* non-fatal */ }
  }, [expenseClaimId])

  // Poll for status changes when einvoice is "requesting" (Lambda processing)
  const einvoicePollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    const status = einvoiceData?.einvoiceRequestStatus
    if (status === 'requesting' || status === 'in_progress') {
      // Start polling every 5s
      if (!einvoicePollRef.current) {
        einvoicePollRef.current = setInterval(refreshEinvoiceData, 5000)
      }
    } else {
      // Stop polling when status changes
      if (einvoicePollRef.current) {
        clearInterval(einvoicePollRef.current)
        einvoicePollRef.current = null
      }
    }
    return () => {
      if (einvoicePollRef.current) {
        clearInterval(einvoicePollRef.current)
        einvoicePollRef.current = null
      }
    }
  }, [einvoiceData?.einvoiceRequestStatus, refreshEinvoiceData])

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

        const response = await fetch(`/api/v1/expense-claims/${expenseClaimId}/image-url?useRawFile=true&storagePath=${encodeURIComponent(receiptInfo.storagePath)}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
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

  // Helper function to show success message
  const showSuccessMessage = useCallback((message: string) => {
    setSuccessMessage(message)
    setShowSuccess(true)
    // Auto-hide after 3 seconds
    setTimeout(() => {
      setShowSuccess(false)
    }, 3000)
  }, [])

  // Check for duplicates before submission
  const checkForDuplicates = useCallback(async (): Promise<boolean> => {
    setCheckingDuplicates(true)
    try {
      const response = await fetch('/api/v1/expense-claims/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_name: formData.vendor_name,
          transaction_date: formData.transaction_date,
          original_amount: formData.original_amount,
          original_currency: formData.original_currency,
          reference_number: formData.reference_number,
          exclude_claim_id: expenseClaimId, // Exclude current claim from duplicate check
        }),
      })

      if (!response.ok) {
        console.error('Duplicate check failed:', response.status)
        return false // Allow submission if check fails
      }

      const result = await response.json()
      if (result.success && result.data.hasDuplicates) {
        setDuplicateMatches(result.data.matches)
        setDuplicateHighestTier(result.data.highestTier)
        setShowDuplicateModal(true)
        return true // Has duplicates
      }
      return false // No duplicates
    } catch (error) {
      console.error('Duplicate check error:', error)
      return false // Allow submission if check fails
    } finally {
      setCheckingDuplicates(false)
    }
  }, [formData, expenseClaimId])

  // Handle duplicate modal close (cancel submission)
  // NOTE: Don't clear duplicateMatches here - the warning banner should persist
  const handleDuplicateClose = useCallback(() => {
    setShowDuplicateModal(false)
  }, [])

  // Handle duplicate modal confirm (proceed with submission)
  const handleDuplicateConfirm = useCallback(async (override: DuplicateOverride) => {
    setDuplicateOverride(override)
    setShowDuplicateModal(false)
    // Now proceed with actual submission
    try {
      updateFormDataLineItems()
      await handleSave('submit')
      showSuccessMessage('Expense claim submitted for approval!')
    } catch (error) {
      console.error('Save error after duplicate override:', error)
    }
  }, [updateFormDataLineItems, handleSave, showSuccessMessage])

  // Wrapper for handleSave to include line items in form data
  const handleSaveWithLineItems = useCallback(async (action: 'draft' | 'submit') => {
    try {
      // Update form data with current line items before saving
      updateFormDataLineItems()

      // For submit action, check for duplicates first
      if (action === 'submit') {
        const hasDuplicates = await checkForDuplicates()
        if (hasDuplicates) {
          // Don't proceed - duplicate modal will handle confirmation
          return
        }
      }

      await handleSave(action)

      // Show success message based on action
      const actionText = action === 'draft' ? 'saved as draft' : 'submitted for approval'
      showSuccessMessage(`Expense claim ${actionText} successfully!`)

    } catch (error) {
      console.error('Save error in modal:', error)
      // Error is already handled by useExpenseForm hook and displayed via saveError
    }
  }, [updateFormDataLineItems, handleSave, showSuccessMessage, checkForDuplicates])

  // Don't render if modal is not open
  if (!isOpen) {
    console.log('EditExpenseModalNew returning null because isOpen is false')
    return null
  }

  // SSR safety check
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg w-full max-w-7xl max-h-[95vh] overflow-hidden relative">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Edit Expense Claim</h2>
            <p className="text-muted-foreground text-sm">
              Modify your expense claim details
            </p>
          </div>

          {/* Action Buttons in Header */}
          <div className="flex items-center flex-wrap gap-2">
            {onDelete && (
              <button
                onClick={handleDeleteClick}
                disabled={saving || submitting || isReprocessing}
                className="inline-flex items-center px-3 py-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4 md:mr-1.5" />
                <span className="hidden md:inline">Delete</span>
              </button>
            )}
            <button
              onClick={() => handleSaveWithLineItems('draft')}
              disabled={saving || submitting || isReprocessing}
              className="inline-flex items-center px-3 md:px-4 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 md:mr-1.5 animate-spin" />
                  <span className="hidden md:inline">Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 md:mr-1.5" />
                  <span className="hidden md:inline">Save Draft</span>
                </>
              )}
            </button>
            {!hideSubmit && (
              <button
                onClick={() => handleSaveWithLineItems('submit')}
                disabled={saving || submitting || isReprocessing || checkingDuplicates}
                className="inline-flex items-center px-3 md:px-4 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {checkingDuplicates ? (
                  <>
                    <Loader2 className="w-4 h-4 md:mr-1.5 animate-spin" />
                    <span className="hidden md:inline">Checking...</span>
                  </>
                ) : submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 md:mr-1.5 animate-spin" />
                    <span className="hidden md:inline">Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 md:mr-1.5" />
                    <span className="hidden md:inline">Submit</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={onClose}
              disabled={saving || submitting}
              className="inline-flex items-center px-3 py-1.5 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-hidden h-[calc(90vh-120px)]">
          <div className="p-0 h-full">
            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 mx-auto text-primary mb-4 animate-spin" />
                <p className="text-muted-foreground">Loading expense details...</p>
              </div>
            ) : loadError ? (
              <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
                <p className="text-destructive mb-4">{loadError}</p>
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="border-border text-muted-foreground"
                >
                  Try Again
                </Button>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Top Banner - Expense Summary (compact height) */}
                <div className="bg-muted p-3 border-b border-border">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0 mb-3">
                    {/* Left side - Status and key info */}
                    <div className="flex flex-wrap items-center gap-2 md:gap-4">
                      <span className="bg-primary/10 text-primary border border-primary/30 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium">
                        {claimStatus.toWellFormed() || 'Draft'}
                      </span>

                      {/* Key expense summary info - stacks on mobile */}
                      <span className="font-semibold text-base md:text-lg text-success">
                        {formData.original_currency} {formData.original_amount.toFixed(2)}
                      </span>
                      <span className="font-semibold text-base md:text-lg text-foreground">{formData.vendor_name || 'N/A'}</span>
                      <span className="font-semibold text-base md:text-lg text-foreground">
                        {formData.transaction_date ? formatBusinessDate(formData.transaction_date) : 'N/A'}
                      </span>
                    </div>

                    {/* Right side - Progress indicator - hidden on mobile */}
                    <div className="hidden md:flex text-right text-muted-foreground items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-lg">10%</span>
                        <div className="w-16 bg-muted-foreground/30 rounded-full h-2">
                          <div className="h-2 rounded-full bg-primary transition-all duration-300" style={{ width: '10%' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Duplicate Warning Banner - Shows when duplicates detected on load */}
                {duplicateMatches.length > 0 && (
                  <Alert className="mx-4 mt-3 bg-red-50 border-red-500 dark:bg-red-900/20">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <AlertDescription className="text-red-700 dark:text-red-400">
                      <strong>⚠️ Potential Duplicate Detected!</strong>{' '}
                      This expense matches {duplicateMatches.length} existing claim{duplicateMatches.length > 1 ? 's' : ''}
                      ({duplicateHighestTier === 'exact' ? 'Exact match' : duplicateHighestTier === 'strong' ? 'Same vendor/date/amount' : 'Similar expense'}).
                      <button
                        className="ml-2 underline text-red-800 hover:text-red-900 dark:text-red-300"
                        onClick={() => setShowDuplicateModal(true)}
                      >
                        View matches →
                      </button>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Bottom Section - Stacked on mobile, 40/60 Split on desktop */}
                <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                  {/* Left Panel - Receipt Preview (full width mobile, 40% desktop) */}
                  <div className="w-full md:w-2/5 border-b md:border-b-0 md:border-r border-border flex flex-col h-48 md:h-auto">
                    <div className="flex-1 bg-muted p-4 overflow-hidden">
                      {receiptInfo.hasReceipt ? (
                        <div className="h-full flex flex-col">
                          <div className="flex-1 bg-muted overflow-hidden">
                            {imageLoading ? (
                              <div className="flex items-center justify-center h-full">
                                <div className="text-center text-muted-foreground">
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
                                extraToolbarActions={
                                  <button
                                    onClick={handleReprocessWrapper}
                                    disabled={saving || submitting || isReprocessing}
                                    className="inline-flex items-center px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-md transition-colors disabled:opacity-50 justify-center"
                                    style={{ height: '40px', minWidth: '120px' }}
                                  >
                                    {isReprocessing ? (
                                      <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Processing...
                                      </>
                                    ) : (
                                      <>
                                        <Brain className="w-4 h-4 mr-2" />
                                        AI Extract
                                      </>
                                    )}
                                  </button>
                                }
                                hideRegionsCount={true}
                              />
                            ) : receiptInfo.storagePath ? (
                              <div className="flex items-center justify-center h-full">
                                <div className="text-center text-muted-foreground">
                                  <Receipt className="w-12 h-12 mx-auto mb-2" />
                                  <p className="text-xs">Failed to generate secure URL</p>
                                  <p className="text-xs text-muted-foreground/70">Please contact support if this persists</p>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <div className="text-center text-muted-foreground">
                                  <Receipt className="w-12 h-12 mx-auto mb-2" />
                                  <p className="text-xs">No receipt attached</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center text-muted-foreground">
                            <Receipt className="w-12 h-12 mx-auto mb-2" />
                            <p className="text-xs">No receipt attached</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Panel - Editable Details (full width mobile, 60% desktop) */}
                  <div className="w-full md:w-3/5 overflow-y-auto">
                    <div className="p-6 space-y-6">
                      {/* Success Alert */}
                      {showSuccess && (
                        <Alert className="bg-green-500/10 border border-green-500/30">
                          <CheckCircle className="w-4 h-4" />
                          <AlertDescription className="text-green-600 dark:text-green-400">
                            {successMessage}
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Save Error Alert */}
                      {saveError && (
                        <Alert className="bg-red-500/10 border border-red-500/30">
                          <AlertCircle className="w-4 h-4" />
                          <AlertDescription className="text-red-600 dark:text-red-400">
                            {saveError}
                          </AlertDescription>
                        </Alert>
                      )}


                      {/* Basic Information - Editable */}
                      <Card className="bg-card border-border">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-foreground text-sm flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground" />
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
                            isManualRate={isManualRate}
                            onManualRateChange={setManualRate}
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
                      <Card className="bg-card border-border">
                        <CardHeader>
                          <CardTitle className="text-foreground text-sm flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-muted-foreground" />
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
                            subtotalAmount={formData.subtotal_amount}
                            additionalCharges={formData.additional_charges}
                            taxAmount={formData.tax_amount || 0}
                            lineItemsStatus={lineItemsStatus}
                          />
                        </CardContent>
                      </Card>

                      {/* E-Invoice Section */}
                      <EinvoiceSection
                        claimId={expenseClaimId}
                        merchantFormUrl={einvoiceData?.merchantFormUrl}
                        einvoiceRequestStatus={einvoiceData?.einvoiceRequestStatus}
                        einvoiceSource={einvoiceData?.einvoiceSource}
                        einvoiceAttached={einvoiceData?.einvoiceAttached}
                        einvoiceEmailRef={einvoiceData?.einvoiceEmailRef}
                        einvoiceRequestedAt={einvoiceData?.einvoiceRequestedAt}
                        einvoiceReceivedAt={einvoiceData?.einvoiceReceivedAt}
                        einvoiceAgentError={einvoiceData?.einvoiceAgentError}
                        einvoiceStoragePath={einvoiceData?.einvoiceStoragePath}
                        lhdnReceivedDocumentUuid={einvoiceData?.lhdnReceivedDocumentUuid}
                        lhdnReceivedLongId={einvoiceData?.lhdnReceivedLongId}
                        lhdnReceivedStatus={einvoiceData?.lhdnReceivedStatus}
                        lhdnReceivedAt={einvoiceData?.lhdnReceivedAt}
                        currency={formData.original_currency}
                        onRefresh={refreshEinvoiceData}
                        businessHasTin={!!bizProfile?.lhdn_tin}
                        businessHasBrn={!!bizProfile?.business_registration_number}
                        businessHasAddress={!!bizProfile?.address_line1}
                        businessHasPhone={!!bizProfile?.contact_phone}
                        businessHasEmail={!!bizProfile?.contact_email}
                      />

                      {/* Expense ID at bottom of content */}
                      <div className="flex justify-end mt-6 pt-4 border-t border-border">
                        <div className="flex items-center gap-2 bg-muted/90 backdrop-blur-sm px-3 py-1.5 rounded-md border border-border">
                          <span className="text-muted-foreground text-xs font-mono">Expense ID: {expenseClaimId}</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(expenseClaimId)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy Receipt ID"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
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

      {/* Duplicate Warning Modal */}
      <DuplicateWarningModal
        isOpen={showDuplicateModal}
        onClose={handleDuplicateClose}
        onProceed={handleDuplicateConfirm}
        duplicates={duplicateMatches}
        highestTier={duplicateHighestTier}
        currentExpense={{
          claimId: expenseClaimId,
          vendorName: formData.vendor_name,
          transactionDate: formData.transaction_date,
          totalAmount: formData.original_amount,
          currency: formData.original_currency,
          status: claimStatus || 'draft',
          referenceNumber: formData.reference_number
        }}
        onViewExpense={(claimId) => {
          // Navigate to the matched expense in same window
          // Close the modal first, then navigate
          setShowDuplicateModal(false)
          onClose()
          window.location.href = `/${locale}/expense-claims?view=${claimId}`
        }}
      />
    </div>,
    document.body
  )
}