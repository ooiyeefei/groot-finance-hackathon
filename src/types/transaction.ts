/**
 * Transaction Management Types for FinanSEAL MVP
 * Supporting Southeast Asian SME multi-currency operations
 */

// Core transaction types - Following accounting standards (Income Statement + Balance Sheet)  
export type TransactionType = 'income' | 'expense' | 'transfer' | 'asset' | 'liability' | 'equity'
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

// Hierarchical Chart of Accounts structure following IFRS standards
export interface TransactionCategories {
  income: {
    operating_revenue: string[]
    other_income: string[]
    investment_income: string[]
    government_grants: string[]
  }
  expense: {
    cost_of_goods_sold: string[]
    administrative_expenses: string[]
    marketing_advertising: string[]
    travel_entertainment: string[]
    utilities_communications: string[]
    rent_facilities: string[]
    insurance: string[]
    taxes_licenses: string[]
    depreciation: string[]
    interest_expense: string[]
    other_operating: string[]
  }
  transfer: {
    internal_transfer: string[]
    bank_transfer: string[]
    credit_payment: string[]
  }
  asset: {
    current_assets: string[]
    fixed_assets: string[]
    intangible_assets: string[]
  }
  liability: {
    current_liabilities: string[]
    long_term_liabilities: string[]
  }
  equity: {
    owner_investment: string[]
    retained_earnings: string[]
    owner_withdrawal: string[]
  }
}

// Core Transaction interface
export interface Transaction {
  id: string
  user_id: string
  document_id?: string
  
  // Classification
  transaction_type: TransactionType
  category: string
  subcategory?: string
  description: string
  reference_number?: string
  document_type?: DocumentType // From OCR extraction
  
  // Multi-currency amounts
  original_currency: SupportedCurrency
  original_amount: number
  home_currency: SupportedCurrency
  home_amount: number
  exchange_rate: number
  exchange_rate_date: string // ISO date
  
  // Business context
  transaction_date: string // ISO date
  vendor_name?: string
  vendor_details?: Record<string, any>
  
  // System fields
  created_at: string
  updated_at: string
  created_by_method: CreationMethod
  processing_metadata?: Record<string, any>
  
  // Related line items
  line_items?: LineItem[]
}

// Line Item interface for detailed transactions
export interface LineItem {
  id: string
  transaction_id: string
  
  // Item details - Database uses item_description and total_amount, not description and line_total
  item_description: string  // Database field name
  description?: string      // Legacy field (null in database)
  item_code?: string        // Product/stock/item code from invoice
  quantity: number
  unit_measurement?: string // Unit of measurement (kg, pkt, can, etc.)
  unit_price: number
  total_amount: number      // Database field name  
  line_total?: number       // Legacy field (null in database)
  
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
export interface CreateTransactionRequest {
  transaction_type: TransactionType
  category: string
  subcategory?: string
  description: string
  transaction_date: string
  original_currency: SupportedCurrency
  original_amount: number
  home_currency: SupportedCurrency
  vendor_name?: string
  reference_number?: string
  document_type?: DocumentType // From OCR extraction
  line_items?: CreateLineItemRequest[]
  source_document_id?: string  // Optional link to source document
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

export interface UpdateTransactionRequest extends Partial<CreateTransactionRequest> {
  // All fields are optional for updates
  id?: never // Prevent ID from being updated
}

// Document to Transaction conversion
export interface DocumentToTransactionPreview {
  document_id: string
  suggested_transaction: Partial<CreateTransactionRequest>
  confidence_score: number
  entity_mapping: EntityMapping[]
  warnings: string[]
}

export interface EntityMapping {
  entity_type: string
  entity_value: string
  mapped_field: keyof CreateTransactionRequest
  confidence: number
}

// Transaction list/filter types
export interface TransactionListParams {
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

export interface TransactionListResponse {
  transactions: Transaction[]
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
export interface TransactionSummary {
  total_income: number
  total_expense: number
  net_amount: number
  currency: SupportedCurrency
  period: 'month' | 'quarter' | 'year'
  transaction_count: number
  top_categories: CategorySummary[]
}

export interface CategorySummary {
  category: string
  amount: number
  percentage: number
  transaction_count: number
}

// Error types
export interface TransactionError {
  code: string
  message: string
  field?: string
  details?: Record<string, any>
}

// IFRS-Aligned Chart of Accounts for SME Financial Management
export const TRANSACTION_CATEGORIES: TransactionCategories = {
  income: {
    operating_revenue: ['product_sales', 'service_income', 'consultation_fees', 'subscription_revenue'],
    other_income: ['rental_income', 'commission_income', 'misc_income', 'foreign_exchange_gain'],
    investment_income: ['interest_received', 'dividend_income', 'capital_gains', 'investment_returns'],
    government_grants: ['business_grants', 'subsidies', 'tax_refunds', 'covid_relief']
  },
  expense: {
    cost_of_goods_sold: ['raw_materials', 'direct_labor', 'manufacturing_overhead', 'inventory_cost'],
    administrative_expenses: ['office_supplies', 'software_subscriptions', 'professional_services', 'bank_fees'],
    marketing_advertising: ['digital_marketing', 'trade_shows', 'advertising', 'promotional_materials'],
    travel_entertainment: ['business_travel', 'meals_entertainment', 'accommodation', 'transport', 'travel_expenses'],
    utilities_communications: ['electricity', 'water', 'internet', 'phone', 'telecom_services'],
    rent_facilities: ['office_rent', 'warehouse_rent', 'equipment_lease', 'storage_fees'],
    insurance: ['business_insurance', 'health_insurance', 'property_insurance', 'liability_insurance'],
    taxes_licenses: ['income_tax', 'sales_tax', 'business_licenses', 'regulatory_fees'],
    depreciation: ['equipment_depreciation', 'building_depreciation', 'vehicle_depreciation', 'asset_depreciation'],
    interest_expense: ['loan_interest', 'credit_interest', 'finance_charges', 'bank_interest'],
    other_operating: ['repairs_maintenance', 'security', 'cleaning', 'miscellaneous']
  },
  transfer: {
    internal_transfer: ['account_transfer', 'cash_movement', 'internal_allocation', 'fund_transfer'],
    bank_transfer: ['wire_transfer', 'ach_transfer', 'international_transfer', 'currency_exchange'],
    credit_payment: ['credit_card_payment', 'loan_payment', 'line_of_credit', 'financing_payment']
  },
  asset: {
    current_assets: ['cash_purchase', 'inventory_purchase', 'prepaid_expenses', 'accounts_receivable'],
    fixed_assets: ['equipment_purchase', 'building_purchase', 'vehicle_purchase', 'furniture_purchase'],
    intangible_assets: ['software_license', 'patents', 'trademarks', 'goodwill']
  },
  liability: {
    current_liabilities: ['accounts_payable', 'short_term_loan', 'accrued_expenses', 'tax_payable'],
    long_term_liabilities: ['long_term_loan', 'mortgage', 'bonds_payable', 'lease_obligations']
  },
  equity: {
    owner_investment: ['capital_contribution', 'additional_investment', 'share_purchase', 'equity_injection'],
    retained_earnings: ['profit_retention', 'earnings_reinvestment', 'accumulated_profits', 'reserve_funds'],
    owner_withdrawal: ['owner_draws', 'dividend_payment', 'capital_withdrawal', 'distribution']
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
  PHP: '₱'
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
  PHP: 'Philippine Peso'
}