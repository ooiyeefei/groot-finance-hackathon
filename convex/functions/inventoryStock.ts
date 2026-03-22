/**
 * Inventory Stock Functions - Convex queries and actions
 *
 * Stock level queries and dashboard summary.
 * Dashboard uses action (not query) to avoid reactive bandwidth burn.
 */

import { v } from "convex/values";
import { query, action, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

// ============================================
// QUERIES (lightweight, for inline UI use)
// ============================================

export const getByProduct = query({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
  },
  handler: async (ctx, args) => {
    const stockRecords = await ctx.db
      .query("inventory_stock")
      .withIndex("by_catalogItem_location", (q) =>
        q.eq("catalogItemId", args.catalogItemId)
      )
      .collect();

    const results = [];
    for (const stock of stockRecords) {
      if (stock.businessId !== args.businessId) continue;
      const location = await ctx.db.get(stock.locationId);
      if (location && location.status === "active") {
        results.push({ location, stock });
      }
    }

    return results;
  },
});

export const getAvailableStock = query({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
  },
  handler: async (ctx, args) => {
    const stockRecords = await ctx.db
      .query("inventory_stock")
      .withIndex("by_catalogItem_location", (q) =>
        q.eq("catalogItemId", args.catalogItemId)
      )
      .collect();

    const results = [];
    for (const stock of stockRecords) {
      if (stock.businessId !== args.businessId) continue;
      const location = await ctx.db.get(stock.locationId);
      if (location && location.status === "active") {
        results.push({
          locationId: location._id,
          locationName: location.name,
          quantityOnHand: stock.quantityOnHand,
        });
      }
    }

    return results;
  },
});

export const getByLocation = query({
  args: {
    businessId: v.id("businesses"),
    locationId: v.id("inventory_locations"),
  },
  handler: async (ctx, args) => {
    const stockRecords = await ctx.db
      .query("inventory_stock")
      .withIndex("by_locationId", (q) =>
        q.eq("locationId", args.locationId)
      )
      .collect();

    const results = [];
    for (const stock of stockRecords) {
      if (stock.businessId !== args.businessId) continue;
      const catalogItem = await ctx.db.get(stock.catalogItemId);
      if (catalogItem) {
        results.push({ catalogItem, stock });
      }
    }

    return results;
  },
});

// ============================================
// INTERNAL QUERY (called by dashboard action)
// ============================================

export const getDashboardData = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    // Get all stock records
    const allStock = await ctx.db
      .query("inventory_stock")
      .withIndex("by_businessId", (q) =>
        q.eq("businessId", args.businessId)
      )
      .collect();

    // Get active locations
    const locations = await ctx.db
      .query("inventory_locations")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", args.businessId).eq("status", "active")
      )
      .collect();

    // Count tracked items (unique catalogItemIds with stock)
    const trackedItemIds = new Set(allStock.map((s) => s.catalogItemId));

    // Find low stock items
    const lowStockItems = [];
    for (const stock of allStock) {
      if (
        stock.reorderLevel !== undefined &&
        stock.quantityOnHand <= stock.reorderLevel
      ) {
        const item = await ctx.db.get(stock.catalogItemId);
        const location = await ctx.db.get(stock.locationId);
        if (item && location) {
          lowStockItems.push({
            itemName: item.name,
            itemSku: item.sku,
            catalogItemId: stock.catalogItemId,
            locationName: location.name,
            locationId: stock.locationId,
            quantityOnHand: stock.quantityOnHand,
            reorderLevel: stock.reorderLevel,
          });
        }
      }
    }

    // Recent movements (last 20)
    const recentMovements = await ctx.db
      .query("inventory_movements")
      .withIndex("by_businessId", (q) =>
        q.eq("businessId", args.businessId)
      )
      .order("desc")
      .take(20);

    // Enrich movements with names
    const enrichedMovements = [];
    for (const movement of recentMovements) {
      const item = await ctx.db.get(movement.catalogItemId);
      const location = await ctx.db.get(movement.locationId);
      enrichedMovements.push({
        ...movement,
        itemName: item?.name || "Unknown",
        locationName: location?.name || "Unknown",
      });
    }

    return {
      totalItems: trackedItemIds.size,
      totalLocations: locations.length,
      lowStockCount: lowStockItems.length,
      lowStockItems,
      recentMovements: enrichedMovements,
    };
  },
});

// ============================================
// ACTION (non-reactive, for dashboard)
// ============================================

export const getDashboardSummary = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    return await ctx.runQuery(internal.functions.inventoryStock.getDashboardData, {
      businessId: args.businessId,
    });
  },
});
