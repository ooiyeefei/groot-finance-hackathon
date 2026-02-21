/**
 * Enhanced Workflow Engine - Enterprise Edition
 * Implements Gemini Pro's centralized state machine and Otto's compliance controls
 * Backward compatible with existing system
 *
 * Migrated to Convex from Supabase
 */

import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
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
   * Uses Convex for all database operations
   */
  async executeTransition(
    claimId: string,
    action: string,
    context: WorkflowExecutionContext
  ): Promise<WorkflowExecutionResult> {
    try {
      // Get authenticated Convex client
      const { client } = await getAuthenticatedConvex()
      if (!client) {
        return {
          success: false,
          claimId,
          previousStatus: 'draft',
          newStatus: 'draft',
          error: 'Failed to get Convex client'
        }
      }

      // Get current claim state using Convex query
      const currentClaim = await client.query(api.functions.expenseClaims.getById, {
        id: claimId
      })

      if (!currentClaim) {
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
        currentClaim.status as ExpenseClaimStatus,
        action,
        context.userProfile,
        currentClaim
      )

      if (!validTransition) {
        return {
          success: false,
          claimId,
          previousStatus: currentClaim.status as ExpenseClaimStatus,
          newStatus: currentClaim.status as ExpenseClaimStatus,
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
          previousStatus: currentClaim.status as ExpenseClaimStatus,
          newStatus: currentClaim.status as ExpenseClaimStatus,
          error: complianceResult.reason
        }
      }

      // Execute transition
      const result = await this.performTransition(
        currentClaim,
        validTransition,
        context,
        complianceResult,
        client
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
    const amount = claim.accountingEntry?.homeCurrencyAmount || claim.homeCurrencyAmount || 0
    if (amount > 10000 && !claim.businessPurposeDetails?.project_code) {
      checks.push({
        code: 'HIGH_VALUE_NO_PROJECT',
        message: 'High-value expenses require project code',
        canOverride: true,
        requiredRole: 'finance_admin'
      })
    }

    // Receipt compliance (ASEAN requirements)
    if (amount > 300 && !claim.storagePath) {
      checks.push({
        code: 'MISSING_RECEIPT',
        message: 'Receipt required for expenses above threshold',
        canOverride: false,
        requiredRole: 'finance_admin'
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
   * Uses Convex mutations for updates
   */
  private async performTransition(
    currentClaim: any,
    transition: WorkflowTransition,
    context: WorkflowExecutionContext,
    complianceResult: any,
    convexClient: any
  ): Promise<WorkflowExecutionResult> {

    const now = new Date().toISOString()

    // Add approval chain entry
    const approvalStep = {
      step_number: (currentClaim.processingMetadata?.approval_chain?.length || 0) + 1,
      approver_id: context.userProfile.id,
      approver_name: context.userProfile.full_name,
      approver_role: this.getHighestRole(context.userProfile),
      action: transition.action,
      notes: context.comment,
      timestamp: now,
      ip_address: context.ipAddress
    }

    // Handle policy overrides if needed - store in processingMetadata
    let policyOverrides: PolicyOverride[] = []
    if (!complianceResult.passed && complianceResult.canOverride) {
      policyOverrides = this.createPolicyOverrides(
        currentClaim._id,
        complianceResult.requiredOverrides || [],
        context
      )
    }

    // Create audit event - store in processingMetadata
    const auditEvent = this.createAuditEvent({
      user_id: context.userId,
      user_name: context.userProfile.full_name,
      ip_address: context.ipAddress,
      entity_type: 'expense_claim',
      entity_id: currentClaim._id,
      event_type: 'status_change',
      before_state: {
        status: currentClaim.status
      },
      after_state: {
        status: transition.to
      },
      comment: context.comment,
      risk_implications: policyOverrides.map(po => po.policy_violation_code)
    })

    // Build updated processingMetadata with compliance data
    const existingMetadata = currentClaim.processingMetadata || {}
    const updatedProcessingMetadata = {
      ...existingMetadata,
      approval_chain: [
        ...(existingMetadata.approval_chain || []),
        approvalStep
      ],
      policy_overrides: [
        ...(existingMetadata.policy_overrides || []),
        ...policyOverrides
      ],
      audit_trail: [
        ...(existingMetadata.audit_trail || []),
        auditEvent
      ],
      workflow_metadata: {
        last_transition: {
          from: currentClaim.status,
          to: transition.to,
          action: transition.action,
          timestamp: now,
          performed_by: context.userId
        }
      }
    }

    // Update claim status using Convex mutation
    try {
      await convexClient.mutation(api.functions.expenseClaims.updateStatus, {
        id: currentClaim._id,
        status: transition.to,
        reviewerNotes: context.comment
      })

      // Update processingMetadata separately to store compliance data
      await convexClient.mutation(api.functions.expenseClaims.update, {
        id: currentClaim._id,
        processingMetadata: updatedProcessingMetadata
      })

    } catch (updateError) {
      throw new Error(`Failed to update claim: ${updateError instanceof Error ? updateError.message : 'Unknown error'}`)
    }

    // Execute post-transition actions (Gemini Pro's hooks)
    if (transition.postTransitionActions) {
      // Re-fetch claim to get updated fields (e.g. designatedApproverId set during updateStatus)
      const updatedClaim = await convexClient.query(api.functions.expenseClaims.getById, {
        id: currentClaim._id
      }) ?? currentClaim

      await this.executePostTransitionActions(
        updatedClaim,
        transition.postTransitionActions,
        context
      )
    }

    return {
      success: true,
      claimId: currentClaim._id,
      previousStatus: currentClaim.status,
      newStatus: transition.to,
      policyOverrides,
      auditEventId: auditEvent.id
    }
  }


  /**
   * Create policy overrides with Otto's audit requirements
   * Returns array of PolicyOverride objects to be stored in processingMetadata
   */
  private createPolicyOverrides(
    claimId: string,
    violationCodes: string[],
    context: WorkflowExecutionContext
  ): PolicyOverride[] {

    const now = new Date().toISOString()

    return violationCodes.map(code => ({
      id: `po_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      expense_claim_id: claimId,
      policy_violation_code: code,
      violation_description: this.getViolationDescription(code),
      justification: context.comment || 'Management override',
      granted_by_id: context.userProfile.id,
      granted_by_name: context.userProfile.full_name || 'Unknown',
      granted_at: now,
      override_authority: this.getHighestRole(context.userProfile) as 'manager' | 'finance_admin' | 'super_admin'
    }))
  }

  /**
   * Create comprehensive audit event
   * Returns AuditEvent object to be stored in processingMetadata
   */
  private createAuditEvent(event: Partial<AuditEvent>): AuditEvent {
    return {
      id: `ae_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      user_id: event.user_id || '',
      user_name: event.user_name || '',
      entity_type: event.entity_type || 'expense_claim',
      entity_id: event.entity_id || '',
      event_type: event.event_type || 'status_change',
      ip_address: event.ip_address,
      before_state: event.before_state,
      after_state: event.after_state,
      comment: event.comment,
      risk_implications: event.risk_implications
    }
  }

  /**
   * Execute post-transition actions (Gemini Pro's hooks)
   */
  private async executePostTransitionActions(
    claim: any,
    actions: any,
    context: WorkflowExecutionContext
  ) {
    // Note: Vendor verification trigger removed - verification_status column dropped from vendors table

    if (actions.schedulePeriodicReview) {
      // Log periodic review scheduling - actual implementation would require periodic_reviews table
      console.log(`[Enhanced Workflow] Periodic review scheduled for business: ${claim.businessId}`)
    }

    if (actions.sendNotifications) {
      // Create notifications for the appropriate recipients
      try {
        const { client } = await getAuthenticatedConvex()
        if (!client) return

        for (const target of actions.sendNotifications) {
          await this.sendWorkflowNotification(client, claim, target, context)
        }
      } catch (error) {
        // Non-blocking: log and continue, don't fail the workflow
        console.error(`[Enhanced Workflow] Failed to send notifications:`, error)
      }
    }
  }

  /**
   * Send workflow notification based on target audience
   */
  private async sendWorkflowNotification(
    client: any,
    claim: any,
    target: string,
    context: WorkflowExecutionContext
  ) {
    const formatAmount = (amount: number | string, currency: string) =>
      `${currency} ${Number(amount).toLocaleString()}`

    const claimAmount = formatAmount(
      claim.totalAmount || claim.processingMetadata?.financial_data?.total_amount || 0,
      claim.originalCurrency || claim.processingMetadata?.financial_data?.original_currency || 'MYR'
    )
    const claimDesc = claim.description || claim.businessPurpose || 'Expense claim'

    switch (target) {
      case 'manager':
      case 'system': {
        // Notify the claim's designated approver about a new submission
        if (claim.designatedApproverId) {
          await client.mutation(api.functions.notifications.createFromWorkflow, {
            recipientUserId: claim.designatedApproverId,
            businessId: claim.businessId,
            type: 'approval' as const,
            severity: 'info' as const,
            title: `Expense claim requires approval`,
            body: `${claimDesc} — ${claimAmount}. Submitted for your review.`,
            resourceType: 'expense_claim' as const,
            resourceId: claim._id,
            resourceUrl: `/en/expense-claims?claim=${claim._id}`,
            sourceEvent: `approval_request_${claim._id}`,
          })
        }
        break
      }

      case 'employee':
      case 'finance': {
        // Notify the claim submitter about status change
        if (claim.userId) {
          const newStatus = claim.status === 'approved' ? 'approved' :
                           claim.status === 'reimbursed' ? 'reimbursed' : 'updated'
          await client.mutation(api.functions.notifications.createFromWorkflow, {
            recipientUserId: claim.userId,
            businessId: claim.businessId,
            type: 'approval' as const,
            severity: 'info' as const,
            title: `Expense claim ${newStatus}`,
            body: `Your expense claim for ${claimAmount} has been ${newStatus}.`,
            resourceType: 'expense_claim' as const,
            resourceId: claim._id,
            resourceUrl: `/en/expense-claims?claim=${claim._id}`,
            sourceEvent: `approval_status_${claim._id}_${newStatus}`,
          })
        }
        break
      }

      case 'compliance':
      case 'audit': {
        // Notify finance admins about compliance overrides
        // Use createFromWorkflow for each finance admin (via business_memberships lookup)
        // For now, notify the claim submitter's manager chain
        if (claim.designatedApproverId) {
          await client.mutation(api.functions.notifications.createFromWorkflow, {
            recipientUserId: claim.designatedApproverId,
            businessId: claim.businessId,
            type: 'compliance' as const,
            severity: 'warning' as const,
            title: `Compliance override on expense claim`,
            body: `A policy override was applied to an expense claim for ${claimAmount}.`,
            resourceType: 'expense_claim' as const,
            resourceId: claim._id,
            resourceUrl: `/en/expense-claims?claim=${claim._id}`,
            sourceEvent: `compliance_override_${claim._id}`,
          })
        }
        break
      }
    }
  }

  // Helper methods
  private hasRequiredRole(userProfile: any, requiredRole: string): boolean {
    const roleHierarchy: Record<string, number> = {
      'employee': 1,
      'manager': 2,
      'finance_admin': 3,
      'super_admin': 4
    }

    const userLevel = roleHierarchy[this.getHighestRole(userProfile)] || 0
    const requiredLevel = roleHierarchy[requiredRole] || 0

    return userLevel >= requiredLevel
  }

  private getHighestRole(userProfile: any): string {
    if (userProfile.role_permissions?.super_admin) return 'super_admin'
    if (userProfile.role_permissions?.finance_admin) return 'finance_admin'
    if (userProfile.role_permissions?.manager) return 'manager'
    return 'employee'
  }

  private async checkPreConditions(claim: any, conditions: any): Promise<boolean> {
    if (conditions.requiresReceipt && !claim.storagePath) {
      return false
    }

    if (conditions.requiresBusinessPurpose && !claim.businessPurposeDetails?.description) {
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
}

// Export singleton instance
export const workflowEngine = new EnhancedWorkflowEngine()
