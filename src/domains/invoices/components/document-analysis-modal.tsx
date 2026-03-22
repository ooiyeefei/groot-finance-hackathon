'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Languages, Eye, FileText, DollarSign, List, Copy, Loader2, ImageIcon, BookOpen, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DocumentPreviewWithAnnotations from './document-preview-with-annotations'
import LhdnInvoiceSection from './lhdn-invoice-section'
import { APAdjustmentsSection } from './ap-adjustments-section'
import { APCreditNoteForm } from './ap-credit-note-form'
import { APDebitNoteForm } from './ap-debit-note-form'
import { formatNumber } from '@/lib/utils/format-number'
import { useInvoiceRealtime } from '../hooks/use-invoices-realtime'
import { useJournalEntry } from '@/domains/accounting/hooks/use-journal-entries'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import type { Id } from '../../../../convex/_generated/dataModel'

interface Document {
  id: string
  file_name: string
  file_type: string
  file_size: number
  storage_path?: string
  converted_image_path?: string
  converted_image_width?: number
  converted_image_height?: number
  status: 'pending' | 'uploading' | 'analyzing' | 'classifying' | 'extracting' | 'processing' | 'completed' | 'paid' | 'overdue' | 'disputed' | 'failed' | 'cancelled' | 'classification_failed'
  created_at: string
  processed_at?: string
  error_message?: string | { message: string; suggestions?: string[] } | null
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
  // Line items status for two-phase extraction real-time updates
  line_items_status?: 'pending' | 'extracting' | 'complete' | 'skipped'
  // Accounting status
  accountingStatus?: 'draft' | 'posted' | 'voided'
  journalEntryId?: string
  linked_transaction?: {
    id: string
    description: string
    original_amount: number
    original_currency: string
    created_at: string
  } | null
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

export default function DocumentAnalysisModal({ document: initialDocument, onClose }: DocumentAnalysisModalProps) {
  const [sourceLanguage, setSourceLanguage] = useState('auto')
  const [targetLanguage, setTargetLanguage] = useState('en')
  const [translatedText, setTranslatedText] = useState('')
  const [isTranslating, setIsTranslating] = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)
  const [pageImageUrls, setPageImageUrls] = useState<string[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [isLoadingPages, setIsLoadingPages] = useState(false)
  const [highlightedBox, setHighlightedBox] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
    category: string
    text: string
  } | null>(null)
  const [hoveredEntity, setHoveredEntity] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showMobilePreview, setShowMobilePreview] = useState(false)
  // 032-credit-debit-note: AP credit/debit note form toggles
  const [showAPCreditNoteForm, setShowAPCreditNoteForm] = useState(false)
  const [showAPDebitNoteForm, setShowAPDebitNoteForm] = useState(false)

  // Refs for scroll-based page tracking
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])

  // Real-time subscription for line items updates (Phase 2 completion)
  // This enables automatic UI updates when Lambda completes line items extraction
  const { invoice: realtimeInvoice } = useInvoiceRealtime(initialDocument.id)

  // Merge real-time data with initial document
  // Real-time updates take priority when available
  const document = useMemo((): Document => {
    if (!realtimeInvoice) return initialDocument

    return {
      ...initialDocument,
      // Override with real-time data when available
      extracted_data: realtimeInvoice.extracted_data as Document['extracted_data'] ?? initialDocument.extracted_data,
      status: realtimeInvoice.status as Document['status'] ?? initialDocument.status,
      line_items_status: realtimeInvoice.line_items_status ?? initialDocument.line_items_status,
      confidence_score: realtimeInvoice.confidence_score ?? initialDocument.confidence_score,
      accountingStatus: realtimeInvoice.accountingStatus as Document['accountingStatus'] ?? initialDocument.accountingStatus,
      journalEntryId: realtimeInvoice.journalEntryId ?? initialDocument.journalEntryId,
      linked_transaction: realtimeInvoice.linked_transaction ?? initialDocument.linked_transaction,
    }
  }, [initialDocument, realtimeInvoice])

  // Fetch linked journal entry for posted invoices
  const jeId = document.journalEntryId ? (document.journalEntryId as Id<'journal_entries'>) : null
  const { entry: journalEntry } = useJournalEntry(jeId)

  // Scroll handler to detect current visible page
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || pageRefs.current.length === 0) return

    const container = scrollContainerRef.current
    const containerTop = container.scrollTop
    const containerHeight = container.clientHeight
    const containerCenter = containerTop + containerHeight / 2

    // Find which page is most visible (closest to center)
    let closestPage = 1
    let closestDistance = Infinity

    pageRefs.current.forEach((pageRef, index) => {
      if (!pageRef) return
      const pageTop = pageRef.offsetTop
      const pageHeight = pageRef.offsetHeight
      const pageCenter = pageTop + pageHeight / 2
      const distance = Math.abs(containerCenter - pageCenter)

      if (distance < closestDistance) {
        closestDistance = distance
        closestPage = index + 1
      }
    })

    if (closestPage !== currentPage) {
      setCurrentPage(closestPage)
    }
  }, [currentPage])

  // Function to fetch all pages
  const fetchAllPages = async () => {
    setIsLoadingPages(true)
    try {
      // First, fetch page 1 to get total page count
      const params = new URLSearchParams({ pageNumber: '1' })
      if (document.converted_image_path) {
        params.set('storagePath', document.converted_image_path)
      }

      const response = await fetch(`/api/v1/invoices/${document.id}/image-url?${params}`, {
        method: 'GET'
      })

      if (!response.ok) return

      const result = await response.json()
      if (!result.success || !result.data?.imageUrl) return

      const total = result.data.totalPages || 1
      setTotalPages(total)

      // If only 1 page, we already have it
      if (total === 1) {
        setPageImageUrls([result.data.imageUrl])
        return
      }

      // Fetch all pages in parallel
      const pagePromises = []
      for (let page = 1; page <= total; page++) {
        if (page === 1) {
          // Already have page 1
          pagePromises.push(Promise.resolve(result.data.imageUrl))
        } else {
          const pageParams = new URLSearchParams({ pageNumber: page.toString() })
          if (document.converted_image_path) {
            pageParams.set('storagePath', document.converted_image_path)
          }
          pagePromises.push(
            fetch(`/api/v1/invoices/${document.id}/image-url?${pageParams}`)
              .then(res => res.json())
              .then(data => data.success ? data.data?.imageUrl : null)
              .catch(() => null)
          )
        }
      }

      const urls = await Promise.all(pagePromises)
      setPageImageUrls(urls.filter((url): url is string => url !== null))
    } catch (error) {
      console.error('[Document Preview] Failed to fetch document images:', error)
    } finally {
      setIsLoadingPages(false)
    }
  }

  // Fetch all pages on component mount
  useEffect(() => {
    fetchAllPages()
  }, [document])

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
          const currency = extractedData.currency || 'MYR'
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

        // Translation text prepared from AI structure
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

      const response = await fetch('/api/v1/utils/translate', {
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
    const value = extractedData[fieldName];
    // Handle numeric 0 correctly (it's a valid value for amounts like tax_amount, discount_amount)
    if (typeof value === 'number') {
      return String(value);
    }
    if (value) {
      return String(value);
    }

    // Try fallback field if provided (e.g., document_date -> transaction_date)
    const fallbackValue = fallbackField ? extractedData[fallbackField] : undefined;
    if (typeof fallbackValue === 'number') {
      return String(fallbackValue);
    }
    if (fallbackValue) {
      return String(fallbackValue);
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

  // SSR safety check
  if (typeof globalThis.document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      <div className="w-full h-full flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary rounded-lg">
              <Eye className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground">Document Analysis</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {document.file_name} • {formatDate(document.processed_at || document.created_at)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {/* Modal Content - Two Pane Layout */}
        {/* Desktop: side-by-side | Mobile: summary first, preview behind toggle */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">

          {/* Mobile-only: "View Document" toggle button */}
          <div className="md:hidden flex-shrink-0 px-4 pt-3 pb-1">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => setShowMobilePreview(!showMobilePreview)}
            >
              <ImageIcon className="w-4 h-4 mr-2" />
              {showMobilePreview ? 'Hide Document Preview' : 'View Document Preview'}
            </Button>
          </div>

          {/* Left Pane - Document Preview */}
          {/* Desktop: always visible | Mobile: toggled via button */}
          <div className={`w-full md:w-1/2 md:border-r border-border flex flex-col md:shrink-0 md:min-h-0 ${showMobilePreview ? '' : 'hidden md:flex'}`}>
            <div className="overflow-y-auto flex-1 p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-medium text-foreground flex items-center">
                  <FileText className="w-4 h-4 mr-2" />
                  Document Preview
                  {totalPages > 1 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({totalPages} pages)
                    </span>
                  )}
                </h4>
                {isLoadingPages && (
                  <span className="text-xs text-muted-foreground">Loading pages...</span>
                )}
              </div>

              {/* Scrollable Document Preview - Single Canvas with Continuous Scroll */}
              <div className="mb-6 relative">
                {/* Floating Page Indicator (Adobe-style) */}
                {totalPages > 1 && pageImageUrls.length > 0 && (
                  <div className="sticky top-0 z-20 flex justify-center pointer-events-none">
                    <div className="bg-background/90 backdrop-blur-sm text-foreground text-xs px-3 py-1.5 rounded-full shadow-md border border-border pointer-events-auto">
                      Page {currentPage} of {totalPages}
                    </div>
                  </div>
                )}

                {/* Single Scrollable Container */}
                <div
                  ref={scrollContainerRef}
                  onScroll={handleScroll}
                  className="overflow-y-auto bg-muted/30 rounded-lg"
                  style={{ maxHeight: '65vh' }}
                >
                  {pageImageUrls.length > 0 ? (
                    <div className="space-y-1">
                      {pageImageUrls.map((imageUrl, index) => (
                        <div
                          key={index}
                          ref={(el) => { pageRefs.current[index] = el }}
                          className="relative"
                        >
                          <DocumentPreviewWithAnnotations
                            imageUrl={imageUrl}
                            fileName={document.file_name}
                            fileType={document.file_type}
                            fileSize={document.file_size}
                            boundingBoxes={index === 0 ? getFilteredBoundingBoxes() : []}
                            onBoxHover={index === 0 ? setHighlightedBox : undefined}
                            onBoxClick={index === 0 ? () => {} : undefined}
                            hideRegionsCount={true}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-muted-foreground">
                      {isLoadingPages ? 'Loading document...' : 'No preview available'}
                    </div>
                  )}
                </div>
              </div>

            {/* Translation Feature */}
            <div className="mt-4 bg-muted/50 rounded-lg p-4 flex-shrink-0">
              <h5 className="text-sm font-medium text-foreground mb-4 flex items-center">
                <Languages className="w-4 h-4 mr-2" />
                Translation
              </h5>
              
              <div className="space-y-3">
                {/* Language Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Source Language
                    </label>
                    <select
                      value={sourceLanguage}
                      onChange={(e) => setSourceLanguage(e.target.value)}
                      className="w-full bg-input border border-input rounded-md px-2 py-1 text-foreground text-xs focus:ring-2 focus:ring-ring focus:border-transparent"
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
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Target Language
                    </label>
                    <select
                      value={targetLanguage}
                      onChange={(e) => setTargetLanguage(e.target.value)}
                      className="w-full bg-input border border-input rounded-md px-2 py-1 text-foreground text-xs focus:ring-2 focus:ring-ring focus:border-transparent"
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
                <Button
                  onClick={handleTranslate}
                  disabled={isTranslating || !document.extracted_data}
                  variant="primary"
                  size="sm"
                  className="w-full"
                >
                  {isTranslating ? (
                    <>
                      <div className="animate-spin w-3 h-3 border-2 border-current border-t-transparent rounded-full mr-2" />
                      Translating...
                    </>
                  ) : (
                    <>
                      <Languages className="w-3 h-3 mr-2" />
                      Translate
                    </>
                  )}
                </Button>

                {/* Translation Output */}
                {translatedText && (
                  <div className="bg-muted rounded-lg p-3">
                    <h6 className="text-xs font-medium text-muted-foreground mb-2">Translation Result</h6>
                    <div className="text-xs text-foreground whitespace-pre-wrap max-h-64 overflow-y-auto bg-muted/50 rounded-md p-3 border border-border">
                      {translatedText}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Processing Stats */}
            <div className="mt-4 bg-muted/50 rounded-lg p-4 flex-shrink-0">
              <h5 className="text-sm font-medium text-foreground mb-2">Processing Information</h5>

              {/* Invoice ID Display */}
              <div className="mb-3 pb-3 border-b border-border">
                <div className="text-xs text-muted-foreground mb-1">Invoice ID</div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded font-mono flex-1 min-w-0">
                    {document.id}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(document.id)
                      // Could add toast notification here
                      // Invoice ID copied to clipboard
                    }}
                    className="flex-shrink-0 p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
                    title="Copy Invoice ID"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <span className="ml-2 text-foreground capitalize">{document.status}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">AI Confidence:</span>
                  <span className="ml-2 text-foreground">
                    {(() => {
                      // Try multiple possible confidence score locations for robust access
                      const aiConfidence = document.extracted_data?.ai_confidence ||
                                         document.extracted_data?.confidence_score ||
                                         document.confidence_score ||
                                         // Legacy fallback
                                         document.extracted_data?.metadata?.ai_confidence;

                      // AI Confidence calculation debug info available

                      return aiConfidence ? `${Math.round(aiConfidence * 100)}%` : 'N/A';
                    })()}
                  </span>
                </div>
              </div>
            </div>
            </div>
          </div>

          {/* Right Pane - Document Summary & Data - Full width on mobile, half on desktop */}
          <div className="w-full md:w-1/2 flex flex-col min-h-0 overflow-y-auto">
            <div className="p-6 flex-1">
              <div className="space-y-6">
                {/* Processing Status & Errors */}
                {document.extracted_data?.text && (document.extracted_data.text.includes('error') || document.extracted_data.text.includes('failed')) && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-destructive mb-2">Processing Issue</h4>
                    <p className="text-sm text-destructive/80 whitespace-pre-wrap">{document.extracted_data.text}</p>
                  </div>
                )}

                {/* Journal Entry — shown for posted invoices */}
                {document.accountingStatus === 'posted' && journalEntry && (
                  <div className="mb-6 bg-green-500/5 border border-green-500/20 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-green-600 dark:text-green-400" />
                      Journal Entry
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        Posted
                      </span>
                    </h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      {(journalEntry as any).description} &middot; {formatBusinessDate((journalEntry as any).transactionDate)}
                    </p>
                    <div className="space-y-1.5">
                      {(journalEntry as any).lines?.map((line: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                              {line.accountCode}
                            </span>
                            <span className="text-foreground truncate">{line.accountName}</span>
                          </div>
                          <span className="text-foreground font-medium ml-3 shrink-0">
                            {line.debitAmount > 0
                              ? `${formatCurrency(line.debitAmount, 'MYR')} DR`
                              : `${formatCurrency(line.creditAmount, 'MYR')} CR`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Document Summary - AI Structure */}
                {document.extracted_data && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-foreground mb-4 flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Document Summary
                      {highlightedBox && (
                        <span className="ml-2 px-2 py-1 bg-primary text-primary-foreground text-xs rounded">
                          Hovering: {highlightedBox.category}
                        </span>
                      )}
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {getFieldValue('document_type') && (
                        <div
                          className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                          onMouseEnter={() => setHoveredEntity('document_type')}
                          onMouseLeave={() => setHoveredEntity(null)}
                        >
                          <div className="text-xs text-muted-foreground mb-1">Document Type</div>
                          <div className="text-sm text-foreground font-medium">
                            {getFieldValue('document_type')}
                          </div>
                        </div>
                      )}

                      {getFieldValue('vendor_name') && (
                        <div
                          className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                          onMouseEnter={() => setHoveredEntity('vendor_name')}
                          onMouseLeave={() => setHoveredEntity(null)}
                        >
                          <div className="text-xs text-muted-foreground mb-1">Vendor</div>
                          <div className="text-sm text-foreground font-medium">
                            {getFieldValue('vendor_name')}
                          </div>
                        </div>
                      )}

                      {getFieldValue('total_amount') && (
                        <div
                          className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                          onMouseEnter={() => setHoveredEntity('total_amount')}
                          onMouseLeave={() => setHoveredEntity(null)}
                        >
                          <div className="text-xs text-muted-foreground mb-1">Amount</div>
                          <div className="text-sm text-foreground font-medium">
                            {getFieldValue('currency') || 'MYR'} {formatNumber(getFieldValue('total_amount'), 2)}
                          </div>
                        </div>
                      )}

                      {getFieldValue('document_date', 'transaction_date') && (
                        <div
                          className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                          onMouseEnter={() => setHoveredEntity('transaction_date')}
                          onMouseLeave={() => setHoveredEntity(null)}
                        >
                          <div className="text-xs text-muted-foreground mb-1">Date</div>
                          <div className="text-sm text-foreground font-medium">
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
                    <h4 className="text-sm font-medium text-foreground mb-4 flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Vendor Information
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div
                        className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                        onMouseEnter={() => setHoveredEntity('vendor_address')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-muted-foreground mb-1">Address</div>
                        <div className="text-sm text-foreground font-medium">
                          {getFieldValue('vendor_address') || (
                            <span className="text-muted-foreground italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                        onMouseEnter={() => setHoveredEntity('vendor_contact')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-muted-foreground mb-1">Contact</div>
                        <div className="text-sm text-foreground font-medium">
                          {getFieldValue('vendor_contact') || (
                            <span className="text-muted-foreground italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                        onMouseEnter={() => setHoveredEntity('vendor_tax_id')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-muted-foreground mb-1">Tax ID / Registration</div>
                        <div className="text-sm text-foreground font-medium">
                          {getFieldValue('vendor_tax_id') || (
                            <span className="text-muted-foreground italic">Not extracted</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Customer Information - AI Structure */}
                {document.extracted_data && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-foreground mb-4 flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Customer Information
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div
                        className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                        onMouseEnter={() => setHoveredEntity('customer_name')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-muted-foreground mb-1">Customer Name</div>
                        <div className="text-sm text-foreground font-medium">
                          {getFieldValue('customer_name') || (
                            <span className="text-muted-foreground italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                        onMouseEnter={() => setHoveredEntity('customer_address')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-muted-foreground mb-1">Customer Address</div>
                        <div className="text-sm text-foreground font-medium">
                          {getFieldValue('customer_address') || (
                            <span className="text-muted-foreground italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                        onMouseEnter={() => setHoveredEntity('customer_contact')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-muted-foreground mb-1">Customer Contact</div>
                        <div className="text-sm text-foreground font-medium">
                          {getFieldValue('customer_contact') || (
                            <span className="text-muted-foreground italic">Not extracted</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Document Identifiers - AI Structure */}
                {document.extracted_data && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-foreground mb-4 flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Document Information
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div
                        className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                        onMouseEnter={() => setHoveredEntity('document_number')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-muted-foreground mb-1">Document Number</div>
                        <div className="text-sm text-foreground font-medium">
                          {getFieldValue('document_number') || (
                            <span className="text-muted-foreground italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                        onMouseEnter={() => setHoveredEntity('due_date')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-muted-foreground mb-1">Due Date</div>
                        <div className="text-sm text-foreground font-medium">
                          {getFieldValue('due_date') || (
                            <span className="text-muted-foreground italic">Not extracted</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment Information - AI Structure */}
                {document.extracted_data && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-foreground mb-4 flex items-center">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Payment Information
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div
                        className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                        onMouseEnter={() => setHoveredEntity('payment_terms')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-muted-foreground mb-1">Payment Terms</div>
                        <div className="text-sm text-foreground font-medium">
                          {getFieldValue('payment_terms') || (
                            <span className="text-muted-foreground italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                        onMouseEnter={() => setHoveredEntity('payment_method')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-muted-foreground mb-1">Payment Method</div>
                        <div className="text-sm text-foreground font-medium">
                          {getFieldValue('payment_method') || (
                            <span className="text-muted-foreground italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary md:col-span-2"
                        onMouseEnter={() => setHoveredEntity('bank_details')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-muted-foreground mb-1">Bank Details</div>
                        <div className="text-sm text-foreground font-medium">
                          {getFieldValue('bank_details') || (
                            <span className="text-muted-foreground italic">Not extracted</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tax Information - AI Structure */}
                {document.extracted_data && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-foreground mb-4 flex items-center">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Tax & Financial Breakdown
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div
                        className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                        onMouseEnter={() => setHoveredEntity('subtotal_amount')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-muted-foreground mb-1">Subtotal</div>
                        <div className="text-sm text-foreground font-medium">
                          {getFieldValue('subtotal_amount') || (
                            <span className="text-muted-foreground italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                        onMouseEnter={() => setHoveredEntity('tax_amount')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-muted-foreground mb-1">Tax Amount</div>
                        <div className="text-sm text-foreground font-medium">
                          {getFieldValue('tax_amount') || (
                            <span className="text-muted-foreground italic">Not extracted</span>
                          )}
                        </div>
                      </div>

                      <div
                        className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                        onMouseEnter={() => setHoveredEntity('discount_amount')}
                        onMouseLeave={() => setHoveredEntity(null)}
                      >
                        <div className="text-xs text-muted-foreground mb-1">Discount</div>
                        <div className="text-sm text-foreground font-medium">
                          {getFieldValue('discount_amount') || (
                            <span className="text-muted-foreground italic">Not extracted</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Document-Specific Information */}
                {document.extracted_data?.document_specific_data && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-foreground mb-4 flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Document-Specific Information
                    </h4>
                    
                    <div className="space-y-4">
                      {/* Invoice Data */}
                      {document.extracted_data.document_specific_data.invoice_data && (
                        <div className="bg-card rounded-lg p-4">
                          <h5 className="text-sm font-medium text-foreground mb-2">Invoice Details</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            {document.extracted_data.document_specific_data.invoice_data.invoice_number && (
                              <div>
                                <span className="text-muted-foreground">Invoice Number:</span>
                                <span className="ml-2 text-foreground font-medium">
                                  {document.extracted_data.document_specific_data.invoice_data.invoice_number}
                                </span>
                              </div>
                            )}
                            {document.extracted_data.document_specific_data.invoice_data.customer_info?.name && (
                              <div>
                                <span className="text-muted-foreground">Customer:</span>
                                <span className="ml-2 text-foreground font-medium">
                                  {document.extracted_data.document_specific_data.invoice_data.customer_info.name}
                                </span>
                              </div>
                            )}
                            {document.extracted_data.document_specific_data.invoice_data.payment_terms && (
                              <div>
                                <span className="text-muted-foreground">Payment Terms:</span>
                                <span className="ml-2 text-foreground font-medium">
                                  {document.extracted_data.document_specific_data.invoice_data.payment_terms}
                                </span>
                              </div>
                            )}
                            {document.extracted_data.document_specific_data.invoice_data.due_date && (
                              <div>
                                <span className="text-muted-foreground">Due Date:</span>
                                <span className="ml-2 text-foreground font-medium">
                                  {document.extracted_data.document_specific_data.invoice_data.due_date}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Receipt Data */}
                      {document.extracted_data.document_specific_data.receipt_data && (
                        <div className="bg-card rounded-lg p-4">
                          <h5 className="text-sm font-medium text-foreground mb-2">Receipt Details</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            {document.extracted_data.document_specific_data.receipt_data.receipt_number && (
                              <div>
                                <span className="text-muted-foreground">Receipt Number:</span>
                                <span className="ml-2 text-foreground font-medium">
                                  {document.extracted_data.document_specific_data.receipt_data.receipt_number}
                                </span>
                              </div>
                            )}
                            {document.extracted_data.document_specific_data.receipt_data.payment_method && (
                              <div>
                                <span className="text-muted-foreground">Payment Method:</span>
                                <span className="ml-2 text-foreground font-medium">
                                  {document.extracted_data.document_specific_data.receipt_data.payment_method}
                                </span>
                              </div>
                            )}
                            {document.extracted_data.document_specific_data.receipt_data.cashier_id && (
                              <div>
                                <span className="text-muted-foreground">Cashier ID:</span>
                                <span className="ml-2 text-foreground font-medium">
                                  {document.extracted_data.document_specific_data.receipt_data.cashier_id}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Transport Data */}
                      {document.extracted_data.document_specific_data.transport_data && (
                        <div className="bg-card rounded-lg p-4">
                          <h5 className="text-sm font-medium text-foreground mb-2">Transport Details</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            {document.extracted_data.document_specific_data.transport_data.trip_id && (
                              <div>
                                <span className="text-muted-foreground">Trip ID:</span>
                                <span className="ml-2 text-foreground font-medium">
                                  {document.extracted_data.document_specific_data.transport_data.trip_id}
                                </span>
                              </div>
                            )}
                            {document.extracted_data.document_specific_data.transport_data.pickup_location && (
                              <div>
                                <span className="text-muted-foreground">Pickup:</span>
                                <span className="ml-2 text-foreground font-medium">
                                  {document.extracted_data.document_specific_data.transport_data.pickup_location}
                                </span>
                              </div>
                            )}
                            {document.extracted_data.document_specific_data.transport_data.dropoff_location && (
                              <div>
                                <span className="text-muted-foreground">Dropoff:</span>
                                <span className="ml-2 text-foreground font-medium">
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

                {/* 024-einv-buyer-reject-pivot: LHDN E-Invoice Section */}
                {(() => {
                  const doc = document as any
                  if (!doc.lhdnVerificationStatus || doc.lhdnVerificationStatus === 'not_einvoice') return null
                  return (
                    <div className="mb-6">
                      <LhdnInvoiceSection
                        invoice={{
                          _id: document.id,
                          lhdnVerificationStatus: doc.lhdnVerificationStatus,
                          lhdnDocumentUuid: doc.lhdnDocumentUuid,
                          lhdnLongId: doc.lhdnLongId,
                          lhdnValidatedAt: doc.lhdnValidatedAt,
                          lhdnStatus: doc.lhdnStatus,
                          lhdnRejectedAt: doc.lhdnRejectedAt,
                          lhdnRejectionReason: doc.lhdnRejectionReason,
                          lhdnValidationUrl: doc.lhdnValidationUrl,
                        }}
                        onReject={() => {
                          // TODO: Open rejection dialog — for now, placeholder
                          // Will be wired to einvoice-reject-dialog in future
                        }}
                      />
                    </div>
                  )
                })()}

                {/* 032-credit-debit-note: AP Adjustments (Credit/Debit Notes) */}
                {(() => {
                  const doc = document as any
                  // AP invoices may remain "pending" status even after JE is posted — check both
                  const isCompleted = ['completed', 'paid', 'partially_paid'].includes(document.status) || doc.accountingStatus === 'posted'
                  const isAdjustment = doc.einvoiceType === 'credit_note' || doc.einvoiceType === 'debit_note'
                  if (!isCompleted || isAdjustment) return null

                  const extracted = document.extracted_data as any
                  const totalAmount = extracted?.totalAmount ?? extracted?.total ?? extracted?.total_amount ?? 0
                  const currency = extracted?.currency ?? 'MYR'

                  // FR-019: Extract original line items for pre-population
                  const rawLines = (extracted?.line_items ?? extracted?.lineItems ?? []) as Array<{
                    item_description?: string; description?: string
                    quantity?: number; unit_price?: number; total_amount?: number; totalAmount?: number
                    tax_rate?: number; taxRate?: number; tax_amount?: number; taxAmount?: number
                  }>
                  const originalLineItems = rawLines.map((item) => ({
                    description: item.item_description || item.description || '',
                    quantity: item.quantity ?? 1,
                    unitPrice: item.unit_price ?? 0,
                    totalAmount: item.total_amount ?? item.totalAmount ?? 0,
                    taxRate: item.tax_rate ?? item.taxRate,
                    taxAmount: item.tax_amount ?? item.taxAmount,
                  }))

                  return (
                    <div className="mb-6 space-y-3">
                      <APAdjustmentsSection
                        invoiceId={document.id}
                        currency={currency}
                      />

                      {showAPCreditNoteForm ? (
                        <APCreditNoteForm
                          invoiceId={document.id}
                          businessId={doc.businessId ?? ''}
                          currency={currency}
                          maxAmount={totalAmount}
                          originalLineItems={originalLineItems}
                          onClose={() => setShowAPCreditNoteForm(false)}
                          onSuccess={() => setShowAPCreditNoteForm(false)}
                        />
                      ) : showAPDebitNoteForm ? (
                        <APDebitNoteForm
                          invoiceId={document.id}
                          businessId={doc.businessId ?? ''}
                          currency={currency}
                          onClose={() => setShowAPDebitNoteForm(false)}
                          onSuccess={() => setShowAPDebitNoteForm(false)}
                        />
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAPCreditNoteForm(true)}
                            className="flex-1"
                          >
                            Create Credit Note
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAPDebitNoteForm(true)}
                            className="flex-1"
                          >
                            Create Debit Note
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Financial Entities */}
                {document.extracted_data?.financial_entities && document.extracted_data.financial_entities.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-foreground mb-4 flex items-center">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Financial Entities ({document.extracted_data.financial_entities.length})
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {document.extracted_data.financial_entities.map((entity, index) => (
                        <div 
                          key={index} 
                          className="bg-card rounded-lg p-3 cursor-pointer hover:bg-muted/80 transition-colors border border-transparent hover:border-primary"
                          onMouseEnter={() => setHoveredEntity(`financial_entity_${index}`)}
                          onMouseLeave={() => setHoveredEntity(null)}
                        >
                          <div className="text-xs text-muted-foreground mb-1">{entity.label}</div>
                          <div className="text-sm text-foreground font-medium">{entity.value}</div>
                          <div className="text-xs text-muted-foreground">
                            {entity.category}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Line Items Table */}
                {/* Show section if line items exist OR if extraction is in progress */}
                {((document.extracted_data?.line_items && document.extracted_data.line_items.length > 0) ||
                  document.line_items_status === 'extracting' ||
                  document.line_items_status === 'pending') && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-foreground mb-4 flex items-center">
                      <List className="w-4 h-4 mr-2" />
                      Line Items {document.extracted_data?.line_items?.length ? `(${document.extracted_data.line_items.length})` : ''}
                      {/* Real-time extraction status indicator */}
                      {document.line_items_status === 'extracting' && (
                        <span className="ml-3 flex items-center text-xs text-amber-500">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Extracting line items...
                        </span>
                      )}
                      {document.line_items_status === 'pending' && (
                        <span className="ml-3 text-xs text-muted-foreground">
                          (Pending extraction)
                        </span>
                      )}
                      {document.line_items_status === 'complete' && (
                        <span className="ml-3 text-xs text-green-500">
                          ✓ Complete
                        </span>
                      )}
                    </h4>
                    
                    <div className="bg-card rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
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
                            {document.extracted_data?.line_items?.map((item, index) => (
                              <tr key={index} className="hover:bg-muted/80">
                                <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                                <td
                                  className="px-3 py-2 text-foreground cursor-pointer hover:bg-primary/20 rounded"
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
                                  className="px-3 py-2 text-foreground cursor-pointer hover:bg-primary/20 rounded"
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
                                  className="px-3 py-2 text-right text-foreground cursor-pointer hover:bg-primary/20 rounded"
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
                                  className="px-3 py-2 text-foreground cursor-pointer hover:bg-primary/20 rounded"
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
                                  className="px-3 py-2 text-right text-foreground cursor-pointer hover:bg-primary/20 rounded"
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
                                  className="px-3 py-2 text-right text-foreground font-medium cursor-pointer hover:bg-primary/20 rounded"
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
                      {/* Show loading placeholder when extracting but no items yet */}
                      {(!document.extracted_data?.line_items || document.extracted_data.line_items.length === 0) &&
                        (document.line_items_status === 'extracting' || document.line_items_status === 'pending') && (
                        <div className="p-6 text-center text-muted-foreground">
                          <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin text-primary" />
                          <p className="text-sm">
                            {document.line_items_status === 'extracting'
                              ? 'Extracting line items from document...'
                              : 'Line items extraction pending...'}
                          </p>
                          <p className="text-xs mt-1">This will update automatically when complete</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Full Extracted Text */}
                {document.extracted_data?.text && !(document.extracted_data.text.includes('error') || document.extracted_data.text.includes('failed')) && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-foreground mb-4 flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Complete Extracted Text
                    </h4>
                    
                    <div className="bg-card rounded-lg p-4">
                      <div className="text-xs text-muted-foreground mb-2">Clean OCR Output</div>
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap overflow-auto max-h-64 leading-relaxed">
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
                              const currency = extractedData.currency || 'MYR';
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
                        className="text-sm text-primary hover:text-primary/80 transition-colors"
                      >
                        {showRawJson ? 'Hide' : 'Show'} Raw JSON Data
                      </button>
                      
                      {showRawJson && (
                        <div className="mt-3 bg-muted rounded-lg p-4">
                          <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-auto max-h-64">
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
    </div>,
    globalThis.document.body
  )
}