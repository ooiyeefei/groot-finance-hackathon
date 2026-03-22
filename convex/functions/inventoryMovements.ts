/**
 * Inventory Movement Functions - Convex mutations and queries
 *
 * Handles stock-in, stock-out, and adjustment movements.
 * Updates inventory_stock levels on each movement.
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
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
// INTERNAL MUTATIONS (called by actions)
// ============================================

export const stockIn = internalMutation({
  args: {
    businessId: v.id("businesses"),
    items: v.array(
      v.object({
        catalogItemId: v.id("catalog_items"),
        locationId: v.id("inventory_locations"),
        quantity: v.number(),
        unitCostOriginal: v.number(),
        unitCostOriginalCurrency: v.string(),
        unitCostHome: v.number(),
      })
    ),
    sourceType: v.string(),
    sourceId: v.string(),
    date: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const movementIds = [];
    const now = Date.now();

    for (const item of args.items) {
      // Create movement record
      const movementId = await ctx.db.insert("inventory_movements", {
        businessId: args.businessId,
        catalogItemId: item.catalogItemId,
        locationId: item.locationId,
        movementType: "stock_in",
        quantity: item.quantity,
        unitCostOriginal: item.unitCostOriginal,
        unitCostOriginalCurrency: item.unitCostOriginalCurrency,
        unitCostHome: item.unitCostHome,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        createdBy: args.createdBy,
        date: args.date,
        createdAt: now,
      });
      movementIds.push(movementId);

      // Upsert inventory_stock
      const existingStock = await ctx.db
        .query("inventory_stock")
        .withIndex("by_catalogItem_location", (q) =>
          q.eq("catalogItemId", item.catalogItemId).eq("locationId", item.locationId)
        )
        .first();

      if (existingStock) {
        // Recalculate WAC
        const existingQty = existingStock.quantityOnHand;
        const existingWAC = existingStock.weightedAvgCostHome || 0;
        const newQty = existingQty + item.quantity;
        const newWAC =
          newQty > 0
            ? (existingQty * existingWAC + item.quantity * item.unitCostHome) / newQty
            : item.unitCostHome;

        await ctx.db.patch(existingStock._id, {
          quantityOnHand: newQty,
          weightedAvgCostHome: Math.round(newWAC * 100) / 100,
          lastMovementAt: now,
        });
      } else {
        await ctx.db.insert("inventory_stock", {
          businessId: args.businessId,
          catalogItemId: item.catalogItemId,
          locationId: item.locationId,
          quantityOnHand: item.quantity,
          weightedAvgCostHome: item.unitCostHome,
          lastMovementAt: now,
        });
      }
    }

    return movementIds;
  },
});

export const stockOut = internalMutation({
  args: {
    businessId: v.id("businesses"),
    items: v.array(
      v.object({
        catalogItemId: v.id("catalog_items"),
        locationId: v.id("inventory_locations"),
        quantity: v.number(),
      })
    ),
    sourceType: v.string(),
    sourceId: v.string(),
    date: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const movementIds = [];
    const now = Date.now();

    for (const item of args.items) {
      // Create movement record (negative quantity)
      const movementId = await ctx.db.insert("inventory_movements", {
        businessId: args.businessId,
        catalogItemId: item.catalogItemId,
        locationId: item.locationId,
        movementType: "stock_out",
        quantity: -Math.abs(item.quantity),
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        createdBy: args.createdBy,
        date: args.date,
        createdAt: now,
      });
      movementIds.push(movementId);

      // Update inventory_stock
      const existingStock = await ctx.db
        .query("inventory_stock")
        .withIndex("by_catalogItem_location", (q) =>
          q.eq("catalogItemId", item.catalogItemId).eq("locationId", item.locationId)
        )
        .first();

      if (existingStock) {
        await ctx.db.patch(existingStock._id, {
          quantityOnHand: existingStock.quantityOnHand - Math.abs(item.quantity),
          lastMovementAt: now,
        });
      }
    }

    return movementIds;
  },
});

// ============================================
// QUERIES
// ============================================

export const listByProduct = query({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const movements = await ctx.db
      .query("inventory_movements")
      .withIndex("by_catalogItem", (q) =>
        q.eq("catalogItemId", args.catalogItemId)
      )
      .order("desc")
      .take(limit);

    return movements.filter((m) => m.businessId === args.businessId);
  },
});

export const listByLocation = query({
  args: {
    businessId: v.id("businesses"),
    locationId: v.id("inventory_locations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const movements = await ctx.db
      .query("inventory_movements")
      .withIndex("by_locationId", (q) =>
        q.eq("locationId", args.locationId)
      )
      .order("desc")
      .take(limit);

    return movements.filter((m) => m.businessId === args.businessId);
  },
});

// ============================================
// PUBLIC MUTATIONS
// ============================================

export const adjust = mutation({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
    locationId: v.id("inventory_locations"),
    quantity: v.number(),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireFinanceAdmin(ctx, args.businessId);

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    // Create adjustment movement
    const movementId = await ctx.db.insert("inventory_movements", {
      businessId: args.businessId,
      catalogItemId: args.catalogItemId,
      locationId: args.locationId,
      movementType: "adjustment",
      quantity: args.quantity,
      sourceType: "manual_adjustment",
      notes: args.notes,
      createdBy: user._id,
      date: today,
      createdAt: now,
    });

    // Update inventory_stock
    const existingStock = await ctx.db
      .query("inventory_stock")
      .withIndex("by_catalogItem_location", (q) =>
        q.eq("catalogItemId", args.catalogItemId).eq("locationId", args.locationId)
      )
      .first();

    if (existingStock) {
      await ctx.db.patch(existingStock._id, {
        quantityOnHand: existingStock.quantityOnHand + args.quantity,
        lastMovementAt: now,
      });
    } else {
      await ctx.db.insert("inventory_stock", {
        businessId: args.businessId,
        catalogItemId: args.catalogItemId,
        locationId: args.locationId,
        quantityOnHand: args.quantity,
        lastMovementAt: now,
      });
    }

    return movementId;
  },
});
