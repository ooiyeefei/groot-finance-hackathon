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
import { internal } from "../_generated/api";
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
 * Import a batch of sales orders from CSV parser result.
 * Supports multi-line-item orders: rows with the same orderReference
 * are grouped into a single sales_order with embedded lineItems[].
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
        // Fee breakdown fields
        commissionFee: v.optional(v.number()),
        shippingFee: v.optional(v.number()),
        marketingFee: v.optional(v.number()),
        refundAmount: v.optional(v.number()),
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

    // Group rows by orderReference to handle multi-line-item orders
    const grouped = new Map<string, typeof args.orders>();
    for (const order of args.orders) {
      const ref = order.orderReference;
      const existing = grouped.get(ref);
      if (existing) {
        existing.push(order);
      } else {
        grouped.set(ref, [order]);
      }
    }

    for (const [orderRef, rows] of grouped) {
      // Check for duplicates
      const existing = await ctx.db
        .query("sales_orders")
        .withIndex("by_businessId_orderReference", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("orderReference", orderRef)
        )
        .first();

      if (existing) {
        duplicatesSkipped++;
        continue;
      }

      // Use first row for header-level fields
      const first = rows[0];

      // Build line items from all rows (if multiple rows or has product details)
      const lineItems = rows.length > 1 || first.productName
        ? rows.map((row, idx) => ({
            lineOrder: idx + 1,
            productName: row.productName,
            productCode: row.productCode,
            quantity: row.quantity ?? 1,
            unitPrice: row.unitPrice ?? row.grossAmount,
            totalAmount: row.grossAmount,
            description: row.productName,
          }))
        : undefined;

      // Aggregate amounts across all rows
      const grossAmount = rows.reduce((sum, r) => sum + r.grossAmount, 0);
      const platformFee = rows.reduce((sum, r) => sum + (r.platformFee ?? 0), 0) || undefined;
      const netAmount = rows.reduce((sum, r) => sum + (r.netAmount ?? 0), 0) || undefined;

      // Aggregate fee breakdown
      const commissionFee = rows.reduce((sum, r) => sum + (r.commissionFee ?? 0), 0);
      const shippingFee = rows.reduce((sum, r) => sum + (r.shippingFee ?? 0), 0);
      const marketingFee = rows.reduce((sum, r) => sum + (r.marketingFee ?? 0), 0);
      const refundAmount = rows.reduce((sum, r) => sum + (r.refundAmount ?? 0), 0);
      const hasFeeBreakdown = commissionFee || shippingFee || marketingFee || refundAmount;

      const feeBreakdown = hasFeeBreakdown
        ? {
            commissionFee: commissionFee || undefined,
            shippingFee: shippingFee || undefined,
            marketingFee: marketingFee || undefined,
            refundAmount: refundAmount || undefined,
            otherFee: platformFee && hasFeeBreakdown
              ? Math.max(0, (platformFee ?? 0) - commissionFee - shippingFee - marketingFee)
              : undefined,
          }
        : undefined;

      await ctx.db.insert("sales_orders", {
        businessId: args.businessId,
        sourcePlatform: args.sourcePlatform,
        sourceFileName: args.sourceFileName,
        importBatchId: args.importBatchId,
        orderReference: orderRef,
        orderDate: first.orderDate,
        customerName: first.customerName,
        productName: rows.length === 1 ? first.productName : undefined,
        productCode: rows.length === 1 ? first.productCode : undefined,
        quantity: rows.length === 1 ? first.quantity : undefined,
        unitPrice: rows.length === 1 ? first.unitPrice : undefined,
        lineItems,
        grossAmount,
        platformFee,
        netAmount,
        currency: first.currency ?? "MYR",
        paymentMethod: first.paymentMethod,
        feeBreakdown,
        matchStatus: "unmatched",
        periodStatus: "open",
        isRefund: first.isRefund ?? (grossAmount < 0),
        createdAt: now,
        updatedAt: now,
      });
      imported++;
    }

    return { imported, duplicatesSkipped, importBatchId: args.importBatchId };
  },
});

// ============================================
// MATCHING ENGINE HELPERS (pure functions, no imports needed)
// ============================================

/** Tokenize a string into lowercase word tokens */
function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean)
  );
}

/** Jaccard similarity between two token sets (0..1) */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Date proximity score: 1.0 for same day, decays over 30 days */
function dateProximityScore(dateA: string, dateB: string): number {
  const msA = new Date(dateA).getTime();
  const msB = new Date(dateB).getTime();
  if (isNaN(msA) || isNaN(msB)) return 0;
  const daysDiff = Math.abs(msA - msB) / (1000 * 60 * 60 * 24);
  if (daysDiff > 30) return 0;
  return 1 - daysDiff / 30;
}

/** Amount tolerance score: 1.0 for exact, decays with difference */
function amountScore(orderAmount: number, invoiceAmount: number): number {
  if (invoiceAmount === 0) return orderAmount === 0 ? 1 : 0;
  const pctDiff = Math.abs(orderAmount - invoiceAmount) / Math.abs(invoiceAmount);
  if (pctDiff > 0.25) return 0; // >25% off = no match
  return 1 - pctDiff * 4; // Linear decay, 0% = 1.0, 25% = 0.0
}

/** Build structured variance details between order and invoice */
function buildMatchVariances(
  order: { grossAmount: number; customerName?: string; productName?: string; quantity?: number },
  invoice: { totalAmount: number; customerSnapshot?: { businessName?: string }; lineItems?: Array<{ description?: string; quantity?: number }> },
): Array<{ field: string; orderValue: string; invoiceValue: string; difference?: number; severity: "info" | "warning" | "error" }> {
  const variances: Array<{ field: string; orderValue: string; invoiceValue: string; difference?: number; severity: "info" | "warning" | "error" }> = [];

  // Amount variance
  const amtDiff = order.grossAmount - invoice.totalAmount;
  if (Math.abs(amtDiff) >= 0.01) {
    const severity = Math.abs(amtDiff) / Math.abs(invoice.totalAmount || 1) > 0.1 ? "error" as const : "warning" as const;
    variances.push({
      field: "grossAmount",
      orderValue: order.grossAmount.toFixed(2),
      invoiceValue: invoice.totalAmount.toFixed(2),
      difference: amtDiff,
      severity,
    });
  }

  // Customer name variance
  const invoiceCustomerName = invoice.customerSnapshot?.businessName;
  if (order.customerName && invoiceCustomerName) {
    const sim = jaccardSimilarity(tokenize(order.customerName), tokenize(invoiceCustomerName));
    if (sim < 1.0) {
      variances.push({
        field: "customerName",
        orderValue: order.customerName,
        invoiceValue: invoiceCustomerName,
        severity: sim < 0.5 ? "warning" : "info",
      });
    }
  }

  return variances;
}

/**
 * Run matching engine for a batch of imported orders.
 * Phase 1: Exact reference matching
 * Phase 2: Fuzzy matching (customer + amount + date proximity)
 * Phase 3: Conflict detection
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
    // Track orders that Phase 1 didn't match (for Phase 2 fuzzy)
    const stillUnmatched: typeof unmatchedOrders = [];

    // ── Phase 1: Exact reference matching ──
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

        const grossAmount = order.grossAmount;
        const invoiceTotal = matchedInvoice.totalAmount;
        const diff = Math.abs(grossAmount - invoiceTotal);
        const tolerance = Math.max(invoiceTotal * 0.1, 5);
        const isExactMatch = diff < 0.01;
        const isWithinTolerance = diff <= tolerance;

        const matchVariances = buildMatchVariances(order, matchedInvoice);

        if (isExactMatch) {
          await ctx.db.patch(order._id, {
            matchStatus: "matched",
            matchedInvoiceId: matchedInvoice._id,
            matchConfidence: 1.0,
            matchMethod: "exact_reference",
            varianceAmount: 0,
            matchVariances: matchVariances.length > 0 ? matchVariances : undefined,
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
            varianceReason: `Amount difference: order ${grossAmount.toFixed(2)} vs invoice ${invoiceTotal.toFixed(2)}`,
            matchVariances,
            updatedAt: now,
          });
          variance++;
        } else {
          stillUnmatched.push(order);
        }
      } else {
        stillUnmatched.push(order);
      }
    }

    // ── Phase 2: Fuzzy matching for remaining unmatched ──
    // Already-claimed invoice IDs from Phase 1
    const claimedInvoiceIds = new Set(invoiceClaims.keys());

    for (const order of stillUnmatched) {
      // Score every unclaimed matchable invoice
      let bestScore = 0;
      let bestInvoice: typeof matchableInvoices[0] | null = null;

      for (const inv of matchableInvoices) {
        const invId = inv._id.toString();
        // Skip invoices already claimed by exact match
        if (claimedInvoiceIds.has(invId)) continue;

        // Weighted composite score
        const invCustomerName = inv.customerSnapshot?.businessName ?? "";
        const customerScore = order.customerName && invCustomerName
          ? jaccardSimilarity(tokenize(order.customerName), tokenize(invCustomerName))
          : 0;
        const amtSc = amountScore(order.grossAmount, inv.totalAmount);
        const dateSc = dateProximityScore(order.orderDate, inv.invoiceDate ?? "");

        // Weights: amount (50%), customer (30%), date (20%)
        const composite = amtSc * 0.5 + customerScore * 0.3 + dateSc * 0.2;

        if (composite > bestScore) {
          bestScore = composite;
          bestInvoice = inv;
        }
      }

      // Threshold: need >= 0.6 composite to consider a fuzzy match
      if (bestInvoice && bestScore >= 0.6) {
        const invoiceId = bestInvoice._id.toString();
        const claims = invoiceClaims.get(invoiceId) ?? [];
        claims.push(order._id.toString());
        invoiceClaims.set(invoiceId, claims);
        claimedInvoiceIds.add(invoiceId);

        const diff = Math.abs(order.grossAmount - bestInvoice.totalAmount);
        const isExactAmount = diff < 0.01;
        const matchVariances = buildMatchVariances(order, bestInvoice);

        await ctx.db.patch(order._id, {
          matchStatus: isExactAmount ? "matched" : "variance",
          matchedInvoiceId: bestInvoice._id,
          matchConfidence: Math.round(bestScore * 100) / 100,
          matchMethod: "fuzzy",
          varianceAmount: isExactAmount ? 0 : order.grossAmount - bestInvoice.totalAmount,
          varianceReason: isExactAmount
            ? undefined
            : `Fuzzy match (${(bestScore * 100).toFixed(0)}% confidence) — amount diff: ${(order.grossAmount - bestInvoice.totalAmount).toFixed(2)}`,
          matchVariances,
          updatedAt: now,
        });
        if (isExactAmount) matched++;
        else variance++;
      } else {
        unmatched++;
      }
    }

    // ── Phase 3: Conflict detection (multiple orders → same invoice) ──
    for (const [invoiceId, claimOrderIds] of invoiceClaims) {
      if (claimOrderIds.length > 1) {
        for (const orderId of claimOrderIds) {
          const order = orders.find((o) => o._id.toString() === orderId);
          if (order && (order.matchStatus === "matched" || order.matchStatus === "variance")) {
            await ctx.db.patch(order._id, {
              matchStatus: "conflict",
              updatedAt: now,
            });
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
        matchVariances: undefined,
        updatedAt: now,
      });
    } else if (args.matchedInvoiceId) {
      // Manual match — compute variance
      const invoice = await ctx.db.get(args.matchedInvoiceId);
      if (!invoice) throw new Error("Invoice not found");

      const diff = order.grossAmount - invoice.totalAmount;
      const isExact = Math.abs(diff) < 0.01;
      const matchVariances = buildMatchVariances(order, invoice);

      await ctx.db.patch(args.orderId, {
        matchStatus: isExact ? "matched" : "variance",
        matchedInvoiceId: args.matchedInvoiceId,
        matchConfidence: 1.0,
        matchMethod: "manual",
        varianceAmount: isExact ? 0 : diff,
        varianceReason: isExact ? undefined : `Manual match — amount difference: ${diff.toFixed(2)}`,
        matchVariances: matchVariances.length > 0 ? matchVariances : undefined,
        updatedAt: now,
      });
    }

    return { success: true };
  },
});

// ============================================
// LINE ITEM RECONCILIATION
// ============================================

/**
 * Reconcile line items between a sales order and its matched invoice.
 * Compares quantity, unit price, and total for each line item.
 */
export const reconcileLineItems = mutation({
  args: {
    orderId: v.id("sales_orders"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (!order.matchedInvoiceId) throw new Error("Order has no matched invoice");

    const invoice = await ctx.db.get(order.matchedInvoiceId);
    if (!invoice) throw new Error("Matched invoice not found");

    const now = Date.now();
    const variances: Array<{ field: string; orderValue: string; invoiceValue: string; difference?: number; severity: "info" | "warning" | "error" }> = [];

    // Start with header-level amount variance
    const headerVariances = buildMatchVariances(order, invoice);
    variances.push(...headerVariances);

    // Compare line items if both have them
    const orderItems = order.lineItems ?? [];
    const invoiceItems = (invoice.lineItems ?? []) as Array<{
      description?: string; quantity?: number; unitPrice?: number;
      totalAmount?: number; itemCode?: string;
    }>;

    if (orderItems.length > 0 && invoiceItems.length > 0) {
      // Match line items by product name/code similarity
      const usedInvoiceIndices = new Set<number>();

      for (const oItem of orderItems) {
        const oName = (oItem.productName ?? oItem.description ?? "").toLowerCase();
        const oCode = (oItem.productCode ?? "").toLowerCase();

        // Find best matching invoice line item
        let bestIdx = -1;
        let bestSim = 0;

        for (let i = 0; i < invoiceItems.length; i++) {
          if (usedInvoiceIndices.has(i)) continue;
          const iItem = invoiceItems[i];
          const iName = (iItem.description ?? "").toLowerCase();
          const iCode = (iItem.itemCode ?? "").toLowerCase();

          // Code match is strong signal
          let sim = 0;
          if (oCode && iCode && oCode === iCode) {
            sim = 1.0;
          } else if (oName && iName) {
            sim = jaccardSimilarity(tokenize(oName), tokenize(iName));
          }

          if (sim > bestSim) {
            bestSim = sim;
            bestIdx = i;
          }
        }

        if (bestIdx >= 0 && bestSim >= 0.4) {
          usedInvoiceIndices.add(bestIdx);
          const iItem = invoiceItems[bestIdx];
          const itemLabel = oItem.productName ?? oItem.description ?? `Line ${oItem.lineOrder}`;

          // Quantity variance
          const oQty = oItem.quantity;
          const iQty = iItem.quantity ?? 0;
          if (Math.abs(oQty - iQty) > 0.001) {
            variances.push({
              field: `lineItem.${itemLabel}.quantity`,
              orderValue: oQty.toString(),
              invoiceValue: iQty.toString(),
              difference: oQty - iQty,
              severity: "warning",
            });
          }

          // Unit price variance
          const oPrice = oItem.unitPrice;
          const iPrice = iItem.unitPrice ?? 0;
          if (Math.abs(oPrice - iPrice) > 0.01) {
            variances.push({
              field: `lineItem.${itemLabel}.unitPrice`,
              orderValue: oPrice.toFixed(2),
              invoiceValue: iPrice.toFixed(2),
              difference: oPrice - iPrice,
              severity: "warning",
            });
          }

          // Total amount variance
          const oTotal = oItem.totalAmount;
          const iTotal = iItem.totalAmount ?? 0;
          if (Math.abs(oTotal - iTotal) > 0.01) {
            variances.push({
              field: `lineItem.${itemLabel}.totalAmount`,
              orderValue: oTotal.toFixed(2),
              invoiceValue: iTotal.toFixed(2),
              difference: oTotal - iTotal,
              severity: Math.abs(oTotal - iTotal) / Math.abs(iTotal || 1) > 0.1 ? "error" : "warning",
            });
          }
        } else {
          // Order line item has no matching invoice line
          variances.push({
            field: `lineItem.${oItem.productName ?? `Line ${oItem.lineOrder}`}`,
            orderValue: "present",
            invoiceValue: "missing",
            severity: "error",
          });
        }
      }

      // Invoice line items not matched to any order line
      for (let i = 0; i < invoiceItems.length; i++) {
        if (!usedInvoiceIndices.has(i)) {
          variances.push({
            field: `lineItem.${invoiceItems[i].description ?? `Invoice Line ${i + 1}`}`,
            orderValue: "missing",
            invoiceValue: "present",
            severity: "error",
          });
        }
      }
    } else if (orderItems.length > 0 && invoiceItems.length === 0) {
      variances.push({
        field: "lineItems",
        orderValue: `${orderItems.length} items`,
        invoiceValue: "no line items",
        severity: "info",
      });
    }

    // Determine overall status from variances
    const hasErrors = variances.some((v) => v.severity === "error");
    const hasWarnings = variances.some((v) => v.severity === "warning");
    const newStatus = hasErrors ? "partial" : hasWarnings ? "variance" : order.matchStatus;

    await ctx.db.patch(args.orderId, {
      matchVariances: variances,
      matchStatus: newStatus as any,
      matchMethod: "line_item",
      updatedAt: now,
    });

    return { variances, status: newStatus };
  },
});

// ============================================
// PERIOD-BASED RECONCILIATION
// ============================================

/**
 * Close a reconciliation period — marks all matched/variance orders
 * within a date range as "closed", preventing further auto-matching.
 */
export const closePeriod = mutation({
  args: {
    businessId: v.id("businesses"),
    dateFrom: v.string(),
    dateTo: v.string(),
    closedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const now = Date.now();

    // Get all open orders in the date range
    const orders = await ctx.db
      .query("sales_orders")
      .withIndex("by_businessId_orderDate", (q) =>
        q.eq("businessId", args.businessId)
      )
      .collect();

    const inRange = orders.filter(
      (o) =>
        o.orderDate >= args.dateFrom &&
        o.orderDate <= args.dateTo &&
        o.periodStatus !== "closed"
    );

    let closed = 0;
    let disputed = 0;

    for (const order of inRange) {
      if (order.matchStatus === "matched" || order.matchStatus === "variance") {
        await ctx.db.patch(order._id, {
          periodStatus: "closed",
          periodClosedAt: now,
          periodClosedBy: args.closedBy,
          updatedAt: now,
        });
        closed++;
      } else if (order.matchStatus === "conflict" || order.matchStatus === "unmatched") {
        await ctx.db.patch(order._id, {
          periodStatus: "disputed",
          updatedAt: now,
        });
        disputed++;
      }
    }

    // Create journal entries for matched orders (accounting integration)
    let accounting: any = null;
    try {
      accounting = await ctx.runMutation(
        internal.functions.integrations.arReconciliationIntegration.createJournalEntriesFromReconciliation,
        {
          businessId: args.businessId,
          dateFrom: args.dateFrom,
          dateTo: args.dateTo,
          closedBy: args.closedBy,
        }
      );
    } catch (error: any) {
      console.error("[AR Recon] Failed to create accounting entries:", error);
      accounting = { error: error.message, ordersProcessed: 0, entriesCreated: 0 };
    }

    return { closed, disputed, total: inRange.length, accounting };
  },
});

/**
 * Reopen a closed period — reverts period status to "open"
 */
export const reopenPeriod = mutation({
  args: {
    businessId: v.id("businesses"),
    dateFrom: v.string(),
    dateTo: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const now = Date.now();

    const orders = await ctx.db
      .query("sales_orders")
      .withIndex("by_businessId_orderDate", (q) =>
        q.eq("businessId", args.businessId)
      )
      .collect();

    const inRange = orders.filter(
      (o) =>
        o.orderDate >= args.dateFrom &&
        o.orderDate <= args.dateTo &&
        (o.periodStatus === "closed" || o.periodStatus === "disputed")
    );

    for (const order of inRange) {
      await ctx.db.patch(order._id, {
        periodStatus: "open",
        periodClosedAt: undefined,
        periodClosedBy: undefined,
        updatedAt: now,
      });
    }

    return { reopened: inRange.length };
  },
});

// ============================================
// EXPORT HELPER QUERY
// ============================================

/**
 * Get detailed reconciliation data for export (CSV/report)
 */
export const getExportData = query({
  args: {
    businessId: v.id("businesses"),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    matchStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { orders: [] };

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
    if (args.matchStatus) {
      orders = orders.filter((o) => o.matchStatus === args.matchStatus);
    }

    // Enrich with matched invoice data
    const enriched = await Promise.all(
      orders.map(async (order) => {
        let invoiceNumber: string | undefined;
        let invoiceAmount: number | undefined;
        let invoiceDate: string | undefined;

        if (order.matchedInvoiceId) {
          const invoice = await ctx.db.get(order.matchedInvoiceId);
          if (invoice) {
            invoiceNumber = invoice.invoiceNumber;
            invoiceAmount = invoice.totalAmount;
            invoiceDate = invoice.invoiceDate;
          }
        }

        return {
          ...order,
          invoiceNumber,
          invoiceAmount,
          invoiceDate,
        };
      })
    );

    return { orders: enriched };
  },
});
