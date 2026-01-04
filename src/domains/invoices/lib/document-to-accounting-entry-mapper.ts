/**
 * Document to Accounting Entry Mapper
 * Maps extracted document entities to accounting entry form data
 */

import { CreateAccountingEntryRequest, CreateLineItemRequest, SupportedCurrency } from '@/domains/accounting-entries/types'
import { createLogger } from '@/lib/utils/logger'

const log = createLogger('AccountingEntry:Mapper')

interface ExtractedEntity {
  type: string
  value: string
  confidence: number
}

interface StructuredLineItem {
  description?: {
    value: string
    confidence: number
    bbox?: number[]
  }
  item_code?: {
    value: string
    confidence: number
    bbox?: number[]
  }
  quantity?: {
    value: string
    confidence: number
    bbox?: number[]
  }
  unit_measurement?: {
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
}

interface DocumentData {
  id: string
  file_name: string
  status?: string
  extracted_data?: {
    // AI direct fields (new format)
    text?: string
    vendor_name?: string
    total_amount?: string | number
    currency?: string
    document_date?: string
    transaction_date?: string
    document_number?: string
    line_items?: any[]

    // Legacy support
    entities?: ExtractedEntity[]
    document_summary?: {
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
    metadata?: {
      pageCount?: number
      wordCount: number
      language?: string
      processingMethod?: 'ocr'
      layoutElements?: {
        full_text?: string
        line_items?: StructuredLineItem[]
        document_summary?: {
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
      }
    }
  }
}

/**
 * Maps extracted document data to accounting entry form data
 */
export function mapDocumentToAccountingEntry(document: DocumentData): Partial<CreateAccountingEntryRequest> {
  // Mapping document (verbose logging removed for production readiness)

  if (!document.extracted_data) {
    log.debug('No extracted data found, returning empty mapping');
    return {}
  }

  const mappedData: Partial<CreateAccountingEntryRequest> = {}

  // Find entity by type (legacy format)
  const findEntity = (types: string[]) => {
    if (!document.extracted_data?.entities) return null;
    return document.extracted_data.entities.find(entity =>
      types.some(type =>
        entity.type.toLowerCase().includes(type.toLowerCase()) ||
        type.toLowerCase().includes(entity.type.toLowerCase())
      )
    )
  }

  // Parse amount from string or number
  const parseAmount = (value: string | number | undefined | null): number => {
    if (value === null || value === undefined || value === '') {
      return 0;
    }

    // If it's already a number, return it directly
    if (typeof value === 'number') {
      return isNaN(value) ? 0 : value;
    }

    // Convert to string and clean it
    const stringValue = String(value);
    const cleaned = stringValue.replace(/[^\d.,]/g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  // Detect currency from text
  const detectCurrency = (text: string): SupportedCurrency => {
    const textLower = text.toLowerCase()

    // Currency detection patterns
    if (textLower.includes('sgd') || textLower.includes('s$') || textLower.includes('singapore')) return 'SGD'
    if (textLower.includes('myr') || textLower.includes('rm') || textLower.includes('malaysia')) return 'MYR'
    if (textLower.includes('thb') || textLower.includes('฿') || textLower.includes('thailand') || textLower.includes('thai')) return 'THB'
    if (textLower.includes('idr') || textLower.includes('rp') || textLower.includes('indonesia')) return 'IDR'
    if (textLower.includes('vnd') || textLower.includes('₫') || textLower.includes('vietnam')) return 'VND'
    if (textLower.includes('php') || textLower.includes('₱') || textLower.includes('philippines')) return 'PHP'
    if (textLower.includes('cny') || textLower.includes('¥') || textLower.includes('china') || textLower.includes('yuan')) return 'CNY'
    if (textLower.includes('eur') || textLower.includes('€') || textLower.includes('euro')) return 'EUR'
    if (textLower.includes('inr') || textLower.includes('₹') || textLower.includes('india') || textLower.includes('rupee')) return 'INR'

    return 'USD'
  }

  // Parse and format date
  const parseDate = (dateStr: string): string => {
    try {
      // Try various date formats
      const date = new Date(dateStr)
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }

      // Try DD/MM/YYYY format
      const ddmmyyyy = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (ddmmyyyy) {
        const [, day, month, year] = ddmmyyyy
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      }

      // Try DD-MM-YYYY format
      const ddmmyyyy2 = dateStr.match(/(\d{1,2})-(\d{1,2})-(\d{4})/)
      if (ddmmyyyy2) {
        const [, day, month, year] = ddmmyyyy2
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      }

      // Fallback to today's date
      return new Date().toISOString().split('T')[0]
    } catch {
      return new Date().toISOString().split('T')[0]
    }
  }

  // Fallback category when no AI category available
  const getDefaultCategoryForInvoice = (): string => {
    // Default to 'direct_cost' for supplier invoices
    return 'direct_cost'
  }


  const extractedData = document.extracted_data as any

  // Extracted data structure determined (verbose logging removed)

  // Map basic accounting entry information
  mappedData.transaction_type = 'Cost of Goods Sold' // Invoices are supplier invoices (business purchases)
  mappedData.source_document_type = 'invoice' // This mapper handles invoice documents

  // Declare summary variable for use throughout function
  let summary: any = null

  // Check if this is AI structure (new format) or legacy structure
  // Priority: AI direct fields > document_summary > entities
  const isAIFormat = !!(extractedData.vendor_name || extractedData.total_amount)

  if (isAIFormat) {
    // Handle AI structure directly (new format)

    // Use document's actual status instead of hardcoded 'pending'
    // This allows invoices marked as 'paid' to show the correct status
    const validStatuses = ['pending', 'paid', 'overdue', 'cancelled', 'disputed'] as const
    mappedData.status = validStatuses.includes(document.status as any)
      ? (document.status as 'pending' | 'paid' | 'overdue' | 'cancelled' | 'disputed')
      : 'pending'

    // Extract vendor name
    if (extractedData.vendor_name) {
      mappedData.vendor_name = extractedData.vendor_name
    }

    // Extract amount and currency
    if (extractedData.total_amount) {
      mappedData.original_amount = parseAmount(extractedData.total_amount)

      // Use currency from AI extraction
      if (extractedData.currency) {
        mappedData.original_currency = extractedData.currency as SupportedCurrency
      } else {
        // Fallback to currency detection
        const currencyFromText = detectCurrency(document.extracted_data?.text || '')
        mappedData.original_currency = currencyFromText
      }
    }

    // Extract transaction date (AI uses document_date, not transaction_date)
    if (extractedData.document_date) {
      mappedData.transaction_date = parseDate(extractedData.document_date)
    } else if (extractedData.transaction_date) {
      // Legacy fallback
      mappedData.transaction_date = parseDate(extractedData.transaction_date)
    }
  } else {
    // Handle legacy document_summary structure
    summary = document.extracted_data.document_summary ||
              document.extracted_data.metadata?.layoutElements?.document_summary

    if (summary) {
    // Use document's actual status instead of hardcoded 'pending'
    // This allows invoices marked as 'paid' to show the correct status
    const validStatuses = ['pending', 'paid', 'overdue', 'cancelled', 'disputed'] as const
    mappedData.status = validStatuses.includes(document.status as any)
      ? (document.status as 'pending' | 'paid' | 'overdue' | 'cancelled' | 'disputed')
      : 'pending'

    // Extract vendor name
    if (summary.vendor_name?.value) {
      mappedData.vendor_name = summary.vendor_name.value
    }

    // Extract amount and currency
    if (summary.total_amount?.value) {
      mappedData.original_amount = parseAmount(summary.total_amount.value)

      // Detect currency from amount text or document text
      const currencyFromAmount = detectCurrency(summary.total_amount.value)
      const currencyFromText = detectCurrency(document.extracted_data.text || '')
      mappedData.original_currency = currencyFromAmount !== 'USD' ? currencyFromAmount : currencyFromText
    }

      // Extract transaction date
      if (summary.transaction_date?.value) {
        mappedData.transaction_date = parseDate(summary.transaction_date.value)
      }
    }
  }

  // Fallback to entity extraction if structured data is not available
  if (!mappedData.vendor_name) {
    const vendorEntity = findEntity(['vendor', 'vendor_name', 'company', 'business'])
    if (vendorEntity) {
      mappedData.vendor_name = vendorEntity.value
    }
  }

  if (!mappedData.original_amount) {
    const amountEntity = findEntity(['amount', 'total', 'total_amount', 'grand_total', 'subtotal'])
    if (amountEntity) {
      mappedData.original_amount = parseAmount(amountEntity.value)

      // Detect currency from amount text or document text
      const currencyFromAmount = detectCurrency(amountEntity.value)
      const currencyFromText = detectCurrency(document.extracted_data.text || '')
      mappedData.original_currency = currencyFromAmount !== 'USD' ? currencyFromAmount : currencyFromText
    }
  }

  if (!mappedData.transaction_date) {
    const dateEntity = findEntity(['date', 'transaction_date', 'invoice_date', 'receipt_date'])
    if (dateEntity) {
      mappedData.transaction_date = parseDate(dateEntity.value)
    } else {
      // Default to today
      mappedData.transaction_date = new Date().toISOString().split('T')[0]
    }
  }

  // Extract reference number - use standardized document_number field from AI
  // First, try raw AI structure (new format)
  if (extractedData.document_number) {
    mappedData.reference_number = extractedData.document_number
  } else if (summary && (summary as any).document_number?.value) {
    // Fallback to nested document_summary structure
    mappedData.reference_number = (summary as any).document_number.value
  } else if (summary && (summary as any).invoice_number?.value) {
    // Legacy support for old invoice_number field
    mappedData.reference_number = (summary as any).invoice_number.value
  } else if (summary && (summary as any).reference_numbers?.value) {
    // Legacy support for old reference_numbers field
    mappedData.reference_number = (summary as any).reference_numbers.value
  } else {
    // Final fallback to entity extraction for very old documents
    const refEntity = findEntity(['invoice', 'receipt', 'reference', 'number', 'id', 'document_number'])
    if (refEntity) {
      mappedData.reference_number = refEntity.value
    }
  }

  // Generate description from vendor and document name
  const vendorName = mappedData.vendor_name || 'Unknown Vendor'
  mappedData.description = `${vendorName} - ${document.file_name.replace(/\.[^/.]+$/, "")}`

  // DEBUG: Log category-related fields to trace data flow
  console.log('[Mapper Debug] document.id:', document.id)
  console.log('[Mapper Debug] extractedData keys:', Object.keys(extractedData || {}))
  console.log('[Mapper Debug] suggested_category:', extractedData?.suggested_category)
  console.log('[Mapper Debug] selected_category:', extractedData?.selected_category)
  console.log('[Mapper Debug] accounting_category:', extractedData?.accounting_category)
  console.log('[Mapper Debug] category_confidence:', extractedData?.category_confidence)

  // Category assignment - prioritize AI-selected category from business definitions
  // AI should return valid business COGS category codes (MATERIALS, LABOR, SUBCONTRACT, etc.)
  if (extractedData.suggested_category) {
    // Use AI-selected category from business categories (set by process-document-ocr.ts)
    mappedData.category = extractedData.suggested_category
  } else if (extractedData.selected_category) {
    // Fallback to raw AI category selection (direct from LLM)
    mappedData.category = extractedData.selected_category
  } else {
    // Ultimate fallback to default category for invoices
    mappedData.category = getDefaultCategoryForInvoice()
  }

  // Note: vendor_details is not part of CreateTransactionRequest

  // Extract structured line items from OCR data
  // For raw AI structure, line items are directly available
  // For legacy structure, try different locations
  let lineItemsSource = null;

  // Priority order for raw AI: direct line_items first, then nested paths
  if (extractedData.line_items && Array.isArray(extractedData.line_items) && extractedData.line_items.length > 0) {
    lineItemsSource = extractedData.line_items;
  } else if (document.extracted_data.line_items && Array.isArray(document.extracted_data.line_items) && document.extracted_data.line_items.length > 0) {
    lineItemsSource = document.extracted_data.line_items;
  } else if (document.extracted_data.metadata?.layoutElements?.line_items && Array.isArray(document.extracted_data.metadata?.layoutElements?.line_items) && document.extracted_data.metadata.layoutElements.line_items.length > 0) {
    lineItemsSource = document.extracted_data.metadata?.layoutElements?.line_items;
  } else {
    lineItemsSource = [];
  }

  if (lineItemsSource && lineItemsSource.length > 0) {
    const lineItems: CreateLineItemRequest[] = []

    lineItemsSource.forEach((structuredItem: any, index: number) => {
      // Handle both raw AI format (direct values) and legacy format (nested .value)
      const description = structuredItem.description?.value || structuredItem.description || `Item ${index + 1}`
      const itemCode = structuredItem.item_code?.value || structuredItem.item_code || undefined
      const quantity = parseFloat(structuredItem.quantity?.value || structuredItem.quantity || '1') || 1
      const unitMeasurement = structuredItem.unit_measurement?.value || structuredItem.unit_of_measure || structuredItem.unit_measurement || undefined
      const unitPrice = parseAmount(structuredItem.unit_price?.value || structuredItem.unit_price || '0')
      const lineTotal = parseAmount(structuredItem.line_total?.value || structuredItem.line_total || '0')
      // Calculate unit price from line total if unit price is 0 but line total exists
      const finalUnitPrice = unitPrice > 0 ? unitPrice : (lineTotal > 0 && quantity > 0 ? lineTotal / quantity : 0)

      if (description && quantity > 0 && finalUnitPrice > 0) {
        const lineItem = {
          item_description: description.trim(),
          item_code: itemCode,
          quantity: quantity,
          unit_measurement: unitMeasurement,
          unit_price: finalUnitPrice,
          total_amount: quantity * finalUnitPrice, // Required field: calculated total
          currency: mappedData.original_currency || 'USD', // Required field: use document currency
          tax_rate: 0, // TODO: Extract tax rate from OCR if available
          item_category: mappedData.category || 'cost_of_goods_sold'
        };
        lineItems.push(lineItem);
      }
    })

    mappedData.line_items = lineItems
  } else {
    // Fallback: create single line item from total amount if no structured line items
    if (mappedData.original_amount && mappedData.original_amount > 0) {
      mappedData.line_items = [{
        item_description: mappedData.description || 'Extracted from document',
        quantity: 1,
        unit_price: mappedData.original_amount,
        total_amount: mappedData.original_amount, // Required field: same as unit_price when quantity=1
        currency: mappedData.original_currency || 'USD', // Required field: use document currency
        tax_rate: 0
      }]
    }
  }

  return mappedData
}

/**
 * Checks if a document has sufficient data for accounting entry creation
 */
export function canCreateAccountingEntryFromDocument(document: DocumentData): boolean {
  if (!document.extracted_data) {
    return false
  }

  const extractedData = document.extracted_data as any

  // Check AI structure first (new format) - priority check
  const hasAmountAI = extractedData.total_amount
  const hasVendorAI = extractedData.vendor_name

  if (hasAmountAI || hasVendorAI) {
    return true
  }

  // Fallback to legacy document_summary structure
  const hasAmountLegacy = extractedData.document_summary?.total_amount?.value
  const hasVendorLegacy = extractedData.document_summary?.vendor_name?.value

  if (hasAmountLegacy || hasVendorLegacy) {
    return true
  }

  // Final fallback to legacy entities format (oldest format)
  if (extractedData.entities && Array.isArray(extractedData.entities)) {
    const entities = extractedData.entities

    // Check if we have at least an amount or vendor
    const hasAmount = entities.some((entity: any) =>
      entity.type.toLowerCase().includes('amount') ||
      entity.type.toLowerCase().includes('total')
    )

    const hasVendor = entities.some((entity: any) =>
      entity.type.toLowerCase().includes('vendor') ||
      entity.type.toLowerCase().includes('company')
    )

    if (hasAmount || hasVendor) {
      return true
    }
  }

  return false
}
