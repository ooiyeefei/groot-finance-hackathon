/**
 * Push Subscription Management
 *
 * Register and unregister device tokens for push notifications.
 * Tokens are stored per-user per-platform with upsert semantics.
 */

import { v } from "convex/values";
import { mutation, internalQuery, internalMutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";

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
 * Deactivate a push subscription by device token (internal use).
 * Called when APNs returns 410 Gone (token no longer valid).
 */
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
