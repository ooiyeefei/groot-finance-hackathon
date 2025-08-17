'use client'

import { X, Edit, Trash2, Calendar, Building, FileText, DollarSign, Hash, Eye } from 'lucide-react'
import { Transaction } from '@/types/transaction'
import { formatCurrency, getTransactionTypeColor, getTransactionTypeIcon } from '@/hooks/use-transactions'

interface TransactionDetailModalProps {
  transaction: Transaction
  onClose: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
}

export default function TransactionDetailModal({
  transaction,
  onClose,
  onEdit,
  onDelete
}: TransactionDetailModalProps) {
  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete this ${transaction.transaction_type}?`)) {
      await onDelete()
    }
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

  const calculateLineItemsTotal = () => {
    if (!transaction.line_items || transaction.line_items.length === 0) return 0
    return transaction.line_items.reduce((sum, item) => sum + (item.total_amount || item.line_total || 0), 0)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">
              {getTransactionTypeIcon(transaction.transaction_type)}
            </span>
            <div>
              <h2 className="text-xl font-semibold text-white">Transaction Details</h2>
              <p className="text-sm text-gray-400">
                {formatCategoryName(transaction.category)} • {formatDate(transaction.transaction_date)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors"
              title="Edit Transaction"
            >
              <Edit className="w-5 h-5" />
            </button>
            <button
              onClick={handleDelete}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded-lg transition-colors"
              title="Delete Transaction"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Main Transaction Info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Transaction Information</h3>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Type:</span>
                    <span className={`font-medium capitalize ${getTransactionTypeColor(transaction.transaction_type)}`}>
                      {transaction.transaction_type}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Description:</span>
                    <span className="text-white font-medium">{transaction.description}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Category:</span>
                    <span className="text-white">{formatCategoryName(transaction.category)}</span>
                  </div>
                  
                  {transaction.subcategory && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Subcategory:</span>
                      <span className="text-white">{formatCategoryName(transaction.subcategory)}</span>
                    </div>
                  )}
                  
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
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Amount & Currency</h3>
                
                <div className="bg-gray-700/30 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Original Amount:</span>
                    <span className={`text-xl font-bold ${getTransactionTypeColor(transaction.transaction_type)}`}>
                      {transaction.transaction_type === 'expense' && '-'}
                      {formatCurrency(transaction.original_amount, transaction.original_currency)}
                    </span>
                  </div>
                  
                  {transaction.original_currency !== transaction.home_currency && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Home Currency:</span>
                        <span className="text-white font-semibold">
                          {formatCurrency(transaction.home_amount, transaction.home_currency)}
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
                <h3 className="text-lg font-medium text-white mb-4">System Information</h3>
                
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
                    <span className="text-gray-400 capitalize">
                      {transaction.created_by_method.replace('_', ' ')}
                    </span>
                  </div>
                  
                  {transaction.document_id && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        Source Document:
                      </span>
                      <span className="text-blue-400 cursor-pointer hover:text-blue-300">
                        View Document
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Line Items */}
          {transaction.line_items && transaction.line_items.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Line Items ({transaction.line_items.length})
              </h3>
              
              <div className="bg-gray-700/30 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-600/50">
                      <tr>
                        <th className="text-left p-3 text-sm font-medium text-gray-300">Description</th>
                        <th className="text-center p-3 text-sm font-medium text-gray-300">Quantity</th>
                        <th className="text-right p-3 text-sm font-medium text-gray-300">Unit Price</th>
                        <th className="text-right p-3 text-sm font-medium text-gray-300">Tax</th>
                        <th className="text-right p-3 text-sm font-medium text-gray-300">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-600">
                      {transaction.line_items.map((item, index) => (
                        <tr key={item.id || index} className="hover:bg-gray-600/20">
                          <td className="p-3">
                            <div>
                              <div className="text-white font-medium">{item.item_description || item.description}</div>
                              {item.item_category && (
                                <div className="text-xs text-gray-400 mt-1">
                                  {formatCategoryName(item.item_category)}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center text-white">
                            {item.quantity}
                          </td>
                          <td className="p-3 text-right text-white">
                            {formatCurrency(item.unit_price, transaction.original_currency)}
                          </td>
                          <td className="p-3 text-right text-white">
                            {(item.tax_amount || 0) > 0 ? (
                              <div>
                                {formatCurrency(item.tax_amount || 0, transaction.original_currency)}
                                {item.tax_rate && (
                                  <div className="text-xs text-gray-400">
                                    ({(item.tax_rate * 100).toFixed(1)}%)
                                  </div>
                                )}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="p-3 text-right text-white font-medium">
                            {formatCurrency(item.total_amount || item.line_total || 0, transaction.original_currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-600/30">
                      <tr>
                        <td colSpan={4} className="p-3 text-right font-medium text-gray-300">
                          Subtotal:
                        </td>
                        <td className="p-3 text-right font-bold text-white">
                          {formatCurrency(calculateLineItemsTotal(), transaction.original_currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              
              {/* Note about line items vs main amount */}
              {Math.abs(calculateLineItemsTotal() - transaction.original_amount) > 0.01 && (
                <div className="mt-2 text-xs text-yellow-400 bg-yellow-900/20 rounded p-2">
                  Note: Line items total differs from transaction amount. 
                  This may be due to additional fees, discounts, or rounding differences.
                </div>
              )}
            </div>
          )}

          {/* Additional Details */}
          {transaction.vendor_details && Object.keys(transaction.vendor_details).length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-white mb-4">Additional Details</h3>
              <div className="bg-gray-700/30 rounded-lg p-4">
                <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                  {JSON.stringify(transaction.vendor_details, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Transaction ID: {transaction.id}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onEdit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                <Edit className="w-4 h-4 mr-2 inline" />
                Edit Transaction
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}