/**
 * Enhanced Expense Claims Types - Enterprise Edition
 * Implements Otto's compliance requirements and Gemini Pro's architectural recommendations
 * 100% backward compatible with existing expense-claims.ts
 */

import { SupportedCurrency, Transaction } from './transaction'
import { ExpenseStatus, ComplianceFlag } from './expense-claims'
import { SupabaseClient } from '@supabase/supabase-js'

// Enhanced workflow transition with hooks and business logic
export interface EnhancedWorkflowTransition {
  from: ExpenseStatus | ExpenseStatus[]
  to: ExpenseStatus
  action: 'submit' | 'recall' | 'approve' | 'reject' | 'request_changes' | 'override_approve'
  requiredRole: 'employee' | 'manager' | 'admin' | 'super_admin'
  
  // Pre-conditions that must be met before transition
  preConditions?: {
    minimumAmount?: number
    maximumAmount?: number
    requiresReceipt?: boolean
    requiresVendorVerification?: boolean
    requiresBusinessPurpose?: boolean
  }
  
  // Dynamic next approver determination
  getNextApprover?: (claim: any, userProfile: any, supabase: SupabaseClient) => Promise<string | null>
  
  // Side effects to execute after successful transition
  postTransitionActions?: {
    updateRiskScore?: boolean
    triggerVendorVerification?: boolean
    schedulePeriodicReview?: boolean
    sendNotifications?: string[]
  }
  
  // Policy override requirements
  overrideRequirements?: {
    allowOverride: boolean
    requiredJustification: boolean
    minimumOverrideRole: 'manager' | 'admin' | 'super_admin'
  }
}

// Enhanced business purpose documentation
export interface BusinessPurpose {
  description: string
  project_code?: string
  client_name?: string
  attendees?: string[]
  meeting_type?: 'client' | 'internal' | 'vendor' | 'conference'
  business_outcome?: string
  requires_approval_notes?: boolean
}

// Risk monitoring and scoring
export interface RiskAssessment {
  score: number // 0-100
  factors: {
    velocity_flag?: boolean
    high_value_flag?: boolean
    new_vendor_flag?: boolean
    duplicate_risk?: boolean
    policy_violation?: boolean
    unusual_pattern?: boolean
  }
  last_updated: string
  calculated_by: 'system' | 'manual'
}

// Enhanced expense claim with Otto's requirements
export interface EnhancedExpenseClaim {
  // All existing fields from ExpenseClaim
  id: string
  transaction_id: string
  employee_id: string
  status: ExpenseStatus
  expense_category: string
  claim_month: string
  business_purpose: string
  
  // Enhanced Otto fields
  business_purpose_details?: BusinessPurpose
  risk_assessment?: RiskAssessment
  policy_overrides?: PolicyOverride[]
  vendor_verification_status?: 'not_required' | 'pending' | 'verified' | 'rejected'
  compliance_flags?: ComplianceFlag[]
  
  // Timestamps with Otto's audit requirements
  created_at: string
  updated_at: string
  submitted_at?: string
  first_review_at?: string
  approved_at?: string
  reimbursed_at?: string
  paid_at?: string
  
  // Enhanced approver tracking
  current_approver_id?: string
  approval_chain: ApprovalStep[]
  
  // Related data
  transaction?: Transaction
  employee?: any
  vendor?: Vendor
}

// Vendor verification system
export interface Vendor {
  id: string
  business_id: string
  name: string
  tax_id?: string
  bank_details?: any // Encrypted
  verification_status: 'unverified' | 'pending' | 'verified' | 'rejected'
  verified_by_id?: string
  verified_at?: string
  risk_rating: 'low' | 'medium' | 'high'
  created_at: string
}

// Policy override system with audit trail
export interface PolicyOverride {
  id: string
  expense_claim_id: string
  policy_violation_code: string
  violation_description: string
  justification: string
  granted_by_id: string
  granted_by_name: string
  granted_at: string
  override_authority: 'manager' | 'admin' | 'super_admin'
}

// Enhanced approval step tracking
export interface ApprovalStep {
  step_number: number
  approver_id: string
  approver_name: string
  approver_role: string
  action: 'approved' | 'rejected' | 'requested_changes' | 'override_approved'
  notes?: string
  timestamp: string
  ip_address?: string
}

// Periodic review system
export interface PeriodicReview {
  id: string
  business_id: string
  review_period: string // 'YYYY-Q1', 'YYYY-MM'
  review_type: 'monthly' | 'quarterly' | 'annual'
  status: 'pending' | 'in_progress' | 'completed'
  reviewer_id?: string
  findings?: string
  action_items?: ReviewActionItem[]
  completed_at?: string
  created_at: string
}

export interface ReviewActionItem {
  description: string
  assigned_to?: string
  due_date?: string
  status: 'pending' | 'completed'
  completed_at?: string
}

// Comprehensive audit trail
export interface AuditEvent {
  id: string
  timestamp: string
  user_id: string
  user_name: string
  impersonator_id?: string // For admin actions
  ip_address?: string
  entity_type: 'expense_claim' | 'vendor' | 'policy_override' | 'periodic_review'
  entity_id: string
  event_type: 'create' | 'update' | 'status_change' | 'approve' | 'reject' | 'override' | 'delete'
  before_state?: any
  after_state?: any
  comment?: string
  risk_implications?: string[]
}

// ASEAN compliance framework
export interface ComplianceRule {
  id: string
  jurisdiction: 'TH' | 'ID' | 'MY' | 'SG' | 'VN' | 'PH' | 'MM' | 'KH' | 'LA' | 'BN'
  rule_type: 'receipt_threshold' | 'tax_documentation' | 'approval_limits' | 'reporting_requirement'
  parameters: {
    currency?: SupportedCurrency
    threshold_amount?: number
    required_documents?: string[]
    approval_hierarchy?: string[]
  }
  is_active: boolean
}

// Enhanced workflow transitions with Otto's compliance
export const ENHANCED_WORKFLOW_TRANSITIONS: EnhancedWorkflowTransition[] = [
  // Employee transitions
  {
    from: 'draft',
    to: 'submitted',
    action: 'submit',
    requiredRole: 'employee',
    preConditions: {
      requiresBusinessPurpose: true,
      requiresReceipt: true
    },
    postTransitionActions: {
      updateRiskScore: true,
      sendNotifications: ['manager', 'system']
    }
  },
  
  // Manager transitions with risk assessment
  {
    from: 'submitted',
    to: 'under_review',
    action: 'approve',
    requiredRole: 'manager',
    getNextApprover: async (claim, userProfile, supabase) => {
      // Determine next approver based on amount, risk, and policy
      if (claim.transaction?.home_currency_amount > 10000) {
        return await getAdminApprover(supabase, claim.employee.business_id)
      }
      return userProfile.id
    }
  },
  
  // High-value or high-risk approval flow
  {
    from: 'under_review',
    to: 'approved',
    action: 'approve',
    requiredRole: 'manager',
    preConditions: {
      requiresVendorVerification: true
    },
    postTransitionActions: {
      triggerVendorVerification: true,
      schedulePeriodicReview: true
    }
  },
  
  // Admin reimbursement with enhanced controls
  {
    from: 'approved',
    to: 'reimbursed',
    action: 'approve',
    requiredRole: 'admin',
    postTransitionActions: {
      updateRiskScore: true,
      sendNotifications: ['finance', 'employee']
    }
  },
  
  // Policy override transitions (Otto's exception handling)
  {
    from: ['submitted', 'under_review'],
    to: 'approved',
    action: 'override_approve',
    requiredRole: 'admin',
    overrideRequirements: {
      allowOverride: true,
      requiredJustification: true,
      minimumOverrideRole: 'admin'
    },
    postTransitionActions: {
      updateRiskScore: true,
      schedulePeriodicReview: true,
      sendNotifications: ['compliance', 'audit']
    }
  }
]

// Risk scoring algorithm
export function calculateRiskScore(claim: EnhancedExpenseClaim): number {
  let score = 0
  
  // Amount-based risk
  const amount = claim.transaction?.home_amount || 0
  if (amount > 10000) score += 30
  else if (amount > 5000) score += 20
  else if (amount > 1000) score += 10
  
  // Vendor risk
  if (claim.vendor?.verification_status === 'unverified') score += 25
  if (claim.vendor?.risk_rating === 'high') score += 20
  
  // Policy violations
  if (claim.policy_overrides?.length) score += 15
  
  // Velocity risk (would need historical data)
  // if (hasHighVelocity(claim.employee_id)) score += 15
  
  return Math.min(score, 100)
}

// Helper functions
async function getAdminApprover(supabase: SupabaseClient, businessId: string): Promise<string | null> {
  const { data } = await supabase
    .from('employee_profiles')
    .select('id')
    .eq('business_id', businessId)
    .eq('role_permissions->admin', true)
    .eq('is_active', true)
    .limit(1)
    .single()
    
  return data?.id || null
}

// Export original types for backward compatibility
export * from './expense-claims'