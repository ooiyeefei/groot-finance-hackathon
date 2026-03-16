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
crons.daily(
  "proactive-analysis",
  { hourUTC: 6, minuteUTC: 30 },
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
 * Layer 2b: AI Novel Discovery
 *
 * Runs daily at 7:00 AM UTC (3 PM MYT) to discover patterns
 * that hard-coded algorithms miss. Uses LLM to analyze each
 * business's financial data holistically and surface novel insights.
 *
 * Cost: ~$0.003/business/day (Qwen3-8B on Modal serverless)
 */
crons.daily(
  "ai-discovery",
  { hourUTC: 7, minuteUTC: 0 },
  internal.functions.actionCenterJobs.runAIDiscovery
);

/**
 * MCP Proposals Cleanup
 *
 * Runs every 5 minutes to clean up expired MCP proposals.
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

/**
 * E-Invoice DSPy Weekly Intelligence Digest (001-dspy-cua-integration)
 *
 * Every Monday 9 AM MYT (1 AM UTC):
 * - Queries getEinvoiceDspyDashboard for last 7 days
 * - Emails dev+einvoiceMY@hellogroot.com with:
 *   Success rates, tier usage, failure categories,
 *   gatekeeper accuracy, merchants needing attention
 *
 * This is internal dev tooling — NOT customer-facing.
 */
// TODO: Re-enable when einvoiceDspyDigest module is created
// crons.weekly(
//   "einvoice-dspy-weekly-digest",
//   { dayOfWeek: "monday", hourUTC: 1, minuteUTC: 0 },
//   internal.functions.einvoiceDspyDigest.sendWeeklyDigest
// );

/**
 * E-Invoice Monitoring: Self-Improving Error Detection
 *
 * Runs every 2 hours to:
 * 1. Clean up stale in_progress records (Lambda timeout >15 min)
 * 2. Categorize new failures into error patterns
 * 3. Email dev@hellogroot.com about unresolved new patterns
 *
 * This enables the system to self-improve by catching new error types
 * as merchants update their forms or new merchants are added.
 */
crons.daily(
  "einvoice-monitoring",
  { hourUTC: 8, minuteUTC: 30 },
  internal.functions.einvoiceMonitoring.runMonitoringCycle
);

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

/**
 * DSPy Fee Classifier — Weekly Optimization
 *
 * Runs every Sunday at 2:00 AM UTC to optimize fee classification models
 * using MIPROv2 on accumulated user corrections (≥100 per platform).
 */
crons.weekly(
  "dspy-fee-optimization",
  { dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
  internal.functions.dspyOptimization.weeklyOptimization,
  { force: false }
);

/**
 * DSPy Bank Recon — Weekly Optimization
 *
 * Runs every Sunday at 3:00 AM UTC (staggered 1h after fee optimization)
 * to optimize bank transaction classification models using MIPROv2
 * on accumulated user corrections (≥20 per business, ≥10 unique descriptions).
 */
crons.weekly(
  "bank-recon-optimization",
  { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
  internal.functions.bankReconOptimization.weeklyOptimization,
  { force: false }
);

/**
 * DSPy PO Match — Weekly Optimization
 *
 * Runs every Sunday at 4:00 AM UTC (staggered 1h after bank recon optimization)
 * to optimize PO-Invoice line matching models using MIPROv2
 * on accumulated user corrections (≥20 per business, ≥10 unique descriptions).
 */
crons.weekly(
  "po-match-optimization",
  { dayOfWeek: "sunday", hourUTC: 4, minuteUTC: 0 },
  internal.functions.poMatchOptimization.weeklyOptimization,
  { force: false }
);

/**
 * AR Matching DSPy Optimization
 * Runs weekly on Sunday at 5 AM UTC (after PO match optimization).
 */
// NOTE: Cast to fix build — new module, types regenerate with `npx convex dev`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
crons.weekly(
  "ar-match-dspy-optimization",
  { dayOfWeek: "sunday", hourUTC: 5, minuteUTC: 0 },
  (internal.functions as any).orderMatchingOptimization.weeklyOptimization
);

/**
 * Daily AI Intelligence Digest
 *
 * Runs every hour. For each business, checks if it's 6 PM in their timezone.
 * If yes, aggregates AI activity and sends a summary email to admins.
 * Skips weekends — sends combined weekend digest on Monday.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
crons.hourly(
  "ai-daily-digest",
  { minuteUTC: 0 },
  (internal.functions as any).aiDigest.dailyDigest
);

export default crons;
