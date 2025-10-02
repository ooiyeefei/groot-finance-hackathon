'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  X,
  RefreshCw,
  Eye,
  Download,
  RotateCcw,
  Loader2,
  Brain,
  Cog,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { cn } from '@/lib/utils'
import PayslipDataDisplay from '@/components/documents/payslip-data-display'

interface PayslipFile {
  slot: string
  display_name: string
  description: string
  is_critical: boolean
  document_type: string
  status: string
  document: {
    id: string
    file_name: string
    storage_path: string
    processing_status: string
    document_type: string
    classification_confidence: number
    error_message: string | null
    extracted_data: any
    uploaded_at: string
    updated_at: string
  } | null
}

interface PayslipValidationDetail {
  slot: string
  fileName: string
  payPeriod: string | null
  monthYear: string | null
  isValid: boolean
  validationMessage: string
}

interface PayslipValidationResult {
  status: 'valid' | 'invalid'
  count: number
  reason?: string
  details: PayslipValidationDetail[]
}

interface ClientValidationResult {
  isValid: boolean
  message: string
  monthYear?: string
  type: 'success' | 'error' | 'warning'
}

interface SmartPayslipUploaderProps {
  applicationId: string
  payslipSlots: PayslipFile[]
  onFileUpload: (slot: string, file: File) => Promise<void>
  onReprocess: (documentId: string) => Promise<void>
  onViewDocument: (document: PayslipFile['document']) => Promise<void>
  onDownloadDocument: (document: PayslipFile['document']) => Promise<void>
  onDeleteDocument?: (documentId: string, fileName: string) => void
  uploadingSlots: Set<string>
  formatDate: (dateString: string) => string
  validationResults?: PayslipValidationResult
}

/**
 * Client-side payslip date validation for immediate user feedback
 * Synchronized with server-side validation logic in validate-payslip-dates.ts
 * Handles both single payslip and multi-payslip document structures
 */
function validatePayslipDateClientSide(document: PayslipFile['document']): ClientValidationResult {
  if (!document || document.processing_status !== 'completed') {
    return { isValid: false, message: 'Processing...', type: 'warning' }
  }

  const extractedData = document.extracted_data
  if (!extractedData) {
    return { isValid: false, message: 'No data extracted', type: 'error' }
  }

  // Handle multi-payslip structure (extractedData.payslips array)
  if (extractedData.payslips && Array.isArray(extractedData.payslips) && extractedData.payslips.length > 0) {
    // For multi-payslip documents, check if any payslip is recent
    const currentDate = new Date()
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(currentDate.getMonth() - 3)

    let validPayslips = 0
    for (const payslip of extractedData.payslips) {
      if (payslip.parsed_pay_date) {
        try {
          const payslipDate = new Date(payslip.parsed_pay_date)
          if (payslipDate <= currentDate && payslipDate >= threeMonthsAgo) {
            validPayslips++
          }
        } catch (error) {
          // Skip invalid dates
        }
      }
    }

    if (validPayslips >= 3) {
      return {
        isValid: true,
        message: `Recent payslips`,
        type: 'success'
      }
    } else {
      return {
        isValid: false,
        message: `Outdated payslips`,
        type: 'error'
      }
    }
  }

  // Handle single payslip structure (extractedData.parsed_pay_date)
  const parsedPayDate = extractedData.parsed_pay_date
  const payPeriod = extractedData.pay_period

  if (!parsedPayDate) {
    return {
      isValid: false,
      message: payPeriod ? `Unable to parse: ${payPeriod}` : 'Date not found',
      type: 'error'
    }
  }

  try {
    const payslipDate = new Date(parsedPayDate)
    const currentDate = new Date()

    // Synchronized with server logic: "most recent 3 months" validation
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(currentDate.getMonth() - 3)

    // Check if date is in the future (not allowed)
    if (payslipDate > currentDate) {
      return {
        isValid: false,
        message: 'Future payslip',
        monthYear: formatDateToMonthYear(payslipDate),
        type: 'error'
      }
    }

    // Check if date is outside 3-month window
    if (payslipDate < threeMonthsAgo) {
      return {
        isValid: false,
        message: 'Outdated payslip',
        monthYear: formatDateToMonthYear(payslipDate),
        type: 'error'
      }
    }

    // Valid payslip within range
    return {
      isValid: true,
      message: `Recent payslip`,
      monthYear: formatDateToMonthYear(payslipDate),
      type: 'success'
    }

  } catch (error) {
    return {
      isValid: false,
      message: 'Invalid date format',
      type: 'error'
    }
  }
}

/**
 * Format date to human-readable month-year (e.g., "Sep 2025")
 */
function formatDateToMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric'
  })
}

export default function SmartPayslipUploader({
  applicationId,
  payslipSlots,
  onFileUpload,
  onReprocess,
  onViewDocument,
  onDownloadDocument,
  onDeleteDocument,
  uploadingSlots,
  formatDate,
  validationResults
}: SmartPayslipUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Calculate upload stats
  const uploadedFiles = payslipSlots.filter(slot => slot.document)
  const completedFiles = payslipSlots.filter(slot =>
    slot.document?.processing_status === 'completed'
  )
  const processingFiles = payslipSlots.filter(slot =>
    slot.document && ['pending', 'classifying', 'pending_extraction', 'extracting'].includes(slot.document.processing_status)
  )
  const failedFiles = payslipSlots.filter(slot =>
    slot.document?.processing_status === 'failed'
  )

  // Get next available slot for uploading
  const getNextAvailableSlot = () => {
    const slotOrder = ['payslip_recent', 'payslip_month1', 'payslip_month2']
    return slotOrder.find(slotName =>
      !payslipSlots.find(slot => slot.slot === slotName)?.document
    )
  }

  // Get validation details for a specific slot
  const getValidationForSlot = (slotName: string) => {
    return validationResults?.details?.find(detail => detail.slot === slotName)
  }

  const toggleContainer = (containerId: string) => {
    setExpandedContainers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(containerId)) {
        newSet.delete(containerId)
      } else {
        newSet.add(containerId)
      }
      return newSet
    })
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    await handleMultipleFiles(files)
  }, [payslipSlots])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    await handleMultipleFiles(files)
    // Clear the input so the same file can be selected again
    e.target.value = ''
  }, [payslipSlots])

  const handleMultipleFiles = async (files: File[]) => {
    // Dynamic slot detection - use actual payslipSlots instead of hardcoded names
    const availableSlots = payslipSlots
      .filter(slot => !slot.document)
      .map(slot => slot.slot)

    console.log(`[SmartPayslipUploader] Dynamic slots available: ${availableSlots.join(', ')}`);

    // Upload files sequentially to available slots
    for (let i = 0; i < Math.min(files.length, availableSlots.length); i++) {
      const slot = availableSlots[i]
      const file = files[i]
      try {
        await onFileUpload(slot, file)
      } catch (error) {
        console.error(`Failed to upload file to slot ${slot}:`, error)
      }
    }
  }

  const getStatusColor = (status: string, isCritical: boolean) => {
    switch (status) {
      case 'completed':
        return 'bg-green-900/20 text-green-300 border-green-700/50'
      case 'processing':
        return 'bg-blue-900/20 text-blue-300 border-blue-700/50'
      case 'classifying':
        return 'bg-indigo-900/20 text-indigo-300 border-indigo-700/50'
      case 'pending_extraction':
        return 'bg-amber-900/20 text-amber-300 border-amber-700/50'
      case 'extracting':
        return 'bg-cyan-900/20 text-cyan-300 border-cyan-700/50'
      case 'failed':
        return 'bg-red-900/20 text-red-300 border-red-700/50'
      default:
        return 'bg-gray-900/20 text-gray-300 border-gray-700/50'
    }
  }

  const getStatusIcon = (status: string, animated: boolean = true) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />
      case 'processing':
      case 'classifying':
      case 'pending_extraction':
      case 'extracting':
        return <Brain className={`w-4 h-4 ${animated ? 'animate-spin' : ''}`} />
      case 'failed':
        return <AlertCircle className="w-4 h-4" />
      default:
        return <FileText className="w-4 h-4" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed'
      case 'classifying':
        return 'Classifying'
      case 'pending_extraction':
        return 'Awaiting Extraction'
      case 'extracting':
        return 'Extracting Data'
      case 'failed':
        return 'Failed'
      default:
        return 'Processing'
    }
  }

  // Generate dynamic overall status message based on actual payslip slots
  const getOverallStatus = () => {
    const totalRequired = payslipSlots.length // Dynamic based on actual slots
    const minValidPayslips = 3 // Business requirement: minimum 3 valid payslips
    const uploaded = uploadedFiles.length
    const completed = completedFiles.length
    const processing = processingFiles.length
    const failed = failedFiles.length

    if (uploaded === 0) {
      return `0 of ${totalRequired} payslip slots filled (${minValidPayslips} minimum required)`
    }

    // Enhanced validation status with dynamic requirements
    if (validationResults && completed === uploaded && completed > 0) {
      if (validationResults.status === 'valid') {
        return `✅ ${validationResults.count} valid payslips found - meets ${minValidPayslips} minimum requirement`
      } else {
        const validCount = validationResults.count
        const reason = validationResults.reason?.replace(/_/g, ' ') || 'validation incomplete'

        if (reason.startsWith('need_') && reason.includes('more')) {
          return `⚠️ ${validCount} valid payslips • ${reason.replace('need_', 'Upload ').replace('_payslips', ' more payslips')}`
        }
        return `⚠️ ${validCount} of ${minValidPayslips}+ valid payslips • ${reason}`
      }
    }

    if (processing > 0) {
      return `${completed} completed, ${processing} processing • ${uploaded} of ${totalRequired} slots filled`
    }

    if (failed > 0) {
      return `${completed} completed, ${failed} failed • ${uploaded} of ${totalRequired} slots filled`
    }

    if (completed >= minValidPayslips) {
      return `✅ ${completed} payslips completed - validation pending`
    }

    return `${completed} of ${totalRequired} payslips completed • ${uploaded} uploaded (${minValidPayslips} minimum needed)`
  }

  // Dynamic upload limit - can upload until all slots are filled
  const canUploadMore = uploadedFiles.length < payslipSlots.length

  return (
    <div className="bg-gray-800 border-gray-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">
            Payslips ({payslipSlots.length} slots, 3 minimum required)
          </h3>
          <p className="text-gray-400 text-sm">
            Upload your most recent monthly payslips for verification (minimum 3 consecutive months)
          </p>
        </div>
      </div>

      {/* Status Overview */}
      <div className="mb-4 p-3 bg-gray-700/50 rounded-lg">
        <p className="text-sm text-gray-300">
          {getOverallStatus()}
        </p>
      </div>

      {/* Upload Area */}
      {canUploadMore && (
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
            isDragOver
              ? "border-blue-400 bg-blue-900/10"
              : "border-gray-600 hover:border-gray-500"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="space-y-3">
            <Upload className="w-8 h-8 text-gray-500 mx-auto" />
            <div>
              <p className="text-gray-300 font-medium">
                Drop multiple payslip files here or click to browse
              </p>
              <p className="text-gray-500 text-sm mt-1">
                Supports PDF, JPEG, PNG (max 10MB each) • {payslipSlots.length - uploadedFiles.length} more slots available
              </p>
            </div>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white border-0"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="w-4 h-4 mr-2" />
              Choose Files
            </Button>
          </div>
        </div>
      )}

      {/* File List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 space-y-3">
          <h4 className="text-sm font-medium text-gray-300">Uploaded Files</h4>
          {payslipSlots
            .filter(slot => slot.document)
            .map((slot) => {
              const doc = slot.document!
              const isUploading = uploadingSlots.has(slot.slot)
              const validation = getValidationForSlot(slot.slot)
              // Client-side validation for immediate feedback
              const clientValidation = validatePayslipDateClientSide(doc)

              return (
                <div key={slot.slot} className="bg-gray-700 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span className="text-white font-medium">{doc.file_name}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(doc.processing_status, slot.is_critical)}`}>
                        {getStatusIcon(doc.processing_status, true)}
                        <span className="ml-1">{getStatusText(doc.processing_status)}</span>
                      </span>

                      {/* Unified Validation Badge (Server validation takes priority) */}
                      {doc.processing_status === 'completed' && (validation || clientValidation) && (() => {
                        // Use server validation if available, otherwise fall back to client validation
                        const validationData = validation || {
                          isValid: clientValidation!.isValid,
                          validationMessage: clientValidation!.message
                        }

                        // Simplify validation messages
                        let displayMessage = validationData.validationMessage
                        if (validationData.validationMessage.includes('too old') || validationData.validationMessage.includes('Outside')) {
                          displayMessage = 'Outdated payslip'
                        } else if (validationData.isValid) {
                          displayMessage = 'Recent payslip'
                        }

                        return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                            validationData.isValid
                              ? 'bg-green-900/20 text-green-300 border-green-700/50'
                              : 'bg-red-900/20 text-red-300 border-red-700/50'
                          }`}>
                            {validationData.isValid ? '✅' : '❌'}
                            <span className="ml-1">{displayMessage}</span>
                          </span>
                        )
                      })()}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white border-0"
                        onClick={() => onViewDocument(slot.document)}
                        title="View Document"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {doc.processing_status === 'completed' && (
                        <>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white border-0"
                            onClick={() => onDownloadDocument(slot.document)}
                            title="Download Document"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            className="bg-gray-600 hover:bg-gray-700 text-white border-0"
                            onClick={() => onReprocess(doc.id)}
                            title="Reprocess Document"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {doc.processing_status === 'failed' && (
                        <Button
                          size="sm"
                          className="bg-red-600 hover:bg-red-700 text-white border-0"
                          onClick={() => onReprocess(doc.id)}
                          title="Reprocess Document"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      )}
                      {onDeleteDocument && (
                        <Button
                          size="sm"
                          className="bg-red-600 hover:bg-red-700 text-white border-0"
                          onClick={() => onDeleteDocument(doc.id, doc.file_name)}
                          title="Remove Document from Application"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="text-sm text-gray-400 space-y-1">
                    <div>Uploaded: {formatDate(doc.uploaded_at)}</div>
                    {doc.document_type && (
                      <div>Detected Type: {doc.document_type}</div>
                    )}
                    {doc.classification_confidence > 0 && (
                      <div>Confidence: {Math.round(doc.classification_confidence * 100)}%</div>
                    )}
                    {doc.processing_status === 'failed' && doc.error_message && (
                      <div className="text-red-400">Error: {doc.error_message}</div>
                    )}
                  </div>

                  {/* Processing Status Display */}
                  {(['classifying', 'pending_extraction', 'extracting'].includes(doc.processing_status)) && (
                    <div className="mt-3 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                      <div className="flex items-center gap-2 text-blue-300">
                        {doc.processing_status === 'classifying' && (
                          <>
                            <Brain className="w-4 h-4 animate-spin" />
                            <span className="text-sm font-medium">Analyzing document type...</span>
                          </>
                        )}
                        {doc.processing_status === 'pending_extraction' && (
                          <>
                            <Brain className="w-4 h-4 animate-spin" />
                            <span className="text-sm font-medium">Document classified, preparing extraction...</span>
                          </>
                        )}
                        {doc.processing_status === 'extracting' && (
                          <>
                            <Brain className="w-4 h-4 animate-spin" />
                            <span className="text-sm font-medium">Extracting structured data from payslip...</span>
                          </>
                        )}
                      </div>
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-blue-400 mb-1">
                          <span>Processing</span>
                          <span>Live updates enabled</span>
                        </div>
                        <Progress
                          value={
                            doc.processing_status === 'classifying' ? 25 :
                            doc.processing_status === 'pending_extraction' ? 50 : 75
                          }
                          className="h-1"
                        />
                      </div>
                    </div>
                  )}

                  {/* Show extracted data for completed payslips */}
                  {doc.processing_status === 'completed' && doc.extracted_data && (
                    <>
                      {/* Check if this document contains multiple payslips */}
                      {(() => {
                        const hasMultiplePayslips = doc.extracted_data?.payslips && Array.isArray(doc.extracted_data.payslips) && doc.extracted_data.payslips.length > 1

                        console.log(`🎯 [SMART-PAYSLIP] Multi-payslip check for ${doc.id}:`, {
                          fileName: doc.file_name,
                          hasPayslipsArray: !!doc.extracted_data?.payslips,
                          isArray: Array.isArray(doc.extracted_data?.payslips),
                          payslipsCount: doc.extracted_data?.payslips?.length,
                          hasMultiplePayslips
                        })

                        if (hasMultiplePayslips) {
                          // Render individual collapsible containers for each payslip using consistent pattern
                          return (
                            <div className="mt-4 space-y-3">
                              <div className="text-sm text-green-400 mb-3 flex items-center">
                                <CheckCircle className="w-4 h-4 mr-2" />
                                {doc.extracted_data.payslips.length} Payslips Extracted
                              </div>
                              {doc.extracted_data.payslips.map((payslip: any, index: number) => (
                                <div key={`${doc.id}-payslip-${index}`} className="bg-gray-600 border border-gray-500 rounded-lg">
                                  {/* Collapsible Header */}
                                  <div
                                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-500/30 transition-colors"
                                    onClick={() => toggleContainer(`${doc.id}-payslip-${index}`)}
                                  >
                                    <div className="flex flex-col gap-2">
                                      <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-gray-400" />
                                        <span className="text-white font-medium">
                                          Payslip #{index + 1} - {payslip.pay_period || `Month ${index + 1}`}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4 text-green-400" />
                                        <span className="text-sm font-medium text-green-400">
                                          Net: {payslip.net_wages ? `MYR ${payslip.net_wages.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'}
                                        </span>
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-gray-400 hover:text-white hover:bg-gray-700"
                                    >
                                      {expandedContainers.has(`${doc.id}-payslip-${index}`) ? (
                                        <ChevronUp className="w-4 h-4" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4" />
                                      )}
                                    </Button>
                                  </div>

                                  {/* Collapsible Content */}
                                  {expandedContainers.has(`${doc.id}-payslip-${index}`) && (
                                    <div className="border-t border-gray-500">
                                      <div className="p-4">
                                        <PayslipDataDisplay data={payslip} />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )
                        } else {
                          // Render single payslip display as before
                          return <PayslipDataDisplay data={doc.extracted_data} />
                        }
                      })()}
                    </>
                  )}
                </div>
              )
            })}
        </div>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".pdf,.jpg,.jpeg,.png"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  )
}