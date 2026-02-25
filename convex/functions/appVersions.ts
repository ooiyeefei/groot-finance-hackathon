/**
 * App Version Management
 *
 * Stores minimum and latest app versions per platform.
 * Used by the update checker to determine if force/soft update is needed.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";

/**
 * Get the app version configuration for a platform.
 */
export const getAppVersion = query({
  args: {
    platform: v.union(v.literal("ios"), v.literal("android")),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("app_versions")
      .withIndex("by_platform", (q) => q.eq("platform", args.platform))
      .first();

    if (!record) {
      // Default: no update required
      return {
        platform: args.platform,
        minimumVersion: "1.0.0",
        latestVersion: "1.0.0",
        forceUpdateMessage: "A critical update is required. Please update to continue using Groot Finance.",
        softUpdateMessage: "A new version of Groot Finance is available.",
      };
    }

    return record;
  },
});

/**
 * Update the app version configuration (admin only).
 */
export const updateAppVersion = mutation({
  args: {
    platform: v.union(v.literal("ios"), v.literal("android")),
    minimumVersion: v.string(),
    latestVersion: v.string(),
    forceUpdateMessage: v.optional(v.string()),
    softUpdateMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const existing = await ctx.db
      .query("app_versions")
      .withIndex("by_platform", (q) => q.eq("platform", args.platform))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        minimumVersion: args.minimumVersion,
        latestVersion: args.latestVersion,
        forceUpdateMessage: args.forceUpdateMessage ?? existing.forceUpdateMessage,
        softUpdateMessage: args.softUpdateMessage ?? existing.softUpdateMessage,
        updatedAt: now,
        updatedBy: user._id,
      });
      return existing._id;
    }

    return await ctx.db.insert("app_versions", {
      platform: args.platform,
      minimumVersion: args.minimumVersion,
      latestVersion: args.latestVersion,
      forceUpdateMessage: args.forceUpdateMessage ?? "A critical update is required. Please update to continue using Groot Finance.",
      softUpdateMessage: args.softUpdateMessage ?? "A new version of Groot Finance is available.",
      updatedAt: now,
      updatedBy: user._id,
    });
  },
});
