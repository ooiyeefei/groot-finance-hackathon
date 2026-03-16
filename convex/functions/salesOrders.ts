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
import { query, mutation, internalAction, internalQuery, internalMutation } from "../_generated/server";
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

/** Normalize customer/vendor name for alias matching */
function normalizeAlias(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\b(sdn\.?\s*bhd\.?|plt|inc\.?|ltd\.?|corp\.?|co\.?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
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

    // ── Phase 4: Mark Tier 1 matches and collect Tier 2 candidates ──
    // Tag matched orders with aiMatchTier=1 so we can distinguish Tier 1 vs Tier 2 in metrics
    const tier2CandidateIds: string[] = [];
    for (const order of orders) {
      const currentOrder = await ctx.db.get(order._id);
      if (!currentOrder) continue;

      if (currentOrder.matchStatus === "matched" || currentOrder.matchStatus === "variance") {
        // Tier 1 match — tag it
        if (currentOrder.aiMatchTier == null) {
          await ctx.db.patch(order._id, { aiMatchTier: 1, updatedAt: now });
        }
      } else if (currentOrder.matchStatus === "unmatched") {
        // Tier 1 miss — candidate for Tier 2 AI matching
        await ctx.db.patch(order._id, { aiMatchTier: 0, updatedAt: now });
        tier2CandidateIds.push(order._id.toString());
      }
    }

    // ── Phase 5: Schedule Tier 2 AI matching for unmatched orders ──
    if (tier2CandidateIds.length > 0) {
      try {
        await ctx.scheduler.runAfter(0, internal.functions.salesOrders.classifyUnmatchedOrdersWithAI, {
          businessId: args.businessId.toString(),
          unmatchedOrderIds: tier2CandidateIds,
        });
        console.log(`[AR Match] Scheduled Tier 2 AI matching for ${tier2CandidateIds.length} unmatched orders`);
      } catch (error) {
        // Non-fatal — Tier 1 results are still valid, Tier 2 is additive
        console.error("[AR Match] Failed to schedule Tier 2 AI matching:", error);
      }
    }

    return { matched, variance, unmatched, conflicts, tier2Scheduled: tier2CandidateIds.length };
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
        aiMatchStatus: order.aiMatchSuggestions ? "corrected" : undefined,
        updatedAt: now,
      });

      // ── Learning Loop: Auto-capture correction for DSPy training ──
      // If the order had AI suggestions, this manual match is a correction
      if (order.aiMatchSuggestions && order.aiMatchSuggestions.length > 0) {
        const topSuggestion = order.aiMatchSuggestions[0];
        const isSameInvoice = topSuggestion.invoiceId === args.matchedInvoiceId.toString();

        if (!isSameInvoice) {
          // AI suggested wrong invoice → "wrong_match" correction
          await ctx.db.insert("order_matching_corrections", {
            businessId: order.businessId,
            orderReference: order.orderReference,
            orderCustomerName: order.customerName ?? "",
            orderAmount: order.grossAmount,
            orderDate: order.orderDate,
            originalSuggestedInvoiceId: topSuggestion.invoiceId as any,
            originalConfidence: topSuggestion.confidence,
            originalReasoning: topSuggestion.reasoning,
            correctedInvoiceId: args.matchedInvoiceId,
            correctedInvoiceNumber: invoice.invoiceNumber ?? "",
            correctedInvoiceCustomerName: invoice.customerSnapshot?.businessName ?? "",
            correctedInvoiceAmount: invoice.totalAmount,
            correctionType: "wrong_match",
            createdBy: identity.subject,
            createdAt: now,
          });
        }
      } else if (order.aiMatchTier === 2 || order.aiMatchTier === 0) {
        // AI found no match but user found one → "missed_match" correction
        await ctx.db.insert("order_matching_corrections", {
          businessId: order.businessId,
          orderReference: order.orderReference,
          orderCustomerName: order.customerName ?? "",
          orderAmount: order.grossAmount,
          orderDate: order.orderDate,
          correctedInvoiceId: args.matchedInvoiceId,
          correctedInvoiceNumber: invoice.invoiceNumber ?? "",
          correctedInvoiceCustomerName: invoice.customerSnapshot?.businessName ?? "",
          correctedInvoiceAmount: invoice.totalAmount,
          correctionType: "missed_match",
          createdBy: identity.subject,
          createdAt: now,
        });
      }
    }

    return { success: true };
  },
});

/**
 * Approve AI-suggested matches (bulk).
 * Takes the top suggestion for each order and confirms it.
 */
export const approveAiMatches = mutation({
  args: {
    salesOrderIds: v.array(v.id("sales_orders")),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const now = Date.now();
    let approved = 0;

    for (const orderId of args.salesOrderIds) {
      const order = await ctx.db.get(orderId);
      if (!order || order.businessId !== args.businessId) continue;
      if (!order.aiMatchSuggestions || order.aiMatchSuggestions.length === 0) continue;

      const topSuggestion = order.aiMatchSuggestions[0];
      const diff = Math.abs(order.grossAmount - topSuggestion.allocatedAmount);
      const isExactAmount = diff < 0.01;

      await ctx.db.patch(orderId, {
        matchStatus: isExactAmount ? "matched" : "variance",
        matchedInvoiceId: topSuggestion.invoiceId as any,
        matchConfidence: topSuggestion.confidence,
        matchMethod: "ai_suggested",
        varianceAmount: isExactAmount ? 0 : order.grossAmount - topSuggestion.allocatedAmount,
        varianceReason: isExactAmount ? undefined : `AI match — amount diff: ${(order.grossAmount - topSuggestion.allocatedAmount).toFixed(2)}`,
        aiMatchStatus: "approved",
        updatedAt: now,
      });
      approved++;
    }

    return { approved };
  },
});

/**
 * Reject an AI match suggestion.
 */
export const rejectAiMatch = mutation({
  args: {
    salesOrderId: v.id("sales_orders"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const order = await ctx.db.get(args.salesOrderId);
    if (!order || order.businessId !== args.businessId) throw new Error("Order not found");

    const now = Date.now();

    // ── Learning Loop: Capture false_positive correction ──
    // AI suggested a match but user rejected it entirely
    if (order.aiMatchSuggestions && order.aiMatchSuggestions.length > 0) {
      const topSuggestion = order.aiMatchSuggestions[0];
      await ctx.db.insert("order_matching_corrections", {
        businessId: order.businessId,
        orderReference: order.orderReference,
        orderCustomerName: order.customerName ?? "",
        orderAmount: order.grossAmount,
        orderDate: order.orderDate,
        originalSuggestedInvoiceId: topSuggestion.invoiceId as any,
        originalConfidence: topSuggestion.confidence,
        originalReasoning: topSuggestion.reasoning,
        // For false_positive, we still need a correctedInvoiceId — use the original
        // suggestion as a "negative example" marker
        correctedInvoiceId: topSuggestion.invoiceId as any,
        correctedInvoiceNumber: topSuggestion.invoiceNumber,
        correctedInvoiceCustomerName: "",
        correctedInvoiceAmount: topSuggestion.allocatedAmount,
        correctionType: "false_positive",
        createdBy: identity.subject,
        createdAt: now,
      });
    }

    await ctx.db.patch(args.salesOrderId, {
      aiMatchStatus: "rejected",
      aiMatchSuggestions: undefined,
      updatedAt: now,
    });

    return { success: true };
  },
});

/**
 * Tier 2 AI matching — classifies unmatched orders using DSPy via MCP Lambda.
 * Called internally after Tier 1 matching completes.
 */
export const classifyUnmatchedOrdersWithAI = internalAction({
  args: {
    businessId: v.string(),
    unmatchedOrderIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _internal: any = require("../_generated/api").internal;
    const { callMCPTool } = require("../lib/mcpClient");

    if (args.unmatchedOrderIds.length === 0) return { processed: 0 };

    // Get corrections for this business (for few-shot learning)
    const corrections = await ctx.runQuery(
      _internal.functions.orderMatchingCorrections.listByBusiness,
      { businessId: args.businessId, limit: 50 }
    );

    // Get active model version
    const activeModel = await ctx.runQuery(
      _internal.functions.dspyModelVersions.getActiveModel,
      { platform: `ar_match_${args.businessId}` }
    );

    // Get all candidate invoices
    // Note: We can't query db directly in internalAction, so we use a helper query
    // For now, we'll process orders via the MCP Lambda which handles matching
    let processed = 0;

    for (const orderIdStr of args.unmatchedOrderIds) {
      try {
        // Get order details via internal query
        const orderData = await ctx.runQuery(
          _internal.functions.salesOrders.getOrderForAIMatching,
          { orderId: orderIdStr, businessId: args.businessId }
        );

        if (!orderData) continue;

        interface MatchResult {
          matches: Array<{
            invoiceId: string;
            invoiceNumber: string;
            allocatedAmount: number;
            matchType: string;
          }>;
          totalAllocated: number;
          variance: number;
          confidence: number;
          reasoning: string;
          constraintResults: Record<string, string>;
          usedDspy: boolean;
          modelVersion: string | null;
          correctionCount: number;
        }

        const result = await callMCPTool({
          toolName: "match_orders",
          businessId: args.businessId,
          args: {
            order: orderData.order,
            candidateInvoices: orderData.candidateInvoices,
            corrections: corrections ?? [],
            modelS3Key: activeModel?.s3Key ?? null,
            maxSplitInvoices: 5,
            amountTolerancePercent: 1.5,
            amountToleranceAbsolute: 5.0,
          },
        }) as MatchResult | null;

        if (result && result.matches && result.matches.length > 0) {
          // Store AI suggestions on the order
          await ctx.runMutation(
            _internal.functions.salesOrders.updateAiMatchSuggestions,
            {
              orderId: orderIdStr,
              suggestions: result.matches.map((m: any) => ({
                invoiceId: m.invoiceId,
                invoiceNumber: m.invoiceNumber,
                allocatedAmount: m.allocatedAmount,
                confidence: result.confidence,
                reasoning: result.reasoning,
                matchType: m.matchType ?? "single",
              })),
              modelVersion: result.modelVersion ?? activeModel?.s3Key ?? null,
            }
          );

          // === Triple-Lock Auto-Approval Gate ===
          if (result.matches.length === 1) {
            // Only evaluate single matches for auto-approval (split matches always need review)
            const tripleLock = await ctx.runQuery(
              _internal.functions.salesOrders.evaluateTripleLock,
              {
                businessId: args.businessId,
                confidence: result.confidence,
                customerName: orderData.order.customerName,
                matchType: result.matches[0].matchType ?? "single",
              }
            );

            if (tripleLock.pass) {
              // Auto-approve: update match status and post journal entry
              await ctx.runMutation(
                _internal.functions.salesOrders.autoApproveMatch,
                {
                  orderId: orderIdStr,
                  businessId: args.businessId,
                  invoiceId: result.matches[0].invoiceId,
                  confidence: result.confidence,
                  reasoning: result.reasoning,
                  tripleLockResult: JSON.stringify(tripleLock),
                }
              );
              console.log(`[AR Match AI] Auto-approved order ${orderIdStr} (confidence: ${result.confidence}, cycles: ${tripleLock.lock3.cycles})`);
            }
          }

          processed++;
        }
      } catch (error) {
        console.error(`[AR Match AI] Failed to process order ${orderIdStr}:`, error);
      }
    }

    return { processed };
  },
});

/**
 * Internal query: Get order + candidate invoices for AI matching.
 */
export const getOrderForAIMatching = internalQuery({
  args: {
    orderId: v.string(),
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the order
    const allOrders = await ctx.db
      .query("sales_orders")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId as any))
      .collect();

    const order = allOrders.find((o) => o._id.toString() === args.orderId);
    if (!order) return null;

    // Get candidate invoices (non-void, non-draft, not already matched by another order)
    const invoices = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId as any))
      .collect();

    const candidateInvoices = invoices
      .filter((inv) => inv.status !== "void" && inv.status !== "draft")
      .map((inv) => ({
        invoiceId: inv._id.toString(),
        invoiceNumber: inv.invoiceNumber ?? "",
        customerName: inv.customerSnapshot?.businessName ?? "",
        totalAmount: inv.totalAmount,
        invoiceDate: inv.invoiceDate ?? "",
        lineItems: (inv.lineItems ?? []).map((li: any) => ({
          description: li.description ?? "",
          quantity: li.quantity ?? 0,
          unitPrice: li.unitPrice ?? 0,
          amount: li.totalAmount ?? li.amount ?? 0,
        })),
      }));

    return {
      order: {
        orderReference: order.orderReference,
        customerName: order.customerName ?? "",
        grossAmount: order.grossAmount,
        netAmount: order.netAmount ?? order.grossAmount,
        orderDate: order.orderDate,
        currency: order.currency,
        productName: order.productName ?? "",
        lineItems: (order.lineItems ?? []).map((li) => ({
          productName: li.productName ?? "",
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          total: li.totalAmount,
        })),
      },
      candidateInvoices,
    };
  },
});

/**
 * Internal mutation: Store AI match suggestions on an order.
 */
export const updateAiMatchSuggestions = internalMutation({
  args: {
    orderId: v.string(),
    suggestions: v.array(v.object({
      invoiceId: v.string(),
      invoiceNumber: v.string(),
      allocatedAmount: v.number(),
      confidence: v.number(),
      reasoning: v.string(),
      matchType: v.string(),
    })),
    modelVersion: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    // Find the order by string ID
    const allOrders = await ctx.db.query("sales_orders").collect();
    const order = allOrders.find((o) => o._id.toString() === args.orderId);
    if (!order) return;

    await ctx.db.patch(order._id, {
      aiMatchSuggestions: args.suggestions,
      aiMatchModelVersion: args.modelVersion ?? undefined,
      aiMatchTier: 2,
      aiMatchStatus: "pending_review",
      updatedAt: Date.now(),
    });
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

// ============================================
// AI MATCHING METRICS (T035)
// ============================================

/**
 * Get AI matching performance metrics for a business.
 * Compares Tier 1 (deterministic) vs Tier 2 (AI) success rates.
 */
export const getMatchingMetrics = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        totalOrders: 0, tier1Matched: 0, tier2Matched: 0,
        tier2Pending: 0, tier2Rejected: 0, tier2Corrected: 0,
        totalCorrections: 0, autoMatchRate: 0, tier2Precision: 0,
        estimatedHoursSaved: 0, uniqueLearnedAliases: 0,
      };
    }

    const orders = await ctx.db
      .query("sales_orders")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const corrections = await ctx.db
      .query("order_matching_corrections")
      .withIndex("by_businessId_createdAt", (q) => q.eq("businessId", args.businessId))
      .collect();

    const totalOrders = orders.length;
    const tier1Matched = orders.filter((o) => o.aiMatchTier === 1).length;
    const tier2Approved = orders.filter((o) => o.aiMatchStatus === "approved").length;
    const tier2Pending = orders.filter((o) => o.aiMatchStatus === "pending_review").length;
    const tier2Rejected = orders.filter((o) => o.aiMatchStatus === "rejected").length;
    const tier2Corrected = orders.filter((o) => o.aiMatchStatus === "corrected").length;
    const totalCorrections = corrections.length;

    // Auto-match rate: (Tier 1 + Tier 2 approved) / total
    const autoMatchRate = totalOrders > 0
      ? ((tier1Matched + tier2Approved) / totalOrders) * 100
      : 0;

    // Tier 2 precision: approved / (approved + corrected + rejected)
    const tier2Total = tier2Approved + tier2Corrected + tier2Rejected;
    const tier2Precision = tier2Total > 0
      ? (tier2Approved / tier2Total) * 100
      : 0;

    // Estimated hours saved: each auto-match saves ~2 min of manual work
    const estimatedHoursSaved = ((tier1Matched + tier2Approved) * 2) / 60;

    // Unique learned aliases: distinct customer name pairs in corrections
    const uniqueLearnedAliases = new Set(
      corrections.map((c) => `${c.orderCustomerName}→${c.correctedInvoiceCustomerName}`)
    ).size;

    return {
      totalOrders,
      tier1Matched,
      tier2Matched: tier2Approved,
      tier2Pending,
      tier2Rejected,
      tier2Corrected,
      totalCorrections,
      autoMatchRate: Math.round(autoMatchRate * 10) / 10,
      tier2Precision: Math.round(tier2Precision * 10) / 10,
      estimatedHoursSaved: Math.round(estimatedHoursSaved * 10) / 10,
      uniqueLearnedAliases,
    };
  },
});

// ============================================
// TRIPLE-LOCK AUTO-APPROVAL
// ============================================

/**
 * Count learning cycles for a customer/vendor alias.
 * Counts: user-approved AI matches + user corrections for the normalized alias.
 */
export const getLearningCyclesForAlias = internalQuery({
  args: {
    businessId: v.string(),
    customerName: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeAlias(args.customerName);
    if (!normalized) return { cycles: 0, approvedMatches: 0, corrections: 0, normalizedAlias: normalized };

    // Count approved AI matches for this alias
    const allOrders = await ctx.db
      .query("sales_orders")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId as any))
      .collect();

    const approvedMatches = allOrders.filter((o) =>
      o.matchMethod === "ai_suggested" &&
      o.aiMatchStatus === "approved" &&
      o.customerName &&
      normalizeAlias(o.customerName) === normalized
    ).length;

    // Count corrections where the corrected invoice customer matches this alias
    const corrections = await ctx.db
      .query("order_matching_corrections")
      .withIndex("by_businessId_createdAt", (q) =>
        q.eq("businessId", args.businessId as any)
      )
      .collect();

    const relevantCorrections = corrections.filter((c) =>
      c.correctionType !== "false_positive" &&
      normalizeAlias(c.correctedInvoiceCustomerName) === normalized
    ).length;

    return {
      cycles: approvedMatches + relevantCorrections,
      approvedMatches,
      corrections: relevantCorrections,
      normalizedAlias: normalized,
    };
  },
});

/**
 * Evaluate Triple-Lock gate for auto-approval.
 */
export const evaluateTripleLock = internalQuery({
  args: {
    businessId: v.string(),
    confidence: v.number(),
    customerName: v.string(),
    matchType: v.string(),
  },
  handler: async (ctx, args) => {
    // Split matches are never auto-approved
    if (args.matchType === "split") {
      return {
        pass: false,
        lock1: { pass: false, reason: "Split matches require human review" },
        lock2: { pass: false, score: args.confidence, threshold: 0 },
        lock3: { pass: false, cycles: 0, required: 0 },
      };
    }

    // Lock 1: Check settings
    const settings = await ctx.db
      .query("matching_settings")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId as any))
      .first();

    const enableAutoApprove = settings?.enableAutoApprove ?? false;
    const threshold = settings?.autoApproveThreshold ?? 0.98;
    const minCycles = settings?.minLearningCycles ?? 5;

    const lock1 = {
      pass: enableAutoApprove && !settings?.autoApproveDisabledReason,
      reason: !enableAutoApprove
        ? "Auto-approve is disabled"
        : settings?.autoApproveDisabledReason
        ? `Auto-approve paused: ${settings.autoApproveDisabledReason}`
        : "Auto-approve is enabled",
    };

    // Lock 2: Confidence threshold
    const lock2 = {
      pass: args.confidence >= threshold,
      score: args.confidence,
      threshold,
    };

    // Lock 3: Learning depth
    const normalized = normalizeAlias(args.customerName);
    let cycles = 0;

    if (normalized) {
      const allOrders = await ctx.db
        .query("sales_orders")
        .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId as any))
        .collect();

      const approvedMatches = allOrders.filter((o) =>
        o.matchMethod === "ai_suggested" &&
        o.aiMatchStatus === "approved" &&
        o.customerName &&
        normalizeAlias(o.customerName) === normalized
      ).length;

      const corrections = await ctx.db
        .query("order_matching_corrections")
        .withIndex("by_businessId_createdAt", (q) =>
          q.eq("businessId", args.businessId as any)
        )
        .collect();

      const relevantCorrections = corrections.filter((c) =>
        c.correctionType !== "false_positive" &&
        normalizeAlias(c.correctedInvoiceCustomerName) === normalized
      ).length;

      cycles = approvedMatches + relevantCorrections;
    }

    const lock3 = {
      pass: cycles >= minCycles,
      cycles,
      required: minCycles,
    };

    return {
      pass: lock1.pass && lock2.pass && lock3.pass,
      lock1,
      lock2,
      lock3,
    };
  },
});

/**
 * Reverse an auto-approved match.
 * Creates reversal JE, marks as reversed, captures CRITICAL_FAILURE, checks safety valve.
 */
export const reverseAutoMatch = mutation({
  args: {
    salesOrderId: v.id("sales_orders"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const order = await ctx.db.get(args.salesOrderId);
    if (!order || order.businessId !== args.businessId) throw new Error("Order not found");
    if (order.matchMethod !== "auto_agent") throw new Error("Only auto-approved matches can be reversed");

    const now = Date.now();

    // 1. Create reversal journal entries if they exist
    if (order.journalEntryIds && order.journalEntryIds.length > 0) {
      for (const jeId of order.journalEntryIds) {
        const je = await ctx.db.get(jeId);
        if (je && je.status !== "voided") {
          // Void the original JE
          await ctx.db.patch(jeId, {
            status: "voided",
          });

          // Create reversal JE
          const lines = await ctx.db
            .query("journal_entry_lines")
            .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", jeId))
            .collect();

          if (lines.length > 0) {
            const transactionDate = new Date().toISOString().split("T")[0];
            const fiscalYear = new Date().getFullYear();
            const fiscalPeriod = `${fiscalYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

            // Generate entry number for reversal
            const lastEntry = await ctx.db
              .query("journal_entries")
              .withIndex("by_business_entry_number", (q: any) =>
                q.eq("businessId", args.businessId)
              )
              .order("desc")
              .first();
            const lastSequence = lastEntry
              ? parseInt(lastEntry.entryNumber.split("-")[2]) || 0
              : 0;
            const entryNumber = `JE-${fiscalYear}-${String(lastSequence + 1).padStart(5, "0")}`;

            const business = await ctx.db.get(args.businessId);
            const homeCurrency = business?.homeCurrency ?? "MYR";

            const reversalId = await ctx.db.insert("journal_entries", {
              businessId: args.businessId,
              entryNumber,
              transactionDate,
              postingDate: transactionDate,
              description: `REVERSAL: Auto-match reversed for ${order.orderReference} — CRITICAL FAILURE`,
              status: "posted",
              sourceType: "auto_agent_reversal",
              sourceId: args.salesOrderId.toString(),
              fiscalYear,
              fiscalPeriod,
              homeCurrency,
              totalDebit: lines.reduce((sum, l) => sum + l.creditAmount, 0),
              totalCredit: lines.reduce((sum, l) => sum + l.debitAmount, 0),
              lineCount: lines.length,
              isPeriodLocked: false,
              reversalOf: jeId,
              createdBy: identity.subject,
              createdAt: now,
              postedBy: identity.subject,
              postedAt: now,
            });

            // Mark original JE as reversed by this one
            await ctx.db.patch(jeId, { reversedBy: reversalId });

            // Create reversed lines (swap debits/credits)
            for (const line of lines) {
              await ctx.db.insert("journal_entry_lines", {
                journalEntryId: reversalId,
                businessId: args.businessId,
                lineOrder: line.lineOrder,
                accountId: line.accountId,
                accountCode: line.accountCode,
                accountName: line.accountName,
                accountType: line.accountType,
                debitAmount: line.creditAmount,
                creditAmount: line.debitAmount,
                homeCurrencyAmount: line.creditAmount,
                lineDescription: `REVERSAL: ${line.lineDescription ?? ""}`,
                entityType: line.entityType,
                entityId: line.entityId,
                entityName: line.entityName,
                bankReconciled: false,
                createdAt: now,
              });
            }
          }
        }
      }
    }

    // 2. Mark order as reversed
    await ctx.db.patch(args.salesOrderId, {
      matchStatus: "unmatched",
      matchedInvoiceId: undefined,
      matchConfidence: undefined,
      matchMethod: undefined,
      varianceAmount: undefined,
      varianceReason: undefined,
      matchVariances: undefined,
      aiMatchStatus: "reversed",
      journalEntryIds: undefined,
      reconciledAt: undefined,
      updatedAt: now,
    });

    // 3. Create CRITICAL_FAILURE correction
    const topSuggestion = order.aiMatchSuggestions?.[0];
    await ctx.db.insert("order_matching_corrections", {
      businessId: args.businessId,
      orderReference: order.orderReference,
      orderCustomerName: order.customerName ?? "",
      orderAmount: order.grossAmount,
      orderDate: order.orderDate,
      originalSuggestedInvoiceId: topSuggestion?.invoiceId as any,
      originalConfidence: topSuggestion?.confidence,
      originalReasoning: topSuggestion?.reasoning,
      correctedInvoiceId: topSuggestion?.invoiceId as any ?? order.matchedInvoiceId as any,
      correctedInvoiceNumber: topSuggestion?.invoiceNumber ?? "",
      correctedInvoiceCustomerName: "",
      correctedInvoiceAmount: topSuggestion?.allocatedAmount ?? 0,
      correctionType: "critical_failure",
      weight: 5,
      createdBy: identity.subject,
      createdAt: now,
    });

    // 4. Safety valve: check critical failures in last 30 days
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    const recentCorrections = await ctx.db
      .query("order_matching_corrections")
      .withIndex("by_businessId_createdAt", (q) =>
        q.eq("businessId", args.businessId)
      )
      .collect();

    const criticalFailureCount = recentCorrections.filter(
      (c) => c.correctionType === "critical_failure" && c.createdAt > thirtyDaysAgo
    ).length;

    if (criticalFailureCount >= 3) {
      // Auto-disable auto-approval
      const settings = await ctx.db
        .query("matching_settings")
        .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
        .first();

      if (settings) {
        await ctx.db.patch(settings._id, {
          enableAutoApprove: false,
          autoApproveDisabledReason: "critical_failures_exceeded",
          autoApproveDisabledAt: now,
          updatedAt: now,
        });
      }

      return {
        reversed: true,
        safetyValveTriggered: true,
        criticalFailureCount,
        message: "Auto-approval has been disabled due to 3+ critical failures in 30 days.",
      };
    }

    return {
      reversed: true,
      safetyValveTriggered: false,
      criticalFailureCount,
    };
  },
});

/**
 * Auto-approve a match after Triple-Lock passes.
 * Sets method to "auto_agent" and posts journal entry with "groot_ai_agent" preparer.
 */
export const autoApproveMatch = internalMutation({
  args: {
    orderId: v.string(),
    businessId: v.string(),
    invoiceId: v.string(),
    confidence: v.number(),
    reasoning: v.string(),
    tripleLockResult: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the order
    const allOrders = await ctx.db.query("sales_orders").collect();
    const order = allOrders.find((o) => o._id.toString() === args.orderId);
    if (!order) return;

    const now = Date.now();

    // Update order with auto-approval
    await ctx.db.patch(order._id, {
      matchStatus: "matched",
      matchedInvoiceId: args.invoiceId as any,
      matchConfidence: args.confidence,
      matchMethod: "auto_agent",
      varianceAmount: 0,
      aiMatchStatus: "auto_approved",
      updatedAt: now,
    });

    // Post journal entry with "groot_ai_agent" preparer
    try {
      const invoice = await ctx.db.get(args.invoiceId as any);
      if (invoice && order.netAmount != null && order.netAmount > 0) {
        // Get business for home currency
        const business = await ctx.db
          .query("businesses")
          .filter((q: any) => q.eq(q.field("_id"), args.businessId))
          .first();
        const homeCurrency = (business as any)?.homeCurrency ?? "MYR";
        const transactionDate = new Date().toISOString().split("T")[0];
        const fiscalYear = new Date().getFullYear();
        const fiscalPeriod = `${fiscalYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

        // Generate entry number
        const lastEntry = await ctx.db
          .query("journal_entries")
          .withIndex("by_business_entry_number", (q: any) =>
            q.eq("businessId", args.businessId as any)
          )
          .order("desc")
          .first();
        const lastSequence = lastEntry
          ? parseInt(lastEntry.entryNumber.split("-")[2]) || 0
          : 0;
        const entryNumber = `JE-${fiscalYear}-${String(lastSequence + 1).padStart(5, "0")}`;

        // Create Cash Received entry (Debit Cash, Credit AR)
        const jeId = await ctx.db.insert("journal_entries", {
          businessId: args.businessId as any,
          entryNumber,
          transactionDate,
          postingDate: transactionDate,
          description: `Auto-approved: ${order.orderReference} → ${(invoice as any).invoiceNumber ?? "invoice"} | Preparer: groot_ai_agent | ${args.reasoning.slice(0, 200)}`,
          status: "posted",
          sourceType: "auto_agent",
          sourceId: order._id.toString(),
          fiscalYear,
          fiscalPeriod,
          homeCurrency,
          totalDebit: order.netAmount,
          totalCredit: order.netAmount,
          lineCount: 2,
          isPeriodLocked: false,
          createdBy: "groot_ai_agent",
          createdAt: now,
          postedBy: "groot_ai_agent",
          postedAt: now,
        });

        // Look up account IDs
        const cashAccount = await ctx.db
          .query("chart_of_accounts")
          .withIndex("by_business_code", (q: any) =>
            q.eq("businessId", args.businessId as any).eq("accountCode", "1000")
          )
          .first();
        const arAccount = await ctx.db
          .query("chart_of_accounts")
          .withIndex("by_business_code", (q: any) =>
            q.eq("businessId", args.businessId as any).eq("accountCode", "1200")
          )
          .first();

        // Debit Cash (1000)
        await ctx.db.insert("journal_entry_lines", {
          journalEntryId: jeId,
          businessId: args.businessId as any,
          lineOrder: 1,
          accountId: cashAccount?._id ?? ("" as any),
          accountCode: "1000",
          accountName: cashAccount?.accountName ?? "Cash at Bank",
          accountType: "asset",
          debitAmount: order.netAmount,
          creditAmount: 0,
          homeCurrencyAmount: order.netAmount,
          lineDescription: `Cash received: ${order.orderReference}`,
          entityType: "customer",
          entityName: order.customerName,
          bankReconciled: false,
          createdAt: now,
        });

        // Credit AR (1200)
        await ctx.db.insert("journal_entry_lines", {
          journalEntryId: jeId,
          businessId: args.businessId as any,
          lineOrder: 2,
          accountId: arAccount?._id ?? ("" as any),
          accountCode: "1200",
          accountName: arAccount?.accountName ?? "Accounts Receivable",
          accountType: "asset",
          debitAmount: 0,
          creditAmount: order.netAmount,
          homeCurrencyAmount: order.netAmount,
          lineDescription: `AR settled: ${(invoice as any).invoiceNumber ?? "invoice"} (auto-agent)`,
          entityType: "customer",
          entityName: order.customerName,
          bankReconciled: false,
          createdAt: now,
        });

        // Link JE to order
        await ctx.db.patch(order._id, {
          journalEntryIds: [jeId],
          reconciledAt: now,
        });
      }
    } catch (error) {
      // If JE posting fails, revert to pending_review
      console.error(`[AR Match AI] Auto-approval JE posting failed for ${args.orderId}:`, error);
      await ctx.db.patch(order._id, {
        matchMethod: undefined,
        matchStatus: "unmatched",
        matchedInvoiceId: undefined,
        matchConfidence: undefined,
        aiMatchStatus: "pending_review",
        updatedAt: now,
      });
    }
  },
});
