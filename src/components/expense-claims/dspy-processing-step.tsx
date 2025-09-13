/**
 * DSPy Processing Step - Single Responsibility Component
 * DSPy-Inspired Architecture: Handles only receipt extraction with Chain-of-Thought display
 * Shows the 6-step DSPy reasoning process to the user
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
// Removed direct import - now using server-side API
import { DSPyExtractionResult, ExtractionReasoning } from '@/types/expense-extraction'

interface DSPyProcessingStepProps {
  file: File
  onExtractionComplete: (result: DSPyExtractionResult) => void
  onRetry: () => void
  onSkip: () => void
  onProcessingStateChange?: (isProcessing: boolean) => void
}

interface ProcessingStep {
  id: keyof ExtractionReasoning
  title: string
  icon: any
  description: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  reasoning?: string
}

export default function DSPyProcessingStep({ 
  file, 
  onExtractionComplete, 
  onRetry, 
  onSkip,
  onProcessingStateChange
}: DSPyProcessingStepProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [extractionResult, setExtractionResult] = useState<DSPyExtractionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(13) // 13 seconds total for DSPy
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

  // Start DSPy extraction when component mounts - with proper cleanup to prevent double-firing
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

        // Start actual DSPy processing with hybrid classification immediately
        const formData = new FormData()
        formData.append('receipt', file)

        // Start both the DSPy API call and progress simulation in parallel
        const [response] = await Promise.all([
          fetch('/api/receipts/extract-dspy-sync', {
            method: 'POST',
            body: formData,
            signal // Pass AbortController signal to prevent duplicate requests
          }),
          // Show realistic progress during actual DSPy processing time (longer than Gemini)
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

        // Check if processing is complete or still running
        if (!result.data.processing_complete) {
          const taskId = result.data.task_id
          console.log(`[DSPy Processing] Task started in background, task_id: ${taskId}`)
          console.log(`[DSPy Processing] Starting polling for task completion...`)
          
          // Start polling for task completion
          await pollTaskCompletion(taskId, signal)
          return
        }

        // Processing is complete, transform DSPy result to match expected format
        const extractionResult = {
          thinking: {
            step1_vendor_analysis: `Identified vendor: ${result.data.expense_data?.vendor_name || 'Unknown'}`,
            step2_date_identification: `Found date: ${result.data.expense_data?.transaction_date || 'Not found'}`, 
            step3_amount_parsing: `Extracted amount: ${result.data.expense_data?.total_amount || 0} ${result.data.expense_data?.currency || 'SGD'}`,
            step4_tax_calculation: `Tax analysis: ${result.data.expense_data?.tax_amount ? `${result.data.expense_data.tax_amount} tax detected` : 'No tax information found'}`,
            step5_line_items_extraction: `Line items: ${result.data.expense_data?.line_items?.length || 0} items extracted`,
            step6_validation_checks: `Validation complete. Confidence: ${Math.round((result.data.confidence_score || 0) * 100)}%`,
            final_confidence_assessment: `Overall processing confidence: ${Math.round((result.data.confidence_score || 0) * 100)}%`
          },
          extractedData: {
            vendorName: result.data.expense_data?.vendor_name || '',
            totalAmount: result.data.expense_data?.total_amount || 0,
            currency: result.data.expense_data?.currency || 'SGD',
            transactionDate: result.data.expense_data?.transaction_date || '',
            description: result.data.expense_data?.description || '',
            receiptNumber: result.data.expense_data?.receipt_number || '',
            lineItems: (result.data.expense_data?.line_items || []).map((item: any) => ({
              description: item.description || '',
              quantity: item.quantity || null,
              unitPrice: item.unit_price || null,
              lineTotal: item.total_amount || 0
            })),
            confidenceScore: result.data.confidence_score || 0.7,
            extractionQuality: (result.data.confidence_score > 0.9 ? 'high' : result.data.confidence_score > 0.7 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
            missingFields: result.data.expense_data?.missing_fields || [],
            processingMethod: 'dspy' as const,
            processingTimestamp: new Date().toISOString(),
            documentId: result.data.document_id // Include document ID for linking
          },
          processingComplete: result.data.processing_complete,
          needsManualReview: result.data.requires_validation || false,
          suggestedCorrections: []
        }
        
        // Update steps with actual reasoning
        setProcessingSteps(prev => prev.map(step => ({
          ...step,
          status: 'completed',
          reasoning: extractionResult.thinking[step.id as keyof typeof extractionResult.thinking] || 'Processing completed'
        })))

        setExtractionResult(extractionResult)
        onExtractionComplete(extractionResult)
      } catch (err) {
        // Don't set error if request was aborted
        if (signal.aborted) return
        
        console.error('Receipt extraction failed:', err)
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Processing failed')
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

  // Poll for task completion using the task status API
  const pollTaskCompletion = async (taskId: string, signal: AbortSignal) => {
    const maxAttempts = 120 // 2 minutes max polling (2 second intervals)
    let attempts = 0

    while (attempts < maxAttempts && !signal.aborted) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000)) // Poll every 2 seconds
        
        if (signal.aborted) return

        const statusResponse = await fetch(`/api/tasks/${taskId}/status`, { signal })
        
        if (!statusResponse.ok) {
          throw new Error('Failed to check task status')
        }

        const statusResult = await statusResponse.json()
        
        if (!statusResult.success) {
          throw new Error(statusResult.error || 'Task status check failed')
        }

        const taskData = statusResult.data

        // Update progress indication during polling
        if (taskData.status === 'running' || taskData.status === 'waiting') {
          console.log(`[DSPy Processing] Task ${taskId} still running... (${attempts * 2}s elapsed)`)
          attempts++
          continue
        }

        // Task completed successfully
        if (taskData.processing_complete && taskData.is_success && taskData.extraction_result) {
          console.log(`[DSPy Processing] Task ${taskId} completed successfully!`)
          
          // Transform the result to match expected format
          const extractionResult = transformTaskResultToExtractionResult(taskData.extraction_result)
          
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

        // Task failed
        if (taskData.status === 'failed') {
          throw new Error(taskData.error || 'Receipt processing failed')
        }

        attempts++
      } catch (pollError) {
        if (signal.aborted) return
        
        console.error('[DSPy Processing] Polling error:', pollError)
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

  // Transform Trigger.dev task result to DSPy extraction result format
  const transformTaskResultToExtractionResult = (taskResult: any) => {
    return {
      thinking: {
        step1_vendor_analysis: taskResult.reasoning_steps?.step1_vendor_analysis || `Identified vendor: ${taskResult.vendor_name}`,
        step2_date_identification: taskResult.reasoning_steps?.step2_date_identification || `Found date: ${taskResult.transaction_date}`, 
        step3_amount_parsing: taskResult.reasoning_steps?.step3_amount_parsing || `Extracted amount: ${taskResult.total_amount} ${taskResult.currency}`,
        step4_tax_calculation: taskResult.reasoning_steps?.step4_tax_calculation || `Tax analysis: ${taskResult.tax_amount ? `${taskResult.tax_amount} tax detected` : 'No tax information found'}`,
        step5_line_items_extraction: taskResult.reasoning_steps?.step5_line_items_extraction || `Line items: ${taskResult.line_items?.length || 0} items extracted`,
        step6_validation_checks: taskResult.reasoning_steps?.step6_validation_checks || `Validation complete. Confidence: ${Math.round((taskResult.confidence_score || 0) * 100)}%`,
        final_confidence_assessment: taskResult.reasoning_steps?.final_confidence_assessment || `Overall processing confidence: ${Math.round((taskResult.confidence_score || 0) * 100)}%`
      },
      extractedData: {
        vendorName: taskResult.vendor_name || '',
        totalAmount: taskResult.total_amount || 0,
        currency: taskResult.currency || 'SGD',
        transactionDate: taskResult.transaction_date || '',
        description: taskResult.description || '',
        receiptNumber: taskResult.receipt_number || '',
        lineItems: (taskResult.line_items || []).map((item: any) => ({
          description: item.description || '',
          quantity: item.quantity || null,
          unitPrice: item.unit_price || null,
          lineTotal: item.total_amount || 0
        })),
        confidenceScore: taskResult.confidence_score || 0.7,
        extractionQuality: (taskResult.confidence_score > 0.9 ? 'high' : taskResult.confidence_score > 0.7 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
        missingFields: taskResult.missing_fields || [],
        processingMethod: 'dspy' as const,
        processingTimestamp: new Date().toISOString(),
        documentId: taskResult.document_id
      },
      processingComplete: true,
      needsManualReview: taskResult.requires_validation || false,
      suggestedCorrections: taskResult.suggested_corrections || []
    }
  }

  // Retry function for manual retry attempts
  const performDSPyExtraction = async () => {
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

  // Show realistic progress that aligns with actual DSPy processing time (12-15 seconds)
  const simulateRealisticProgress = async () => {
    // Realistic time allocations for each DSPy Chain-of-Thought stage (total: ~13 seconds)
    const stageTimings = [
      2000, // Vendor Analysis - 2.0s (includes hybrid classification)
      1800, // Date Identification - 1.8s  
      2500, // Amount Parsing - 2.5s (complex reasoning)
      2200, // Tax Calculation - 2.2s (chain-of-thought)
      3000, // Line Items Extraction - 3.0s (most complex with Pydantic validation)
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
    performDSPyExtraction()
  }

  const getProgressPercentage = () => {
    if (extractionResult) return 100
    if (error) return (currentStep / processingSteps.length) * 100
    return ((currentStep + 1) / processingSteps.length) * 100
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <Brain className="w-16 h-16 mx-auto text-purple-500 mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">
          Data Extraction
        </h3>
        <p className="text-gray-400">
          Automatically extracting information from your receipt
        </p>
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
        <Alert className="bg-red-900/20 border-red-700">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-red-400">
            <div className="space-y-3">
              <div>Receipt processing failed: {error}</div>
              <div className="flex gap-2">
                <Button
                  onClick={handleRetry}
                  variant="outline"
                  size="sm"
                  className="border-red-600 text-red-400 hover:bg-red-900/20"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Retry Processing
                </Button>
                <Button
                  onClick={onSkip}
                  variant="outline"
                  size="sm"
                  className="border-gray-600 text-gray-300"
                >
                  Enter Manually
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
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
                        <Badge variant="secondary" className="bg-purple-600 text-white">
                          Processing...
                        </Badge>
                      )}
                      {step.status === 'completed' && (
                        <Badge variant="secondary" className="bg-green-600 text-white">
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
              Data Extraction Complete
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