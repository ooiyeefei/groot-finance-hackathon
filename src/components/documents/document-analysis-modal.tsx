'use client'

import { useState, useEffect } from 'react'
import { X, Languages, Eye, FileText, Calendar, DollarSign, Building, Hash, List } from 'lucide-react'
import DocumentPreviewWithAnnotations from './document-preview-with-annotations'
import HtmlContentRenderer from './html-content-renderer'

interface Document {
  id: string
  file_name: string
  file_type: string
  file_size: number
  storage_path?: string
  processing_status: 'pending' | 'processing' | 'ocr_processing' | 'completed' | 'failed'
  created_at: string
  processed_at?: string
  error_message?: string
  extracted_data?: {
    text: string
    entities: Array<{
      type: string
      value: string
      confidence: number
    }>
    document_summary?: {
      document_type?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      vendor_name?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      total_amount?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      transaction_date?: {
        value: string
        confidence: number
        bbox?: number[]
      }
    }
    financial_entities?: Array<{
      label: string
      value: string
      category: string
      confidence: number
      bbox?: number[]
    }>
    line_items?: Array<{
      description?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      quantity?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      unit_price?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      line_total?: {
        value: string
        confidence: number
        bbox?: number[]
      }
    }>
    metadata: {
      pageCount?: number
      wordCount: number
      language?: string
      processingMethod?: 'ocr' | 'text_extraction'
      layoutElements?: Array<{
        bbox?: number[]
        category?: string
        text?: string
      }>
      boundingBoxes?: Array<{
        x1: number
        y1: number
        x2: number
        y2: number
        category: string
        text: string
      }>
    }
  }
  confidence_score?: number
}

interface DocumentAnalysisModalProps {
  document: Document
  onClose: () => void
}

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'th', name: 'Thai' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'zh', name: 'Chinese' }
]

export default function DocumentAnalysisModal({ document, onClose }: DocumentAnalysisModalProps) {
  const [sourceLanguage, setSourceLanguage] = useState('auto')
  const [targetLanguage, setTargetLanguage] = useState('en')
  const [translatedText, setTranslatedText] = useState('')
  const [isTranslating, setIsTranslating] = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)
  const [documentImageUrl, setDocumentImageUrl] = useState<string | null>(null)
  const [highlightedBox, setHighlightedBox] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
    category: string
    text: string
  } | null>(null)

  // Fetch document image URL on component mount
  useEffect(() => {
    const fetchDocumentImage = async () => {
      try {
        // For PDF documents, check if converted image exists
        if (document.file_type === 'application/pdf') {
          // Try to get the converted image URL
          const imageFileName = document.file_name.replace('.pdf', '_page1.png')
          const storagePath = `${document.id}/${document.storage_path?.split('/')[1]}/${imageFileName}`
          
          // Make a request to get signed URL for the converted image
          const response = await fetch('/api/documents/image-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              storagePath,
              documentId: document.id 
            })
          })
          
          if (response.ok) {
            const result = await response.json()
            if (result.success && result.imageUrl) {
              setDocumentImageUrl(result.imageUrl)
              return
            }
          }
        }
        
        // Fallback: use original document if it's an image
        if (document.file_type.startsWith('image/') && document.storage_path) {
          const response = await fetch('/api/documents/image-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              storagePath: document.storage_path,
              documentId: document.id 
            })
          })
          
          if (response.ok) {
            const result = await response.json()
            if (result.success && result.imageUrl) {
              setDocumentImageUrl(result.imageUrl)
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch document image:', error)
      }
    }

    fetchDocumentImage()
  }, [document])

  const handleTranslate = async () => {
    if (!document.extracted_data?.text) return

    setIsTranslating(true)
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: document.extracted_data.text,
          sourceLanguage: sourceLanguage === 'auto' ? 'Thai' : SUPPORTED_LANGUAGES.find(l => l.code === sourceLanguage)?.name || 'English',
          targetLanguage: SUPPORTED_LANGUAGES.find(l => l.code === targetLanguage)?.name || 'English'
        })
      })

      const result = await response.json()
      
      if (result.success) {
        setTranslatedText(result.data.translatedText)
      } else {
        setTranslatedText('Translation failed. Please try again.')
      }
    } catch (error) {
      console.error('Translation error:', error)
      setTranslatedText('Translation failed. Please try again.')
    } finally {
      setIsTranslating(false)
    }
  }

  const getEntityIcon = (type: string) => {
    const normalizedType = type.toLowerCase().replace(/\s+/g, '_')
    
    switch (normalizedType) {
      // Amount/Currency types
      case 'currency':
      case 'amount':
      case 'total':
      case 'subtotal':
      case 'tax_amount':
      case 'discount_amount':
      case 'item_total':
      case 'item_unit_price':
        return <DollarSign className="w-4 h-4 text-green-400" />
      
      // Date types
      case 'date':
      case 'due_date':
      case 'transaction_date':
      case 'invoice_date':
        return <Calendar className="w-4 h-4 text-blue-400" />
      
      // Vendor/Company types
      case 'vendor':
      case 'company':
      case 'business':
      case 'supplier':
      case 'merchant':
        return <Building className="w-4 h-4 text-purple-400" />
      
      // ID/Reference types
      case 'reference_number':
      case 'invoice':
      case 'invoice_id':
      case 'receipt_id':
      case 'transaction_id':
      case 'reference_id':
        return <Hash className="w-4 h-4 text-orange-400" />
      
      // Line item types
      case 'item_description':
      case 'item_quantity':
        return <FileText className="w-4 h-4 text-cyan-400" />
      
      // Address types
      case 'address':
      case 'location':
        return <Building className="w-4 h-4 text-indigo-400" />
      
      // Payment types
      case 'payment_method':
        return <DollarSign className="w-4 h-4 text-yellow-400" />
      
      // Document type
      case 'document_type':
        return <FileText className="w-4 h-4 text-pink-400" />
      
      default:
        return <FileText className="w-4 h-4 text-gray-400" />
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

  // Generate bounding boxes from various sources in the document
  const generateBoundingBoxes = () => {
    const boundingBoxes: Array<{
      x1: number
      y1: number
      x2: number
      y2: number
      category: string
      text: string
    }> = []

    if (!document.extracted_data) return boundingBoxes

    // Extract from document summary bounding boxes
    const summary = document.extracted_data.document_summary
    
    if (summary) {
      if (summary.vendor_name?.bbox) {
        const [x1, y1, x2, y2] = summary.vendor_name.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Vendor',
          text: summary.vendor_name.value
        })
      }
      
      if (summary.total_amount?.bbox) {
        const [x1, y1, x2, y2] = summary.total_amount.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Amount',
          text: summary.total_amount.value
        })
      }
      
      if (summary.transaction_date?.bbox) {
        const [x1, y1, x2, y2] = summary.transaction_date.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Date',
          text: summary.transaction_date.value
        })
      }
      
      if (summary.document_type?.bbox) {
        const [x1, y1, x2, y2] = summary.document_type.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Document Type',
          text: summary.document_type.value
        })
      }
    }

    // Extract from financial entities
    if (document.extracted_data.financial_entities) {
      document.extracted_data.financial_entities.forEach(entity => {
        if (entity.bbox && entity.bbox.length >= 4) {
          const [x1, y1, x2, y2] = entity.bbox
          boundingBoxes.push({
            x1, y1, x2, y2,
            category: entity.category || 'Financial',
            text: entity.value
          })
        }
      })
    }

    // Extract from line items
    const lineItems = document.extracted_data.line_items || []
    
    lineItems.forEach((item, index) => {
      if (item.description?.bbox) {
        const [x1, y1, x2, y2] = item.description.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Line Item',
          text: `${item.description.value} (Item ${index + 1})`
        })
      }
      
      if (item.quantity?.bbox) {
        const [x1, y1, x2, y2] = item.quantity.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Quantity',
          text: item.quantity.value
        })
      }
      
      if (item.unit_price?.bbox) {
        const [x1, y1, x2, y2] = item.unit_price.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Unit Price',
          text: item.unit_price.value
        })
      }
      
      if (item.line_total?.bbox) {
        const [x1, y1, x2, y2] = item.line_total.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Line Total',
          text: item.line_total.value
        })
      }
    })

    // Fallback: check if boundingBoxes exist in metadata (original structure)
    if (document.extracted_data.metadata?.boundingBoxes) {
      boundingBoxes.push(...document.extracted_data.metadata.boundingBoxes)
    }

    return boundingBoxes
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
              <h3 className="text-lg font-medium text-white">Document Analysis</h3>
              <p className="text-sm text-gray-400 mt-1">
                {document.file_name} • {formatDate(document.processed_at || document.created_at)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {/* Modal Content - Two Pane Layout */}
        <div className="flex-1 flex min-h-0">
          {/* Left Pane - Visual */}
          <div className="w-1/2 p-6 border-r border-gray-700 flex flex-col min-h-0">
            <h4 className="text-sm font-medium text-white mb-4 flex items-center flex-shrink-0">
              <FileText className="w-4 h-4 mr-2" />
              Document Preview
            </h4>
            
            {/* Document Preview with Annotations */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 max-w-full">
                <DocumentPreviewWithAnnotations
                  imageUrl={documentImageUrl || undefined}
                  fileName={document.file_name}
                  fileType={document.file_type}
                  fileSize={document.file_size}
                  boundingBoxes={generateBoundingBoxes()}
                  document={document}
                  onBoxHover={setHighlightedBox}
                  onBoxClick={(box) => {
                    console.log('Clicked box:', box)
                    // TODO: Highlight corresponding text in extracted content
                  }}
                />
              </div>
            </div>

            {/* Processing Stats */}
            <div className="mt-4 bg-gray-700/50 rounded-lg p-4 flex-shrink-0">
              <h5 className="text-sm font-medium text-white mb-2">Processing Information</h5>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-400">Status:</span>
                  <span className="ml-2 text-green-400 capitalize">{document.processing_status}</span>
                </div>
                <div>
                  <span className="text-gray-400">Confidence:</span>
                  <span className="ml-2 text-white">
                    {document.confidence_score ? `${Math.round(document.confidence_score * 100)}%` : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Entities:</span>
                  <span className="ml-2 text-white">
                    {document.extracted_data?.entities?.length || 0}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Words:</span>
                  <span className="ml-2 text-white">
                    {document.extracted_data?.metadata?.wordCount || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Pane - Data & Translation */}
          <div className="w-1/2 flex flex-col min-h-0">
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="space-y-6">
                {/* Processing Status & Errors */}
                {document.extracted_data?.text && (document.extracted_data.text.includes('error') || document.extracted_data.text.includes('failed')) && (
                  <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-red-400 mb-2">Processing Issue</h4>
                    <p className="text-sm text-red-300 whitespace-pre-wrap">{document.extracted_data.text}</p>
                  </div>
                )}

                {/* Document Summary */}
                {document.extracted_data?.document_summary && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Document Summary
                      {highlightedBox && (
                        <span className="ml-2 px-2 py-1 bg-blue-600 text-xs rounded">
                          Hovering: {highlightedBox.category}
                        </span>
                      )}
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {document.extracted_data.document_summary.document_type && (
                        <div className="bg-gray-900 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-1">Document Type</div>
                          <div className="text-sm text-white font-medium">
                            {document.extracted_data.document_summary.document_type.value}
                          </div>
                          <div className="text-xs text-gray-500">
                            Confidence: {Math.round((document.extracted_data.document_summary.document_type.confidence || 0) * 100)}%
                          </div>
                        </div>
                      )}
                      
                      {document.extracted_data.document_summary.vendor_name && (
                        <div className="bg-gray-900 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-1">Vendor</div>
                          <div className="text-sm text-white font-medium">
                            {document.extracted_data.document_summary.vendor_name.value}
                          </div>
                          <div className="text-xs text-gray-500">
                            Confidence: {Math.round((document.extracted_data.document_summary.vendor_name.confidence || 0) * 100)}%
                          </div>
                        </div>
                      )}
                      
                      {document.extracted_data.document_summary.total_amount && (
                        <div className="bg-gray-900 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-1">Amount</div>
                          <div className="text-sm text-green-400 font-medium">
                            ${document.extracted_data.document_summary.total_amount.value}
                          </div>
                          <div className="text-xs text-gray-500">
                            Confidence: {Math.round((document.extracted_data.document_summary.total_amount.confidence || 0) * 100)}%
                          </div>
                        </div>
                      )}
                      
                      {document.extracted_data.document_summary.transaction_date && (
                        <div className="bg-gray-900 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-1">Date</div>
                          <div className="text-sm text-white font-medium">
                            {document.extracted_data.document_summary.transaction_date.value}
                          </div>
                          <div className="text-xs text-gray-500">
                            Confidence: {Math.round((document.extracted_data.document_summary.transaction_date.confidence || 0) * 100)}%
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Financial Entities */}
                {document.extracted_data?.financial_entities && document.extracted_data.financial_entities.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Financial Entities ({document.extracted_data.financial_entities.length})
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {document.extracted_data.financial_entities.map((entity, index) => (
                        <div key={index} className="bg-gray-900 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-1">{entity.label}</div>
                          <div className="text-sm text-white font-medium">{entity.value}</div>
                          <div className="text-xs text-gray-500">
                            {entity.category} • Confidence: {Math.round((entity.confidence || 0) * 100)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Line Items Table */}
                {document.extracted_data?.line_items && document.extracted_data.line_items.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                      <List className="w-4 h-4 mr-2" />
                      Line Items ({document.extracted_data.line_items.length})
                    </h4>
                    
                    <div className="bg-gray-900 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-800">
                            <tr>
                              <th className="px-3 py-2 text-left text-gray-400 font-medium">#</th>
                              <th className="px-3 py-2 text-left text-gray-400 font-medium">Description</th>
                              <th className="px-3 py-2 text-right text-gray-400 font-medium">Qty</th>
                              <th className="px-3 py-2 text-right text-gray-400 font-medium">Unit Price</th>
                              <th className="px-3 py-2 text-right text-gray-400 font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-700">
                            {document.extracted_data.line_items.map((item, index) => (
                              <tr key={index} className="hover:bg-gray-800">
                                <td className="px-3 py-2 text-gray-400">{index + 1}</td>
                                <td className="px-3 py-2 text-white">
                                  {item.description?.value || 'N/A'}
                                  {item.description?.confidence && (
                                    <div className="text-xs text-gray-500">
                                      {Math.round(item.description.confidence * 100)}% conf
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right text-white">
                                  {item.quantity?.value || 'N/A'}
                                </td>
                                <td className="px-3 py-2 text-right text-white">
                                  {item.unit_price?.value || 'N/A'}
                                </td>
                                <td className="px-3 py-2 text-right text-green-400 font-medium">
                                  {item.line_total?.value || 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Full Extracted Text */}
                {document.extracted_data?.text && !(document.extracted_data.text.includes('error') || document.extracted_data.text.includes('failed')) && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Complete Extracted Text
                    </h4>
                    
                    <div className="bg-gray-900 rounded-lg p-4">
                      <div className="text-xs text-gray-400 mb-2">Raw OCR Output</div>
                      <div className="text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-64 leading-relaxed">
                        {document.extracted_data.text}
                      </div>
                    </div>
                  </div>
                )}

                {/* Detected Entities */}
                <div>
                  <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                    <DollarSign className="w-4 h-4 mr-2" />
                    Detected Financial Information
                  </h4>
                  
                  {document.extracted_data?.entities && document.extracted_data.entities.length > 0 ? (
                    <div className="space-y-2">
                      {document.extracted_data.entities.map((entity, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3"
                        >
                          <div className="flex items-center space-x-3">
                            {getEntityIcon(entity.type)}
                            <div>
                              <div className="text-sm font-medium text-white capitalize">
                                {entity.type.replace('_', ' ')}
                              </div>
                              <div className="text-sm text-gray-300">{entity.value}</div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-400">
                            {Math.round(entity.confidence * 100)}% confident
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-400">
                      <FileText className="w-6 h-6 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No financial entities detected</p>
                      {document.extracted_data?.text && !document.extracted_data.text.includes('error') && (
                        <p className="text-xs text-gray-500 mt-1">Text was extracted but no structured financial data was found</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Translation Feature */}
                <div>
                  <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                    <Languages className="w-4 h-4 mr-2" />
                    Translation
                  </h4>
                  
                  <div className="space-y-4">
                    {/* Language Selection */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-2">
                          Source Language
                        </label>
                        <select
                          value={sourceLanguage}
                          onChange={(e) => setSourceLanguage(e.target.value)}
                          className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="auto">Auto-detect</option>
                          {SUPPORTED_LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                              {lang.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-2">
                          Target Language
                        </label>
                        <select
                          value={targetLanguage}
                          onChange={(e) => setTargetLanguage(e.target.value)}
                          className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          {SUPPORTED_LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                              {lang.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Translate Button */}
                    <button
                      onClick={handleTranslate}
                      disabled={isTranslating || !document.extracted_data?.text}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center"
                    >
                      {isTranslating ? (
                        <>
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                          Translating...
                        </>
                      ) : (
                        <>
                          <Languages className="w-4 h-4 mr-2" />
                          Translate
                        </>
                      )}
                    </button>

                    {/* Translation Output */}
                    {translatedText && (
                      <div className="bg-gray-900 rounded-lg p-4">
                        <h5 className="text-xs font-medium text-gray-300 mb-2">Translation Result</h5>
                        <div className="text-sm text-white whitespace-pre-wrap">
                          {translatedText}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Raw Data Toggle */}
                <div>
                  <button
                    onClick={() => setShowRawJson(!showRawJson)}
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {showRawJson ? 'Hide' : 'Show'} Raw JSON Data
                  </button>
                  
                  {showRawJson && (
                    <div className="mt-3 bg-gray-900 rounded-lg p-4">
                      <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-64">
                        {JSON.stringify(document.extracted_data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}