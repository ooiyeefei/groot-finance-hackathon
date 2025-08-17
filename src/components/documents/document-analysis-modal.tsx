'use client'

import { useState, useEffect } from 'react'
import { X, Languages, Eye, FileText, DollarSign, List } from 'lucide-react'
import DocumentPreviewWithAnnotations from './document-preview-with-annotations'

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
  const [hoveredEntity, setHoveredEntity] = useState<string | null>(null)

  // Fetch document image URL on component mount
  useEffect(() => {
    const fetchDocumentImage = async () => {
      try {
        console.log('[Document Preview] Fetching image for document:', {
          id: document.id,
          fileName: document.file_name,
          fileType: document.file_type,
          storagePath: document.storage_path
        })

        // For PDF documents, try the converted image path used by the system
        if (document.file_type === 'application/pdf' && document.storage_path) {
          // Check if we have a stored converted image path, otherwise use the new pattern
          const convertedImagePath = `converted/${document.storage_path.split('/')[0]}/${document.file_name.replace('.pdf', '.png')}`
          
          console.log('[Document Preview] Trying PDF conversion path:', convertedImagePath)

          try {
            const response = await fetch('/api/documents/image-url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                storagePath: convertedImagePath,
                documentId: document.id 
              })
            })
            
            if (response.ok) {
              const result = await response.json()
              if (result.success && result.imageUrl) {
                console.log('[Document Preview] Successfully found PDF conversion at:', convertedImagePath)
                setDocumentImageUrl(result.imageUrl)
                return
              }
            }
          } catch (pathError) {
            console.log('[Document Preview] Failed to get converted PDF image:', pathError)
          }
          
          console.log('[Document Preview] No PDF conversion found, trying original file')
        }
        
        // Fallback: use original document (works for both images and PDFs if no conversion exists)
        if (document.storage_path) {
          console.log('[Document Preview] Trying original file path:', document.storage_path)
          
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
              console.log('[Document Preview] Successfully loaded original file')
              setDocumentImageUrl(result.imageUrl)
              return
            }
          }
        }
        
        console.warn('[Document Preview] No valid image path found for document')
      } catch (error) {
        console.error('[Document Preview] Failed to fetch document image:', error)
      }
    }

    fetchDocumentImage()
  }, [document])

  const handleTranslate = async () => {
    if (!document.extracted_data?.text) return

    setIsTranslating(true)
    try {
      // Prepare comprehensive text for translation including structured elements
      let textToTranslate = document.extracted_data.text

      // If we have structured financial data, format it properly for translation
      const extractedData = document.extracted_data
      if (extractedData.financial_entities || extractedData.line_items) {
        let structuredText = ''
        
        // Add document header info
        if (extractedData.financial_entities && Array.isArray(extractedData.financial_entities)) {
          extractedData.financial_entities.forEach((entity: any) => {
            if (entity.label && entity.value) {
              structuredText += `${entity.label}: ${entity.value}\n`
            }
          })
          structuredText += '\n'
        }

        // Add line items
        if (extractedData.line_items && extractedData.line_items.length > 0) {
          structuredText += `Line Items:\n`
          extractedData.line_items.forEach((item: any, index: number) => {
            structuredText += `${index + 1}. ${item.description || item.item_description || 'Item'} - ${item.amount || item.unit_price || item.total_amount || 'N/A'}\n`
          })
          structuredText += '\n'
        }

        // Add summary if available - try different possible total amount fields
        const totalAmount = (extractedData as any).total_amount || 
                           (extractedData as any).document_summary?.total_amount?.value ||
                           (extractedData as any).financial_entities?.find((e: any) => e.label?.toLowerCase().includes('total'))?.value
        if (totalAmount) {
          structuredText += `Total Amount: ${totalAmount}\n`
        }

        // Use structured text if we have it, otherwise fall back to raw text
        if (structuredText.trim()) {
          textToTranslate = structuredText + '\n---\nOriginal Text:\n' + document.extracted_data.text
        }
      }

      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: textToTranslate,
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
      entityKey?: string
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
          text: summary.vendor_name.value,
          entityKey: 'vendor_name'
        })
      }
      
      if (summary.total_amount?.bbox) {
        const [x1, y1, x2, y2] = summary.total_amount.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Amount',
          text: summary.total_amount.value,
          entityKey: 'total_amount'
        })
      }
      
      if (summary.transaction_date?.bbox) {
        const [x1, y1, x2, y2] = summary.transaction_date.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Date',
          text: summary.transaction_date.value,
          entityKey: 'transaction_date'
        })
      }
      
      if (summary.document_type?.bbox) {
        const [x1, y1, x2, y2] = summary.document_type.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Document Type',
          text: summary.document_type.value,
          entityKey: 'document_type'
        })
      }
    }

    // Extract from financial entities
    if (document.extracted_data.financial_entities) {
      document.extracted_data.financial_entities.forEach((entity, index) => {
        if (entity.bbox && entity.bbox.length >= 4) {
          const [x1, y1, x2, y2] = entity.bbox
          boundingBoxes.push({
            x1, y1, x2, y2,
            category: entity.category || 'Financial',
            text: entity.value,
            entityKey: `financial_entity_${index}`
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
          text: `${item.description.value} (Item ${index + 1})`,
          entityKey: `line_item_${index}_description`
        })
      }
      
      if (item.quantity?.bbox) {
        const [x1, y1, x2, y2] = item.quantity.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Quantity',
          text: item.quantity.value,
          entityKey: `line_item_${index}_quantity`
        })
      }
      
      if (item.unit_price?.bbox) {
        const [x1, y1, x2, y2] = item.unit_price.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Unit Price',
          text: item.unit_price.value,
          entityKey: `line_item_${index}_unit_price`
        })
      }
      
      if (item.line_total?.bbox) {
        const [x1, y1, x2, y2] = item.line_total.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Line Total',
          text: item.line_total.value,
          entityKey: `line_item_${index}_line_total`
        })
      }
    })

    // Fallback: check if boundingBoxes exist in metadata (original structure)
    if (document.extracted_data.metadata?.boundingBoxes) {
      boundingBoxes.push(...document.extracted_data.metadata.boundingBoxes.map((box: any, index: number) => ({
        ...box,
        entityKey: `metadata_${index}`
      })))
    }

    return boundingBoxes
  }

  // Filter bounding boxes based on hover state
  const getFilteredBoundingBoxes = () => {
    if (!hoveredEntity) return []
    
    const allBoxes = generateBoundingBoxes()
    return allBoxes.filter(box => box.entityKey === hoveredEntity)
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
          {/* Left Pane - Visual (Scrollable) */}
          <div className="w-1/2 border-r border-gray-700 flex flex-col min-h-0">
            <div className="overflow-y-auto flex-1 p-6">
              <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                <FileText className="w-4 h-4 mr-2" />
                Document Preview
              </h4>
              
              {/* Document Preview with Fixed Height (50% of screen) */}
              <div className="mb-6" style={{ height: '50vh', minHeight: '400px' }}>
                <DocumentPreviewWithAnnotations
                  imageUrl={documentImageUrl || undefined}
                  fileName={document.file_name}
                  fileType={document.file_type}
                  fileSize={document.file_size}
                  boundingBoxes={getFilteredBoundingBoxes()}
                  document={document}
                  onBoxHover={setHighlightedBox}
                  onBoxClick={(box) => {
                    console.log('Clicked box:', box)
                    // TODO: Highlight corresponding text in extracted content
                  }}
                />
              </div>

            {/* Translation Feature */}
            <div className="mt-4 bg-gray-700/50 rounded-lg p-4 flex-shrink-0">
              <h5 className="text-sm font-medium text-white mb-4 flex items-center">
                <Languages className="w-4 h-4 mr-2" />
                Translation
              </h5>
              
              <div className="space-y-3">
                {/* Language Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Source Language
                    </label>
                    <select
                      value={sourceLanguage}
                      onChange={(e) => setSourceLanguage(e.target.value)}
                      className="w-full bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Target Language
                    </label>
                    <select
                      value={targetLanguage}
                      onChange={(e) => setTargetLanguage(e.target.value)}
                      className="w-full bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white py-1.5 px-3 rounded-md text-xs font-medium transition-colors flex items-center justify-center"
                >
                  {isTranslating ? (
                    <>
                      <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Translating...
                    </>
                  ) : (
                    <>
                      <Languages className="w-3 h-3 mr-2" />
                      Translate
                    </>
                  )}
                </button>

                {/* Translation Output */}
                {translatedText && (
                  <div className="bg-gray-800 rounded-lg p-3">
                    <h6 className="text-xs font-medium text-gray-300 mb-2">Translation Result</h6>
                    <div className="text-xs text-white whitespace-pre-wrap max-h-64 overflow-y-auto bg-gray-800/50 rounded-md p-3 border border-gray-600">
                      {translatedText}
                    </div>
                  </div>
                )}
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
                        <div 
                          className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                          onMouseEnter={() => setHoveredEntity('document_type')}
                          onMouseLeave={() => setHoveredEntity(null)}
                        >
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
                        <div 
                          className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                          onMouseEnter={() => setHoveredEntity('vendor_name')}
                          onMouseLeave={() => setHoveredEntity(null)}
                        >
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
                        <div 
                          className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                          onMouseEnter={() => setHoveredEntity('total_amount')}
                          onMouseLeave={() => setHoveredEntity(null)}
                        >
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
                        <div 
                          className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                          onMouseEnter={() => setHoveredEntity('transaction_date')}
                          onMouseLeave={() => setHoveredEntity(null)}
                        >
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
                        <div 
                          key={index} 
                          className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                          onMouseEnter={() => setHoveredEntity(`financial_entity_${index}`)}
                          onMouseLeave={() => setHoveredEntity(null)}
                        >
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
                                <td 
                                  className="px-3 py-2 text-white cursor-pointer hover:bg-blue-900/30 rounded"
                                  onMouseEnter={() => setHoveredEntity(`line_item_${index}_description`)}
                                  onMouseLeave={() => setHoveredEntity(null)}
                                >
                                  {item.description?.value || 'N/A'}
                                  {item.description?.confidence && (
                                    <div className="text-xs text-gray-500">
                                      {Math.round(item.description.confidence * 100)}% conf
                                    </div>
                                  )}
                                </td>
                                <td 
                                  className="px-3 py-2 text-right text-white cursor-pointer hover:bg-blue-900/30 rounded"
                                  onMouseEnter={() => setHoveredEntity(`line_item_${index}_quantity`)}
                                  onMouseLeave={() => setHoveredEntity(null)}
                                >
                                  {item.quantity?.value || 'N/A'}
                                </td>
                                <td 
                                  className="px-3 py-2 text-right text-white cursor-pointer hover:bg-blue-900/30 rounded"
                                  onMouseEnter={() => setHoveredEntity(`line_item_${index}_unit_price`)}
                                  onMouseLeave={() => setHoveredEntity(null)}
                                >
                                  {item.unit_price?.value || 'N/A'}
                                </td>
                                <td 
                                  className="px-3 py-2 text-right text-green-400 font-medium cursor-pointer hover:bg-blue-900/30 rounded"
                                  onMouseEnter={() => setHoveredEntity(`line_item_${index}_line_total`)}
                                  onMouseLeave={() => setHoveredEntity(null)}
                                >
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
                      <div className="text-xs text-gray-400 mb-2">Clean OCR Output</div>
                      <div className="text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-64 leading-relaxed">
                        {(() => {
                          // Filter out AI reasoning patterns from the displayed text
                          let cleanText = document.extracted_data.text;
                          
                          // Remove common AI reasoning patterns
                          cleanText = cleanText
                            .replace(/^(Okay,?\s*let's?\s*(tackle|analyze|examine|process|look at)\s*this.*?\.?\s*)/i, '')
                            .replace(/^(Looking at this.*?\.?\s*)/i, '')
                            .replace(/^(I can see.*?\.?\s*)/i, '')
                            .replace(/^(This appears to be.*?\.?\s*)/i, '')
                            .replace(/^(Let me.*?\.?\s*)/i, '')
                            .replace(/^(I'll.*?\.?\s*)/i, '')
                            .replace(/^(First,?\s*I.*?\.?\s*)/i, '')
                            .replace(/^(From what I can see.*?\.?\s*)/i, '')
                            .replace(/^(Based on.*?analysis.*?\.?\s*)/i, '')
                            .replace(/^(After examining.*?\.?\s*)/i, '')
                            .trim();
                          
                          // If text is too short or still contains reasoning, show structured summary instead
                          if (cleanText.length < 50 || /^(I |Let |Looking |Okay |This |From |Based )/i.test(cleanText)) {
                            // Generate comprehensive text from all structured data
                            const parts = [];
                            const summary = document.extracted_data.document_summary;
                            
                            // Document Summary
                            if (summary) {
                              if (summary.document_type?.value) parts.push(`Document Type: ${summary.document_type.value}`);
                              if (summary.vendor_name?.value) parts.push(`Vendor: ${summary.vendor_name.value}`);
                              if (summary.transaction_date?.value) parts.push(`Date: ${summary.transaction_date.value}`);
                              if (summary.total_amount?.value) parts.push(`Total Amount: ${summary.total_amount.value}`);
                            }
                            
                            // Financial Entities
                            const financialEntities = document.extracted_data.financial_entities;
                            if (financialEntities && financialEntities.length > 0) {
                              parts.push('\\n--- Financial Information ---');
                              financialEntities.forEach(entity => {
                                parts.push(`${entity.label}: ${entity.value} (${entity.category})`);
                              });
                            }
                            
                            // Comprehensive Line Items
                            const lineItems = document.extracted_data.line_items;
                            if (lineItems && lineItems.length > 0) {
                              parts.push('\\n--- Line Items ---');
                              lineItems.forEach((item, index) => {
                                const itemParts = [`Item ${index + 1}:`];
                                if (item.description?.value) itemParts.push(`Description: ${item.description.value}`);
                                if (item.quantity?.value) itemParts.push(`Quantity: ${item.quantity.value}`);
                                if (item.unit_price?.value) itemParts.push(`Unit Price: ${item.unit_price.value}`);
                                if (item.line_total?.value) itemParts.push(`Line Total: ${item.line_total.value}`);
                                parts.push(itemParts.join(' | '));
                              });
                            }
                            
                            // Legacy entities fallback
                            const entities = document.extracted_data.entities;
                            if (entities && entities.length > 0 && parts.length === 0) {
                              parts.push('--- Extracted Entities ---');
                              entities.forEach(entity => {
                                parts.push(`${entity.type.replace('_', ' ')}: ${entity.value}`);
                              });
                            }
                            
                            return parts.length > 0 ? parts.join('\\n') : 'Clean structured data extracted successfully';
                          }
                          
                          return cleanText;
                        })()}
                      </div>
                    </div>

                    {/* Raw Data Toggle - Positioned directly below Complete Extracted Text */}
                    <div className="mt-4">
                      <button
                        onClick={() => setShowRawJson(!showRawJson)}
                        className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        {showRawJson ? 'Hide' : 'Show'} Raw JSON Data
                      </button>
                      
                      {showRawJson && (
                        <div className="mt-3 bg-gray-800 rounded-lg p-4">
                          <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-64">
                            {JSON.stringify(document.extracted_data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}