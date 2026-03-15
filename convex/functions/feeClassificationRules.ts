/**
 * Fee Classification Rules — CRUD for Tier 1 keyword mappings
 *
 * Admin-managed per-platform keyword → GL account code mappings.
 * Used by the fee classifier engine during CSV import.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { DEFAULT_FEE_RULES } from "../lib/feeClassifier";

/**
 * List all active rules for a business, optionally filtered by platform.
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    platform: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { rules: [] };

    let rules;
    if (args.platform) {
      rules = await ctx.db
        .query("fee_classification_rules")
        .withIndex("by_businessId_platform", (q) =>
          q.eq("businessId", args.businessId).eq("platform", args.platform!)
        )
        .collect();
    } else {
      rules = await ctx.db
        .query("fee_classification_rules")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", args.businessId)
        )
        .collect();
    }

    return { rules: rules.filter((r) => !r.deletedAt) };
  },
});

/**
 * Create a new classification rule.
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    platform: v.string(),
    keyword: v.string(),
    accountCode: v.string(),
    accountName: v.string(),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const ruleId = await ctx.db.insert("fee_classification_rules", {
      businessId: args.businessId,
      platform: args.platform,
      keyword: args.keyword.toLowerCase().trim(),
      accountCode: args.accountCode,
      accountName: args.accountName,
      priority: args.priority ?? args.keyword.length,
      isActive: true,
      createdBy: identity.subject,
    });

    return { ruleId };
  },
});

/**
 * Update an existing rule.
 */
export const update = mutation({
  args: {
    ruleId: v.id("fee_classification_rules"),
    keyword: v.optional(v.string()),
    accountCode: v.optional(v.string()),
    accountName: v.optional(v.string()),
    priority: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const { ruleId, ...updates } = args;
    const patch: Record<string, any> = {};

    if (updates.keyword !== undefined) patch.keyword = updates.keyword.toLowerCase().trim();
    if (updates.accountCode !== undefined) patch.accountCode = updates.accountCode;
    if (updates.accountName !== undefined) patch.accountName = updates.accountName;
    if (updates.priority !== undefined) patch.priority = updates.priority;
    if (updates.isActive !== undefined) patch.isActive = updates.isActive;

    await ctx.db.patch(ruleId, patch);
    return { success: true };
  },
});

/**
 * Soft-delete a rule.
 */
export const remove = mutation({
  args: {
    ruleId: v.id("fee_classification_rules"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await ctx.db.patch(args.ruleId, { deletedAt: Date.now() });
    return { success: true };
  },
});

/**
 * Seed default rules for a business (called on first import if no rules exist).
 */
export const seedDefaults = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Check if rules already exist
    const existing = await ctx.db
      .query("fee_classification_rules")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .first();

    if (existing) return { seeded: 0, message: "Rules already exist" };

    let seeded = 0;
    for (const rule of DEFAULT_FEE_RULES) {
      await ctx.db.insert("fee_classification_rules", {
        businessId: args.businessId,
        platform: rule.platform,
        keyword: rule.keyword,
        accountCode: rule.accountCode,
        accountName: rule.accountName,
        priority: rule.keyword.length,
        isActive: true,
        createdBy: identity.subject,
      });
      seeded++;
    }

    return { seeded };
  },
});
