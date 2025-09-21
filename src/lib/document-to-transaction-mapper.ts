/**
 * Document to Transaction Mapper
 * Maps extracted document entities to transaction form data
 */

import { CreateTransactionRequest, CreateLineItemRequest, SupportedCurrency } from '@/types/transaction'

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
    // DSPy direct fields (new format)
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
 * Maps extracted document data to transaction form data
 */
export function mapDocumentToTransaction(document: DocumentData): Partial<CreateTransactionRequest> {
  console.log(`[Transaction Mapper] Starting mapping for document:`, {
    documentId: document.id,
    fileName: document.file_name,
    hasExtractedData: !!document.extracted_data,
    extractedDataKeys: document.extracted_data ? Object.keys(document.extracted_data) : 'none'
  });

  if (!document.extracted_data) {
    console.log(`[Transaction Mapper] No extracted data found, returning empty mapping`);
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

  // Helper function to categorize transaction based on document content
  const categorizeTransaction = (text: string, vendorName?: string): string => {
    const textLower = text.toLowerCase()
    const vendor = (vendorName || '').toLowerCase()
    
    // Office supplies
    if (textLower.includes('office') || textLower.includes('stationery') || textLower.includes('supplies')) {
      return 'office_supplies'
    }
    
    // Travel expenses
    if (textLower.includes('hotel') || textLower.includes('flight') || textLower.includes('taxi') || 
        textLower.includes('transport') || textLower.includes('travel') || textLower.includes('uber') ||
        textLower.includes('grab') || textLower.includes('airline')) {
      return 'travel_expenses'
    }
    
    // Software subscriptions
    if (textLower.includes('software') || textLower.includes('subscription') || textLower.includes('saas') ||
        textLower.includes('microsoft') || textLower.includes('google') || textLower.includes('adobe') ||
        vendor.includes('software') || vendor.includes('tech')) {
      return 'software_subscriptions'
    }
    
    // Cost of goods sold - raw materials and inventory for food businesses
    if (textLower.includes('broccoli') || textLower.includes('cabbage') || textLower.includes('carrot') ||
        textLower.includes('vegetable') || textLower.includes('lettuce') || textLower.includes('spinach') ||
        textLower.includes('meat') || textLower.includes('ingredient') || textLower.includes('raw material') ||
        textLower.includes('produce') || textLower.includes('fresh') || 
        vendor.includes('intertrade') || vendor.includes('supplier') || vendor.includes('wholesale')) {
      return 'cost_of_goods_sold'
    }
    
    // Travel & entertainment
    if (textLower.includes('restaurant') || textLower.includes('cafe') || textLower.includes('meal') ||
        textLower.includes('food') || textLower.includes('drink') || textLower.includes('coffee') ||
        textLower.includes('lunch') || textLower.includes('dinner')) {
      return 'travel_entertainment'
    }
    
    // Marketing & advertising
    if (textLower.includes('marketing') || textLower.includes('advertising') || textLower.includes('promotion') ||
        textLower.includes('facebook') || textLower.includes('google ads') || textLower.includes('campaign')) {
      return 'marketing_advertising'
    }
    
    // Equipment (administrative expenses)
    if (textLower.includes('equipment') || textLower.includes('hardware') || textLower.includes('computer') ||
        textLower.includes('laptop') || textLower.includes('monitor') || textLower.includes('printer')) {
      return 'administrative_expenses'
    }
    
    // Utilities & communications
    if (textLower.includes('electricity') || textLower.includes('water') || textLower.includes('internet') ||
        textLower.includes('phone') || textLower.includes('utility') || textLower.includes('telecom')) {
      return 'utilities_communications'
    }
    
    // Professional services (administrative expenses)
    if (textLower.includes('legal') || textLower.includes('accounting') || textLower.includes('consulting') ||
        textLower.includes('professional') || textLower.includes('service') || textLower.includes('advisory')) {
      return 'administrative_expenses'
    }
    
    // Default to administrative expenses for unknown expenses
    return 'administrative_expenses'
  }

  // Map basic transaction information
  mappedData.transaction_type = 'expense' // Most documents are expenses

  const extractedData = document.extracted_data as any

  console.log(`[Transaction Mapper] Extracted data structure:`, {
    isDSPyFormat: !!(extractedData.vendor_name || extractedData.total_amount || extractedData.document_type),
    hasDocumentSummary: !!extractedData.document_summary,
    hasLegacyEntities: !!(extractedData.entities && Array.isArray(extractedData.entities)),
    vendorName: extractedData.vendor_name || 'none',
    totalAmount: extractedData.total_amount || 'none',
    currency: extractedData.currency || 'none',
    lineItems: extractedData.line_items ? `${extractedData.line_items.length} items` : 'none'
  });

  // Declare summary variable for use throughout function
  let summary: any = null

  // Check if this is DSPy structure (new format) or legacy structure
  // Priority: DSPy direct fields > document_summary > entities
  const isDSPyFormat = !!(extractedData.vendor_name || extractedData.total_amount || extractedData.document_type)

  if (isDSPyFormat) {
    // Handle DSPy structure directly (new format)
    console.log(`[Transaction Mapper] Processing DSPy structure`);

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
      console.log(`[Transaction Mapper] Mapped document type: ${mappedData.document_type}`);
    }

    // Set transaction status based on document type
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
      console.log(`[Transaction Mapper] Mapped vendor: ${mappedData.vendor_name}`);
    }

    // Extract amount and currency
    if (extractedData.total_amount) {
      mappedData.original_amount = parseAmount(extractedData.total_amount)

      // Use currency from DSPy extraction
      if (extractedData.currency) {
        mappedData.original_currency = extractedData.currency as SupportedCurrency
      } else {
        // Fallback to currency detection
        const currencyFromText = detectCurrency(document.extracted_data?.text || '')
        mappedData.original_currency = currencyFromText
      }
      console.log(`[Transaction Mapper] Mapped amount: ${mappedData.original_amount} ${mappedData.original_currency}`);
    }

    // Extract transaction date (DSPy uses document_date, not transaction_date)
    if (extractedData.document_date) {
      mappedData.transaction_date = parseDate(extractedData.document_date)
      console.log(`[Transaction Mapper] Mapped date: ${mappedData.transaction_date}`);
    } else if (extractedData.transaction_date) {
      // Legacy fallback
      mappedData.transaction_date = parseDate(extractedData.transaction_date)
    }
  } else {
    // Handle legacy document_summary structure
    console.log(`[Transaction Mapper] Processing legacy document_summary structure`);
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
    
    // Set initial transaction status based on document type
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
  
  // Extract reference number - use standardized document_number field from DSPy
  // First, try raw DSPy structure (new format)
  if (extractedData.document_number) {
    mappedData.reference_number = extractedData.document_number
    console.log(`[Transaction Mapper] Mapped reference number from DSPy: ${mappedData.reference_number}`);
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

  // Categorize transaction
  mappedData.category = categorizeTransaction(
    document.extracted_data?.text || '',
    mappedData.vendor_name
  )
  console.log(`[Transaction Mapper] Mapped category: ${mappedData.category}`);

  // Note: vendor_details is not part of CreateTransactionRequest

  // Extract structured line items from OCR data
  // For raw DSPy structure, line items are directly available
  // For legacy structure, try different locations
  let lineItemsSource = null;

  console.log(`[Transaction Mapper] Debug - extractedData structure:`, {
    hasDirectLineItems: !!(extractedData.line_items && Array.isArray(extractedData.line_items)),
    extractedDataLineItems: extractedData.line_items ? extractedData.line_items.length : 'none',
    documentLineItems: document.extracted_data.line_items ? document.extracted_data.line_items.length : 'none',
    metadataLineItems: document.extracted_data.metadata?.layoutElements?.line_items ? document.extracted_data.metadata?.layoutElements?.line_items.length : 'none'
  });

  // Priority order for raw DSPy: direct line_items first, then nested paths
  if (extractedData.line_items && Array.isArray(extractedData.line_items) && extractedData.line_items.length > 0) {
    lineItemsSource = extractedData.line_items;
    console.log(`[Transaction Mapper] Using direct extractedData.line_items (${lineItemsSource.length} items)`);
  } else if (document.extracted_data.line_items && Array.isArray(document.extracted_data.line_items) && document.extracted_data.line_items.length > 0) {
    lineItemsSource = document.extracted_data.line_items;
    console.log(`[Transaction Mapper] Using document.extracted_data.line_items (${lineItemsSource.length} items)`);
  } else if (document.extracted_data.metadata?.layoutElements?.line_items && Array.isArray(document.extracted_data.metadata?.layoutElements?.line_items) && document.extracted_data.metadata.layoutElements.line_items.length > 0) {
    lineItemsSource = document.extracted_data.metadata?.layoutElements?.line_items;
    console.log(`[Transaction Mapper] Using metadata line_items (${lineItemsSource.length} items)`);
  } else {
    lineItemsSource = [];
    console.log(`[Transaction Mapper] No line items found in any location`);
  }

  console.log(`[Transaction Mapper] Line items detection: Found ${lineItemsSource?.length || 0} items`);
  if (lineItemsSource && lineItemsSource.length > 0) {
    console.log('[Transaction Mapper] First line item structure:', JSON.stringify(lineItemsSource[0], null, 2));
  }
  if (lineItemsSource && lineItemsSource.length > 0) {
    const lineItems: CreateLineItemRequest[] = []
    
    lineItemsSource.forEach((structuredItem: any, index: number) => {
      console.log(`[Transaction Mapper] Processing line item ${index + 1}:`, {
        raw: structuredItem,
        description_raw: structuredItem.description,
        item_code_raw: structuredItem.item_code,
        quantity_raw: structuredItem.quantity,
        unit_price_raw: structuredItem.unit_price,
        line_total_raw: structuredItem.line_total
      });
      // Handle both raw DSPy format (direct values) and legacy format (nested .value)
      const description = structuredItem.description?.value || structuredItem.description || `Item ${index + 1}`
      const itemCode = structuredItem.item_code?.value || structuredItem.item_code || undefined
      const quantity = parseFloat(structuredItem.quantity?.value || structuredItem.quantity || '1') || 1
      const unitMeasurement = structuredItem.unit_measurement?.value || structuredItem.unit_of_measure || structuredItem.unit_measurement || undefined
      const unitPrice = parseAmount(structuredItem.unit_price?.value || structuredItem.unit_price || '0')
      const lineTotal = parseAmount(structuredItem.line_total?.value || structuredItem.line_total || '0')
      // Calculate unit price from line total if unit price is 0 but line total exists
      const finalUnitPrice = unitPrice > 0 ? unitPrice : (lineTotal > 0 && quantity > 0 ? lineTotal / quantity : 0)

      console.log(`[Transaction Mapper] Processed line item ${index + 1}:`, {
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
        console.log(`[Transaction Mapper] Added line item ${index + 1} to array:`, lineItem);
      } else {
        console.log(`[Transaction Mapper] Skipped line item ${index + 1} - failed validation`);
      }
    })
    
    mappedData.line_items = lineItems
    console.log(`[Transaction Mapper] Final mapped line items (${lineItems.length} items):`, lineItems);
  } else {
    // Fallback: create single line item from total amount if no structured line items
    console.log(`[Transaction Mapper] No line items found, creating fallback from total amount: ${mappedData.original_amount}`);
    if (mappedData.original_amount && mappedData.original_amount > 0) {
      mappedData.line_items = [{
        description: mappedData.description || 'Extracted from document',
        quantity: 1,
        unit_price: mappedData.original_amount,
        tax_rate: 0,
        item_category: mappedData.category || 'administrative_expenses'
      }]
      console.log(`[Transaction Mapper] Created fallback line item:`, mappedData.line_items[0]);
    }
  }

  console.log(`[Transaction Mapper] Final mapped data summary:`, {
    vendor: mappedData.vendor_name,
    amount: mappedData.original_amount,
    currency: mappedData.original_currency,
    lineItemsCount: mappedData.line_items?.length || 0,
    hasLineItems: !!(mappedData.line_items && mappedData.line_items.length > 0)
  });

  return mappedData
}

/**
 * Checks if a document has sufficient data for transaction creation
 */
export function canCreateTransactionFromDocument(document: DocumentData): boolean {
  if (!document.extracted_data) {
    return false
  }

  const extractedData = document.extracted_data as any

  // Check DSPy structure first (new format) - priority check
  const hasAmountDSPy = extractedData.total_amount
  const hasVendorDSPy = extractedData.vendor_name

  if (hasAmountDSPy || hasVendorDSPy) {
    console.log('[Transaction Mapper] Document can create transaction - DSPy format detected');
    return true
  }

  // Fallback to legacy document_summary structure
  const hasAmountLegacy = extractedData.document_summary?.total_amount?.value
  const hasVendorLegacy = extractedData.document_summary?.vendor_name?.value

  if (hasAmountLegacy || hasVendorLegacy) {
    console.log('[Transaction Mapper] Document can create transaction - legacy document_summary format detected');
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
      console.log('[Transaction Mapper] Document can create transaction - legacy entities format detected');
      return true
    }
  }

  console.log('[Transaction Mapper] Document cannot create transaction - insufficient data in any format');
  return false
}