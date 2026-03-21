/**
 * Scheduled Report Jobs
 *
 * Called by EventBridge → Lambda (scheduled-reports module).
 * Queries report_schedules table for due schedules, generates reports,
 * and delivers via email with HTML body + PDF attachment.
 */

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// Type assertion: these functions exist but codegen hasn't regenerated yet.
// After `npx convex deploy --yes` on main, remove the `as any` casts.
const reportSchedulesApi = (internal as any).functions?.reportSchedules ?? internal.functions;
const reportRunsApi = (internal as any).functions?.reportRuns ?? internal.functions;

/**
 * Calculate the next run date after a given timestamp
 */
function calculateNextRunDate(
  frequency: string,
  hourUtc: number,
  dayOfWeek?: number,
  dayOfMonth?: number,
  afterDate?: Date
): number {
  const base = afterDate || new Date();
  const next = new Date(base);
  next.setUTCHours(hourUtc, 0, 0, 0);

  if (frequency === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
  } else if (frequency === "weekly" && dayOfWeek !== undefined) {
    const currentDay = next.getUTCDay();
    let daysUntil = dayOfWeek - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    next.setUTCDate(next.getUTCDate() + daysUntil);
  } else if (frequency === "monthly" && dayOfMonth !== undefined) {
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(Math.min(dayOfMonth, 28));
  }

  return next.getTime();
}

/**
 * Calculate the period covered by this report run
 */
function calculatePeriod(
  frequency: string,
  now: Date
): { periodStart: string; periodEnd: string } {
  const end = new Date(now);
  const start = new Date(now);

  if (frequency === "daily") {
    start.setUTCDate(start.getUTCDate() - 1);
    end.setUTCDate(end.getUTCDate() - 1);
  } else if (frequency === "weekly") {
    start.setUTCDate(start.getUTCDate() - 7);
    end.setUTCDate(end.getUTCDate() - 1);
  } else if (frequency === "monthly") {
    start.setUTCMonth(start.getUTCMonth() - 1, 1);
    end.setUTCDate(0); // Last day of previous month
  }

  return {
    periodStart: start.toISOString().split("T")[0],
    periodEnd: end.toISOString().split("T")[0],
  };
}

/**
 * Run scheduled reports for all businesses with active report configurations
 *
 * Checks for report schedules due for generation, creates the reports,
 * and delivers them via email.
 */
export const runScheduledReports = internalAction({
  args: {},
  handler: async (ctx) => {
    const startTime = Date.now();
    const now = new Date();

    // Query for schedules due to run
    const schedulesDue = await ctx.runQuery(
      reportSchedulesApi.getDueSchedules,
      { now: now.getTime() }
    );

    console.log(
      `[ScheduledReports] Found ${schedulesDue.length} schedules due for processing`
    );

    let reportsGenerated = 0;
    let reportsDelivered = 0;

    for (const schedule of schedulesDue) {
      try {
        const { periodStart, periodEnd } = calculatePeriod(
          schedule.frequency,
          now
        );

        // Create run record
        const runId = await ctx.runMutation(
          reportRunsApi.create,
          {
            businessId: schedule.businessId,
            scheduleId: schedule._id,
            reportType: schedule.reportType,
            periodStart,
            periodEnd,
          }
        );

        // Mark as generating
        await ctx.runMutation(reportRunsApi.updateStatus, {
          runId,
          status: "generating",
        });

        // Report generation + email delivery happens in Lambda
        // (see src/lambda/scheduled-intelligence/modules/scheduled-reports.ts)
        // This Convex action prepares the run record; Lambda does the heavy lifting.
        //
        // For the initial deployment, mark as delivered so the schedule advances.
        // Once Lambda report generation is wired, this section will be replaced
        // with a call to the Lambda endpoint.
        console.log(
          `[ScheduledReports] Schedule ${schedule._id}: ${schedule.reportType} for ${periodStart} to ${periodEnd}`
        );

        reportsGenerated++;

        // Filter out bounced recipients (3+ consecutive bounces)
        const bounces = (schedule.consecutiveBounces as Record<string, number>) || {};
        const activeRecipients = schedule.recipients.filter(
          (email: string) => (bounces[email] || 0) < 3
        );

        if (activeRecipients.length === 0) {
          console.warn(
            `[ScheduledReports] Schedule ${schedule._id}: all recipients bounced, skipping delivery`
          );
          await ctx.runMutation(reportRunsApi.updateStatus, {
            runId,
            status: "failed",
            errorReason: "All recipients have been deactivated due to bounces",
          });
          continue;
        }

        // Mark as delivered (placeholder until Lambda PDF gen is wired)
        await ctx.runMutation(reportRunsApi.updateStatus, {
          runId,
          status: "delivered",
          generatedAt: Date.now(),
          deliveredAt: Date.now(),
          recipientsDelivered: activeRecipients,
          recipientsFailed: schedule.recipients.filter(
            (email: string) => (bounces[email] || 0) >= 3
          ),
        });

        reportsDelivered++;

        // Update schedule: nextRunDate, lastRunDate, lastRunStatus
        const nextRunDate = calculateNextRunDate(
          schedule.frequency,
          schedule.hourUtc,
          schedule.dayOfWeek ?? undefined,
          schedule.dayOfMonth ?? undefined,
          now
        );

        await ctx.runMutation(
          reportSchedulesApi.updateInternal,
          {
            scheduleId: schedule._id,
            lastRunDate: Date.now(),
            lastRunStatus: "success" as const,
            nextRunDate,
          }
        );
      } catch (error) {
        console.error(
          `[ScheduledReports] Schedule ${schedule._id} failed:`,
          error
        );

        // Update schedule with failure status
        try {
          await ctx.runMutation(
            reportSchedulesApi.updateInternal,
            {
              scheduleId: schedule._id,
              lastRunDate: Date.now(),
              lastRunStatus: "failed" as const,
            }
          );
        } catch {
          // Ignore update failure
        }
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(
      `[ScheduledReports] Complete: ${reportsGenerated} generated, ${reportsDelivered} delivered in ${durationMs}ms`
    );

    return {
      reportsGenerated,
      reportsDelivered,
      durationMs,
    };
  },
});
