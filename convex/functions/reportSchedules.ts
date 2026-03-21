/**
 * Report Schedules Functions — Convex queries and mutations
 *
 * CRUD operations for chat-driven scheduled financial reports.
 * Called by MCP tool schedule_report via Convex HTTP API.
 */

import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { exportFrequencyValidator } from "../lib/validators";

const MAX_SCHEDULES_PER_BUSINESS = 10;

const reportTypeValidator = v.union(
  v.literal("pnl"),
  v.literal("cash_flow"),
  v.literal("ar_aging"),
  v.literal("ap_aging"),
  v.literal("expense_summary")
);

// ============================================
// INTERNAL QUERIES (for Lambda / MCP tools)
// ============================================

/**
 * List active schedules for a business (internal — no auth check)
 */
export const listByBusiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("report_schedules")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId));

    const all = await q.collect();

    if (args.activeOnly) {
      return all.filter((s) => s.isActive && !s.deletedAt);
    }
    return all.filter((s) => !s.deletedAt);
  },
});

/**
 * Get schedules due for execution (used by scheduledReportJobs)
 */
export const getDueSchedules = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("report_schedules")
      .withIndex("by_nextRunDate", (q) => q.lte("nextRunDate", args.now))
      .collect()
      .then((schedules) =>
        schedules.filter((s) => s.isActive && !s.deletedAt)
      );
  },
});

// ============================================
// INTERNAL MUTATIONS (for MCP tools / Lambda)
// ============================================

/**
 * Create a new report schedule (internal — called by MCP tool)
 */
export const createInternal = internalMutation({
  args: {
    businessId: v.id("businesses"),
    createdBy: v.id("users"),
    reportType: reportTypeValidator,
    frequency: exportFrequencyValidator,
    hourUtc: v.number(),
    minuteUtc: v.optional(v.number()),
    dayOfWeek: v.optional(v.number()),
    dayOfMonth: v.optional(v.number()),
    recipients: v.array(v.string()),
    currency: v.string(),
    nextRunDate: v.number(),
  },
  handler: async (ctx, args) => {
    // Enforce 10-schedule-per-business limit
    const existing = await ctx.db
      .query("report_schedules")
      .withIndex("by_businessId_active", (q) =>
        q.eq("businessId", args.businessId).eq("isActive", true)
      )
      .collect();
    const activeCount = existing.filter((s) => !s.deletedAt).length;

    if (activeCount >= MAX_SCHEDULES_PER_BUSINESS) {
      throw new Error(
        `Maximum of ${MAX_SCHEDULES_PER_BUSINESS} active report schedules per business. Please cancel an existing schedule first.`
      );
    }

    const id = await ctx.db.insert("report_schedules", {
      businessId: args.businessId,
      createdBy: args.createdBy,
      reportType: args.reportType,
      frequency: args.frequency,
      hourUtc: args.hourUtc,
      minuteUtc: args.minuteUtc,
      dayOfWeek: args.dayOfWeek,
      dayOfMonth: args.dayOfMonth,
      recipients: args.recipients,
      currency: args.currency,
      isActive: true,
      nextRunDate: args.nextRunDate,
    });

    return id;
  },
});

/**
 * Update a report schedule (internal — called by MCP tool for modify/cancel)
 */
export const updateInternal = internalMutation({
  args: {
    scheduleId: v.id("report_schedules"),
    frequency: v.optional(exportFrequencyValidator),
    dayOfWeek: v.optional(v.number()),
    dayOfMonth: v.optional(v.number()),
    recipients: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
    nextRunDate: v.optional(v.number()),
    lastRunDate: v.optional(v.number()),
    lastRunStatus: v.optional(v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("pending")
    )),
    consecutiveBounces: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { scheduleId, ...updates } = args;
    const schedule = await ctx.db.get(scheduleId);
    if (!schedule || schedule.deletedAt) {
      throw new Error("Schedule not found");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }

    await ctx.db.patch(scheduleId, patch);
  },
});

/**
 * Soft-delete a report schedule
 */
export const cancelInternal = internalMutation({
  args: { scheduleId: v.id("report_schedules") },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule || schedule.deletedAt) {
      throw new Error("Schedule not found");
    }
    await ctx.db.patch(args.scheduleId, {
      isActive: false,
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// PUBLIC QUERIES (for frontend if needed)
// ============================================

/**
 * List report schedules — authenticated user query
 */
export const list = query({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const businessId = args.businessId as Id<"businesses">;
    const schedules = await ctx.db
      .query("report_schedules")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    return schedules.filter((s) => !s.deletedAt);
  },
});
