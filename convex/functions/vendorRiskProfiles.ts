/**
 * Vendor Risk Profiles — Convex queries and mutations
 *
 * Calculated risk scores: payment, concentration, compliance, price.
 * Overall risk level derived from max score.
 *
 * Feature: 001-smart-vendor-intelligence (#320)
 */

import { v } from "convex/values";
import { query, action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId } from "../lib/resolvers";

/**
 * T052: Calculate vendor risk profile.
 */
export const calculate = internalMutation({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get vendor info
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Vendor not found");

    // Use vendor_price_history as primary data source
    const allPriceHistory = await ctx.db
      .query("vendor_price_history")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const vendorPrices = allPriceHistory.filter(
      (p) => p.vendorId === args.vendorId && !p.archivedFlag
    );

    // 1. Payment Risk (data quality: low confidence scores)
    let paymentRiskScore = 0;
    if (vendorPrices.length > 0) {
      const lowConfidence = vendorPrices.filter(
        (p) =>
          p.matchConfidenceScore !== undefined &&
          p.matchConfidenceScore !== null &&
          p.matchConfidenceScore < 70
      ).length;
      const unconfirmed = vendorPrices.filter(
        (p) => p.userConfirmedFlag === false && p.matchConfidenceScore !== undefined
      ).length;
      paymentRiskScore = Math.min(
        Math.round(
          ((lowConfidence + unconfirmed) / vendorPrices.length) * 100
        ),
        100
      );
    }

    // 2. Concentration Risk (% of total AP spend)
    const totalAPSpend = allPriceHistory
      .filter((p) => !p.archivedFlag)
      .reduce((sum, p) => sum + p.unitPrice * p.quantity, 0);
    const vendorSpend = vendorPrices.reduce(
      (sum, p) => sum + p.unitPrice * p.quantity,
      0
    );
    const concentrationPercent =
      totalAPSpend > 0 ? (vendorSpend / totalAPSpend) * 100 : 0;
    const concentrationRiskScore = Math.min(
      Math.round(concentrationPercent * 3),
      100
    );

    // 3. Compliance Risk (TIN, e-invoice)
    let complianceRiskScore = 0;
    const vendorData = vendor as Record<string, unknown>;
    if (!vendorData.taxId) complianceRiskScore += 50;
    if (!vendorData.eInvoiceCompliant) complianceRiskScore += 50;

    // 4. Price Risk (price variance)
    const priceHistory = await ctx.db
      .query("vendor_price_history")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", args.vendorId))
      .collect();

    const prices = priceHistory
      .filter((p) => !p.archivedFlag)
      .map((p) => p.unitPrice);

    let priceRiskScore = 0;
    if (prices.length >= 2) {
      const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
      if (mean > 0) {
        const variance =
          prices.reduce((s, p) => s + Math.pow(p - mean, 2), 0) /
          prices.length;
        priceRiskScore = Math.min(
          Math.round((Math.sqrt(variance) / mean) * 100),
          100
        );
      }
    }

    // Overall risk level
    const maxScore = Math.max(
      paymentRiskScore,
      concentrationRiskScore,
      complianceRiskScore,
      priceRiskScore
    );
    const riskLevel: "low" | "medium" | "high" =
      maxScore > 70 ? "high" : maxScore > 30 ? "medium" : "low";

    // Upsert
    const existing = await ctx.db
      .query("vendor_risk_profiles")
      .withIndex("by_business_vendor", (q) =>
        q.eq("businessId", args.businessId).eq("vendorId", args.vendorId)
      )
      .first();

    const profileData = {
      businessId: args.businessId,
      vendorId: args.vendorId,
      paymentRiskScore,
      concentrationRiskScore,
      complianceRiskScore,
      priceRiskScore,
      riskLevel,
      lastCalculatedTimestamp: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, profileData);
      return existing._id;
    } else {
      return await ctx.db.insert("vendor_risk_profiles", profileData);
    }
  },
});

/**
 * T053: Get risk profile for a specific vendor.
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

    const profile = await ctx.db
      .query("vendor_risk_profiles")
      .withIndex("by_business_vendor", (q) =>
        q.eq("businessId", args.businessId).eq("vendorId", args.vendorId)
      )
      .first();

    if (!profile) return null;

    const vendor = await ctx.db.get(args.vendorId);
    return {
      ...profile,
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
 * T054: List high-risk vendors.
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    riskLevel: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high"))
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

    let profiles;
    if (args.riskLevel) {
      profiles = await ctx.db
        .query("vendor_risk_profiles")
        .withIndex("by_business_risk_level", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("riskLevel", args.riskLevel!)
        )
        .collect();
    } else {
      profiles = await ctx.db
        .query("vendor_risk_profiles")
        .withIndex("by_business_vendor", (q) =>
          q.eq("businessId", args.businessId)
        )
        .collect();
    }

    profiles.sort(
      (a, b) => b.lastCalculatedTimestamp - a.lastCalculatedTimestamp
    );

    const vendorIds = [...new Set(profiles.map((p) => p.vendorId))];
    const vendors = await Promise.all(vendorIds.map((id) => ctx.db.get(id)));
    const vendorMap = new Map(
      vendors.filter(Boolean).map((v) => [v!._id, v!])
    );

    return profiles.slice(0, limit).map((p) => ({
      ...p,
      vendor: {
        name: vendorMap.get(p.vendorId)?.name ?? "Unknown Vendor",
        category: (vendorMap.get(p.vendorId) as Record<string, unknown>)
          ?.category as string | undefined,
      },
    }));
  },
});

/**
 * T056: On-demand risk refresh (bandwidth-safe, no cron).
 * Per CLAUDE.md Rule 3: Audit crons — use on-demand action instead.
 * Recalculates if stale >7 days.
 */
export const _getExisting = internalQuery({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vendor_risk_profiles")
      .withIndex("by_business_vendor", (q) =>
        q.eq("businessId", args.businessId).eq("vendorId", args.vendorId)
      )
      .first();
  },
});

/**
 * T056: On-demand risk refresh (bandwidth-safe, no cron).
 * Per CLAUDE.md Rule 3: Audit crons — use on-demand action instead.
 * Recalculates if stale >7 days.
 */
export const refreshIfStale = action({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args): Promise<{ refreshed: boolean }> => {
    const existing = await ctx.runQuery(internal.functions.vendorRiskProfiles._getExisting, {
      businessId: args.businessId,
      vendorId: args.vendorId,
    });

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (existing && Date.now() - existing.lastCalculatedTimestamp < sevenDaysMs) {
      return { refreshed: false };
    }

    await ctx.runMutation(internal.functions.vendorRiskProfiles.calculate, {
      businessId: args.businessId,
      vendorId: args.vendorId,
    });

    return { refreshed: true };
  },
});
