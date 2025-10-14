/**
 * Document to Accounting Entry Mapper
 * Maps extracted document entities to accounting entry form data
 */

import { CreateTransactionRequest, CreateLineItemRequest, SupportedCurrency } from '@/domains/accounting-entries/types'

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
  extracted_data?: {
    // AI direct fields (new format)
    text?: string
    vendor_name?: string
    document_type?: string
    total_amount?: string | number
    currency?: string
    document_date?: string
    transaction_date?: string
    document_number?: string
    line_items?: any[]

    // Legacy support (for backward compatibility)
    entities?: ExtractedEntity[]
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
export function mapDocumentToAccountingEntry(document: DocumentData): Partial<CreateTransactionRequest> {
  console.log(`[Accounting Entry Mapper] Starting mapping for document:`, {
    documentId: document.id,
    fileName: document.file_name,
    hasExtractedData: !!document.extracted_data,
    extractedDataKeys: document.extracted_data ? Object.keys(document.extracted_data) : 'none'
  });

  if (!document.extracted_data) {
    console.log(`[Accounting Entry Mapper] No extracted data found, returning empty mapping`);
    return {}
  }

  const mappedData: Partial<CreateTransactionRequest> = {}

  // Helper function to find entity by type (for legacy format)
  const findEntity = (types: string[]) => {
    if (!document.extracted_data?.entities) return null;
    return document.extracted_data.entities.find(entity =>
      types.some(type =>
        entity.type.toLowerCase().includes(type.toLowerCase()) ||
        type.toLowerCase().includes(entity.type.toLowerCase())
      )
    )
  }

  // Helper function to parse amount from string or number
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

  // Helper function to detect currency from text
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

    return 'USD' // Default fallback
  }

  // Helper function to parse and format date
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

      // Return today's date as fallback
      return new Date().toISOString().split('T')[0]
    } catch {
      return new Date().toISOString().split('T')[0]
    }
  }

  // Note: Category determination now handled by AI pipeline with business-defined categories
  // Fallback function for when no AI category is available
  const getDefaultCategoryForInvoice = (): string => {
    // Default to 'direct_cost' for invoices as it's most appropriate for supplier invoices
    return 'direct_cost'
  }


  const extractedData = document.extracted_data as any

  console.log(`[Accounting Entry Mapper] Extracted data structure:`, {
    isAIFormat: !!(extractedData.vendor_name || extractedData.total_amount || extractedData.document_type),
    hasDocumentSummary: !!extractedData.document_summary,
    hasLegacyEntities: !!(extractedData.entities && Array.isArray(extractedData.entities)),
    vendorName: extractedData.vendor_name || 'none',
    totalAmount: extractedData.total_amount || 'none',
    currency: extractedData.currency || 'none',
    lineItems: extractedData.line_items ? `${extractedData.line_items.length} items` : 'none',
    suggestedCategory: extractedData.suggested_category || 'none',
    selectedCategory: extractedData.selected_category || 'none'
  });

  // Map basic accounting entry information
  mappedData.transaction_type = 'Cost of Goods Sold' // Invoices are supplier invoices (business purchases)

  // Declare summary variable for use throughout function
  let summary: any = null

  // Check if this is AI structure (new format) or legacy structure
  // Priority: AI direct fields > document_summary > entities
  const isAIFormat = !!(extractedData.vendor_name || extractedData.total_amount || extractedData.document_type)

  if (isAIFormat) {
    // Handle AI structure directly (new format)
    console.log(`[Accounting Entry Mapper] Processing AI structure`);

    // Extract document type
    if (extractedData.document_type) {
      const docType = extractedData.document_type.toLowerCase()
      if (docType.includes('invoice')) {
        mappedData.document_type = 'invoice'
      } else if (docType.includes('receipt')) {
        mappedData.document_type = 'receipt'
      } else if (docType.includes('bill')) {
        mappedData.document_type = 'bill'
      } else if (docType.includes('statement')) {
        mappedData.document_type = 'statement'
      } else if (docType.includes('contract')) {
        mappedData.document_type = 'contract'
      } else {
        mappedData.document_type = 'other'
      }
      console.log(`[Accounting Entry Mapper] Mapped document type: ${mappedData.document_type}`);
    }

    // Set accounting entry status based on document type
    if (mappedData.document_type) {
      if (mappedData.document_type === 'receipt') {
        mappedData.status = 'paid'
      } else if (mappedData.document_type === 'invoice') {
        mappedData.status = 'awaiting_payment'
      } else if (mappedData.document_type === 'bill') {
        mappedData.status = 'awaiting_payment'
      } else {
        mappedData.status = 'paid'
      }
    } else {
      mappedData.status = 'paid'
    }

    // Extract vendor name
    if (extractedData.vendor_name) {
      mappedData.vendor_name = extractedData.vendor_name
      console.log(`[Accounting Entry Mapper] Mapped vendor: ${mappedData.vendor_name}`);
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
      console.log(`[Accounting Entry Mapper] Mapped amount: ${mappedData.original_amount} ${mappedData.original_currency}`);
    }

    // Extract transaction date (AI uses document_date, not transaction_date)
    if (extractedData.document_date) {
      mappedData.transaction_date = parseDate(extractedData.document_date)
      console.log(`[Accounting Entry Mapper] Mapped date: ${mappedData.transaction_date}`);
    } else if (extractedData.transaction_date) {
      // Legacy fallback
      mappedData.transaction_date = parseDate(extractedData.transaction_date)
    }
  } else {
    // Handle legacy document_summary structure
    console.log(`[Accounting Entry Mapper] Processing legacy document_summary structure`);
    summary = document.extracted_data.document_summary ||
              document.extracted_data.metadata?.layoutElements?.document_summary

    if (summary) {
    // Extract document type from OCR - this bridges the context gap!
    if ((summary as any).document_type?.value) {
      const docType = (summary as any).document_type.value.toLowerCase()
      // Map common document types to our supported types
      if (docType.includes('invoice')) {
        mappedData.document_type = 'invoice'
      } else if (docType.includes('receipt')) {
        mappedData.document_type = 'receipt'
      } else if (docType.includes('bill')) {
        mappedData.document_type = 'bill'
      } else if (docType.includes('statement')) {
        mappedData.document_type = 'statement'
      } else if (docType.includes('contract')) {
        mappedData.document_type = 'contract'
      } else {
        mappedData.document_type = 'other'
      }
    }

    // Set initial accounting entry status based on document type
    if (mappedData.document_type) {
      if (mappedData.document_type === 'receipt') {
        // Receipts indicate payment has already been made
        mappedData.status = 'paid'
      } else if (mappedData.document_type === 'invoice') {
        // Invoices are awaiting payment
        mappedData.status = 'awaiting_payment'
      } else if (mappedData.document_type === 'bill') {
        // Bills are awaiting payment
        mappedData.status = 'awaiting_payment'
      } else {
        // Default status for other document types
        mappedData.status = 'paid'
      }
    } else {
      // Default status when document type cannot be determined
      mappedData.status = 'paid'
    }

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
    console.log(`[Accounting Entry Mapper] Mapped reference number from AI: ${mappedData.reference_number}`);
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

  // Category assignment - prioritize AI-selected category from business definitions
  // AI should return valid business COGS category codes (MATERIALS, LABOR, SUBCONTRACT, etc.)
  if (extractedData.suggested_category) {
    // Use AI-selected category from business categories (set by process-document-ocr.ts)
    mappedData.category = extractedData.suggested_category
    console.log(`[Accounting Entry Mapper] Using business COGS category from AI: ${mappedData.category}`);
  } else if (extractedData.selected_category) {
    // Fallback to raw AI category selection (direct from LLM)
    mappedData.category = extractedData.selected_category
    console.log(`[Accounting Entry Mapper] Using raw AI category: ${mappedData.category}`);
  } else {
    // Ultimate fallback to default category for invoices
    mappedData.category = getDefaultCategoryForInvoice()
    console.log(`[Accounting Entry Mapper] No AI category found, using default: ${mappedData.category}`);
  }

  // Note: vendor_details is not part of CreateTransactionRequest

  // Extract structured line items from OCR data
  // For raw AI structure, line items are directly available
  // For legacy structure, try different locations
  let lineItemsSource = null;

  console.log(`[Accounting Entry Mapper] Debug - extractedData structure:`, {
    hasDirectLineItems: !!(extractedData.line_items && Array.isArray(extractedData.line_items)),
    extractedDataLineItems: extractedData.line_items ? extractedData.line_items.length : 'none',
    documentLineItems: document.extracted_data.line_items ? document.extracted_data.line_items.length : 'none',
    metadataLineItems: document.extracted_data.metadata?.layoutElements?.line_items ? document.extracted_data.metadata?.layoutElements?.line_items.length : 'none'
  });

  // Priority order for raw AI: direct line_items first, then nested paths
  if (extractedData.line_items && Array.isArray(extractedData.line_items) && extractedData.line_items.length > 0) {
    lineItemsSource = extractedData.line_items;
    console.log(`[Accounting Entry Mapper] Using direct extractedData.line_items (${lineItemsSource.length} items)`);
  } else if (document.extracted_data.line_items && Array.isArray(document.extracted_data.line_items) && document.extracted_data.line_items.length > 0) {
    lineItemsSource = document.extracted_data.line_items;
    console.log(`[Accounting Entry Mapper] Using document.extracted_data.line_items (${lineItemsSource.length} items)`);
  } else if (document.extracted_data.metadata?.layoutElements?.line_items && Array.isArray(document.extracted_data.metadata?.layoutElements?.line_items) && document.extracted_data.metadata.layoutElements.line_items.length > 0) {
    lineItemsSource = document.extracted_data.metadata?.layoutElements?.line_items;
    console.log(`[Accounting Entry Mapper] Using metadata line_items (${lineItemsSource.length} items)`);
  } else {
    lineItemsSource = [];
    console.log(`[Accounting Entry Mapper] No line items found in any location`);
  }

  console.log(`[Accounting Entry Mapper] Line items detection: Found ${lineItemsSource?.length || 0} items`);
  if (lineItemsSource && lineItemsSource.length > 0) {
    console.log('[Accounting Entry Mapper] First line item structure:', JSON.stringify(lineItemsSource[0], null, 2));
  }
  if (lineItemsSource && lineItemsSource.length > 0) {
    const lineItems: CreateLineItemRequest[] = []

    lineItemsSource.forEach((structuredItem: any, index: number) => {
      console.log(`[Accounting Entry Mapper] Processing line item ${index + 1}:`, {
        raw: structuredItem,
        description_raw: structuredItem.description,
        item_code_raw: structuredItem.item_code,
        quantity_raw: structuredItem.quantity,
        unit_price_raw: structuredItem.unit_price,
        line_total_raw: structuredItem.line_total
      });
      // Handle both raw AI format (direct values) and legacy format (nested .value)
      const description = structuredItem.description?.value || structuredItem.description || `Item ${index + 1}`
      const itemCode = structuredItem.item_code?.value || structuredItem.item_code || undefined
      const quantity = parseFloat(structuredItem.quantity?.value || structuredItem.quantity || '1') || 1
      const unitMeasurement = structuredItem.unit_measurement?.value || structuredItem.unit_of_measure || structuredItem.unit_measurement || undefined
      const unitPrice = parseAmount(structuredItem.unit_price?.value || structuredItem.unit_price || '0')
      const lineTotal = parseAmount(structuredItem.line_total?.value || structuredItem.line_total || '0')
      // Calculate unit price from line total if unit price is 0 but line total exists
      const finalUnitPrice = unitPrice > 0 ? unitPrice : (lineTotal > 0 && quantity > 0 ? lineTotal / quantity : 0)

      console.log(`[Accounting Entry Mapper] Processed line item ${index + 1}:`, {
        description,
        itemCode,
        quantity,
        unitPrice,
        lineTotal,
        finalUnitPrice,
        passesValidation: !!(description && quantity > 0 && finalUnitPrice > 0)
      });

      if (description && quantity > 0 && finalUnitPrice > 0) {
        const lineItem = {
          description: description.trim(),
          item_code: itemCode,
          quantity: quantity,
          unit_measurement: unitMeasurement,
          unit_price: finalUnitPrice,
          tax_rate: 0, // TODO: Extract tax rate from OCR if available
          item_category: mappedData.category || 'cost_of_goods_sold'
        };
        lineItems.push(lineItem);
        console.log(`[Accounting Entry Mapper] Added line item ${index + 1} to array:`, lineItem);
      } else {
        console.log(`[Accounting Entry Mapper] Skipped line item ${index + 1} - failed validation`);
      }
    })

    mappedData.line_items = lineItems
    console.log(`[Accounting Entry Mapper] Final mapped line items (${lineItems.length} items):`, lineItems);
  } else {
    // Fallback: create single line item from total amount if no structured line items
    console.log(`[Accounting Entry Mapper] No line items found, creating fallback from total amount: ${mappedData.original_amount}`);
    if (mappedData.original_amount && mappedData.original_amount > 0) {
      mappedData.line_items = [{
        description: mappedData.description || 'Extracted from document',
        quantity: 1,
        unit_price: mappedData.original_amount,
        tax_rate: 0,
        item_category: mappedData.category || 'direct_cost'
      }]
      console.log(`[Accounting Entry Mapper] Created fallback line item:`, mappedData.line_items[0]);
    }
  }

  console.log(`[Accounting Entry Mapper] Final mapped data summary:`, {
    vendor: mappedData.vendor_name,
    amount: mappedData.original_amount,
    currency: mappedData.original_currency,
    lineItemsCount: mappedData.line_items?.length || 0,
    hasLineItems: !!(mappedData.line_items && mappedData.line_items.length > 0)
  });

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
    console.log('[Accounting Entry Mapper] Document can create accounting entry - AI format detected');
    return true
  }

  // Fallback to legacy document_summary structure
  const hasAmountLegacy = extractedData.document_summary?.total_amount?.value
  const hasVendorLegacy = extractedData.document_summary?.vendor_name?.value

  if (hasAmountLegacy || hasVendorLegacy) {
    console.log('[Accounting Entry Mapper] Document can create accounting entry - legacy document_summary format detected');
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
      console.log('[Accounting Entry Mapper] Document can create accounting entry - legacy entities format detected');
      return true
    }
  }

  console.log('[Accounting Entry Mapper] Document cannot create accounting entry - insufficient data in any format');
  return false
}
