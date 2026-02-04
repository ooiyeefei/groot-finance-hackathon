/**
 * Leave Request Workflow State Machine
 *
 * Manages state transitions for leave requests following the workflow:
 *
 *   draft → submitted → approved
 *                    ↘ rejected
 *
 *   submitted → cancelled (by employee)
 *   approved → cancelled (by employee, if future date only)
 */

import { LEAVE_REQUEST_STATUSES, type LeaveRequestStatus } from "@/lib/constants/statuses";
import { parseISODate } from "./day-calculator";

// ============================================
// STATE TRANSITION DEFINITIONS
// ============================================

type TransitionAction = "submit" | "approve" | "reject" | "cancel";

interface TransitionRule {
  from: LeaveRequestStatus[];
  to: LeaveRequestStatus;
  action: TransitionAction;
  // Additional validation function (e.g., future date check for cancel from approved)
  validate?: (context: TransitionContext) => { valid: boolean; error?: string };
}

interface TransitionContext {
  currentStatus: LeaveRequestStatus;
  startDate: string;  // ISO date string
  isOwner: boolean;   // Is the user who owns the request
  isApprover: boolean; // Is the user the assigned approver
}

const TRANSITION_RULES: TransitionRule[] = [
  // Employee submits draft request
  {
    from: [LEAVE_REQUEST_STATUSES.DRAFT],
    to: LEAVE_REQUEST_STATUSES.SUBMITTED,
    action: "submit",
  },
  // Manager approves submitted request
  {
    from: [LEAVE_REQUEST_STATUSES.SUBMITTED],
    to: LEAVE_REQUEST_STATUSES.APPROVED,
    action: "approve",
    validate: (ctx) => {
      if (!ctx.isApprover) {
        return { valid: false, error: "Only the assigned approver can approve this request" };
      }
      return { valid: true };
    },
  },
  // Manager rejects submitted request
  {
    from: [LEAVE_REQUEST_STATUSES.SUBMITTED],
    to: LEAVE_REQUEST_STATUSES.REJECTED,
    action: "reject",
    validate: (ctx) => {
      if (!ctx.isApprover) {
        return { valid: false, error: "Only the assigned approver can reject this request" };
      }
      return { valid: true };
    },
  },
  // Employee cancels submitted request (always allowed)
  {
    from: [LEAVE_REQUEST_STATUSES.SUBMITTED],
    to: LEAVE_REQUEST_STATUSES.CANCELLED,
    action: "cancel",
    validate: (ctx) => {
      if (!ctx.isOwner) {
        return { valid: false, error: "Only the request owner can cancel this request" };
      }
      return { valid: true };
    },
  },
  // Employee cancels approved request (only if start date is in the future)
  {
    from: [LEAVE_REQUEST_STATUSES.APPROVED],
    to: LEAVE_REQUEST_STATUSES.CANCELLED,
    action: "cancel",
    validate: (ctx) => {
      if (!ctx.isOwner) {
        return { valid: false, error: "Only the request owner can cancel this request" };
      }
      // Check if start date is in the future
      const startDate = parseISODate(ctx.startDate);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if (startDate <= today) {
        return {
          valid: false,
          error: "Cannot cancel approved leave that has already started or is today",
        };
      }
      return { valid: true };
    },
  },
  // Employee cancels draft request (always allowed)
  {
    from: [LEAVE_REQUEST_STATUSES.DRAFT],
    to: LEAVE_REQUEST_STATUSES.CANCELLED,
    action: "cancel",
    validate: (ctx) => {
      if (!ctx.isOwner) {
        return { valid: false, error: "Only the request owner can cancel this request" };
      }
      return { valid: true };
    },
  },
];

// ============================================
// PUBLIC API
// ============================================

/**
 * Check if a transition is valid
 */
export function canTransition(
  action: TransitionAction,
  context: TransitionContext
): { valid: boolean; error?: string } {
  const rule = TRANSITION_RULES.find(
    (r) => r.action === action && r.from.includes(context.currentStatus)
  );

  if (!rule) {
    return {
      valid: false,
      error: `Cannot ${action} a request with status "${context.currentStatus}"`,
    };
  }

  // Run additional validation if defined
  if (rule.validate) {
    return rule.validate(context);
  }

  return { valid: true };
}

/**
 * Get the target status for a valid transition
 */
export function getTargetStatus(
  action: TransitionAction,
  currentStatus: LeaveRequestStatus
): LeaveRequestStatus | null {
  const rule = TRANSITION_RULES.find(
    (r) => r.action === action && r.from.includes(currentStatus)
  );
  return rule?.to ?? null;
}

/**
 * Get all available transitions from the current status
 */
export function getAvailableTransitions(
  context: TransitionContext
): { action: TransitionAction; targetStatus: LeaveRequestStatus }[] {
  const available: { action: TransitionAction; targetStatus: LeaveRequestStatus }[] = [];

  for (const rule of TRANSITION_RULES) {
    if (rule.from.includes(context.currentStatus)) {
      // Check if validation passes
      const validation = rule.validate ? rule.validate(context) : { valid: true };
      if (validation.valid) {
        available.push({
          action: rule.action,
          targetStatus: rule.to,
        });
      }
    }
  }

  return available;
}

/**
 * Validate a transition and return the new status
 */
export function validateTransition(
  action: TransitionAction,
  context: TransitionContext
): { valid: boolean; newStatus?: LeaveRequestStatus; error?: string } {
  const validation = canTransition(action, context);

  if (!validation.valid) {
    return validation;
  }

  const newStatus = getTargetStatus(action, context.currentStatus);
  if (!newStatus) {
    return { valid: false, error: "Invalid transition" };
  }

  return { valid: true, newStatus };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a request can be edited (only draft status)
 */
export function canEditRequest(status: LeaveRequestStatus): boolean {
  return status === LEAVE_REQUEST_STATUSES.DRAFT;
}

/**
 * Check if a request can be cancelled by the owner
 */
export function canCancelRequest(
  status: LeaveRequestStatus,
  startDate: string
): { canCancel: boolean; reason?: string } {
  // Draft and submitted can always be cancelled
  if (
    status === LEAVE_REQUEST_STATUSES.DRAFT ||
    status === LEAVE_REQUEST_STATUSES.SUBMITTED
  ) {
    return { canCancel: true };
  }

  // Approved can only be cancelled if in the future
  if (status === LEAVE_REQUEST_STATUSES.APPROVED) {
    const start = parseISODate(startDate);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    if (start > today) {
      return { canCancel: true };
    }
    return {
      canCancel: false,
      reason: "Cannot cancel leave that has already started",
    };
  }

  // Rejected and cancelled cannot be cancelled
  return {
    canCancel: false,
    reason: `Cannot cancel a ${status} request`,
  };
}

/**
 * Check if balance should be restored when cancelling
 */
export function shouldRestoreBalance(previousStatus: LeaveRequestStatus): boolean {
  // Only restore balance if the request was previously approved
  return previousStatus === LEAVE_REQUEST_STATUSES.APPROVED;
}

/**
 * Check if balance should be deducted when approving
 */
export function shouldDeductBalance(leaveTypeDeductsBalance: boolean): boolean {
  return leaveTypeDeductsBalance;
}

/**
 * Get display text for a status
 */
export function getStatusDisplayText(status: LeaveRequestStatus): string {
  const displayMap: Record<LeaveRequestStatus, string> = {
    draft: "Draft",
    submitted: "Pending Approval",
    approved: "Approved",
    rejected: "Rejected",
    cancelled: "Cancelled",
  };
  return displayMap[status] ?? status;
}

/**
 * Get status badge color (for UI)
 */
export function getStatusColor(status: LeaveRequestStatus): string {
  const colorMap: Record<LeaveRequestStatus, string> = {
    draft: "gray",
    submitted: "yellow",
    approved: "green",
    rejected: "red",
    cancelled: "gray",
  };
  return colorMap[status] ?? "gray";
}
