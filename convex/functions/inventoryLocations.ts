/**
 * Inventory Location Functions - Convex queries and mutations
 *
 * CRUD operations for inventory locations (warehouses, offices, retail, etc.).
 * Each business can have multiple locations with exactly one default.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";

async function requireFinanceAdmin(
  ctx: { db: import("../_generated/server").DatabaseReader; auth: { getUserIdentity: () => Promise<{ subject: string } | null> } },
  businessId: import("../_generated/dataModel").Id<"businesses">
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await resolveUserByClerkId(ctx.db, identity.subject);
  if (!user) throw new Error("User not found");

  const membership = await ctx.db
    .query("business_memberships")
    .withIndex("by_userId_businessId", (q) =>
      q.eq("userId", user._id).eq("businessId", businessId)
    )
    .first();

  if (!membership || membership.status !== "active") {
    throw new Error("Not a member of this business");
  }

  if (!["owner", "finance_admin"].includes(membership.role)) {
    throw new Error("Not authorized: finance admin required");
  }

  return { user, membership };
}

// ============================================
// QUERIES
// ============================================

export const list = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const locations = await ctx.db
      .query("inventory_locations")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", args.businessId).eq("status", "active")
      )
      .collect();

    return locations.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listAll = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const locations = await ctx.db
      .query("inventory_locations")
      .withIndex("by_businessId", (q) =>
        q.eq("businessId", args.businessId)
      )
      .collect();

    return locations
      .filter((l) => !l.deletedAt)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getDefault = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inventory_locations")
      .withIndex("by_businessId_isDefault", (q) =>
        q.eq("businessId", args.businessId).eq("isDefault", true)
      )
      .first();
  },
});

// ============================================
// MUTATIONS
// ============================================

export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
    address: v.optional(v.string()),
    type: v.union(
      v.literal("warehouse"),
      v.literal("office"),
      v.literal("retail"),
      v.literal("other")
    ),
    isDefault: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    // Check if this is the first location — force default
    const existing = await ctx.db
      .query("inventory_locations")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", args.businessId).eq("status", "active")
      )
      .first();

    const isDefault = !existing ? true : args.isDefault;

    // If setting as default, unset previous default
    if (isDefault) {
      const currentDefault = await ctx.db
        .query("inventory_locations")
        .withIndex("by_businessId_isDefault", (q) =>
          q.eq("businessId", args.businessId).eq("isDefault", true)
        )
        .first();

      if (currentDefault) {
        await ctx.db.patch(currentDefault._id, { isDefault: false });
      }
    }

    return await ctx.db.insert("inventory_locations", {
      businessId: args.businessId,
      name: args.name,
      address: args.address,
      type: args.type,
      isDefault,
      status: "active",
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("inventory_locations"),
    businessId: v.id("businesses"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("warehouse"),
        v.literal("office"),
        v.literal("retail"),
        v.literal("other")
      )
    ),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const location = await ctx.db.get(args.id);
    if (!location || location.businessId !== args.businessId) {
      throw new Error("Location not found");
    }

    // If setting as default, unset previous default
    if (args.isDefault === true && !location.isDefault) {
      const currentDefault = await ctx.db
        .query("inventory_locations")
        .withIndex("by_businessId_isDefault", (q) =>
          q.eq("businessId", args.businessId).eq("isDefault", true)
        )
        .first();

      if (currentDefault && currentDefault._id !== args.id) {
        await ctx.db.patch(currentDefault._id, { isDefault: false });
      }
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.address !== undefined) updates.address = args.address;
    if (args.type !== undefined) updates.type = args.type;
    if (args.isDefault !== undefined) updates.isDefault = args.isDefault;

    await ctx.db.patch(args.id, updates);
  },
});

export const deactivate = mutation({
  args: {
    id: v.id("inventory_locations"),
    businessId: v.id("businesses"),
    confirmWithStock: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const location = await ctx.db.get(args.id);
    if (!location || location.businessId !== args.businessId) {
      throw new Error("Location not found");
    }

    // Check if this is the last active location
    const activeLocations = await ctx.db
      .query("inventory_locations")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", args.businessId).eq("status", "active")
      )
      .collect();

    if (activeLocations.length <= 1) {
      return {
        success: false,
        error: "Cannot deactivate the last active location. At least one active location is required for inventory tracking.",
      };
    }

    // Check for stock at this location
    if (!args.confirmWithStock) {
      const stockAtLocation = await ctx.db
        .query("inventory_stock")
        .withIndex("by_locationId", (q) => q.eq("locationId", args.id))
        .collect();

      const hasStock = stockAtLocation.some((s) => s.quantityOnHand !== 0);
      if (hasStock) {
        const itemCount = stockAtLocation.filter(
          (s) => s.quantityOnHand !== 0
        ).length;
        return {
          success: false,
          error: `This location has ${itemCount} item(s) with stock. Please confirm to proceed or transfer stock first.`,
        };
      }
    }

    await ctx.db.patch(args.id, {
      status: "inactive",
      updatedAt: Date.now(),
    });

    // If this was default, set another active location as default
    if (location.isDefault) {
      const newDefault = activeLocations.find(
        (l) => l._id !== args.id && l.status === "active"
      );
      if (newDefault) {
        await ctx.db.patch(newDefault._id, { isDefault: true });
      }
    }

    return { success: true };
  },
});

export const reactivate = mutation({
  args: {
    id: v.id("inventory_locations"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const location = await ctx.db.get(args.id);
    if (!location || location.businessId !== args.businessId) {
      throw new Error("Location not found");
    }

    await ctx.db.patch(args.id, {
      status: "active",
      updatedAt: Date.now(),
    });
  },
});
