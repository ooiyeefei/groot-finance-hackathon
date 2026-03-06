/**
 * Notification Trigger Helpers
 *
 * Server-side helpers for creating notifications from workflow events.
 * These are called from the expense claim workflow engine and action center.
 *
 * Each function calls the appropriate Convex internal mutation to create notifications.
 */

import { ConvexHttpClient } from 'convex/browser'
import { api, internal } from '../../../../convex/_generated/api'
import { Id } from '../../../../convex/_generated/dataModel'

/**
 * Build a resource URL for an expense claim
 */
function buildExpenseClaimUrl(claimId: string): string {
  return `/en/expense-claims?claim=${claimId}`
}

/**
 * Build a resource URL for an insight
 */
function buildInsightUrl(insightId?: string): string {
  if (insightId) {
    return `/en/action-center?insight=${insightId}`
  }
  return `/en/action-center`
}

/**
 * Notification data shape for the Convex create mutation
 */
export interface NotificationCreateArgs {
  recipientUserId: Id<"users">
  businessId: Id<"businesses">
  type: "approval" | "anomaly" | "compliance" | "insight" | "invoice_processing"
  severity: "info" | "warning" | "critical"
  title: string
  body: string
  resourceType?: "expense_claim" | "invoice" | "insight" | "dashboard"
  resourceId?: string
  resourceUrl?: string
  sourceEvent?: string
  expiresAt?: number
}

/**
 * Build notification args for an approval request
 * (Sent to approver when expense claim is submitted)
 */
export function buildApprovalRequestNotification(params: {
  claimId: string
  businessId: Id<"businesses">
  approverId: Id<"users">
  submitterName: string
  amount: string
  description: string
}): NotificationCreateArgs {
  return {
    recipientUserId: params.approverId,
    businessId: params.businessId,
    type: "approval",
    severity: "info",
    title: `Expense claim from ${params.submitterName}`,
    body: `${params.description} — ${params.amount}. Requires your approval.`,
    resourceType: "expense_claim",
    resourceId: params.claimId,
    resourceUrl: buildExpenseClaimUrl(params.claimId),
    sourceEvent: `approval_request_${params.claimId}`,
  }
}

/**
 * Build notification args for approval status change
 * (Sent to submitter when claim is approved/rejected)
 */
export function buildApprovalStatusNotification(params: {
  claimId: string
  businessId: Id<"businesses">
  submitterId: Id<"users">
  status: "approved" | "rejected"
  approverName: string
  reason?: string
}): NotificationCreateArgs {
  const statusText = params.status === "approved" ? "approved" : "rejected"
  const body = params.status === "rejected" && params.reason
    ? `Your expense claim was ${statusText} by ${params.approverName}. Reason: ${params.reason}`
    : `Your expense claim was ${statusText} by ${params.approverName}.`

  return {
    recipientUserId: params.submitterId,
    businessId: params.businessId,
    type: "approval",
    severity: params.status === "rejected" ? "warning" : "info",
    title: `Expense claim ${statusText}`,
    body,
    resourceType: "expense_claim",
    resourceId: params.claimId,
    resourceUrl: buildExpenseClaimUrl(params.claimId),
    sourceEvent: `approval_status_${params.claimId}_${params.status}`,
  }
}

/**
 * Build notification args for compliance override
 * (Sent to finance admins when a compliance rule is overridden)
 */
export function buildComplianceOverrideNotification(params: {
  claimId: string
  businessId: Id<"businesses">
  overrideDetails: string
}): {
  businessId: Id<"businesses">
  targetRoles: string[]
  type: "compliance"
  severity: "warning"
  title: string
  body: string
  resourceType: "expense_claim"
  resourceId: string
  resourceUrl: string
  sourceEvent: string
} {
  return {
    businessId: params.businessId,
    targetRoles: ["owner", "finance_admin"],
    type: "compliance",
    severity: "warning",
    title: "Compliance override on expense claim",
    body: params.overrideDetails,
    resourceType: "expense_claim",
    resourceId: params.claimId,
    resourceUrl: buildExpenseClaimUrl(params.claimId),
    sourceEvent: `compliance_override_${params.claimId}`,
  }
}

/**
 * Build notification args for anomaly/insight alerts
 * (Broadcast to finance admins via createForRole)
 */
export function buildInsightNotification(params: {
  businessId: Id<"businesses">
  insightId: string
  category: string
  priority: string
  title: string
  description: string
}): {
  businessId: Id<"businesses">
  targetRoles: string[]
  type: "anomaly" | "compliance" | "insight"
  severity: "info" | "warning" | "critical"
  title: string
  body: string
  resourceType: "insight"
  resourceId: string
  resourceUrl: string
  sourceEvent: string
} {
  // Map insight category to notification type
  const typeMap: Record<string, "anomaly" | "compliance" | "insight"> = {
    anomaly: "anomaly",
    compliance: "compliance",
    deadline: "insight",
    cashflow: "insight",
    optimization: "insight",
    categorization: "insight",
  }

  // Map priority to severity
  const severityMap: Record<string, "info" | "warning" | "critical"> = {
    critical: "critical",
    high: "warning",
    medium: "info",
    low: "info",
  }

  return {
    businessId: params.businessId,
    targetRoles: ["owner", "finance_admin"],
    type: typeMap[params.category] || "insight",
    severity: severityMap[params.priority] || "info",
    title: params.title,
    body: params.description,
    resourceType: "insight",
    resourceId: params.insightId,
    resourceUrl: buildInsightUrl(params.insightId),
    sourceEvent: `insight_${params.insightId}`,
  }
}
