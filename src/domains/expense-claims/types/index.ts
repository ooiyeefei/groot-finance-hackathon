/**
 * North Star Expense Claims Domain Types
 * Consolidated types for the new v1 API
 */

import { SupportedCurrency } from '@/domains/accounting-entries/types'

export type ExpenseClaimStatus =
  | 'draft'
  | 'uploading'
  | 'analyzing'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'reimbursed'
  | 'failed'

// ExpenseCategory is now fully dynamic based on business configuration
// Categories come from businesses.custom_expense_categories JSONB field
export type ExpenseCategory = string

export interface ExpenseLineItemRequest {
  description: string
  quantity: number
  unit_price: number
  tax_rate?: number
  item_category?: string
}

export interface CreateExpenseClaimRequest {
  // Basic expense information
  description: string
  business_purpose: string
  expense_category: ExpenseCategory | null // Allow null for AI processing
  original_amount: number
  original_currency: SupportedCurrency
  transaction_date: string
  vendor_name?: string
  vendor_id?: string

  // Optional fields
  reference_number?: string
  notes?: string
  storage_path?: string

  // Line items for detailed expenses
  line_items?: ExpenseLineItemRequest[]

  // File upload support
  file?: File
  processing_mode?: 'ai' | 'manual'
}

export interface UpdateExpenseClaimRequest {
  // Core update fields
  description?: string
  business_purpose?: string
  business_purpose_details?: string
  expense_category?: ExpenseCategory
  original_amount?: number
  original_currency?: SupportedCurrency
  home_currency?: SupportedCurrency
  transaction_date?: string
  vendor_name?: string
  vendor_id?: string
  reference_number?: string
  notes?: string

  // Line items updates
  line_items?: ExpenseLineItemRequest[]

  // Status change (RESTful approach - no action parameter)
  status?: ExpenseClaimStatus

  // Status change metadata
  comment?: string
  rejection_reason?: string
}

export interface ExpenseClaimListParams {
  page?: number
  limit?: number
  status?: ExpenseClaimStatus
  expense_category?: ExpenseCategory
  user_id?: string
  date_from?: string
  date_to?: string
  search?: string
  sort_by?: 'submission_date' | 'submitted_at' | 'amount' | 'status' | 'created_at'
  sort_order?: 'asc' | 'desc'

  // Special query modes
  check_duplicate?: boolean
  approver?: 'me' // For filtering approval queue
}

export interface ExpenseClaim {
  id: string
  accounting_entry_id: string | null
  user_id: string
  business_id: string
  status: ExpenseClaimStatus

  // Business fields
  business_purpose: string
  business_purpose_details?: string | null
  expense_category: ExpenseCategory

  // Financial fields
  vendor_name?: string
  total_amount: number
  currency: SupportedCurrency
  transaction_date: string
  reference_number?: string | null

  // Currency conversion
  home_currency?: string
  home_currency_amount?: number
  exchange_rate?: number

  // Workflow fields
  current_approver_id?: string | null
  approved_by_ids?: string[]
  rejected_by_id?: string | null
  rejection_reason?: string | null

  // Timestamps
  submission_date?: string | null
  approval_date?: string | null
  reimbursement_date?: string | null
  created_at: string
  updated_at: string

  // File handling
  storage_path?: string | null
  processing_metadata?: any

  // Compliance (keep existing fields)
  risk_score?: number
  vendor_verification_status?: string

  // Related data
  transaction?: any
  employee?: any
  current_approver?: any
}

export interface ExpenseClaimResponse {
  success: boolean
  data?: ExpenseClaim | ExpenseClaim[]
  error?: string
  message?: string
}

export interface ExpenseClaimListResponse {
  success: boolean
  data?: {
    claims: ExpenseClaim[]
    pagination: {
      page: number
      limit: number
      total: number
      has_more: boolean
      total_pages: number
    }
  }
  error?: string
}

// Validation and business rule types
export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export interface WorkflowTransition {
  from: ExpenseClaimStatus
  to: ExpenseClaimStatus
  requiredRole: 'employee' | 'manager' | 'admin'
  validator?: (claim: ExpenseClaim) => boolean
}