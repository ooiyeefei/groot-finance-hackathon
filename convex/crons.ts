/**
 * Convex Cron Jobs
 *
 * Scheduled background tasks for proactive analysis and maintenance.
 *
 * T034: Proactive analysis cron - runs every 4 hours
 * T035: Deadline tracking cron - runs daily at 6 AM UTC
 *
 * Additional maintenance jobs:
 * - Expired insights cleanup
 * - MCP proposal cleanup
 *
 * Note: Notification crons are disabled until push/email integration is complete.
 * See convex/crons.ts.disabled for full list.
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * T034: Proactive Analysis Job
 *
 * Runs every 4 hours to analyze all businesses for:
 * - Anomalies (statistical outliers)
 * - Compliance gaps (missing receipts, tax thresholds)
 * - Cash flow warnings (projected negative balance)
 * - Duplicate transactions
 * - Vendor intelligence (concentration, spending changes, risk)
 * - Critical alerts (deadlines, low runway)
 *
 * Creates actionCenterInsights for any issues detected.
 */
crons.interval(
  "proactive-analysis",
  { hours: 4 },
  internal.functions.actionCenterJobs.runProactiveAnalysis
);

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
 * Runs every 5 minutes to clean up expired MCP proposals.
 * Proposals expire after 5 minutes if not confirmed.
 */
crons.interval(
  "cleanup-expired-mcp-proposals",
  { minutes: 5 },
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

/**
 * AP Vendor Management: Mark Overdue Payables
 *
 * Runs daily at 00:05 UTC (5 min after AR overdue job) to mark
 * pending Expense/COGS entries as overdue when dueDate has passed.
 */
crons.daily(
  "mark-overdue-payables",
  { hourUTC: 0, minuteUTC: 5 },
  internal.functions.accountingEntries.markOverduePayables
);

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
 * Notification Digest (018-app-email-notif)
 *
 * Runs daily at 8:00 AM UTC to send digest emails
 * aggregating unread notifications per user.
 */
crons.daily(
  "notification-digest",
  { hourUTC: 8, minuteUTC: 0 },
  internal.functions.notificationJobs.runDigest
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

// E-Invoice LHDN Polling (019-lhdn-einv-flow-2):
// Handled by AWS EventBridge → Lambda (every 5 min). No Convex cron needed.
// Lambda queries Convex for businesses with pending requests, polls LHDN directly.

export default crons;
