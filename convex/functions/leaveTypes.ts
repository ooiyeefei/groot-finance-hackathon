/**
 * Leave Types Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Leave type CRUD operations
 * - Admin-only configuration
 * - Default leave types seeding
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// ============================================
// QUERIES
// ============================================

/**
 * List leave types for a business
 */
export const list = query({
  args: {
    businessId: v.string(),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return [];

    // Verify user is a member
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    // Get leave types
    let leaveTypes;
    if (args.activeOnly !== false) {
      leaveTypes = await ctx.db
        .query("leave_types")
        .withIndex("by_businessId_isActive", (q) =>
          q.eq("businessId", business._id).eq("isActive", true)
        )
        .collect();
    } else {
      leaveTypes = await ctx.db
        .query("leave_types")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();
    }

    // Sort by sortOrder
    leaveTypes.sort((a, b) => a.sortOrder - b.sortOrder);

    return leaveTypes;
  },
});

/**
 * Get a single leave type by ID
 */
export const getById = query({
  args: {
    id: v.id("leave_types"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const leaveType = await ctx.db.get(args.id);
    if (!leaveType) return null;

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return null;

    // Verify user is a member of the business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", leaveType.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return null;

    return leaveType;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new leave type (admin only)
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
    code: v.string(),
    description: v.optional(v.string()),
    defaultDays: v.number(),
    requiresApproval: v.optional(v.boolean()),
    deductsBalance: v.optional(v.boolean()),
    countryCode: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    // Verify admin permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Only admins can create leave types");
    }

    // Validate name
    if (!args.name || args.name.trim().length === 0) {
      throw new Error("Name is required");
    }

    // Validate code (uppercase alphanumeric)
    const codeRegex = /^[A-Z0-9_]+$/;
    const normalizedCode = args.code.toUpperCase().replace(/\s+/g, "_");
    if (!codeRegex.test(normalizedCode)) {
      throw new Error("Code must be uppercase alphanumeric (e.g., ANNUAL, SICK_LEAVE)");
    }

    // Check code uniqueness
    const existingByCode = await ctx.db
      .query("leave_types")
      .withIndex("by_businessId_code", (q) =>
        q.eq("businessId", args.businessId).eq("code", normalizedCode)
      )
      .first();

    if (existingByCode) {
      throw new Error(`Leave type with code "${normalizedCode}" already exists`);
    }

    // Validate defaultDays
    if (args.defaultDays < 0) {
      throw new Error("Default days cannot be negative");
    }

    // Get next sort order
    const existingTypes = await ctx.db
      .query("leave_types")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const maxSortOrder = existingTypes.reduce(
      (max, t) => Math.max(max, t.sortOrder),
      0
    );

    // Create the leave type
    const leaveTypeId = await ctx.db.insert("leave_types", {
      businessId: args.businessId,
      name: args.name.trim(),
      code: normalizedCode,
      description: args.description?.trim(),
      defaultDays: args.defaultDays,
      requiresApproval: args.requiresApproval ?? true,
      deductsBalance: args.deductsBalance ?? true,
      countryCode: args.countryCode,
      color: args.color ?? "#3B82F6",
      isActive: true,
      sortOrder: maxSortOrder + 1,
      updatedAt: Date.now(),
    });

    return leaveTypeId;
  },
});

/**
 * Update a leave type (admin only)
 */
export const update = mutation({
  args: {
    id: v.id("leave_types"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    defaultDays: v.optional(v.number()),
    requiresApproval: v.optional(v.boolean()),
    deductsBalance: v.optional(v.boolean()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    carryoverCap: v.optional(v.number()),
    carryoverPolicy: v.optional(
      v.union(v.literal("none"), v.literal("cap"), v.literal("unlimited"))
    ),
    prorationEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const leaveType = await ctx.db.get(args.id);
    if (!leaveType) throw new Error("Leave type not found");

    // Verify admin permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", leaveType.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Only admins can update leave types");
    }

    // Validate name if provided
    if (args.name !== undefined && args.name.trim().length === 0) {
      throw new Error("Name cannot be empty");
    }

    // Validate defaultDays if provided
    if (args.defaultDays !== undefined && args.defaultDays < 0) {
      throw new Error("Default days cannot be negative");
    }

    // Build update object
    const updates: Record<string, any> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) updates.name = args.name.trim();
    if (args.description !== undefined) updates.description = args.description?.trim();
    if (args.defaultDays !== undefined) updates.defaultDays = args.defaultDays;
    if (args.requiresApproval !== undefined) updates.requiresApproval = args.requiresApproval;
    if (args.deductsBalance !== undefined) updates.deductsBalance = args.deductsBalance;
    if (args.color !== undefined) updates.color = args.color;
    if (args.sortOrder !== undefined) updates.sortOrder = args.sortOrder;
    if (args.carryoverCap !== undefined) updates.carryoverCap = args.carryoverCap;
    if (args.carryoverPolicy !== undefined) updates.carryoverPolicy = args.carryoverPolicy;
    if (args.prorationEnabled !== undefined) updates.prorationEnabled = args.prorationEnabled;

    await ctx.db.patch(args.id, updates);

    return args.id;
  },
});

/**
 * Toggle leave type active status (admin only)
 */
export const toggleActive = mutation({
  args: {
    id: v.id("leave_types"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const leaveType = await ctx.db.get(args.id);
    if (!leaveType) throw new Error("Leave type not found");

    // Verify admin permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", leaveType.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Only admins can toggle leave type status");
    }

    await ctx.db.patch(args.id, {
      isActive: !leaveType.isActive,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Delete a leave type (admin only, only if not used)
 */
export const remove = mutation({
  args: {
    id: v.id("leave_types"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const leaveType = await ctx.db.get(args.id);
    if (!leaveType) throw new Error("Leave type not found");

    // Verify admin permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", leaveType.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Only admins can delete leave types");
    }

    // Check if any requests use this leave type
    const requestsUsingType = await ctx.db
      .query("leave_requests")
      .withIndex("by_businessId", (q) => q.eq("businessId", leaveType.businessId))
      .collect();

    const hasRequests = requestsUsingType.some(
      (req) => req.leaveTypeId === args.id
    );

    if (hasRequests) {
      throw new Error(
        "Cannot delete leave type that has been used. Deactivate it instead."
      );
    }

    // Check if any balances use this leave type
    const balancesUsingType = await ctx.db
      .query("leave_balances")
      .withIndex("by_businessId", (q) => q.eq("businessId", leaveType.businessId))
      .collect();

    const hasBalances = balancesUsingType.some(
      (bal) => bal.leaveTypeId === args.id
    );

    if (hasBalances) {
      throw new Error(
        "Cannot delete leave type that has balances. Deactivate it instead."
      );
    }

    // Safe to delete
    await ctx.db.delete(args.id);

    return args.id;
  },
});
