/**
 * Transaction Management Types for FinanSEAL MVP
 * Supporting Southeast Asian SME multi-currency operations
 */

// Core P&L transaction types - Following accounting standards (Income Statement only for P&L focus)
export type TransactionType = 'Income' | 'Cost of Goods Sold' | 'Expense'
export type CreationMethod = 'manual' | 'document_extract'

// Document types from OCR extraction
export type DocumentType = 'invoice' | 'receipt' | 'bill' | 'statement' | 'contract' | 'other'

// Southeast Asian currencies (most common)
export type SupportedCurrency =
  | 'THB' // Thai Baht
  | 'IDR' // Indonesian Rupiah
  | 'MYR' // Malaysian Ringgit
  | 'SGD' // Singapore Dollar
  | 'USD' // US Dollar
  | 'EUR' // Euro
  | 'CNY' // Chinese Yuan
  | 'VND' // Vietnamese Dong
  | 'PHP' // Philippine Peso
  | 'INR' // Indian Rupee

// P&L Chart of Accounts structure following accounting standards
export interface TransactionCategories {
  Income: {
    operating_revenue: string[]
    other_income: string[]
    investment_income: string[]
    government_grants: string[]
  }
  'Cost of Goods Sold': {
    cost_of_goods_sold: string[]
    direct_cost: string[]
  }
  Expense: {
    other_operating: string[]
    marketing_advertising: string[]
    travel_entertainment: string[]
    utilities_communications: string[]
    rent_facilities: string[]
    insurance: string[]
    taxes_licenses: string[]
    depreciation: string[]
    interest_expense: string[]
    software_subscriptions: string[]
    professional_services: string[]
  }
}

// Core AccountingEntry interface
export interface AccountingEntry {
  id: string
  user_id: string
  // ✅ POLYMORPHIC FIELDS: Support both invoices and expense_claims
  source_record_id?: string
  source_document_type?: 'invoice' | 'expense_claim'

  // Classification
  transaction_type: TransactionType
  category: string
  category_name?: string // Resolved human-readable category name from business categories
  subcategory?: string
  description: string
  reference_number?: string
  
  // Multi-currency amounts
  original_currency: SupportedCurrency
  original_amount: number
  home_currency: SupportedCurrency
  home_currency_amount: number
  exchange_rate: number
  exchange_rate_date: string // ISO date
  
  // Business context
  transaction_date: string // ISO date
  vendor_name?: string // Legacy field, being phased out
  vendor_id?: string // NEW: Reference to vendors table for data integrity
  vendor_details?: Record<string, any>
  
  // Transaction status and workflow
  status?: 'pending' | 'paid' | 'overdue' | 'cancelled' | 'disputed'
  due_date?: string // ISO date
  payment_date?: string // ISO date
  payment_method?: string
  notes?: string
  
  // System fields
  created_at: string
  updated_at: string
  created_by_method: CreationMethod
  processing_metadata?: Record<string, any>

  // Cross-border tax compliance analysis (stored as JSONB)
  compliance_analysis?: Record<string, any>

  // Related line items
  line_items?: LineItem[]

  // Related expense claims (when accounting entry was created from approved expense claim)
  expense_claims?: Array<{
    id: string
    status: string
    business_purpose: string
    created_at: string
  }>
}

// Line Item interface for detailed transactions
export interface LineItem {
  id: string
  accounting_entry_id: string
  
  // Item details
  item_description: string  // Database field name
  item_code?: string        // Product/stock/item code from invoice
  quantity: number
  unit_measurement?: string // Unit of measurement (kg, pkt, can, etc.)
  unit_price: number
  total_amount: number      // Database field name
  
  // Currency and metadata
  currency: string
  category?: string
  
  // Tax and discount
  tax_amount?: number
  discount_amount?: number
  tax_rate?: number
  
  // Classification
  item_category?: string
  
  // System fields
  created_at?: string
  updated_at?: string
  line_order?: number
}

// API Request/Response types
export interface CreateAccountingEntryRequest {
  transaction_type: TransactionType
  category: string
  subcategory?: string
  description: string
  transaction_date: string
  original_currency: SupportedCurrency
  original_amount: number
  home_currency: SupportedCurrency
  vendor_name?: string // Legacy field for backward compatibility
  vendor_id?: string // NEW: Link to vendors table
  reference_number?: string
  status?: 'pending' | 'paid' | 'overdue' | 'cancelled' | 'disputed'
  due_date?: string // ISO date
  payment_date?: string // ISO date
  payment_method?: string
  notes?: string
  line_items?: CreateLineItemRequest[]
  // ✅ POLYMORPHIC FIELDS: Support both invoices and expense_claims
  source_record_id?: string  // UUID that can reference invoices.id OR expense_claims.id
  source_document_type?: 'invoice' | 'expense_claim'  // Discriminator column
}

export interface CreateLineItemRequest {
  description: string  // This will map to item_description in database
  item_code?: string   // Product/stock/item code from invoice
  quantity: number
  unit_measurement?: string  // Unit of measurement (kg, pkt, can, etc.)
  unit_price: number
  tax_rate?: number
  item_category?: string
}

export interface UpdateAccountingEntryRequest extends Partial<CreateAccountingEntryRequest> {
  // All fields are optional for updates
  id?: never // Prevent ID from being updated
}

// Document to AccountingEntry conversion
export interface DocumentToAccountingEntryPreview {
  source_record_id: string
  suggested_accounting_entry: Partial<CreateAccountingEntryRequest>
  confidence_score: number
  entity_mapping: EntityMapping[]
  warnings: string[]
}

export interface EntityMapping {
  entity_type: string
  entity_value: string
  mapped_field: keyof CreateAccountingEntryRequest
  confidence: number
}

// AccountingEntry list/filter types
export interface AccountingEntryListParams {
  page?: number
  limit?: number
  transaction_type?: TransactionType
  category?: string
  date_from?: string
  date_to?: string
  search?: string
  sort_by?: 'date' | 'amount' | 'created_at' | 'transaction_date' | 'original_amount'
  sort_order?: 'asc' | 'desc'
}

export interface AccountingEntryListResponse {
  accounting_entries: AccountingEntry[]
  total: number
  page: number
  limit: number
  has_more: boolean
}

// Currency conversion
export interface CurrencyConversion {
  from_currency: SupportedCurrency
  to_currency: SupportedCurrency
  amount: number
  converted_amount: number
  exchange_rate: number
  rate_date: string
  rate_source: string
}

export interface ExchangeRateService {
  getCurrentRate(from: SupportedCurrency, to: SupportedCurrency): Promise<number>
  convertAmount(amount: number, from: SupportedCurrency, to: SupportedCurrency): Promise<CurrencyConversion>
  getHistoricalRate(from: SupportedCurrency, to: SupportedCurrency, date: string): Promise<number>
}

// Dashboard/Analytics types
export interface AccountingEntrySummary {
  total_income: number
  total_expense: number
  net_amount: number
  currency: SupportedCurrency
  period: 'month' | 'quarter' | 'year'
  accounting_entry_count: number
  top_categories: CategorySummary[]
}

export interface CategorySummary {
  category: string
  amount: number
  percentage: number
  accounting_entry_count: number
}

// Error types
export interface AccountingEntryError {
  code: string
  message: string
  field?: string
  details?: Record<string, any>
}


// P&L-Focused Chart of Accounts for SME Financial Management
export const TRANSACTION_CATEGORIES: TransactionCategories = {
  Income: {
    operating_revenue: ['product_sales', 'service_income', 'consultation_fees', 'subscription_revenue'],
    other_income: ['rental_income', 'commission_income', 'misc_income', 'foreign_exchange_gain'],
    investment_income: ['interest_received', 'dividend_income', 'capital_gains', 'investment_returns'],
    government_grants: ['business_grants', 'subsidies', 'tax_refunds', 'covid_relief']
  },
  'Cost of Goods Sold': {
    cost_of_goods_sold: ['raw_materials', 'direct_labor', 'manufacturing_overhead', 'inventory_cost'],
    direct_cost: ['invoice_purchases', 'supplier_costs', 'vendor_payments', 'direct_materials']
  },
  Expense: {
    other_operating: ['office_supplies', 'software_subscriptions', 'professional_services', 'bank_fees'],
    marketing_advertising: ['digital_marketing', 'trade_shows', 'advertising', 'promotional_materials'],
    travel_entertainment: ['business_travel', 'meals_entertainment', 'accommodation', 'transport', 'travel_expenses'],
    utilities_communications: ['electricity', 'water', 'internet', 'phone', 'telecom_services'],
    rent_facilities: ['office_rent', 'warehouse_rent', 'equipment_lease', 'storage_fees'],
    insurance: ['business_insurance', 'health_insurance', 'property_insurance', 'liability_insurance'],
    taxes_licenses: ['income_tax', 'sales_tax', 'business_licenses', 'regulatory_fees'],
    depreciation: ['equipment_depreciation', 'building_depreciation', 'vehicle_depreciation', 'asset_depreciation'],
    interest_expense: ['loan_interest', 'credit_interest', 'finance_charges', 'bank_interest'],
    software_subscriptions: ['saas_tools', 'cloud_services', 'productivity_software', 'accounting_software'],
    professional_services: ['legal_fees', 'accounting_services', 'consulting', 'advisory_services']
  }
}

// Currency display formatting helpers
export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  THB: '฿',
  IDR: 'Rp',
  MYR: 'RM',
  SGD: 'S$',
  USD: '$',
  EUR: '€',
  CNY: '¥',
  VND: '₫',
  PHP: '₱',
  INR: '₹'
}

export const CURRENCY_NAMES: Record<SupportedCurrency, string> = {
  THB: 'Thai Baht',
  IDR: 'Indonesian Rupiah',
  MYR: 'Malaysian Ringgit',
  SGD: 'Singapore Dollar',
  USD: 'US Dollar',
  EUR: 'Euro',
  CNY: 'Chinese Yuan',
  VND: 'Vietnamese Dong',
  PHP: 'Philippine Peso',
  INR: 'Indian Rupee'
}