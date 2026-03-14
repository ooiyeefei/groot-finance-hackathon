/**
 * Accounting Periods Functions
 *
 * Manage fiscal periods: create, close, lock, reopen.
 * Closing a period prevents new entries; locked entries cannot be edited.
 *
 * @see specs/001-accounting-double-entry/data-model.md
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";

/**
 * Create a new accounting period
 *
 * Automatically generates period code from start date (YYYY-MM format)
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    periodName: v.string(),
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(), // YYYY-MM-DD
    fiscalYear: v.number(),
    fiscalQuarter: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    // Generate period code from start date (YYYY-MM)
    const periodCode = args.startDate.slice(0, 7);

    // Check for duplicate period
    const existing = await ctx.db
      .query("accounting_periods")
      .withIndex("by_business_period", (q) =>
        q
          .eq("businessId", args.businessId)
          .eq("fiscalYear", args.fiscalYear)
          .eq("periodCode", periodCode)
      )
      .first();

    if (existing) {
      throw new ConvexError({
        message: `Accounting period ${periodCode} already exists`,
        code: "DUPLICATE_PERIOD",
        periodCode,
      });
    }

    const now = Date.now();

    const periodId = await ctx.db.insert("accounting_periods", {
      businessId: args.businessId,
      periodCode,
      periodName: args.periodName,
      startDate: args.startDate,
      endDate: args.endDate,
      fiscalYear: args.fiscalYear,
      fiscalQuarter: args.fiscalQuarter,
      status: "open",
      journalEntryCount: 0,
      totalDebits: 0,
      totalCredits: 0,
      createdBy: userId,
      createdAt: now,
    });

    return periodId;
  },
});

/**
 * Close an accounting period
 *
 * Prevents new journal entries from being created in this period.
 * Calculates final totals from all posted entries.
 */
export const close = mutation({
  args: {
    periodId: v.id("accounting_periods"),
    closingNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    const period = await ctx.db.get(args.periodId);
    if (!period) {
      throw new ConvexError({
        message: "Accounting period not found",
        code: "PERIOD_NOT_FOUND",
      });
    }

    if (period.status === "closed") {
      throw new ConvexError({
        message: "Period is already closed",
        code: "PERIOD_ALREADY_CLOSED",
        periodCode: period.periodCode,
      });
    }

    // Get all posted entries in this period
    const allEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_business_period", (q) =>
        q
          .eq("businessId", period.businessId)
          .eq("fiscalPeriod", period.periodCode)
      )
      .collect();

    // Filter for posted entries only
    const entries = allEntries.filter((e) => e.status === "posted");

    // Calculate totals
    const journalEntryCount = entries.length;
    const totalDebits = entries.reduce((sum, e) => sum + e.totalDebit, 0);
    const totalCredits = entries.reduce((sum, e) => sum + e.totalCredit, 0);

    const now = Date.now();

    await ctx.db.patch(args.periodId, {
      status: "closed",
      closedBy: userId,
      closedAt: now,
      closingNotes: args.closingNotes,
      journalEntryCount,
      totalDebits,
      totalCredits,
    });

    return args.periodId;
  },
});

/**
 * Lock all journal entries in a period
 *
 * Sets isPeriodLocked = true on all entries.
 * Locked entries cannot be edited or reversed.
 */
export const lockEntries = mutation({
  args: {
    periodId: v.id("accounting_periods"),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    const period = await ctx.db.get(args.periodId);
    if (!period) {
      throw new ConvexError({
        message: "Accounting period not found",
        code: "PERIOD_NOT_FOUND",
      });
    }

    if (period.status !== "closed") {
      throw new ConvexError({
        message: "Can only lock entries in closed periods",
        code: "PERIOD_NOT_CLOSED",
        periodCode: period.periodCode,
      });
    }

    // Get all entries in this period
    const entries = await ctx.db
      .query("journal_entries")
      .withIndex("by_business_period", (q) =>
        q
          .eq("businessId", period.businessId)
          .eq("fiscalPeriod", period.periodCode)
      )
      .collect();

    // Lock each entry
    let lockedCount = 0;
    for (const entry of entries) {
      if (!entry.isPeriodLocked) {
        await ctx.db.patch(entry._id, {
          isPeriodLocked: true,
          accountingPeriodId: args.periodId,
        });
        lockedCount++;
      }
    }

    return {
      periodCode: period.periodCode,
      lockedCount,
      totalEntries: entries.length,
    };
  },
});

/**
 * Reopen a closed accounting period
 *
 * Admin-only function to reopen a period for corrections.
 */
export const reopen = mutation({
  args: {
    periodId: v.id("accounting_periods"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    const period = await ctx.db.get(args.periodId);
    if (!period) {
      throw new ConvexError({
        message: "Accounting period not found",
        code: "PERIOD_NOT_FOUND",
      });
    }

    if (period.status !== "closed") {
      throw new ConvexError({
        message: "Period is already open",
        code: "PERIOD_ALREADY_OPEN",
        periodCode: period.periodCode,
      });
    }

    // Check if any entries are locked
    const entries = await ctx.db
      .query("journal_entries")
      .withIndex("by_business_period", (q) =>
        q
          .eq("businessId", period.businessId)
          .eq("fiscalPeriod", period.periodCode)
      )
      .collect();

    const lockedCount = entries.filter((e) => e.isPeriodLocked).length;

    if (lockedCount > 0) {
      throw new ConvexError({
        message: `Cannot reopen period: ${lockedCount} entries are locked`,
        code: "ENTRIES_LOCKED",
        lockedCount,
      });
    }

    await ctx.db.patch(args.periodId, {
      status: "open",
      closedBy: undefined,
      closedAt: undefined,
      closingNotes: args.reason,
    });

    return args.periodId;
  },
});

/**
 * List accounting periods for a business
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(v.union(v.literal("open"), v.literal("closed"))),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("accounting_periods")
        .withIndex("by_business_status", (q) =>
          q.eq("businessId", args.businessId).eq("status", args.status!)
        )
        .order("desc")
        .collect();
    }

    // Query all periods for the business
    const allPeriods = await ctx.db
      .query("accounting_periods")
      .withIndex("by_business", (q) => q.eq("businessId", args.businessId))
      .collect();

    return allPeriods.sort((a, b) => {
      // Sort by fiscal year DESC, then period code DESC
      if (a.fiscalYear !== b.fiscalYear) {
        return b.fiscalYear - a.fiscalYear;
      }
      return b.periodCode.localeCompare(a.periodCode);
    });
  },
});

/**
 * Get accounting period by ID
 */
export const getById = query({
  args: {
    periodId: v.id("accounting_periods"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.periodId);
  },
});

/**
 * Get current period for a business
 *
 * Returns the period that contains today's date.
 */
export const getCurrent = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split("T")[0];

    const allPeriods = await ctx.db
      .query("accounting_periods")
      .withIndex("by_business", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Find period containing today
    const currentPeriod = allPeriods.find(
      (p) => p.startDate <= today && p.endDate >= today
    );

    return currentPeriod || null;
  },
});
