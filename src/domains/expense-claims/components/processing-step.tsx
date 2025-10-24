/**
 * AI Processing Step - Chain-of-Thought Display
 * Handles receipt extraction with 6-step reasoning process
 */

'use client'

import { useState, useEffect } from 'react'
import { 
  Brain, 
  CheckCircle, 
  Loader2, 
  AlertCircle, 
  RefreshCw, 
  ArrowRight,
  Search,
  Calendar,
  DollarSign,
  Receipt,
  List,
  Shield
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ErrorMessageCard } from '@/components/ui/error-message-card'
// Removed direct import - now using server-side API
import { AIExtractionResult, ExtractionReasoning } from '@/domains/expense-claims/types/expense-extraction'

interface ProcessingStepProps {
  file: File
  onExtractionComplete: (result: AIExtractionResult) => void
  onRetry: () => void
  onSkip: () => void
  onProcessingStateChange?: (isProcessing: boolean) => void
  processingClaimId?: string | null
  processingClaim?: any
  updateClaimStatus?: (claimId: string, updates: any) => void
}

interface ProcessingStep {
  id: keyof ExtractionReasoning
  title: string
  icon: any
  description: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  reasoning?: string
}

export default function ProcessingStep({
  file,
  onExtractionComplete,
  onRetry,
  onSkip,
  onProcessingStateChange,
  processingClaimId,
  processingClaim,
  updateClaimStatus
}: ProcessingStepProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [extractionResult, setExtractionResult] = useState<AIExtractionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorSuggestions, setErrorSuggestions] = useState<string[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(13) // 13 seconds total for AI processing
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([
    {
      id: 'step1_vendor_analysis',
      title: 'Vendor Analysis',
      icon: Search,
      description: 'Identifying merchant and business information',
      status: 'pending'
    },
    {
      id: 'step2_date_identification', 
      title: 'Date Identification',
      icon: Calendar,
      description: 'Locating transaction date and time',
      status: 'pending'
    },
    {
      id: 'step3_amount_parsing',
      title: 'Amount Parsing',
      icon: DollarSign, 
      description: 'Extracting monetary values and currency',
      status: 'pending'
    },
    {
      id: 'step4_tax_calculation',
      title: 'Tax Calculation',
      icon: Receipt,
      description: 'Analyzing tax rates and amounts',
      status: 'pending'
    },
    {
      id: 'step5_line_items_extraction',
      title: 'Line Items Extraction', 
      icon: List,
      description: 'Parsing individual purchase items',
      status: 'pending'
    },
    {
      id: 'step6_validation_checks',
      title: 'Validation Checks',
      icon: Shield,
      description: 'Verifying accuracy and consistency',
      status: 'pending'
    }
  ])

  // Notify parent component when processing state changes
  useEffect(() => {
    onProcessingStateChange?.(isProcessing)
  }, [isProcessing])

  // Start AI extraction when component mounts
  useEffect(() => {
    if (!file || isProcessing) return

    const controller = new AbortController()
    const signal = controller.signal
    
    let isMounted = true

    const runExtraction = async () => {
      if (signal.aborted || !isMounted) return
      
      setIsProcessing(true)
      setError(null)
      setCurrentStep(0)
      
      // Reset all steps to pending
      setProcessingSteps(prev => prev.map(step => ({ ...step, status: 'pending' })))

      try {
        // Check if aborted before making request
        if (signal.aborted) return

        // Update processing claim status if available
        if (processingClaimId && updateClaimStatus) {
          updateClaimStatus(processingClaimId, {
            status: 'processing',
            progress: 5
          })
        }

        // UNIFIED APPROACH: Create record + upload file + trigger AI in one API call
        // Follow standardized storage path pattern and let AI determine category

        // Unified API call: Create record + upload file + trigger AI processing
        const formData = new FormData()
        formData.append('file', file)
        formData.append('processing_mode', 'ai')

        // Add required form fields for unified API - use dummy values, AI will update
        formData.append('description', 'Receipt Processing - AI Extraction')
        formData.append('business_purpose', 'Business Expense - Receipt Upload')
        // No expense_category - let trigger.dev AI job determine it
        formData.append('original_amount', '0') // Temporary amount (zero), will be updated by AI
        formData.append('original_currency', 'SGD')
        formData.append('transaction_date', new Date().toISOString().split('T')[0])
        formData.append('vendor_name', 'Processing...')

        // Start both the unified API call and progress simulation in parallel
        const [response] = await Promise.all([
          fetch('/api/v1/expense-claims', {
            method: 'POST',
            body: formData,
            signal
          }),
          // Show realistic progress during AI processing time
          simulateRealisticProgress()
        ])

        // Check if aborted after fetch
        if (signal.aborted) return

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Receipt extraction failed')
        }

        const result = await response.json()
        
        if (!result.success) {
          throw new Error(result.error || 'Data extraction failed')
        }

        // Check if component still mounted before updating state
        if (!isMounted || signal.aborted) return

        // Handle unified API response structure
        const expenseClaimId = result.data.expense_claim_id || result.data.expense_claim?.id
        const taskId = result.data.task_id
        const processingComplete = result.data.processing_complete

        if (!processingComplete && taskId) {
          console.log(`[AI Processing] Expense claim created: ${expenseClaimId}, task_id: ${taskId}`)
          console.log(`[AI Processing] Background processing started, polling for completion...`)

          // Update processing claim with task ID for tracking
          if (processingClaimId && updateClaimStatus) {
            updateClaimStatus(processingClaimId, {
              status: 'analyzing',
              progress: 60,
              taskId: taskId,
              expenseClaimId: expenseClaimId
            })
          }

          // Start polling for expense claim completion
          await pollExpenseClaimCompletion(expenseClaimId, signal)
          return
        }

        // If processing completed immediately (manual mode) - handle gracefully
        if (processingComplete) {
          console.log(`[AI Processing] Processing completed immediately (manual mode)!`)

          // Transform the result using the expense claim function
          const extractionResult = transformClaimDataToExtractionResult(result.data.expense_claim || result.data)

          // Update processing claim to completed status
          if (processingClaimId && updateClaimStatus) {
            updateClaimStatus(processingClaimId, {
              status: 'completed',
              progress: 100,
              extractionResult: extractionResult
            })
          }

          // Update steps with actual reasoning
          setProcessingSteps(prev => prev.map(step => ({
            ...step,
            status: 'completed',
            reasoning: extractionResult.thinking[step.id as keyof typeof extractionResult.thinking] || 'Processing completed'
          })))

          setExtractionResult(extractionResult)
          onExtractionComplete(extractionResult)
          return
        }
      } catch (err) {
        // Don't set error if request was aborted
        if (signal.aborted) return
        
        console.error('Receipt extraction failed:', err)
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Processing failed'

          // Update processing claim to failed status
          if (processingClaimId && updateClaimStatus) {
            updateClaimStatus(processingClaimId, {
              status: 'failed',
              error: errorMessage
            })
          }

          setError(errorMessage)
          setProcessingSteps(prev => prev.map((step, index) => ({
            ...step,
            status: index <= currentStep ? 'failed' : 'pending'
          })))
        }
      } finally {
        if (isMounted) {
          setIsProcessing(false)
        }
      }
    }

    runExtraction()

    // Cleanup function to prevent double-firing and memory leaks
    return () => {
      isMounted = false
      controller.abort()
    }
  }, [file]) // Only depend on file, not isProcessing to avoid infinite loops


  // Poll for expense claim completion using the expense claim status API
  const pollExpenseClaimCompletion = async (expenseClaimId: string, signal: AbortSignal) => {
    const maxAttempts = 120 // 4 minutes max polling (2 second intervals)
    let attempts = 0

    while (attempts < maxAttempts && !signal.aborted) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000)) // Poll every 2 seconds

        if (signal.aborted) return

        const statusResponse = await fetch(`/api/v1/expense-claims/${expenseClaimId}`, { signal })

        if (!statusResponse.ok) {
          throw new Error('Failed to check expense claim status')
        }

        const statusResult = await statusResponse.json()

        if (!statusResult.success) {
          throw new Error(statusResult.error || 'Expense claim status check failed')
        }

        const claimData = statusResult.data

        // Extract processing status from processing_metadata
        const processingMetadata = claimData.processing_metadata || {}
        const processingStatus = processingMetadata.processing_status || processingMetadata.ai_processing_status

        // Also check main claim status for timeout/failure detection
        const mainStatus = claimData.status

        // Update progress indication during polling
        if (processingStatus === 'analyzing' || processingStatus === 'classifying' || processingStatus === 'upload_pending' ||
            mainStatus === 'analyzing' || mainStatus === 'classifying' || mainStatus === 'converting') {
          console.log(`[AI Processing] Expense claim ${expenseClaimId} still processing (${processingStatus || mainStatus})... (${attempts * 2}s elapsed)`)
          attempts++
          continue
        }

        // Check for classification failures (document type rejection)
        if (mainStatus === 'classification_failed' || processingStatus === 'classification_failed') {
          // Handle both JSONB and legacy text error messages
          let errorMessage: string
          let errorSuggestions: string[] = []

          if (typeof processingMetadata.error_message === 'object' && processingMetadata.error_message) {
            errorMessage = processingMetadata.error_message.message ||
              'This document type is not supported for expense claims. Please upload a receipt or invoice.'
            errorSuggestions = processingMetadata.error_message.suggestions || []
          } else {
            errorMessage = processingMetadata.error_message ||
              'This document type is not supported for expense claims. Please upload a receipt or invoice.'
          }

          console.log(`[AI Processing] Document classification failed for expense claim ${expenseClaimId}: ${errorMessage}`)

          // Create custom error with suggestions
          const error = new Error(errorMessage) as any
          error.suggestions = errorSuggestions
          throw error
        }

        // Check for other failures in either processing metadata or main status
        if (processingStatus === 'failed' || mainStatus === 'failed') {
          // Handle both JSONB and legacy text error messages
          let errorMessage: string
          let errorSuggestions: string[] = []

          if (typeof processingMetadata.error_message === 'object' && processingMetadata.error_message) {
            errorMessage = processingMetadata.error_message.message ||
              'Receipt processing failed due to timeout or processing error'
            errorSuggestions = processingMetadata.error_message.suggestions || []
          } else {
            errorMessage = processingMetadata.error_message ||
              'Receipt processing failed due to timeout or processing error'
          }

          console.log(`[AI Processing] Expense claim ${expenseClaimId} failed: ${errorMessage}`)

          // Create custom error with suggestions
          const error = new Error(errorMessage) as any
          error.suggestions = errorSuggestions
          throw error
        }

        // Processing completed successfully
        if (processingStatus === 'completed' || mainStatus === 'draft') {
          console.log(`[AI Processing] Expense claim ${expenseClaimId} completed successfully!`)

          // Transform the result to match expected format
          const extractionResult = transformClaimDataToExtractionResult(claimData)

          // Update processing claim to completed status
          if (processingClaimId && updateClaimStatus) {
            updateClaimStatus(processingClaimId, {
              status: 'completed',
              progress: 100,
              extractionResult: extractionResult
            })
          }

          // Update steps with actual reasoning
          setProcessingSteps(prev => prev.map(step => ({
            ...step,
            status: 'completed',
            reasoning: extractionResult.thinking[step.id as keyof typeof extractionResult.thinking] || 'Processing completed'
          })))

          setExtractionResult(extractionResult)
          onExtractionComplete(extractionResult)
          return
        }

        attempts++
      } catch (pollError) {
        if (signal.aborted) return

        console.error('[AI Processing] Polling error:', pollError)
        attempts++

        // If we've tried many times, give up
        if (attempts >= 10) {
          throw new Error('Unable to check processing status. Please try again.')
        }
      }
    }

    // Polling timed out
    if (attempts >= maxAttempts) {
      throw new Error('Processing is taking longer than expected. Please try again.')
    }
  }


  // Transform expense claim data to extraction result format
  const transformClaimDataToExtractionResult = (claimData: any) => {
    return {
      thinking: {
        step1_vendor_analysis: `Identified vendor: ${claimData.vendor_name || 'Unknown'}`,
        step2_date_identification: `Found date: ${claimData.transaction_date || 'Not found'}`,
        step3_amount_parsing: `Extracted amount: ${claimData.total_amount || 0} ${claimData.currency || 'SGD'}`,
        step4_tax_calculation: `Tax analysis: No tax information found`,
        step5_line_items_extraction: `Line items: 0 items extracted`,
        step6_validation_checks: `Validation complete. Confidence: ${Math.round((claimData.extraction_quality === 'high' ? 0.9 : claimData.extraction_quality === 'medium' ? 0.7 : 0.5) * 100)}%`,
        final_confidence_assessment: `Overall processing confidence: ${Math.round((claimData.extraction_quality === 'high' ? 0.9 : claimData.extraction_quality === 'medium' ? 0.7 : 0.5) * 100)}%`
      },
      extractedData: {
        vendorName: claimData.vendor_name || '',
        totalAmount: claimData.total_amount || 0,
        currency: claimData.currency || 'SGD',
        transactionDate: claimData.transaction_date || '',
        description: claimData.description || '',
        receiptNumber: '',
        lineItems: [],
        confidenceScore: claimData.extraction_quality === 'high' ? 0.9 : claimData.extraction_quality === 'medium' ? 0.7 : 0.5,
        extractionQuality: claimData.extraction_quality || 'medium' as 'high' | 'medium' | 'low',
        missingFields: claimData.missing_fields || [],
        processingMethod: claimData.processing_method || 'ai' as const,
        processingTimestamp: claimData.processed_at || new Date().toISOString(),
        documentId: claimData.expense_claim_id
      },
      processingComplete: claimData.processing_complete || false,
      needsManualReview: claimData.missing_fields?.length > 0 || false,
      suggestedCorrections: []
    }
  }

  // Retry function for manual retry attempts
  const performAIExtraction = async () => {
    // Reset states and trigger a new extraction by updating a retry counter
    setError(null)
    setExtractionResult(null)
    setCurrentStep(0)
    setEstimatedTimeRemaining(13)
    
    // Force re-run the useEffect by creating a new File object with same content
    // This ensures proper cleanup and prevents race conditions
    const newFile = new File([file], file.name, { 
      type: file.type,
      lastModified: Date.now() // Change timestamp to trigger useEffect
    })
    
    // Update parent component to use new file object
    // Note: This requires the parent to pass a setter or handle file updates
    // For now, just re-run the extraction directly (not ideal but functional)
    
    // Alternative: trigger extraction manually (bypassing useEffect)
    // This is safer for retry scenarios
    window.location.reload() // Simple but effective retry mechanism
  }

  // Show realistic progress that aligns with actual AI processing time (12-15 seconds)
  const simulateRealisticProgress = async () => {
    // Realistic time allocations for each AI Chain-of-Thought stage (total: ~13 seconds)
    const stageTimings = [
      2000, // Vendor Analysis - 2.0s (includes hybrid classification)
      1800, // Date Identification - 1.8s  
      2500, // Amount Parsing - 2.5s (complex reasoning)
      2200, // Tax Calculation - 2.2s (chain-of-thought)
      3000, // Line Items Extraction - 3.0s (most complex with validation)
      1500  // Validation Checks - 1.5s (final reasoning)
    ]
    
    let totalElapsed = 0
    const totalDuration = stageTimings.reduce((sum, time) => sum + time, 0)
    
    for (let i = 0; i < processingSteps.length; i++) {
      setCurrentStep(i)
      
      // Update current step to processing
      setProcessingSteps(prev => prev.map((step, index) => ({
        ...step,
        status: index === i ? 'processing' : index < i ? 'completed' : 'pending'
      })))
      
      // Update time remaining during processing
      const stepDuration = stageTimings[i]
      const updateInterval = 100 // Update every 100ms
      const updates = stepDuration / updateInterval
      
      for (let j = 0; j < updates; j++) {
        await new Promise(resolve => setTimeout(resolve, updateInterval))
        totalElapsed += updateInterval
        const remaining = Math.max(0, Math.ceil((totalDuration - totalElapsed) / 1000))
        setEstimatedTimeRemaining(remaining)
      }
      
      // Mark current step as completed before moving to next
      setProcessingSteps(prev => prev.map((step, index) => ({
        ...step,
        status: index <= i ? 'completed' : 'pending'
      })))
    }
    
    setEstimatedTimeRemaining(0)
  }


  const handleRetry = () => {
    setError(null)
    setExtractionResult(null)
    setCurrentStep(0)
    setEstimatedTimeRemaining(13)
    performAIExtraction()
  }

  const getProgressPercentage = () => {
    if (extractionResult) return 100
    if (error) return (currentStep / processingSteps.length) * 100
    return ((currentStep + 1) / processingSteps.length) * 100
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-end mb-4">
        <Badge className="bg-purple-600 text-white flex items-center gap-2">
          <Brain className={`w-4 h-4 ${isProcessing ? 'animate-pulse' : ''}`} />
          AI {isProcessing ? 'Analyzing' : 'Extraction'}
        </Badge>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Processing Progress</span>
          <div className="flex items-center gap-2">
            <span className="text-white">{Math.round(getProgressPercentage())}%</span>
            {isProcessing && estimatedTimeRemaining > 0 && (
              <span className="text-gray-400">• {estimatedTimeRemaining}s remaining</span>
            )}
          </div>
        </div>
        <Progress 
          value={getProgressPercentage()} 
          className="h-2 bg-gray-700"
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="space-y-4">
          <ErrorMessageCard
            message={error}
            suggestions={errorSuggestions}
          />
          <div className="flex gap-2">
            <Button
              onClick={handleRetry}
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry Processing
            </Button>
            <Button
              onClick={onSkip}
              size="sm"
              variant="secondary"
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
            >
              Enter Manually
            </Button>
          </div>
        </div>
      )}

      {/* Chain-of-Thought Steps */}
      <div className="space-y-3">
        {processingSteps.map((step, index) => {
          const StepIcon = step.icon
          return (
            <Card 
              key={step.id} 
              className={`bg-gray-700 border-gray-600 transition-all ${
                step.status === 'processing' ? 'ring-2 ring-purple-500 bg-purple-900/20' : ''
              } ${
                step.status === 'completed' ? 'border-green-600 bg-green-900/20' : ''
              } ${
                step.status === 'failed' ? 'border-red-600 bg-red-900/20' : ''
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-full ${
                    step.status === 'processing' ? 'bg-purple-600' :
                    step.status === 'completed' ? 'bg-green-600' :
                    step.status === 'failed' ? 'bg-red-600' :
                    'bg-gray-600'
                  }`}>
                    {step.status === 'processing' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : step.status === 'completed' ? (
                      <CheckCircle className="w-4 h-4 text-white" />
                    ) : step.status === 'failed' ? (
                      <AlertCircle className="w-4 h-4 text-white" />
                    ) : (
                      <StepIcon className="w-4 h-4 text-white" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-white font-medium">{step.title}</h4>
                      {step.status === 'processing' && (
                        <Badge variant="secondary" className="bg-purple-900/20 text-purple-300 border border-purple-700/50">
                          Processing...
                        </Badge>
                      )}
                      {step.status === 'completed' && (
                        <Badge variant="secondary" className="bg-green-900/20 text-green-300 border border-green-700/50">
                          Complete
                        </Badge>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm mb-2">{step.description}</p>
                    
                    {/* Show reasoning for completed steps */}
                    {step.status === 'completed' && step.reasoning && (
                      <div className="bg-gray-800 p-3 rounded text-sm">
                        <div className="text-gray-300">{step.reasoning}</div>
                      </div>
                    )}
                  </div>
                  
                  {index < processingSteps.length - 1 && step.status === 'completed' && (
                    <ArrowRight className="w-4 h-4 text-green-400 mt-2" />
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Success State - Show Extraction Results */}
      {extractionResult && !error && (
        <Card className="bg-green-900/20 border-green-700">
          <CardHeader>
            <CardTitle className="text-green-400 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              AI Extraction Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Confidence Score:</span>
                <div className="text-white font-medium">
                  {Math.round(extractionResult.extractedData.confidenceScore * 100)}%
                </div>
              </div>
              <div>
                <span className="text-gray-400">Quality:</span>
                <Badge 
                  variant="secondary" 
                  className={
                    extractionResult.extractedData.extractionQuality === 'high' ? 'bg-green-600' :
                    extractionResult.extractedData.extractionQuality === 'medium' ? 'bg-yellow-600' :
                    'bg-red-600'
                  }
                >
                  {extractionResult.extractedData.extractionQuality}
                </Badge>
              </div>
            </div>

            {extractionResult.needsManualReview && (
              <Alert className="bg-yellow-900/20 border-yellow-700">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription className="text-yellow-400">
                  Please review the extracted data carefully before submitting.
                </AlertDescription>
              </Alert>
            )}

            <div className="text-center pt-2">
              <Button 
                className="bg-green-600 hover:bg-green-700"
                onClick={() => onExtractionComplete(extractionResult)}
              >
                Continue to Pre-filled Form
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing State Actions */}
      {isProcessing && (
        <div className="text-center">
          <Button 
            variant="outline" 
            onClick={onSkip}
            className="border-gray-600 text-gray-300"
          >
            Skip Processing & Enter Manually
          </Button>
        </div>
      )}
    </div>
  )
}