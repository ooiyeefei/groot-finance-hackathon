/**
 * Report Runs Functions — Convex queries and mutations
 *
 * Tracks individual report generation executions.
 * Used by scheduledReportJobs and the MCP scheduled-reports module.
 */

import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";

// ============================================
// INTERNAL MUTATIONS
// ============================================

/**
 * Create a new report run record
 */
export const create = internalMutation({
  args: {
    businessId: v.id("businesses"),
    scheduleId: v.id("report_schedules"),
    reportType: v.string(),
    periodStart: v.string(),
    periodEnd: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("report_runs", {
      businessId: args.businessId,
      scheduleId: args.scheduleId,
      reportType: args.reportType,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      status: "pending",
    });
  },
});

/**
 * Update run status (generating → delivered / failed)
 */
export const updateStatus = internalMutation({
  args: {
    runId: v.id("report_runs"),
    status: v.union(
      v.literal("pending"),
      v.literal("generating"),
      v.literal("delivered"),
      v.literal("failed")
    ),
    errorReason: v.optional(v.string()),
    recipientsDelivered: v.optional(v.array(v.string())),
    recipientsFailed: v.optional(v.array(v.string())),
    generatedAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    pdfStorageKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { runId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }
    await ctx.db.patch(runId, patch);
  },
});

// ============================================
// INTERNAL QUERIES
// ============================================

/**
 * List runs for a schedule
 */
export const listBySchedule = internalQuery({
  args: {
    scheduleId: v.id("report_schedules"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("report_runs")
      .withIndex("by_scheduleId", (q) => q.eq("scheduleId", args.scheduleId))
      .order("desc")
      .take(args.limit ?? 10);
    return runs;
  },
});

/**
 * List runs for a business (most recent first)
 */
export const listByBusiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("report_runs")
      .withIndex("by_businessId_date", (q) =>
        q.eq("businessId", args.businessId)
      )
      .order("desc")
      .take(args.limit ?? 20);
    return runs;
  },
});
