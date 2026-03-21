/**
 * Action Center Insights Functions - Convex queries and mutations
 *
 * CRUD operations for proactive intelligence insights
 *
 * These functions handle:
 * - Listing insights with filtering by status/category/priority
 * - Getting individual insight details
 * - Updating insight status (reviewed, dismissed, actioned)
 * - Getting pending/new insights count
 * - Generating summary statistics
 *
 * Security: Multi-tenant isolation via businessId/userId
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";

// ============================================
// QUERIES
// ============================================

/**
 * List insights with filtering and pagination
 * Enforces multi-tenant isolation with businessId
 */
export const list = query({
  args: {
    businessId: v.string(),
    status: v.optional(v.union(
      v.literal("new"),
      v.literal("reviewed"),
      v.literal("dismissed"),
      v.literal("actioned")
    )),
    category: v.optional(v.union(
      v.literal("anomaly"),
      v.literal("compliance"),
      v.literal("deadline"),
      v.literal("cashflow"),
      v.literal("optimization"),
      v.literal("categorization")
    )),
    priority: v.optional(v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { insights: [], totalCount: 0 };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { insights: [], totalCount: 0 };
    }

    // Resolve businessId (supports both Convex ID and legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { insights: [], totalCount: 0 };
    }

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { insights: [], totalCount: 0 };
    }

    const limit = args.limit ?? 50;

    // Query insights for this business using priority index for efficient sorting
    // Single query — replaces the old getPendingCount + getSummary separate queries
    let insights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_business_priority", (q) => q.eq("businessId", business._id.toString()))
      .collect();

    // Filter to current user's insights only (insights are created per-user)
    const userIdStr = user._id.toString();
    insights = insights.filter((i) => i.userId === userIdStr);

    // Filter out expired insights
    const now = Date.now();
    insights = insights.filter((i) => !i.expiresAt || i.expiresAt > now);

    // Compute pending count + summary from the same data (avoids 2 extra queries)
    const newInsights = insights.filter((i) => i.status === "new");
    const pendingCount = {
      count: newInsights.length,
      byCritical: newInsights.filter((i) => i.priority === "critical").length,
      byHigh: newInsights.filter((i) => i.priority === "high").length,
    };

    const byStatus: Record<string, number> = { new: 0, reviewed: 0, dismissed: 0, actioned: 0 };
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const insight of insights) {
      byStatus[insight.status] = (byStatus[insight.status] || 0) + 1;
      byCategory[insight.category] = (byCategory[insight.category] || 0) + 1;
      byPriority[insight.priority] = (byPriority[insight.priority] || 0) + 1;
    }
    const totalResolved = byStatus.dismissed + byStatus.actioned;
    const actionableRate = totalResolved > 0 ? Math.round((byStatus.actioned / totalResolved) * 100) : 0;
    const summary = {
      total: insights.length,
      byStatus,
      byCategory,
      byPriority,
      actionableRate,
    };

    // Apply user-requested filters for the paginated list
    let filteredInsights = insights;
    if (args.status) {
      filteredInsights = filteredInsights.filter((i) => i.status === args.status);
    }
    if (args.category) {
      filteredInsights = filteredInsights.filter((i) => i.category === args.category);
    }
    if (args.priority) {
      filteredInsights = filteredInsights.filter((i) => i.priority === args.priority);
    }

    // Sort by priority (critical first) then by detected time (newest first)
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    filteredInsights.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.detectedAt - a.detectedAt;
    });

    // Apply limit
    const paginatedInsights = filteredInsights.slice(0, limit);

    return {
      insights: paginatedInsights,
      totalCount: filteredInsights.length,
      pendingCount,
      summary,
    };
  },
});

/**
 * Get a single insight by ID
 */
export const getById = query({
  args: {
    insightId: v.id("actionCenterInsights"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    const insight = await ctx.db.get(args.insightId);
    if (!insight) {
      return null;
    }

    // Verify user has access to this insight's business
    const business = await resolveById(ctx.db, "businesses", insight.businessId);
    if (!business) {
      return null;
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    return insight;
  },
});

/**
 * Get count of pending (new) insights for the user
 */
export const getPendingCount = query({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { count: 0, byCritical: 0, byHigh: 0 };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { count: 0, byCritical: 0, byHigh: 0 };
    }

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { count: 0, byCritical: 0, byHigh: 0 };
    }

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { count: 0, byCritical: 0, byHigh: 0 };
    }

    // Query new insights for this business
    const insights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_business_priority", (q) => q.eq("businessId", business._id.toString()))
      .collect();

    // Filter to current user's new insights only (consistent with list query)
    const userIdStr = user._id.toString();
    const newInsights = insights.filter((i) => i.status === "new" && i.userId === userIdStr);

    // Filter out expired
    const now = Date.now();
    const validInsights = newInsights.filter((i) => !i.expiresAt || i.expiresAt > now);

    return {
      count: validInsights.length,
      byCritical: validInsights.filter((i) => i.priority === "critical").length,
      byHigh: validInsights.filter((i) => i.priority === "high").length,
    };
  },
});

/**
 * Get summary statistics for insights
 */
export const getSummary = query({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return null;
    }

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    // Get all insights for this business
    const insights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_business_priority", (q) => q.eq("businessId", business._id.toString()))
      .collect();

    // Filter to current user's insights only (insights are created per-user)
    const userIdStr = user._id.toString();
    const userInsights = insights.filter((i) => i.userId === userIdStr);

    // Filter out expired
    const now = Date.now();
    const validInsights = userInsights.filter((i) => !i.expiresAt || i.expiresAt > now);

    // Calculate statistics
    const byStatus: Record<string, number> = { new: 0, reviewed: 0, dismissed: 0, actioned: 0 };
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };

    for (const insight of validInsights) {
      byStatus[insight.status] = (byStatus[insight.status] || 0) + 1;
      byCategory[insight.category] = (byCategory[insight.category] || 0) + 1;
      byPriority[insight.priority] = (byPriority[insight.priority] || 0) + 1;
    }

    // Calculate actionable rate
    const totalResolved = byStatus.dismissed + byStatus.actioned;
    const actionableRate = totalResolved > 0 ? (byStatus.actioned / totalResolved) * 100 : 0;

    return {
      total: validInsights.length,
      byStatus,
      byCategory,
      byPriority,
      actionableRate: Math.round(actionableRate),
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new insight (internal use by detection algorithms)
 */
export const internalCreate = internalMutation({
  args: {
    userId: v.string(),
    businessId: v.string(),
    category: v.union(
      v.literal("anomaly"),
      v.literal("compliance"),
      v.literal("deadline"),
      v.literal("cashflow"),
      v.literal("optimization"),
      v.literal("categorization")
    ),
    priority: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    title: v.string(),
    description: v.string(),
    affectedEntities: v.array(v.string()),
    recommendedAction: v.string(),
    expiresAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Check for duplicate insights (same category + similar metadata within 24 hours)
    const recentInsights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId)
      )
      .collect();

    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000; // 3-month dedup

    // Exact title dedup (existing behavior)
    const exactDuplicate = recentInsights.some(
      (i) =>
        i.category === args.category &&
        i.title === args.title &&
        i.detectedAt > ninetyDaysAgo
    );

    if (exactDuplicate) {
      console.log(`[ActionCenterInsights] Skipping exact duplicate: ${args.title}`);
      return null;
    }

    // Semantic dedup via Jaccard similarity (for LLM-generated insights)
    const isAIGenerated = (args.metadata as any)?.aiDiscovered === true || (args.metadata as any)?.aiGenerated === true;
    if (isAIGenerated) {
      const JACCARD_THRESHOLD = 0.6;
      const tokenize = (t: string) => {
        const STOP = new Set(["a","an","the","in","of","to","for","with","on","at","by","is","are","and","or","this","that","it","its","may","could"]);
        const tokens = t.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
        return new Set(tokens.filter((w) => !STOP.has(w)));
      };
      const newTokens = tokenize(args.title);

      const semanticDuplicate = recentInsights.some((i) => {
        if (i.detectedAt <= ninetyDaysAgo) return false;
        if (i.status === "dismissed" || i.status === "actioned") return false;
        const existingTokens = tokenize(i.title);
        if (newTokens.size === 0 || existingTokens.size === 0) return false;
        let intersection = 0;
        for (const w of newTokens) { if (existingTokens.has(w)) intersection++; }
        const union = newTokens.size + existingTokens.size - intersection;
        const similarity = union > 0 ? intersection / union : 0;
        return similarity > JACCARD_THRESHOLD;
      });

      if (semanticDuplicate) {
        console.log(`[ActionCenterInsights] Skipping semantic duplicate (Jaccard >0.6): ${args.title}`);
        return null;
      }
    }

    const now = Date.now();
    const insightId = await ctx.db.insert("actionCenterInsights", {
      userId: args.userId,
      businessId: args.businessId,
      category: args.category,
      priority: args.priority,
      status: "new",
      title: args.title,
      description: args.description,
      affectedEntities: args.affectedEntities,
      recommendedAction: args.recommendedAction,
      detectedAt: now,
      expiresAt: args.expiresAt,
      metadata: args.metadata,
    });

    console.log(`[ActionCenterInsights] Created insight ${insightId}: ${args.title} (${args.priority})`);

    // Push proactive chat alert for high/critical insights (031-action-center-push-chat)
    if (args.priority === "critical" || args.priority === "high") {
      // @ts-ignore — Convex type instantiation depth limit
      await ctx.scheduler.runAfter(0, internal.functions.proactiveAlerts.pushToChat, {
        insightId: insightId.toString(),
        userId: args.userId,
        businessId: args.businessId,
        category: args.category,
        priority: args.priority,
        title: args.title,
        description: args.description,
        recommendedAction: args.recommendedAction,
        affectedEntities: args.affectedEntities,
        metadata: args.metadata,
      });
    }

    // Create notifications for finance admins and owners (018-app-email-notif)
    const categoryToType: Record<string, "anomaly" | "compliance" | "insight"> = {
      anomaly: "anomaly",
      compliance: "compliance",
      deadline: "compliance",
      cashflow: "anomaly",
      optimization: "insight",
      categorization: "insight",
    };
    const priorityToSeverity: Record<string, "critical" | "warning" | "info"> = {
      critical: "critical",
      high: "warning",
      medium: "info",
      low: "info",
    };

    // @ts-ignore — Convex type instantiation depth limit (pre-existing, not related to accounting migration)
    await ctx.scheduler.runAfter(0, internal.functions.notifications.createForRole, {
      businessId: args.businessId as Id<"businesses">,
      targetRoles: ["owner", "finance_admin"],
      type: categoryToType[args.category] ?? "insight",
      severity: priorityToSeverity[args.priority] ?? "info",
      title: args.title,
      body: args.description,
      resourceType: "insight",
      resourceId: insightId,
      resourceUrl: `/en/action-center?insight=${insightId}`,
      sourceEvent: `insight_${insightId}`,
    });

    return insightId;
  },
});

/**
 * Update insight status
 */
export const updateStatus = mutation({
  args: {
    insightId: v.id("actionCenterInsights"),
    status: v.union(
      v.literal("reviewed"),
      v.literal("dismissed"),
      v.literal("actioned")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const insight = await ctx.db.get(args.insightId);
    if (!insight) {
      throw new Error("Insight not found");
    }

    // Verify user has access to this insight's business
    const business = await resolveById(ctx.db, "businesses", insight.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized to access this business");
    }

    const now = Date.now();
    const updateData: Record<string, number | string> = { status: args.status };

    switch (args.status) {
      case "reviewed":
        updateData.reviewedAt = now;
        break;
      case "dismissed":
        updateData.dismissedAt = now;
        break;
      case "actioned":
        updateData.actionedAt = now;
        break;
    }

    await ctx.db.patch(args.insightId, updateData);

    console.log(`[ActionCenterInsights] Updated insight ${args.insightId} to status: ${args.status}`);
    return { success: true };
  },
});

/**
 * Batch mark insights as reviewed (for "mark all as read")
 */
export const batchMarkReviewed = mutation({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized to access this business");
    }

    // Get all new insights for this business belonging to current user
    const newInsights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_business_priority", (q) => q.eq("businessId", business._id.toString()))
      .collect();

    const userIdStr = user._id.toString();
    const toUpdate = newInsights.filter((i) => i.status === "new" && i.userId === userIdStr);

    const now = Date.now();
    let updatedCount = 0;

    for (const insight of toUpdate) {
      await ctx.db.patch(insight._id, {
        status: "reviewed",
        reviewedAt: now,
      });
      updatedCount++;
    }

    console.log(`[ActionCenterInsights] Batch marked ${updatedCount} insights as reviewed`);
    return { updatedCount };
  },
});

/**
 * Delete expired insights (called by cron job)
 */
export const deleteExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all insights with expiration dates
    const allInsights = await ctx.db
      .query("actionCenterInsights")
      .collect();

    // Filter to expired ones
    const expiredInsights = allInsights.filter(
      (i) => i.expiresAt && i.expiresAt < now
    );

    let deletedCount = 0;
    for (const insight of expiredInsights) {
      await ctx.db.delete(insight._id);
      deletedCount++;
    }

    if (deletedCount > 0) {
      console.log(`[ActionCenterInsights] Deleted ${deletedCount} expired insights`);
    }

    return { deleted: deletedCount };
  },
});

/**
 * Reset reviewed insights back to "new" for a business.
 * Use when insights were accidentally marked as reviewed (e.g., during UAT testing).
 *
 * Run: npx convex run functions/actionCenterInsights:resetReviewedToNew '{"businessId":"..."}' --prod
 */
export const resetReviewedToNew = internalMutation({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const insights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_business_priority", (q) => q.eq("businessId", args.businessId))
      .collect();

    const reviewed = insights.filter((i) => i.status === "reviewed");
    let resetCount = 0;

    for (const insight of reviewed) {
      await ctx.db.patch(insight._id, { status: "new", reviewedAt: undefined });
      resetCount++;
    }

    console.log(`[ActionCenterInsights] Reset ${resetCount} reviewed insights to new`);
    return { resetCount };
  },
});

/**
 * One-time cleanup: Deduplicate existing insights.
 *
 * Groups by (userId + category + metadata.transactionId) for anomaly insights,
 * and by (userId + category + title) for all others.
 * Keeps the oldest insight per group, deletes the rest.
 *
 * Run via Convex dashboard: npx convex run functions/actionCenterInsights:deduplicateExisting
 */
export const deduplicateExisting = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allInsights = await ctx.db
      .query("actionCenterInsights")
      .collect();

    // Build dedup key for each insight
    const groups: Record<string, typeof allInsights> = {};

    for (const insight of allInsights) {
      let key: string;
      if (insight.category === "anomaly" && (insight.metadata as any)?.transactionId) {
        // For anomaly insights: dedup by user + transactionId
        key = `${insight.userId}::anomaly::${(insight.metadata as any).transactionId}`;
      } else {
        // For other insights: dedup by user + category + title
        key = `${insight.userId}::${insight.category}::${insight.title}`;
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(insight);
    }

    let deletedCount = 0;

    for (const [, insights] of Object.entries(groups)) {
      if (insights.length <= 1) continue;

      // Sort by detectedAt ascending (keep oldest)
      insights.sort((a, b) => a.detectedAt - b.detectedAt);

      // Delete all but the first (oldest)
      for (let i = 1; i < insights.length; i++) {
        await ctx.db.delete(insights[i]._id);
        deletedCount++;
      }
    }

    console.log(
      `[ActionCenterInsights] Deduplication complete: deleted ${deletedCount} duplicates ` +
      `from ${allInsights.length} total insights (${allInsights.length - deletedCount} remaining)`
    );

    return { deleted: deletedCount, remaining: allInsights.length - deletedCount };
  },
});

/**
 * One-time migration: Delete all insights for a business so the improved pipeline can regenerate them.
 *
 * Run: npx convex run functions/actionCenterInsights:resetBusinessInsights '{"businessId":"..."}' --prod
 */
export const resetBusinessInsights = internalMutation({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const insights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_business_priority", (q) => q.eq("businessId", args.businessId))
      .collect();

    let deletedCount = 0;
    for (const insight of insights) {
      await ctx.db.delete(insight._id);
      deletedCount++;
    }

    console.log(`[Migration] Deleted ${deletedCount} insights for business ${args.businessId}`);
    return { deleted: deletedCount };
  },
});

/**
 * DEBUG: List all insights without auth (for CLI testing only)
 */
export const debugListAll = query({
  args: {},
  handler: async (ctx) => {
    const insights = await ctx.db
      .query("actionCenterInsights")
      .collect();

    return {
      total: insights.length,
      insights: insights.map(i => ({
        _id: i._id,
        title: i.title,
        category: i.category,
        priority: i.priority,
        status: i.status,
        businessId: i.businessId,
      })),
    };
  },
});
