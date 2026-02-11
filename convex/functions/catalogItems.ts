/**
 * Catalog Item Functions - Convex queries and mutations
 *
 * CRUD operations for the product/service catalog.
 * Catalog items can be used to pre-populate invoice line items.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";
import { catalogItemStatusValidator } from "../lib/validators";

// ============================================
// HELPER: Finance admin check
// ============================================
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

  if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
    throw new Error("Not authorized: finance admin required");
  }

  return { user, membership };
}

// ============================================
// QUERIES
// ============================================

/**
 * List catalog items for a business
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(v.string()),
    category: v.optional(v.string()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    let items;
    if (args.status) {
      items = await ctx.db
        .query("catalog_items")
        .withIndex("by_businessId_status", (q) =>
          q.eq("businessId", args.businessId).eq("status", args.status as never)
        )
        .collect();
    } else {
      items = await ctx.db
        .query("catalog_items")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", args.businessId)
        )
        .collect();
    }

    // Filter soft-deleted
    items = items.filter((item) => !item.deletedAt);

    // Category filter
    if (args.category) {
      items = items.filter((item) => item.category === args.category);
    }

    // Search filter
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      items = items.filter((item) =>
        item.name.toLowerCase().includes(searchLower) ||
        (item.description?.toLowerCase().includes(searchLower)) ||
        (item.sku?.toLowerCase().includes(searchLower))
      );
    }

    // Sort by name
    items.sort((a, b) => a.name.localeCompare(b.name));

    // Limit
    if (args.limit) {
      items = items.slice(0, args.limit);
    }

    return items;
  },
});

/**
 * Search catalog items by name (autocomplete)
 */
export const searchByName = query({
  args: {
    businessId: v.id("businesses"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];

    const items = await ctx.db
      .query("catalog_items")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", args.businessId).eq("status", "active")
      )
      .collect();

    const queryLower = args.query.toLowerCase();
    const filtered = items
      .filter((item) =>
        !item.deletedAt &&
        (item.name.toLowerCase().includes(queryLower) ||
         (item.sku?.toLowerCase().includes(queryLower)))
      )
      .slice(0, args.limit ?? 10);

    return filtered;
  },
});

/**
 * Get a catalog item by ID
 */
export const getById = query({
  args: {
    id: v.id("catalog_items"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const item = await ctx.db.get(args.id);
    if (!item || item.businessId !== args.businessId || item.deletedAt) {
      return null;
    }

    return item;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a catalog item
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
    description: v.optional(v.string()),
    sku: v.optional(v.string()),
    unitPrice: v.number(),
    currency: v.string(),
    unitMeasurement: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const itemId = await ctx.db.insert("catalog_items", {
      businessId: args.businessId,
      name: args.name,
      description: args.description,
      sku: args.sku,
      unitPrice: args.unitPrice,
      currency: args.currency,
      unitMeasurement: args.unitMeasurement,
      taxRate: args.taxRate,
      category: args.category,
      status: "active",
      updatedAt: Date.now(),
    });

    return itemId;
  },
});

/**
 * Update a catalog item
 */
export const update = mutation({
  args: {
    id: v.id("catalog_items"),
    businessId: v.id("businesses"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    sku: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    currency: v.optional(v.string()),
    unitMeasurement: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const item = await ctx.db.get(args.id);
    if (!item || item.businessId !== args.businessId || item.deletedAt) {
      throw new Error("Catalog item not found");
    }

    const { id, businessId, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    await ctx.db.patch(args.id, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Deactivate a catalog item
 */
export const deactivate = mutation({
  args: {
    id: v.id("catalog_items"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const item = await ctx.db.get(args.id);
    if (!item || item.businessId !== args.businessId || item.deletedAt) {
      throw new Error("Catalog item not found");
    }

    await ctx.db.patch(args.id, {
      status: "inactive",
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Reactivate a catalog item
 */
export const reactivate = mutation({
  args: {
    id: v.id("catalog_items"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const item = await ctx.db.get(args.id);
    if (!item || item.businessId !== args.businessId || item.deletedAt) {
      throw new Error("Catalog item not found");
    }

    await ctx.db.patch(args.id, {
      status: "active",
      updatedAt: Date.now(),
    });

    return args.id;
  },
});
