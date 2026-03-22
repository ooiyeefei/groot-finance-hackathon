/**
 * Vendor Price Anomalies — Convex queries and mutations
 *
 * Stores detected price anomalies and billing pattern changes.
 * Powers alert UI and recommended actions.
 *
 * Feature: 001-smart-vendor-intelligence (#320)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";

// ============================================
// INTERNAL MUTATIONS (System/Backend Operations)
// ============================================

/**
 * T016: Detect anomalies after price history insert.
 * Called internally after createFromInvoiceLineItem.
 * Runs Tier 1 detection and inserts anomaly records if found.
 */
export const detectAnomalies = internalMutation({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
    priceHistoryId: v.id("vendor_price_history"),
    invoiceId: v.id("invoices"),
    itemIdentifier: v.string(),
    currentPrice: v.number(),
    currency: v.string(),
    previousRecordCount: v.number(),
    isNewItem: v.boolean(),
  },
  handler: async (ctx, args) => {
    const anomaliesCreated: Id<"vendor_price_anomalies">[] = [];
    const now = Date.now();

    // Suppress anomaly alerts for vendors with <2 invoices (FR-024)
    if (args.previousRecordCount < 2 && !args.isNewItem) {
      return { anomaliesCreated };
    }

    // New item detection (FR-005)
    if (args.isNewItem && args.previousRecordCount === 0) {
      const anomalyId = await ctx.db.insert("vendor_price_anomalies", {
        businessId: args.businessId,
        vendorId: args.vendorId,
        itemIdentifier: args.itemIdentifier,
        alertType: "new-item",
        oldValue: 0,
        newValue: args.currentPrice,
        percentageChange: 100,
        severityLevel: "standard",
        status: "active",
        createdTimestamp: now,
        priceHistoryId: args.priceHistoryId,
        invoiceId: args.invoiceId,
      });
      anomaliesCreated.push(anomalyId);
      return { anomaliesCreated };
    }

    // Get existing price records for this item+vendor
    const existingRecords = await ctx.db
      .query("vendor_price_history")
      .withIndex("by_business_itemId_archived", (q) =>
        q
          .eq("businessId", args.businessId)
          .eq("itemIdentifier", args.itemIdentifier)
          .eq("archivedFlag", false)
      )
      .collect();

    const vendorRecords = existingRecords
      .filter(
        (r) =>
          r.vendorId === args.vendorId &&
          r._id !== args.priceHistoryId // Exclude current record
      )
      .sort((a, b) => {
        const dateA = a.invoiceDate ?? a.observedAt;
        const dateB = b.invoiceDate ?? b.observedAt;
        return dateB.localeCompare(dateA); // Newest first
      });

    if (vendorRecords.length < 2) {
      return { anomaliesCreated };
    }

    // Per-invoice check: >10% increase from last invoice (FR-003a)
    const lastRecord = vendorRecords[0];
    const lastPrice = lastRecord.unitPrice;
    if (lastPrice > 0) {
      const percentChange =
        ((args.currentPrice - lastPrice) / lastPrice) * 100;

      if (percentChange > 10) {
        const anomalyId = await ctx.db.insert("vendor_price_anomalies", {
          businessId: args.businessId,
          vendorId: args.vendorId,
          itemIdentifier: args.itemIdentifier,
          alertType: "per-invoice",
          oldValue: lastPrice,
          newValue: args.currentPrice,
          percentageChange: Math.round(percentChange * 10) / 10,
          severityLevel: percentChange > 20 ? "high-impact" : "standard",
          status: "active",
          createdTimestamp: now,
          priceHistoryId: args.priceHistoryId,
          invoiceId: args.invoiceId,
        });
        anomaliesCreated.push(anomalyId);
      }
    }

    // Trailing average check: >20% increase over 6-month average (FR-003b)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split("T")[0];

    const recentRecords = vendorRecords.filter(
      (r) => (r.invoiceDate ?? r.observedAt) >= sixMonthsAgoStr
    );

    if (recentRecords.length >= 2) {
      const avgPrice =
        recentRecords.reduce((sum, r) => sum + r.unitPrice, 0) /
        recentRecords.length;

      if (avgPrice > 0) {
        const trailingPercentChange =
          ((args.currentPrice - avgPrice) / avgPrice) * 100;

        if (trailingPercentChange > 20) {
          // Check we haven't already created a per-invoice anomaly for same condition
          const alreadyFlagged = anomaliesCreated.length > 0;
          const anomalyId = await ctx.db.insert("vendor_price_anomalies", {
            businessId: args.businessId,
            vendorId: args.vendorId,
            itemIdentifier: args.itemIdentifier,
            alertType: "trailing-average",
            oldValue: Math.round(avgPrice * 100) / 100,
            newValue: args.currentPrice,
            percentageChange: Math.round(trailingPercentChange * 10) / 10,
            severityLevel: "high-impact",
            status: "active",
            createdTimestamp: now,
            priceHistoryId: args.priceHistoryId,
            invoiceId: args.invoiceId,
          });
          anomaliesCreated.push(anomalyId);
        }
      }
    }

    // If high-impact anomaly detected, generate recommended actions
    const highImpactAnomalies = anomaliesCreated.length > 0;
    if (highImpactAnomalies) {
      // Will be wired to vendorRecommendedActions.generate in T063
    }

    // 032-price-history-tracking: Enrich anomalies with margin impact
    if (anomaliesCreated.length > 0) {
      // Check if this vendor item is mapped to a catalog item
      const mappings = await ctx.db
        .query("catalog_vendor_item_mappings")
        .withIndex("by_vendor_item", (q) =>
          q.eq("businessId", args.businessId).eq("vendorId", args.vendorId).eq("vendorItemIdentifier", args.itemIdentifier)
        )
        .filter((q) => q.not(q.field("rejectedAt")))
        .first();

      if (mappings) {
        // Get latest selling price for this catalog item
        const sellingRecords = await ctx.db
          .query("selling_price_history")
          .withIndex("by_catalogItem_business", (q) =>
            q.eq("catalogItemId", mappings.catalogItemId).eq("businessId", args.businessId)
          )
          .filter((q) => q.not(q.field("archivedAt")))
          .take(1);

        if (sellingRecords.length > 0) {
          const sellingPrice = sellingRecords[0].unitPrice;
          const newMargin = sellingPrice > 0
            ? Math.round(((sellingPrice - args.currentPrice) / sellingPrice) * 1000) / 10
            : null;

          // Update anomaly records with margin impact indicator
          for (const anomalyId of anomaliesCreated) {
            const anomaly = await ctx.db.get(anomalyId);
            if (anomaly) {
              const indicators = ((anomaly as any).potentialIndicators || []) as string[];
              if (newMargin !== null && newMargin < 10) {
                indicators.push("margin-impact-high");
              }
              await ctx.db.patch(anomalyId, {
                potentialIndicators: indicators,
              } as any);
            }
          }
        }
      }
    }

    return { anomaliesCreated };
  },
});

// ============================================
// QUERIES (User-facing)
// ============================================

/**
 * T017: List anomaly alerts with filters.
 * Supports filtering by businessId, vendorId, status, severity, alertType.
 */
export const listAlerts = query({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.optional(v.id("vendors")),
    status: v.optional(
      v.union(v.literal("active"), v.literal("dismissed"))
    ),
    severityLevel: v.optional(
      v.union(v.literal("standard"), v.literal("high-impact"))
    ),
    alertType: v.optional(
      v.union(
        v.literal("per-invoice"),
        v.literal("trailing-average"),
        v.literal("new-item"),
        v.literal("frequency-change")
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

    let alerts;

    if (args.vendorId && args.status) {
      // Use compound index: business + vendor + status
      alerts = await ctx.db
        .query("vendor_price_anomalies")
        .withIndex("by_business_vendor_status", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("vendorId", args.vendorId!)
            .eq("status", args.status!)
        )
        .collect();
    } else if (args.severityLevel && args.status) {
      // Use severity index
      alerts = await ctx.db
        .query("vendor_price_anomalies")
        .withIndex("by_business_severity", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("severityLevel", args.severityLevel!)
            .eq("status", args.status!)
        )
        .collect();
    } else {
      // Use date index (fallback)
      alerts = await ctx.db
        .query("vendor_price_anomalies")
        .withIndex("by_created_date", (q) =>
          q.eq("businessId", args.businessId)
        )
        .collect();

      // Apply filters in memory
      if (args.vendorId) {
        alerts = alerts.filter((a) => a.vendorId === args.vendorId);
      }
      if (args.status) {
        alerts = alerts.filter((a) => a.status === args.status);
      }
    }

    // Apply remaining filters
    if (args.severityLevel && !(args.severityLevel && args.status)) {
      alerts = alerts.filter((a) => a.severityLevel === args.severityLevel);
    }
    if (args.alertType) {
      alerts = alerts.filter((a) => a.alertType === args.alertType);
    }

    // Sort by createdTimestamp descending (newest first)
    alerts.sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    // Enrich with vendor names
    const vendorIds = [...new Set(alerts.map((a) => a.vendorId))];
    const vendors = await Promise.all(vendorIds.map((id) => ctx.db.get(id)));
    const vendorMap = new Map(
      vendors.filter(Boolean).map((v) => [v!._id, v!])
    );

    return alerts.slice(0, limit).map((a) => ({
      ...a,
      vendor: {
        name: vendorMap.get(a.vendorId)?.name ?? "Unknown Vendor",
        category: (vendorMap.get(a.vendorId) as Record<string, unknown>)
          ?.category as string | undefined,
      },
    }));
  },
});

// ============================================
// MUTATIONS (User-facing)
// ============================================

/**
 * T018: Dismiss anomaly alert.
 * User clicks "Dismiss" → sets status to dismissed with optional feedback.
 */
export const dismissAlert = mutation({
  args: {
    alertId: v.id("vendor_price_anomalies"),
    userFeedback: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const alert = await ctx.db.get(args.alertId);
    if (!alert) throw new Error("Alert not found");

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", alert.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    if (alert.status === "dismissed") {
      throw new Error("Alert already dismissed");
    }

    await ctx.db.patch(args.alertId, {
      status: "dismissed",
      dismissedTimestamp: Date.now(),
      userFeedback: args.userFeedback,
    });

    return { success: true };
  },
});
