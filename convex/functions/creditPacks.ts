/**
 * Credit Pack Functions - Convex queries and mutations
 *
 * Manages credit pack lifecycle:
 * - Purchase (createFromPurchase via Stripe webhook)
 * - Query (getActivePacks, getActiveCredits)
 * - Consume (consumeCredit with FIFO ordering)
 * - Expire (expireDaily via daily cron)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";

// ============================================
// QUERIES
// ============================================

/**
 * Get all active credit packs for a business, sorted by purchasedAt ascending (FIFO order)
 */
export const getActivePacks = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    const packs = await ctx.db
      .query("credit_packs")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", args.businessId).eq("status", "active")
      )
      .collect();

    // Sort by purchasedAt ascending for FIFO
    packs.sort((a, b) => a.purchasedAt - b.purchasedAt);

    return packs;
  },
});

/**
 * Get active credits for a specific pack type
 */
export const getActiveCredits = query({
  args: {
    businessId: v.id("businesses"),
    packType: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { totalRemaining: 0, packs: [] };

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return { totalRemaining: 0, packs: [] };

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { totalRemaining: 0, packs: [] };
    }

    const packs = await ctx.db
      .query("credit_packs")
      .withIndex("by_businessId_packType", (q) =>
        q.eq("businessId", args.businessId).eq("packType", args.packType)
      )
      .collect();

    const activePacks = packs
      .filter((p) => p.status === "active")
      .sort((a, b) => a.purchasedAt - b.purchasedAt);

    const totalRemaining = activePacks.reduce(
      (sum, p) => sum + p.creditsRemaining,
      0
    );

    return {
      totalRemaining,
      packs: activePacks.map((p) => ({
        id: p._id,
        creditsRemaining: p.creditsRemaining,
        expiresAt: p.expiresAt,
      })),
    };
  },
});

// ============================================
// INTERNAL MUTATIONS
// ============================================

/**
 * Consume a credit from the oldest active pack (FIFO).
 * Marks pack as "depleted" when creditsRemaining reaches 0.
 */
export const consumeCredit = internalMutation({
  args: {
    businessId: v.id("businesses"),
    packType: v.string(),
    credits: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const creditsToConsume = args.credits ?? 1;

    // Find oldest active pack of the given type
    const packs = await ctx.db
      .query("credit_packs")
      .withIndex("by_businessId_packType", (q) =>
        q.eq("businessId", args.businessId).eq("packType", args.packType)
      )
      .collect();

    const activePacks = packs
      .filter((p) => p.status === "active" && p.creditsRemaining > 0)
      .sort((a, b) => a.purchasedAt - b.purchasedAt);

    if (activePacks.length === 0) {
      return { consumed: false, packId: null, remaining: 0 };
    }

    const pack = activePacks[0];
    const newCreditsUsed = pack.creditsUsed + creditsToConsume;
    const newCreditsRemaining = Math.max(0, pack.creditsRemaining - creditsToConsume);
    const newStatus = newCreditsRemaining === 0 ? "depleted" : "active";

    await ctx.db.patch(pack._id, {
      creditsUsed: newCreditsUsed,
      creditsRemaining: newCreditsRemaining,
      status: newStatus,
    });

    return {
      consumed: true,
      packId: pack._id,
      remaining: newCreditsRemaining,
    };
  },
});

/**
 * Create a credit pack from a Stripe purchase.
 * Sets expiresAt to purchasedAt + 90 days.
 */
export const createFromPurchase = internalMutation({
  args: {
    businessId: v.id("businesses"),
    packType: v.string(),
    packName: v.string(),
    totalCredits: v.number(),
    stripePaymentIntentId: v.optional(v.string()),
    stripeSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

    const packId = await ctx.db.insert("credit_packs", {
      businessId: args.businessId,
      packType: args.packType,
      packName: args.packName,
      totalCredits: args.totalCredits,
      creditsUsed: 0,
      creditsRemaining: args.totalCredits,
      purchasedAt: now,
      expiresAt: now + NINETY_DAYS_MS,
      status: "active",
      stripePaymentIntentId: args.stripePaymentIntentId,
      stripeSessionId: args.stripeSessionId,
    });

    return packId;
  },
});

/**
 * Create a credit pack from webhook (public mutation for HTTP client).
 * Used by Stripe webhook handler which can't call internal mutations.
 */
export const createFromWebhook = mutation({
  args: {
    businessId: v.id("businesses"),
    packType: v.string(),
    packName: v.string(),
    totalCredits: v.number(),
    stripePaymentIntentId: v.optional(v.string()),
    stripeSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // No auth check — webhook handler verifies Stripe signature
    // and idempotency before calling this
    const now = Date.now();
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

    const packId = await ctx.db.insert("credit_packs", {
      businessId: args.businessId,
      packType: args.packType,
      packName: args.packName,
      totalCredits: args.totalCredits,
      creditsUsed: 0,
      creditsRemaining: args.totalCredits,
      purchasedAt: now,
      expiresAt: now + NINETY_DAYS_MS,
      status: "active",
      stripePaymentIntentId: args.stripePaymentIntentId,
      stripeSessionId: args.stripeSessionId,
    });

    return packId;
  },
});

/**
 * Daily cron: expire active packs where expiresAt <= now.
 */
export const expireDaily = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    // Query active packs that have passed their expiry
    const expiredPacks = await ctx.db
      .query("credit_packs")
      .withIndex("by_status_expiresAt", (q) =>
        q.eq("status", "active").lte("expiresAt", now)
      )
      .collect();

    for (const pack of expiredPacks) {
      await ctx.db.patch(pack._id, { status: "expired" });
    }

    return { expired: expiredPacks.length };
  },
});
