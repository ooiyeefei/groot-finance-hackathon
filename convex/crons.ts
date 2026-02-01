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

export default crons;
