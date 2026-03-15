/**
 * Fee Classification Corrections — Stores user corrections as training data
 *
 * When a bookkeeper corrects a fee classification in the review UI,
 * the correction is stored here for future Tier 2 model training.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

/**
 * Record a user correction to a fee classification.
 * Also updates the sales_order's classifiedFees array with the correction.
 */
export const recordCorrection = mutation({
  args: {
    businessId: v.id("businesses"),
    salesOrderId: v.id("sales_orders"),
    feeIndex: v.number(),
    originalFeeName: v.string(),
    originalAccountCode: v.string(),
    correctedAccountCode: v.string(),
    correctedAccountName: v.string(),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // 1. Store the correction as training data
    await ctx.db.insert("fee_classification_corrections", {
      businessId: args.businessId,
      originalFeeName: args.originalFeeName,
      originalAccountCode: args.originalAccountCode,
      correctedAccountCode: args.correctedAccountCode,
      platform: args.platform,
      salesOrderId: args.salesOrderId,
      correctedBy: identity.subject,
    });

    // 2. Update the classifiedFees on the sales order
    const order = await ctx.db.get(args.salesOrderId);
    if (!order) throw new Error("Order not found");

    const classifiedFees = [...(order.classifiedFees ?? [])];
    if (args.feeIndex >= 0 && args.feeIndex < classifiedFees.length) {
      classifiedFees[args.feeIndex] = {
        ...classifiedFees[args.feeIndex],
        accountCode: args.correctedAccountCode,
        accountName: args.correctedAccountName,
        confidence: 1.0, // User-corrected = 100% confidence
        tier: 1, // Treat as Tier 1 after correction
        isNew: false,
      };
    }

    await ctx.db.patch(args.salesOrderId, {
      classifiedFees,
      feeClassificationStatus: "reviewed",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * List corrections for a business (for training data export).
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    platform: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { corrections: [] };

    let corrections;
    if (args.platform) {
      corrections = await ctx.db
        .query("fee_classification_corrections")
        .withIndex("by_businessId_platform", (q) =>
          q.eq("businessId", args.businessId).eq("platform", args.platform!)
        )
        .collect();
    } else {
      corrections = await ctx.db
        .query("fee_classification_corrections")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", args.businessId)
        )
        .collect();
    }

    if (args.limit) {
      corrections = corrections.slice(0, args.limit);
    }

    return { corrections };
  },
});
