/**
 * Vendor Intelligence MCP — Convex queries for chat agent / MCP tool
 *
 * T066: analyzeVendorPricing query callable by chat agent
 * via MCP `analyzeVendorPricing` tool or direct Convex query.
 *
 * Feature: 001-smart-vendor-intelligence (#320)
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

/**
 * T066: Analyze vendor pricing — returns structured response for chat agent.
 * Accepts businessId + optional vendorId/dateRange.
 * Returns anomalies, affected items, recommended actions.
 */
export const analyzeVendorPricing = internalQuery({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.optional(v.id("vendors")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const startDate = args.startDate ?? new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Get anomalies (limit for bandwidth)
    let anomalies;
    if (args.vendorId) {
      anomalies = await ctx.db
        .query("vendor_price_anomalies")
        .withIndex("by_business_vendor_status", (q) =>
          q.eq("businessId", args.businessId).eq("vendorId", args.vendorId!)
        )
        .take(50);
    } else {
      anomalies = await ctx.db
        .query("vendor_price_anomalies")
        .withIndex("by_created_date", (q) =>
          q.eq("businessId", args.businessId)
        )
        .take(50);
    }

    // Filter by date range and active status
    const filtered = anomalies.filter((a) => {
      const dateStr = new Date(a.createdTimestamp).toISOString().split("T")[0];
      return (
        a.status === "active" &&
        dateStr >= startDate &&
        (!args.endDate || dateStr <= args.endDate)
      );
    });

    // Enrich with vendor names
    const vendorIds = [...new Set(filtered.map((a) => a.vendorId))];
    const vendors = await Promise.all(vendorIds.map((id) => ctx.db.get(id)));
    const vendorMap = new Map(
      vendors.filter(Boolean).map((v) => [v!._id.toString(), v!.name])
    );

    // Get recommended actions
    const actions = await ctx.db
      .query("vendor_recommended_actions")
      .withIndex("by_business_vendor_status", (q) =>
        q.eq("businessId", args.businessId)
      )
      .take(20);

    const pendingActions = actions.filter((a) => a.status === "pending");

    // Build response
    const totalAnomalies = filtered.length;
    const highImpact = filtered.filter((a) => a.severityLevel === "high-impact");

    // Group affected items by vendor
    const affectedItems = filtered.map((a) => ({
      vendorName: vendorMap.get(a.vendorId.toString()) ?? "Unknown",
      itemIdentifier: a.itemIdentifier ?? "N/A",
      alertType: a.alertType,
      oldValue: a.oldValue,
      newValue: a.newValue,
      percentageChange: a.percentageChange,
      severityLevel: a.severityLevel,
    }));

    // Generate summary text for chat agent
    const topVendors = [...new Set(highImpact.map((a) => vendorMap.get(a.vendorId.toString()) ?? "Unknown"))].slice(0, 3);
    const summary = totalAnomalies === 0
      ? "No price anomalies detected in the selected period."
      : `Found ${totalAnomalies} price anomal${totalAnomalies === 1 ? "y" : "ies"} (${highImpact.length} high-impact). ${topVendors.length > 0 ? `Top affected vendors: ${topVendors.join(", ")}.` : ""} ${pendingActions.length > 0 ? `${pendingActions.length} recommended actions pending.` : ""}`;

    return {
      summary,
      totalAnomaliesDetected: totalAnomalies,
      highImpactAnomaliesCount: highImpact.length,
      affectedItems: affectedItems.slice(0, 20),
      recommendedActions: pendingActions.slice(0, 10).map((a) => ({
        actionType: a.actionType,
        description: a.actionDescription,
        priority: a.priorityLevel,
      })),
      dateRange: { start: startDate, end: args.endDate ?? "now" },
    };
  },
});
