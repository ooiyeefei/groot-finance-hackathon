/**
 * Price History MCP Tool (032-price-history-tracking)
 *
 * MCP tool for chat agent — returns unified price data for a catalog item.
 * Follows vendorIntelligenceMCP.ts pattern.
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

/**
 * Get unified price history for a catalog item.
 * Used by chat agent to answer questions like:
 * - "What did I last charge Customer X for Item Y?"
 * - "What's the price trend for Widget A?"
 */
export const getPriceHistory = internalQuery({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.optional(v.id("catalog_items")),
    catalogItemName: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
  },
  handler: async (ctx, args) => {
    let catalogItemId = args.catalogItemId;

    // Fuzzy search by name if no ID provided
    if (!catalogItemId && args.catalogItemName) {
      const searchTerm = args.catalogItemName.toLowerCase();
      const items = await ctx.db
        .query("catalog_items")
        .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
        .take(100);

      const match = items.find(
        (i) =>
          i.name.toLowerCase().includes(searchTerm) ||
          (i.sku && i.sku.toLowerCase().includes(searchTerm))
      );

      if (!match) {
        return {
          error: `No catalog item found matching "${args.catalogItemName}"`,
          catalogItem: null,
          sellingHistory: null,
          purchaseHistory: null,
          margin: null,
        };
      }
      catalogItemId = match._id;
    }

    if (!catalogItemId) {
      return {
        error: "Either catalogItemId or catalogItemName is required",
        catalogItem: null,
        sellingHistory: null,
        purchaseHistory: null,
        margin: null,
      };
    }

    const catalogItem = await ctx.db.get(catalogItemId);
    if (!catalogItem) {
      return {
        error: "Catalog item not found",
        catalogItem: null,
        sellingHistory: null,
        purchaseHistory: null,
        margin: null,
      };
    }

    // Get selling price history
    let sellingRecords = await ctx.db
      .query("selling_price_history")
      .withIndex("by_catalogItem_business", (q) =>
        q.eq("catalogItemId", catalogItemId!).eq("businessId", args.businessId)
      )
      .collect();

    sellingRecords = sellingRecords.filter((r) => !r.archivedAt);

    if (args.customerId) {
      sellingRecords = sellingRecords.filter((r) => r.customerId === args.customerId);
    }

    sellingRecords.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));

    // Calculate selling stats
    const sellingPrices = sellingRecords.map((r) => r.unitPrice);
    const latestSellingPrice = sellingRecords[0]?.unitPrice ?? null;
    const avgSellingPrice =
      sellingPrices.length > 0
        ? Math.round((sellingPrices.reduce((a, b) => a + b, 0) / sellingPrices.length) * 100) / 100
        : null;

    // Get purchase cost via mappings
    const mappings = await ctx.db
      .query("catalog_vendor_item_mappings")
      .withIndex("by_catalogItem", (q) =>
        q.eq("catalogItemId", catalogItemId!).eq("businessId", args.businessId)
      )
      .collect();

    const activeMappings = mappings.filter((m) => !m.rejectedAt && m.matchSource !== "fuzzy-suggested");

    let latestPurchaseCost: number | null = null;
    let avgPurchaseCost: number | null = null;
    let purchaseCount = 0;

    if (activeMappings.length > 0) {
      const allPurchasePrices: number[] = [];
      let latestDate = "";

      for (const mapping of activeMappings) {
        const records = await ctx.db
          .query("vendor_price_history")
          .withIndex("by_vendor_item", (q) =>
            q.eq("vendorId", mapping.vendorId)
          )
          .filter((q) => q.eq(q.field("itemIdentifier"), mapping.vendorItemIdentifier))
          .take(50);

        const nonArchived = records.filter((r) => !r.archivedFlag);
        for (const r of nonArchived) {
          allPurchasePrices.push(r.unitPrice);
          const d = r.observedAt || r.invoiceDate || "";
          if (d > latestDate) {
            latestDate = d;
            latestPurchaseCost = r.unitPrice;
          }
        }
      }

      purchaseCount = allPurchasePrices.length;
      if (allPurchasePrices.length > 0) {
        avgPurchaseCost =
          Math.round(
            (allPurchasePrices.reduce((a, b) => a + b, 0) / allPurchasePrices.length) * 100
          ) / 100;
      }
    }

    // Calculate margin
    let currentMargin: number | null = null;
    let marginWarning: string | null = null;

    if (latestSellingPrice !== null && latestPurchaseCost !== null && latestSellingPrice > 0) {
      currentMargin =
        Math.round(
          ((latestSellingPrice - latestPurchaseCost) / latestSellingPrice) * 1000
        ) / 10;

      if (currentMargin < 0) {
        marginWarning = `Selling below cost — losing ${Math.abs(currentMargin)}% per unit`;
      } else if (currentMargin < 10) {
        marginWarning = `Low margin warning — only ${currentMargin}% gross margin`;
      }
    }

    // Determine selling trend (increasing/decreasing/stable)
    let sellingTrend = "stable";
    if (sellingRecords.length >= 2) {
      const recent = sellingRecords[0].unitPrice;
      const previous = sellingRecords[1].unitPrice;
      if (recent > previous * 1.05) sellingTrend = "increasing";
      else if (recent < previous * 0.95) sellingTrend = "decreasing";
    }

    return {
      catalogItem: {
        name: catalogItem.name,
        sku: catalogItem.sku,
        category: catalogItem.category,
        currentPrice: catalogItem.unitPrice,
        currency: catalogItem.currency,
      },
      sellingHistory: {
        count: sellingRecords.length,
        latestPrice: latestSellingPrice,
        avgPrice: avgSellingPrice,
        trend: sellingTrend,
        currency: sellingRecords[0]?.currency || catalogItem.currency,
      },
      purchaseHistory: {
        count: purchaseCount,
        latestCost: latestPurchaseCost,
        avgCost: avgPurchaseCost,
        trend: "stable", // TODO: compute purchase trend
      },
      margin: {
        current: currentMargin,
        warning: marginWarning,
      },
    };
  },
});
