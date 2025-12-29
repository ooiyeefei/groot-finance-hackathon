/**
 * Enhanced Workflow Engine - Enterprise Edition
 * Implements Gemini Pro's centralized state machine and Otto's compliance controls
 * Backward compatible with existing system
 */

import { createBusinessContextSupabaseClient } from '@/lib/db/supabase-server'
import {
  EnhancedWorkflowTransition as WorkflowTransition,
  PolicyOverride,
  AuditEvent,
  ExpenseClaimStatus,
  ENHANCED_WORKFLOW_TRANSITIONS as EXPENSE_WORKFLOW_TRANSITIONS
} from '@/domains/expense-claims/types/enhanced-expense-claims'

export interface WorkflowExecutionContext {
  userId: string
  userProfile: any
  ipAddress?: string
  userAgent?: string
  comment?: string
}

export interface WorkflowExecutionResult {
  success: boolean
  claimId: string
  previousStatus: ExpenseClaimStatus
  newStatus: ExpenseClaimStatus
  policyOverrides?: PolicyOverride[]
  auditEventId?: string
  error?: string
}

export class EnhancedWorkflowEngine {
  /**
   * Execute workflow transition with Otto's compliance checks
   */
  async executeTransition(
    claimId: string,
    action: string,
    context: WorkflowExecutionContext
  ): Promise<WorkflowExecutionResult> {
    // Create business context client using user's context
    const supabase = await createBusinessContextSupabaseClient(context.userId)
    
    try {
      // Get current claim state
      const { data: currentClaim, error: claimError } = await supabase
        .from('expense_claims')
        .select(`
          *,
          transaction:accounting_entries(*),
          vendor:vendors(*)
        `)
        .eq('id', claimId)
        .single()

      if (claimError || !currentClaim) {
        return {
          success: false,
          claimId,
          previousStatus: 'draft',
          newStatus: 'draft',
          error: 'Claim not found'
        }
      }

      // Find valid transition
      const validTransition = await this.findValidTransition(
        currentClaim.status,
        action,
        context.userProfile,
        currentClaim
      )

      if (!validTransition) {
        return {
          success: false,
          claimId,
          previousStatus: currentClaim.status,
          newStatus: currentClaim.status,
          error: `Invalid transition: ${currentClaim.status} -> ${action}`
        }
      }

      // Execute pre-transition compliance checks (Otto's requirements)
      const complianceResult = await this.executeComplianceChecks(
        currentClaim,
        validTransition,
        context
      )

      if (!complianceResult.passed && !complianceResult.canOverride) {
        return {
          success: false,
          claimId,
          previousStatus: currentClaim.status,
          newStatus: currentClaim.status,
          error: complianceResult.reason
        }
      }

      // Execute transition
      const result = await this.performTransition(
        currentClaim,
        validTransition,
        context,
        complianceResult,
        supabase
      )

      return result

    } catch (error) {
      console.error('[Enhanced Workflow] Execution failed:', error)
      return {
        success: false,
        claimId,
        previousStatus: 'draft',
        newStatus: 'draft', 
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Find valid workflow transition based on Gemini Pro's enhanced configuration
   */
  private async findValidTransition(
    currentStatus: ExpenseClaimStatus,
    action: string,
    userProfile: any,
    claim: any
  ): Promise<WorkflowTransition | null> {
    
    for (const transition of EXPENSE_WORKFLOW_TRANSITIONS) {
      // Check status match
      const statusMatch = Array.isArray(transition.from) 
        ? transition.from.includes(currentStatus)
        : transition.from === currentStatus

      if (!statusMatch || transition.action !== action) {
        continue
      }

      // Check role permissions
      if (!this.hasRequiredRole(userProfile, transition.requiredRole)) {
        continue
      }

      // Check pre-conditions
      if (transition.preConditions) {
        const meetsConditions = await this.checkPreConditions(
          claim, 
          transition.preConditions
        )
        if (!meetsConditions) {
          continue
        }
      }

      return transition
    }

    return null
  }

  /**
   * Execute Otto's compliance checks
   */
  private async executeComplianceChecks(
    claim: any,
    transition: WorkflowTransition,
    context: WorkflowExecutionContext
  ): Promise<{
    passed: boolean
    canOverride: boolean
    reason?: string
    requiredOverrides?: string[]
  }> {
    
    const checks = []
    
    // Amount-based compliance (Otto's requirements)
    const amount = claim.transaction?.home_currency_amount || 0
    if (amount > 10000 && !claim.business_purpose_details?.project_code) {
      checks.push({
        code: 'HIGH_VALUE_NO_PROJECT',
        message: 'High-value expenses require project code',
        canOverride: true,
        requiredRole: 'admin'
      })
    }

    // Receipt compliance (ASEAN requirements)
    if (amount > 300 && !claim.transaction?.document_id) {
      checks.push({
        code: 'MISSING_RECEIPT',
        message: 'Receipt required for expenses above threshold',
        canOverride: false,
        requiredRole: 'admin'
      })
    }

    // Note: Vendor verification check removed - verification_status column dropped from vendors table


    const failed = checks.filter(c => c.requiredRole !== context.userProfile.highestRole)
    
    if (failed.length === 0) {
      return { passed: true, canOverride: false }
    }

    const canOverride = failed.every(f => 
      transition.overrideRequirements?.allowOverride &&
      this.hasRequiredRole(context.userProfile, transition.overrideRequirements.minimumOverrideRole)
    )

    return {
      passed: false,
      canOverride,
      reason: failed.map(f => f.message).join('; '),
      requiredOverrides: failed.map(f => f.code)
    }
  }

  /**
   * Perform the actual transition with all side effects
   */
  private async performTransition(
    currentClaim: any,
    transition: WorkflowTransition,
    context: WorkflowExecutionContext,
    complianceResult: any,
    supabase: any
  ): Promise<WorkflowExecutionResult> {
    
    const now = new Date().toISOString()
    
    // Prepare update data
    const updateData: any = {
      status: transition.to,
      updated_at: now
    }

    // Handle status-specific updates
    switch (transition.to) {
      case 'submitted':
        updateData.submitted_at = now
        if (transition.getNextApprover) {
          updateData.reviewed_by = await transition.getNextApprover(
            currentClaim,
            context.userProfile,
            supabase
          )
        }
        break
        
      case 'approved':
        updateData.approved_at = now
        updateData.approved_by_ids = [
          ...(currentClaim.approved_by_ids || []), 
          context.userProfile.id
        ]
        break
        
      case 'rejected':
        updateData.rejected_by_id = context.userProfile.id
        updateData.reviewer_notes = context.comment || 'No reason provided'
        updateData.reviewed_by = context.userProfile.id
        break
        
      case 'reimbursed':
        updateData.paid_at = now
        break
    }

    // Add approval chain entry
    const approvalStep = {
      step_number: (currentClaim.approval_chain?.length || 0) + 1,
      approver_id: context.userProfile.id,
      approver_name: context.userProfile.full_name,
      approver_role: this.getHighestRole(context.userProfile),
      action: transition.action,
      notes: context.comment,
      timestamp: now,
      ip_address: context.ipAddress
    }
    
    updateData.approval_chain = [
      ...(currentClaim.approval_chain || []),
      approvalStep
    ]

    // Update claim
    const { data: updatedClaim, error: updateError } = await supabase
      .from('expense_claims')
      .update(updateData)
      .eq('id', currentClaim.id)
      .select()
      .single()

    if (updateError) {
      throw new Error(`Failed to update claim: ${updateError.message}`)
    }

    // Handle policy overrides if needed
    let policyOverrides: PolicyOverride[] = []
    if (!complianceResult.passed && complianceResult.canOverride) {
      policyOverrides = await this.createPolicyOverrides(
        currentClaim.id,
        complianceResult.requiredOverrides || [],
        context,
        supabase
      )
    }

    // Create comprehensive audit trail
    const auditEvent = await this.createAuditEvent({
      user_id: context.userId,
      user_name: context.userProfile.full_name,
      ip_address: context.ipAddress,
      entity_type: 'expense_claim',
      entity_id: currentClaim.id,
      event_type: 'status_change',
      before_state: {
        status: currentClaim.status
      },
      after_state: {
        status: transition.to
      },
      comment: context.comment,
      risk_implications: policyOverrides.map(po => po.policy_violation_code)
    }, supabase)

    // Execute post-transition actions (Gemini Pro's hooks)
    if (transition.postTransitionActions) {
      await this.executePostTransitionActions(
        updatedClaim,
        transition.postTransitionActions,
        context,
        supabase
      )
    }

    return {
      success: true,
      claimId: currentClaim.id,
      previousStatus: currentClaim.status,
      newStatus: transition.to,
      policyOverrides,
      auditEventId: auditEvent.id
    }
  }



  /**
   * Create policy overrides with Otto's audit requirements
   */
  private async createPolicyOverrides(
    claimId: string,
    violationCodes: string[],
    context: WorkflowExecutionContext,
    supabase: any
  ): Promise<PolicyOverride[]> {
    
    const overrides = violationCodes.map(code => ({
      expense_claim_id: claimId,
      policy_violation_code: code,
      violation_description: this.getViolationDescription(code),
      justification: context.comment || 'Management override',
      granted_by_id: context.userProfile.id,
      override_authority: this.getHighestRole(context.userProfile),
      ip_address: context.ipAddress
    }))

    const { data: createdOverrides } = await supabase
      .from('policy_overrides')
      .insert(overrides)
      .select()

    return createdOverrides || []
  }

  /**
   * Create comprehensive audit event
   */
  private async createAuditEvent(event: Partial<AuditEvent>, supabase: any) {
    const { data: auditEvent } = await supabase
      .from('audit_trail')
      .insert({
        timestamp: new Date().toISOString(),
        ...event
      })
      .select()
      .single()

    return auditEvent
  }

  /**
   * Execute post-transition actions (Gemini Pro's hooks)
   */
  private async executePostTransitionActions(
    claim: any,
    actions: any,
    context: WorkflowExecutionContext,
    supabase: any
  ) {

    // Note: Vendor verification trigger removed - verification_status column dropped from vendors table

    if (actions.schedulePeriodicReview) {
      await this.schedulePeriodicReview(claim.employee.business_id, 'quarterly', supabase)
    }

    if (actions.sendNotifications) {
      // Integration point for notification system
      console.log(`Sending notifications: ${actions.sendNotifications.join(', ')}`)
    }
  }

  /**
   * Schedule periodic review (Otto's requirement)
   */
  private async schedulePeriodicReview(businessId: string, reviewType: string, supabase: any) {
    const reviewPeriod = this.getCurrentReviewPeriod(reviewType)

    await supabase
      .from('periodic_reviews')
      .upsert({
        business_id: businessId,
        review_period: reviewPeriod,
        review_type: reviewType,
        status: 'pending',
        scheduled_date: this.getNextReviewDate(reviewType)
      })
  }

  // Helper methods
  private hasRequiredRole(userProfile: any, requiredRole: string): boolean {
    const roleHierarchy: Record<string, number> = {
      'employee': 1,
      'manager': 2, 
      'admin': 3,
      'super_admin': 4
    }
    
    const userLevel = roleHierarchy[this.getHighestRole(userProfile)] || 0
    const requiredLevel = roleHierarchy[requiredRole] || 0
    
    return userLevel >= requiredLevel
  }

  private getHighestRole(userProfile: any): string {
    if (userProfile.role_permissions?.super_admin) return 'super_admin'
    if (userProfile.role_permissions?.admin) return 'admin'
    if (userProfile.role_permissions?.manager) return 'manager'
    return 'employee'
  }

  private async checkPreConditions(claim: any, conditions: any): Promise<boolean> {
    if (conditions.requiresReceipt && !claim.transaction?.document_id) {
      return false
    }
    
    if (conditions.requiresBusinessPurpose && !claim.business_purpose_details?.description) {
      return false
    }
    
    return true
  }

  private getViolationDescription(code: string): string {
    const descriptions: Record<string, string> = {
      'HIGH_VALUE_NO_PROJECT': 'High-value expense without project code',
      'MISSING_RECEIPT': 'Required receipt documentation missing',
      'UNVERIFIED_VENDOR': 'Expense with unverified vendor'
    }
    
    return descriptions[code] || 'Policy violation'
  }

  private getCurrentReviewPeriod(reviewType: string): string {
    const now = new Date()
    if (reviewType === 'quarterly') {
      const quarter = Math.ceil((now.getMonth() + 1) / 3)
      return `${now.getFullYear()}-Q${quarter}`
    }
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  private getNextReviewDate(reviewType: string): string {
    const now = new Date()
    if (reviewType === 'quarterly') {
      const quarter = Math.ceil((now.getMonth() + 1) / 3)
      const nextQuarterStart = new Date(now.getFullYear(), quarter * 3, 1)
      return nextQuarterStart.toISOString().split('T')[0]
    }
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return nextMonth.toISOString().split('T')[0]
  }
}

// Export singleton instance
export const workflowEngine = new EnhancedWorkflowEngine()