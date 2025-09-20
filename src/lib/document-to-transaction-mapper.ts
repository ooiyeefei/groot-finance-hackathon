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
    text: string
    entities: ExtractedEntity[]
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
    line_items?: StructuredLineItem[]
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
  if (!document.extracted_data?.entities) {
    return {}
  }

  const entities = document.extracted_data.entities
  const mappedData: Partial<CreateTransactionRequest> = {}

  // Helper function to find entity by type
  const findEntity = (types: string[]) => {
    return entities.find(entity => 
      types.some(type => 
        entity.type.toLowerCase().includes(type.toLowerCase()) ||
        type.toLowerCase().includes(entity.type.toLowerCase())
      )
    )
  }

  // Helper function to parse amount from string
  const parseAmount = (value: string): number => {
    const cleaned = value.replace(/[^\d.,]/g, '').replace(',', '.')
    const parsed = parseFloat(cleaned)
    return isNaN(parsed) ? 0 : parsed
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

  // Declare summary variable for use throughout function
  let summary: any = null

  // Check if this is raw DSPy structure (new format) or legacy structure
  const isRawDSPy = extractedData.vendor_name || extractedData.total_amount || extractedData.document_type

  if (isRawDSPy) {
    // Handle raw DSPy structure directly

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
    }

    // Extract amount and currency
    if (extractedData.total_amount) {
      mappedData.original_amount = parseFloat(extractedData.total_amount) || parseAmount(String(extractedData.total_amount))

      // Use currency from DSPy extraction
      if (extractedData.currency) {
        mappedData.original_currency = extractedData.currency as SupportedCurrency
      } else {
        // Fallback to currency detection
        const currencyFromText = detectCurrency(document.extracted_data.text)
        mappedData.original_currency = currencyFromText
      }
    }

    // Extract transaction date (DSPy uses document_date, not transaction_date)
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
      const currencyFromText = detectCurrency(document.extracted_data.text)
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
      const currencyFromText = detectCurrency(document.extracted_data.text)
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
  // (extractedData is already declared above)

  // First, try raw DSPy structure (new format)
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

  // Categorize transaction
  mappedData.category = categorizeTransaction(
    document.extracted_data.text, 
    mappedData.vendor_name
  )

  // Note: vendor_details is not part of CreateTransactionRequest

  // Extract structured line items from OCR data
  // For raw DSPy structure, line items are directly available
  // For legacy structure, try different locations
  const lineItemsSource = (extractedData.line_items && Array.isArray(extractedData.line_items)) ?
                         extractedData.line_items :
                         (document.extracted_data.line_items ||
                          document.extracted_data.metadata?.layoutElements?.line_items ||
                          [])
  
  if (lineItemsSource && lineItemsSource.length > 0) {
    const lineItems: CreateLineItemRequest[] = []
    
    lineItemsSource.forEach((structuredItem: any, index: number) => {
      // Handle both raw DSPy format (direct values) and legacy format (nested .value)
      const description = structuredItem.description?.value || structuredItem.description || `Item ${index + 1}`
      const itemCode = structuredItem.item_code?.value || structuredItem.item_code || undefined
      const quantity = parseFloat(structuredItem.quantity?.value || structuredItem.quantity || '1') || 1
      const unitMeasurement = structuredItem.unit_measurement?.value || structuredItem.unit_of_measure || structuredItem.unit_measurement || undefined
      const unitPrice = parseAmount(structuredItem.unit_price?.value || structuredItem.unit_price || '0')
      const lineTotal = parseAmount(structuredItem.line_total?.value || structuredItem.line_total || '0')
      
      // Calculate unit price from line total if unit price is 0 but line total exists
      const finalUnitPrice = unitPrice > 0 ? unitPrice : (lineTotal > 0 && quantity > 0 ? lineTotal / quantity : 0)
      
      if (description && quantity > 0 && finalUnitPrice > 0) {
        lineItems.push({
          description: description.trim(),
          item_code: itemCode,
          quantity: quantity,
          unit_measurement: unitMeasurement,
          unit_price: finalUnitPrice,
          tax_rate: 0, // TODO: Extract tax rate from OCR if available
          item_category: mappedData.category || 'cost_of_goods_sold'
        })
      }
    })
    
    mappedData.line_items = lineItems
  } else {
    // Fallback: create single line item from total amount if no structured line items
    if (mappedData.original_amount && mappedData.original_amount > 0) {
      mappedData.line_items = [{
        description: mappedData.description || 'Extracted from document',
        quantity: 1,
        unit_price: mappedData.original_amount,
        tax_rate: 0,
        item_category: mappedData.category || 'administrative_expenses'
      }]
    }
  }

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

  // Check raw DSPy structure first (new format)
  const hasAmountDSPy = extractedData.total_amount || extractedData.document_summary?.total_amount?.value
  const hasVendorDSPy = extractedData.vendor_name || extractedData.document_summary?.vendor_name?.value

  if (hasAmountDSPy || hasVendorDSPy) {
    return true
  }

  // Fallback to legacy entities format (old format)
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

    return hasAmount || hasVendor
  }

  return false
}