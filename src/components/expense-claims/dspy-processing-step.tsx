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
import { DSPyReceiptExtractor } from '@/lib/ai-services/dspy-receipt-extractor'
import { DSPyExtractionResult, ExtractionReasoning } from '@/types/expense-extraction'

interface DSPyProcessingStepProps {
  file: File
  onExtractionComplete: (result: DSPyExtractionResult) => void
  onRetry: () => void
  onSkip: () => void
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
  onSkip 
}: DSPyProcessingStepProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [extractionResult, setExtractionResult] = useState<DSPyExtractionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
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

  // Start DSPy extraction when component mounts
  useEffect(() => {
    if (file && !isProcessing) {
      performDSPyExtraction()
    }
  }, [file])

  const performDSPyExtraction = async () => {
    setIsProcessing(true)
    setError(null)
    setCurrentStep(0)
    
    // Reset all steps to pending
    setProcessingSteps(prev => prev.map(step => ({ ...step, status: 'pending' })))

    try {
      // Convert file to text (for demonstration - in real app this would use OCR)
      const receiptText = await extractTextFromFile(file)
      
      // Simulate DSPy Chain-of-Thought process with step-by-step updates
      await simulateChainOfThoughtProcess()

      // Perform actual DSPy extraction
      const extractor = new DSPyReceiptExtractor()
      const result = await extractor.extractExpenseData(receiptText)
      
      // Update steps with reasoning
      if (result.thinking) {
        setProcessingSteps(prev => prev.map(step => ({
          ...step,
          status: 'completed',
          reasoning: result.thinking[step.id]
        })))
      }

      setExtractionResult(result)
      onExtractionComplete(result)
    } catch (err) {
      console.error('DSPy extraction failed:', err)
      setError(err instanceof Error ? err.message : 'Processing failed')
      setProcessingSteps(prev => prev.map((step, index) => ({
        ...step,
        status: index <= currentStep ? 'failed' : 'pending'
      })))
    } finally {
      setIsProcessing(false)
    }
  }

  // Simulate the Chain-of-Thought reasoning process with visual feedback
  const simulateChainOfThoughtProcess = async () => {
    for (let i = 0; i < processingSteps.length; i++) {
      setCurrentStep(i)
      
      // Update current step to processing
      setProcessingSteps(prev => prev.map((step, index) => ({
        ...step,
        status: index === i ? 'processing' : index < i ? 'completed' : 'pending'
      })))
      
      // Simulate processing time for each step
      await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400))
    }
  }

  // Extract text from file (placeholder - would use actual OCR in production)
  const extractTextFromFile = async (file: File): Promise<string> => {
    // This is a placeholder - in the real implementation, this would:
    // 1. Upload the file to Supabase storage
    // 2. Trigger OCR extraction via Trigger.dev
    // 3. Return the extracted text
    
    return `
ACME Restaurant & Cafe
123 Business Street
Singapore 123456
Tel: +65 6123 4567

Date: 2024-01-15
Time: 14:30:25
Receipt #: R2024011501234

Grilled Chicken Sandwich    $18.50
Caesar Salad               $12.00
Iced Coffee                 $4.50
                          -------
Subtotal                   $35.00
GST (7%)                    $2.45
                          -------
Total                      $37.45

Payment Method: Credit Card
Thank you for dining with us!
`
  }

  const handleRetry = () => {
    setError(null)
    setExtractionResult(null)
    setCurrentStep(0)
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
          DSPy Chain-of-Thought Processing
        </h3>
        <p className="text-gray-400">
          Systematically analyzing your receipt using advanced AI reasoning
        </p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Processing Progress</span>
          <span className="text-white">{Math.round(getProgressPercentage())}%</span>
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
              <div>DSPy extraction failed: {error}</div>
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
              DSPy Extraction Complete
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