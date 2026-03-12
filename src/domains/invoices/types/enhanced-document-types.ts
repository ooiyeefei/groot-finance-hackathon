/**
 * Enhanced Document Type System
 * Supports adaptive schema selection for optimal extraction balance
 */

// Document type classification
export type DocumentType =
  | 'invoice'           // Business invoices with line items
  | 'receipt'           // Simple receipts (retail, restaurant, etc.)
  | 'bill'              // Utility bills, service bills
  | 'statement'         // Account statements, summaries
  | 'purchase_order'    // Purchase orders and requisitions
  | 'delivery_note'     // Delivery receipts, shipping docs
  | 'credit_note'       // Credit notes, refunds
  | 'ride_receipt'      // Grab, Uber, transport receipts
  | 'sales_statement'   // Platform sales statement / marketplace settlement report
  | 'unknown'           // Fallback for unrecognized formats

// Industry context for format-specific extraction
export type IndustryContext = 
  | 'retail'            // Supermarkets, shops
  | 'restaurant'        // Food & beverage
  | 'electronics'       // Tech products, components
  | 'raw_materials'     // Manufacturing inputs
  | 'services'          // Professional services
  | 'transport'         // Logistics, shipping
  | 'utilities'         // Energy, water, telecoms
  | 'ecommerce'         // E-commerce platforms, marketplaces
  | 'general'           // Generic business expense

// Confidence levels for extraction quality
export interface ExtractionConfidence {
  document_type: number        // 0-1: How certain are we of document type
  vendor_recognition: number   // 0-1: Known vendor pattern match
  amount_extraction: number    // 0-1: Financial data extraction quality
  line_items: number          // 0-1: Line item structure confidence
  overall: number             // 0-1: Overall extraction confidence
}

// Document-specific schema definitions
export interface DocumentSchema {
  document_type: DocumentType
  industry_context: IndustryContext
  required_fields: string[]
  optional_fields: string[]
  line_item_structure: LineItemStructure
  extraction_rules: ExtractionRules
}

// Line item structure varies by document type
export interface LineItemStructure {
  has_item_codes: boolean          // SKU, model numbers, etc.
  has_quantities: boolean          // Quantity/unit measurements
  has_unit_prices: boolean         // Price per unit
  has_tax_breakdown: boolean       // Tax details per item
  has_discounts: boolean           // Item-level discounts
  custom_fields?: string[]         // Industry-specific fields
}

// Extraction rules for different document types
export interface ExtractionRules {
  currency_detection: 'strict' | 'flexible' | 'multi'
  date_formats: string[]
  amount_validation: 'sum_validation' | 'total_only' | 'flexible'
  vendor_patterns?: string[]       // Known vendor name patterns
  line_item_parsing: 'structured' | 'flexible' | 'simple'
}

// Enhanced extraction response with document intelligence
export interface EnhancedExtractionResponse {
  // Document classification
  document_type: DocumentType
  industry_context: IndustryContext
  confidence: ExtractionConfidence
  
  // Core extracted data (universal)
  vendor_name: string
  total_amount: number
  currency: string
  transaction_date: string
  description: string
  
  // Document-specific data (adaptive)
  invoice_data?: InvoiceSpecificData
  receipt_data?: ReceiptSpecificData
  bill_data?: BillSpecificData
  transport_data?: TransportSpecificData
  
  // Line items (adaptive structure)
  line_items: AdaptiveLineItem[]
  
  // Processing metadata
  processing_method: 'gemini_primary' | 'dspy_fallback' | 'legacy_ocr'
  extraction_time_ms: number
  requires_validation: boolean
  reasoning: string
}

// Format-specific data structures
export interface InvoiceSpecificData {
  invoice_number: string
  customer_info: {
    name?: string
    address?: string
    tax_id?: string
  }
  payment_terms?: string
  due_date?: string
  purchase_order_ref?: string
  tax_summary: {
    subtotal: number
    tax_rate: number
    tax_amount: number
    discount_amount?: number
  }
}

export interface ReceiptSpecificData {
  receipt_number?: string
  cashier_id?: string
  payment_method: string
  change_amount?: number
  loyalty_points?: number
  store_location?: string
}

export interface BillSpecificData {
  account_number?: string
  billing_period?: string
  previous_balance?: number
  current_charges?: number
  due_date?: string
  service_address?: string
}

export interface TransportSpecificData {
  trip_id?: string
  pickup_location?: string
  dropoff_location?: string
  distance?: number
  duration?: string
  driver_info?: string
  rating?: number
  vehicle_info?: string
}

// Adaptive line item structure
export interface AdaptiveLineItem {
  // Universal fields (always present)
  description: string
  amount: number
  
  // Conditional fields (based on document type)
  item_code?: string              // SKU, model number, etc.
  quantity?: number               // Quantity ordered/purchased
  unit?: string                   // Unit of measurement
  unit_price?: number             // Price per unit
  tax_rate?: number               // Tax percentage for this item
  tax_amount?: number             // Tax amount for this item
  discount_rate?: number          // Discount percentage
  discount_amount?: number        // Discount amount
  
  // Industry-specific fields
  batch_number?: string           // For raw materials
  expiry_date?: string           // For food/pharma
  serial_number?: string         // For electronics
  service_period?: string        // For services
  specifications?: string        // Technical specs
  
  // Confidence per field
  field_confidence?: Record<string, number>
}

// Pre-defined document schemas for common types
export const DOCUMENT_SCHEMAS: Record<DocumentType, DocumentSchema> = {
  invoice: {
    document_type: 'invoice',
    industry_context: 'general',
    required_fields: ['vendor_name', 'invoice_number', 'total_amount', 'currency', 'transaction_date'],
    optional_fields: ['customer_info', 'payment_terms', 'due_date', 'purchase_order_ref', 'tax_summary'],
    line_item_structure: {
      has_item_codes: true,
      has_quantities: true,
      has_unit_prices: true,
      has_tax_breakdown: true,
      has_discounts: true
    },
    extraction_rules: {
      currency_detection: 'strict',
      date_formats: ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'],
      amount_validation: 'sum_validation',
      line_item_parsing: 'structured'
    }
  },
  
  receipt: {
    document_type: 'receipt',
    industry_context: 'retail',
    required_fields: ['vendor_name', 'total_amount', 'currency', 'transaction_date'],
    optional_fields: ['receipt_number', 'cashier_id', 'payment_method', 'store_location'],
    line_item_structure: {
      has_item_codes: false,
      has_quantities: true,
      has_unit_prices: true,
      has_tax_breakdown: false,
      has_discounts: false
    },
    extraction_rules: {
      currency_detection: 'flexible',
      date_formats: ['YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY'],
      amount_validation: 'total_only',
      line_item_parsing: 'simple'
    }
  },

  bill: {
    document_type: 'bill',
    industry_context: 'utilities',
    required_fields: ['vendor_name', 'total_amount', 'currency', 'due_date'],
    optional_fields: ['account_number', 'billing_period', 'previous_balance', 'current_charges'],
    line_item_structure: {
      has_item_codes: false,
      has_quantities: false,
      has_unit_prices: false,
      has_tax_breakdown: true,
      has_discounts: false
    },
    extraction_rules: {
      currency_detection: 'strict',
      date_formats: ['YYYY-MM-DD', 'DD/MM/YYYY'],
      amount_validation: 'total_only',
      line_item_parsing: 'flexible'
    }
  },

  ride_receipt: {
    document_type: 'ride_receipt',
    industry_context: 'transport',
    required_fields: ['vendor_name', 'total_amount', 'currency', 'transaction_date'],
    optional_fields: ['trip_id', 'pickup_location', 'dropoff_location', 'distance', 'rating'],
    line_item_structure: {
      has_item_codes: false,
      has_quantities: false,
      has_unit_prices: false,
      has_tax_breakdown: false,
      has_discounts: true
    },
    extraction_rules: {
      currency_detection: 'flexible',
      date_formats: ['YYYY-MM-DD HH:mm', 'DD/MM/YYYY HH:mm'],
      amount_validation: 'flexible',
      line_item_parsing: 'simple'
    }
  },

  statement: {
    document_type: 'statement',
    industry_context: 'general',
    required_fields: ['vendor_name', 'total_amount', 'currency', 'transaction_date'],
    optional_fields: ['account_number', 'statement_period', 'previous_balance'],
    line_item_structure: {
      has_item_codes: false,
      has_quantities: false,
      has_unit_prices: false,
      has_tax_breakdown: false,
      has_discounts: false
    },
    extraction_rules: {
      currency_detection: 'strict',
      date_formats: ['YYYY-MM-DD', 'DD/MM/YYYY'],
      amount_validation: 'flexible',
      line_item_parsing: 'flexible'
    }
  },

  purchase_order: {
    document_type: 'purchase_order',
    industry_context: 'general',
    required_fields: ['vendor_name', 'total_amount', 'currency', 'transaction_date'],
    optional_fields: ['po_number', 'delivery_date', 'shipping_address'],
    line_item_structure: {
      has_item_codes: true,
      has_quantities: true,
      has_unit_prices: true,
      has_tax_breakdown: true,
      has_discounts: true
    },
    extraction_rules: {
      currency_detection: 'strict',
      date_formats: ['YYYY-MM-DD', 'DD/MM/YYYY'],
      amount_validation: 'sum_validation',
      line_item_parsing: 'structured'
    }
  },

  delivery_note: {
    document_type: 'delivery_note',
    industry_context: 'general',
    required_fields: ['vendor_name', 'transaction_date'],
    optional_fields: ['delivery_number', 'reference_number', 'delivered_to'],
    line_item_structure: {
      has_item_codes: true,
      has_quantities: true,
      has_unit_prices: false,
      has_tax_breakdown: false,
      has_discounts: false
    },
    extraction_rules: {
      currency_detection: 'flexible',
      date_formats: ['YYYY-MM-DD', 'DD/MM/YYYY'],
      amount_validation: 'flexible',
      line_item_parsing: 'structured'
    }
  },

  credit_note: {
    document_type: 'credit_note',
    industry_context: 'general',
    required_fields: ['vendor_name', 'total_amount', 'currency', 'transaction_date'],
    optional_fields: ['credit_note_number', 'original_invoice_ref', 'reason'],
    line_item_structure: {
      has_item_codes: true,
      has_quantities: true,
      has_unit_prices: true,
      has_tax_breakdown: true,
      has_discounts: false
    },
    extraction_rules: {
      currency_detection: 'strict',
      date_formats: ['YYYY-MM-DD', 'DD/MM/YYYY'],
      amount_validation: 'sum_validation',
      line_item_parsing: 'structured'
    }
  },

  sales_statement: {
    document_type: 'sales_statement',
    industry_context: 'ecommerce',
    required_fields: ['vendor_name', 'total_amount', 'currency', 'transaction_date'],
    optional_fields: ['platform_name', 'settlement_period', 'commission_total', 'shipping_total', 'net_payout'],
    line_item_structure: {
      has_item_codes: true,
      has_quantities: true,
      has_unit_prices: true,
      has_tax_breakdown: false,
      has_discounts: true
    },
    extraction_rules: {
      currency_detection: 'strict',
      date_formats: ['YYYY-MM-DD', 'DD/MM/YYYY'],
      amount_validation: 'sum_validation',
      line_item_parsing: 'structured'
    }
  },

  unknown: {
    document_type: 'unknown',
    industry_context: 'general',
    required_fields: ['vendor_name', 'total_amount', 'currency', 'transaction_date'],
    optional_fields: [],
    line_item_structure: {
      has_item_codes: false,
      has_quantities: false,
      has_unit_prices: false,
      has_tax_breakdown: false,
      has_discounts: false
    },
    extraction_rules: {
      currency_detection: 'flexible',
      date_formats: ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'],
      amount_validation: 'flexible',
      line_item_parsing: 'flexible'
    }
  }
}

// Vendor pattern recognition for Southeast Asia
export const KNOWN_VENDOR_PATTERNS: Record<string, {
  document_type: DocumentType,
  industry_context: IndustryContext,
  confidence_boost: number
}> = {
  // Retail chains
  '7-ELEVEN': { document_type: 'receipt', industry_context: 'retail', confidence_boost: 0.2 },
  'NTUC FAIRPRICE': { document_type: 'receipt', industry_context: 'retail', confidence_boost: 0.2 },
  'GIANT': { document_type: 'receipt', industry_context: 'retail', confidence_boost: 0.2 },
  'COLD STORAGE': { document_type: 'receipt', industry_context: 'retail', confidence_boost: 0.2 },
  
  // Food & Beverage
  'STARBUCKS': { document_type: 'receipt', industry_context: 'restaurant', confidence_boost: 0.2 },
  'MCDONALD\'S': { document_type: 'receipt', industry_context: 'restaurant', confidence_boost: 0.2 },
  'KFC': { document_type: 'receipt', industry_context: 'restaurant', confidence_boost: 0.2 },
  
  // Fuel stations
  'SHELL': { document_type: 'receipt', industry_context: 'transport', confidence_boost: 0.2 },
  'ESSO': { document_type: 'receipt', industry_context: 'transport', confidence_boost: 0.2 },
  'CALTEX': { document_type: 'receipt', industry_context: 'transport', confidence_boost: 0.2 },
  'PETRON': { document_type: 'receipt', industry_context: 'transport', confidence_boost: 0.2 },
  
  // Transport services
  'GRAB': { document_type: 'ride_receipt', industry_context: 'transport', confidence_boost: 0.3 },
  'UBER': { document_type: 'ride_receipt', industry_context: 'transport', confidence_boost: 0.3 },
  'GOJEK': { document_type: 'ride_receipt', industry_context: 'transport', confidence_boost: 0.3 },
  
  // Utilities (likely bills)
  'SP GROUP': { document_type: 'bill', industry_context: 'utilities', confidence_boost: 0.2 },
  'PUB': { document_type: 'bill', industry_context: 'utilities', confidence_boost: 0.2 },
  'SINGTEL': { document_type: 'bill', industry_context: 'utilities', confidence_boost: 0.2 },
  'TNB': { document_type: 'bill', industry_context: 'utilities', confidence_boost: 0.2 }, // Malaysia
}