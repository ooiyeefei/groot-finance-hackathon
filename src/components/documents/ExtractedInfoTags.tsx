'use client'

import { useState } from 'react'

interface ExtractedInfoTagsProps {
  extractedData: any
  className?: string
}

const ExtractedInfoTags = ({ extractedData, className = '' }: ExtractedInfoTagsProps) => {
  if (!extractedData) {
    return null
  }

  // Unified data extraction function that handles both raw DSPy and legacy nested formats
  const getFieldValue = (field: string): string | null => {
    // Check raw DSPy format first (new format)
    if (extractedData[field]) {
      if (typeof extractedData[field] === 'object' && extractedData[field]?.value) {
        return String(extractedData[field].value)
      }
      if (typeof extractedData[field] === 'string' || typeof extractedData[field] === 'number') {
        return String(extractedData[field])
      }
      // If it's an object without .value, skip it
    }

    // Check nested document_summary format (legacy format)
    if (extractedData.document_summary && extractedData.document_summary[field]) {
      const summaryField = extractedData.document_summary[field]
      if (typeof summaryField === 'object' && summaryField?.value) {
        return String(summaryField.value)
      }
      if (typeof summaryField === 'string' || typeof summaryField === 'number') {
        return String(summaryField)
      }
    }

    // Check metadata layoutElements format (alternative legacy format)
    if (extractedData.metadata?.layoutElements?.document_summary?.[field]) {
      const layoutField = extractedData.metadata.layoutElements.document_summary[field]
      if (typeof layoutField === 'object' && layoutField?.value) {
        return String(layoutField.value)
      }
      if (typeof layoutField === 'string' || typeof layoutField === 'number') {
        return String(layoutField)
      }
    }

    return null
  }

  // Get line items count from various possible locations
  const getLineItemsCount = (): number => {
    // Raw DSPy format
    if (extractedData.line_items && Array.isArray(extractedData.line_items)) {
      return extractedData.line_items.length
    }

    // Legacy nested format
    if (extractedData.metadata?.layoutElements?.line_items && Array.isArray(extractedData.metadata.layoutElements.line_items)) {
      return extractedData.metadata.layoutElements.line_items.length
    }

    return 0
  }

  // Extract essential information
  const vendor = getFieldValue('vendor_name')
  const totalAmount = getFieldValue('total_amount')
  const currency = getFieldValue('currency') || 'MYR' // Default currency fallback
  const documentNumber = getFieldValue('document_number') || getFieldValue('invoice_number') || getFieldValue('receipt_number')
  const paymentTerms = getFieldValue('payment_terms') || getFieldValue('credit_terms')
  const documentDate = getFieldValue('document_date') || getFieldValue('transaction_date') || getFieldValue('invoice_date')
  const lineItemsCount = getLineItemsCount()

  // If no essential data is available, don't render anything
  if (!vendor && !totalAmount && !documentNumber && lineItemsCount === 0) {
    return null
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {/* Primary Information - Always show if available */}
      {vendor && (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-blue-600/20 text-blue-300 border border-blue-500/30">
          <span className="font-medium">Vendor:</span>
          <span className="ml-1 truncate max-w-32" title={vendor}>{vendor}</span>
        </span>
      )}

      {totalAmount && (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-green-600/20 text-green-300 border border-green-500/30">
          <span className="font-medium">Amount:</span>
          <span className="ml-1">{totalAmount} {currency}</span>
        </span>
      )}

      {/* Secondary Information - Show if available */}
      {documentNumber && (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-purple-600/20 text-purple-300 border border-purple-500/30">
          <span className="font-medium">Invoice:</span>
          <span className="ml-1 font-mono text-xs" title={documentNumber}>{documentNumber}</span>
        </span>
      )}

      {lineItemsCount > 0 && (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-orange-600/20 text-orange-300 border border-orange-500/30">
          <span className="font-medium">Items:</span>
          <span className="ml-1">{lineItemsCount}</span>
        </span>
      )}

      {/* Tertiary Information - Show if available */}
      {paymentTerms && (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-yellow-600/20 text-yellow-300 border border-yellow-500/30">
          <span className="font-medium">Terms:</span>
          <span className="ml-1">{paymentTerms}</span>
        </span>
      )}

      {documentDate && (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-600/20 text-gray-300 border border-gray-500/30">
          <span className="font-medium">Date:</span>
          <span className="ml-1">{new Date(documentDate).toLocaleDateString()}</span>
        </span>
      )}
    </div>
  )
}

export default ExtractedInfoTags