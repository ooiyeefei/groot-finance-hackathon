/**
 * AI Message Usage Functions - Convex queries and mutations
 *
 * Tracks AI chat message consumption per-business per-month.
 * Follows the ocrUsage.ts pattern with credit pack fallback.
 *
 * Plan limits:
 * - Trial: 300 (Pro limits)
 * - Starter: 30
 * - Pro: 300
 * - Enterprise: -1 (unlimited)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId } from "../lib/resolvers";

/**
 * Resolve AI message limit from plan name.
 */
function getAiMessageLimit(planName: string | undefined): number {
  switch (planName) {
    case "starter":
      return 30;
    case "pro":
      return 300;
    case "enterprise":
      return -1;
    default:
      return 30; // Unknown plans get Starter limits
  }
}

// ============================================
// QUERIES
// ============================================

/**
 * Get current month's AI message usage for a business
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
      .query("ai_message_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", currentMonth)
      )
      .first();

    if (!usage) {
      const business = await ctx.db.get(args.businessId);
      const planLimit = getAiMessageLimit(business?.planName);

      return {
        month: currentMonth,
        messagesUsed: 0,
        planLimit,
        remaining: planLimit === -1 ? -1 : planLimit,
        percentUsed: 0,
      };
    }

    const remaining =
      usage.planLimit === -1 ? -1 : Math.max(0, usage.planLimit - usage.messagesUsed);
    const percentUsed =
      usage.planLimit > 0
        ? Math.round((usage.messagesUsed / usage.planLimit) * 100)
        : 0;

    return {
      month: usage.month,
      messagesUsed: usage.messagesUsed,
      planLimit: usage.planLimit,
      remaining,
      percentUsed,
    };
  },
});

/**
 * Check if business has remaining AI credits (plan + credit packs)
 */
export const hasCredits = query({
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

    // Check plan allocation
    const business = await ctx.db.get(args.businessId);
    const planLimit = getAiMessageLimit(business?.planName);

    if (planLimit === -1) return true; // Unlimited

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const usage = await ctx.db
      .query("ai_message_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", currentMonth)
      )
      .first();

    if (!usage || usage.messagesUsed < planLimit) return true;

    // Plan exhausted — check credit packs
    const activePacks = await ctx.db
      .query("credit_packs")
      .withIndex("by_businessId_packType", (q) =>
        q.eq("businessId", args.businessId).eq("packType", "ai_credits")
      )
      .collect();

    return activePacks.some(
      (p) => p.status === "active" && p.creditsRemaining > 0
    );
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Record AI message usage (authenticated, from API route)
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
      .query("ai_message_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", currentMonth)
      )
      .first();

    if (!usage) {
      const business = await ctx.db.get(args.businessId);
      const planLimit = getAiMessageLimit(business?.planName);

      const usageId = await ctx.db.insert("ai_message_usage", {
        businessId: args.businessId,
        month: currentMonth,
        messagesUsed: 1,
        planLimit,
        updatedAt: Date.now(),
      });

      return {
        usageId,
        messagesUsed: 1,
        remaining: planLimit === -1 ? -1 : planLimit - 1,
      };
    }

    const newMessagesUsed = usage.messagesUsed + 1;
    await ctx.db.patch(usage._id, {
      messagesUsed: newMessagesUsed,
      updatedAt: Date.now(),
    });

    return {
      usageId: usage._id,
      messagesUsed: newMessagesUsed,
      remaining:
        usage.planLimit === -1
          ? -1
          : Math.max(0, usage.planLimit - newMessagesUsed),
    };
  },
});

/**
 * Pre-flight check-and-record (authenticated, called from API routes).
 * Wraps the internal checkAndRecord with auth verification.
 */
export const checkAndRecordFromApi = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args): Promise<{ allowed: boolean; source: "plan" | "credit_pack" | "unlimited"; remaining: number }> => {
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

    // Delegate to the internal check-and-record logic
    return await ctx.runMutation(internal.functions.aiMessageUsage.checkAndRecord, {
      businessId: args.businessId,
    });
  },
});

// ============================================
// INTERNAL MUTATIONS (for pre-flight checks)
// ============================================

/**
 * Atomic check-and-record: verifies allocation and increments usage.
 *
 * 1. Get or create monthly record with plan limit
 * 2. If under plan limit or unlimited → increment and return allowed
 * 3. If plan exhausted → try credit pack consumption (FIFO)
 * 4. If credit consumed → return allowed with source "credit_pack"
 * 5. Otherwise → return not allowed
 */
export const checkAndRecord = internalMutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args): Promise<{ allowed: boolean; source: "plan" | "credit_pack" | "unlimited"; remaining: number }> => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Get business for plan resolution
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      return { allowed: false, source: "plan" as const, remaining: 0 };
    }

    const planLimit = getAiMessageLimit(business.planName);

    // Get or create monthly usage record
    let usage = await ctx.db
      .query("ai_message_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", args.businessId).eq("month", currentMonth)
      )
      .first();

    if (!usage) {
      const usageId = await ctx.db.insert("ai_message_usage", {
        businessId: args.businessId,
        month: currentMonth,
        messagesUsed: 1,
        planLimit,
        updatedAt: Date.now(),
      });

      const source = planLimit === -1 ? ("unlimited" as const) : ("plan" as const);
      return {
        allowed: true,
        source,
        remaining: planLimit === -1 ? -1 : planLimit - 1,
      };
    }

    // Unlimited plan — always allow
    if (planLimit === -1) {
      await ctx.db.patch(usage._id, {
        messagesUsed: usage.messagesUsed + 1,
        updatedAt: Date.now(),
      });

      return { allowed: true, source: "unlimited" as const, remaining: -1 };
    }

    // Under plan limit — allow from plan
    if (usage.messagesUsed < planLimit) {
      const newMessagesUsed = usage.messagesUsed + 1;
      await ctx.db.patch(usage._id, {
        messagesUsed: newMessagesUsed,
        updatedAt: Date.now(),
      });

      return {
        allowed: true,
        source: "plan" as const,
        remaining: planLimit - newMessagesUsed,
      };
    }

    // Plan exhausted — try credit pack fallback (FIFO)
    const result = await ctx.runMutation(internal.functions.creditPacks.consumeCredit, {
      businessId: args.businessId,
      packType: "ai_credits",
    });

    if (result.consumed) {
      // Record the usage even though it came from a credit pack
      await ctx.db.patch(usage._id, {
        messagesUsed: usage.messagesUsed + 1,
        updatedAt: Date.now(),
      });

      return {
        allowed: true,
        source: "credit_pack" as const,
        remaining: result.remaining,
      };
    }

    // No allocation available
    return { allowed: false, source: "plan" as const, remaining: 0 };
  },
});
