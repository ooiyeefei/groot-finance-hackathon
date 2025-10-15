'use client'

import { X, Edit, Trash2, Calendar, Building, FileText, DollarSign, Hash, Eye, Copy } from 'lucide-react'
import { Transaction } from '@/domains/accounting-entries/types'
import { formatCurrency, getAccountingEntryTypeColor, getAccountingEntryTypeIcon } from '@/domains/accounting-entries/hooks/use-accounting-entries'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import { useState } from 'react'

interface AccountingEntryDetailModalProps {
  transaction: Transaction
  onClose: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
  onViewDocument?: (documentId: string) => void
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
      console.error('Delete failed:', error)
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

  const formatCreationMethod = (method: string) => {
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
    <div className="fixed inset-0 bg-gray-800 z-50 flex flex-col">
      <div className="w-full h-full flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Record Details</h3>
              <p className="text-sm text-gray-400 mt-1">
                {transaction.category_name || formatCategoryName(transaction.category)} • {formatDate(transaction.transaction_date)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors"
              title="Edit Record"
            >
              <Edit className="w-5 h-5" />
            </button>
            <button
              onClick={handleDeleteClick}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded-lg transition-colors"
              title="Delete Record"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Modal Content - Two Pane Layout */}
        <div className="flex-1 flex min-h-0">
          {/* Left Pane - Information (Scrollable) */}
          <div className="w-1/2 border-r border-gray-700 flex flex-col min-h-0">
            <div className="overflow-y-auto flex-1 p-6">
              <div className="space-y-6">
                {/* Information */}
                <div>
                  <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                    <FileText className="w-4 h-4 mr-2" />
                    Information
                  </h4>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Type:</span>
                      <span className={`font-medium capitalize ${getAccountingEntryTypeColor(transaction.transaction_type)}`}>
                        {transaction.transaction_type}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Description:</span>
                      <span className="text-white font-medium">{transaction.description}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Category:</span>
                      <span className="text-white">{transaction.category_name || formatCategoryName(transaction.category)}</span>
                    </div>
                    
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Date:
                      </span>
                      <span className="text-white">{formatDate(transaction.transaction_date)}</span>
                    </div>
                    
                    {transaction.vendor_name && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 flex items-center gap-1">
                          <Building className="w-4 h-4" />
                          Vendor:
                        </span>
                        <span className="text-white">{transaction.vendor_name}</span>
                      </div>
                    )}
                    
                    {transaction.reference_number && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 flex items-center gap-1">
                          <Hash className="w-4 h-4" />
                          Reference:
                        </span>
                        <span className="text-white">{transaction.reference_number}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Amount & Currency */}
                <div>
                  <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                    <DollarSign className="w-4 h-4 mr-2" />
                    Amount & Currency
                  </h4>
                  
                  <div className="bg-gray-900 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Original Amount:</span>
                      <span className={`text-xl font-bold ${getAccountingEntryTypeColor(transaction.transaction_type)}`}>
                        {transaction.transaction_type === 'Expense' && '-'}
                        {formatCurrency(transaction.original_amount, transaction.original_currency)}
                      </span>
                    </div>
                    
                    {transaction.original_currency !== transaction.home_currency && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Home Currency:</span>
                          <span className="text-white font-semibold">
                            {formatCurrency(transaction.home_currency_amount, transaction.home_currency)}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Exchange Rate:</span>
                          <span className="text-gray-400">
                            1 {transaction.original_currency} = {transaction.exchange_rate.toFixed(6)} {transaction.home_currency}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Rate Date:</span>
                          <span className="text-gray-400">
                            {formatDate(transaction.exchange_rate_date)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                
                {/* System Information */}
                <div>
                  <h4 className="text-sm font-medium text-white mb-4">System Information</h4>
                  
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Created:</span>
                      <span className="text-gray-400">
                        {new Date(transaction.created_at).toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Last Updated:</span>
                      <span className="text-gray-400">
                        {new Date(transaction.updated_at).toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Creation Method:</span>
                      <span className="text-gray-400">
                        {formatCreationMethod(transaction.created_by_method)}
                      </span>
                    </div>
                    
                    {transaction.source_record_id && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          Source Document:
                        </span>
                        <button
                          onClick={() => onViewDocument?.(transaction.source_record_id!)}
                          className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
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
          </div>

          {/* Right Pane - Line Items Table */}
          <div className="w-1/2 flex flex-col min-h-0">
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="space-y-6">
                {/* Line Items Header */}
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                    <FileText className="w-4 h-4 mr-2" />
                    Line Items ({transaction.line_items?.length || 0})
                  </h4>
                </div>

                {/* Line Items Table */}
                {transaction.line_items && transaction.line_items.length > 0 ? (
                  <div className="bg-gray-900 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-800">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-400 font-medium">#</th>
                            <th className="px-3 py-2 text-left text-gray-400 font-medium">Description</th>
                            <th className="px-3 py-2 text-left text-gray-400 font-medium">Item Code</th>
                            <th className="px-3 py-2 text-right text-gray-400 font-medium">Qty</th>
                            <th className="px-3 py-2 text-left text-gray-400 font-medium">Unit</th>
                            <th className="px-3 py-2 text-right text-gray-400 font-medium">Unit Price</th>
                            <th className="px-3 py-2 text-right text-gray-400 font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                          {transaction.line_items.map((item, index) => (
                            <tr key={item.id || index} className="hover:bg-gray-800">
                              <td className="px-3 py-2 text-gray-400">{index + 1}</td>
                              <td className="px-3 py-2">
                                <div className="text-white font-medium">{item.item_description}</div>
                                {item.item_category && (
                                  <div className="text-xs text-gray-400 mt-1">
                                    {formatCategoryName(item.item_category)}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-white">{item.item_code || '-'}</td>
                              <td className="px-3 py-2 text-right text-white">{item.quantity}</td>
                              <td className="px-3 py-2 text-white">{item.unit_measurement || '-'}</td>
                              <td className="px-3 py-2 text-right text-white">
                                {formatCurrency(item.unit_price, transaction.original_currency)}
                              </td>
                              <td className="px-3 py-2 text-right text-green-400 font-medium">
                                {formatCurrency(item.total_amount || 0, transaction.original_currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No line items found</p>
                    <p className="text-xs mt-1">This accounting entry has no itemized details</p>
                  </div>
                )}

                {/* Transaction Summary */}
                {transaction.line_items && transaction.line_items.length > 0 && (
                  <div className="bg-gray-900 rounded-lg p-4 border border-gray-600">
                    <h5 className="text-sm font-medium text-white mb-3">Summary</h5>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Items Count:</span>
                        <span className="text-white">{transaction.line_items.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Subtotal:</span>
                        <span className="text-white">
                          {formatCurrency(calculateLineItemsTotal(), transaction.original_currency)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-gray-700 pt-2">
                        <span className="text-gray-300 font-medium">Total Amount:</span>
                        <span className="text-green-400 font-medium">
                          {formatCurrency(transaction.original_amount, transaction.original_currency)}
                        </span>
                      </div>
                      
                      {/* Note about line items vs main amount */}
                      {Math.abs(calculateLineItemsTotal() - transaction.original_amount) > 0.01 && (
                        <div className="mt-3 text-xs text-yellow-400 bg-yellow-900/20 rounded p-2">
                          Note: Line items total differs from accounting entry amount. 
                          This may be due to additional fees, discounts, or rounding differences.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Record ID and Invoice/Expense Claims ID at bottom of right pane */}
                <div className="flex flex-col items-end mt-6 pt-4 border-t border-gray-600 space-y-2">
                  {/* Record ID */}
                  <div className="flex items-center gap-2 bg-gray-700/90 backdrop-blur-sm px-3 py-1.5 rounded-md border border-gray-600">
                    <span className="text-gray-300 text-xs font-mono">Record ID: {transaction.id}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(transaction.id)}
                      className="text-gray-400 hover:text-gray-200 transition-colors"
                      title="Copy Record ID"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Invoice ID */}
                  {transaction.source_record_id && (
                    <div className="flex items-center gap-2 bg-green-700/20 backdrop-blur-sm px-3 py-1.5 rounded-md border border-green-600/30">
                      <span className="text-green-300 text-xs font-mono">Invoice ID: {transaction.source_record_id}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(transaction.source_record_id!)}
                        className="text-green-400 hover:text-green-200 transition-colors"
                        title="Copy Invoice ID"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Expense Claims ID */}
                  {transaction.expense_claims && transaction.expense_claims.length > 0 && (
                    <div className="flex items-center gap-2 bg-blue-700/20 backdrop-blur-sm px-3 py-1.5 rounded-md border border-blue-600/30">
                      <span className="text-blue-300 text-xs font-mono">Expense ID: {transaction.expense_claims[0].id}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(transaction.expense_claims?.[0]?.id || '')}
                        className="text-blue-400 hover:text-blue-200 transition-colors"
                        title="Copy Expense Claims ID"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}
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