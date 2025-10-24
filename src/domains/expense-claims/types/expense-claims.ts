/**
 * Employee Expense Claims Types
 * Based on expert recommendations from Otto, Mel, and Kevin
 */

import { SupportedCurrency, AccountingEntry } from '@/domains/accounting-entries/types'

// JSONB error message structure for structured error handling
export interface ExpenseClaimErrorMessage {
  message: string              // User-friendly error message
  suggestions?: string[]       // Actionable suggestions for resolution
  error_type?: string         // Category of error (e.g., 'classification_failed', 'extraction_failed')
  error_code?: string         // Specific error code for debugging
  timestamp?: string          // When the error occurred
}

// ✅ Simplified linear workflow status
export type ExpenseClaimStatus =
  | 'draft'                    // Ready for editing (OCR completed or manual entry)
  | 'uploading'               // File uploading
  | 'analyzing'               // 🧠 AI processing receipt
  | 'submitted'               // Submitted for approval
  | 'approved'                // Manager approved
  | 'rejected'                // Manager rejected
  | 'reimbursed'              // Payment processed
  | 'failed'                  // Processing failed

// Legacy aliases for backward compatibility during migration
export type ClaimsApprovalStatus = ExpenseClaimStatus
export type OcrProcessingStatus = ExpenseClaimStatus
export type ExpenseStatus = ExpenseClaimStatus

// Dynamic expense categories - stored in businesses.custom_expense_categories (JSONB)
// Each business can define their own categories with custom names, icons, and rules
// Validation happens in the expense-category-mapper.ts, not in types
// Legacy default categories: travel_accommodation, petrol, toll, entertainment, other
export type ExpenseCategory = string

// Kevin's workflow state machine (updated for unified status)
export interface WorkflowTransition {
  from: ExpenseClaimStatus
  to: ExpenseClaimStatus
  requiredRole: 'employee' | 'manager' | 'admin'
  validator?: (claim: ExpenseClaim) => boolean
}

// Employee profile for organizational hierarchy
export interface EmployeeProfile {
  id: string
  user_id: string
  clerk_id: string
  employee_number?: string
  full_name: string
  email: string
  department?: string
  job_title?: string
  manager_id?: string
  home_currency: SupportedCurrency
  expense_limit: number
  role_permissions: {
    employee: boolean
    manager: boolean
    admin: boolean
  }
  is_active: boolean
  created_at: string
  updated_at: string
}

// Core expense claim interface
export interface ExpenseClaim {
  id: string
  accounting_entry_id: string | null  // Links to accounting_entries.id after approval (NULL until approved)
  user_id: string
  business_id: string

  // ✅ Otto's workflow with unified status (consolidates previous dual status system)
  status: ExpenseClaimStatus          // Unified linear workflow status
  submission_date?: string
  approval_date?: string
  reimbursement_date?: string
  payment_date?: string
  
  // Approver tracking - using reviewed_by + status pattern for assignment and audit trail
  reviewed_by?: string | null // WHO should approve (when status=submitted) or WHO did approve/reject (audit trail)
  approved_by_ids: string[]
  rejected_by_id?: string
  rejection_reason?: string
  
  // Otto's compliance enhancements (NEW)
  business_purpose_details: string | null // Additional business purpose details as text
  
  // Policy and compliance (Otto's requirements)
  policy_violations?: PolicyViolation[]
  compliance_flags?: ComplianceFlag[]
  business_purpose: string

  // Expense-specific fields
  expense_category: ExpenseCategory // Dynamic category code from businesses.custom_expense_categories
  
  // Related data
  transaction?: AccountingEntry
  employee?: EmployeeProfile
  current_approver?: EmployeeProfile // Legacy field - use reviewed_by with status for logic

  // Error handling (JSONB in database)
  error_message?: ExpenseClaimErrorMessage | null

  created_at: string
  updated_at: string
}

export interface PolicyViolation {
  type: 'amount_limit_exceeded' | 'missing_receipt' | 'duplicate_submission' | 'invalid_category'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  auto_resolvable: boolean
}

export interface ComplianceFlag {
  type: 'tax_implication' | 'cross_border' | 'audit_required' | 'documentation_incomplete'
  description: string
  action_required: string
}

// Expense approval audit trail
export interface ExpenseApproval {
  id: string
  expense_claim_id: string
  approver_id: string
  action: 'approved' | 'rejected' | 'requested_changes'
  comment?: string
  timestamp: string
  approver?: EmployeeProfile
}

// API request/response types
export interface CreateExpenseClaimRequest {
  // Basic expense information
  description: string
  business_purpose: string
  expense_category: ExpenseCategory
  original_amount: number
  original_currency: SupportedCurrency
  home_currency?: SupportedCurrency // NEW: Allow users to specify home currency
  transaction_date: string
  vendor_name?: string
  vendor_id?: string // NEW: Link to vendors table

  // Optional fields
  reference_number?: string
  notes?: string
  storage_path?: string // NEW: Path for manually uploaded receipts

  // Line items for detailed expenses
  line_items?: ExpenseLineItemRequest[]
}

export interface ExpenseLineItemRequest {
  description: string
  quantity: number
  unit_price: number
  tax_rate?: number
  item_category?: string
}

export interface UpdateExpenseClaimRequest extends Partial<CreateExpenseClaimRequest> {
  id?: never // Prevent ID updates
  status?: ExpenseClaimStatus // Allow status updates
  comment?: string // For approval/rejection comments
  rejection_reason?: string // For rejection reason
}

export interface ExpenseClaimApprovalRequest {
  action: 'approve' | 'reject' | 'request_changes' | 'submit' | 'recall'
  comment?: string
  partial_approval?: {
    approved_amount: number
    approved_line_items: string[]
  }
}

export interface BulkApprovalRequest {
  claim_ids: string[]
  action: 'approve' | 'reject'
  comment?: string
}

// List/filter interfaces
export interface ExpenseClaimListParams {
  page?: number
  limit?: number
  status?: ExpenseClaimStatus               // ✅ Unified status filter
  expense_category?: ExpenseCategory
  user_id?: string
  date_from?: string
  date_to?: string
  search?: string
  sort_by?: 'submission_date' | 'amount' | 'status' | 'employee_name'
  sort_order?: 'asc' | 'desc'
}

export interface ExpenseClaimListResponse {
  claims: ExpenseClaim[]
  pagination: {
    page: number
    limit: number
    total: number
    has_more: boolean
    total_pages: number
  }
}

// Dashboard analytics interfaces
export interface ExpenseDashboardData {
  role: 'employee' | 'manager' | 'admin'
  summary: {
    total_claims: number
    pending_approval: number
    approved_amount: number
    rejected_count: number
  }
  recent_claims: ExpenseClaim[]
  monthly_trends: MonthlyExpenseTrend[]
  category_breakdown: CategoryBreakdown[]
}

export interface MonthlyExpenseTrend {
  month: string // YYYY-MM
  total_amount: number
  claim_count: number
  home_currency: SupportedCurrency
}

export interface CategoryBreakdown {
  category: ExpenseCategory
  amount: number
  percentage: number
  claim_count: number
}

// Monthly report generation
export interface MonthlyExpenseReport {
  user_id: string
  employee_name: string
  report_month: string // YYYY-MM
  home_currency: SupportedCurrency
  
  summary: {
    total_amount: number
    claim_count: number
    approved_amount: number
    pending_amount: number
    rejected_amount: number
  }
  
  category_totals: {
    [K in ExpenseCategory]: {
      amount: number
      count: number
    }
  }
  
  claims: ExpenseClaim[]
  
  generated_at: string
  generated_by: string
}

// Kevin's state machine configuration ✅ Simplified workflow
export const EXPENSE_WORKFLOW_TRANSITIONS: WorkflowTransition[] = [
  // File upload transitions (System/Employee)
  { from: 'draft', to: 'uploading', requiredRole: 'employee' },
  { from: 'uploading', to: 'analyzing', requiredRole: 'employee' },
  { from: 'analyzing', to: 'draft', requiredRole: 'employee' }, // ✅ OCR success goes to draft
  { from: 'analyzing', to: 'failed', requiredRole: 'employee' }, // OCR failure
  { from: 'failed', to: 'draft', requiredRole: 'employee' }, // Manual entry after failure

  // Employee approval workflow transitions
  { from: 'draft', to: 'submitted', requiredRole: 'employee' },
  { from: 'submitted', to: 'draft', requiredRole: 'employee' }, // Recall submission
  { from: 'rejected', to: 'draft', requiredRole: 'employee' }, // Revise and resubmit

  // Manager transitions (direct approve/reject from submitted)
  { from: 'submitted', to: 'approved', requiredRole: 'manager' },
  { from: 'submitted', to: 'rejected', requiredRole: 'manager' },

  // Admin transitions
  { from: 'approved', to: 'reimbursed', requiredRole: 'admin' },

  // Admin can also reject approved claims if compliance issues found
  { from: 'approved', to: 'rejected', requiredRole: 'admin' }
]

// ============================================================================
// NOTE: All category display and validation rules are now stored in database
// Use getBusinessExpenseCategories() from expense-category-mapper.ts
// Category data structure: businesses.custom_expense_categories (JSONB)
// ============================================================================

// Otto's compliance validation rules
export interface ExpenseValidationRule {
  id: string
  name: string
  category?: ExpenseCategory
  validator: (claim: ExpenseClaim) => PolicyViolation[]
}

export const EXPENSE_VALIDATION_RULES: ExpenseValidationRule[] = [
  {
    id: 'amount_limit_check',
    name: 'Spending Limit Validation',
    validator: (claim) => {
      const violations: PolicyViolation[] = []
      if (!claim.transaction || !claim.employee) return violations
      
      if (claim.transaction.original_amount > claim.employee.expense_limit) {
        violations.push({
          type: 'amount_limit_exceeded',
          severity: 'high',
          message: `Amount ${claim.transaction.original_amount} exceeds employee limit ${claim.employee.expense_limit}`,
          auto_resolvable: false
        })
      }
      
      return violations
    }
  },
  // ⚠️ REMOVED: receipt_requirement_check
  // Receipt requirements are now validated at the API level where we can fetch
  // business-specific category settings from businesses.custom_expense_categories
  // See: getBusinessExpenseCategory() in expense-category-mapper.ts
  // API routes should validate receipt requirements using category.requires_receipt field
]

// ============================================================================
// NEW: Otto's Compliance Enhancement Types (Hybrid Architecture)
// ============================================================================

// Vendor Management (New Table)
export interface Vendor {
  id: string
  business_id: string
  name: string
  verification_status: 'unverified' | 'pending' | 'verified' | 'rejected'
  risk_level: 'low' | 'medium' | 'high'
  metadata: Record<string, any> // JSONB for contact info, tax IDs, etc.
  created_at: string
  updated_at: string
}

// Audit Events (New Table - Consolidated Audit Trail)
export interface AuditEvent {
  id: number // BIGSERIAL
  business_id: string
  actor_user_id?: string // Can be null for system events
  event_type: string // e.g., 'expense.submitted', 'expense.approved', 'policy.overridden'
  target_entity_type: string // e.g., 'expense_claim', 'transaction', 'vendor'
  target_entity_id: string
  details: Record<string, any> // JSONB for event-specific context
  created_at: string
}

// API Request types for new entities
export interface CreateVendorRequest {
  name: string
  verification_status?: 'unverified' | 'pending' | 'verified' | 'rejected'
  risk_level?: 'low' | 'medium' | 'high'
  metadata?: Record<string, any>
}

export interface UpdateVendorRequest extends Partial<CreateVendorRequest> {
  id?: never // Prevent ID updates
}

export interface CreateAuditEventRequest {
  event_type: string
  target_entity_type: string
  target_entity_id: string
  details?: Record<string, any>
}

// Enhanced expense claim request types with new fields
export interface CreateExpenseClaimRequestEnhanced extends CreateExpenseClaimRequest {
  business_purpose_details?: string | null
  // REMOVED: current_approver_id - now using reviewed_by + status pattern
}

export interface UpdateExpenseClaimRequestEnhanced extends UpdateExpenseClaimRequest {
  business_purpose_details?: string | null
  // REMOVED: current_approver_id - now using reviewed_by + status pattern
}

// Risk Assessment Types
export interface RiskAssessment {
  score: number // 0-100
  factors: RiskFactor[]
  assessment_date: string
  calculated_by: 'system' | 'manual'
}

export interface RiskFactor {
  type: 'amount' | 'vendor' | 'policy_violation' | 'velocity'
  weight: number
  description: string
  value: number
}

// Vendor verification workflow
export interface VendorVerificationRequest {
  vendor_id: string
  verification_status: 'pending' | 'verified' | 'rejected'
  verification_notes?: string
}

// Policy Override (using AuditEvent with specific event_type)
export interface PolicyOverrideEvent extends Omit<AuditEvent, 'event_type' | 'details'> {
  event_type: 'policy.overridden'
  details: {
    policy_violation_code: string
    violation_description: string
    justification: string
    override_authority: 'manager' | 'admin' | 'super_admin'
    original_value?: any
    override_value?: any
  }
}