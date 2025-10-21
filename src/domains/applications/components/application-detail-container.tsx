'use client'

import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import {
  ArrowLeft,
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
  Trash2,
  ChevronDown,
  ChevronUp,
  Shield,
  Edit3,
  Save,
  XCircle
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useDocumentPolling } from '@/domains/invoices/hooks/useDocumentPolling'
import { useDocumentSchema } from '@/domains/invoices/hooks/useDocumentSchema'
import { transformErrorMessage, getErrorSuggestions } from '@/domains/applications/lib/error-message-transformer'

// PERFORMANCE OPTIMIZATION: Dynamic imports for heavy components (only load when needed)
const DynamicFieldRenderer = lazy(() => import('@/domains/invoices/components/dynamic-field-renderer'))
const SmartPayslipUploader = lazy(() => import('@/domains/applications/components/smart-payslip-uploader'))
const ICDataDisplay = lazy(() => import('@/domains/invoices/components/ic-data-display'))
const ApplicationFormDataDisplay = lazy(() => import('@/domains/invoices/components/application-form-data-display'))
const PayslipDataDisplay = lazy(() => import('@/domains/invoices/components/payslip-data-display'))

// Component to display extracted data for completed documents
function ExtractedDataDisplay({ documentType, extractedData }: { documentType: string, extractedData: any }) {

  // Use specialized IC component for identity card documents
  if (documentType === 'ic') {
    return (
      <Suspense fallback={<div className="mt-4 p-4 bg-gray-700 rounded-lg animate-pulse"><div className="h-4 bg-gray-600 rounded w-1/3 mb-2"></div></div>}>
        <ICDataDisplay data={extractedData} />
      </Suspense>
    )
  }

  // Use specialized application form component for application forms
  if (documentType === 'application_form') {
    return (
      <Suspense fallback={<div className="mt-4 p-4 bg-gray-700 rounded-lg animate-pulse"><div className="h-4 bg-gray-600 rounded w-1/3 mb-2"></div></div>}>
        <ApplicationFormDataDisplay data={extractedData} />
      </Suspense>
    )
  }

  // Handle multi_payslip documents - return flag to render individual containers
  if (documentType === 'payslip' && extractedData?.payslips && Array.isArray(extractedData.payslips)) {
    // Return null here - multi-payslip will be handled separately in the parent component
    return null
  }

  // Handle single payslip documents
  if (documentType === 'payslip') {
    return (
      <Suspense fallback={<div className="mt-4 p-4 bg-gray-700 rounded-lg animate-pulse"><div className="h-4 bg-gray-600 rounded w-1/3 mb-2"></div></div>}>
        <PayslipDataDisplay data={extractedData} />
      </Suspense>
    )
  }

  // Use generic schema-based renderer for other document types
  const { schema, isLoading, error } = useDocumentSchema(documentType)

  if (isLoading) {
    return (
      <div className="mt-4 p-4 bg-gray-700 rounded-lg">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-600 rounded w-1/3 mb-2"></div>
          <div className="h-3 bg-gray-600 rounded w-2/3"></div>
        </div>
      </div>
    )
  }

  if (error || !schema) {
    return (
      <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700 rounded-lg">
        <p className="text-yellow-300 text-sm">
          Extracted data available but schema not found for display
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 p-4 bg-gray-700 rounded-lg">
      <h5 className="text-sm font-medium text-green-400 mb-3 flex items-center">
        <CheckCircle className="w-4 h-4 mr-2" />
        Extracted Data
      </h5>
      <div className="text-sm">
        <Suspense fallback={<div className="h-4 bg-gray-600 rounded w-2/3 animate-pulse"></div>}>
          <DynamicFieldRenderer
            schema={schema}
            data={extractedData}
          />
        </Suspense>
      </div>
    </div>
  )
}

interface DocumentSlot {
  slot: string
  display_name: string
  description: string
  is_critical: boolean
  document_type: string
  status: string
  group_slots?: string[]
  group_documents?: {
    id: string
    file_name: string
    storage_path: string
    converted_image_path?: string
    processing_status: string
    document_type: string
    classification_confidence: number
    error_message: string | null
    extracted_data: any
    uploaded_at: string
    updated_at: string
  }[]
  document: {
    id: string
    file_name: string
    storage_path: string
    converted_image_path?: string
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

interface ApplicationDetail {
  id: string
  title: string
  description: string
  status: string
  application_type: string
  created_at: string
  updated_at: string
  application_types: {
    display_name: string
    description: string
  }
  application_documents: any[]  // ✅ PHASE 4G: Renamed from documents
  slot_details: DocumentSlot[]
  progress_stats: {
    total_slots: number
    completed_slots: number
    critical_slots: number
    completed_critical_slots: number
    can_submit: boolean
    progress_percentage: number
  }
  validation_results?: {
    payslips?: PayslipValidationResult
  }
}

interface ApplicationDetailContainerProps {
  applicationId: string
}

export default function ApplicationDetailContainer({ applicationId }: ApplicationDetailContainerProps) {
  const locale = useLocale()
  const router = useRouter()
  const [application, setApplication] = useState<ApplicationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadingSlots, setUploadingSlots] = useState<Set<string>>(new Set())
  const [deletingDocument, setDeletingDocument] = useState<string | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ documentId: string; fileName: string } | null>(null)
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set())
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({})

  // Memoized callback for polling updates - background refresh without loading spinner
  const handlePollingUpdate = useCallback(() => {
    fetchApplicationDetail(false) // Don't show loading spinner for background updates
  }, [])

  // Check if there are documents currently processing - be more strict about processing states
  const hasProcessingDocuments = application?.slot_details?.some(slot => {
    if (!slot.document) return false
    const status = slot.document.processing_status
    return status === 'pending' || status === 'classifying' || status === 'pending_extraction' || status === 'extracting'
  }) || false

  // Helper to get document processing status for slot
  const getDocumentProcessingStatus = (slot: DocumentSlot) => {
    if (!slot.document) return 'empty'

    const status = slot.document.processing_status
    switch (status) {
      case 'completed':
        return 'completed'
      case 'failed':
      case 'classification_failed':
        return 'failed'
      case 'pending':
        return 'pending'
      case 'classifying':
        return 'classifying'
      case 'pending_extraction':
        return 'pending_extraction'
      case 'extracting':
        return 'extracting'
      default:
        // ✅ PHASE 4K: Trust processing_status field - don't check extracted_data
        // During reprocessing, old extracted_data may exist but status is not 'completed'
        if (slot.document.error_message) {
          return 'failed'
        } else {
          // Unknown status but no error - assume still processing
          return 'processing'
        }
    }
  }

  // Setup intelligent auto-refresh for document processing status
  const { isPolling } = useDocumentPolling({
    applicationId,
    enabled: !loading && hasProcessingDocuments,
    onUpdate: handlePollingUpdate,
    pollingInterval: hasProcessingDocuments ? 30000 : 60000, // 30s for processing, 60s for idle
    maxPollingTime: 600000 // 10 minutes
  })

  // Add comprehensive debug logging to understand data flow
  useEffect(() => {
    if (application) {
      console.log('🔍 [DEBUG] Application data loaded:', {
        applicationId: application.id,
        totalDocuments: application.application_documents?.length || 0,
        totalSlots: application.slot_details?.length || 0,
        documents: application.application_documents?.map(doc => ({
          id: doc.id,
          filename: doc.file_name,
          document_type: doc.document_type,
          document_slot: doc.document_slot,
          processing_status: doc.processing_status,
          hasExtractedData: !!doc.extracted_data,
          hasPayslipsArray: !!doc.extracted_data?.payslips,
          payslipsCount: doc.extracted_data?.payslips?.length || 0
        })),
        slot_details: application.slot_details?.map(slot => ({
          slot: slot.slot,
          document_type: slot.document_type,
          hasDocument: !!slot.document,
          documentId: slot.document?.id,
          hasGroupDocuments: !!slot.group_documents
        }))
      })
    }
  }, [application])

  useEffect(() => {
    fetchApplicationDetail()
  }, [applicationId])

  const fetchApplicationDetail = async (showLoading: boolean = true) => {
    try {
      if (showLoading) {
        setLoading(true)
      }
      const response = await fetch(`/api/v1/applications/${applicationId}`)
      const result = await response.json()

      if (result.success) {
        setApplication(result.data)
      } else {
        setError('Failed to fetch application details')
      }
    } catch (err) {
      console.error('Error fetching application:', err)
      setError('An error occurred while fetching application details')
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }

  const handleFileUpload = async (slot: string, file: File) => {
    if (!file) return

    setUploadingSlots(prev => new Set(prev).add(slot))

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('slot', slot)

      const response = await fetch(`/api/v1/applications/${applicationId}/documents`, {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (result.success) {
        // Refresh application details to get updated slot status
        await fetchApplicationDetail()
      } else {
        setError(result.error || 'Failed to upload document')
      }
    } catch (err) {
      console.error('Error uploading document:', err)
      setError('An error occurred while uploading the document')
    } finally {
      setUploadingSlots(prev => {
        const newSet = new Set(prev)
        newSet.delete(slot)
        return newSet
      })
    }
  }

  const handleReprocess = async (documentId: string) => {
    try {
      setError(null)
      // Use application-specific process endpoint for slot validation and context
      const response = await fetch(`/api/v1/applications/${applicationId}/documents/${documentId}/process`, {
        method: 'POST'
      })

      const result = await response.json()

      if (result.success) {
        // Refresh application details to get updated processing status
        await fetchApplicationDetail()
      } else {
        setError(result.error || 'Failed to reprocess document')
      }
    } catch (err) {
      console.error('Error reprocessing document:', err)
      setError('An error occurred while reprocessing the document')
    }
  }

  const handleViewDocument = async (document: DocumentSlot['document']) => {
    if (!document) return

    try {
      // Always show the original raw file from storage_path in database
      let storagePath = document.storage_path

      // Improved fallback logic: use converted_image_path if storage_path is missing
      if (!storagePath) {
        console.warn('Document storage_path is missing, trying converted_image_path fallback')
        if (document.converted_image_path) {
          // Use converted images as fallback (better than broken applications path)
          storagePath = document.converted_image_path
          console.warn('Using converted_image_path as fallback for viewing raw document')
        } else {
          console.error('Both storage_path and converted_image_path are missing for document:', document.id)
          throw new Error('Document paths are missing - cannot view document')
        }
      }

      // Use the unified image-url endpoint with useRawFile parameter
      const response = await fetch(`/api/v1/invoices/${document.id}/image-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath,
          documentId: document.id,
          useRawFile: true, // Request raw file instead of converted image
          bucketName: 'application_documents' // ✅ PHASE 4J: Route to application_documents bucket
        })
      })

      const result = await response.json()

      if (result.success && result.imageUrl) {
        window.open(result.imageUrl, '_blank')
      } else {
        setError(result.error || 'Failed to generate document URL')
      }
    } catch (err) {
      console.error('Error viewing document:', err)
      setError('An error occurred while viewing the document')
    }
  }

  const handleDownloadDocument = async (document: DocumentSlot['document']) => {
    if (!document) return

    try {
      // Always download the original raw file from storage_path in database
      let storagePath = document.storage_path

      // Improved fallback logic: use converted_image_path if storage_path is missing
      if (!storagePath) {
        console.warn('Document storage_path is missing, trying converted_image_path fallback')
        if (document.converted_image_path) {
          // Use converted images as fallback (better than broken applications path)
          storagePath = document.converted_image_path
          console.warn('Using converted_image_path as fallback for downloading document')
        } else {
          console.error('Both storage_path and converted_image_path are missing for document:', document.id)
          throw new Error('Document paths are missing - cannot download document')
        }
      }

      const response = await fetch(`/api/v1/invoices/${document.id}/image-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath,
          documentId: document.id,
          useRawFile: true, // Request raw file for download
          bucketName: 'application_documents' // ✅ PHASE 4J: Route to application_documents bucket
        })
      })

      const result = await response.json()
      if (result.success && result.imageUrl) {
        // Create a temporary link to download the file
        const link = window.document.createElement('a')
        link.href = result.imageUrl
        link.download = document.file_name
        window.document.body.appendChild(link)
        link.click()
        window.document.body.removeChild(link)
      } else {
        setError(result.error || 'Failed to generate download URL')
      }
    } catch (err) {
      console.error('Error downloading document:', err)
      setError('An error occurred while downloading the document')
    }
  }

  const handleDeleteDocument = async (documentId: string) => {
    try {
      setDeletingDocument(documentId)

      // Use application-specific document disassociation endpoint
      const response = await fetch(`/api/v1/applications/${applicationId}/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (result.success) {
        // Refresh application details to update the UI
        await fetchApplicationDetail()
        setDeleteConfirmation(null)
        console.log('Document disassociated successfully:', result.preserved_file)
      } else {
        console.error('Document disassociation failed:', result.error)
        setError(`Failed to remove document: ${result.error}`)
      }
    } catch (error) {
      console.error('Error removing document from application:', error)
      setError('Failed to remove document. Please try again.')
    } finally {
      setDeletingDocument(null)
    }
  }

  const confirmDeleteDocument = (documentId: string, fileName: string) => {
    setDeleteConfirmation({ documentId, fileName })
  }

  const handleStartEditTitle = () => {
    if (application) {
      setEditedTitle(application.title)
      setIsEditingTitle(true)
    }
  }

  const handleCancelEditTitle = () => {
    setIsEditingTitle(false)
    setEditedTitle('')
  }

  const handleSaveTitle = async () => {
    if (!application || !editedTitle.trim() || editedTitle.trim() === application.title) {
      handleCancelEditTitle()
      return
    }

    setSavingTitle(true)
    try {
      const response = await fetch(`/api/v1/applications/${applicationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: editedTitle.trim()
        })
      })

      const result = await response.json()

      if (result.success) {
        setApplication(prev => prev ? { ...prev, title: editedTitle.trim() } : null)
        setIsEditingTitle(false)
        setEditedTitle('')
      } else {
        setError(result.error || 'Failed to update application title')
      }
    } catch (err) {
      console.error('Error updating application title:', err)
      setError('An error occurred while updating the application title')
    } finally {
      setSavingTitle(false)
    }
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

  const getSlotStatusColor = (status: string, isCritical: boolean) => {
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
      case 'error':
      case 'classification_failed':
      case 'failed':
        return 'bg-red-900/20 text-red-300 border-red-700/50'
      case 'empty':
        return isCritical ? 'bg-orange-900/20 text-orange-300 border-orange-700/50' : 'bg-gray-900/20 text-gray-300 border-gray-700/50'
      default:
        return 'bg-gray-900/20 text-gray-300 border-gray-700/50'
    }
  }

  const getSlotStatusIcon = (status: string, animated: boolean = true) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />
      case 'processing':
      case 'classifying':
      case 'pending_extraction':
      case 'extracting':
        return <Brain className={`w-4 h-4 ${animated ? 'animate-spin' : ''}`} />
      case 'error':
      case 'classification_failed':
      case 'failed':
        return <AlertCircle className="w-4 h-4" />
      case 'empty':
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

  const getSlotStatusText = (status: string, isCritical: boolean, errorMessage?: string | null | undefined) => {
    switch (status) {
      case 'completed':
        return 'Completed'
      case 'processing':
        return 'Processing'
      case 'classifying':
        return 'Classifying Document'
      case 'pending_extraction':
        return 'Awaiting Extraction'
      case 'extracting':
        return 'Extracting Data'
      case 'error':
      case 'classification_failed':
      case 'failed':
        return `Failed: ${getErrorType(errorMessage)}`
      case 'empty':
        return isCritical ? 'Required' : 'Optional'
      default:
        return 'Unknown'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-32 bg-gray-700 rounded mb-6"></div>
          <div className="grid grid-cols-1 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-40 bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-red-400 mb-4">{error}</p>
        <div className="flex gap-4 justify-center">
          <Link href={`/${locale}/applications`}>
            <Button variant="outline" className="bg-gray-700 text-white border-gray-600 hover:bg-gray-600 hover:border-gray-500">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Applications
            </Button>
          </Link>
          <Button onClick={() => fetchApplicationDetail()} className="bg-blue-600 hover:bg-blue-700 text-white">
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  if (!application) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-gray-500 mx-auto mb-4" />
        <p className="text-gray-400">Application not found</p>
        <Link href={`/${locale}/applications`}>
          <Button variant="outline" className="mt-4 text-gray-300 border-gray-600 hover:border-gray-500">
            Back to Applications
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/${locale}/applications`}>
          <Button variant="outline" size="sm" className="bg-gray-700 text-white border-gray-600 hover:bg-gray-600 hover:border-gray-500">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          {isEditingTitle ? (
            <div className="flex items-center gap-3">
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="text-2xl font-bold bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                placeholder="Enter application title"
                maxLength={100}
                disabled={savingTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveTitle()
                  } else if (e.key === 'Escape') {
                    handleCancelEditTitle()
                  }
                }}
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveTitle}
                  disabled={savingTitle || !editedTitle.trim()}
                  className="bg-green-600 hover:bg-green-700 text-white border-0"
                >
                  {savingTitle ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={handleCancelEditTitle}
                  disabled={savingTitle}
                  className="bg-gray-600 hover:bg-gray-700 text-white border-0"
                >
                  <XCircle className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{application.title}</h1>
              <Button
                size="sm"
                onClick={handleStartEditTitle}
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 border-gray-600 hover:border-gray-500"
                title="Edit application title"
              >
                <Edit3 className="w-4 h-4" />
              </Button>
            </div>
          )}
          <p className="text-gray-400 mt-1">{application.application_types.display_name}</p>
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white border-0"
          onClick={() => router.push(`/${locale}/applications/${applicationId}/summary`)}
        >
          <FileText className="w-4 h-4 mr-2" />
          View Summary
        </Button>
      </div>

      {/* Progress Overview */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Application Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-300">Overall Progress</span>
              <span className="text-gray-300">
                {application.progress_stats.completed_slots} of {application.progress_stats.total_slots} documents
              </span>
            </div>
            <Progress value={application.progress_stats.progress_percentage} className="h-3" />

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-gray-700 p-4 rounded-lg">
                <div className="text-sm text-gray-400">Critical Documents</div>
                <div className="text-lg font-semibold text-white">
                  {application.progress_stats.completed_critical_slots} / {application.progress_stats.critical_slots}
                </div>
                <div className="text-xs text-gray-500">Required for submission</div>
              </div>
              <div className="bg-gray-700 p-4 rounded-lg">
                <div className="text-sm text-gray-400">Submission Status</div>
                <div className="text-lg font-semibold text-white">
                  {application.progress_stats.can_submit ? 'Ready' : 'Incomplete'}
                </div>
                <div className="text-xs text-gray-500">
                  {application.progress_stats.can_submit ? 'All required documents uploaded' : 'Upload critical documents to submit'}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Slots */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">Required Documents</h2>

        {/* Smart Payslip Uploader */}
        {(() => {
          console.log('🎯 [PAYSLIP-UPLOADER] Checking for payslip group slots...')
          console.log('📊 [PAYSLIP-UPLOADER] All slot_details:', application.slot_details.map(slot => ({
            slot: slot.slot,
            document_type: slot.document_type,
            hasDocument: !!slot.document,
            documentId: slot.document?.id,
            hasPayslipsArray: !!slot.document?.extracted_data?.payslips,
            payslipsCount: slot.document?.extracted_data?.payslips?.length
          })))

          // Check for the payslip group document type
          const payslipGroupSlot = application.slot_details.find(slot =>
            slot.document_type === 'payslip_group'
          )

          console.log('🔍 [PAYSLIP-UPLOADER] Found payslipGroupSlot:', payslipGroupSlot)

          if (payslipGroupSlot && payslipGroupSlot.group_documents) {
            console.log('✅ [PAYSLIP-UPLOADER] payslipGroupSlot has group_documents:', payslipGroupSlot.group_documents.length)
            console.log('📄 [PAYSLIP-UPLOADER] group_documents details:', payslipGroupSlot.group_documents.map(doc => ({
              id: doc.id,
              fileName: doc.file_name,
              documentType: doc.document_type,
              processingStatus: doc.processing_status,
              hasExtractedData: !!doc.extracted_data,
              hasPayslipsArray: !!doc.extracted_data?.payslips,
              payslipsCount: doc.extracted_data?.payslips?.length
            })))

            // Convert group documents back to individual slot format for the uploader
            const payslipSlots = payslipGroupSlot.group_slots?.map(slotName => {
              const doc = payslipGroupSlot.group_documents?.find((groupDoc: any) =>
                application.application_documents.find((appDoc: any) =>
                  appDoc.id === groupDoc.id && appDoc.document_slot === slotName
                )
              )

              return {
                slot: slotName,
                display_name: slotName === 'payslip_recent' ? 'Most Recent Payslip' :
                             slotName === 'payslip_month1' ? 'Previous Month Payslip' :
                             'Two Months Prior Payslip',
                description: `Payslip for ${slotName.replace('payslip_', '')}`,
                is_critical: true,
                document_type: 'payslip',
                status: doc?.processing_status || 'empty',
                document: doc || null
              }
            }) || []

            return (
              <Suspense fallback={<div className="bg-gray-800 border-gray-700 rounded-lg p-6 animate-pulse"><div className="h-32 bg-gray-700 rounded"></div></div>}>
                <SmartPayslipUploader
                  applicationId={applicationId}
                  payslipSlots={payslipSlots}
                  onFileUpload={handleFileUpload}
                  onReprocess={handleReprocess}
                  onViewDocument={handleViewDocument}
                  onDownloadDocument={handleDownloadDocument}
                  onDeleteDocument={confirmDeleteDocument}
                  uploadingSlots={uploadingSlots}
                  formatDate={formatDate}
                  validationResults={application.validation_results?.payslips}
                />
              </Suspense>
            )
          }

          // Fallback: check for individual payslip slots (old format)
          const payslipSlots = application.slot_details.filter(slot =>
            ['payslip_recent', 'payslip_month1', 'payslip_month2'].includes(slot.slot)
          )

          if (payslipSlots.length > 0) {
            return (
              <Suspense fallback={<div className="bg-gray-800 border-gray-700 rounded-lg p-6 animate-pulse"><div className="h-32 bg-gray-700 rounded"></div></div>}>
                <SmartPayslipUploader
                  applicationId={applicationId}
                  payslipSlots={payslipSlots}
                  onFileUpload={handleFileUpload}
                  onReprocess={handleReprocess}
                  onViewDocument={handleViewDocument}
                  onDownloadDocument={handleDownloadDocument}
                  onDeleteDocument={confirmDeleteDocument}
                  uploadingSlots={uploadingSlots}
                  formatDate={formatDate}
                  validationResults={application.validation_results?.payslips}
                />
              </Suspense>
            )
          }
          return null
        })()}

        {/* Other Document Slots (non-payslip) */}
        {(() => {
          console.log('📋 [OTHER-SLOTS] Processing individual document containers...')
          const filteredSlots = application.slot_details
            .filter(slot =>
              !['payslip_recent', 'payslip_month1', 'payslip_month2'].includes(slot.slot) &&
              slot.document_type !== 'payslip_group'
            )

          console.log('🔄 [OTHER-SLOTS] Filtered slots for individual containers:', filteredSlots.map(slot => ({
            slot: slot.slot,
            document_type: slot.document_type,
            hasDocument: !!slot.document,
            documentId: slot.document?.id,
            hasPayslipsArray: !!slot.document?.extracted_data?.payslips,
            payslipsCount: slot.document?.extracted_data?.payslips?.length,
            processingStatus: slot.document?.processing_status
          })))

          console.log('🎨 [OTHER-SLOTS] About to render', filteredSlots.length, 'individual containers')

          return filteredSlots.map((slot) => (
          <Card key={slot.slot} className="bg-gray-800 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">{slot.display_name}</h3>
                    {(() => {
                      const status = getDocumentProcessingStatus(slot)
                      return (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSlotStatusColor(status, slot.is_critical)}`}>
                          {getSlotStatusIcon(status, true)}
                          <span className="ml-1">{getSlotStatusText(status, slot.is_critical, slot.document?.error_message)}</span>
                        </span>
                      )
                    })()}
                  </div>
                  <p className="text-gray-400 text-sm mb-2">{slot.description}</p>
                </div>
              </div>

              {/* Document Content */}
              {slot.document ? (
                <div className="rounded-lg">
                  {/* Special handling for documents with multiple payslips - render individual containers */}
                  {(() => {
                    const hasMultiplePayslips = slot.document.extracted_data?.payslips && Array.isArray(slot.document.extracted_data.payslips) && slot.document.extracted_data.payslips.length > 1
                    console.log(`🔍 [MULTI-PAYSLIP] Checking document ${slot.document.id}:`, {
                      fileName: slot.document.file_name,
                      documentType: slot.document.document_type,
                      documentSlot: 'N/A', // document_slot not available in this context
                      processingStatus: slot.document.processing_status,
                      hasExtractedData: !!slot.document.extracted_data,
                      extractedDataKeys: slot.document.extracted_data ? Object.keys(slot.document.extracted_data) : [],
                      hasPayslipsArray: !!slot.document.extracted_data?.payslips,
                      isArray: Array.isArray(slot.document.extracted_data?.payslips),
                      payslipsCount: slot.document.extracted_data?.payslips?.length,
                      hasMultiplePayslips,
                      // Show first few characters of extracted_data for debugging
                      extractedDataPreview: slot.document.extracted_data ? JSON.stringify(slot.document.extracted_data).substring(0, 200) + '...' : 'null'
                    })
                    return hasMultiplePayslips
                  })() ? (
                    <div className="space-y-4">
                      {/* Header for multi-payslip container */}
                      <div className="bg-gray-600 border border-gray-500 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileText className="w-4 h-4 text-gray-400" />
                            <span className="text-white font-medium">{slot.document.file_name}</span>
                            <CheckCircle className="w-4 h-4 text-green-400" />
                            <span className="text-sm font-medium text-green-400">
                              {slot.document.extracted_data.payslips.length} Payslips Extracted
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white border-0"
                              onClick={() => handleViewDocument(slot.document)}
                              title="View Document"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white border-0"
                              onClick={() => handleDownloadDocument(slot.document)}
                              title="Download Document"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              className="bg-gray-600 hover:bg-gray-700 text-white border-0"
                              onClick={() => slot.document && handleReprocess(slot.document.id)}
                              title="Reprocess Document"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white border-0"
                              onClick={() => slot.document && confirmDeleteDocument(slot.document.id, slot.document.file_name)}
                              disabled={deletingDocument === slot.document?.id}
                              title="Remove Document from Application"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Individual payslip containers */}
                      {slot.document.extracted_data.payslips.map((payslip: any, index: number) => (
                        <div key={`${slot.document?.id}-payslip-${index}`} className="bg-gray-600 border border-gray-500 rounded-lg">
                          <div
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-500/30 transition-colors"
                            onClick={() => toggleContainer(`${slot.document?.id}-payslip-${index}`)}
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
                              {expandedContainers.has(`${slot.document?.id}-payslip-${index}`) ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </Button>
                          </div>

                          {/* Collapsible Content for Individual Payslip */}
                          {expandedContainers.has(`${slot.document?.id}-payslip-${index}`) && (
                            <div className="border-t border-gray-500">
                              <div className="p-4">
                                <Suspense fallback={<div className="h-16 bg-gray-600 rounded animate-pulse"></div>}>
                                  <PayslipDataDisplay data={payslip} />
                                </Suspense>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : slot.document.processing_status === 'completed' && slot.document.extracted_data ? (
                    <div className="bg-gray-600 border border-gray-500 rounded-lg">
                      {/* Combined Header with Filename and Actions */}
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-500/30 transition-colors"
                        onClick={() => toggleContainer(slot.document?.id || '')}
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-400" />
                            <span className="text-white font-medium">{slot.document.file_name}</span>
                          </div>
                          {/* Extracted Status - Show above collapsible region */}
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-400" />
                            <span className="text-sm font-medium text-green-400">
                              {slot.document.document_type === 'ic' && 'Identity Card Data Extracted'}
                              {slot.document.document_type === 'application_form' && 'Application Form Data Extracted'}
                              {(slot.document.document_type === 'payslip' || slot.document.document_type === 'multi_payslip') && 'Payslip Data Extracted'}
                              {!['ic', 'application_form', 'payslip', 'multi_payslip'].includes(slot.document.document_type) && 'Data Extracted'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-2 mr-4">
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white border-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleViewDocument(slot.document)
                              }}
                              title="View Document"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white border-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDownloadDocument(slot.document)
                              }}
                              title="Download Document"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              className="bg-gray-600 hover:bg-gray-700 text-white border-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                slot.document && handleReprocess(slot.document.id)
                              }}
                              title="Reprocess Document"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white border-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                slot.document && confirmDeleteDocument(slot.document.id, slot.document.file_name)
                              }}
                              disabled={deletingDocument === slot.document?.id}
                              title="Remove Document from Application"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-400 hover:text-white hover:bg-gray-700"
                          >
                            {expandedContainers.has(slot.document?.id || '') ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Collapsible Content */}
                      {expandedContainers.has(slot.document?.id || '') && (
                        <div className="border-t border-gray-500">
                          <div className="p-4">
                            <div className="text-sm text-gray-400 mb-4">
                              <div>Uploaded: {formatDate(slot.document.uploaded_at)}</div>
                            </div>
                            <ExtractedDataDisplay
                              documentType={slot.document.document_type}
                              extractedData={slot.document.extracted_data}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Non-collapsible version for processing/failed documents
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="text-white font-medium">{slot.document.file_name}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white border-0"
                            onClick={() => handleViewDocument(slot.document)}
                            title="View Document"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {slot.document.processing_status === 'completed' && (
                            <>
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white border-0"
                                onClick={() => handleDownloadDocument(slot.document)}
                                title="Download Document"
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                className="bg-gray-600 hover:bg-gray-700 text-white border-0"
                                onClick={() => slot.document && handleReprocess(slot.document.id)}
                                title="Reprocess Document"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            className="bg-red-600 hover:bg-red-700 text-white border-0"
                            onClick={() => slot.document && confirmDeleteDocument(slot.document.id, slot.document.file_name)}
                            disabled={deletingDocument === slot.document?.id}
                            title="Remove Document from Application"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="text-sm text-gray-400 space-y-1">
                        <div>Uploaded: {formatDate(slot.document.uploaded_at)}</div>
                        {(slot.document.processing_status === 'failed' || slot.document.processing_status === 'classification_failed') && (
                          <div className="space-y-2">
                            <div className="text-red-400 flex items-start gap-2">
                              <span className="text-red-400 mt-0.5">🚫</span>
                              <div>
                                {slot.document.error_message || 'Document processing failed. Please try uploading again.'}
                              </div>
                            </div>
                            {(() => {
                              // Enhanced contextual suggestions based on error type
                              const getContextualSuggestions = (errorMsg: string | null, slotName: string) => {
                                const msg = errorMsg?.toLowerCase() || ''

                                // Wrong document type errors
                                if (msg.includes('wrong file') || msg.includes('expected') || msg.includes('received')) {
                                  const slotInfo = {
                                    'identity_card': 'identity card (IC)',
                                    'bank_application_form': 'completed bank application form',
                                    'application_form': 'application form'
                                  }[slotName] || 'correct document'

                                  return [
                                    `Ensure you're uploading a ${slotInfo}`,
                                    'Check that the document image is clear and readable',
                                    'Verify you\'re uploading to the correct document slot'
                                  ]
                                }

                                // Document quality/processing errors
                                if (msg.includes('classification') || msg.includes('processing')) {
                                  return [
                                    'Check that the document image is clear and readable',
                                    'Verify the file is in PDF, JPG, or PNG format',
                                    'Make sure the file size is under 10MB'
                                  ]
                                }

                                // Fallback to original function
                                return getErrorSuggestions(slotName, errorMsg)
                              }

                              const suggestions = getContextualSuggestions(slot.document.error_message, slot.slot)
                              return suggestions.length > 0 && (
                                <div className="text-gray-400 text-xs">
                                  <div className="font-medium mb-1">💡 Suggestions:</div>
                                  <ul className="space-y-1">
                                    {suggestions.slice(0, 3).map((suggestion, idx) => (
                                      <li key={idx} className="flex items-start gap-1">
                                        <span className="text-gray-500">•</span>
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
                      {(['classifying', 'pending_extraction', 'extracting'].includes(slot.document.processing_status)) && (
                        <div className="mt-3 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                          <div className="flex items-center gap-2 text-blue-300">
                            {slot.document.processing_status === 'classifying' && (
                              <>
                                <Brain className="w-4 h-4 animate-spin" />
                                <span className="text-sm font-medium">Analyzing document type...</span>
                              </>
                            )}
                            {slot.document.processing_status === 'pending_extraction' && (
                              <>
                                <Brain className="w-4 h-4 animate-spin" />
                                <span className="text-sm font-medium">Document classified, preparing extraction...</span>
                              </>
                            )}
                            {slot.document.processing_status === 'extracting' && (
                              <>
                                <Brain className="w-4 h-4 animate-spin" />
                                <span className="text-sm font-medium">Extracting structured data from document...</span>
                              </>
                            )}
                          </div>
                          <div className="mt-2">
                            <div className="flex justify-between text-xs text-blue-400 mb-1">
                              <span>Processing</span>
                              <span>{isPolling ? 'Live updates enabled' : 'Refreshing...'}</span>
                            </div>
                            <Progress value={slot.document.processing_status === 'classifying' ? 25 : slot.document.processing_status === 'pending_extraction' ? 50 : 75} className="h-1" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {(slot.document.processing_status === 'failed' || slot.document.processing_status === 'classification_failed') && (
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white border-0"
                        onClick={() => slot.document && handleReprocess(slot.document.id)}
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reprocess
                      </Button>
                      <Button
                        size="sm"
                        className="bg-gray-600 hover:bg-gray-700 text-white border-0"
                        onClick={() => fileInputRefs.current[slot.slot]?.click()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Replace Document
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center">
                  {uploadingSlots.has(slot.slot) ? (
                    <div className="space-y-3">
                      <Loader2 className="w-8 h-8 text-blue-400 mx-auto animate-spin" />
                      <div>
                        <p className="text-blue-300 font-medium">Uploading document...</p>
                        <p className="text-gray-400 text-sm mt-1">Processing will begin automatically</p>
                      </div>
                      <div className="max-w-xs mx-auto">
                        <Progress value={65} className="h-2" />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-8 h-8 text-gray-500 mx-auto" />
                      <p className="text-gray-400">Upload {slot.display_name.toLowerCase()}</p>
                      <p className="text-gray-500 text-sm">Supports PDF, JPEG, PNG (max 10MB)</p>
                      <Button
                        className="mt-3 bg-blue-600 hover:bg-blue-700 text-white border-0"
                        onClick={() => fileInputRefs.current[slot.slot]?.click()}
                      >
                        Choose File
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Hidden file input */}
              <input
                type="file"
                ref={(el) => {
                  fileInputRefs.current[slot.slot] = el
                }}
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    handleFileUpload(slot.slot, file)
                  }
                  // Clear the input value to allow re-selecting the same file
                  if (e.target) {
                    e.target.value = ''
                  }
                }}
              />
            </CardContent>
          </Card>
        ))
        })()}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 pt-6">
        {/* Smart Auto-Refresh Status */}
        {isPolling ? (
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-900/30 border border-blue-700 rounded-lg">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            <RefreshCw className="w-4 h-4 text-blue-300 animate-spin" />
            <span className="text-blue-300 text-sm">
              {hasProcessingDocuments
                ? 'Auto-refresh active - monitoring document processing'
                : 'Auto-refresh active - checking for updates'
              }
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg">
            <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
            <span className="text-gray-400 text-sm">Auto-refresh paused - all documents processed</span>
            <Button
              onClick={() => fetchApplicationDetail()}
              variant="outline"
              size="sm"
              className="ml-2 bg-gray-700 text-white border-gray-600 hover:bg-gray-600 hover:border-gray-500"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Check Now
            </Button>
          </div>
        )}


        {application.progress_stats.can_submit && (
          <Button className="bg-green-600 hover:bg-green-700 text-white border-0">
            <CheckCircle className="w-4 h-4 mr-2" />
            Submit Application
          </Button>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-500 mr-3" />
              <h3 className="text-lg font-semibold text-white">Remove Document</h3>
            </div>
            <p className="text-gray-300 mb-6">
              Are you sure you want to remove "<strong>{deleteConfirmation.fileName}</strong>" from this application?
              The document will be preserved in storage but removed from this application, allowing you to upload a replacement.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setDeleteConfirmation(null)}
                className="bg-gray-600 hover:bg-gray-700 text-white border-0"
                disabled={deletingDocument === deleteConfirmation.documentId}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleDeleteDocument(deleteConfirmation.documentId)}
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={deletingDocument === deleteConfirmation.documentId}
              >
                {deletingDocument === deleteConfirmation.documentId ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Removing...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove Document
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}