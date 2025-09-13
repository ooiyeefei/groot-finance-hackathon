/**
 * DSPy Expense Submission Flow - Orchestrator Component
 * DSPy-Inspired Architecture: Single responsibility - orchestrates the 3-step flow
 * Implements: Upload → Process → Pre-filled Form workflow
 */

'use client'

import { useState, useCallback } from 'react'
import { X, ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DSPyExtractionResult } from '@/types/expense-extraction'
import ReceiptUploadStep from './receipt-upload-step'
import DSPyProcessingStep from './dspy-processing-step'
import PreFilledExpenseForm from './pre-filled-expense-form'

interface DSPyExpenseSubmissionFlowProps {
  onClose: (hasBackgroundProcessing?: boolean) => void
  onSubmit: (formData: any) => void
}

type FlowStep = 'upload' | 'processing' | 'form'

interface FlowState {
  currentStep: FlowStep
  uploadedFile: File | null
  extractionResult: DSPyExtractionResult | null
  error: string | null
  isSubmitting: boolean
  isBackgroundProcessing: boolean
}

export default function DSPyExpenseSubmissionFlow({ 
  onClose, 
  onSubmit 
}: DSPyExpenseSubmissionFlowProps) {
  const [flowState, setFlowState] = useState<FlowState>({
    currentStep: 'upload',
    uploadedFile: null,
    extractionResult: null,
    error: null,
    isSubmitting: false,
    isBackgroundProcessing: false
  })

  // DSPy Flow: Step 1 → Step 2 (Upload → Processing)
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

    setFlowState(prev => ({
      ...prev,
      uploadedFile: file,
      currentStep: 'processing',
      error: null
    }))
  }

  // DSPy Flow: Step 2 → Step 3 (Processing → Pre-filled Form)
  const handleExtractionComplete = (result: DSPyExtractionResult) => {
    setFlowState(prev => ({
      ...prev,
      extractionResult: result,
      currentStep: 'form'
    }))
  }

  // Track background processing state from DSPyProcessingStep
  const handleProcessingStateChange = useCallback((isProcessing: boolean) => {
    setFlowState(prev => ({
      ...prev,
      isBackgroundProcessing: isProcessing
    }))
  }, [])

  // DSPy Flow: Skip processing and go directly to manual form
  const handleSkipToManualForm = () => {
    // Create a fallback extraction result for manual entry
    const fallbackResult: DSPyExtractionResult = {
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
    setFlowState(prev => ({
      ...prev,
      currentStep: 'upload',
      uploadedFile: null,
      extractionResult: null,
      error: null
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
                    ? 'bg-blue-600 text-white ring-2 ring-blue-400' 
                    : isCompleted 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-700 text-gray-400'
                }`}>
                  {index + 1}
                </div>
                <div className="text-center mt-1">
                  <div className={`text-sm font-medium ${
                    isActive ? 'text-blue-400' : isCompleted ? 'text-green-400' : 'text-gray-400'
                  }`}>
                    {step.label}
                  </div>
                  <div className="text-xs text-gray-500">{step.description}</div>
                </div>
              </div>
              
              {index < steps.length - 1 && (
                <ArrowRight className={`w-4 h-4 mx-2 ${
                  isCompleted ? 'text-green-400' : 'text-gray-600'
                }`} />
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-white">Expense Submission</h2>
            <p className="text-gray-400 text-sm">
              Intelligent receipt processing with Chain-of-Thought AI
            </p>
          </div>
          <div className="flex items-center gap-3">
            {flowState.extractionResult && (
              <Badge 
                variant="secondary" 
                className={
                  flowState.extractionResult.extractedData.extractionQuality === 'high' 
                    ? 'bg-green-600' 
                    : flowState.extractionResult.extractedData.extractionQuality === 'medium' 
                    ? 'bg-yellow-600' 
                    : 'bg-red-600'
                }
              >
                {flowState.extractionResult.extractedData.extractionQuality} quality
              </Badge>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => onClose(flowState.isBackgroundProcessing)} 
              disabled={flowState.isSubmitting}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="p-6 pb-0">
          <StepIndicator />
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
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
            <DSPyProcessingStep
              file={flowState.uploadedFile}
              onExtractionComplete={handleExtractionComplete}
              onRetry={handleRetryProcessing}
              onSkip={handleSkipToManualForm}
              onProcessingStateChange={handleProcessingStateChange}
            />
          )}

          {/* Step 3: Pre-filled Form */}
          {flowState.currentStep === 'form' && flowState.extractionResult && (
            <PreFilledExpenseForm
              extractionResult={flowState.extractionResult}
              onSubmit={handleFormSubmit}
              onBack={handleBack}
              isSubmitting={flowState.isSubmitting}
            />
          )}
        </div>

        {/* Navigation Footer (only show for upload and processing steps) */}
        {(flowState.currentStep === 'upload' || flowState.currentStep === 'processing') && (
          <div className="p-6 pt-0 border-t border-gray-700">
            <div className="flex justify-between items-center text-sm text-gray-400">
              <div className="flex items-center gap-2">
                {flowState.currentStep === 'processing' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    className="text-gray-400 hover:text-white"
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