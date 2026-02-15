/**
 * Vendor Price History Functions - Convex queries and mutations
 *
 * Tracks ALL price observations from documents (invoices/expense claims):
 * - Records prices at OCR/extraction time (even for documents that don't become transactions)
 * - Marks prices as "confirmed" when linked to accounting entries
 * - Enables price trend analysis by vendor and item
 */

import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";
import {
  getAlertLevel,
  MIN_OBSERVATIONS_FOR_ALERT,
  PRICE_LOOKBACK_DAYS,
} from "../../src/domains/payables/lib/price-thresholds";

// ============================================
// QUERIES (User-facing)
// ============================================

/**
 * Get price history for an item across all vendors
 * Useful for comparing prices from different suppliers
 */
export const getItemPriceHistory = query({
  args: {
    businessId: v.id("businesses"),
    itemDescription: v.string(),
    vendorId: v.optional(v.id("vendors")),
    confirmedOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    const limit = args.limit ?? 100;

    // Get price history - filter by vendor if specified
    let priceHistory;
    if (args.vendorId) {
      priceHistory = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_vendor_item", (q) =>
          q.eq("vendorId", args.vendorId!).eq("itemDescription", args.itemDescription)
        )
        .collect();
    } else {
      priceHistory = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_businessId_item", (q) =>
          q.eq("businessId", args.businessId).eq("itemDescription", args.itemDescription)
        )
        .collect();
    }

    // Filter by confirmation status if requested
    if (args.confirmedOnly) {
      priceHistory = priceHistory.filter((p) => p.isConfirmed);
    }

    // Sort by observed date (newest first)
    priceHistory.sort((a, b) => b.observedAt.localeCompare(a.observedAt));

    // Fetch vendor names for display
    const vendorIds = [...new Set(priceHistory.map((p) => p.vendorId))];
    const vendors = await Promise.all(
      vendorIds.map((id) => ctx.db.get(id))
    );
    const vendorMap = new Map(
      vendors.filter(Boolean).map((v) => [v!._id, v!.name])
    );

    return priceHistory.slice(0, limit).map((p) => ({
      ...p,
      vendorName: vendorMap.get(p.vendorId) ?? "Unknown Vendor",
    }));
  },
});

/**
 * Get price history for a specific vendor
 * Useful for analyzing price trends from a single supplier
 */
export const getVendorPriceHistory = query({
  args: {
    vendorId: v.id("vendors"),
    itemDescription: v.optional(v.string()),
    confirmedOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Get vendor to verify business membership
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) {
      return [];
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", vendor.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    const limit = args.limit ?? 100;

    // Get price history
    let priceHistory;
    if (args.itemDescription) {
      priceHistory = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_vendor_item", (q) =>
          q.eq("vendorId", args.vendorId).eq("itemDescription", args.itemDescription!)
        )
        .collect();
    } else {
      priceHistory = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_vendorId", (q) => q.eq("vendorId", args.vendorId))
        .collect();
    }

    // Filter by confirmation status if requested
    if (args.confirmedOnly) {
      priceHistory = priceHistory.filter((p) => p.isConfirmed);
    }

    // Sort by observed date (newest first)
    priceHistory.sort((a, b) => b.observedAt.localeCompare(a.observedAt));

    return priceHistory.slice(0, limit);
  },
});

/**
 * Get unique items purchased from a vendor
 */
export const getVendorItems = query({
  args: {
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Get vendor to verify business membership
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) {
      return [];
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", vendor.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    // Get all price history for vendor
    const priceHistory = await ctx.db
      .query("vendor_price_history")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", args.vendorId))
      .collect();

    // Extract unique items with latest price
    const itemMap = new Map<string, {
      itemDescription: string;
      itemCode: string | undefined;
      latestPrice: number;
      currency: string;
      observedAt: string;
      priceCount: number;
    }>();

    for (const record of priceHistory) {
      const existing = itemMap.get(record.itemDescription);
      if (!existing || record.observedAt > existing.observedAt) {
        itemMap.set(record.itemDescription, {
          itemDescription: record.itemDescription,
          itemCode: record.itemCode,
          latestPrice: record.unitPrice,
          currency: record.currency,
          observedAt: record.observedAt,
          priceCount: (existing?.priceCount ?? 0) + 1,
        });
      } else {
        // Just increment count
        existing.priceCount += 1;
      }
    }

    return Array.from(itemMap.values()).sort((a, b) =>
      a.itemDescription.localeCompare(b.itemDescription)
    );
  },
});

// ============================================
// PRICE INTELLIGENCE QUERIES (013-ap-vendor-management)
// ============================================

/**
 * Detect price changes for line items vs historical vendor prices.
 * Returns per-item alerts with severity levels and cheaper alternatives.
 */
export const detectPriceChanges = query({
  args: {
    vendorId: v.id("vendors"),
    lineItems: v.array(
      v.object({
        itemDescription: v.string(),
        unitPrice: v.number(),
        currency: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Get vendor to verify business membership
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) {
      return [];
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", vendor.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    const lookbackDate = new Date(
      Date.now() - PRICE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .split("T")[0];

    const results = [];

    for (const item of args.lineItems) {
      const normalized = item.itemDescription.trim().toLowerCase();

      // Get historical prices for this vendor + item
      const vendorPrices = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_vendor_normalized", (q) =>
          q.eq("vendorId", args.vendorId).eq("normalizedDescription", normalized)
        )
        .collect();

      const confirmedPrices = vendorPrices.filter(
        (p) => p.isConfirmed && p.observedAt >= lookbackDate
      );

      // Sort by date (newest first) and get previous price
      confirmedPrices.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
      const previousPrice = confirmedPrices[0]?.unitPrice;
      const observationCount = confirmedPrices.length;

      let percentChange = 0;
      let alertLevel: "none" | "info" | "warning" | "alert" = "none";

      if (previousPrice && previousPrice > 0) {
        percentChange = ((item.unitPrice - previousPrice) / previousPrice) * 100;
        if (observationCount >= MIN_OBSERVATIONS_FOR_ALERT) {
          alertLevel = getAlertLevel(percentChange, item.currency);
        }
      }

      // Cross-vendor: find cheapest price for this item across all vendors
      const allPrices = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_businessId_item", (q) =>
          q.eq("businessId", vendor.businessId).eq("itemDescription", item.itemDescription.trim())
        )
        .collect();

      // Also check by normalized description
      const allPricesNormalized = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_businessId", (q) => q.eq("businessId", vendor.businessId))
        .collect();

      const matchingAllVendors = allPricesNormalized.filter(
        (p) =>
          p.normalizedDescription === normalized &&
          p.isConfirmed &&
          p.vendorId !== args.vendorId
      );

      // Group by vendor and get latest confirmed price
      const vendorLatestPrices = new Map<string, { vendorId: Id<"vendors">; price: number }>();
      for (const p of matchingAllVendors) {
        const existing = vendorLatestPrices.get(p.vendorId.toString());
        if (!existing || p.observedAt > (allPricesNormalized.find(x => x.vendorId === p.vendorId)?.observedAt ?? "")) {
          vendorLatestPrices.set(p.vendorId.toString(), {
            vendorId: p.vendorId,
            price: p.unitPrice,
          });
        }
      }

      // Find cheapest alternative
      let cheaperVendor: {
        vendorId: string;
        vendorName: string;
        price: number;
        savingsPercent: number;
      } | undefined;

      for (const [, vendorPrice] of vendorLatestPrices) {
        if (vendorPrice.price < item.unitPrice) {
          const savingsPercent =
            ((item.unitPrice - vendorPrice.price) / item.unitPrice) * 100;

          if (!cheaperVendor || vendorPrice.price < cheaperVendor.price) {
            const altVendor = await ctx.db.get(vendorPrice.vendorId);
            cheaperVendor = {
              vendorId: vendorPrice.vendorId.toString(),
              vendorName: altVendor?.name ?? "Unknown Vendor",
              price: vendorPrice.price,
              savingsPercent,
            };
          }
        }
      }

      results.push({
        itemDescription: item.itemDescription,
        currentPrice: item.unitPrice,
        previousPrice: previousPrice ?? item.unitPrice,
        percentChange,
        alertLevel,
        cheaperVendor,
        observationCount,
      });
    }

    return results;
  },
});

/**
 * Get cross-vendor price comparison for a specific item.
 * Returns all vendor prices sorted by price ascending with cheapest marked.
 */
export const getCrossVendorComparison = query({
  args: {
    businessId: v.id("businesses"),
    normalizedDescription: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    const normalized = args.normalizedDescription.trim().toLowerCase();

    // Get all price history for this business
    const allPrices = await ctx.db
      .query("vendor_price_history")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Filter for matching item, confirmed only
    const matching = allPrices.filter(
      (p) => p.normalizedDescription === normalized && p.isConfirmed
    );

    // Group by vendor, take latest confirmed price per vendor
    const vendorLatest = new Map<
      string,
      { vendorId: Id<"vendors">; price: number; currency: string; lastObservedAt: string }
    >();

    for (const p of matching) {
      const key = p.vendorId.toString();
      const existing = vendorLatest.get(key);
      if (!existing || p.observedAt > existing.lastObservedAt) {
        vendorLatest.set(key, {
          vendorId: p.vendorId,
          price: p.unitPrice,
          currency: p.currency,
          lastObservedAt: p.observedAt,
        });
      }
    }

    // Fetch vendor names
    const vendorEntries = Array.from(vendorLatest.entries());
    const vendorNames = await Promise.all(
      vendorEntries.map(async ([, data]) => {
        const vendor = await ctx.db.get(data.vendorId);
        return vendor?.name ?? "Unknown Vendor";
      })
    );

    // Build result array
    const result = vendorEntries.map(([, data], index) => ({
      vendorId: data.vendorId,
      vendorName: vendorNames[index],
      latestPrice: data.price,
      currency: data.currency,
      lastObservedAt: data.lastObservedAt,
      isCheapest: false,
    }));

    // Sort by price ascending
    result.sort((a, b) => a.latestPrice - b.latestPrice);

    // Mark cheapest
    if (result.length > 0) {
      result[0].isCheapest = true;
    }

    return result;
  },
});

// ============================================
// INTERNAL MUTATIONS (System use)
// ============================================

/**
 * Record price observation from document extraction
 * Called during OCR/extraction pipeline
 */
export const recordPriceObservation = internalMutation({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
    itemDescription: v.string(),
    itemCode: v.optional(v.string()),
    unitPrice: v.number(),
    currency: v.string(),
    quantity: v.number(),
    sourceType: v.union(v.literal("invoice"), v.literal("expense_claim")),
    sourceId: v.string(),
    observedAt: v.string(),
    // DSPy extraction fields
    taxAmount: v.optional(v.number()),
    taxRate: v.optional(v.number()),
    itemCategory: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const trimmedDescription = args.itemDescription.trim();
    const priceHistoryId = await ctx.db.insert("vendor_price_history", {
      businessId: args.businessId,
      vendorId: args.vendorId,
      itemDescription: trimmedDescription,
      itemCode: args.itemCode,
      unitPrice: args.unitPrice,
      currency: args.currency,
      quantity: args.quantity,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      observedAt: args.observedAt,
      isConfirmed: false,
      // DSPy extraction fields
      taxAmount: args.taxAmount,
      taxRate: args.taxRate,
      itemCategory: args.itemCategory,
      normalizedDescription: trimmedDescription.toLowerCase(),
      updatedAt: Date.now(),
    });

    return priceHistoryId;
  },
});

/**
 * Batch record price observations from line items
 * Convenience function for recording multiple items at once
 */
export const recordPriceObservationsBatch = internalMutation({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
    sourceType: v.union(v.literal("invoice"), v.literal("expense_claim")),
    sourceId: v.string(),
    observedAt: v.string(),
    lineItems: v.array(v.object({
      itemDescription: v.string(),
      itemCode: v.optional(v.string()),
      unitPrice: v.number(),
      currency: v.string(),
      quantity: v.number(),
      // DSPy extraction fields
      taxAmount: v.optional(v.number()),
      taxRate: v.optional(v.number()),
      itemCategory: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const priceHistoryIds: Id<"vendor_price_history">[] = [];

    for (const item of args.lineItems) {
      const trimmedDescription = item.itemDescription.trim();
      const id = await ctx.db.insert("vendor_price_history", {
        businessId: args.businessId,
        vendorId: args.vendorId,
        itemDescription: trimmedDescription,
        itemCode: item.itemCode,
        unitPrice: item.unitPrice,
        currency: item.currency,
        quantity: item.quantity,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        observedAt: args.observedAt,
        isConfirmed: false,
        // DSPy extraction fields
        taxAmount: item.taxAmount,
        taxRate: item.taxRate,
        itemCategory: item.itemCategory,
        normalizedDescription: trimmedDescription.toLowerCase(),
        updatedAt: Date.now(),
      });
      priceHistoryIds.push(id);
    }

    return priceHistoryIds;
  },
});

/**
 * Confirm price observations when accounting entry is created
 * Links price history to the accounting entry
 */
export const confirmPriceObservations = internalMutation({
  args: {
    sourceType: v.union(v.literal("invoice"), v.literal("expense_claim")),
    sourceId: v.string(),
    accountingEntryId: v.id("accounting_entries"),
  },
  handler: async (ctx, args) => {
    // Find all price observations for this source
    const observations = await ctx.db
      .query("vendor_price_history")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", args.sourceType).eq("sourceId", args.sourceId)
      )
      .collect();

    // Update each observation
    for (const obs of observations) {
      await ctx.db.patch(obs._id, {
        isConfirmed: true,
        accountingEntryId: args.accountingEntryId,
        updatedAt: Date.now(),
      });
    }

    return { confirmedCount: observations.length };
  },
});

/**
 * Delete price observations for a source document
 * Used when a document is deleted before becoming a transaction
 */
export const deletePriceObservations = internalMutation({
  args: {
    sourceType: v.union(v.literal("invoice"), v.literal("expense_claim")),
    sourceId: v.string(),
  },
  handler: async (ctx, args) => {
    const observations = await ctx.db
      .query("vendor_price_history")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", args.sourceType).eq("sourceId", args.sourceId)
      )
      .collect();

    for (const obs of observations) {
      await ctx.db.delete(obs._id);
    }

    return { deletedCount: observations.length };
  },
});

// ============================================
// INTERNAL QUERIES (System use)
// ============================================

/**
 * Get latest price for an item from a vendor
 * Used for price comparison/validation during extraction
 */
export const getLatestPrice = internalQuery({
  args: {
    vendorId: v.id("vendors"),
    itemDescription: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedDescription = args.itemDescription.trim().toLowerCase();

    const priceHistory = await ctx.db
      .query("vendor_price_history")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", args.vendorId))
      .collect();

    // Find matching item (case-insensitive)
    const matchingPrices = priceHistory.filter(
      (p) => p.itemDescription.toLowerCase().trim() === normalizedDescription
    );

    if (matchingPrices.length === 0) {
      return null;
    }

    // Sort by observed date and return latest
    matchingPrices.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    return matchingPrices[0];
  },
});

/**
 * Get price observations for a source document
 */
export const getPriceObservationsBySource = internalQuery({
  args: {
    sourceType: v.union(v.literal("invoice"), v.literal("expense_claim")),
    sourceId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vendor_price_history")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", args.sourceType).eq("sourceId", args.sourceId)
      )
      .collect();
  },
});
