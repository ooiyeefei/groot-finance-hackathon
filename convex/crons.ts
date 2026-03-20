/**
 * Convex Cron Jobs
 *
 * IMPORTANT: If a job reads >10 documents or scans tables for all businesses,
 * use EventBridge → Lambda instead (see infra/lib/scheduled-intelligence-stack.ts).
 *
 * Convex crons are ONLY for lightweight jobs (<10 doc reads per execution):
 * - deadline-tracking
 * - cleanup-* jobs
 * - mark-overdue-invoices
 * - generate-recurring-invoices
 * - expire-credit-packs
 * - attendance/timesheet jobs
 * - PDPA retention jobs
 * - expire-manual-subscriptions
 *
 * Heavy analysis jobs have been migrated to EventBridge (2026-03-20, issue #353):
 * - proactive-analysis, ai-discovery, notification-digest, einvoice-monitoring
 * - dspy-fee, dspy-bank-recon, dspy-po-match, dspy-ar-match
 * - chat-agent-optimization, ai-daily-digest, einvoice-dspy-digest
 * - weekly-email-digest, scheduled-reports
 *
 * See specs/030-eventbridge-migration/ for architecture and rationale.
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ============================================
// LIGHTWEIGHT CRONS (kept in Convex, <10 docs per run)
// ============================================

/**
 * T035: Deadline Tracking Job
 *
 * Runs daily at 6:00 AM UTC to check for:
 * - Tax filing deadlines
 * - Invoice payment due dates
 * - Regulatory reporting periods
 *
 * Creates alerts at 30, 14, 7, 3, and 1 day intervals.
 */
crons.daily(
  "deadline-tracking",
  { hourUTC: 6, minuteUTC: 0 },
  internal.functions.actionCenterJobs.runDeadlineTracking
);

/**
 * Expired Insights Cleanup
 *
 * Runs daily at 2:00 AM UTC to remove expired insights.
 * Keeps the action center clean and performant.
 */
crons.daily(
  "cleanup-expired-insights",
  { hourUTC: 2, minuteUTC: 0 },
  internal.functions.actionCenterInsights.deleteExpired
);

/**
 * MCP Proposals Cleanup
 *
 * Runs every hour to clean up expired MCP proposals.
 * Proposals expire after 5 minutes if not confirmed.
 */
crons.interval(
  "cleanup-expired-mcp-proposals",
  { hours: 1 },
  internal.functions.mcpProposals.cleanupExpiredProposals
);

/**
 * Empty Draft Submission Cleanup (009-batch-receipt-submission)
 *
 * Runs every hour to delete draft submissions that:
 * - Have zero claims attached
 * - Are older than 24 hours
 */
crons.interval(
  "cleanup-empty-draft-submissions",
  { hours: 1 },
  internal.functions.expenseSubmissions.cleanupEmptyDrafts
);

/**
 * Sales Invoice: Mark Overdue
 *
 * Runs daily at midnight UTC to mark sent/partially_paid invoices
 * as overdue when dueDate has passed.
 */
crons.daily(
  "mark-overdue-invoices",
  { hourUTC: 0, minuteUTC: 0 },
  internal.functions.salesInvoices.markOverdue
);

/**
 * Sales Invoice: Generate Recurring Invoices
 *
 * Runs daily at 1 AM UTC to generate invoices from active
 * recurring schedules when nextGenerationDate is reached.
 */
crons.daily(
  "generate-recurring-invoices",
  { hourUTC: 1, minuteUTC: 0 },
  internal.functions.salesInvoices.generateDueInvoices
);

// markOverduePayables cron removed — accounting_entries write mutations deleted
// AP overdue detection now handled via invoices.paymentStatus + dueDate

/**
 * Credit Pack Expiry
 *
 * Runs daily at 3:00 AM UTC to expire active credit packs
 * where expiresAt <= now (90 days after purchase).
 */
crons.daily(
  "expire-credit-packs",
  { hourUTC: 3, minuteUTC: 0 },
  internal.functions.creditPacks.expireDaily
);

/**
 * Notification Cleanup (018-app-email-notif)
 *
 * Runs daily at 2:30 AM UTC to delete notifications older than 90 days.
 */
crons.daily(
  "notification-cleanup",
  { hourUTC: 2, minuteUTC: 30 },
  internal.functions.notifications.deleteExpired
);

/**
 * Attendance: Auto-Close Incomplete Sessions (018-timesheet-attendance)
 *
 * Runs daily at midnight UTC to close any incomplete attendance
 * sessions (checked in but never checked out) using the
 * employee's scheduled end time.
 */
crons.daily(
  "auto-close-incomplete-sessions",
  { hourUTC: 0, minuteUTC: 15 },
  internal.functions.attendanceRecords.autoCloseIncompleteSessions
);

/**
 * Timesheet: Generate Timesheets (018-timesheet-attendance)
 *
 * Runs daily at 1:30 AM UTC to generate draft timesheets
 * for each tracked employee at the end of their pay period.
 */
crons.daily(
  "generate-timesheets",
  { hourUTC: 1, minuteUTC: 30 },
  internal.functions.timesheets.generateTimesheets
);

/**
 * Timesheet: Auto-Confirm Past Deadline (018-timesheet-attendance)
 *
 * Runs daily at 2:30 AM UTC to auto-confirm draft timesheets
 * that have passed the confirmation deadline. If no anomalies,
 * also auto-approves them.
 */
crons.daily(
  "auto-confirm-past-deadline",
  { hourUTC: 2, minuteUTC: 30 },
  internal.functions.timesheets.autoConfirmPastDeadline
);

/**
 * Manual Subscription Expiry
 *
 * Runs daily at 0:30 AM UTC to pause manual subscriptions
 * (bank transfer customers) whose subscriptionPeriodEnd has passed.
 * This triggers the lock overlay so expired manual subs get locked.
 */
crons.daily(
  "expire-manual-subscriptions",
  { hourUTC: 0, minuteUTC: 30 },
  internal.functions.businesses.expireManualSubscriptions
);

// E-Invoice LHDN Polling (019-lhdn-einv-flow-2):
// Handled by AWS EventBridge → Lambda (every 5 min). No Convex cron needed.
// Lambda queries Convex for businesses with pending requests, polls LHDN directly.

// ============================================
// PDPA Data Retention Cleanup (001-pdpa-data-retention-cleanup)
// ============================================

/**
 * Chat Conversation Cleanup
 *
 * Runs daily at 3:30 AM UTC to delete conversations and messages
 * older than 2 years (730 days). Age measured from lastMessageAt
 * (or _creationTime for empty conversations).
 * Legal basis: PDPA data minimization principle (MY PDPA s.10, SG PDPA s.25).
 */
crons.daily(
  "cleanup-expired-conversations",
  { hourUTC: 3, minuteUTC: 30 },
  internal.functions.retentionJobs.cleanupExpiredConversations
);

/**
 * Audit Log Cleanup
 *
 * Runs daily at 4:00 AM UTC to delete audit events older than 3 years
 * (1,095 days). No file cleanup needed.
 * Retention period: policy-based (no specific statutory requirement).
 */
crons.daily(
  "cleanup-old-audit-events",
  { hourUTC: 4, minuteUTC: 0 },
  internal.functions.audit.deleteExpired
);

/**
 * Export History Cleanup
 *
 * Runs daily at 4:30 AM UTC to permanently delete export history
 * records older than 1 year (365 days), including associated
 * Convex storage files. Complements the existing 90-day archiver.
 * Retention period: policy-based (no specific statutory requirement).
 */
crons.daily(
  "cleanup-old-export-history",
  { hourUTC: 4, minuteUTC: 30 },
  internal.functions.exportHistory.deleteExpired
);

/**
 * User Hard-Delete (PDPA retention)
 *
 * Runs daily at 5:00 AM UTC to permanently delete users whose
 * soft-delete retention (90 days) has expired.
 * Deletes from: Clerk (identity), Qdrant (Mem0 memories), Convex (records).
 */
crons.daily(
  "hard-delete-expired-users",
  { hourUTC: 5, minuteUTC: 0 },
  internal.functions.retentionJobs.hardDeleteExpiredUsers
);

// ============================================
// MIGRATED TO EVENTBRIDGE (DO NOT RE-ADD HERE)
// See infra/lib/scheduled-intelligence-stack.ts
// ============================================
// proactive-analysis      → EventBridge daily 4am UTC
// ai-discovery            → EventBridge daily 4am UTC
// notification-digest     → EventBridge daily 4am UTC
// einvoice-monitoring     → EventBridge daily 4am UTC
// ai-daily-digest         → EventBridge daily 4am UTC
// dspy-fee                → EventBridge weekly Sun 2am UTC
// dspy-bank-recon         → EventBridge weekly Sun 2am UTC
// dspy-po-match           → EventBridge weekly Sun 2am UTC
// dspy-ar-match           → EventBridge weekly Sun 2am UTC
// chat-agent-optimization → EventBridge weekly Sun 2am UTC
// einvoice-dspy-digest    → EventBridge weekly Sun 2am UTC
// weekly-email-digest     → EventBridge weekly Sun 2am UTC
// scheduled-reports       → EventBridge monthly 1st 3am UTC

export default crons;
