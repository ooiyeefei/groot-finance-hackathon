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
  converted_image_path?: string
  converted_image_width?: number
  converted_image_height?: number
  processing_status: 'pending' | 'processing' | 'completed' | 'failed' | 'classifying' | 'classification_failed' | 'pending_extraction' | 'extracting'
  created_at: string
  processed_at?: string
  error_message?: string
  extracted_data?: {
    text?: string

    // AI direct fields (new format)
    vendor_name?: string
    document_type?: string
    total_amount?: string | number
    currency?: string
    document_date?: string
    transaction_date?: string
    document_number?: string
    line_items?: any[]
    ai_confidence?: number
    confidence_score?: number

    // Legacy support (for backward compatibility)
    entities?: Array<{
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
      vendor_address?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      vendor_contact?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      vendor_tax_id?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      customer_name?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      customer_address?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      customer_contact?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      document_number?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      purchase_order_number?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      reference_numbers?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      due_date?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      delivery_date?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      payment_terms?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      payment_method?: {
        value: string
        confidence: number
        bbox?: number[]
      }
      bank_details?: {
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
      currency?: {
        value: string
        confidence: number
        bbox?: number[]
      }
    }
    document_specific_data?: {
      invoice_data?: {
        invoice_number?: string
        customer_info?: {
          name?: string
        }
        payment_terms?: string
        due_date?: string
      }
      receipt_data?: {
        receipt_number?: string
        payment_method?: string
        cashier_id?: string
      }
      transport_data?: {
        trip_id?: string
        pickup_location?: string
        dropoff_location?: string
      }
      bill_data?: {
        account_number?: string
        billing_period?: string
        due_date?: string
      }
    }
    financial_entities?: Array<{
      label: string
      value: string
      category: string
      confidence: number
      bbox?: number[]
    }>
    // line_items moved to AI direct fields above for consistency
    metadata: {
      pageCount?: number
      wordCount: number
      language?: string
      processingMethod?: 'ocr' | 'text_extraction'
      ai_confidence?: number
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
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoadingPage, setIsLoadingPage] = useState(false)
  const [highlightedBox, setHighlightedBox] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
    category: string
    text: string
  } | null>(null)
  const [hoveredEntity, setHoveredEntity] = useState<string | null>(null)

  // Function to fetch a specific page
  const fetchDocumentPage = async (pageNumber: number = 1) => {
    setIsLoadingPage(true)
    try {
      console.log('[Document Preview] Fetching page', pageNumber, 'for document:', {
        id: document.id,
        fileName: document.file_name,
        fileType: document.file_type,
        storagePath: document.storage_path
      })

        // For PDF documents, try the converted image path
        if (document.file_type === 'application/pdf') {
          // First try the stored converted image path from database
          if (document.converted_image_path) {
            console.log('[Document Preview] Using stored converted image path:', document.converted_image_path)
            
            try {
              const response = await fetch('/api/invoices/image-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  storagePath: document.converted_image_path,
                  documentId: document.id,
                  bucketName: 'invoices',
                  pageNumber: pageNumber
                })
              })

              if (response.ok) {
                const result = await response.json()
                if (result.success && result.imageUrl) {
                  console.log('[Document Preview] Successfully loaded page', pageNumber, '- total pages:', result.totalPages)
                  setDocumentImageUrl(result.imageUrl)
                  setCurrentPage(result.currentPage || pageNumber)
                  setTotalPages(result.totalPages || 1)
                  setIsLoadingPage(false)
                  return
                }
              }
            } catch (pathError) {
              console.log('[Document Preview] Failed to get stored converted image:', pathError)
            }
          }
          
          // Fallback: try constructing the path if no stored path exists
          if (document.storage_path) {
            const convertedImagePath = `converted/${document.storage_path.split('/')[0]}/${document.file_name.replace('.pdf', '.png')}`
            
            console.log('[Document Preview] Trying constructed PDF conversion path:', convertedImagePath)

            try {
              const response = await fetch('/api/invoices/image-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  storagePath: convertedImagePath,
                  documentId: document.id,
                  bucketName: 'invoices',
                  pageNumber: pageNumber
                })
              })

              if (response.ok) {
                const result = await response.json()
                if (result.success && result.imageUrl) {
                  console.log('[Document Preview] Successfully found PDF conversion at:', convertedImagePath, '- total pages:', result.totalPages)
                  setDocumentImageUrl(result.imageUrl)
                  setCurrentPage(result.currentPage || pageNumber)
                  setTotalPages(result.totalPages || 1)
                  setIsLoadingPage(false)
                  return
                }
              }
            } catch (pathError) {
              console.log('[Document Preview] Failed to get constructed converted PDF image:', pathError)
            }
          }
          
          console.log('[Document Preview] No PDF conversion found, trying original file')
        }
        
        // Fallback: use original document (works for both images and PDFs if no conversion exists)
        if (document.storage_path) {
          console.log('[Document Preview] Trying original file path:', document.storage_path)
          
          const response = await fetch('/api/invoices/image-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storagePath: document.storage_path,
              documentId: document.id,
              bucketName: 'invoices',
              pageNumber: pageNumber
            })
          })

          if (response.ok) {
            const result = await response.json()
            if (result.success && result.imageUrl) {
              console.log('[Document Preview] Successfully loaded original file - total pages:', result.totalPages)
              setDocumentImageUrl(result.imageUrl)
              setCurrentPage(result.currentPage || pageNumber)
              setTotalPages(result.totalPages || 1)
              setIsLoadingPage(false)
              return
            }
          }
        }
        
        console.warn('[Document Preview] No valid image path found for document page', pageNumber)
      } catch (error) {
        console.error('[Document Preview] Failed to fetch document image:', error)
      } finally {
        setIsLoadingPage(false)
      }
    }

    // Fetch initial page on component mount
    useEffect(() => {
      fetchDocumentPage(1)
    }, [document])

    // Page navigation handlers
    const handlePreviousPage = () => {
      if (currentPage > 1) {
        fetchDocumentPage(currentPage - 1)
      }
    }

    const handleNextPage = () => {
      if (currentPage < totalPages) {
        fetchDocumentPage(currentPage + 1)
      }
    }

  const handleTranslate = async () => {
    if (!document.extracted_data) return

    setIsTranslating(true)
    try {
      // Prepare comprehensive text for translation including structured elements
      let textToTranslate = document.extracted_data.text || ''

      // Handle AI structure - extract relevant text for translation
      const extractedData = document.extracted_data
      if (!textToTranslate && extractedData) {
        // Build text from direct AI fields
        let aiText = []

        if (extractedData.vendor_name) aiText.push(`Vendor: ${extractedData.vendor_name}`)
        if (extractedData.document_number) aiText.push(`Document Number: ${extractedData.document_number}`)
        if (extractedData.total_amount) {
          const currency = extractedData.currency || 'SGD'
          aiText.push(`Amount: ${extractedData.total_amount} ${currency}`)
        }
        if (extractedData.transaction_date) aiText.push(`Date: ${extractedData.transaction_date}`)

        // Fallback: try legacy document_summary structure
        if (aiText.length === 0 && extractedData.document_summary) {
          const summary = extractedData.document_summary
          if (summary.vendor_name?.value) aiText.push(`Vendor: ${summary.vendor_name.value}`)
          if (summary.document_number?.value) aiText.push(`Document Number: ${summary.document_number.value}`)
          if (summary.total_amount?.value && summary.currency?.value) {
            aiText.push(`Amount: ${summary.total_amount.value} ${summary.currency.value}`)
          }
          if (summary.transaction_date?.value) aiText.push(`Date: ${summary.transaction_date.value}`)
        }

        textToTranslate = aiText.join('\n')

        console.log('[DocumentAnalysis] Translation text prepared from AI structure:', textToTranslate)
      }

      // If we have structured financial data, format it properly for translation
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
      // Vendor information
      if (summary.vendor_name?.bbox) {
        const [x1, y1, x2, y2] = summary.vendor_name.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Vendor Name',
          text: summary.vendor_name.value,
          entityKey: 'vendor_name'
        })
      }
      
      if (summary.vendor_address?.bbox) {
        const [x1, y1, x2, y2] = summary.vendor_address.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Vendor Address',
          text: summary.vendor_address.value,
          entityKey: 'vendor_address'
        })
      }
      
      if (summary.vendor_contact?.bbox) {
        const [x1, y1, x2, y2] = summary.vendor_contact.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Vendor Contact',
          text: summary.vendor_contact.value,
          entityKey: 'vendor_contact'
        })
      }
      
      if (summary.vendor_tax_id?.bbox) {
        const [x1, y1, x2, y2] = summary.vendor_tax_id.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Tax ID',
          text: summary.vendor_tax_id.value,
          entityKey: 'vendor_tax_id'
        })
      }
      
      // Customer information
      if (summary.customer_name?.bbox) {
        const [x1, y1, x2, y2] = summary.customer_name.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Customer Name',
          text: summary.customer_name.value,
          entityKey: 'customer_name'
        })
      }
      
      if (summary.customer_address?.bbox) {
        const [x1, y1, x2, y2] = summary.customer_address.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Customer Address',
          text: summary.customer_address.value,
          entityKey: 'customer_address'
        })
      }
      
      if (summary.customer_contact?.bbox) {
        const [x1, y1, x2, y2] = summary.customer_contact.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Customer Contact',
          text: summary.customer_contact.value,
          entityKey: 'customer_contact'
        })
      }
      
      // Document identifiers
      if (summary.document_number?.bbox) {
        const [x1, y1, x2, y2] = summary.document_number.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Document Number',
          text: summary.document_number.value,
          entityKey: 'document_number'
        })
      }
      
      if (summary.purchase_order_number?.bbox) {
        const [x1, y1, x2, y2] = summary.purchase_order_number.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'PO Number',
          text: summary.purchase_order_number.value,
          entityKey: 'purchase_order_number'
        })
      }
      
      if (summary.reference_numbers?.bbox) {
        const [x1, y1, x2, y2] = summary.reference_numbers.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Reference Numbers',
          text: summary.reference_numbers.value,
          entityKey: 'reference_numbers'
        })
      }
      
      // Payment information
      if (summary.payment_terms?.bbox) {
        const [x1, y1, x2, y2] = summary.payment_terms.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Payment Terms',
          text: summary.payment_terms.value,
          entityKey: 'payment_terms'
        })
      }
      
      if (summary.payment_method?.bbox) {
        const [x1, y1, x2, y2] = summary.payment_method.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Payment Method',
          text: summary.payment_method.value,
          entityKey: 'payment_method'
        })
      }
      
      if (summary.bank_details?.bbox) {
        const [x1, y1, x2, y2] = summary.bank_details.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Bank Details',
          text: summary.bank_details.value,
          entityKey: 'bank_details'
        })
      }
      
      // Financial and date information
      if (summary.total_amount?.bbox) {
        const [x1, y1, x2, y2] = summary.total_amount.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Amount',
          text: summary.total_amount.value,
          entityKey: 'total_amount'
        })
      }

      // Tax-related financial fields (type-safe access)
      if ((summary as any).subtotal_amount?.bbox) {
        const [x1, y1, x2, y2] = (summary as any).subtotal_amount.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Subtotal',
          text: (summary as any).subtotal_amount.value,
          entityKey: 'subtotal_amount'
        })
      }

      if ((summary as any).tax_amount?.bbox) {
        const [x1, y1, x2, y2] = (summary as any).tax_amount.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Tax Amount',
          text: (summary as any).tax_amount.value,
          entityKey: 'tax_amount'
        })
      }

      if ((summary as any).discount_amount?.bbox) {
        const [x1, y1, x2, y2] = (summary as any).discount_amount.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Discount',
          text: (summary as any).discount_amount.value,
          entityKey: 'discount_amount'
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
      
      if (summary.due_date?.bbox) {
        const [x1, y1, x2, y2] = summary.due_date.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Due Date',
          text: summary.due_date.value,
          entityKey: 'due_date'
        })
      }
      
      if (summary.delivery_date?.bbox) {
        const [x1, y1, x2, y2] = summary.delivery_date.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Delivery Date',
          text: summary.delivery_date.value,
          entityKey: 'delivery_date'
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
      
      if (item.item_code?.bbox) {
        const [x1, y1, x2, y2] = item.item_code.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Item Code',
          text: item.item_code.value,
          entityKey: `line_item_${index}_item_code`
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
      
      if (item.unit_measurement?.bbox) {
        const [x1, y1, x2, y2] = item.unit_measurement.bbox
        boundingBoxes.push({
          x1, y1, x2, y2,
          category: 'Unit Measurement',
          text: item.unit_measurement.value,
          entityKey: `line_item_${index}_unit_measurement`
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

  // Helper function to safely get field values from AI structure
  const getFieldValue = (fieldName: string, fallbackField?: string): string => {
    const extractedData = document.extracted_data as any;

    if (!extractedData) return '';

    // AI stores values directly (e.g., vendor_name, total_amount, document_date)
    if (extractedData[fieldName]) {
      return String(extractedData[fieldName]);
    }

    // Try fallback field if provided (e.g., document_date -> transaction_date)
    if (fallbackField && extractedData[fallbackField]) {
      return String(extractedData[fallbackField]);
    }

    // Legacy fallback: try nested document_summary structure for backward compatibility
    if (extractedData.document_summary && extractedData.document_summary[fieldName]) {
      const summaryValue = extractedData.document_summary[fieldName];
      if (typeof summaryValue === 'object' && summaryValue.value) {
        return String(summaryValue.value);
      }
      return String(summaryValue);
    }

    return '';
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
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-medium text-white flex items-center">
                  <FileText className="w-4 h-4 mr-2" />
                  Document Preview
                </h4>

                {/* Page Navigation - Only show if more than 1 page */}
                {totalPages > 1 && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1 || isLoadingPage}
                      className="px-2 py-1 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:opacity-50 text-white text-xs rounded transition-colors"
                    >
                      ◀ Previous
                    </button>
                    <span className="text-xs text-gray-300 px-2">
                      {isLoadingPage ? 'Loading...' : `Page ${currentPage} of ${totalPages}`}
                    </span>
                    <button
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages || isLoadingPage}
                      className="px-2 py-1 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:opacity-50 text-white text-xs rounded transition-colors"
                    >
                      Next ▶
                    </button>
                  </div>
                )}
              </div>

              {/* Document Preview with Fixed Height (50% of screen) */}
              <div className="mb-6" style={{ height: '50vh', minHeight: '400px' }}>
                <DocumentPreviewWithAnnotations
                  imageUrl={documentImageUrl || undefined}
                  fileName={document.file_name}
                  fileType={document.file_type}
                  fileSize={document.file_size}
                  boundingBoxes={getFilteredBoundingBoxes()}
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
                  disabled={isTranslating || !document.extracted_data}
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
                  <span className="text-gray-400">AI Confidence:</span>
                  <span className="ml-2 text-white">
                    {(() => {
                      // Try multiple possible confidence score locations for robust access
                      const aiConfidence = document.extracted_data?.ai_confidence ||
                                         document.extracted_data?.confidence_score ||
                                         document.confidence_score ||
                                         // Legacy fallback
                                         document.extracted_data?.metadata?.ai_confidence;

                      console.log('[DocumentAnalysis] AI Confidence debug:', {
                        aiConfidence,
                        extracted_data_keys: document.extracted_data ? Object.keys(document.extracted_data) : null,
                        hasDirectAiConfidence: !!(document.extracted_data?.ai_confidence),
                        hasConfidenceScore: !!(document.extracted_data?.confidence_score)
                      });

                      return aiConfidence ? `${Math.round(aiConfidence * 100)}%` : 'N/A';
                    })()}
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

                {/* Document Summary - AI Structure */}
                {document.extracted_data && (
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
                      {getFieldValue('document_type') && (
                        <div
                          className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                          onMouseEnter={() => setHoveredEntity('document_type')}
                          onMouseLeave={() => setHoveredEntity(null)}
                        >
                          <div className="text-xs text-gray-400 mb-1">Document Type</div>
                          <div className="text-sm text-white font-medium">
                            {getFieldValue('document_type')}
                          </div>
                        </div>
                      )}

                      {getFieldValue('vendor_name') && (
                        <div
                          className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                          onMouseEnter={() => setHoveredEntity('vendor_name')}
                          onMouseLeave={() => setHoveredEntity(null)}
                        >
                          <div className="text-xs text-gray-400 mb-1">Vendor</div>
                          <div className="text-sm text-white font-medium">
                            {getFieldValue('vendor_name')}
                          </div>
                        </div>
                      )}

                      {getFieldValue('total_amount') && (
                        <div
                          className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                          onMouseEnter={() => setHoveredEntity('total_amount')}
                          onMouseLeave={() => setHoveredEntity(null)}
                        >
                          <div className="text-xs text-gray-400 mb-1">Amount</div>
                          <div className="text-sm text-green-400 font-medium">
                            {getFieldValue('currency') || 'SGD'} {getFieldValue('total_amount')}
                          </div>
                        </div>
                      )}

                      {getFieldValue('document_date', 'transaction_date') && (
                        <div
                          className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                          onMouseEnter={() => setHoveredEntity('transaction_date')}
                          onMouseLeave={() => setHoveredEntity(null)}
                        >
                          <div className="text-xs text-gray-400 mb-1">Date</div>
                          <div className="text-sm text-white font-medium">
                            {getFieldValue('document_date', 'transaction_date')}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Vendor Information - AI Structure */}
                {document.extracted_data && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Vendor Information
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div
                        className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                        onMouseEnter={() => setHoveredEntity('vendor_address')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-gray-400 mb-1">Address</div>
                        <div className="text-sm text-white font-medium">
                          {getFieldValue('vendor_address') || (
                            <span className="text-gray-500 italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                        onMouseEnter={() => setHoveredEntity('vendor_contact')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-gray-400 mb-1">Contact</div>
                        <div className="text-sm text-white font-medium">
                          {getFieldValue('vendor_contact') || (
                            <span className="text-gray-500 italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                        onMouseEnter={() => setHoveredEntity('vendor_tax_id')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-gray-400 mb-1">Tax ID / Registration</div>
                        <div className="text-sm text-white font-medium">
                          {getFieldValue('vendor_tax_id') || (
                            <span className="text-gray-500 italic">Not extracted</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Customer Information - AI Structure */}
                {document.extracted_data && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Customer Information
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div
                        className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                        onMouseEnter={() => setHoveredEntity('customer_name')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-gray-400 mb-1">Customer Name</div>
                        <div className="text-sm text-white font-medium">
                          {getFieldValue('customer_name') || (
                            <span className="text-gray-500 italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                        onMouseEnter={() => setHoveredEntity('customer_address')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-gray-400 mb-1">Customer Address</div>
                        <div className="text-sm text-white font-medium">
                          {getFieldValue('customer_address') || (
                            <span className="text-gray-500 italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                        onMouseEnter={() => setHoveredEntity('customer_contact')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-gray-400 mb-1">Customer Contact</div>
                        <div className="text-sm text-white font-medium">
                          {getFieldValue('customer_contact') || (
                            <span className="text-gray-500 italic">Not extracted</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Document Identifiers - AI Structure */}
                {document.extracted_data && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Document Information
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div
                        className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                        onMouseEnter={() => setHoveredEntity('document_number')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-gray-400 mb-1">Document Number</div>
                        <div className="text-sm text-white font-medium">
                          {getFieldValue('document_number') || (
                            <span className="text-gray-500 italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                        onMouseEnter={() => setHoveredEntity('due_date')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-gray-400 mb-1">Due Date</div>
                        <div className="text-sm text-white font-medium">
                          {getFieldValue('due_date') || (
                            <span className="text-gray-500 italic">Not extracted</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment Information - AI Structure */}
                {document.extracted_data && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Payment Information
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div
                        className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                        onMouseEnter={() => setHoveredEntity('payment_terms')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-gray-400 mb-1">Payment Terms</div>
                        <div className="text-sm text-white font-medium">
                          {getFieldValue('payment_terms') || (
                            <span className="text-gray-500 italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                        onMouseEnter={() => setHoveredEntity('payment_method')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-gray-400 mb-1">Payment Method</div>
                        <div className="text-sm text-white font-medium">
                          {getFieldValue('payment_method') || (
                            <span className="text-gray-500 italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500 md:col-span-2"
                        onMouseEnter={() => setHoveredEntity('bank_details')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-gray-400 mb-1">Bank Details</div>
                        <div className="text-sm text-white font-medium">
                          {getFieldValue('bank_details') || (
                            <span className="text-gray-500 italic">Not extracted</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tax Information - AI Structure */}
                {document.extracted_data && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Tax & Financial Breakdown
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div
                        className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                        onMouseEnter={() => setHoveredEntity('subtotal_amount')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-gray-400 mb-1">Subtotal</div>
                        <div className="text-sm text-white font-medium">
                          {getFieldValue('subtotal_amount') || (
                            <span className="text-gray-500 italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                        onMouseEnter={() => setHoveredEntity('tax_amount')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-gray-400 mb-1">Tax Amount</div>
                        <div className="text-sm text-orange-400 font-medium">
                          {getFieldValue('tax_amount') || (
                            <span className="text-gray-500 italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors border border-transparent hover:border-blue-500"
                        onMouseEnter={() => setHoveredEntity('discount_amount')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-gray-400 mb-1">Discount</div>
                        <div className="text-sm text-blue-400 font-medium">
                          {getFieldValue('discount_amount') || (
                            <span className="text-gray-500 italic">Not extracted</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Document-Specific Information */}
                {document.extracted_data?.document_specific_data && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-white mb-4 flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Document-Specific Information
                    </h4>
                    
                    <div className="space-y-4">
                      {/* Invoice Data */}
                      {document.extracted_data.document_specific_data.invoice_data && (
                        <div className="bg-gray-900 rounded-lg p-4">
                          <h5 className="text-sm font-medium text-blue-400 mb-2">Invoice Details</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            {document.extracted_data.document_specific_data.invoice_data.invoice_number && (
                              <div>
                                <span className="text-gray-400">Invoice Number:</span>
                                <span className="ml-2 text-white font-medium">
                                  {document.extracted_data.document_specific_data.invoice_data.invoice_number}
                                </span>
                              </div>
                            )}
                            {document.extracted_data.document_specific_data.invoice_data.customer_info?.name && (
                              <div>
                                <span className="text-gray-400">Customer:</span>
                                <span className="ml-2 text-white font-medium">
                                  {document.extracted_data.document_specific_data.invoice_data.customer_info.name}
                                </span>
                              </div>
                            )}
                            {document.extracted_data.document_specific_data.invoice_data.payment_terms && (
                              <div>
                                <span className="text-gray-400">Payment Terms:</span>
                                <span className="ml-2 text-white font-medium">
                                  {document.extracted_data.document_specific_data.invoice_data.payment_terms}
                                </span>
                              </div>
                            )}
                            {document.extracted_data.document_specific_data.invoice_data.due_date && (
                              <div>
                                <span className="text-gray-400">Due Date:</span>
                                <span className="ml-2 text-white font-medium">
                                  {document.extracted_data.document_specific_data.invoice_data.due_date}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Receipt Data */}
                      {document.extracted_data.document_specific_data.receipt_data && (
                        <div className="bg-gray-900 rounded-lg p-4">
                          <h5 className="text-sm font-medium text-green-400 mb-2">Receipt Details</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            {document.extracted_data.document_specific_data.receipt_data.receipt_number && (
                              <div>
                                <span className="text-gray-400">Receipt Number:</span>
                                <span className="ml-2 text-white font-medium">
                                  {document.extracted_data.document_specific_data.receipt_data.receipt_number}
                                </span>
                              </div>
                            )}
                            {document.extracted_data.document_specific_data.receipt_data.payment_method && (
                              <div>
                                <span className="text-gray-400">Payment Method:</span>
                                <span className="ml-2 text-white font-medium">
                                  {document.extracted_data.document_specific_data.receipt_data.payment_method}
                                </span>
                              </div>
                            )}
                            {document.extracted_data.document_specific_data.receipt_data.cashier_id && (
                              <div>
                                <span className="text-gray-400">Cashier ID:</span>
                                <span className="ml-2 text-white font-medium">
                                  {document.extracted_data.document_specific_data.receipt_data.cashier_id}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Transport Data */}
                      {document.extracted_data.document_specific_data.transport_data && (
                        <div className="bg-gray-900 rounded-lg p-4">
                          <h5 className="text-sm font-medium text-yellow-400 mb-2">Transport Details</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            {document.extracted_data.document_specific_data.transport_data.trip_id && (
                              <div>
                                <span className="text-gray-400">Trip ID:</span>
                                <span className="ml-2 text-white font-medium">
                                  {document.extracted_data.document_specific_data.transport_data.trip_id}
                                </span>
                              </div>
                            )}
                            {document.extracted_data.document_specific_data.transport_data.pickup_location && (
                              <div>
                                <span className="text-gray-400">Pickup:</span>
                                <span className="ml-2 text-white font-medium">
                                  {document.extracted_data.document_specific_data.transport_data.pickup_location}
                                </span>
                              </div>
                            )}
                            {document.extracted_data.document_specific_data.transport_data.dropoff_location && (
                              <div>
                                <span className="text-gray-400">Dropoff:</span>
                                <span className="ml-2 text-white font-medium">
                                  {document.extracted_data.document_specific_data.transport_data.dropoff_location}
                                </span>
                              </div>
                            )}
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
                            {entity.category}
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
                              <th className="px-3 py-2 text-left text-gray-400 font-medium">Item Code</th>
                              <th className="px-3 py-2 text-right text-gray-400 font-medium">Qty</th>
                              <th className="px-3 py-2 text-left text-gray-400 font-medium">Unit</th>
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
                                  {(() => {
                                    // Handle both legacy nested structure and raw AI structure
                                    if (item.description?.value) return item.description.value;
                                    if (item.item_description?.value) return item.item_description.value;
                                    if (typeof item.description === 'string') return item.description;
                                    return 'N/A';
                                  })()}
                                </td>
                                <td
                                  className="px-3 py-2 text-white cursor-pointer hover:bg-blue-900/30 rounded"
                                  onMouseEnter={() => setHoveredEntity(`line_item_${index}_item_code`)}
                                  onMouseLeave={() => setHoveredEntity(null)}
                                >
                                  {(() => {
                                    // Handle new AI flat structure first (item_code as direct string)
                                    if (typeof item.item_code === 'string') return item.item_code;
                                    // Legacy nested structure fallback
                                    if (item.item_code?.value) return item.item_code.value;
                                    return '-';
                                  })()}
                                </td>
                                <td
                                  className="px-3 py-2 text-right text-white cursor-pointer hover:bg-blue-900/30 rounded"
                                  onMouseEnter={() => setHoveredEntity(`line_item_${index}_quantity`)}
                                  onMouseLeave={() => setHoveredEntity(null)}
                                >
                                  {(() => {
                                    // Handle new AI flat structure first (quantity as direct number/string)
                                    if (typeof (item as any).quantity === 'number') return (item as any).quantity.toString();
                                    if (typeof (item as any).quantity === 'string') return (item as any).quantity;
                                    // Legacy nested structure fallback
                                    if (item.quantity?.value) return item.quantity.value;
                                    return 'N/A';
                                  })()}
                                </td>
                                <td
                                  className="px-3 py-2 text-white cursor-pointer hover:bg-blue-900/30 rounded"
                                  onMouseEnter={() => setHoveredEntity(`line_item_${index}_unit_measurement`)}
                                  onMouseLeave={() => setHoveredEntity(null)}
                                >
                                  {(() => {
                                    // Handle new AI flat structure first (unit_measurement as direct string)
                                    if (typeof item.unit_measurement === 'string') return item.unit_measurement;
                                    // Legacy nested structure fallback
                                    if (item.unit_measurement?.value) return item.unit_measurement.value;
                                    // Alternative field names
                                    if (typeof (item as any).unit_of_measure === 'string') return (item as any).unit_of_measure;
                                    return '-';
                                  })()}
                                </td>
                                <td
                                  className="px-3 py-2 text-right text-white cursor-pointer hover:bg-blue-900/30 rounded"
                                  onMouseEnter={() => setHoveredEntity(`line_item_${index}_unit_price`)}
                                  onMouseLeave={() => setHoveredEntity(null)}
                                >
                                  {(() => {
                                    // Handle new AI flat structure first (unit_price as direct number/string)
                                    if (typeof (item as any).unit_price === 'number') return (item as any).unit_price.toString();
                                    if (typeof (item as any).unit_price === 'string') return (item as any).unit_price;
                                    // Legacy nested structure fallback
                                    if (item.unit_price?.value) return item.unit_price.value;
                                    return 'N/A';
                                  })()}
                                </td>
                                <td
                                  className="px-3 py-2 text-right text-green-400 font-medium cursor-pointer hover:bg-blue-900/30 rounded"
                                  onMouseEnter={() => setHoveredEntity(`line_item_${index}_line_total`)}
                                  onMouseLeave={() => setHoveredEntity(null)}
                                >
                                  {(() => {
                                    // Handle new AI flat structure first (line_total as direct number/string)
                                    if (typeof (item as any).line_total === 'number') return (item as any).line_total.toString();
                                    if (typeof (item as any).line_total === 'string') return (item as any).line_total;
                                    // Alternative direct fields
                                    if (typeof (item as any).total_amount === 'number') return (item as any).total_amount.toString();
                                    if (typeof (item as any).amount === 'number') return (item as any).amount.toString();
                                    // Legacy nested structure fallback
                                    if (item.line_total?.value) return item.line_total.value;
                                    if (item.amount?.value) return item.amount.value;
                                    if (item.total_amount?.value) return item.total_amount.value;
                                    return 'N/A';
                                  })()}
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
                            const extractedData = document.extracted_data;

                            // Direct AI fields
                            if (extractedData.document_type) parts.push(`Document Type: ${extractedData.document_type}`);
                            if (extractedData.vendor_name) parts.push(`Vendor: ${extractedData.vendor_name}`);
                            if (extractedData.transaction_date) parts.push(`Date: ${extractedData.transaction_date}`);
                            if (extractedData.total_amount) {
                              const currency = extractedData.currency || 'SGD';
                              parts.push(`Total Amount: ${extractedData.total_amount} ${currency}`);
                            }

                            // Fallback: Legacy document_summary structure
                            if (parts.length === 0 && extractedData.document_summary) {
                              const summary = extractedData.document_summary;
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