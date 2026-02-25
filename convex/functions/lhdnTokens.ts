/**
 * LHDN Token Cache — Convex Functions
 *
 * Caches LHDN OAuth tokens per tenant business to avoid hitting
 * the token endpoint rate limit (12 RPM). Tokens are valid for 60 minutes.
 */

import { v } from "convex/values";
import { mutation, internalMutation, internalQuery } from "../_generated/server";

// ============================================
// INTERNAL QUERIES
// ============================================

/**
 * Get a cached token for a business (internal use by scheduled functions).
 */
export const getCachedToken = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("lhdn_tokens")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .first();

    if (!cached) return null;

    // Check if token is still valid (with 5-minute buffer)
    const bufferMs = 5 * 60 * 1000;
    if (cached.expiresAt - bufferMs <= Date.now()) {
      return null;
    }

    return {
      accessToken: cached.accessToken,
      expiresAt: cached.expiresAt,
    };
  },
});

// ============================================
// INTERNAL MUTATIONS
// ============================================

/**
 * Store a fresh token in the cache (internal use).
 */
export const storeToken = internalMutation({
  args: {
    businessId: v.id("businesses"),
    tenantTin: v.string(),
    accessToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Delete any existing token for this business
    const existing = await ctx.db
      .query("lhdn_tokens")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    // Store the new token
    await ctx.db.insert("lhdn_tokens", {
      businessId: args.businessId,
      tenantTin: args.tenantTin,
      accessToken: args.accessToken,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
  },
});

/**
 * Delete cached token for a business (e.g., on auth failure).
 */
export const invalidateToken = internalMutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("lhdn_tokens")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
