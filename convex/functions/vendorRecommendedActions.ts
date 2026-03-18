/**
 * Vendor Recommended Actions — Convex queries and mutations
 *
 * AI-generated recommended actions for addressing vendor anomalies.
 *
 * Feature: 001-smart-vendor-intelligence (#320)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";

/**
 * T060: Generate recommended actions after high-impact anomaly.
 */
export const generate = internalMutation({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.id("vendors"),
    anomalyAlertId: v.id("vendor_price_anomalies"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get the anomaly details
    const anomaly = await ctx.db.get(args.anomalyAlertId);
    if (!anomaly) return [];

    // Get vendor name
    const vendor = await ctx.db.get(args.vendorId);
    const vendorName = vendor?.name ?? "Unknown Vendor";

    const actions: Array<{
      actionType: "request-quotes" | "negotiate" | "review-contract";
      actionDescription: string;
      priorityLevel: "low" | "medium" | "high";
    }> = [];

    if (
      anomaly.severityLevel === "high-impact" &&
      anomaly.alertType === "trailing-average"
    ) {
      actions.push(
        {
          actionType: "request-quotes",
          actionDescription: `Request quotes from alternative vendors for ${anomaly.itemIdentifier ?? "affected items"}`,
          priorityLevel: "high",
        },
        {
          actionType: "negotiate",
          actionDescription: `Negotiate pricing with ${vendorName} — prices increased ${anomaly.percentageChange}% over 6 months`,
          priorityLevel: "medium",
        }
      );
    } else if (anomaly.alertType === "frequency-change") {
      actions.push({
        actionType: "review-contract",
        actionDescription: `Review contract terms — ${vendorName} changed billing frequency by ${anomaly.percentageChange}%`,
        priorityLevel: "medium",
      });
    } else if (
      anomaly.severityLevel === "high-impact" &&
      anomaly.alertType === "per-invoice"
    ) {
      actions.push({
        actionType: "negotiate",
        actionDescription: `Review pricing with ${vendorName} — ${anomaly.percentageChange}% increase on ${anomaly.itemIdentifier ?? "item"}`,
        priorityLevel: "high",
      });
    }

    const ids = [];
    for (const action of actions) {
      const id = await ctx.db.insert("vendor_recommended_actions", {
        businessId: args.businessId,
        vendorId: args.vendorId,
        anomalyAlertId: args.anomalyAlertId,
        ...action,
        status: "pending",
        createdTimestamp: now,
      });
      ids.push(id);
    }

    return ids;
  },
});

/**
 * T061: List recommended actions with filters.
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.optional(v.id("vendors")),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("completed"),
        v.literal("dismissed")
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

    let actions;
    if (args.vendorId && args.status) {
      actions = await ctx.db
        .query("vendor_recommended_actions")
        .withIndex("by_business_vendor_status", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("vendorId", args.vendorId!)
            .eq("status", args.status!)
        )
        .collect();
    } else {
      actions = await ctx.db
        .query("vendor_recommended_actions")
        .withIndex("by_business_vendor_status", (q) =>
          q.eq("businessId", args.businessId)
        )
        .collect();

      if (args.vendorId) {
        actions = actions.filter((a) => a.vendorId === args.vendorId);
      }
      if (args.status) {
        actions = actions.filter((a) => a.status === args.status);
      }
    }

    actions.sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    // Enrich with vendor names and anomaly context
    const vendorIds = [...new Set(actions.map((a) => a.vendorId))];
    const vendors = await Promise.all(vendorIds.map((id) => ctx.db.get(id)));
    const vendorMap = new Map(
      vendors.filter(Boolean).map((v) => [v!._id, v!])
    );

    return actions.slice(0, limit).map((a) => ({
      ...a,
      vendor: {
        name: vendorMap.get(a.vendorId)?.name ?? "Unknown Vendor",
      },
    }));
  },
});

/**
 * T062: Update action status (complete or dismiss).
 */
export const updateStatus = mutation({
  args: {
    actionId: v.id("vendor_recommended_actions"),
    status: v.union(v.literal("completed"), v.literal("dismissed")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const action = await ctx.db.get(args.actionId);
    if (!action) throw new Error("Action not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", action.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    const now = Date.now();
    const updateData: Record<string, unknown> = { status: args.status };

    if (args.status === "completed") {
      updateData.completedTimestamp = now;
    } else if (args.status === "dismissed") {
      updateData.dismissedTimestamp = now;
    }

    await ctx.db.patch(args.actionId, updateData);
    return { success: true };
  },
});
