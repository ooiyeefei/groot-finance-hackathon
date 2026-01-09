/**
 * OCR Usage Functions - Convex queries and mutations
 *
 * These functions handle:
 * - OCR credit tracking per business per month
 * - Usage quota management
 * - Usage reporting and analytics
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// ============================================
// QUERIES
// ============================================

/**
 * Get current month's OCR usage for a business
 */
export const getCurrentUsage = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    // Get current month in YYYY-MM format
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const usage = await ctx.db
      .query("ocr_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", currentMonth)
      )
      .first();

    if (!usage) {
      // No usage record yet - return defaults
      return {
        month: currentMonth,
        pagesProcessed: 0,
        creditsUsed: 0,
        creditsRemaining: 0, // Will be set when plan is checked
        planLimit: 0,
        percentUsed: 0,
      };
    }

    return {
      ...usage,
      percentUsed: usage.planLimit > 0
        ? Math.round((usage.creditsUsed / usage.planLimit) * 100)
        : 0,
    };
  },
});

/**
 * Get usage history for a business
 */
export const getUsageHistory = query({
  args: {
    businessId: v.id("businesses"),
    months: v.optional(v.number()), // How many months of history
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Verify admin/owner access for history
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      return [];
    }

    const monthsToFetch = args.months ?? 12;

    // Get all usage records for business
    const allUsage = await ctx.db
      .query("ocr_usage")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Sort by month descending (most recent first)
    allUsage.sort((a, b) => b.month.localeCompare(a.month));

    // Return requested number of months
    return allUsage.slice(0, monthsToFetch);
  },
});

/**
 * Check if business has remaining credits
 */
export const hasCredits = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return false;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return false;
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return false;
    }

    // Get current month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const usage = await ctx.db
      .query("ocr_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", currentMonth)
      )
      .first();

    if (!usage) {
      // No usage yet - assume they have credits
      return true;
    }

    return usage.creditsRemaining > 0;
  },
});

// ============================================
// INTERNAL QUERIES (for background jobs)
// ============================================

/**
 * Get or create usage record for current month
 * Used internally by document processing jobs
 */
export const getOrCreateMonthlyUsage = internalQuery({
  args: {
    businessId: v.id("businesses"),
    month: v.string(),
  },
  handler: async (ctx, args) => {
    const usage = await ctx.db
      .query("ocr_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", args.month)
      )
      .first();

    return usage;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Initialize usage for a new month
 * Called when a business starts a new billing period
 */
export const initializeMonth = mutation({
  args: {
    businessId: v.id("businesses"),
    month: v.string(),
    planLimit: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Verify admin/owner access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Not authorized");
    }

    // Check if month already exists
    const existing = await ctx.db
      .query("ocr_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", args.month)
      )
      .first();

    if (existing) {
      throw new Error("Usage record for this month already exists");
    }

    const usageId = await ctx.db.insert("ocr_usage", {
      businessId: args.businessId,
      month: args.month,
      pagesProcessed: 0,
      creditsUsed: 0,
      creditsRemaining: args.planLimit,
      planLimit: args.planLimit,
      updatedAt: Date.now(),
    });

    return usageId;
  },
});

/**
 * Update plan limit (e.g., when subscription changes)
 */
export const updatePlanLimit = mutation({
  args: {
    businessId: v.id("businesses"),
    month: v.string(),
    planLimit: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Verify admin/owner access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Not authorized");
    }

    const usage = await ctx.db
      .query("ocr_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", args.month)
      )
      .first();

    if (!usage) {
      // Create new record if doesn't exist
      return await ctx.db.insert("ocr_usage", {
        businessId: args.businessId,
        month: args.month,
        pagesProcessed: 0,
        creditsUsed: 0,
        creditsRemaining: args.planLimit,
        planLimit: args.planLimit,
        updatedAt: Date.now(),
      });
    }

    // Update existing record
    // Adjust remaining credits based on new limit
    const usedCredits = usage.creditsUsed;
    const newRemaining = Math.max(0, args.planLimit - usedCredits);

    await ctx.db.patch(usage._id, {
      planLimit: args.planLimit,
      creditsRemaining: newRemaining,
      updatedAt: Date.now(),
    });

    return usage._id;
  },
});

// ============================================
// PUBLIC MUTATIONS (for API routes)
// ============================================

/**
 * Record OCR usage from API route
 * Called after successful document processing via API endpoint
 */
export const recordUsageFromApi = mutation({
  args: {
    businessId: v.id("businesses"),
    credits: v.optional(v.number()),
    documentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    const credits = args.credits ?? 1;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Get or create usage record
    let usage = await ctx.db
      .query("ocr_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", currentMonth)
      )
      .first();

    if (!usage) {
      // Get business to determine plan limit
      const business = await ctx.db.get(args.businessId);
      const defaultLimit = 100;

      // Create new usage record
      const usageId = await ctx.db.insert("ocr_usage", {
        businessId: args.businessId,
        month: currentMonth,
        pagesProcessed: 1,
        creditsUsed: credits,
        creditsRemaining: Math.max(0, defaultLimit - credits),
        planLimit: defaultLimit,
        updatedAt: Date.now(),
      });

      return {
        usageId,
        creditsUsed: credits,
        totalUsed: credits,
        remaining: defaultLimit - credits,
      };
    }

    // Update existing record
    const newCreditsUsed = usage.creditsUsed + credits;
    const newCreditsRemaining = Math.max(0, usage.planLimit - newCreditsUsed);

    await ctx.db.patch(usage._id, {
      pagesProcessed: usage.pagesProcessed + 1,
      creditsUsed: newCreditsUsed,
      creditsRemaining: newCreditsRemaining,
      updatedAt: Date.now(),
    });

    return {
      usageId: usage._id,
      creditsUsed: credits,
      totalUsed: newCreditsUsed,
      remaining: newCreditsRemaining,
    };
  },
});

// ============================================
// INTERNAL MUTATIONS (for document processing)
// ============================================

/**
 * Record OCR usage when a document is processed
 * Called by document processing jobs
 */
export const recordUsage = internalMutation({
  args: {
    businessId: v.id("businesses"),
    pagesProcessed: v.number(),
    creditsUsed: v.number(),
  },
  handler: async (ctx, args) => {
    // Get current month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Get or create usage record
    let usage = await ctx.db
      .query("ocr_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", currentMonth)
      )
      .first();

    if (!usage) {
      // Get business to determine default plan limit
      const business = await ctx.db.get(args.businessId);
      const defaultLimit = 100; // Default credits if no plan set

      // Create new usage record
      const usageId = await ctx.db.insert("ocr_usage", {
        businessId: args.businessId,
        month: currentMonth,
        pagesProcessed: args.pagesProcessed,
        creditsUsed: args.creditsUsed,
        creditsRemaining: Math.max(0, defaultLimit - args.creditsUsed),
        planLimit: defaultLimit,
        updatedAt: Date.now(),
      });

      return usageId;
    }

    // Update existing record
    const newPagesProcessed = usage.pagesProcessed + args.pagesProcessed;
    const newCreditsUsed = usage.creditsUsed + args.creditsUsed;
    const newCreditsRemaining = Math.max(0, usage.planLimit - newCreditsUsed);

    await ctx.db.patch(usage._id, {
      pagesProcessed: newPagesProcessed,
      creditsUsed: newCreditsUsed,
      creditsRemaining: newCreditsRemaining,
      updatedAt: Date.now(),
    });

    return usage._id;
  },
});

/**
 * Check and reserve credits before processing
 * Returns false if insufficient credits
 */
export const reserveCredits = internalMutation({
  args: {
    businessId: v.id("businesses"),
    creditsNeeded: v.number(),
  },
  handler: async (ctx, args) => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const usage = await ctx.db
      .query("ocr_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", currentMonth)
      )
      .first();

    if (!usage) {
      // No usage record - assume they have credits (will be created on first use)
      return true;
    }

    return usage.creditsRemaining >= args.creditsNeeded;
  },
});

/**
 * Reset usage for a new billing cycle
 * Called when subscription renews
 */
export const resetForNewCycle = internalMutation({
  args: {
    businessId: v.id("businesses"),
    newPlanLimit: v.number(),
  },
  handler: async (ctx, args) => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Check if record exists for this month
    const existing = await ctx.db
      .query("ocr_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", currentMonth)
      )
      .first();

    if (existing) {
      // Update with new plan limit
      await ctx.db.patch(existing._id, {
        planLimit: args.newPlanLimit,
        creditsRemaining: args.newPlanLimit - existing.creditsUsed,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    // Create new record
    const usageId = await ctx.db.insert("ocr_usage", {
      businessId: args.businessId,
      month: currentMonth,
      pagesProcessed: 0,
      creditsUsed: 0,
      creditsRemaining: args.newPlanLimit,
      planLimit: args.newPlanLimit,
      updatedAt: Date.now(),
    });

    return usageId;
  },
});
