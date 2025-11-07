'use client'

import { X, Edit, Trash2, Calendar, Building, FileText, DollarSign, Hash, Eye, Copy, EyeOff } from 'lucide-react'
import type { AccountingEntry } from '@/domains/accounting-entries/lib/data-access'
import type { SupportedCurrency } from '@/domains/accounting-entries/types'
import { formatCurrency, getAccountingEntryTypeColor, getAccountingEntryTypeIcon } from '@/domains/accounting-entries/hooks/use-accounting-entries'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import MultiPageDocumentPreview from './multi-page-document-preview'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

interface AccountingEntryDetailModalProps {
  transaction: AccountingEntry
  onClose: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
  onViewDocument?: (documentId: string, sourceDocumentType?: string) => void
}

export default function AccountingEntryDetailModal({
  transaction,
  onClose,
  onEdit,
  onDelete,
  onViewDocument
}: AccountingEntryDetailModalProps) {
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean
    isLoading: boolean
  }>({
    isOpen: false,
    isLoading: false
  })
  const [isPreviewVisible, setIsPreviewVisible] = useState(true) // Auto-show if document exists

  const handleDeleteClick = () => {
    setDeleteConfirmation({
      isOpen: true,
      isLoading: false
    })
  }

  const handleDeleteConfirm = async () => {
    setDeleteConfirmation(prev => ({ ...prev, isLoading: true }))

    try {
      await onDelete()
      setDeleteConfirmation({
        isOpen: false,
        isLoading: false
      })
    } catch (error) {
      setDeleteConfirmation(prev => ({ ...prev, isLoading: false }))
    }
  }

  const handleDeleteCancel = () => {
    setDeleteConfirmation({
      isOpen: false,
      isLoading: false
    })
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatCategoryName = (category: string) => {
    return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const formatCreationMethod = (method?: string) => {
    if (!method) return 'Unknown'
    switch (method) {
      case 'manual':
        return 'Manual Entry'
      case 'document_extract':
        return 'Document Extraction'
      default:
        return method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    }
  }

  const calculateLineItemsTotal = () => {
    if (!transaction.line_items || transaction.line_items.length === 0) return 0
    return transaction.line_items.reduce((sum, item) => sum + (item.total_amount || 0), 0)
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      <div className="w-full h-full flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary rounded-lg">
              <Eye className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground">Record Details</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {transaction.category_name || formatCategoryName(transaction.category)} • {formatDate(transaction.transaction_date)}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            {/* Document Preview Toggle */}
            {transaction.source_record_id && (
              <button
                type="button"
                onClick={() => setIsPreviewVisible(!isPreviewVisible)}
                className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg font-medium transition-colors flex items-center gap-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                title={isPreviewVisible ? 'Hide Document' : 'Show Document'}
                aria-expanded={isPreviewVisible}
                aria-controls="document-preview-pane"
                aria-label={`${isPreviewVisible ? 'Hide' : 'Show'} document preview pane`}
              >
                {isPreviewVisible ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                <span className="hidden sm:inline">{isPreviewVisible ? 'Hide Document' : 'Show Document'}</span>
                <span className="sm:hidden">{isPreviewVisible ? 'Hide' : 'Show'}</span>
              </button>
            )}
            <div className="flex items-center gap-2">
              <Button
                onClick={onEdit}
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                title="Edit Record"
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                onClick={handleDeleteClick}
                size="sm"
                variant="destructive"
                title="Delete Record"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Content - Dynamic Layout Based on Preview Visibility */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          {/* Document Preview Pane - Left Side (like invoice analysis modal) */}
          {isPreviewVisible && transaction.source_record_id && (
            <div
              id="document-preview-pane"
              className="w-full lg:w-1/2 lg:border-r lg:border-border flex flex-col min-h-0 mt-4 lg:mt-0"
              aria-label="Document preview"
            >
              <MultiPageDocumentPreview
                sourceRecordId={transaction.source_record_id}
                documentType={transaction.source_document_type as 'invoice' | 'expense_claim' | 'application' || 'invoice'}
                className="flex-1 min-h-[400px] lg:min-h-0"
              />
            </div>
          )}

          {/* Information and Line Items Pane - Right Side or Full Width */}
          <div className={`${isPreviewVisible && transaction.source_record_id ? 'w-full lg:w-1/2' : 'w-full'} flex flex-col min-h-0 transition-all duration-300`}>
            <div className={`flex ${isPreviewVisible && transaction.source_record_id ? 'flex-col' : 'flex-col xl:flex-row'} min-h-0 h-full`}>

              {/* Information Section */}
              <div className={`${isPreviewVisible && transaction.source_record_id ? 'w-full' : 'w-full xl:w-1/2'} overflow-y-auto ${isPreviewVisible && transaction.source_record_id ? '' : 'xl:border-r xl:border-border'} p-6`}>
                <div className="space-y-6">
                {/* Information */}
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-4 flex items-center">
                    <FileText className="w-4 h-4 mr-2" />
                    Information
                  </h4>
                  
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <span className={`font-medium capitalize ${getAccountingEntryTypeColor(transaction.transaction_type)}`}>
                        {transaction.transaction_type}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Description:</span>
                      <span className="text-foreground font-medium">{transaction.description}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Category:</span>
                      <span className="text-foreground">{transaction.category_name || formatCategoryName(transaction.category)}</span>
                    </div>


                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Date:
                      </span>
                      <span className="text-foreground">{formatDate(transaction.transaction_date)}</span>
                    </div>

                    {transaction.vendor_name && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Building className="w-4 h-4" />
                          Vendor:
                        </span>
                        <span className="text-foreground">{transaction.vendor_name}</span>
                      </div>
                    )}

                    {transaction.reference_number && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Hash className="w-4 h-4" />
                          Reference:
                        </span>
                        <span className="text-foreground">{transaction.reference_number}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Amount & Currency */}
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-4 flex items-center">
                    <DollarSign className="w-4 h-4 mr-2" />
                    Amount & Currency
                  </h4>

                  <div className="bg-card rounded-lg border border-border p-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Original Amount:</span>
                      <span className={`text-xl font-bold ${getAccountingEntryTypeColor(transaction.transaction_type)}`}>
                        {transaction.transaction_type === 'Expense' && '-'}
                        {formatCurrency(transaction.original_amount, transaction.original_currency as SupportedCurrency)}
                      </span>
                    </div>

                    {transaction.original_currency !== transaction.home_currency && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Home Currency:</span>
                          <span className="text-foreground font-semibold">
                            {formatCurrency(transaction.home_currency_amount, transaction.home_currency as SupportedCurrency)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Exchange Rate:</span>
                          <span className="text-muted-foreground">
                            1 {transaction.original_currency} = {transaction.exchange_rate.toFixed(6)} {transaction.home_currency}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Rate Date:</span>
                          <span className="text-muted-foreground">
                            {formatDate(transaction.exchange_rate_date)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                
                {/* System Information */}
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-4">System Information</h4>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Created:</span>
                      <span className="text-muted-foreground">
                        {new Date(transaction.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Last Updated:</span>
                      <span className="text-muted-foreground">
                        {new Date(transaction.updated_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Creation Method:</span>
                      <span className="text-muted-foreground">
                        {formatCreationMethod(transaction.created_by_method)}
                      </span>
                    </div>

                    {transaction.source_record_id && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          Source Document:
                        </span>
                        <button
                          onClick={() => onViewDocument?.(transaction.source_record_id!, transaction.source_document_type)}
                          className="text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          View Document
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </div>

              {/* Line Items Section */}
              <div className={`${isPreviewVisible && transaction.source_record_id ? 'w-full' : 'w-full xl:w-1/2'} overflow-y-auto p-6`}>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-foreground flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Line Items ({transaction.line_items?.length || 0})
                    </h4>
                  </div>

                  {/* Line Items Table */}
                  {transaction.line_items && transaction.line_items.length > 0 ? (
                    <div className="bg-card rounded-lg border border-border overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="px-3 py-2 text-left text-muted-foreground font-medium">#</th>
                              <th className="px-3 py-2 text-left text-muted-foreground font-medium">Description</th>
                              <th className="px-3 py-2 text-left text-muted-foreground font-medium">Item Code</th>
                              <th className="px-3 py-2 text-right text-muted-foreground font-medium">Qty</th>
                              <th className="px-3 py-2 text-left text-muted-foreground font-medium">Unit</th>
                              <th className="px-3 py-2 text-right text-muted-foreground font-medium">Unit Price</th>
                              <th className="px-3 py-2 text-right text-muted-foreground font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {transaction.line_items.map((item, index) => (
                              <tr key={item.id || index} className="hover:bg-muted/50">
                                <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                                <td className="px-3 py-2">
                                  <div className="text-foreground font-medium">{item.item_description}</div>
                                  {item.item_category && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {formatCategoryName(item.item_category)}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-foreground">{item.item_code || '-'}</td>
                                <td className="px-3 py-2 text-right text-foreground">{item.quantity}</td>
                                <td className="px-3 py-2 text-foreground">{item.unit_measurement || '-'}</td>
                                <td className="px-3 py-2 text-right text-foreground">
                                  {formatCurrency(item.unit_price, transaction.original_currency as SupportedCurrency)}
                                </td>
                                <td className="px-3 py-2 text-right text-foreground font-medium">
                                  {formatCurrency(item.total_amount || 0, transaction.original_currency as SupportedCurrency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No line items found</p>
                      <p className="text-xs mt-1">This accounting entry has no itemized details</p>
                    </div>
                  )}

                  {/* Transaction Summary */}
                  {transaction.line_items && transaction.line_items.length > 0 && (
                    <div className="bg-card rounded-lg border border-border p-4 text-sm">
                      <h5 className="text-sm font-medium text-foreground mb-3">Summary</h5>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Items Count:</span>
                          <span className="text-foreground">{transaction.line_items.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Subtotal:</span>
                          <span className="text-foreground">
                            {formatCurrency(calculateLineItemsTotal(), transaction.original_currency as SupportedCurrency)}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-border pt-2">
                          <span className="text-foreground font-medium">Total Amount:</span>
                          <span className="text-foreground font-medium">
                            {formatCurrency(transaction.original_amount, transaction.original_currency as SupportedCurrency)}
                          </span>
                        </div>

                        {/* Note about line items vs main amount */}
                        {Math.abs(calculateLineItemsTotal() - transaction.original_amount) > 0.01 && (
                          <div className="mt-3 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                            Note: Line items total differs from accounting entry amount.
                            This may be due to additional fees, discounts, or rounding differences.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Record ID and Invoice/Expense Claims ID at bottom of line items section */}
                  <div className="flex flex-col items-end pt-4 border-t border-border space-y-2">
                    {/* Record ID */}
                    <div className="flex items-center gap-2 bg-muted/50 backdrop-blur-sm px-3 py-1.5 rounded-md border border-border">
                      <span className="text-foreground text-xs font-mono">Record ID: {transaction.id}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(transaction.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy Record ID"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Dynamic Source Document ID */}
                    {transaction.source_record_id && (
                      (() => {
                        // Dynamic label and styling based on source document type
                        const isInvoice = transaction.source_document_type === 'invoice'
                        const isExpense = transaction.source_document_type === 'expense_claim'

                        const getLabel = () => {
                          if (isInvoice) return 'Invoice ID'
                          if (isExpense) return 'Expense ID'
                          return 'Source ID'
                        }

                        const getColors = () => {
                          if (isInvoice) return {
                            bg: 'bg-green-700/20',
                            border: 'border-green-600/30',
                            text: 'text-green-300',
                            button: 'text-success-foreground hover:text-green-200'
                          }
                          if (isExpense) return {
                            bg: 'bg-blue-700/20',
                            border: 'border-blue-600/30',
                            text: 'text-blue-300',
                            button: 'text-blue-400 hover:text-blue-200'
                          }
                          return {
                            bg: 'bg-muted/20',
                            border: 'border-border',
                            text: 'text-foreground',
                            button: 'text-muted-foreground hover:text-foreground'
                          }
                        }

                        const colors = getColors()
                        const label = getLabel()

                        return (
                          <div className={`flex items-center gap-2 ${colors.bg} backdrop-blur-sm px-3 py-1.5 rounded-md border ${colors.border}`}>
                            <span className={`${colors.text} text-xs font-mono`}>{label}: {transaction.source_record_id}</span>
                            <button
                              onClick={() => navigator.clipboard.writeText(transaction.source_record_id!)}
                              className={`${colors.button} transition-colors`}
                              title={`Copy ${label}`}
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        )
                      })()
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Record"
        message={`Are you sure you want to delete this ${transaction.transaction_type}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        isLoading={deleteConfirmation.isLoading}
      />
    </div>
  )
}