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
import { internal } from "../_generated/api";
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
    const now = Date.now();

    for (const item of args.lineItems) {
      const trimmedDescription = item.itemDescription.trim();

      // #320: Generate itemIdentifier (item code primary, description hash fallback)
      const itemCode = item.itemCode?.trim().toUpperCase();
      const matchedFromItemCode = !!(itemCode && itemCode.length > 0);
      const itemIdentifier = matchedFromItemCode
        ? itemCode!
        : trimmedDescription.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9\s-]/g, "").substring(0, 100);

      // #320: Check existing records for this item+vendor (limit reads for bandwidth)
      const existingForItem = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_vendor_item", (q) =>
          q.eq("vendorId", args.vendorId).eq("itemDescription", trimmedDescription)
        )
        .take(20); // Limit bandwidth: only need recent history for anomaly detection

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
        updatedAt: now,
        // #320: Smart Vendor Intelligence fields
        itemIdentifier,
        invoiceDate: args.observedAt,
        matchedFromItemCode,
        archivedFlag: false,
        observationTimestamp: now,
      });
      priceHistoryIds.push(id);

      // #320: Anomaly detection — only if vendor has ≥2 prior records (FR-024)
      if (existingForItem.length >= 2 && item.unitPrice > 0) {
        // Per-invoice check: >10% increase from last invoice
        const sorted = [...existingForItem].sort((a, b) =>
          b.observedAt.localeCompare(a.observedAt)
        );
        const lastPrice = sorted[0].unitPrice;
        if (lastPrice > 0) {
          const pctChange = ((item.unitPrice - lastPrice) / lastPrice) * 100;
          if (pctChange > 10) {
            const anomalyId = await ctx.db.insert("vendor_price_anomalies", {
              businessId: args.businessId,
              vendorId: args.vendorId,
              itemIdentifier,
              alertType: "per-invoice",
              oldValue: lastPrice,
              newValue: item.unitPrice,
              percentageChange: Math.round(pctChange * 10) / 10,
              severityLevel: pctChange > 20 ? "high-impact" : "standard",
              status: "active",
              createdTimestamp: now,
              priceHistoryId: id,
            });
            // T063: Generate recommended actions for high-impact anomalies
            if (pctChange > 20 && anomalyId) {
              await ctx.scheduler.runAfter(0, internal.functions.vendorRecommendedActions.generate, {
                businessId: args.businessId,
                vendorId: args.vendorId,
                anomalyAlertId: anomalyId,
              });
            }
          }
        }

        // Trailing 6-month average check: >20% increase
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const sixMonthsAgoStr = sixMonthsAgo.toISOString().split("T")[0];
        const recentPrices = sorted.filter((p) => p.observedAt >= sixMonthsAgoStr);
        if (recentPrices.length >= 2) {
          const avg = recentPrices.reduce((s, p) => s + p.unitPrice, 0) / recentPrices.length;
          if (avg > 0) {
            const trailingPct = ((item.unitPrice - avg) / avg) * 100;
            if (trailingPct > 20) {
              const trailingAnomalyId = await ctx.db.insert("vendor_price_anomalies", {
                businessId: args.businessId,
                vendorId: args.vendorId,
                itemIdentifier,
                alertType: "trailing-average",
                oldValue: Math.round(avg * 100) / 100,
                newValue: item.unitPrice,
                percentageChange: Math.round(trailingPct * 10) / 10,
                severityLevel: "high-impact",
                status: "active",
                createdTimestamp: now,
                priceHistoryId: id,
              });
              // T063: Generate recommended actions for trailing-average (always high-impact)
              await ctx.scheduler.runAfter(0, internal.functions.vendorRecommendedActions.generate, {
                businessId: args.businessId,
                vendorId: args.vendorId,
                anomalyAlertId: trailingAnomalyId,
              });
            }
          }
        }
      } else if (existingForItem.length === 0 && item.unitPrice > 0) {
        // #320: New item detection (FR-005) — only if vendor has other items
        const vendorHasHistory = await ctx.db
          .query("vendor_price_history")
          .withIndex("by_vendorId", (q) => q.eq("vendorId", args.vendorId))
          .take(1);
        if (vendorHasHistory.length > 0) {
          await ctx.db.insert("vendor_price_anomalies", {
            businessId: args.businessId,
            vendorId: args.vendorId,
            itemIdentifier,
            alertType: "new-item",
            oldValue: 0,
            newValue: item.unitPrice,
            percentageChange: 100,
            severityLevel: "standard",
            status: "active",
            createdTimestamp: now,
            priceHistoryId: id,
          });
        }
      }
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
    accountingEntryId: v.optional(v.string()),
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

// ============================================
// SMART VENDOR INTELLIGENCE (#320)
// ============================================

/**
 * T009: Create price history record from invoice line item.
 * Called when AP invoice is processed — extracts line items and stores price history.
 * Generates itemIdentifier from item code (primary) or description hash (fallback).
 */
export const createFromInvoiceLineItem = internalMutation({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
    invoiceId: v.id("invoices"),
    itemCode: v.optional(v.string()),
    itemDescription: v.string(),
    unitPrice: v.number(),
    quantity: v.number(),
    currency: v.string(),
    invoiceDate: v.string(),
  },
  handler: async (ctx, args) => {
    // Validation
    if (args.unitPrice <= 0) {
      throw new Error("Unit price must be positive");
    }
    if (args.quantity <= 0) {
      throw new Error("Quantity must be positive");
    }

    // Generate item identifier: item code first, fallback to description hash
    const itemCode = args.itemCode?.trim().toUpperCase();
    const matchedFromItemCode = !!(itemCode && itemCode.length > 0);
    const itemIdentifier = matchedFromItemCode
      ? itemCode!
      : args.itemDescription
          .toLowerCase()
          .trim()
          .replace(/\s+/g, " ")
          .replace(/[^a-z0-9\s-]/g, "")
          .substring(0, 100);

    // Check for existing records with same itemIdentifier for this vendor
    const existingRecords = await ctx.db
      .query("vendor_price_history")
      .withIndex("by_business_itemId_archived", (q) =>
        q
          .eq("businessId", args.businessId)
          .eq("itemIdentifier", itemIdentifier)
          .eq("archivedFlag", false)
      )
      .collect();

    // Filter to same vendor
    const vendorRecords = existingRecords.filter(
      (r) => r.vendorId === args.vendorId
    );

    // If no item code and we have no match, check fuzzy matching via description
    let matchConfidenceScore: number | undefined;
    let userConfirmedFlag = false;

    if (!matchedFromItemCode && vendorRecords.length === 0) {
      // Try fuzzy match against existing items for this vendor
      const vendorItems = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_vendorId", (q) => q.eq("vendorId", args.vendorId))
        .collect();

      // Simple fuzzy match: normalized description similarity
      const normalizedNew = args.itemDescription.toLowerCase().trim();
      const uniqueDescriptions = [
        ...new Set(vendorItems.map((i) => i.itemDescription)),
      ];

      let bestMatch: { description: string; score: number } | null = null;

      for (const desc of uniqueDescriptions) {
        const normalizedExisting = desc.toLowerCase().trim();
        // Calculate similarity (Jaccard index on word tokens)
        const wordsA = new Set(normalizedNew.split(/\s+/));
        const wordsB = new Set(normalizedExisting.split(/\s+/));
        const intersection = new Set(
          [...wordsA].filter((w) => wordsB.has(w))
        );
        const union = new Set([...wordsA, ...wordsB]);
        const score =
          union.size > 0
            ? Math.round((intersection.size / union.size) * 100)
            : 0;

        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { description: desc, score };
        }
      }

      if (bestMatch && bestMatch.score >= 80) {
        // Auto-link: confidence >= 80%
        matchConfidenceScore = bestMatch.score;
        userConfirmedFlag = false; // Auto-linked, no user confirmation needed
      } else if (bestMatch && bestMatch.score >= 40) {
        // Flag for user confirmation: confidence 40-79%
        matchConfidenceScore = bestMatch.score;
        userConfirmedFlag = false; // Needs user confirmation
      }
      // Below 40% — treat as new item, no match attempt
    }

    const now = Date.now();

    // Insert price history record
    const priceHistoryId = await ctx.db.insert("vendor_price_history", {
      businessId: args.businessId,
      vendorId: args.vendorId,
      invoiceId: args.invoiceId,
      itemIdentifier,
      itemCode: args.itemCode,
      itemDescription: args.itemDescription,
      unitPrice: args.unitPrice,
      quantity: args.quantity,
      currency: args.currency,
      invoiceDate: args.invoiceDate,
      observationTimestamp: now,
      matchConfidenceScore,
      userConfirmedFlag,
      matchedFromItemCode,
      archivedFlag: false,
      // Legacy fields for backward compat
      sourceType: "invoice" as const,
      sourceId: args.invoiceId as unknown as string,
      observedAt: args.invoiceDate,
      isConfirmed: false,
      normalizedDescription: args.itemDescription.toLowerCase().trim(),
    });

    return {
      priceHistoryId,
      itemIdentifier,
      matchedFromItemCode,
      matchConfidenceScore,
      needsUserConfirmation:
        matchConfidenceScore !== undefined &&
        matchConfidenceScore < 80 &&
        matchConfidenceScore >= 40,
      isNewItem: vendorRecords.length === 0 && !matchConfidenceScore,
      previousRecordCount: vendorRecords.length,
    };
  },
});

/**
 * T010: List price history with filters and pagination.
 * Supports filtering by businessId, vendorId, itemIdentifier, archivedFlag.
 */
export const listPriceHistory = query({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.optional(v.id("vendors")),
    itemIdentifier: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { items: [], nextCursor: null };

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return { items: [], nextCursor: null };

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { items: [], nextCursor: null };
    }

    const includeArchived = args.includeArchived ?? false;
    const limit = args.limit ?? 50;
    const cursor = args.cursor ?? 0;

    let records;

    if (args.vendorId && !includeArchived) {
      // Filter by vendor + non-archived
      records = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_business_vendor_archived", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("vendorId", args.vendorId!)
            .eq("archivedFlag", false)
        )
        .collect();
    } else if (args.vendorId) {
      // Filter by vendor, include archived
      records = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_business_vendor_archived", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("vendorId", args.vendorId!)
        )
        .collect();
    } else if (args.itemIdentifier && !includeArchived) {
      // Filter by item identifier + non-archived
      records = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_business_itemId_archived", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("itemIdentifier", args.itemIdentifier!)
            .eq("archivedFlag", false)
        )
        .collect();
    } else if (args.itemIdentifier) {
      // Filter by item identifier, include archived
      records = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_business_itemId_archived", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("itemIdentifier", args.itemIdentifier!)
        )
        .collect();
    } else {
      // All records for business
      records = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", args.businessId)
        )
        .collect();

      if (!includeArchived) {
        records = records.filter((r) => !r.archivedFlag);
      }
    }

    // Sort by invoiceDate descending (newest first)
    records.sort((a, b) => {
      const dateA = a.invoiceDate ?? a.observedAt;
      const dateB = b.invoiceDate ?? b.observedAt;
      return dateB.localeCompare(dateA);
    });

    // Enrich with vendor names
    const vendorIds = [...new Set(records.map((r) => r.vendorId))];
    const vendors = await Promise.all(vendorIds.map((id) => ctx.db.get(id)));
    const vendorMap = new Map(
      vendors.filter(Boolean).map((v) => [v!._id, v!])
    );

    const paginated = records.slice(cursor, cursor + limit);

    return {
      items: paginated.map((r) => ({
        ...r,
        vendor: {
          name: vendorMap.get(r.vendorId)?.name ?? "Unknown Vendor",
          category: (vendorMap.get(r.vendorId) as Record<string, unknown>)
            ?.category as string | undefined,
        },
      })),
      nextCursor:
        cursor + limit < records.length ? cursor + limit : null,
    };
  },
});

/**
 * T011: Get single item-vendor price timeline sorted by invoiceDate.
 * Returns all price observations for a specific item from a specific vendor.
 */
export const getItemVendorTimeline = query({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
    itemIdentifier: v.string(),
    includeArchived: v.optional(v.boolean()),
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

    const includeArchived = args.includeArchived ?? false;

    // Query by item identifier with archived filter
    let records;
    if (!includeArchived) {
      records = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_business_itemId_archived", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("itemIdentifier", args.itemIdentifier)
            .eq("archivedFlag", false)
        )
        .collect();
    } else {
      records = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_business_itemId_archived", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("itemIdentifier", args.itemIdentifier)
        )
        .collect();
    }

    // Filter to specific vendor
    records = records.filter((r) => r.vendorId === args.vendorId);

    // Sort by invoiceDate ascending (chronological for charts)
    records.sort((a, b) => {
      const dateA = a.invoiceDate ?? a.observedAt;
      const dateB = b.invoiceDate ?? b.observedAt;
      return dateA.localeCompare(dateB);
    });

    return records;
  },
});

/**
 * T014: Confirm or reject a fuzzy-matched price history record.
 * User confirms <80% confidence matches to link to existing item history,
 * or rejects to treat as a new distinct item.
 */
export const confirmFuzzyMatch = internalMutation({
  args: {
    priceHistoryId: v.id("vendor_price_history"),
    confirmed: v.boolean(),
    confirmedItemIdentifier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.priceHistoryId);
    if (!record) {
      throw new Error("Price history record not found");
    }

    if (args.confirmed && args.confirmedItemIdentifier) {
      // User confirmed: link to existing item identifier
      await ctx.db.patch(args.priceHistoryId, {
        itemIdentifier: args.confirmedItemIdentifier,
        userConfirmedFlag: true,
        matchConfidenceScore: 100, // User-confirmed = 100% confidence
      });
    } else {
      // User rejected: keep separate, mark as confirmed (new item)
      await ctx.db.patch(args.priceHistoryId, {
        userConfirmedFlag: true,
        matchConfidenceScore: 0, // Explicitly rejected
      });
    }

    return { success: true };
  },
});

/**
 * T036: Get price trend data for charts (Recharts format).
 * Returns PriceTrendDataPoint[] for a specific item-vendor pair.
 */
export const getPriceTrendData = query({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
    itemIdentifier: v.string(),
    includeArchived: v.optional(v.boolean()),
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

    const includeArchived = args.includeArchived ?? false;

    let records;
    if (!includeArchived) {
      records = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_business_itemId_archived", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("itemIdentifier", args.itemIdentifier)
            .eq("archivedFlag", false)
        )
        .collect();
    } else {
      records = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_business_itemId_archived", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("itemIdentifier", args.itemIdentifier)
        )
        .collect();
    }

    records = records.filter((r) => r.vendorId === args.vendorId);

    // Sort chronologically
    records.sort((a, b) => {
      const dateA = a.invoiceDate ?? a.observedAt;
      const dateB = b.invoiceDate ?? b.observedAt;
      return dateA.localeCompare(dateB);
    });

    return records.map((r) => ({
      date: r.invoiceDate ?? r.observedAt,
      unitPrice: r.unitPrice,
      currency: r.currency,
      invoiceId: r.invoiceId,
    }));
  },
});
