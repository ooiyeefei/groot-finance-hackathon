/**
 * E-Invoice Usage Functions - Convex queries and mutations
 *
 * Tracks LHDN e-invoice submissions per-business per-month.
 * No credit pack fallback — plan allocation only.
 *
 * Plan limits:
 * - Trial: -1 (Pro limits, unlimited)
 * - Starter: 100
 * - Pro: -1 (unlimited)
 * - Enterprise: -1 (unlimited)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";

/**
 * Resolve e-invoice limit from plan name.
 * Trial businesses get Pro plan limits per spec FR-015.
 */
function getEinvoiceLimit(planName: string | undefined): number {
  switch (planName) {
    case "starter":
      return 100;
    case "pro":
      return -1;
    case "enterprise":
      return -1;
    case "trial":
    default:
      return -1; // Trial and unknown plans get Pro limits (unlimited)
  }
}

// ============================================
// QUERIES
// ============================================

/**
 * Get current month's e-invoice usage for a business
 */
export const getCurrentUsage = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return null;

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return null;

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const usage = await ctx.db
      .query("einvoice_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", currentMonth)
      )
      .first();

    if (!usage) {
      const business = await ctx.db.get(args.businessId);
      const planLimit = getEinvoiceLimit(business?.planName);

      return {
        month: currentMonth,
        submissionsUsed: 0,
        planLimit,
        remaining: planLimit === -1 ? -1 : planLimit,
        percentUsed: 0,
      };
    }

    const remaining =
      usage.planLimit === -1
        ? -1
        : Math.max(0, usage.planLimit - usage.submissionsUsed);
    const percentUsed =
      usage.planLimit > 0
        ? Math.round((usage.submissionsUsed / usage.planLimit) * 100)
        : 0;

    return {
      month: usage.month,
      submissionsUsed: usage.submissionsUsed,
      planLimit: usage.planLimit,
      remaining,
      percentUsed,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Record e-invoice usage (authenticated)
 */
export const recordUsage = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let usage = await ctx.db
      .query("einvoice_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", currentMonth)
      )
      .first();

    if (!usage) {
      const business = await ctx.db.get(args.businessId);
      const planLimit = getEinvoiceLimit(business?.planName);

      const usageId = await ctx.db.insert("einvoice_usage", {
        businessId: args.businessId,
        month: currentMonth,
        submissionsUsed: 1,
        planLimit,
        updatedAt: Date.now(),
      });

      return {
        usageId,
        submissionsUsed: 1,
        remaining: planLimit === -1 ? -1 : planLimit - 1,
      };
    }

    const newSubmissionsUsed = usage.submissionsUsed + 1;
    await ctx.db.patch(usage._id, {
      submissionsUsed: newSubmissionsUsed,
      updatedAt: Date.now(),
    });

    return {
      usageId: usage._id,
      submissionsUsed: newSubmissionsUsed,
      remaining:
        usage.planLimit === -1
          ? -1
          : Math.max(0, usage.planLimit - newSubmissionsUsed),
    };
  },
});

// ============================================
// INTERNAL MUTATIONS
// ============================================

/**
 * Atomic check-and-record for e-invoice submissions.
 * Plan allocation only — no credit pack fallback.
 */
export const checkAndRecord = internalMutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const business = await ctx.db.get(args.businessId);
    if (!business) {
      return { allowed: false, remaining: 0 };
    }

    const planLimit = getEinvoiceLimit(business.planName);

    let usage = await ctx.db
      .query("einvoice_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", currentMonth)
      )
      .first();

    if (!usage) {
      await ctx.db.insert("einvoice_usage", {
        businessId: args.businessId,
        month: currentMonth,
        submissionsUsed: 1,
        planLimit,
        updatedAt: Date.now(),
      });

      return {
        allowed: true,
        remaining: planLimit === -1 ? -1 : planLimit - 1,
      };
    }

    // Unlimited
    if (planLimit === -1) {
      await ctx.db.patch(usage._id, {
        submissionsUsed: usage.submissionsUsed + 1,
        updatedAt: Date.now(),
      });

      return { allowed: true, remaining: -1 };
    }

    // 001-peppol-integrate: Grace buffer of 5 extra submissions
    const GRACE_BUFFER = 5;
    const effectiveLimit = planLimit + GRACE_BUFFER;

    // Check limit with grace buffer
    if (usage.submissionsUsed < effectiveLimit) {
      const newSubmissionsUsed = usage.submissionsUsed + 1;
      await ctx.db.patch(usage._id, {
        submissionsUsed: newSubmissionsUsed,
        updatedAt: Date.now(),
      });

      const remaining = planLimit - newSubmissionsUsed;
      return {
        allowed: true,
        remaining: Math.max(0, remaining),
        inGracePeriod: newSubmissionsUsed > planLimit,
      };
    }

    // Hard limit reached (plan + grace buffer exhausted)
    return { allowed: false, remaining: 0 };
  },
});
