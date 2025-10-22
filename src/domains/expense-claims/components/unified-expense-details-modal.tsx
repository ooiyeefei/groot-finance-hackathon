/**
 * Unified Expense Details Modal
 * Comprehensive view of expense claim with document processing and approval functionality
 * Combines personal view comprehensive details with manager approval actions
 */

'use client'

import { useState, useEffect } from 'react'
import {
  X,
  FileText,
  Calendar,
  Building,
  DollarSign,
  Tag,
  User,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Receipt,
  Image as ImageIcon,
  Loader2,
  Eye,
  Copy
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import DocumentPreviewWithAnnotations from '@/domains/invoices/components/document-preview-with-annotations'

interface UnifiedExpenseDetailsModalProps {
  claimId: string
  isOpen: boolean
  onClose: () => void
  viewMode: 'personal' | 'manager'
  // Manager-specific callbacks
  onApprove?: (claimId: string, notes?: string) => Promise<void>
  onReject?: (claimId: string, notes?: string) => Promise<void>
  onRefreshNeeded?: () => void
}

interface ClaimDetails {
  id: string
  status: string // ✅ Unified status field
  status_display?: {
    label: string
    color: string
    description: string
  }
  workflow_progress?: number
  created_at: string
  updated_at: string
  current_approver_name?: string
  // Direct fields from expense_claims table
  vendor_name?: string
  total_amount?: string
  currency?: string
  transaction_date?: string
  reference_number?: string
  business_purpose?: string
  expense_category?: string
  storage_path?: string
  transaction?: {
    description: string
    business_purpose: string
    expense_category: string
    original_amount: string
    original_currency: string
    home_currency_amount?: string
    home_currency?: string
    transaction_date: string
    vendor_name: string
    reference_number?: string
    notes?: string
    line_items?: Array<{
      id: string
      item_description: string
      quantity: number
      unit_price: string
      total_amount: string
    }>
  }
  document?: {
    id: string
    original_filename: string
    file_type: string
    ocr_processing_status: string
    processing_progress?: number
    extracted_data?: any
    annotated_image_url?: string
    storage_path?: string
  }
  // Manager view fields
  employee_name?: string
  has_receipt?: boolean
}

export default function UnifiedExpenseDetailsModal({
  claimId,
  isOpen,
  onClose,
  viewMode,
  onApprove,
  onReject,
  onRefreshNeeded
}: UnifiedExpenseDetailsModalProps) {
  const [claimDetails, setClaimDetails] = useState<ClaimDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDocument, setShowDocument] = useState(false)
  const [categories, setCategories] = useState<Array<{business_category_code: string, business_category_name: string}>>([])
  const [signedImageUrl, setSignedImageUrl] = useState<string | null>(null)
  const [imageLoading, setImageLoading] = useState(false)
  const [approvalNotes, setApprovalNotes] = useState('')
  const [processing, setProcessing] = useState(false)

  // Fetch categories on component mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/v1/expense-claims/categories')
        const result = await response.json()

        if (result.success && result.data.categories) {
          setCategories(result.data.categories)
        }
      } catch (error) {
        console.error('[Unified Modal] Failed to fetch categories:', error)
      }
    }

    if (isOpen) {
      fetchCategories()
    }
  }, [isOpen])

  // Fetch claim details
  useEffect(() => {
    if (isOpen && claimId) {
      fetchClaimDetails()
    }
  }, [isOpen, claimId])

  // Generate signed URL when claim details are loaded
  useEffect(() => {
    const generateSignedUrl = async () => {
      if (!claimDetails?.storage_path) {
        console.log('🔍 [Unified Modal] No storage_path available:', claimDetails?.storage_path)
        return
      }

      try {
        setImageLoading(true)
        console.log('🔍 [Unified Modal] Generating signed URL for storage path:', claimDetails.storage_path)

        const response = await fetch(`/api/v1/expense-claims/${claimDetails.id}/image-url?useRawFile=true&storagePath=${encodeURIComponent(claimDetails.storage_path)}`, {
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
          console.log('✅ [Unified Modal] Generated signed URL:', imageUrl)
          setSignedImageUrl(imageUrl)
        } else {
          console.error('❌ [Unified Modal] No imageUrl found in response:', result)
          setSignedImageUrl(null)
        }
      } catch (error) {
        console.error('❌ [Unified Modal] Failed to generate signed URL:', error)
        setSignedImageUrl(null)
      } finally {
        setImageLoading(false)
      }
    }

    generateSignedUrl()
  }, [claimDetails?.storage_path, claimDetails?.id])

  const fetchClaimDetails = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/v1/expense-claims/${claimId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch claim details')
      }

      const result = await response.json()

      if (result.success && result.data) {
        // Enrich with status display info if not present
        const enrichedData = {
          ...result.data,
          status_display: result.data.status_display || getStatusDisplayInfo(result.data.status), // ✅ Unified status field
          workflow_progress: result.data.workflow_progress || getWorkflowProgress(result.data.status) // ✅ Unified status field
        }
        setClaimDetails(enrichedData)
      } else {
        throw new Error('Invalid response format')
      }
    } catch (error) {
      console.error('Error fetching claim details:', error)
      setError(error instanceof Error ? error.message : 'Failed to load claim details')
    } finally {
      setLoading(false)
    }
  }

  // Helper function to get status display info ✅ Unified status system
  const getStatusDisplayInfo = (status: string) => {
    if (!status) return { label: 'Unknown', color: 'gray', description: 'Status not available' }

    const statusMap: Record<string, { label: string; color: string; description: string }> = {
      'draft': { label: 'Draft', color: 'gray', description: 'Ready for editing - click Edit to modify or Submit to proceed' },
      'uploading': { label: 'Uploading...', color: 'blue', description: 'Receipt file is being uploaded' },
      'analyzing': { label: 'Analyzing 🧠', color: 'blue', description: 'AI is analyzing the receipt' },
      'submitted': { label: 'Submitted', color: 'green', description: 'Submitted for manager approval' },
      'approved': { label: 'Approved', color: 'green', description: 'Approved - awaiting reimbursement' },
      'rejected': { label: 'Rejected', color: 'red', description: 'Claim was rejected' },
      'reimbursed': { label: 'Reimbursed', color: 'purple', description: 'Payment processed' },
      'failed': { label: 'Failed', color: 'red', description: 'Processing failed - please try manual entry' },
    }
    return statusMap[status] || { label: status.replace('_', ' ').toUpperCase(), color: 'gray', description: 'Unknown status' }
  }

  // Helper function to get workflow progress ✅ Unified status system
  const getWorkflowProgress = (status: string): number => {
    const progressMap: Record<string, number> = {
      'draft': 10,
      'uploading': 20,
      'analyzing': 30,
      'submitted': 50,
      'approved': 75,
      'reimbursed': 100,
      'rejected': 0,
      'failed': 0,
    }
    return progressMap[status] || 0
  }

  // Helper function to get processing status icon
  const getProcessingStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
      case 'pending':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-500" />
    }
  }

  // Manager approval handlers
  const handleApproval = async (action: 'approve' | 'reject') => {
    if (viewMode !== 'manager' || !claimDetails) return

    try {
      setProcessing(true)

      if (action === 'approve' && onApprove) {
        await onApprove(claimDetails.id, approvalNotes)
      } else if (action === 'reject' && onReject) {
        await onReject(claimDetails.id, approvalNotes)
      }

      // Clear notes and close modal
      setApprovalNotes('')
      onClose()

      // Notify parent to refresh if needed
      if (onRefreshNeeded) {
        onRefreshNeeded()
      }
    } catch (error) {
      console.error(`Failed to ${action} claim:`, error)
      setError(`Failed to ${action} claim. Please try again.`)
    } finally {
      setProcessing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="bg-record-layer-1 border-record-border w-full max-w-7xl max-h-[95vh] overflow-hidden relative">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-6 py-4">
          <CardTitle className="text-foreground flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Expense Claim Details
            {viewMode === 'manager' && (
              <Badge variant="success" className="ml-2">
                Manager View
              </Badge>
            )}
          </CardTitle>
          <button
            onClick={onClose}
            className="inline-flex items-center px-3 py-1.5 bg-secondary hover:bg-secondary-hover text-secondary-foreground text-sm font-medium rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </CardHeader>

        <div className="overflow-hidden h-[calc(95vh-80px)]">
          <CardContent className="p-0 h-full">
            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 mx-auto text-primary mb-4 animate-spin" />
                <p className="text-muted-foreground">Loading claim details...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 mx-auto text-danger mb-4" />
                <p className="text-danger mb-4">{error}</p>
                <Button
                  onClick={fetchClaimDetails}
                  variant="outline"
                >
                  Try Again
                </Button>
              </div>
            ) : claimDetails ? (
              <div className="flex flex-col h-full">
                {/* Top Banner - Summary (compact height) */}
                <div className="bg-record-layer-2 p-3 border-b border-record-border">
                  <div className="flex items-center justify-between mb-3">
                    {/* Left side - Status and key info */}
                    <div className="flex items-center gap-4">
                      <Badge
                        variant={
                          claimDetails.status_display?.color === 'green' ? 'success' :
                          claimDetails.status_display?.color === 'blue' ? 'primary' :
                          claimDetails.status_display?.color === 'yellow' ? 'warning' :
                          claimDetails.status_display?.color === 'red' ? 'error' :
                          'default'
                        }
                        className="text-sm px-3 py-1"
                      >
                        {claimDetails.status_display?.label || claimDetails.status?.toWellFormed() || 'UNKNOWN'} {/* ✅ Unified status field */}
                      </Badge>

                      {/* Key expense summary info - Enhanced prominence */}
                      <div className="flex items-center gap-8 text-foreground">
                        <div className="flex items-center gap-3">
                          <DollarSign className="w-5 h-5 text-success" />
                          <span className="font-semibold text-lg text-success">
                            {claimDetails.currency || claimDetails.transaction?.original_currency || 'SGD'} {parseFloat(claimDetails.total_amount || claimDetails.transaction?.original_amount || '0').toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Building className="w-5 h-5 text-primary" />
                          <span className="font-semibold text-lg">{claimDetails.vendor_name || claimDetails.transaction?.vendor_name || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Calendar className="w-5 h-5 text-foreground" />
                          <span className="font-semibold text-lg">{new Date(claimDetails.transaction_date || claimDetails.transaction?.transaction_date || '').toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right side - Receipt status and Progress bar */}
                    <div className="text-right text-muted-foreground flex items-center gap-6">
                      {/* Receipt Status for Manager View */}
                      {viewMode === 'manager' && (
                        <div className="flex items-center gap-2">
                          {claimDetails.has_receipt || signedImageUrl ? (
                            <>
                              <Receipt className="w-4 h-4 text-success" />
                              <CheckCircle className="w-4 h-4 text-success" />
                              <span className="text-success text-sm font-medium">Attached</span>
                            </>
                          ) : (
                            <>
                              <Receipt className="w-4 h-4 text-muted-foreground" />
                              <XCircle className="w-4 h-4 text-muted-foreground" />
                              <span className="text-muted-foreground text-sm">No receipt</span>
                            </>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-lg text-foreground">{claimDetails.workflow_progress || 0}%</span>
                        <div className="w-16 bg-muted rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${
                              claimDetails.status === 'rejected' ? 'bg-danger' : 'bg-primary' // ✅ Unified status field
                            }`}
                            style={{ width: `${claimDetails.workflow_progress || 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Current approver info only */}
                  {claimDetails.current_approver_name && ['submitted'].includes(claimDetails.status) && ( /* ✅ Simplified: only 'submitted' shows approver */
                    <div className="text-sm text-muted-foreground">
                      Currently with: <span className="text-foreground">{claimDetails.current_approver_name}</span>
                    </div>
                  )}
                </div>

                {/* Bottom Section - 40/60 Split */}
                <div className="flex flex-1 overflow-hidden">
                  {/* Left Panel - Receipt Preview (40%) */}
                  <div className="w-2/5 border-r border-record-border flex flex-col">
                    <div className="flex-1 bg-record-layer-1 overflow-hidden">
                      {imageLoading ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center text-muted-foreground">
                            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                            <p className="text-xs">Loading preview...</p>
                          </div>
                        </div>
                      ) : signedImageUrl || claimDetails.document?.annotated_image_url ? (
                        <DocumentPreviewWithAnnotations
                          imageUrl={claimDetails.document?.annotated_image_url || signedImageUrl || ''}
                          fileName={claimDetails.document?.original_filename || 'Receipt'}
                          fileType={claimDetails.document?.file_type || 'image/jpeg'}
                          fileSize={0}
                          boundingBoxes={claimDetails.document?.extracted_data?.bounding_boxes || []}
                          hideRegionsCount={true}
                        />
                      ) : claimDetails.storage_path ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center text-muted-foreground">
                            <Receipt className="w-12 h-12 mx-auto mb-2" />
                            <p className="text-xs">Failed to generate secure URL</p>
                            <p className="text-xs text-muted-foreground">Please contact support if this persists</p>
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

                  {/* Right Panel - Details and Line Items (60%) */}
                  <div className="w-3/5 overflow-y-auto">
                    <div className="p-6 space-y-6">
                      {/* Manager Approval Section - Show for manager mode and move to top */}
                      {viewMode === 'manager' && (
                        <Card className="bg-record-layer-2 border-record-border">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-foreground text-sm flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-muted-foreground" />
                              Manager Actions
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {/* Employee Info for Manager */}
                            {claimDetails.employee_name && (
                              <div className="flex justify-between items-center py-2 border-b border-record-border">
                                <span className="text-muted-foreground">Employee</span>
                                <span className="text-foreground font-medium">{claimDetails.employee_name}</span>
                              </div>
                            )}

                            {/* Approval Notes */}
                            <div className="space-y-2">
                              <Label htmlFor="approval_notes" className="text-foreground">
                                Approval Notes (Optional)
                              </Label>
                              <Textarea
                                id="approval_notes"
                                value={approvalNotes}
                                onChange={(e) => setApprovalNotes(e.target.value)}
                                placeholder="Add notes about this approval decision..."
                                className="bg-input border-input text-foreground"
                                rows={2}
                              />
                            </div>

                            {/* Approval Actions */}
                            <div className="flex gap-3 pt-4 border-t border-record-border">
                              <Button
                                onClick={() => handleApproval('reject')}
                                disabled={processing}
                                variant="destructive"
                                className="flex-1"
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Reject
                              </Button>

                              <Button
                                onClick={() => handleApproval('approve')}
                                disabled={processing}
                                variant="success"
                                className="flex-1"
                              >
                                {processing ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                )}
                                Approve
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Basic Information */}
                      <Card className="bg-record-layer-1 border-record-border">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-foreground text-sm flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            Basic Information
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                                <Tag className="w-4 h-4" />
                                Category
                              </label>
                              <div className="bg-record-layer-2 border-record-border text-foreground p-2 rounded text-sm">
                                {categories.find(c => c.business_category_code === (claimDetails.expense_category || claimDetails.transaction?.expense_category))?.business_category_name ||
                                 claimDetails.expense_category || claimDetails.transaction?.expense_category || 'N/A'}
                              </div>
                            </div>
                            {(claimDetails.reference_number || claimDetails.transaction?.reference_number) && (
                              <div className="space-y-2">
                                <label className="text-muted-foreground text-sm">Reference Number</label>
                                <div className="bg-record-layer-2 border-record-border text-foreground p-2 rounded text-sm">
                                  {claimDetails.reference_number || claimDetails.transaction?.reference_number}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <label className="text-muted-foreground text-sm">Description</label>
                            <div className="bg-record-layer-2 border-record-border text-foreground p-2 rounded text-sm">
                              {claimDetails.transaction?.description || 'N/A'}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-muted-foreground text-sm">Business Purpose</label>
                            <div className="bg-record-layer-2 border-record-border text-foreground p-2 rounded min-h-[60px] text-sm">
                              {claimDetails.business_purpose || claimDetails.transaction?.business_purpose || 'N/A'}
                            </div>
                          </div>

                          {claimDetails.transaction?.notes && (
                            <div className="space-y-2">
                              <label className="text-muted-foreground text-sm">Additional Notes</label>
                              <div className="bg-record-layer-2 border-record-border text-foreground p-2 rounded text-sm">
                                {claimDetails.transaction.notes}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Line Items Display */}
                      <Card className="bg-record-layer-1 border-record-border">
                        <CardHeader>
                          <CardTitle className="text-foreground text-sm flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-muted-foreground" />
                            Line Items {claimDetails.transaction?.line_items && claimDetails.transaction.line_items.length > 0 ? `(${claimDetails.transaction.line_items.length})` : '(0)'}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {claimDetails.transaction?.line_items && claimDetails.transaction.line_items.length > 0 ? (
                            <div className="space-y-3">
                              {/* Line Items Table Header */}
                              <div className="grid grid-cols-4 gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-record-border pb-2">
                                <span>Description</span>
                                <span className="text-center">Qty</span>
                                <span className="text-right">Unit Price</span>
                                <span className="text-right">Total</span>
                              </div>

                              {/* Line Items Rows */}
                              {claimDetails.transaction.line_items.map((item, index) => (
                                <div key={item.id || index} className="grid grid-cols-4 gap-2 items-center bg-record-layer-2 p-3 rounded-lg border border-record-border">
                                  <span className="text-foreground font-medium truncate" title={item.item_description}>
                                    {item.item_description || 'Item'}
                                  </span>
                                  <span className="text-foreground text-center">
                                    {item.quantity || 1}
                                  </span>
                                  <span className="text-foreground text-right">
                                    {claimDetails.currency || claimDetails.transaction?.original_currency || 'SGD'} {parseFloat(item.unit_price || '0').toFixed(2)}
                                  </span>
                                  <span className="text-foreground font-medium text-right">
                                    {claimDetails.currency || claimDetails.transaction?.original_currency || 'SGD'} {parseFloat(item.total_amount || '0').toFixed(2)}
                                  </span>
                                </div>
                              ))}

                              {/* Total Summary */}
                              <div className="grid grid-cols-4 gap-2 items-center bg-blue-50 dark:bg-gray-800 dark:bg-blue-900/10 p-3 rounded-lg border border-blue-200 dark:border-blue-700/50 mt-4">
                                <span className="text-blue-900 dark:text-white font-medium col-span-3">Total Amount</span>
                                <span className="text-blue-900 dark:text-white font-bold text-right text-lg">
                                  {claimDetails.currency || claimDetails.transaction?.original_currency || 'SGD'} {parseFloat(claimDetails.total_amount || claimDetails.transaction?.original_amount || '0').toFixed(2)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-8">
                              <DollarSign className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                              <p className="text-muted-foreground">No itemized breakdown available</p>
                              <p className="text-muted-foreground text-sm">This expense was entered as a single amount</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>


                      {/* Document Processing Status */}
                      {claimDetails.document && (
                        <Card className="bg-record-layer-2 border-record-border">
                          <CardHeader>
                            <CardTitle className="text-foreground flex items-center gap-2">
                              <ImageIcon className="w-5 h-5" />
                              Document Processing Status
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-foreground font-medium">{claimDetails.document.original_filename}</p>
                                <p className="text-muted-foreground text-sm">{claimDetails.document.file_type.toUpperCase()} • {claimDetails.document.ocr_processing_status.replace('_', ' ').toUpperCase()}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {getProcessingStatusIcon(claimDetails.document.ocr_processing_status)}
                                {claimDetails.document.annotated_image_url && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setShowDocument(true)}
                                  >
                                    <Eye className="w-4 h-4 mr-1" />
                                    View
                                  </Button>
                                )}
                              </div>
                            </div>

                            {claimDetails.document.processing_progress !== undefined && (
                              <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="text-foreground">Processing Progress</span>
                                  <span className="text-muted-foreground">{claimDetails.document.processing_progress}%</span>
                                </div>
                                <div className="w-full bg-muted rounded-full h-2">
                                  <div
                                    className="bg-primary h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${claimDetails.document.processing_progress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {/* Expense ID at bottom of content */}
                      <div className="flex justify-end mt-6 pt-4 border-t border-record-border">
                        <div className="flex items-center gap-2 bg-record-layer-2 backdrop-blur-sm px-3 py-1.5 rounded-md border border-record-border">
                          <span className="text-foreground text-xs font-mono">Expense ID: {claimId}</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(claimId)}
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
            ) : (
              <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No claim details available</p>
              </div>
            )}
          </CardContent>
        </div>
      </Card>

      {/* Document Viewer Modal - Full Screen */}
      {showDocument && claimDetails?.document?.annotated_image_url && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-60 flex items-center justify-center p-4">
          <div className="bg-record-layer-1 rounded-lg w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-record-border">
              <h3 className="text-foreground font-medium">Receipt Preview</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDocument(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 p-4">
              <DocumentPreviewWithAnnotations
                imageUrl={claimDetails.document.annotated_image_url}
                fileName={claimDetails.document.original_filename || 'Receipt'}
                fileType={claimDetails.document.file_type || 'image/jpeg'}
                fileSize={0}
                boundingBoxes={claimDetails.document.extracted_data?.bounding_boxes || []}
                hideRegionsCount={true}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}