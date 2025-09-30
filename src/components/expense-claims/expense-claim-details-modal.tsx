/**
 * Expense Claim Details Modal
 * Comprehensive view of expense claim with document processing status
 */

'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
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
  Eye
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EXPENSE_CATEGORY_CONFIG } from '@/types/expense-claims'

interface ExpenseClaimDetailsModalProps {
  claimId: string
  isOpen: boolean
  onClose: () => void
}

interface ClaimDetails {
  id: string
  status: string
  status_display?: {
    label: string
    color: string
    description: string
  }
  workflow_progress?: number
  created_at: string
  updated_at: string
  current_approver_name?: string
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
  }
  document?: {
    id: string
    original_filename: string
    file_type: string
    processing_status: string
    processing_progress?: number
    extracted_data?: any
    annotated_image_url?: string
    storage_path?: string
  }
  line_items?: Array<{
    id: string
    item_description: string
    quantity: number
    unit_price: string
    total_amount: string
  }>
}

export default function ExpenseClaimDetailsModal({
  claimId,
  isOpen,
  onClose
}: ExpenseClaimDetailsModalProps) {
  const [claimDetails, setClaimDetails] = useState<ClaimDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDocument, setShowDocument] = useState(false)
  const t = useTranslations('expenseClaims')

  // Fetch claim details
  useEffect(() => {
    if (isOpen && claimId) {
      fetchClaimDetails()
    }
  }, [isOpen, claimId])

  const fetchClaimDetails = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(`/api/expense-claims/${claimId}`, {
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
          status_display: result.data.status_display || getStatusDisplayInfo(result.data.status),
          workflow_progress: result.data.workflow_progress || getWorkflowProgress(result.data.status)
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

  // Helper function to get status display info (fallback if not provided by API)
  const getStatusDisplayInfo = (status: string) => {
    const statusMap: Record<string, { label: string; color: string; description: string }> = {
      'draft': { label: t('draft'), color: 'gray', description: 'Expense claim is being prepared' },
      'submitted': { label: t('submitted'), color: 'blue', description: t('submittedDescription') },
      'under_review': { label: t('underReview'), color: 'yellow', description: t('underReviewDescription') },
      'approved': { label: t('approved'), color: 'green', description: t('approvedDescription') },
      'reimbursed': { label: t('reimbursed'), color: 'purple', description: t('reimbursedDescription') },
      'paid': { label: t('paid'), color: 'green', description: t('paidDescription') },
      'rejected': { label: t('rejected'), color: 'red', description: t('rejectedDescription') },
    }
    return statusMap[status] || { label: status.replace('_', ' ').toUpperCase(), color: 'gray', description: t('unknownStatus') }
  }

  // Helper function to get workflow progress
  const getWorkflowProgress = (status: string): number => {
    const progressMap: Record<string, number> = {
      'draft': 10,
      'submitted': 25,
      'under_review': 50,
      'approved': 75,
      'reimbursed': 90,
      'paid': 100,
      'rejected': 0,
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="bg-gray-800 border-gray-700 w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-white flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Expense Claim Details
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        
        <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
          <CardContent className="space-y-6 p-6">
            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 mx-auto text-blue-500 mb-4 animate-spin" />
                <p className="text-gray-400">Loading claim details...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
                <p className="text-red-400 mb-4">{error}</p>
                <Button 
                  onClick={fetchClaimDetails}
                  variant="outline"
                  className="border-gray-600 text-gray-300"
                >
                  Try Again
                </Button>
              </div>
            ) : claimDetails ? (
              <>
                {/* Status Overview */}
                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <Badge 
                      className={`text-sm px-3 py-1 ${
                        claimDetails.status_display?.color === 'green' ? 'bg-green-600 text-white' :
                        claimDetails.status_display?.color === 'blue' ? 'bg-blue-600 text-white' :
                        claimDetails.status_display?.color === 'yellow' ? 'bg-yellow-600 text-white' :
                        claimDetails.status_display?.color === 'red' ? 'bg-red-600 text-white' :
                        claimDetails.status_display?.color === 'purple' ? 'bg-purple-600 text-white' :
                        'bg-gray-600 text-white'
                      }`}
                    >
                      {claimDetails.status_display?.label || claimDetails.status.toUpperCase()}
                    </Badge>
                    
                    <div className="text-right text-sm text-gray-400">
                      <p>Created: {new Date(claimDetails.created_at).toLocaleDateString()}</p>
                      <p>Updated: {new Date(claimDetails.updated_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  
                  {/* Workflow Progress */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300">Progress</span>
                      <span className="text-gray-400">{claimDetails.workflow_progress || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-600 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          claimDetails.status === 'rejected' ? 'bg-red-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${claimDetails.workflow_progress || 0}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-400">
                      {claimDetails.status_display?.description}
                    </p>
                    
                    {claimDetails.current_approver_name && ['submitted', 'under_review', 'pending_approval'].includes(claimDetails.status) && (
                      <p className="text-sm text-gray-400">
                        Currently with: <span className="text-white">{claimDetails.current_approver_name}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Transaction Details */}
                {claimDetails.transaction && (
                  <Card className="bg-gray-700 border-gray-600">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Transaction Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-gray-400 text-sm">Description</label>
                          <p className="text-white">{claimDetails.transaction.description}</p>
                        </div>
                        <div>
                          <label className="text-gray-400 text-sm">Vendor</label>
                          <p className="text-white flex items-center gap-2">
                            <Building className="w-4 h-4" />
                            {claimDetails.transaction.vendor_name}
                          </p>
                        </div>
                        <div>
                          <label className="text-gray-400 text-sm">Amount</label>
                          <p className="text-white flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            {claimDetails.transaction.original_currency} {parseFloat(claimDetails.transaction.original_amount).toFixed(2)}
                          </p>
                          {claimDetails.transaction.home_currency_amount && 
                           claimDetails.transaction.original_amount !== claimDetails.transaction.home_currency_amount && (
                            <p className="text-gray-400 text-sm">
                              ≈ {claimDetails.transaction.home_currency || 'SGD'} {parseFloat(claimDetails.transaction.home_currency_amount).toFixed(2)}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="text-gray-400 text-sm">Date</label>
                          <p className="text-white flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            {new Date(claimDetails.transaction.transaction_date).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <label className="text-gray-400 text-sm">Category</label>
                          <p className="text-white flex items-center gap-2">
                            <Tag className="w-4 h-4" />
                            {EXPENSE_CATEGORY_CONFIG[claimDetails.transaction.expense_category as keyof typeof EXPENSE_CATEGORY_CONFIG]?.icon || '📄'} {EXPENSE_CATEGORY_CONFIG[claimDetails.transaction.expense_category as keyof typeof EXPENSE_CATEGORY_CONFIG]?.label || claimDetails.transaction.expense_category}
                          </p>
                        </div>
                        {claimDetails.transaction.reference_number && (
                          <div>
                            <label className="text-gray-400 text-sm">Reference Number</label>
                            <p className="text-white">{claimDetails.transaction.reference_number}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="border-t border-gray-600 my-4" />
                      
                      <div>
                        <label className="text-gray-400 text-sm">Business Purpose</label>
                        <p className="text-white mt-1">{claimDetails.transaction.business_purpose}</p>
                      </div>
                      
                      {claimDetails.transaction.notes && (
                        <div>
                          <label className="text-gray-400 text-sm">Notes</label>
                          <p className="text-white mt-1">{claimDetails.transaction.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Document Processing Status */}
                {claimDetails.document && (
                  <Card className="bg-gray-700 border-gray-600">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <ImageIcon className="w-5 h-5" />
                        Document Processing Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">{claimDetails.document.original_filename}</p>
                          <p className="text-gray-400 text-sm">{claimDetails.document.file_type.toUpperCase()} • {claimDetails.document.processing_status.replace('_', ' ').toUpperCase()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getProcessingStatusIcon(claimDetails.document.processing_status)}
                          {claimDetails.document.annotated_image_url && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setShowDocument(true)}
                              className="border-gray-600 text-gray-300"
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
                            <span className="text-gray-300">Processing Progress</span>
                            <span className="text-gray-400">{claimDetails.document.processing_progress}%</span>
                          </div>
                          <div className="w-full bg-gray-600 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${claimDetails.document.processing_progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Line Items */}
                {claimDetails.line_items && claimDetails.line_items.length > 0 && (
                  <Card className="bg-gray-700 border-gray-600">
                    <CardHeader>
                      <CardTitle className="text-white">Line Items</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {claimDetails.line_items.map((item, index) => (
                          <div key={item.id} className="p-3 bg-gray-800 rounded-lg">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <p className="text-white font-medium">{item.item_description}</p>
                                <p className="text-gray-400 text-sm">
                                  Qty: {item.quantity} × {claimDetails.transaction?.original_currency} {parseFloat(item.unit_price).toFixed(2)}
                                </p>
                              </div>
                              <p className="text-white font-semibold">
                                {claimDetails.transaction?.original_currency} {parseFloat(item.total_amount).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 mx-auto text-gray-500 mb-4" />
                <p className="text-gray-400">No claim details available</p>
              </div>
            )}
          </CardContent>
        </div>
      </Card>

      {/* Document Viewer Modal */}
      {showDocument && claimDetails?.document?.annotated_image_url && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-60 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-lg max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-white font-medium">Receipt/Document</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDocument(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4">
              <img
                src={claimDetails.document.annotated_image_url}
                alt="Receipt/Document"
                className="max-w-full max-h-[70vh] object-contain mx-auto"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}