import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

/**
 * List all overtime rules for a business
 * Requires Manager+ role (owner, finance_admin, or manager)
 */
export const list = query({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    // Resolve business (supports both Convex ID and legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) throw new Error("Business not found");

    // Check membership and role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member");
    }

    // Check Manager+ role
    if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
      throw new Error("Insufficient permissions. Manager role or higher required");
    }

    // Return all active overtime rules for the business
    const rules = await ctx.db
      .query("overtime_rules")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();
    return rules.filter((r) => r.isActive !== false);
  },
});

/**
 * Create a new overtime rule
 * Requires Owner or Finance Admin role
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
    calculationBasis: v.union(v.literal("daily"), v.literal("weekly"), v.literal("both")),
    dailyThresholdHours: v.optional(v.number()),
    weeklyThresholdHours: v.optional(v.number()),
    requiresPreApproval: v.boolean(),
    rateTiers: v.array(
      v.object({
        label: v.string(),
        multiplier: v.number(),
        applicableOn: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    // Check membership and role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member");
    }

    // Check Owner/Finance Admin role
    if (!["owner", "finance_admin"].includes(membership.role)) {
      throw new Error("Insufficient permissions. Owner or Finance Admin role required");
    }

    // Validate at least one rate tier
    if (!args.rateTiers || args.rateTiers.length === 0) {
      throw new Error("At least one rate tier is required");
    }

    // Validate threshold hours based on calculation basis
    if ((args.calculationBasis === "daily" || args.calculationBasis === "both") &&
        (args.dailyThresholdHours === undefined || args.dailyThresholdHours === null)) {
      throw new Error("Daily threshold hours required for daily or both calculation basis");
    }

    if ((args.calculationBasis === "weekly" || args.calculationBasis === "both") &&
        (args.weeklyThresholdHours === undefined || args.weeklyThresholdHours === null)) {
      throw new Error("Weekly threshold hours required for weekly or both calculation basis");
    }

    // Create the overtime rule
    const now = Date.now();

    return await ctx.db.insert("overtime_rules", {
      businessId: args.businessId,
      name: args.name,
      calculationBasis: args.calculationBasis,
      dailyThresholdHours: args.dailyThresholdHours,
      weeklyThresholdHours: args.weeklyThresholdHours,
      requiresPreApproval: args.requiresPreApproval,
      rateTiers: args.rateTiers,
      isActive: true,
      updatedAt: now,
    });
  },
});

/**
 * Update an existing overtime rule
 * Requires Owner or Finance Admin role in the rule's business
 */
export const update = mutation({
  args: {
    id: v.id("overtime_rules"),
    name: v.optional(v.string()),
    calculationBasis: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("both"))),
    dailyThresholdHours: v.optional(v.number()),
    weeklyThresholdHours: v.optional(v.number()),
    requiresPreApproval: v.optional(v.boolean()),
    rateTiers: v.optional(
      v.array(
        v.object({
          label: v.string(),
          multiplier: v.number(),
          applicableOn: v.string(),
        })
      )
    ),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    // Get the overtime rule to find its business
    const overtimeRule = await ctx.db.get(args.id);
    if (!overtimeRule) throw new Error("Overtime rule not found");

    // Check membership and role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", overtimeRule.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member");
    }

    // Check Owner/Finance Admin role
    if (!["owner", "finance_admin"].includes(membership.role)) {
      throw new Error("Insufficient permissions. Owner or Finance Admin role required");
    }

    // Validate rate tiers if provided
    if (args.rateTiers !== undefined && args.rateTiers.length === 0) {
      throw new Error("At least one rate tier is required");
    }

    // If calculationBasis is being updated, validate threshold hours
    if (args.calculationBasis !== undefined) {
      const newBasis = args.calculationBasis;
      const dailyHours = args.dailyThresholdHours ?? overtimeRule.dailyThresholdHours;
      const weeklyHours = args.weeklyThresholdHours ?? overtimeRule.weeklyThresholdHours;

      if ((newBasis === "daily" || newBasis === "both") &&
          (dailyHours === undefined || dailyHours === null)) {
        throw new Error("Daily threshold hours required for daily or both calculation basis");
      }

      if ((newBasis === "weekly" || newBasis === "both") &&
          (weeklyHours === undefined || weeklyHours === null)) {
        throw new Error("Weekly threshold hours required for weekly or both calculation basis");
      }
    }

    // Build update object with only provided fields
    const updates: any = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.calculationBasis !== undefined) updates.calculationBasis = args.calculationBasis;
    if (args.dailyThresholdHours !== undefined) updates.dailyThresholdHours = args.dailyThresholdHours;
    if (args.weeklyThresholdHours !== undefined) updates.weeklyThresholdHours = args.weeklyThresholdHours;
    if (args.requiresPreApproval !== undefined) updates.requiresPreApproval = args.requiresPreApproval;
    if (args.rateTiers !== undefined) updates.rateTiers = args.rateTiers;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    // Update the overtime rule
    await ctx.db.patch(args.id, updates);

    return args.id;
  },
});