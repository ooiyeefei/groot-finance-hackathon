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
import PayslipDataDisplay from '@/domains/invoices/components/payslip-data-display'
import { getErrorSuggestions } from '@/domains/applications/lib/error-message-transformer'

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

  // Helper function to get effective status considering both processing status and validation
  const getEffectiveStatus = (slot: PayslipFile) => {
    const doc = slot.document
    if (!doc) return 'empty'

    // If completed, check for validation errors first
    if (doc.processing_status === 'completed') {
      const validation = validationResults?.details?.find(d => d.slot === slot.slot)
      const clientValidation = validatePayslipDateClientSide(doc)

      // If there's a validation error, treat as failed
      if ((validation && !validation.isValid) || (clientValidation && !clientValidation.isValid)) {
        return 'validation_failed'
      }
    }

    return doc.processing_status
  }

  const getStatusColor = (status: string, isCritical: boolean) => {
    switch (status) {
      case 'completed':
        return 'bg-success/20 text-success border-success/30'
      case 'processing':
        return 'bg-primary/20 text-primary border-primary/30'
      case 'classifying':
        return 'bg-primary/20 text-primary border-primary/30'
      case 'pending_extraction':
        return 'bg-warning/20 text-warning border-warning/30'
      case 'extracting':
        return 'bg-primary/20 text-primary border-primary/30'
      case 'failed':
      case 'validation_failed':
        return 'bg-danger/20 text-danger border-danger/30'
      default:
        return 'bg-muted/20 text-muted-foreground border-muted/30'
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
      case 'validation_failed':
        return <X className="w-4 h-4" />
      default:
        return <FileText className="w-4 h-4" />
    }
  }

  // Helper function to get specific error type from error message
  const getErrorType = (errorMessage: string | null | undefined) => {
    if (!errorMessage) return 'Processing Failed'

    if (errorMessage.toLowerCase().includes('wrong file uploaded') || errorMessage.toLowerCase().includes('document type mismatch')) {
      return 'Incorrect Document'
    }
    if (errorMessage.toLowerCase().includes('not supported')) {
      return 'Unsupported Format'
    }
    if (errorMessage.toLowerCase().includes('classification')) {
      return 'Classification Failed'
    }
    return 'Processing Failed'
  }

  const getStatusText = (status: string, errorMessage?: string | null | undefined, slot?: PayslipFile) => {
    // Priority 1: Check for validation failures even if processing is completed
    if (status === 'completed' && slot) {
      const validation = validationResults?.details?.find(d => d.slot === slot.slot)
      const clientValidation = validatePayslipDateClientSide(slot.document)

      // If there's a validation error, show that instead of "Completed"
      if (validation && !validation.isValid) {
        return `Error: ${validation.validationMessage}`
      }
      if (clientValidation && !clientValidation.isValid) {
        return `Error: ${clientValidation.message}`
      }
    }

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
      case 'classification_failed':
        return `Failed: ${getErrorType(errorMessage)}`
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
    <div className="bg-record-layer-1 border-record-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-record-title mb-1">
            Payslips ({payslipSlots.length} slots, 3 minimum required)
          </h3>
          <p className="text-record-supporting text-sm">
            Upload your most recent monthly payslips for verification (minimum 3 consecutive months)
          </p>
        </div>
      </div>

      {/* Status Overview */}
      <div className="mb-4 p-3 bg-record-layer-2 rounded-lg">
        <p className="text-sm text-record-supporting">
          {getOverallStatus()}
        </p>
      </div>

      {/* Upload Area */}
      {canUploadMore && (
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
            isDragOver
              ? "border-primary bg-primary/10"
              : "border-border hover:border-muted-foreground"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="space-y-3">
            <Upload className="w-8 h-8 text-muted-foreground mx-auto" />
            <div>
              <p className="text-foreground font-medium">
                Drop multiple payslip files here or click to browse
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                Supports PDF, JPEG, PNG (max 10MB each) • {payslipSlots.length - uploadedFiles.length} more slots available
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="w-4 h-4 mr-2" />
              Choose Files
            </Button>
          </div>
        </div>
      )}

      {/* Uploading Progress Section - Only show for payslip-related slots */}
      {(() => {
        const payslipSlotNames = payslipSlots.map(slot => slot.slot)
        const uploadingPayslipSlots = Array.from(uploadingSlots).filter(slotName =>
          payslipSlotNames.includes(slotName)
        )

        return uploadingPayslipSlots.length > 0 && (
          <div className="mt-4 space-y-3">
            <h4 className="text-sm font-medium text-foreground">Uploading Files</h4>
            {uploadingPayslipSlots.map((slotName) => {
              const slot = payslipSlots.find(s => s.slot === slotName)
              return (
                <div key={`uploading-${slotName}`} className="bg-record-layer-2 p-4 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    <div>
                      <p className="text-primary font-medium">Uploading document...</p>
                      <p className="text-muted-foreground text-sm">Processing will begin automatically</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* File List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 space-y-3">
          <h4 className="text-sm font-medium text-foreground">Uploaded Files</h4>
          {payslipSlots
            .filter(slot => slot.document)
            .map((slot) => {
              const doc = slot.document!
              const isUploading = uploadingSlots.has(slot.slot)
              const validation = getValidationForSlot(slot.slot)
              // Client-side validation for immediate feedback
              const clientValidation = validatePayslipDateClientSide(doc)

              return (
                <div key={slot.slot} className="bg-record-layer-2 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground font-medium">{doc.file_name}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(getEffectiveStatus(slot), slot.is_critical)}`}>
                        {getStatusIcon(getEffectiveStatus(slot), true)}
                        <span className="ml-1">{getStatusText(doc.processing_status, doc.error_message, slot)}</span>
                      </span>

                      {/* Show success validation badge only for valid payslips */}
                      {doc.processing_status === 'completed' &&
                       ((validation && validation.isValid) || (clientValidation && clientValidation.isValid)) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-success/20 text-success border-success/30">
                          ✅
                          <span className="ml-1">Recent payslip</span>
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="view"
                        onClick={() => onViewDocument(slot.document)}
                        title="View Document"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {doc.processing_status === 'completed' && (
                        <>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => onDownloadDocument(slot.document)}
                            title="Download Document"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {/* ✅ PHASE 4K: Always show reprocess button for all statuses, not just failed */}
                      {(doc.processing_status === 'completed' || doc.processing_status === 'failed' || doc.processing_status === 'classification_failed') && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => onReprocess(doc.id)}
                          title="Reprocess Document"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      )}
                      {(doc.processing_status === 'failed' || doc.processing_status === 'classification_failed') && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => onReprocess(doc.id)}
                          title="Reprocess Document"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      )}
                      {onDeleteDocument && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onDeleteDocument(doc.id, doc.file_name)}
                          title="Remove Document from Application"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>Uploaded: {formatDate(doc.uploaded_at)}</div>
                    {/* Show errors for failed documents OR completed documents with validation failures */}
                    {((doc.processing_status === 'failed' || doc.processing_status === 'classification_failed') ||
                      (doc.processing_status === 'completed' && validation && !validation.isValid) ||
                      (doc.processing_status === 'completed' && clientValidation && !clientValidation.isValid)) && (
                      <div className="space-y-2">
                        <div className="text-danger flex items-start gap-2">
                          <span className="text-danger mt-0.5">🚫</span>
                          <div>
                            {/* Priority: classification error > validation error */}
                            {doc.error_message ||
                             (validation && !validation.isValid ? validation.validationMessage : '') ||
                             (clientValidation && !clientValidation.isValid ? clientValidation.message : '') ||
                             'Document processing failed. Please try uploading again.'}
                          </div>
                        </div>
                        {(() => {
                          // Enhanced contextual suggestions based on error type
                          const getContextualSuggestions = (errorMsg: string | null, slotName: string) => {
                            const msg = errorMsg?.toLowerCase() || ''

                            // Validation errors (outdated payslip)
                            if (msg.includes('outdated') || msg.includes('too old')) {
                              return [
                                'Check the payslip date to ensure it\'s from recent months',
                                'Upload a more recent payslip from the last 3 months',
                                'Verify the payslip shows current employment status'
                              ]
                            }

                            // Wrong document type errors
                            if (msg.includes('wrong file') || msg.includes('expected') || msg.includes('received')) {
                              const slotInfo = {
                                'payslip_recent': 'recent payslip',
                                'payslip_month1': 'payslip document',
                                'payslip_month2': 'payslip document'
                              }[slotName] || 'payslip'

                              return [
                                `Ensure you're uploading a ${slotInfo}`,
                                'Check that the document image is clear and readable',
                                'Verify you\'re uploading to the correct document slot'
                              ]
                            }

                            // Fallback to original function
                            return getErrorSuggestions(slotName, errorMsg)
                          }

                          const errorMsg = doc.error_message ||
                            (validation && !validation.isValid ? validation.validationMessage : '') ||
                            (clientValidation && !clientValidation.isValid ? clientValidation.message : '')

                          const suggestions = getContextualSuggestions(errorMsg, slot.slot)
                          return suggestions.length > 0 && (
                            <div className="text-muted-foreground text-xs">
                              <div className="font-medium mb-1">💡 Suggestions:</div>
                              <ul className="space-y-1">
                                {suggestions.slice(0, 3).map((suggestion, idx) => (
                                  <li key={idx} className="flex items-start gap-1">
                                    <span className="text-muted-foreground">•</span>
                                    <span>{suggestion}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Processing Status Display */}
                  {(['classifying', 'pending_extraction', 'extracting'].includes(doc.processing_status)) && (
                    <div className="mt-3 p-3 bg-primary/20 border border-primary/30 rounded-lg">
                      <div className="flex items-center gap-2 text-primary">
                        <Brain className="w-4 h-4 animate-spin" />
                        <span className="text-sm font-medium">
                          {doc.processing_status === 'classifying' && 'Analyzing document type...'}
                          {doc.processing_status === 'pending_extraction' && 'Document classified, preparing extraction...'}
                          {doc.processing_status === 'extracting' && 'Extracting data from payslip...'}
                        </span>
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
                              <div className="text-sm text-success mb-3 flex items-center">
                                <CheckCircle className="w-4 h-4 mr-2" />
                                {doc.extracted_data.payslips.length} Payslips Extracted
                              </div>
                              {doc.extracted_data.payslips.map((payslip: any, index: number) => (
                                <div key={`${doc.id}-payslip-${index}`} className="bg-record-layer-2 border border-border rounded-lg">
                                  {/* Collapsible Header */}
                                  <div
                                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent transition-colors"
                                    onClick={() => toggleContainer(`${doc.id}-payslip-${index}`)}
                                  >
                                    <div className="flex flex-col gap-2">
                                      <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-foreground font-medium">
                                          Payslip #{index + 1} - {payslip.pay_period || `Month ${index + 1}`}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4 text-success" />
                                        <span className="text-sm font-medium text-success">
                                          Net: {payslip.net_wages ? `MYR ${payslip.net_wages.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'}
                                        </span>
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
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
                                    <div className="border-t border-border">
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