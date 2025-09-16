/**
 * Employee Expense Claims Types
 * Based on expert recommendations from Otto, Mel, and Kevin
 */

import { SupportedCurrency, Transaction } from './transaction'

// Otto's 7-stage workflow
export type ExpenseStatus = 
  | 'draft'           // Employee editing
  | 'submitted'       // Awaiting manager review
  | 'under_review'    // Manager reviewing
  | 'approved'        // Manager approved, awaiting finance
  | 'rejected'        // Manager/Admin rejected
  | 'reimbursed'      // Admin processed
  | 'paid'            // Payment completed

// Updated expense categories to match database constraint
export type ExpenseCategory = 
  | 'travel_accommodation'  // Travel & Accommodation
  | 'petrol'               // Petrol & Transportation  
  | 'toll'                 // Toll & Road charges
  | 'entertainment'        // Entertainment & Meals
  | 'other'                // Other Business Expenses

// Kevin's workflow state machine
export interface WorkflowTransition {
  from: ExpenseStatus
  to: ExpenseStatus
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
  transaction_id: string
  employee_id: string
  business_id: string
  
  // Otto's 7-stage workflow
  status: ExpenseStatus
  submission_date?: string
  approval_date?: string
  reimbursement_date?: string
  payment_date?: string
  
  // Approver tracking (Enhanced with new DB fields)
  current_approver_id?: string // References users.id (TEXT type)
  approved_by_ids: string[]
  rejected_by_id?: string
  rejection_reason?: string
  
  // Otto's compliance enhancements (NEW)
  risk_score: number // 0-100 calculated risk score
  business_purpose_details: Record<string, any> // Extended JSONB details
  
  // Policy and compliance (Otto's requirements)
  policy_violations?: PolicyViolation[]
  compliance_flags?: ComplianceFlag[]
  business_purpose: string
  
  // Expense-specific fields
  expense_category: ExpenseCategory
  claim_month: string // YYYY-MM format for monthly reporting
  
  // Related data
  transaction?: Transaction
  employee?: EmployeeProfile
  current_approver?: EmployeeProfile
  
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
  transaction_date: string
  vendor_name?: string
  vendor_id?: string // NEW: Link to vendors table
  
  // Optional fields
  reference_number?: string
  notes?: string
  
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
  status?: ExpenseStatus
  expense_category?: ExpenseCategory
  employee_id?: string
  date_from?: string
  date_to?: string
  claim_month?: string
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
  employee_id: string
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

// Kevin's state machine configuration
export const EXPENSE_WORKFLOW_TRANSITIONS: WorkflowTransition[] = [
  // Employee transitions
  { from: 'draft', to: 'submitted', requiredRole: 'employee' },
  { from: 'submitted', to: 'draft', requiredRole: 'employee' }, // Recall submission
  { from: 'rejected', to: 'draft', requiredRole: 'employee' }, // Revise and resubmit
  
  // Manager transitions
  { from: 'submitted', to: 'under_review', requiredRole: 'manager' },
  { from: 'under_review', to: 'approved', requiredRole: 'manager' },
  { from: 'under_review', to: 'rejected', requiredRole: 'manager' },
  
  // Admin transitions
  { from: 'approved', to: 'reimbursed', requiredRole: 'admin' },
  { from: 'reimbursed', to: 'paid', requiredRole: 'admin' },
  
  // Admin can also reject approved claims if compliance issues found
  { from: 'approved', to: 'rejected', requiredRole: 'admin' }
]

// Mel's category display configuration (simplified to match database)
export const EXPENSE_CATEGORY_CONFIG: Record<ExpenseCategory, {
  label: string
  icon: string
  description: string
  policy_limit?: number
  requires_receipt_over?: number
}> = {
  travel_accommodation: {
    label: 'Travel & Accommodation',
    icon: '✈️',
    description: 'Business travel, hotels, flights, accommodation',
    policy_limit: 2000,
    requires_receipt_over: 50
  },
  petrol: {
    label: 'Petrol & Transportation',
    icon: '⛽',
    description: 'Fuel, automotive, parking, and transport costs',
    policy_limit: 500,
    requires_receipt_over: 25
  },
  toll: {
    label: 'Toll & Road Charges',
    icon: '🛣️',
    description: 'Highway tolls, road charges, parking fees',
    policy_limit: 200,
    requires_receipt_over: 10
  },
  entertainment: {
    label: 'Entertainment & Meals',
    icon: '🍽️',
    description: 'Client meals, business dining, and entertainment',
    policy_limit: 1000,
    requires_receipt_over: 25
  },
  other: {
    label: 'Other Business Expenses',
    icon: '📋',
    description: 'Other legitimate business expenses',
    policy_limit: 500,
    requires_receipt_over: 25
  }
}

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
  {
    id: 'receipt_requirement_check',
    name: 'Receipt Requirement Validation',
    validator: (claim) => {
      const violations: PolicyViolation[] = []
      if (!claim.transaction) return violations
      
      const categoryConfig = EXPENSE_CATEGORY_CONFIG[claim.expense_category]
      const requiresReceipt = claim.transaction.original_amount > (categoryConfig.requires_receipt_over || 25)
      
      // Check for receipt via business_purpose_details.file_upload instead of document_id
      const hasReceipt = claim.business_purpose_details?.file_upload?.file_path

      if (requiresReceipt && !hasReceipt) {
        violations.push({
          type: 'missing_receipt',
          severity: 'medium',
          message: `Receipt required for ${claim.expense_category} expenses over ${categoryConfig.requires_receipt_over}`,
          auto_resolvable: false
        })
      }
      
      return violations
    }
  }
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
  business_purpose_details?: Record<string, any>
  current_approver_id?: string
}

export interface UpdateExpenseClaimRequestEnhanced extends UpdateExpenseClaimRequest {
  business_purpose_details?: Record<string, any>
  current_approver_id?: string
  risk_score?: number // Usually calculated, but allow manual override
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