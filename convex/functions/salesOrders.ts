/**
 * Sales Orders Functions - Convex queries and mutations
 *
 * Handles imported sales orders for AR reconciliation:
 * - Batch import from CSV parser results
 * - Reconciliation summary queries
 * - Match status updates (auto + manual)
 * - Duplicate detection
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";
import {
  salesOrderMatchStatusValidator,
  salesOrderMatchMethodValidator,
} from "../lib/validators";

// ============================================
// QUERIES
// ============================================

/**
 * List sales orders with filtering
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    matchStatus: v.optional(v.string()),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    sourcePlatform: v.optional(v.string()),
    importBatchId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { orders: [] };

    let ordersQuery;

    if (args.matchStatus) {
      ordersQuery = ctx.db
        .query("sales_orders")
        .withIndex("by_businessId_matchStatus", (q) =>
          q.eq("businessId", args.businessId).eq("matchStatus", args.matchStatus as any)
        );
    } else if (args.importBatchId) {
      const batchId = args.importBatchId;
      ordersQuery = ctx.db
        .query("sales_orders")
        .withIndex("by_businessId_importBatchId", (q) =>
          q.eq("businessId", args.businessId).eq("importBatchId", batchId)
        );
    } else {
      ordersQuery = ctx.db
        .query("sales_orders")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", args.businessId)
        );
    }

    let orders = await ordersQuery.collect();

    // Apply date filters in memory (Convex doesn't support range + equality combo well)
    if (args.dateFrom) {
      orders = orders.filter((o) => o.orderDate >= args.dateFrom!);
    }
    if (args.dateTo) {
      orders = orders.filter((o) => o.orderDate <= args.dateTo!);
    }
    if (args.sourcePlatform) {
      orders = orders.filter((o) => o.sourcePlatform === args.sourcePlatform);
    }

    // Sort by date descending
    orders.sort((a, b) => b.orderDate.localeCompare(a.orderDate));

    // Apply limit
    if (args.limit) {
      orders = orders.slice(0, args.limit);
    }

    return { orders };
  },
});

/**
 * Get reconciliation summary counts
 */
export const getReconciliationSummary = query({
  args: {
    businessId: v.id("businesses"),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        totalOrders: 0, matched: 0, unmatched: 0, variance: 0,
        partial: 0, conflict: 0, totalGrossAmount: 0,
        totalVarianceAmount: 0, totalPlatformFees: 0,
      };
    }

    let orders = await ctx.db
      .query("sales_orders")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    if (args.dateFrom) {
      orders = orders.filter((o) => o.orderDate >= args.dateFrom!);
    }
    if (args.dateTo) {
      orders = orders.filter((o) => o.orderDate <= args.dateTo!);
    }

    return {
      totalOrders: orders.length,
      matched: orders.filter((o) => o.matchStatus === "matched").length,
      unmatched: orders.filter((o) => o.matchStatus === "unmatched").length,
      variance: orders.filter((o) => o.matchStatus === "variance").length,
      partial: orders.filter((o) => o.matchStatus === "partial").length,
      conflict: orders.filter((o) => o.matchStatus === "conflict").length,
      totalGrossAmount: orders.reduce((sum, o) => sum + o.grossAmount, 0),
      totalVarianceAmount: orders.reduce((sum, o) => sum + (o.varianceAmount ?? 0), 0),
      totalPlatformFees: orders.reduce((sum, o) => sum + (o.platformFee ?? 0), 0),
    };
  },
});

/**
 * Detect duplicate orders before import
 */
export const detectDuplicates = query({
  args: {
    businessId: v.id("businesses"),
    orderReferences: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { duplicates: [] };

    const duplicates: string[] = [];
    for (const ref of args.orderReferences) {
      const existing = await ctx.db
        .query("sales_orders")
        .withIndex("by_businessId_orderReference", (q) =>
          q.eq("businessId", args.businessId).eq("orderReference", ref)
        )
        .first();
      if (existing) {
        duplicates.push(ref);
      }
    }

    return { duplicates };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Import a batch of sales orders from CSV parser result
 */
export const importBatch = mutation({
  args: {
    businessId: v.id("businesses"),
    orders: v.array(
      v.object({
        orderReference: v.string(),
        orderDate: v.string(),
        customerName: v.optional(v.string()),
        productName: v.optional(v.string()),
        productCode: v.optional(v.string()),
        quantity: v.optional(v.number()),
        unitPrice: v.optional(v.number()),
        grossAmount: v.number(),
        platformFee: v.optional(v.number()),
        netAmount: v.optional(v.number()),
        currency: v.string(),
        paymentMethod: v.optional(v.string()),
        isRefund: v.optional(v.boolean()),
      })
    ),
    sourcePlatform: v.string(),
    sourceFileName: v.string(),
    importBatchId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const now = Date.now();
    let imported = 0;
    let duplicatesSkipped = 0;

    for (const order of args.orders) {
      // Check for duplicates
      const existing = await ctx.db
        .query("sales_orders")
        .withIndex("by_businessId_orderReference", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("orderReference", order.orderReference)
        )
        .first();

      if (existing) {
        duplicatesSkipped++;
        continue;
      }

      await ctx.db.insert("sales_orders", {
        businessId: args.businessId,
        sourcePlatform: args.sourcePlatform,
        sourceFileName: args.sourceFileName,
        importBatchId: args.importBatchId,
        orderReference: order.orderReference,
        orderDate: order.orderDate,
        customerName: order.customerName,
        productName: order.productName,
        productCode: order.productCode,
        quantity: order.quantity,
        unitPrice: order.unitPrice,
        grossAmount: order.grossAmount,
        platformFee: order.platformFee,
        netAmount: order.netAmount,
        currency: order.currency ?? "MYR",
        paymentMethod: order.paymentMethod,
        matchStatus: "unmatched",
        isRefund: order.isRefund ?? (order.grossAmount < 0),
        createdAt: now,
        updatedAt: now,
      });
      imported++;
    }

    return { imported, duplicatesSkipped, importBatchId: args.importBatchId };
  },
});

/**
 * Run matching engine for a batch of imported orders
 */
export const runMatching = mutation({
  args: {
    businessId: v.id("businesses"),
    importBatchId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Get all unmatched orders from this batch
    const orders = await ctx.db
      .query("sales_orders")
      .withIndex("by_businessId_importBatchId", (q) =>
        q.eq("businessId", args.businessId).eq("importBatchId", args.importBatchId)
      )
      .collect();

    const unmatchedOrders = orders.filter((o) => o.matchStatus === "unmatched");

    // Get all outstanding invoices for this business
    const invoices = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Only match against non-void, non-draft invoices
    const matchableInvoices = invoices.filter(
      (inv) => inv.status !== "void" && inv.status !== "draft"
    );

    let matched = 0;
    let variance = 0;
    let unmatched = 0;
    let conflicts = 0;
    const now = Date.now();

    // Track which invoices have been claimed (for conflict detection)
    const invoiceClaims = new Map<string, string[]>(); // invoiceId -> orderIds

    // Phase 1: Exact reference matching
    for (const order of unmatchedOrders) {
      const ref = order.orderReference.trim().toLowerCase();

      const matchedInvoice = matchableInvoices.find((inv) => {
        const invNum = (inv.invoiceNumber ?? "").trim().toLowerCase();
        return invNum === ref || invNum.includes(ref) || ref.includes(invNum);
      });

      if (matchedInvoice) {
        const invoiceId = matchedInvoice._id.toString();
        const claims = invoiceClaims.get(invoiceId) ?? [];
        claims.push(order._id.toString());
        invoiceClaims.set(invoiceId, claims);

        // Calculate variance
        const grossAmount = order.grossAmount;
        const invoiceTotal = matchedInvoice.totalAmount;
        const feeAdjusted = grossAmount - (order.platformFee ?? 0);
        const diff = Math.abs(grossAmount - invoiceTotal);

        // Tolerance: 10% of invoice total or RM 5, whichever is greater
        const tolerance = Math.max(invoiceTotal * 0.1, 5);

        const isWithinTolerance = diff <= tolerance;
        const isExactMatch = diff < 0.01;

        if (isExactMatch) {
          await ctx.db.patch(order._id, {
            matchStatus: "matched",
            matchedInvoiceId: matchedInvoice._id,
            matchConfidence: 1.0,
            matchMethod: "exact_reference",
            varianceAmount: 0,
            updatedAt: now,
          });
          matched++;
        } else if (isWithinTolerance) {
          await ctx.db.patch(order._id, {
            matchStatus: "variance",
            matchedInvoiceId: matchedInvoice._id,
            matchConfidence: 0.9,
            matchMethod: "exact_reference",
            varianceAmount: grossAmount - invoiceTotal,
            varianceReason: `Amount difference: order ${grossAmount} vs invoice ${invoiceTotal} (platform fee: ${order.platformFee ?? 0})`,
            updatedAt: now,
          });
          variance++;
        } else {
          // Too far apart — leave unmatched
          unmatched++;
        }
      } else {
        unmatched++;
      }
    }

    // Phase 2: Detect conflicts (multiple orders claiming same invoice)
    for (const [invoiceId, claimOrderIds] of invoiceClaims) {
      if (claimOrderIds.length > 1) {
        // Mark all competing orders as conflict
        for (const orderId of claimOrderIds) {
          const order = orders.find((o) => o._id.toString() === orderId);
          if (order && (order.matchStatus === "matched" || order.matchStatus === "variance")) {
            await ctx.db.patch(order._id, {
              matchStatus: "conflict",
              updatedAt: now,
            });
            // Adjust counts
            if (order.matchStatus === "matched") matched--;
            if (order.matchStatus === "variance") variance--;
            conflicts++;
          }
        }
      }
    }

    return { matched, variance, unmatched, conflicts };
  },
});

/**
 * Manually update match status for an order
 */
export const updateMatchStatus = mutation({
  args: {
    orderId: v.id("sales_orders"),
    matchedInvoiceId: v.optional(v.id("sales_invoices")),
    matchStatus: salesOrderMatchStatusValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const now = Date.now();

    if (args.matchStatus === "unmatched") {
      // Unmatch — clear match fields
      await ctx.db.patch(args.orderId, {
        matchStatus: "unmatched",
        matchedInvoiceId: undefined,
        matchConfidence: undefined,
        matchMethod: undefined,
        varianceAmount: undefined,
        varianceReason: undefined,
        updatedAt: now,
      });
    } else if (args.matchedInvoiceId) {
      // Manual match — compute variance
      const invoice = await ctx.db.get(args.matchedInvoiceId);
      if (!invoice) throw new Error("Invoice not found");

      const diff = order.grossAmount - invoice.totalAmount;
      const isExact = Math.abs(diff) < 0.01;

      await ctx.db.patch(args.orderId, {
        matchStatus: isExact ? "matched" : "variance",
        matchedInvoiceId: args.matchedInvoiceId,
        matchConfidence: 1.0,
        matchMethod: "manual",
        varianceAmount: isExact ? 0 : diff,
        varianceReason: isExact ? undefined : `Manual match — amount difference: ${diff.toFixed(2)}`,
        updatedAt: now,
      });
    }

    return { success: true };
  },
});
