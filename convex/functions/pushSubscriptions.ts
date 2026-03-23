/**
 * Push Subscription Management
 *
 * Register and unregister device tokens for push notifications.
 * Tokens are stored per-user per-platform with upsert semantics.
 */

import { v } from "convex/values";
import { query, mutation, action, internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

/**
 * Register a push notification device token.
 * Upserts: if a subscription already exists for the same user+platform+token, reactivate it.
 */
export const register = mutation({
  args: {
    businessId: v.id("businesses"),
    platform: v.union(v.literal("ios"), v.literal("android")),
    deviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    // Check for existing subscription with this token
    const existing = await ctx.db
      .query("push_subscriptions")
      .withIndex("by_deviceToken", (q) => q.eq("deviceToken", args.deviceToken))
      .first();

    const now = Date.now();

    if (existing) {
      // Reactivate if inactive, or update ownership
      await ctx.db.patch(existing._id, {
        userId: user._id,
        businessId: args.businessId,
        isActive: true,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new subscription
    return await ctx.db.insert("push_subscriptions", {
      userId: user._id,
      businessId: args.businessId,
      platform: args.platform,
      deviceToken: args.deviceToken,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Unregister a push notification device token.
 * Sets isActive to false rather than deleting.
 */
export const unregister = mutation({
  args: {
    deviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("push_subscriptions")
      .withIndex("by_deviceToken", (q) => q.eq("deviceToken", args.deviceToken))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        isActive: false,
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});

/**
 * Get all active push subscriptions for a user (internal use only).
 * Used by the push notification sender to find device tokens.
 */
export const getByUserId = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const subscriptions = await ctx.db
      .query("push_subscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    return subscriptions.filter((s) => s.isActive);
  },
});

/**
 * 034-leave-enhance: Public query for fetching active push tokens by user ID string.
 * Callable via Convex HTTP API from the notification route (server-to-server).
 * Returns only active tokens with platform and deviceToken (no sensitive data).
 */
export const getActiveTokensByUserId = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await resolveById(ctx.db, "users", args.userId);
    if (!user) return [];

    const subscriptions = await ctx.db
      .query("push_subscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    return subscriptions
      .filter((s) => s.isActive)
      .map((s) => ({ platform: s.platform, deviceToken: s.deviceToken, isActive: s.isActive }));
  },
});

/**
 * Deactivate a push subscription by device token (internal use).
 * Called when APNs returns 410 Gone (token no longer valid).
 */
/**
 * 034-leave-enhance: FR-011 Track push delivery failure.
 * Increments failureCount; deactivates token after maxFailures consecutive failures.
 * Called from notification API route when Lambda reports per-token errors.
 */
export const trackFailure = internalMutation({
  args: {
    deviceToken: v.string(),
    maxFailures: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("push_subscriptions")
      .withIndex("by_deviceToken", (q) => q.eq("deviceToken", args.deviceToken))
      .first();

    if (!existing || !existing.isActive) return;

    const newCount = ((existing as any).failureCount ?? 0) + 1;

    if (newCount >= args.maxFailures) {
      await ctx.db.patch(existing._id, {
        isActive: false,
        failureCount: newCount,
        lastFailureAt: Date.now(),
        updatedAt: Date.now(),
      });
      console.log(`[Push] Token deactivated after ${newCount} failures: ${args.deviceToken.substring(0, 10)}...`);
    } else {
      await ctx.db.patch(existing._id, {
        failureCount: newCount,
        lastFailureAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

export const deactivateByToken = internalMutation({
  args: {
    deviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("push_subscriptions")
      .withIndex("by_deviceToken", (q) => q.eq("deviceToken", args.deviceToken))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        isActive: false,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * 034-leave-enhance: Public action to track push delivery failures.
 * Callable via Convex HTTP API from the notification route.
 * Wraps the internalMutation trackFailure for security.
 */
export const trackPushFailures = action({
  args: {
    failures: v.array(v.object({
      deviceToken: v.string(),
      maxFailures: v.number(),
    })),
  },
  handler: async (ctx, args): Promise<{ tracked: number }> => {
    for (const failure of args.failures) {
      await ctx.runMutation(internal.functions.pushSubscriptions.trackFailure, {
        deviceToken: failure.deviceToken,
        maxFailures: failure.maxFailures,
      });
    }
    return { tracked: args.failures.length };
  },
});
