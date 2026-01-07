/**
 * Email Convex Functions
 *
 * Queries and mutations for email preferences.
 * Used by Lambda functions for preference checks.
 *
 * NOTE: Email suppressions are handled natively by AWS SES Account-Level Suppression List.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

// ============================================
// QUERIES
// ============================================

/**
 * Get all memberships for a user (no auth required - use from authenticated API routes)
 *
 * This is designed for use by Next.js API routes that have already verified
 * Clerk authentication. It returns all memberships for a given user ID.
 */
export const getMembershipsForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    return memberships;
  },
});

/**
 * Get user email preferences
 *
 * Reads from users.emailPreferences field (simpler, no JOIN needed).
 * Returns default preferences if none are set for the user.
 */
export const getEmailPreferences = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new Error(`User not found: ${args.userId}`);
    }

    // Return preferences from user record, with defaults
    const prefs = user.emailPreferences;
    return {
      userId: args.userId,
      marketingEnabled: prefs?.marketingEnabled ?? true,
      onboardingTipsEnabled: prefs?.onboardingTipsEnabled ?? true,
      productUpdatesEnabled: prefs?.productUpdatesEnabled ?? true,
      globalUnsubscribe: prefs?.globalUnsubscribe ?? false,
      unsubscribedAt: prefs?.unsubscribedAt,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Update email preferences for a user
 *
 * Updates the users.emailPreferences field directly (no separate table).
 */
export const updateEmailPreferences = mutation({
  args: {
    userId: v.id("users"),
    marketingEnabled: v.optional(v.boolean()),
    onboardingTipsEnabled: v.optional(v.boolean()),
    productUpdatesEnabled: v.optional(v.boolean()),
    globalUnsubscribe: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, ...updates } = args;

    // Get current user
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const now = Date.now();
    const currentPrefs = user.emailPreferences ?? {};

    // Build updated preferences
    const newPrefs: Record<string, unknown> = {
      marketingEnabled: updates.marketingEnabled ?? currentPrefs.marketingEnabled ?? true,
      onboardingTipsEnabled: updates.onboardingTipsEnabled ?? currentPrefs.onboardingTipsEnabled ?? true,
      productUpdatesEnabled: updates.productUpdatesEnabled ?? currentPrefs.productUpdatesEnabled ?? true,
      globalUnsubscribe: updates.globalUnsubscribe ?? currentPrefs.globalUnsubscribe ?? false,
    };

    // Track global unsubscribe timestamp
    if (updates.globalUnsubscribe === true && !currentPrefs.globalUnsubscribe) {
      newPrefs.unsubscribedAt = now;
    } else if (updates.globalUnsubscribe === false) {
      newPrefs.unsubscribedAt = undefined;
    } else {
      newPrefs.unsubscribedAt = currentPrefs.unsubscribedAt;
    }

    // Update user record
    await ctx.db.patch(userId, {
      emailPreferences: newPrefs,
      updatedAt: now,
    });

    return userId;
  },
});

/**
 * Get or create email preferences for a user
 *
 * Returns preferences from users.emailPreferences, creating defaults if needed.
 */
export const getOrCreateEmailPreferences = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new Error(`User not found: ${args.userId}`);
    }

    // If preferences already exist, return them
    if (user.emailPreferences) {
      return {
        userId: args.userId,
        marketingEnabled: user.emailPreferences.marketingEnabled ?? true,
        onboardingTipsEnabled: user.emailPreferences.onboardingTipsEnabled ?? true,
        productUpdatesEnabled: user.emailPreferences.productUpdatesEnabled ?? true,
        globalUnsubscribe: user.emailPreferences.globalUnsubscribe ?? false,
        unsubscribedAt: user.emailPreferences.unsubscribedAt,
      };
    }

    // Initialize with defaults
    const defaultPrefs = {
      marketingEnabled: true,
      onboardingTipsEnabled: true,
      productUpdatesEnabled: true,
      globalUnsubscribe: false,
    };

    await ctx.db.patch(args.userId, {
      emailPreferences: defaultPrefs,
      updatedAt: Date.now(),
    });

    return {
      userId: args.userId,
      ...defaultPrefs,
    };
  },
});

