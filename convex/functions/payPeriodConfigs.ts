/**
 * Pay Period Configuration Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Pay period configuration CRUD operations
 * - Admin-only configuration
 * - Frequency and timing settings
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// ============================================
// QUERIES
// ============================================

/**
 * Get the active pay period configuration for a business
 */
export const getActive = query({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    // Resolve business ID (supports both Convex ID and legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) throw new Error("Business not found");

    // Verify membership and role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member");
    }

    // Check for manager+ role (owner, finance_admin, or manager)
    if (membership.role !== "owner" && membership.role !== "finance_admin" && membership.role !== "manager") {
      throw new Error("Insufficient permissions");
    }

    // Get the active configuration
    const config = await ctx.db
      .query("pay_period_configs")
      .withIndex("by_businessId_isActive", (q) =>
        q.eq("businessId", business._id).eq("isActive", true)
      )
      .first();

    return config;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create or update pay period configuration (admin only)
 */
export const createOrUpdate = mutation({
  args: {
    businessId: v.id("businesses"),
    frequency: v.union(v.literal("weekly"), v.literal("biweekly"), v.literal("monthly")),
    startDay: v.number(),
    confirmationDeadlineDays: v.number(),
  },
  handler: async (ctx, args) => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    // Get the business directly since we have a Convex ID
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Business not found");

    // Verify membership and admin role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member");
    }

    // Check for owner or finance_admin role only
    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Insufficient permissions");
    }

    // Validate startDay based on frequency
    if (args.frequency === "weekly" || args.frequency === "biweekly") {
      // For weekly/biweekly: 0-6 (Sunday to Saturday)
      if (args.startDay < 0 || args.startDay > 6) {
        throw new Error("Start day must be 0-6 for weekly/biweekly periods");
      }
    } else if (args.frequency === "monthly") {
      // For monthly: 1-28 (day of month)
      if (args.startDay < 1 || args.startDay > 28) {
        throw new Error("Start day must be 1-28 for monthly periods");
      }
    }

    // Validate confirmation deadline days
    if (args.confirmationDeadlineDays < 0) {
      throw new Error("Confirmation deadline days must be non-negative");
    }

    const now = Date.now();

    // Deactivate any existing active configuration
    const existingConfig = await ctx.db
      .query("pay_period_configs")
      .withIndex("by_businessId_isActive", (q) =>
        q.eq("businessId", args.businessId).eq("isActive", true)
      )
      .first();

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, {
        isActive: false,
        updatedAt: now,
      });
    }

    // Create new active configuration
    const newConfigId = await ctx.db.insert("pay_period_configs", {
      businessId: args.businessId,
      frequency: args.frequency,
      startDay: args.startDay,
      confirmationDeadlineDays: args.confirmationDeadlineDays,
      isActive: true,
      updatedAt: now,
    });

    return newConfigId;
  },
});