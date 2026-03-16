/**
 * Vendor Scorecards — Convex queries and mutations
 *
 * Pre-calculated vendor performance metrics:
 * totalSpendYTD, invoiceVolume, averagePaymentCycle,
 * priceStabilityScore, aiExtractionAccuracy, anomalyFlagsCount
 *
 * Feature: 001-smart-vendor-intelligence (#320)
 */

import { v } from "convex/values";
import { query, internalMutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";

// ============================================
// INTERNAL MUTATIONS (Cron / System)
// ============================================

/**
 * T027: Calculate and upsert vendor scorecard.
 * Called by nightly cron or on-demand.
 */
export const calculate = internalMutation({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const currentYear = new Date().getFullYear();
    const fiscalYearStart = `${currentYear}-01-01`;

    // Use vendor_price_history as primary data source (already has vendor+price data)
    const priceHistory = await ctx.db
      .query("vendor_price_history")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", args.vendorId))
      .collect();

    const activePrices = priceHistory.filter((p) => !p.archivedFlag);

    // 1. Total Spend YTD — sum of (unitPrice * quantity) for current FY
    const ytdRecords = activePrices.filter(
      (p) => (p.invoiceDate ?? p.observedAt) >= fiscalYearStart
    );
    const totalSpendYTD = ytdRecords.reduce(
      (sum, p) => sum + p.unitPrice * p.quantity,
      0
    );

    // 2. Invoice Volume — count unique invoices (via sourceId)
    const uniqueInvoices = new Set(ytdRecords.map((p) => p.sourceId));
    const invoiceVolume = uniqueInvoices.size;

    // 3. Average Payment Cycle — derive from price history dates
    // Since we don't have payment dates directly, use average days between
    // consecutive observations as a proxy
    const sortedDates = activePrices
      .map((p) => p.invoiceDate ?? p.observedAt)
      .sort();
    let averagePaymentCycle = 30; // Default 30 days
    if (sortedDates.length >= 2) {
      const dayDiffs = [];
      for (let i = 1; i < sortedDates.length; i++) {
        const d1 = new Date(sortedDates[i - 1]);
        const d2 = new Date(sortedDates[i]);
        const diff = Math.round(
          (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diff > 0) dayDiffs.push(diff);
      }
      if (dayDiffs.length > 0) {
        averagePaymentCycle =
          dayDiffs.reduce((s, d) => s + d, 0) / dayDiffs.length;
      }
    }

    // 4. Price Stability Score (coefficient of variation → inverse scale 0-100)
    const prices = activePrices.map((p) => p.unitPrice);
    let priceStabilityScore = 100;
    if (prices.length >= 2) {
      const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
      if (mean > 0) {
        const variance =
          prices.reduce((s, p) => s + Math.pow(p - mean, 2), 0) /
          prices.length;
        const cv = (Math.sqrt(variance) / mean) * 100;
        priceStabilityScore = Math.max(0, Math.round(100 - Math.min(cv, 100)));
      }
    }

    // 5. AI Extraction Accuracy — derive from match confidence scores
    const withConfidence = activePrices.filter(
      (p) => p.matchConfidenceScore !== undefined && p.matchConfidenceScore !== null
    );
    let aiExtractionAccuracy = 95; // Default if no confidence data
    if (withConfidence.length > 0) {
      aiExtractionAccuracy = Math.round(
        withConfidence.reduce((s, p) => s + (p.matchConfidenceScore ?? 0), 0) /
          withConfidence.length
      );
    }

    // 6. Anomaly Flags Count (active anomalies)
    const activeAnomalies = await ctx.db
      .query("vendor_price_anomalies")
      .withIndex("by_business_vendor_status", (q) =>
        q
          .eq("businessId", args.businessId)
          .eq("vendorId", args.vendorId)
          .eq("status", "active")
      )
      .collect();
    const anomalyFlagsCount = activeAnomalies.length;

    // Upsert scorecard
    const existing = await ctx.db
      .query("vendor_scorecards")
      .withIndex("by_business_vendor", (q) =>
        q.eq("businessId", args.businessId).eq("vendorId", args.vendorId)
      )
      .first();

    const scorecardData = {
      businessId: args.businessId,
      vendorId: args.vendorId,
      totalSpendYTD: Math.round(totalSpendYTD * 100) / 100,
      invoiceVolume,
      averagePaymentCycle: Math.round(averagePaymentCycle * 10) / 10,
      priceStabilityScore,
      aiExtractionAccuracy,
      anomalyFlagsCount,
      lastUpdatedTimestamp: now,
      fiscalYearStart,
    };

    if (existing) {
      await ctx.db.patch(existing._id, scorecardData);
      return existing._id;
    } else {
      return await ctx.db.insert("vendor_scorecards", scorecardData);
    }
  },
});

// ============================================
// QUERIES (User-facing)
// ============================================

/**
 * T028: Get scorecard for a specific vendor.
 */
export const get = query({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return null;

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return null;

    const scorecard = await ctx.db
      .query("vendor_scorecards")
      .withIndex("by_business_vendor", (q) =>
        q.eq("businessId", args.businessId).eq("vendorId", args.vendorId)
      )
      .first();

    if (!scorecard) return null;

    // Enrich with vendor metadata
    const vendor = await ctx.db.get(args.vendorId);

    return {
      ...scorecard,
      vendor: {
        name: vendor?.name ?? "Unknown Vendor",
        category: (vendor as Record<string, unknown>)?.category as
          | string
          | undefined,
      },
    };
  },
});

/**
 * T029: List all scorecards for a business with sorting.
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    sortBy: v.optional(
      v.union(
        v.literal("totalSpendYTD"),
        v.literal("priceStabilityScore"),
        v.literal("anomalyFlagsCount")
      )
    ),
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

    const limit = args.limit ?? 50;

    let scorecards = await ctx.db
      .query("vendor_scorecards")
      .withIndex("by_business_vendor", (q) =>
        q.eq("businessId", args.businessId)
      )
      .collect();

    // Sort
    const sortBy = args.sortBy ?? "totalSpendYTD";
    scorecards.sort((a, b) => {
      if (sortBy === "anomalyFlagsCount") {
        return b.anomalyFlagsCount - a.anomalyFlagsCount;
      }
      if (sortBy === "priceStabilityScore") {
        return a.priceStabilityScore - b.priceStabilityScore; // Low stability first
      }
      return b.totalSpendYTD - a.totalSpendYTD; // Highest spend first
    });

    // Enrich with vendor names
    const vendorIds = [...new Set(scorecards.map((s) => s.vendorId))];
    const vendors = await Promise.all(vendorIds.map((id) => ctx.db.get(id)));
    const vendorMap = new Map(
      vendors.filter(Boolean).map((v) => [v!._id, v!])
    );

    return scorecards.slice(0, limit).map((s) => ({
      ...s,
      vendor: {
        name: vendorMap.get(s.vendorId)?.name ?? "Unknown Vendor",
        category: (vendorMap.get(s.vendorId) as Record<string, unknown>)
          ?.category as string | undefined,
      },
    }));
  },
});
