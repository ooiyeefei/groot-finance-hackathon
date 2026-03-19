/**
 * Order Matching Corrections — CRUD for AR match correction training data
 */

import { v } from "convex/values";
import { mutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId } from "../lib/resolvers";

/**
 * Create a correction when user overrides an AI match suggestion.
 * Deduplicates by (businessId, orderReference) — latest correction overwrites.
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    salesOrderId: v.id("sales_orders"),
    originalSuggestedInvoiceId: v.optional(v.id("sales_invoices")),
    originalConfidence: v.optional(v.number()),
    originalReasoning: v.optional(v.string()),
    correctedInvoiceId: v.id("sales_invoices"),
    correctionType: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    // Get order details
    const order = await ctx.db.get(args.salesOrderId);
    if (!order) throw new Error("Sales order not found");

    // Get corrected invoice details
    const invoice = await ctx.db.get(args.correctedInvoiceId);
    if (!invoice) throw new Error("Invoice not found");

    // Deduplicate by (businessId, orderReference)
    const existing = await ctx.db
      .query("order_matching_corrections")
      .withIndex("by_businessId_orderReference", (q) =>
        q.eq("businessId", args.businessId).eq("orderReference", order.orderReference)
      )
      .first();

    if (existing) {
      // Overwrite existing correction
      await ctx.db.patch(existing._id, {
        orderCustomerName: order.customerName ?? "",
        orderAmount: order.grossAmount,
        orderDate: order.orderDate,
        originalSuggestedInvoiceId: args.originalSuggestedInvoiceId,
        originalConfidence: args.originalConfidence,
        originalReasoning: args.originalReasoning,
        correctedInvoiceId: args.correctedInvoiceId,
        correctedInvoiceNumber: invoice.invoiceNumber ?? "",
        correctedInvoiceCustomerName: invoice.customerSnapshot?.businessName ?? "",
        correctedInvoiceAmount: invoice.totalAmount,
        correctionType: args.correctionType,
        createdBy: identity.subject,
        createdAt: Date.now(),
      });
      // Record override for DSPy metrics (027-dspy-dash)
      await ctx.scheduler.runAfter(0, internal.functions.dspyMetrics.recordOverride, {
        businessId: args.businessId,
        tool: "match_orders",
      });

      return { updated: true, correctionId: existing._id };
    }

    // Create new correction
    const correctionId = await ctx.db.insert("order_matching_corrections", {
      businessId: args.businessId,
      orderReference: order.orderReference,
      orderCustomerName: order.customerName ?? "",
      orderAmount: order.grossAmount,
      orderDate: order.orderDate,
      originalSuggestedInvoiceId: args.originalSuggestedInvoiceId,
      originalConfidence: args.originalConfidence,
      originalReasoning: args.originalReasoning,
      correctedInvoiceId: args.correctedInvoiceId,
      correctedInvoiceNumber: invoice.invoiceNumber ?? "",
      correctedInvoiceCustomerName: invoice.customerSnapshot?.businessName ?? "",
      correctedInvoiceAmount: invoice.totalAmount,
      correctionType: args.correctionType,
      createdBy: identity.subject,
      createdAt: Date.now(),
    });

    // Record override for DSPy metrics (027-dspy-dash)
    await ctx.scheduler.runAfter(0, internal.functions.dspyMetrics.recordOverride, {
      businessId: args.businessId,
      tool: "match_orders",
    });

    return { updated: false, correctionId };
  },
});

/**
 * List corrections for a business (for training data export).
 */
export const listByBusiness = internalQuery({
  args: {
    businessId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const corrections = await ctx.db
      .query("order_matching_corrections")
      .withIndex("by_businessId_createdAt", (q) =>
        q.eq("businessId", args.businessId as any)
      )
      .order("desc")
      .collect();

    const limited = args.limit ? corrections.slice(0, args.limit) : corrections;

    return limited.map((c) => ({
      _id: c._id,
      orderReference: c.orderReference,
      orderCustomerName: c.orderCustomerName,
      orderAmount: c.orderAmount,
      orderDate: c.orderDate,
      correctedInvoiceNumber: c.correctedInvoiceNumber,
      correctedInvoiceCustomerName: c.correctedInvoiceCustomerName,
      correctedInvoiceAmount: c.correctedInvoiceAmount,
      correctionType: c.correctionType,
    }));
  },
});

/**
 * Count corrections and unique customers for a business (optimization safeguards).
 */
export const countByBusiness = internalQuery({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const corrections = await ctx.db
      .query("order_matching_corrections")
      .withIndex("by_businessId_createdAt", (q) =>
        q.eq("businessId", args.businessId as any)
      )
      .collect();

    const uniqueCustomers = new Set(
      corrections.map((c) => c.orderCustomerName.toLowerCase().trim())
    );

    const latestCorrectionId = corrections.length > 0
      ? corrections.reduce((latest, c) => (c._id > latest ? c._id : latest), corrections[0]._id)
      : null;

    return {
      totalCorrections: corrections.length,
      uniqueCustomerNames: uniqueCustomers.size,
      latestCorrectionId: latestCorrectionId ? String(latestCorrectionId) : null,
    };
  },
});
