/**
 * Catalog Vendor Item Mappings (032-price-history-tracking)
 *
 * Links catalog items to vendor item identifiers for unified margin view.
 * Supports fuzzy-match bootstrapping and user confirmation workflow.
 */

import { v } from "convex/values";
import { query, mutation, action, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

// ---------------------------------------------------------------------------
// Queries (small result sets — safe for reactive useQuery)
// ---------------------------------------------------------------------------

/**
 * Get all confirmed/user-created mappings for a catalog item.
 */
export const getMappings = query({
  args: {
    catalogItemId: v.id("catalog_items"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const mappings = await ctx.db
      .query("catalog_vendor_item_mappings")
      .withIndex("by_catalogItem", (q) =>
        q.eq("catalogItemId", args.catalogItemId).eq("businessId", args.businessId)
      )
      .collect();

    // Filter out rejected mappings
    const activeMappings = mappings.filter((m) => !m.rejectedAt);

    // Resolve vendor names
    const enriched = [];
    for (const m of activeMappings) {
      const vendor = await ctx.db.get(m.vendorId) as any;
      enriched.push({
        ...m,
        vendorName: vendor?.name || "Unknown vendor",
      });
    }

    return enriched;
  },
});

/**
 * Internal version for use by actions (getMarginSummary).
 */
export const _getMappings = internalQuery({
  args: {
    catalogItemId: v.id("catalog_items"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const mappings = await ctx.db
      .query("catalog_vendor_item_mappings")
      .withIndex("by_catalogItem", (q) =>
        q.eq("catalogItemId", args.catalogItemId).eq("businessId", args.businessId)
      )
      .collect();

    return mappings.filter(
      (m) => !m.rejectedAt && m.matchSource !== "fuzzy-suggested"
    );
  },
});

/**
 * Check if vendor price data exists that could be mapped to this catalog item.
 * Used for the "Link to vendor prices" banner.
 */
export const getUnmappedVendorItemCount = query({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
  },
  handler: async (ctx, args) => {
    // Get catalog item name/description for matching
    const catalogItem = await ctx.db.get(args.catalogItemId);
    if (!catalogItem) return { count: 0, hasData: false };

    // Get existing mappings to exclude already-mapped items
    const existingMappings = await ctx.db
      .query("catalog_vendor_item_mappings")
      .withIndex("by_catalogItem", (q) =>
        q.eq("catalogItemId", args.catalogItemId).eq("businessId", args.businessId)
      )
      .collect();

    const mappedIdentifiers = new Set(
      existingMappings.filter((m) => !m.rejectedAt).map((m) => `${m.vendorId}:${m.vendorItemIdentifier}`)
    );

    // Count distinct vendor items that could be matched
    // Use a simple name-based search in vendor_price_history
    const vendorItems = await ctx.db
      .query("vendor_price_history")
      .withIndex("by_businessId_item", (q) => q.eq("businessId", args.businessId))
      .take(500);

    // Get unique vendor+itemIdentifier combos not already mapped
    const uniqueItems = new Set<string>();
    for (const vi of vendorItems) {
      if (!vi.archivedFlag && vi.itemIdentifier) {
        const key = `${vi.vendorId}:${vi.itemIdentifier}`;
        if (!mappedIdentifiers.has(key)) {
          uniqueItems.add(key);
        }
      }
    }

    return { count: uniqueItems.size, hasData: uniqueItems.size > 0 };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Confirm a mapping (user-confirmed) or create a manual mapping (user-created).
 */
export const confirmMapping = mutation({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
    vendorId: v.id("vendors"),
    vendorItemIdentifier: v.string(),
    vendorItemDescription: v.string(),
    matchSource: v.union(v.literal("user-confirmed"), v.literal("user-created")),
    confidenceScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Dedup check
    const existing = await ctx.db
      .query("catalog_vendor_item_mappings")
      .withIndex("by_vendor_item", (q) =>
        q
          .eq("businessId", args.businessId)
          .eq("vendorId", args.vendorId)
          .eq("vendorItemIdentifier", args.vendorItemIdentifier)
      )
      .filter((q) => q.eq(q.field("catalogItemId"), args.catalogItemId))
      .first();

    if (existing && !existing.rejectedAt) {
      // Already mapped, update matchSource if upgrading from fuzzy-suggested
      if (existing.matchSource === "fuzzy-suggested") {
        await ctx.db.patch(existing._id, { matchSource: args.matchSource });
      }
      return { mappingId: existing._id };
    }

    if (existing && existing.rejectedAt) {
      // Previously rejected — update to confirmed
      await ctx.db.patch(existing._id, {
        matchSource: args.matchSource,
        rejectedAt: undefined,
      });
      return { mappingId: existing._id };
    }

    const mappingId = await ctx.db.insert("catalog_vendor_item_mappings", {
      businessId: args.businessId,
      catalogItemId: args.catalogItemId,
      vendorId: args.vendorId,
      vendorItemIdentifier: args.vendorItemIdentifier,
      vendorItemDescription: args.vendorItemDescription,
      matchSource: args.matchSource,
      confidenceScore: args.confidenceScore,
      createdAt: Date.now(),
    });

    return { mappingId };
  },
});

/**
 * Reject a fuzzy-suggested mapping.
 */
export const rejectMapping = mutation({
  args: {
    mappingId: v.id("catalog_vendor_item_mappings"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mappingId, { rejectedAt: Date.now() });
  },
});

// ---------------------------------------------------------------------------
// Actions (bandwidth-safe for larger operations)
// ---------------------------------------------------------------------------

/**
 * Suggest vendor item mappings for a catalog item using fuzzy matching.
 */
export const suggestMappings = action({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
  },
  handler: async (ctx, args): Promise<{ suggestions: Array<{
    vendorId: any; vendorName: string; vendorItemIdentifier: string;
    vendorItemDescription: string; confidenceScore: number; latestPrice: number; currency: string;
  }> }> => {
    const result = await ctx.runQuery(
      internal.functions.catalogVendorMappings._suggestMappingsInternal,
      args
    );
    return result;
  },
});

export const _suggestMappingsInternal = internalQuery({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
  },
  handler: async (ctx, args) => {
    const catalogItem = await ctx.db.get(args.catalogItemId);
    if (!catalogItem) return { suggestions: [] };

    const catalogName = catalogItem.name.toLowerCase().trim();
    const catalogSku = catalogItem.sku?.toLowerCase().trim();

    // Get existing mappings to exclude
    const existingMappings = await ctx.db
      .query("catalog_vendor_item_mappings")
      .withIndex("by_catalogItem", (q) =>
        q.eq("catalogItemId", args.catalogItemId).eq("businessId", args.businessId)
      )
      .collect();

    const rejectedKeys = new Set(
      existingMappings.filter((m) => m.rejectedAt).map((m) => `${m.vendorId}:${m.vendorItemIdentifier}`)
    );
    const confirmedKeys = new Set(
      existingMappings.filter((m) => !m.rejectedAt).map((m) => `${m.vendorId}:${m.vendorItemIdentifier}`)
    );

    // Get vendor items
    const vendorItems = await ctx.db
      .query("vendor_price_history")
      .withIndex("by_businessId_item", (q) => q.eq("businessId", args.businessId))
      .take(1000);

    // Group by vendor+itemIdentifier (keep latest only)
    const uniqueVendorItems = new Map<
      string,
      { vendorId: any; itemIdentifier: string; itemDescription: string; unitPrice: number; currency: string }
    >();

    for (const vi of vendorItems) {
      if (vi.archivedFlag || !vi.itemIdentifier) continue;
      const key = `${vi.vendorId}:${vi.itemIdentifier}`;
      if (rejectedKeys.has(key) || confirmedKeys.has(key)) continue;
      if (!uniqueVendorItems.has(key)) {
        uniqueVendorItems.set(key, {
          vendorId: vi.vendorId,
          itemIdentifier: vi.itemIdentifier,
          itemDescription: vi.itemDescription,
          unitPrice: vi.unitPrice,
          currency: vi.currency,
        });
      }
    }

    // Fuzzy match using Jaccard similarity on word tokens
    const catalogTokens = new Set(catalogName.split(/\s+/).filter((t) => t.length > 1));

    const suggestions: Array<{
      vendorId: any;
      vendorName: string;
      vendorItemIdentifier: string;
      vendorItemDescription: string;
      confidenceScore: number;
      latestPrice: number;
      currency: string;
    }> = [];

    for (const [, vi] of uniqueVendorItems) {
      let score = 0;

      // Exact SKU match → high confidence
      if (catalogSku && vi.itemIdentifier.toLowerCase() === catalogSku) {
        score = 95;
      } else {
        // Jaccard similarity on description tokens
        const vendorTokens = new Set(
          vi.itemDescription.toLowerCase().split(/\s+/).filter((t) => t.length > 1)
        );

        const intersection = new Set([...catalogTokens].filter((t) => vendorTokens.has(t)));
        const union = new Set([...catalogTokens, ...vendorTokens]);

        if (union.size > 0) {
          score = Math.round((intersection.size / union.size) * 100);
        }
      }

      if (score >= 30) {
        const vendor = await ctx.db.get(vi.vendorId) as any;
        suggestions.push({
          vendorId: vi.vendorId,
          vendorName: vendor?.name || "Unknown vendor",
          vendorItemIdentifier: vi.itemIdentifier,
          vendorItemDescription: vi.itemDescription,
          confidenceScore: score,
          latestPrice: vi.unitPrice,
          currency: vi.currency,
        });
      }
    }

    // Sort by confidence desc
    suggestions.sort((a, b) => b.confidenceScore - a.confidenceScore);

    return { suggestions: suggestions.slice(0, 20) };
  },
});
