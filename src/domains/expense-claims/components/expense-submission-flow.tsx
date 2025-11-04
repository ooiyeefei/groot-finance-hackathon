/**
 * AI Expense Submission Flow - Orchestrator Component
 * AI-Inspired Architecture: Single responsibility - orchestrates the 3-step flow
 * Implements: Upload → Process → Pre-filled Form workflow
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import { X, ArrowLeft, ArrowRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AIExtractionResult } from '@/domains/expense-claims/types/expense-extraction'
import { useExpenseClaimProcessing } from '../hooks/use-expense-claim-processing'
import ReceiptUploadStep from './receipt-upload-step'
import ProcessingStep from './processing-step'
import CreateExpensePageNew from './create-expense-page-new'

interface ExpenseSubmissionFlowProps {
  onClose: (hasBackgroundProcessing?: boolean) => void
  onSubmit: (formData: any) => void
  initialStep?: FlowStep // Allow starting from a specific step
}

type FlowStep = 'upload' | 'processing' | 'form'

interface FlowState {
  currentStep: FlowStep
  uploadedFile: File | null
  extractionResult: AIExtractionResult | null
  error: string | null
  isSubmitting: boolean
  isBackgroundProcessing: boolean
  processingClaimId: string | null
}

export default function ExpenseSubmissionFlow({
  onClose,
  onSubmit,
  initialStep = 'upload'
}: ExpenseSubmissionFlowProps) {
  const {
    processingClaims,
    addProcessingClaim,
    updateClaimStatus,
    removeProcessingClaim,
    getProcessingClaim,
    hasActiveProcessing
  } = useExpenseClaimProcessing()


  const [flowState, setFlowState] = useState<FlowState>({
    currentStep: initialStep,
    uploadedFile: null,
    extractionResult: initialStep === 'form' ? null : null, // Will be set by useEffect if starting with form
    error: null,
    isSubmitting: false,
    isBackgroundProcessing: false,
    processingClaimId: null
  })

  // Initialize extraction result for manual entry (when starting with 'form' step)
  useEffect(() => {
    if (initialStep === 'form' && !flowState.extractionResult) {
      const fallbackResult: AIExtractionResult = {
        thinking: {
          step1_vendor_analysis: 'Manual entry - no automated analysis performed',
          step2_date_identification: 'Manual entry - user will provide date',
          step3_amount_parsing: 'Manual entry - user will provide amount',
          step4_tax_calculation: 'Manual entry - user will provide tax details',
          step5_line_items_extraction: 'Manual entry - user will provide line items',
          step6_validation_checks: 'Manual entry - user responsible for accuracy',
          final_confidence_assessment: 'Manual entry mode - no confidence scoring available'
        },
        extractedData: {
          vendorName: '',
          transactionDate: new Date().toISOString().split('T')[0],
          totalAmount: 0,
          currency: 'SGD',
          lineItems: [],
          extractionQuality: 'low',
          confidenceScore: 0.0,
          missingFields: ['vendorName', 'transactionDate', 'totalAmount'],
          processingMethod: 'manual_entry',
          processingTimestamp: new Date().toISOString()
        },
        processingComplete: true,
        needsManualReview: true,
        suggestedCorrections: ['All fields require manual input']
      }

      setFlowState(prev => ({
        ...prev,
        extractionResult: fallbackResult
      }))
    }
  }, [initialStep, flowState.extractionResult])

  // AI Flow: Step 1 → Step 2 (Upload → Processing)
  const handleFileSelected = (file: File) => {
    // Handle validation errors from ReceiptUploadStep
    if (file.type.startsWith('error/')) {
      setFlowState(prev => ({
        ...prev,
        error: file.type === 'error/validation'
          ? 'Please select a valid image (JPEG, PNG, WebP) or PDF file'
          : 'File size must be less than 10MB'
      }))
      return
    }

    // Add to processing queue
    const claimId = addProcessingClaim(file)

    setFlowState(prev => ({
      ...prev,
      uploadedFile: file,
      currentStep: 'processing',
      error: null,
      processingClaimId: claimId
    }))
  }

  // AI Flow: Step 2 → Step 3 (Processing → Pre-filled Form)
  const handleExtractionComplete = (result: AIExtractionResult) => {
    setFlowState(prev => ({
      ...prev,
      extractionResult: result,
      currentStep: 'form'
    }))
  }

  // Track background processing state from ProcessingStep
  const handleProcessingStateChange = useCallback((isProcessing: boolean) => {
    setFlowState(prev => ({
      ...prev,
      isBackgroundProcessing: isProcessing
    }))
  }, [])

  // Monitor processing claim status and update flow accordingly
  useEffect(() => {
    if (!flowState.processingClaimId) return

    const claim = getProcessingClaim(flowState.processingClaimId)
    if (!claim) return

    // Update background processing state
    const isActivelyProcessing = ['uploading', 'classifying', 'processing', 'analyzing'].includes(claim.status)
    if (flowState.isBackgroundProcessing !== isActivelyProcessing) {
      setFlowState(prev => ({
        ...prev,
        isBackgroundProcessing: isActivelyProcessing
      }))
    }

    // Handle completion
    if (claim.status === 'completed' && claim.extractionResult && flowState.currentStep === 'processing') {
      handleExtractionComplete(claim.extractionResult)
    }

    // Handle failure
    if (claim.status === 'failed' && flowState.currentStep === 'processing') {
      setFlowState(prev => ({
        ...prev,
        error: claim.error || 'Processing failed',
        isBackgroundProcessing: false
      }))
    }
  }, [processingClaims, flowState.processingClaimId, flowState.isBackgroundProcessing, flowState.currentStep])

  // AI Flow: Skip processing and go directly to manual form
  const handleSkipToManualForm = () => {
    // Create a fallback extraction result for manual entry
    const fallbackResult: AIExtractionResult = {
      thinking: {
        step1_vendor_analysis: 'Manual entry - no automated analysis performed',
        step2_date_identification: 'Manual entry - user will provide date',
        step3_amount_parsing: 'Manual entry - user will provide amount',
        step4_tax_calculation: 'Manual entry - user will provide tax details',
        step5_line_items_extraction: 'Manual entry - user will provide line items',
        step6_validation_checks: 'Manual entry - user responsible for accuracy',
        final_confidence_assessment: 'Manual entry mode - no confidence scoring available'
      },
      extractedData: {
        vendorName: '',
        transactionDate: new Date().toISOString().split('T')[0],
        totalAmount: 0,
        currency: 'SGD',
        lineItems: [],
        extractionQuality: 'low',
        confidenceScore: 0.0,
        missingFields: ['vendorName', 'transactionDate', 'totalAmount'],
        processingMethod: 'manual_entry',
        processingTimestamp: new Date().toISOString()
      },
      processingComplete: true,
      needsManualReview: true,
      suggestedCorrections: ['All fields require manual input']
    }

    setFlowState(prev => ({
      ...prev,
      extractionResult: fallbackResult,
      currentStep: 'form'
    }))
  }

  // Handle form submission
  const handleFormSubmit = async (formData: any) => {
    setFlowState(prev => ({ ...prev, isSubmitting: true }))
    
    try {
      const result = await onSubmit(formData)
      return result  // Return the result so PreFilledExpenseForm can access it
    } catch (error) {
      console.error('Submission failed:', error)
      setFlowState(prev => ({ 
        ...prev, 
        error: 'Failed to submit expense claim. Please try again.',
        isSubmitting: false 
      }))
      throw error  // Re-throw so PreFilledExpenseForm can handle it
    }
  }

  // Navigation helpers
  const handleBack = () => {
    if (flowState.currentStep === 'processing') {
      setFlowState(prev => ({
        ...prev,
        currentStep: 'upload',
        uploadedFile: null,
        error: null
      }))
    } else if (flowState.currentStep === 'form') {
      // Allow going back to processing if we had a file, otherwise to upload
      setFlowState(prev => ({
        ...prev,
        currentStep: flowState.uploadedFile ? 'processing' : 'upload',
        extractionResult: null
      }))
    }
  }

  const handleRetryProcessing = () => {
    // Clean up existing processing claim if any
    if (flowState.processingClaimId) {
      removeProcessingClaim(flowState.processingClaimId)
    }

    setFlowState(prev => ({
      ...prev,
      currentStep: 'upload',
      uploadedFile: null,
      extractionResult: null,
      error: null,
      processingClaimId: null
    }))
  }

  // Step indicator component
  const StepIndicator = () => {
    const steps = [
      { id: 'upload', label: 'Upload', description: 'Receipt capture' },
      { id: 'processing', label: 'Process', description: 'Data extraction' },
      { id: 'form', label: 'Review', description: 'Pre-filled form' }
    ]

    const getCurrentStepIndex = () => {
      return steps.findIndex(step => step.id === flowState.currentStep)
    }

    return (
      <div className="flex items-center justify-center space-x-4 mb-6">
        {steps.map((step, index) => {
          const isActive = step.id === flowState.currentStep
          const isCompleted = index < getCurrentStepIndex()

          return (
            <div key={step.id} className="flex items-center">
              <div className={`flex flex-col items-center ${index > 0 ? 'ml-4' : ''}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                  isActive
                    ? 'bg-primary text-primary-foreground ring-2 ring-primary/40'
                    : isCompleted
                    ? 'bg-green-600 dark:bg-green-500 text-white'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {index + 1}
                </div>
                <div className="text-center mt-1">
                  <div className={`text-sm font-medium ${
                    isActive ? 'text-primary' : isCompleted ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
                  }`}>
                    {step.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{step.description}</div>
                </div>
              </div>

              {index < steps.length - 1 && (
                <ArrowRight className={`w-4 h-4 mx-2 ${
                  isCompleted ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
                }`} />
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 bottom-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
      style={{
        margin: 0,
        padding: 0,
        width: '100vw',
        height: '100vh',
        position: 'fixed'
      }}
      onClick={(e) => {
        // Only close if clicking on the backdrop (not the modal content)
        if (e.target === e.currentTarget) {
          onClose(hasActiveProcessing || flowState.isBackgroundProcessing)
        }
      }}
    >
      <div
        className={`bg-card rounded-lg w-full max-h-[96vh] overflow-hidden border border-border m-4 ${
          flowState.currentStep === 'upload' ? 'max-w-2xl' :
          flowState.currentStep === 'processing' ? 'max-w-4xl' :
          'max-w-7xl'
        }`}
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Expense Submission</h2>
            <p className="text-muted-foreground text-sm">
              {flowState.extractionResult?.extractedData.processingMethod === 'manual_entry'
                ? 'Manually fill out expense details and attach a receipt'
                : 'Intelligent receipt processing with Chain-of-Thought AI'
              }
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Document icon and Draft status */}
            {flowState.currentStep === 'form' && (
              <>
                <FileText className="w-5 h-5 text-primary" />
                <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                  Draft
                </Badge>
              </>
            )}

            {/* Show background processing indicator */}
            {hasActiveProcessing && (
              <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 animate-pulse">
                {processingClaims.length} processing...
              </Badge>
            )}

            {flowState.extractionResult &&
             flowState.extractionResult.extractedData.processingMethod !== 'manual_entry' &&
             flowState.currentStep !== 'form' && (
              <Badge
                variant="secondary"
                className={
                  flowState.extractionResult.extractedData.extractionQuality === 'high'
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30'
                    : flowState.extractionResult.extractedData.extractionQuality === 'medium'
                    ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
                }
              >
                {flowState.extractionResult.extractedData.extractionQuality} quality
              </Badge>
            )}
            <Button
              onClick={() => onClose(hasActiveProcessing || flowState.isBackgroundProcessing)}
              disabled={flowState.isSubmitting}
              variant="ghost"
              size="sm"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Step Indicator - Hide for manual entry mode */}
        {!(flowState.extractionResult?.extractedData.processingMethod === 'manual_entry') && (
          <div className="p-6 pb-0">
            <StepIndicator />
          </div>
        )}

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(96vh-180px)]">
          {/* Step 1: Upload */}
          {flowState.currentStep === 'upload' && (
            <ReceiptUploadStep
              onFileSelected={handleFileSelected}
              onSkip={handleSkipToManualForm}
              error={flowState.error || undefined}
            />
          )}

          {/* Step 2: Processing */}
          {flowState.currentStep === 'processing' && flowState.uploadedFile && (
            <ProcessingStep
              file={flowState.uploadedFile}
              onExtractionComplete={handleExtractionComplete}
              onRetry={handleRetryProcessing}
              onSkip={handleSkipToManualForm}
              onProcessingStateChange={handleProcessingStateChange}
              processingClaimId={flowState.processingClaimId}
              processingClaim={flowState.processingClaimId ? getProcessingClaim(flowState.processingClaimId) : undefined}
              updateClaimStatus={updateClaimStatus}
            />
          )}

          {/* Step 3: Pre-filled Form */}
          {flowState.currentStep === 'form' && flowState.extractionResult && (
            <CreateExpensePageNew
              extractionResult={flowState.extractionResult}
              onSubmit={handleFormSubmit}
              onBack={handleBack}
              isSubmitting={flowState.isSubmitting}
              showBackButton={true}
              pageTitle="Create Expense Claim"
              pageDescription="Review and submit your extracted expense details"
              hideHeader={true}  // Hide redundant header since we're in AI flow
            />
          )}
        </div>

        {/* Navigation Footer */}
        {(flowState.currentStep === 'upload' || flowState.currentStep === 'processing') && (
          <div className="p-6 pt-0">
            <div className="flex justify-between items-center text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                {flowState.currentStep === 'processing' && (
                  <Button
                    onClick={handleBack}
                    variant="secondary"
                    size="sm"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Change File
                  </Button>
                )}
              </div>
              <div>
                Powered by AI Receipt Analysis
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}