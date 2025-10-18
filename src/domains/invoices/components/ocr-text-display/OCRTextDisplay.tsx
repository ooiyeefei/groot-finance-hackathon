'use client'

import React, { useState, useMemo } from 'react'
import { FileText, Edit3, Copy, Check, Eye, EyeOff } from 'lucide-react'
import { InvoiceTextParser } from './utils/textParser'
import { OCRTextDisplayProps, ParsedInvoiceData, HighlightConfig } from './types'

const defaultHighlightConfig: HighlightConfig = {
  amounts: '#10B981',    // emerald-500
  dates: '#3B82F6',      // blue-500  
  identifiers: '#8B5CF6', // violet-500
  vendors: '#F59E0B',    // amber-500
  default: '#6B7280'     // gray-500
}

export default function OCRTextDisplay({
  rawText,
  confidence = 0,
  onTextCorrection,
  theme = 'dark',
  highlightKeywords = [],
  className = ''
}: OCRTextDisplayProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedText, setEditedText] = useState(rawText)
  const [copied, setCopied] = useState(false)
  const [showRawText, setShowRawText] = useState(false)
  const [showStructured, setShowStructured] = useState(true)

  // Parse the OCR text into structured data
  const parsedData = useMemo(() => {
    try {
      return InvoiceTextParser.parse(rawText)
    } catch (error) {
      console.warn('Failed to parse OCR text:', error)
      return null
    }
  }, [rawText])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(showRawText ? rawText : editedText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
  }

  const handleSaveEdit = () => {
    setIsEditing(false)
    onTextCorrection?.(editedText)
  }

  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.9) return 'text-green-400'
    if (conf >= 0.7) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getConfidenceLabel = (conf: number) => {
    if (conf >= 0.9) return 'High'
    if (conf >= 0.7) return 'Medium'
    return 'Low'
  }

  const renderStructuredView = (data: ParsedInvoiceData) => (
    <div className="space-y-6">
      {/* Document Header */}
      {data.header && Object.keys(data.header).length > 0 && (
        <div className="bg-gray-800/50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
            <FileText className="w-5 h-5 mr-2" />
            Document Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.header.documentType && (
              <div>
                <label className="text-sm font-medium text-gray-400">Document Type</label>
                <p className="text-white">{data.header.documentType}</p>
              </div>
            )}
            {data.header.invoiceNumber && (
              <div>
                <label className="text-sm font-medium text-gray-400">Invoice/Receipt Number</label>
                <p className="text-white font-mono">{data.header.invoiceNumber}</p>
              </div>
            )}
            {data.header.date && (
              <div>
                <label className="text-sm font-medium text-gray-400">Date</label>
                <p className="text-white">{data.header.date}</p>
              </div>
            )}
            {data.header.vendor && (
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-gray-400">Vendor Information</label>
                <div className="mt-1">
                  {data.header.vendor.name && (
                    <p className="text-white font-medium">{data.header.vendor.name}</p>
                  )}
                  {data.header.vendor.contact && (
                    <p className="text-gray-300 text-sm">{data.header.vendor.contact}</p>
                  )}
                  {data.header.vendor.address && (
                    <p className="text-gray-300 text-sm">{data.header.vendor.address}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Line Items */}
      {data.lineItems && data.lineItems.length > 0 && (
        <div className="bg-gray-800/50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-3">Line Items</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-600">
                  <th className="text-left py-2 text-gray-400">Description</th>
                  <th className="text-right py-2 text-gray-400">Qty</th>
                  <th className="text-right py-2 text-gray-400">Unit Price</th>
                  <th className="text-right py-2 text-gray-400">Total</th>
                  <th className="text-center py-2 text-gray-400">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {data.lineItems.map((item, index) => (
                  <tr key={index} className="border-b border-gray-700">
                    <td className="py-2 text-white">
                      {item.itemCode && (
                        <span className="text-gray-400 font-mono text-xs mr-2">
                          {item.itemCode}
                        </span>
                      )}
                      {item.description}
                    </td>
                    <td className="py-2 text-right text-gray-300">{item.quantity || '-'}</td>
                    <td className="py-2 text-right text-gray-300">{item.unitPrice || '-'}</td>
                    <td className="py-2 text-right text-white font-medium">{item.total || '-'}</td>
                    <td className="py-2 text-center">
                      <span className={`text-xs ${getConfidenceColor(item.confidence || 0)}`}>
                        {getConfidenceLabel(item.confidence || 0)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Totals */}
      {data.totals && Object.keys(data.totals).length > 0 && (
        <div className="bg-gray-800/50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-3">Summary</h3>
          <div className="space-y-2">
            {data.totals.subtotal && (
              <div className="flex justify-between">
                <span className="text-gray-400">Subtotal:</span>
                <span className="text-white">{data.totals.currency || ''} {data.totals.subtotal}</span>
              </div>
            )}
            {data.totals.tax && (
              <div className="flex justify-between">
                <span className="text-gray-400">Tax:</span>
                <span className="text-white">{data.totals.currency || ''} {data.totals.tax}</span>
              </div>
            )}
            {data.totals.total && (
              <div className="flex justify-between text-lg font-semibold border-t border-gray-600 pt-2">
                <span className="text-white">Total:</span>
                <span className="text-white">{data.totals.currency || ''} {data.totals.total}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {data.notes && data.notes.length > 0 && (
        <div className="bg-gray-800/50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-3">Notes</h3>
          <ul className="space-y-1">
            {data.notes.map((note, index) => (
              <li key={index} className="text-gray-300 text-sm">
                • {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )

  const renderRawTextView = () => {
    // SECURITY FIX: Use safe text rendering instead of dangerouslySetInnerHTML
    const renderHighlightedText = (text: string) => {
      // Parse the text and render with safe React elements instead of raw HTML
      const patterns = [
        {
          regex: /(?:RM|USD|SGD|MYR|THB|IDR|PHP|EUR|CNY|VND)?\s*[\$]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
          color: defaultHighlightConfig.amounts,
          type: 'amount'
        },
        {
          regex: /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/g,
          color: defaultHighlightConfig.dates,
          type: 'date'
        },
        {
          regex: /(?:I-|INV|RECEIPT)[A-Z0-9\-\/]+/gi,
          color: defaultHighlightConfig.identifiers,
          type: 'identifier'
        }
      ];

      // Split text by patterns to create safe React elements
      let parts: (string | React.ReactElement)[] = [text];
      let keyCounter = 0;

      patterns.forEach(pattern => {
        const newParts: (string | React.ReactElement)[] = [];
        parts.forEach(part => {
          if (typeof part === 'string') {
            const matches = [...part.matchAll(pattern.regex)];
            if (matches.length === 0) {
              newParts.push(part);
              return;
            }

            let lastIndex = 0;
            matches.forEach(match => {
              // Add text before match
              if (match.index! > lastIndex) {
                newParts.push(part.slice(lastIndex, match.index));
              }
              // Add highlighted match as safe React element
              newParts.push(
                <span
                  key={`highlight-${keyCounter++}`}
                  style={{ color: pattern.color, fontWeight: 600 }}
                >
                  {match[0]}
                </span>
              );
              lastIndex = match.index! + match[0].length;
            });
            // Add remaining text
            if (lastIndex < part.length) {
              newParts.push(part.slice(lastIndex));
            }
          } else {
            newParts.push(part);
          }
        });
        parts = newParts;
      });

      return parts;
    };

    return (
      <div className="bg-gray-800/50 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-3">Raw OCR Text</h3>
        {isEditing ? (
          <div className="space-y-3">
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full h-64 p-3 bg-gray-900 border border-gray-600 rounded-lg text-white font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Edit the extracted text..."
            />
            <div className="flex space-x-2">
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
              <button
                onClick={() => {
                  setIsEditing(false)
                  setEditedText(rawText)
                }}
                className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-gray-900 rounded-lg text-gray-300 font-mono text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
            {renderHighlightedText(rawText)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`${className} text-gray-300`}>
      {/* Header Controls */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold text-white">Extracted Text</h2>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400">Confidence:</span>
            <span className={`text-sm font-medium ${getConfidenceColor(confidence)}`}>
              {(confidence * 100).toFixed(1)}% ({getConfidenceLabel(confidence)})
            </span>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* View Toggle */}
          <div className="flex items-center bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => {
                setShowStructured(true)
                setShowRawText(false)
              }}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                showStructured 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Structured
            </button>
            <button
              onClick={() => {
                setShowStructured(false)
                setShowRawText(true)
              }}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                showRawText 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Raw Text
            </button>
          </div>

          {/* Action Buttons */}
          {onTextCorrection && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Edit text"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}
          
          <button
            onClick={handleCopy}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            title="Copy text"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {showStructured && parsedData && renderStructuredView(parsedData)}
        {showRawText && renderRawTextView()}
        
        {!parsedData && showStructured && (
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
            <p className="text-yellow-300 text-sm">
              ⚠️ Unable to parse document structure. Showing raw text instead.
            </p>
            {renderRawTextView()}
          </div>
        )}
      </div>

      {/* Stats Footer */}
      <div className="mt-6 pt-3 border-t border-gray-700 text-xs text-gray-500">
        <div className="flex justify-between">
          <span>{rawText.split(/\s+/).filter(Boolean).length} words extracted</span>
          <span>Processing method: OCR</span>
        </div>
      </div>
    </div>
  )
}