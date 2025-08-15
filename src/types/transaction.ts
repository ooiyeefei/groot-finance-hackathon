/**
 * Transaction Management Types for FinanSEAL MVP
 * Supporting Southeast Asian SME multi-currency operations
 */

// Core transaction types
export type TransactionType = 'income' | 'expense' | 'transfer'
export type CreationMethod = 'manual' | 'document_extract'

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

// Transaction categories optimized for SEA SMEs
export interface TransactionCategories {
  income: {
    sales_revenue: string[]
    export_income: string[]
    investment_income: string[]
    government_support: string[]
  }
  expense: {
    operational: string[]
    inventory: string[]
    logistics: string[]
    compliance: string[]
    marketing: string[]
    employee: string[]
  }
  transfer: {
    internal: string[]
    investment: string[]
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
  
  // Item details
  description: string
  quantity: number
  unit_price: number
  line_total: number
  
  // Tax and discount
  tax_amount: number
  discount_amount: number
  tax_rate?: number
  
  // Classification
  item_category?: string
  
  // System fields
  created_at: string
  line_order: number
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
  vendor_name?: string
  reference_number?: string
  line_items?: CreateLineItemRequest[]
}

export interface CreateLineItemRequest {
  description: string
  quantity: number
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
  sort_by?: 'date' | 'amount' | 'created_at'
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

// SEA SME Transaction Category Definitions
export const TRANSACTION_CATEGORIES: TransactionCategories = {
  income: {
    sales_revenue: ['product_sales', 'service_income', 'consultation_fees', 'commission_income'],
    export_income: ['cross_border_sales', 'export_services', 'freight_forwarding', 'trading_income'],
    investment_income: ['interest_received', 'dividend_income', 'rental_income', 'capital_gains'],
    government_support: ['grants', 'subsidies', 'tax_refunds', 'covid_relief']
  },
  expense: {
    operational: ['office_rent', 'utilities', 'insurance', 'software_licenses', 'bank_fees'],
    inventory: ['raw_materials', 'finished_goods', 'packaging', 'storage', 'inventory_loss'],
    logistics: ['shipping_costs', 'customs_duties', 'freight_charges', 'fuel', 'vehicle_maintenance'],
    compliance: ['tax_payments', 'regulatory_fees', 'audit_costs', 'legal_fees', 'permits'],
    marketing: ['advertising', 'trade_shows', 'digital_marketing', 'samples', 'promotional_materials'],
    employee: ['salaries', 'benefits', 'training', 'travel_allowance', 'recruitment']
  },
  transfer: {
    internal: ['bank_transfer', 'cash_movement', 'currency_exchange', 'account_transfer'],
    investment: ['equipment_purchase', 'asset_acquisition', 'loan_repayment', 'investment_deposit']
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