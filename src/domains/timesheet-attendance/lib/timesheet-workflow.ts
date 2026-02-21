/**
 * Timesheet Workflow State Machine
 * Manages valid status transitions for timesheets.
 */

type TimesheetStatus = "draft" | "confirmed" | "approved" | "finalized" | "locked";

const VALID_TRANSITIONS: Record<TimesheetStatus, TimesheetStatus[]> = {
  draft: ["confirmed"],
  confirmed: ["approved", "draft"], // draft = rejection sends back
  approved: ["finalized"],
  finalized: ["locked"],
  locked: [], // Terminal state
};

/**
 * Check if a status transition is valid.
 */
export function isValidTransition(from: TimesheetStatus, to: TimesheetStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Determine if a timesheet should auto-approve.
 * Auto-approval happens when:
 * 1. Status transitions from draft -> confirmed
 * 2. The timesheet has no anomalies
 */
export function shouldAutoApprove(hasAnomalies: boolean): boolean {
  return !hasAnomalies;
}

/**
 * Get the next status after confirmation.
 * If no anomalies: auto-approve -> "approved"
 * If anomalies: route to manager -> "confirmed" (stays confirmed, awaiting approval)
 */
export function getPostConfirmationStatus(hasAnomalies: boolean): TimesheetStatus {
  return hasAnomalies ? "confirmed" : "approved";
}

/**
 * Check if a timesheet can be edited.
 * Only draft and confirmed timesheets can be edited.
 * Editing a confirmed timesheet resets it to draft.
 */
export function canEdit(status: TimesheetStatus): boolean {
  return status === "draft" || status === "confirmed";
}

/**
 * Check if a timesheet is in a terminal/immutable state.
 */
export function isImmutable(status: TimesheetStatus): boolean {
  return status === "locked";
}
