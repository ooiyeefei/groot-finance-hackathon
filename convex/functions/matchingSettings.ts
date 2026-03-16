/**
 * Matching Settings Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Business-level matching configuration
 * - Tolerance thresholds for variance detection
 * - PO/GRN number prefix configuration
 * - Auto-approval configuration for AR matching
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";

// Default settings values
const DEFAULTS = {
  quantityTolerancePercent: 10,
  priceTolerancePercent: 5,
  poNumberPrefix: "PO",
  grnNumberPrefix: "GRN",
  autoMatchEnabled: true,
};

const AUTO_APPROVE_DEFAULTS = {
  enableAutoApprove: false,
  autoApproveThreshold: 0.98,
  minLearningCycles: 5,
};

// ============================================
// QUERIES
// ============================================

/**
 * Get matching settings for a business
 * Returns null if no settings configured (caller should use defaults)
 */
export const get = query({
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
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    const settings = await ctx.db
      .query("matching_settings")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
      .first();

    // Return settings or defaults
    if (!settings) {
      return {
        _id: null,
        businessId: args.businessId,
        ...DEFAULTS,
      };
    }

    return settings;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Update matching settings (admin only)
 * Creates settings if they don't exist
 */
export const update = mutation({
  args: {
    businessId: v.id("businesses"),
    quantityTolerancePercent: v.optional(v.number()),
    priceTolerancePercent: v.optional(v.number()),
    poNumberPrefix: v.optional(v.string()),
    grnNumberPrefix: v.optional(v.string()),
    autoMatchEnabled: v.optional(v.boolean()),
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

    // Verify business membership and admin role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (!["owner", "finance_admin"].includes(membership.role)) {
      throw new Error("Only admins can update matching settings");
    }

    // Validate tolerance ranges
    if (args.quantityTolerancePercent !== undefined) {
      if (args.quantityTolerancePercent < 0 || args.quantityTolerancePercent > 100) {
        throw new Error("Quantity tolerance must be between 0 and 100");
      }
    }
    if (args.priceTolerancePercent !== undefined) {
      if (args.priceTolerancePercent < 0 || args.priceTolerancePercent > 100) {
        throw new Error("Price tolerance must be between 0 and 100");
      }
    }

    const existing = await ctx.db
      .query("matching_settings")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
      .first();

    if (existing) {
      // Update existing settings
      const updates: Record<string, any> = { updatedAt: Date.now() };
      if (args.quantityTolerancePercent !== undefined)
        updates.quantityTolerancePercent = args.quantityTolerancePercent;
      if (args.priceTolerancePercent !== undefined)
        updates.priceTolerancePercent = args.priceTolerancePercent;
      if (args.poNumberPrefix !== undefined) updates.poNumberPrefix = args.poNumberPrefix;
      if (args.grnNumberPrefix !== undefined) updates.grnNumberPrefix = args.grnNumberPrefix;
      if (args.autoMatchEnabled !== undefined) updates.autoMatchEnabled = args.autoMatchEnabled;

      await ctx.db.patch(existing._id, updates);
    } else {
      // Create new settings with defaults + overrides
      await ctx.db.insert("matching_settings", {
        businessId: args.businessId,
        quantityTolerancePercent: args.quantityTolerancePercent ?? DEFAULTS.quantityTolerancePercent,
        priceTolerancePercent: args.priceTolerancePercent ?? DEFAULTS.priceTolerancePercent,
        poNumberPrefix: args.poNumberPrefix ?? DEFAULTS.poNumberPrefix,
        grnNumberPrefix: args.grnNumberPrefix ?? DEFAULTS.grnNumberPrefix,
        autoMatchEnabled: args.autoMatchEnabled ?? DEFAULTS.autoMatchEnabled,
        updatedAt: Date.now(),
      });
    }
  },
});

// ============================================
// INTERNAL MUTATIONS
// ============================================

/**
 * Ensure settings exist for a business (creates with defaults if missing)
 * Called internally by other functions that need settings to exist
 */
export const getOrCreateDefaults = internalMutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("matching_settings")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
      .first();

    if (existing) {
      return existing;
    }

    const settingsId = await ctx.db.insert("matching_settings", {
      businessId: args.businessId,
      quantityTolerancePercent: DEFAULTS.quantityTolerancePercent,
      priceTolerancePercent: DEFAULTS.priceTolerancePercent,
      poNumberPrefix: DEFAULTS.poNumberPrefix,
      grnNumberPrefix: DEFAULTS.grnNumberPrefix,
      autoMatchEnabled: DEFAULTS.autoMatchEnabled,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(settingsId);
  },
});

// ============================================
// AUTO-APPROVAL SETTINGS (AR Matching)
// ============================================

/**
 * Get auto-approval settings for a business, returning defaults if none exist.
 */
export const getOrCreateAutoApproval = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return AUTO_APPROVE_DEFAULTS;

    const existing = await ctx.db
      .query("matching_settings")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
      .first();

    if (existing) {
      return {
        enableAutoApprove: existing.enableAutoApprove ?? AUTO_APPROVE_DEFAULTS.enableAutoApprove,
        autoApproveThreshold: existing.autoApproveThreshold ?? AUTO_APPROVE_DEFAULTS.autoApproveThreshold,
        minLearningCycles: existing.minLearningCycles ?? AUTO_APPROVE_DEFAULTS.minLearningCycles,
        autoApproveDisabledReason: existing.autoApproveDisabledReason,
        autoApproveDisabledAt: existing.autoApproveDisabledAt,
      };
    }

    return AUTO_APPROVE_DEFAULTS;
  },
});

/**
 * Update auto-approval settings.
 */
export const updateAutoApproval = mutation({
  args: {
    businessId: v.id("businesses"),
    enableAutoApprove: v.optional(v.boolean()),
    autoApproveThreshold: v.optional(v.number()),
    minLearningCycles: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Validate ranges
    if (args.autoApproveThreshold != null) {
      if (args.autoApproveThreshold < 0.90 || args.autoApproveThreshold > 1.00) {
        throw new Error("Auto-approve threshold must be between 0.90 and 1.00");
      }
    }
    if (args.minLearningCycles != null) {
      if (args.minLearningCycles < 1 || args.minLearningCycles > 50) {
        throw new Error("Minimum learning cycles must be between 1 and 50");
      }
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("matching_settings")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
      .first();

    if (existing) {
      const updates: Record<string, any> = { updatedBy: identity.subject, updatedAt: now };
      if (args.enableAutoApprove != null) updates.enableAutoApprove = args.enableAutoApprove;
      if (args.autoApproveThreshold != null) updates.autoApproveThreshold = args.autoApproveThreshold;
      if (args.minLearningCycles != null) updates.minLearningCycles = args.minLearningCycles;

      // If re-enabling, clear the disabled reason
      if (args.enableAutoApprove === true) {
        updates.autoApproveDisabledReason = undefined;
        updates.autoApproveDisabledAt = undefined;
      }

      await ctx.db.patch(existing._id, updates);
      return { updated: true };
    }

    // Create new settings with defaults + auto-approval overrides
    await ctx.db.insert("matching_settings", {
      businessId: args.businessId,
      enableAutoApprove: args.enableAutoApprove ?? AUTO_APPROVE_DEFAULTS.enableAutoApprove,
      autoApproveThreshold: args.autoApproveThreshold ?? AUTO_APPROVE_DEFAULTS.autoApproveThreshold,
      minLearningCycles: args.minLearningCycles ?? AUTO_APPROVE_DEFAULTS.minLearningCycles,
      updatedBy: identity.subject,
      updatedAt: now,
    });

    return { created: true };
  },
});
