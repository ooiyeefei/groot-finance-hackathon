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

// Updated expense categories to match database schema
export type ExpenseCategory = 
  | 'travel_accommodation'  // Travel & Accommodation
  | 'petrol_transport'     // Petrol & Transportation
  | 'entertainment_meals'  // Entertainment & Meals
  | 'office_supplies'      // Office Supplies
  | 'utilities_comms'      // Utilities & Communications
  | 'maintenance_repairs'  // Maintenance & Repairs
  | 'professional_services' // Professional Services
  | 'marketing_advertising' // Marketing & Advertising
  | 'training_development' // Training & Development
  | 'other_business'       // Other Business Expenses

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
  
  // Otto's 7-stage workflow
  status: ExpenseStatus
  submission_date?: string
  approval_date?: string
  reimbursement_date?: string
  payment_date?: string
  
  // Approver tracking
  current_approver_id?: string
  approved_by_ids: string[]
  rejected_by_id?: string
  rejection_reason?: string
  
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
  
  // Optional fields
  reference_number?: string
  notes?: string
  document_id?: string // Link to receipt/document
  
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

// Mel's category display configuration
export const EXPENSE_CATEGORY_CONFIG: Record<ExpenseCategory, {
  label: string
  icon: string
  description: string
  policy_limit?: number
  requires_receipt_over?: number
}> = {
  travel_accommodation: {
    label: 'Travelling & Accommodation',
    icon: '✈️',
    description: 'Business travel, hotels, flights, accommodation',
    policy_limit: 2000,
    requires_receipt_over: 50
  },
  petrol_transport: {
    label: 'Petrol & Transportation',
    icon: '⛽',
    description: 'Fuel, automotive, parking, tolls, and transport costs',
    policy_limit: 500,
    requires_receipt_over: 25
  },
  entertainment_meals: {
    label: 'Entertainment & Meals',
    icon: '🍽️',
    description: 'Client meals, business dining, and entertainment',
    policy_limit: 1000,
    requires_receipt_over: 25
  },
  office_supplies: {
    label: 'Office Supplies',
    icon: '📁',
    description: 'Office materials, stationery, and equipment',
    policy_limit: 500,
    requires_receipt_over: 25
  },
  utilities_comms: {
    label: 'Utilities & Communications',
    icon: '📞',
    description: 'Internet, phone, utilities, and communication services',
    policy_limit: 300,
    requires_receipt_over: 25
  },
  maintenance_repairs: {
    label: 'Maintenance & Repairs',
    icon: '🔧',
    description: 'Equipment repairs, maintenance, and facility costs',
    policy_limit: 800,
    requires_receipt_over: 50
  },
  professional_services: {
    label: 'Professional Services',
    icon: '💼',
    description: 'Legal, accounting, consulting, and professional fees',
    policy_limit: 2000,
    requires_receipt_over: 100
  },
  marketing_advertising: {
    label: 'Marketing & Advertising',
    icon: '📢',
    description: 'Marketing campaigns, advertising, and promotional materials',
    policy_limit: 1500,
    requires_receipt_over: 50
  },
  training_development: {
    label: 'Training & Development',
    icon: '📚',
    description: 'Training courses, workshops, and professional development',
    policy_limit: 1000,
    requires_receipt_over: 50
  },
  other_business: {
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
      
      if (requiresReceipt && !claim.transaction.document_id) {
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