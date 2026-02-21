import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

/**
 * List payroll adjustments for a business, optionally filtered by period
 */
export const listForPeriod = query({
  args: {
    businessId: v.string(),
    periodStartDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) throw new Error("Business not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Insufficient permissions");
    }

    // Query adjustments
    let adjustmentsQuery = ctx.db
      .query("payroll_adjustments")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id));

    // Apply period filter if provided
    if (args.periodStartDate) {
      adjustmentsQuery = adjustmentsQuery.filter((q) =>
        q.eq(q.field("originalPeriodStartDate"), args.periodStartDate)
      );
    }

    const adjustments = await adjustmentsQuery.collect();

    // Enrich with user info
    const enrichedAdjustments = await Promise.all(
      adjustments.map(async (adjustment) => {
        const adjustmentUser = await ctx.db.get(adjustment.userId);
        return {
          ...adjustment,
          user: adjustmentUser
            ? {
                fullName: adjustmentUser.fullName,
                email: adjustmentUser.email,
              }
            : null,
        };
      })
    );

    return enrichedAdjustments;
  },
});

/**
 * Create a new payroll adjustment for a locked timesheet
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    originalTimesheetId: v.id("timesheets"),
    adjustmentType: v.union(
      v.literal("hours_add"),
      v.literal("hours_deduct"),
      v.literal("ot_add"),
      v.literal("ot_deduct")
    ),
    minutes: v.number(),
    overtimeTier: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) throw new Error("Business not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Insufficient permissions");
    }

    // Validate original timesheet
    const originalTimesheet = await ctx.db.get(args.originalTimesheetId);
    if (!originalTimesheet) {
      throw new Error("Original timesheet not found");
    }

    if (originalTimesheet.status !== "locked") {
      throw new Error("Timesheet must be locked before creating adjustments");
    }

    // Validate reason
    if (!args.reason || args.reason.trim().length === 0) {
      throw new Error("Reason is required");
    }

    // Validate minutes
    if (args.minutes <= 0) {
      throw new Error("Minutes must be greater than 0");
    }

    // Create the adjustment
    const adjustmentId = await ctx.db.insert("payroll_adjustments", {
      businessId: args.businessId,
      userId: args.userId,
      originalTimesheetId: args.originalTimesheetId,
      originalPeriodStartDate: originalTimesheet.periodStartDate,
      adjustmentType: args.adjustmentType,
      minutes: args.minutes,
      ...(args.overtimeTier && { overtimeTier: args.overtimeTier }),
      reason: args.reason,
      createdBy: user._id,
      updatedAt: Date.now(),
    });

    return adjustmentId;
  },
});