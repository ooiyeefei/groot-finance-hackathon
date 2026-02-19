/**
 * Sales Invoice Usage Functions - Convex queries
 *
 * Derives invoice count from existing sales_invoices table.
 * No separate counter table — counts are computed on demand.
 *
 * Plan limits:
 * - Trial: -1 (Pro limits, unlimited)
 * - Starter: 10
 * - Pro: -1 (unlimited)
 * - Enterprise: -1 (unlimited)
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";

/**
 * Resolve invoice limit from plan name.
 * Trial businesses get Pro plan limits per spec FR-015.
 */
function getInvoiceLimit(planName: string | undefined): number {
  switch (planName) {
    case "starter":
      return 10;
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
 * Get current month's sales invoice count for a business.
 * Counts from sales_invoices table where _creationTime falls within current month.
 */
export const getCurrentCount = query({
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

    const business = await ctx.db.get(args.businessId);
    const planLimit = getInvoiceLimit(business?.planName);

    // Calculate current month boundaries
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

    // Count invoices created this month
    const invoices = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId", (q) =>
        q.eq("businessId", args.businessId)
      )
      .collect();

    const count = invoices.filter(
      (inv) => inv._creationTime >= monthStart && inv._creationTime < monthEnd
    ).length;

    const remaining = planLimit === -1 ? -1 : Math.max(0, planLimit - count);
    const percentUsed =
      planLimit > 0 ? Math.round((count / planLimit) * 100) : 0;

    return {
      month: currentMonth,
      count,
      planLimit,
      remaining,
      percentUsed,
    };
  },
});

/**
 * Check if business can create a new sales invoice.
 * Returns true if count < planLimit or planLimit === -1.
 */
export const canCreate = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return false;

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return false;

    const business = await ctx.db.get(args.businessId);
    const planLimit = getInvoiceLimit(business?.planName);

    if (planLimit === -1) return true; // Unlimited

    // Count invoices created this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

    const invoices = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId", (q) =>
        q.eq("businessId", args.businessId)
      )
      .collect();

    const count = invoices.filter(
      (inv) => inv._creationTime >= monthStart && inv._creationTime < monthEnd
    ).length;

    return count < planLimit;
  },
});

/**
 * Internal version of canCreate — no auth check.
 * Used by salesInvoices.create mutation for pre-flight check.
 */
export const canCreateInternal = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    const planLimit = getInvoiceLimit(business?.planName);

    if (planLimit === -1) return true;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

    const invoices = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId", (q) =>
        q.eq("businessId", args.businessId)
      )
      .collect();

    const count = invoices.filter(
      (inv) => inv._creationTime >= monthStart && inv._creationTime < monthEnd
    ).length;

    return count < planLimit;
  },
});
