/**
 * PO Match Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Automatic matching (invoice → PO via reference number)
 * - Manual matching (user-initiated)
 * - Match review (approve/reject/hold)
 * - Variance detection
 * - Dashboard summaries
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id, Doc } from "../_generated/dataModel";
import { resolveUserByClerkId } from "../lib/resolvers";

// ============================================
// TYPES
// ============================================

type VarianceType =
  | "quantity_over_invoiced"
  | "quantity_under_invoiced"
  | "price_higher"
  | "price_lower"
  | "over_received"
  | "missing_grn"
  | "currency_mismatch";

type MatchMethod = "exact_code" | "fuzzy_description" | "amount_fallback" | "manual";

interface Variance {
  type: VarianceType;
  expectedValue: number;
  actualValue: number;
  absoluteDifference: number;
  percentageDifference: number;
  exceedsTolerance: boolean;
}

interface LineItemPairing {
  poLineIndex: number;
  invoiceLineIndex?: number;
  grnLineIndex?: number;
  matchConfidence: number;
  matchMethod: MatchMethod;
  poQuantity: number;
  grnQuantity?: number;
  invoiceQuantity?: number;
  poUnitPrice: number;
  invoiceUnitPrice?: number;
  variances?: Variance[];
}

// ============================================
// HELPER: Variance detection
// ============================================

function detectVariances(
  pairing: {
    poQuantity: number;
    poUnitPrice: number;
    invoiceQuantity?: number;
    invoiceUnitPrice?: number;
    grnQuantity?: number;
  },
  tolerances: {
    quantityTolerancePercent: number;
    priceTolerancePercent: number;
  }
): Variance[] {
  const variances: Variance[] = [];

  // Quantity variance (invoice vs PO)
  if (pairing.invoiceQuantity !== undefined) {
    const qtyDiff = pairing.invoiceQuantity - pairing.poQuantity;
    const qtyPct = pairing.poQuantity > 0
      ? Math.abs(qtyDiff / pairing.poQuantity) * 100
      : 0;

    if (Math.abs(qtyDiff) > 0.001) {
      variances.push({
        type: qtyDiff > 0 ? "quantity_over_invoiced" : "quantity_under_invoiced",
        expectedValue: pairing.poQuantity,
        actualValue: pairing.invoiceQuantity,
        absoluteDifference: Math.abs(qtyDiff),
        percentageDifference: Math.round(qtyPct * 100) / 100,
        exceedsTolerance: qtyPct > tolerances.quantityTolerancePercent,
      });
    }
  }

  // Price variance (invoice vs PO)
  if (pairing.invoiceUnitPrice !== undefined) {
    const priceDiff = pairing.invoiceUnitPrice - pairing.poUnitPrice;
    const pricePct = pairing.poUnitPrice > 0
      ? Math.abs(priceDiff / pairing.poUnitPrice) * 100
      : 0;

    if (Math.abs(priceDiff) > 0.001) {
      variances.push({
        type: priceDiff > 0 ? "price_higher" : "price_lower",
        expectedValue: pairing.poUnitPrice,
        actualValue: pairing.invoiceUnitPrice,
        absoluteDifference: Math.abs(priceDiff),
        percentageDifference: Math.round(pricePct * 100) / 100,
        exceedsTolerance: pricePct > tolerances.priceTolerancePercent,
      });
    }
  }

  // Over-received (GRN quantity > PO quantity)
  if (pairing.grnQuantity !== undefined) {
    const overReceived = pairing.grnQuantity - pairing.poQuantity;
    if (overReceived > 0.001) {
      const overPct = pairing.poQuantity > 0
        ? (overReceived / pairing.poQuantity) * 100
        : 0;
      variances.push({
        type: "over_received",
        expectedValue: pairing.poQuantity,
        actualValue: pairing.grnQuantity,
        absoluteDifference: overReceived,
        percentageDifference: Math.round(overPct * 100) / 100,
        exceedsTolerance: overPct > tolerances.quantityTolerancePercent,
      });
    }
  }

  return variances;
}

/**
 * Compute word-overlap similarity between two strings.
 * Lowercases both, removes common stop words, then scores as
 * overlapping words / max(words in a, words in b).
 */
const STOP_WORDS = new Set(["the", "a", "an", "for", "of", "and", "or", "in", "to", "with", "on", "at", "by"]);

function wordSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0 && !STOP_WORDS.has(w));

  const wordsA = normalize(a);
  const wordsB = normalize(b);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const setB = new Set(wordsB);
  const overlap = wordsA.filter((w) => setB.has(w)).length;
  return overlap / Math.max(wordsA.length, wordsB.length);
}

/**
 * Match PO line items to invoice line items using item codes or description similarity
 */
function pairLineItems(
  poLineItems: Array<{ itemCode?: string; description: string; quantity: number; unitPrice: number }>,
  invoiceLineItems: Array<{ description: string; quantity: number; unitPrice: number; itemCode?: string }>,
  grnLineItems?: Array<{ poLineItemIndex?: number; quantityReceived: number }>,
  tolerances?: { quantityTolerancePercent: number; priceTolerancePercent: number }
): LineItemPairing[] {
  const pairings: LineItemPairing[] = [];
  const usedInvoiceIndices = new Set<number>();
  const tol = tolerances ?? { quantityTolerancePercent: 10, priceTolerancePercent: 5 };

  for (let poIdx = 0; poIdx < poLineItems.length; poIdx++) {
    const poLine = poLineItems[poIdx];
    let bestInvoiceIdx: number | undefined;
    let bestMethod: MatchMethod = "amount_fallback";
    let bestConfidence = 0;

    // Try exact code match first
    if (poLine.itemCode) {
      const codeMatch = invoiceLineItems.findIndex(
        (inv, idx) => !usedInvoiceIndices.has(idx) && inv.itemCode === poLine.itemCode
      );
      if (codeMatch !== -1) {
        bestInvoiceIdx = codeMatch;
        bestMethod = "exact_code";
        bestConfidence = 1.0;
      }
    }

    // Try fuzzy description match using word-overlap similarity
    if (bestInvoiceIdx === undefined) {
      let bestSimilarity = 0;
      for (let invIdx = 0; invIdx < invoiceLineItems.length; invIdx++) {
        if (usedInvoiceIndices.has(invIdx)) continue;
        const similarity = wordSimilarity(poLine.description, invoiceLineItems[invIdx].description);

        // Require at least 40% word overlap to consider it a match
        if (similarity >= 0.4 && similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestInvoiceIdx = invIdx;
          bestMethod = "fuzzy_description";
          // Scale confidence: 0.4 similarity -> 0.66, 1.0 similarity -> 0.90
          bestConfidence = Math.min(0.9, 0.5 + bestSimilarity * 0.4);
        }
      }
    }

    // Fall back to amount matching
    if (bestInvoiceIdx === undefined) {
      for (let invIdx = 0; invIdx < invoiceLineItems.length; invIdx++) {
        if (usedInvoiceIndices.has(invIdx)) continue;
        const invLine = invoiceLineItems[invIdx];
        const amountDiff = Math.abs(invLine.quantity * invLine.unitPrice - poLine.quantity * poLine.unitPrice);
        const poTotal = poLine.quantity * poLine.unitPrice;
        if (poTotal > 0 && amountDiff / poTotal < 0.1) {
          bestInvoiceIdx = invIdx;
          bestMethod = "amount_fallback";
          bestConfidence = 0.5;
          break;
        }
      }
    }

    if (bestInvoiceIdx !== undefined) {
      usedInvoiceIndices.add(bestInvoiceIdx);
    }

    // Find GRN line for this PO line
    let grnQuantity: number | undefined;
    let grnLineIndex: number | undefined;
    if (grnLineItems) {
      const grnLine = grnLineItems.findIndex((g) => g.poLineItemIndex === poIdx);
      if (grnLine !== -1) {
        grnQuantity = grnLineItems[grnLine].quantityReceived;
        grnLineIndex = grnLine;
      }
    }

    const invoiceLine = bestInvoiceIdx !== undefined ? invoiceLineItems[bestInvoiceIdx] : undefined;

    const pairing: LineItemPairing = {
      poLineIndex: poIdx,
      invoiceLineIndex: bestInvoiceIdx,
      grnLineIndex,
      matchConfidence: bestInvoiceIdx !== undefined ? bestConfidence : 0,
      matchMethod: bestInvoiceIdx !== undefined ? bestMethod : "amount_fallback",
      poQuantity: poLine.quantity,
      grnQuantity,
      invoiceQuantity: invoiceLine?.quantity,
      poUnitPrice: poLine.unitPrice,
      invoiceUnitPrice: invoiceLine?.unitPrice,
    };

    // Detect variances
    pairing.variances = detectVariances(
      {
        poQuantity: pairing.poQuantity,
        poUnitPrice: pairing.poUnitPrice,
        invoiceQuantity: pairing.invoiceQuantity,
        invoiceUnitPrice: pairing.invoiceUnitPrice,
        grnQuantity: pairing.grnQuantity,
      },
      tol
    );

    // Add missing_grn variance if no GRN data
    if (grnQuantity === undefined && grnLineItems !== undefined) {
      pairing.variances = pairing.variances ?? [];
      pairing.variances.push({
        type: "missing_grn",
        expectedValue: poLine.quantity,
        actualValue: 0,
        absoluteDifference: poLine.quantity,
        percentageDifference: 100,
        exceedsTolerance: true,
      });
    }

    pairings.push(pairing);
  }

  return pairings;
}

// ============================================
// QUERIES
// ============================================

/**
 * List match records with filtering
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(v.union(
      v.literal("auto_approved"),
      v.literal("pending_review"),
      v.literal("approved"),
      v.literal("disputed"),
      v.literal("on_hold")
    )),
    purchaseOrderId: v.optional(v.id("purchase_orders")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    let matches;
    if (args.status) {
      matches = await ctx.db
        .query("po_matches")
        .withIndex("by_businessId_status", (q: any) =>
          q.eq("businessId", args.businessId).eq("status", args.status!)
        )
        .collect();
    } else if (args.purchaseOrderId) {
      matches = await ctx.db
        .query("po_matches")
        .withIndex("by_purchaseOrderId", (q: any) =>
          q.eq("purchaseOrderId", args.purchaseOrderId!)
        )
        .collect();
      matches = matches.filter((m: any) => m.businessId === args.businessId);
    } else {
      matches = await ctx.db
        .query("po_matches")
        .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
        .collect();
    }

    // Apply additional filters
    if (args.purchaseOrderId && args.status) {
      matches = matches.filter((m: any) => m.purchaseOrderId === args.purchaseOrderId);
    }

    // Sort by creation date descending
    matches.sort((a: any, b: any) => b.createdAt - a.createdAt);

    // Batch-fetch related documents to eliminate N+1 queries
    // Collect unique IDs first
    const poIds = [...new Set(matches.map((m: any) => m.purchaseOrderId).filter(Boolean))];
    const invoiceIds = [...new Set(matches.map((m: any) => m.invoiceId).filter(Boolean))];

    // Batch fetch POs and invoices in parallel (2 rounds instead of 3N)
    const [poResults, invoiceResults] = await Promise.all([
      Promise.all(poIds.map((id: any) => ctx.db.get(id))),
      Promise.all(invoiceIds.map((id: any) => ctx.db.get(id))),
    ]);

    // Build lookup maps
    const poMap = new Map<string, any>();
    for (const po of poResults) {
      if (po) poMap.set(po._id as string, po);
    }

    const invoiceMap = new Map<string, any>();
    for (const inv of invoiceResults) {
      if (inv) invoiceMap.set(inv._id as string, inv);
    }

    // Batch fetch vendors from POs
    const vendorIds = [...new Set(
      [...poMap.values()].map((po: any) => po.vendorId).filter(Boolean)
    )];
    const vendorResults = await Promise.all(
      vendorIds.map((id: any) => ctx.db.get(id))
    );
    const vendorMap = new Map<string, any>();
    for (const v of vendorResults) {
      if (v) vendorMap.set(v._id as string, v);
    }

    // Enrich matches using lookup maps (zero additional queries)
    const enriched = matches.map((match: any) => {
      const po = poMap.get(match.purchaseOrderId as string);
      const vendor = po ? vendorMap.get(po.vendorId as string) : null;

      let invoiceNumber: string | undefined;
      if (match.invoiceId) {
        const invoice = invoiceMap.get(match.invoiceId as string);
        if (invoice?.extractedData) {
          const extracted = invoice.extractedData as any;
          invoiceNumber = extracted?.invoiceNumber ?? extracted?.invoice_number;
        }
      }

      return {
        ...match,
        poNumber: po?.poNumber ?? "Unknown",
        vendorName: vendor?.name ?? "Unknown Vendor",
        invoiceNumber,
      };
    });

    return enriched;
  },
});

/**
 * Get a single match with full context
 */
export const get = query({
  args: { matchId: v.id("po_matches") },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) {
      return null;
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", match.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    const po = await ctx.db.get(match.purchaseOrderId);
    const vendor = po ? await ctx.db.get(po.vendorId) : null;

    let invoice = null;
    if (match.invoiceId) {
      invoice = await ctx.db.get(match.invoiceId);
    }

    const grns = [];
    if (match.grnIds) {
      for (const grnId of match.grnIds) {
        const grn = await ctx.db.get(grnId);
        if (grn) grns.push(grn);
      }
    }

    return {
      ...match,
      purchaseOrder: po ?? null,
      invoice,
      grns,
      vendor: vendor ?? null,
    };
  },
});

/**
 * Get unmatched documents (three tabs)
 */
export const getUnmatched = query({
  args: {
    businessId: v.id("businesses"),
    tab: v.union(
      v.literal("pos_without_invoices"),
      v.literal("invoices_without_pos"),
      v.literal("pos_without_grns")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    if (args.tab === "pos_without_invoices") {
      // POs that are issued/received but have no match records
      const pos = await ctx.db
        .query("purchase_orders")
        .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
        .collect();

      const activePos = pos.filter(
        (po: any) => ["issued", "partially_received", "fully_received"].includes(po.status)
      );

      // Batch fetch all matches for this business (1 query instead of N)
      const allMatches = await ctx.db
        .query("po_matches")
        .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
        .collect();

      const matchedPoIds = new Set(allMatches.map((m: any) => m.purchaseOrderId as string));

      const unmatchedActivePos = activePos.filter(
        (po: any) => !matchedPoIds.has(po._id as string)
      );

      // Batch fetch vendors (1 round instead of N)
      const vendorIds = [...new Set(unmatchedActivePos.map((po: any) => po.vendorId).filter(Boolean))];
      const vendors = await Promise.all(vendorIds.map((id: any) => ctx.db.get(id)));
      const vendorMap = new Map<string, any>();
      for (const v of vendors) {
        if (v) vendorMap.set(v._id as string, v);
      }

      return unmatchedActivePos.map((po: any) => ({
        ...po,
        vendorName: vendorMap.get(po.vendorId as string)?.name ?? "Unknown Vendor",
      }));
    }

    if (args.tab === "invoices_without_pos") {
      // AP invoices that have no PO match
      const invoices = await ctx.db
        .query("invoices")
        .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
        .collect();

      const unmatchedInvoices = invoices.filter(
        (inv: any) =>
          !inv.deletedAt &&
          inv.status !== "cancelled" &&
          !inv.matchId &&
          inv.matchGated !== false // not explicitly cleared
      );

      return unmatchedInvoices;
    }

    if (args.tab === "pos_without_grns") {
      // Issued POs that have no GRNs at all
      const pos = await ctx.db
        .query("purchase_orders")
        .withIndex("by_businessId_status", (q: any) =>
          q.eq("businessId", args.businessId).eq("status", "issued")
        )
        .collect();

      // Batch fetch all GRNs for this business (1 query instead of N)
      const allGrns = await ctx.db
        .query("goods_received_notes")
        .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
        .collect();

      const poIdsWithGrns = new Set(allGrns.map((g: any) => g.purchaseOrderId as string));

      const unmatchedPosRaw = pos.filter(
        (po: any) => !poIdsWithGrns.has(po._id as string)
      );

      // Batch fetch vendors (1 round instead of N)
      const vendorIds = [...new Set(unmatchedPosRaw.map((po: any) => po.vendorId).filter(Boolean))];
      const vendors = await Promise.all(vendorIds.map((id: any) => ctx.db.get(id)));
      const vendorMap = new Map<string, any>();
      for (const v of vendors) {
        if (v) vendorMap.set(v._id as string, v);
      }

      return unmatchedPosRaw.map((po: any) => ({
        ...po,
        vendorName: vendorMap.get(po.vendorId as string)?.name ?? "Unknown Vendor",
      }));
    }

    return [];
  },
});

/**
 * Get dashboard summary for match status counts
 */
export const getDashboardSummary = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    const allMatches = await ctx.db
      .query("po_matches")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
      .collect();

    const totalMatches = allMatches.length;
    const autoApproved = allMatches.filter((m: any) => m.status === "auto_approved").length;
    const pendingReview = allMatches.filter((m: any) => m.status === "pending_review").length;
    const disputed = allMatches.filter((m: any) => m.status === "disputed").length;
    const approved = allMatches.filter((m: any) => m.status === "approved").length;
    const onHold = allMatches.filter((m: any) => m.status === "on_hold").length;

    const autoMatchRate = totalMatches > 0
      ? Math.round((autoApproved / totalMatches) * 100)
      : 0;

    // AI Intelligence metrics
    const aiEnhancedMatches = allMatches.filter((m: any) => m.aiMatchTier === 2);
    const aiEnhancedCount = aiEnhancedMatches.length;
    const avgAiConfidence = aiEnhancedCount > 0
      ? aiEnhancedMatches.reduce((sum: number, m: any) => sum + (m.aiConfidenceOverall ?? 0), 0) / aiEnhancedCount
      : 0;

    return {
      totalMatches,
      autoApproved,
      pendingReview,
      disputed,
      approved,
      onHold,
      autoMatchRate,
      aiEnhancedCount,
      avgAiConfidence: Math.round(avgAiConfidence * 100) / 100,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a manual match (user-initiated)
 */
export const createManual = mutation({
  args: {
    purchaseOrderId: v.id("purchase_orders"),
    invoiceId: v.id("invoices"),
    lineItemPairings: v.optional(v.array(v.object({
      poLineIndex: v.number(),
      invoiceLineIndex: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const po = await ctx.db.get(args.purchaseOrderId);
    if (!po) {
      throw new Error("Purchase order not found");
    }

    // Block matching against draft POs
    if (po.status === "draft") {
      throw new Error("Cannot match against a draft purchase order. Please issue the PO first.");
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", po.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new Error("Invoice not found");
    }

    // Get tolerances
    const settings = await ctx.db
      .query("matching_settings")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", po.businessId))
      .first();

    const tolerances = {
      quantityTolerancePercent: settings?.quantityTolerancePercent ?? 10,
      priceTolerancePercent: settings?.priceTolerancePercent ?? 5,
    };

    // Get GRNs for this PO
    const grns = await ctx.db
      .query("goods_received_notes")
      .withIndex("by_purchaseOrderId", (q: any) => q.eq("purchaseOrderId", po._id))
      .collect();

    const grnIds = grns.map((g: any) => g._id);

    // Aggregate GRN line items
    const allGrnLineItems = grns.flatMap((grn: any) =>
      grn.lineItems.map((li: any, idx: number) => ({ ...li, grnIdx: idx }))
    );

    // Get invoice line items from extractedData
    const extractedData = (invoice as any).extractedData as any;
    const invoiceLineItems = extractedData?.line_items ?? extractedData?.lineItems ?? [];

    // Build pairings
    let pairings: LineItemPairing[];
    if (args.lineItemPairings) {
      // User-provided pairings
      pairings = args.lineItemPairings.map((p) => {
        const poLine = po.lineItems[p.poLineIndex];
        const invLine = invoiceLineItems[p.invoiceLineIndex];

        // Find GRN line for this PO line
        const grnLine = allGrnLineItems.find(
          (g: any) => g.poLineItemIndex === p.poLineIndex
        );

        const pairing: LineItemPairing = {
          poLineIndex: p.poLineIndex,
          invoiceLineIndex: p.invoiceLineIndex,
          grnLineIndex: grnLine?.grnIdx,
          matchConfidence: 1.0,
          matchMethod: "manual",
          poQuantity: poLine?.quantity ?? 0,
          grnQuantity: grnLine?.quantityReceived,
          invoiceQuantity: invLine?.quantity,
          poUnitPrice: poLine?.unitPrice ?? 0,
          invoiceUnitPrice: invLine?.unitPrice ?? invLine?.unit_price,
        };

        pairing.variances = detectVariances(
          {
            poQuantity: pairing.poQuantity,
            poUnitPrice: pairing.poUnitPrice,
            invoiceQuantity: pairing.invoiceQuantity,
            invoiceUnitPrice: pairing.invoiceUnitPrice,
            grnQuantity: pairing.grnQuantity,
          },
          tolerances
        );

        return pairing;
      });
    } else {
      // Auto-pair
      pairings = pairLineItems(
        po.lineItems,
        invoiceLineItems,
        allGrnLineItems.length > 0 ? allGrnLineItems : undefined,
        tolerances
      );
    }

    // Determine match type
    const matchType = grns.length > 0 ? "three_way" : "two_way";

    // Check for currency mismatch between PO and invoice
    const allVariances = pairings.flatMap((p) => p.variances ?? []);
    const invoiceCurrency = extractedData?.currency ?? extractedData?.originalCurrency;
    if (invoiceCurrency && po.currency && invoiceCurrency !== po.currency) {
      allVariances.push({
        type: "currency_mismatch",
        expectedValue: 0,
        actualValue: 0,
        absoluteDifference: 0,
        percentageDifference: 0,
        exceedsTolerance: false, // flag only, does not block auto-approval
      });
    }

    // Check if any variances exceed tolerance
    const exceedsToleranceCount = allVariances.filter((v) => v.exceedsTolerance).length;

    const status = exceedsToleranceCount > 0 ? "pending_review" : "auto_approved";

    // Build overall variance summary
    const priceVariances = allVariances.filter(
      (v) => v.type === "price_higher" || v.type === "price_lower"
    );
    const qtyVariances = allVariances.filter(
      (v) =>
        v.type === "quantity_over_invoiced" ||
        v.type === "quantity_under_invoiced" ||
        v.type === "over_received"
    );

    const overallVarianceSummary = {
      totalVariances: allVariances.length,
      exceedsToleranceCount,
      hasCurrencyMismatch: allVariances.some((v) => v.type === "currency_mismatch"),
      maxPriceVariancePercent: priceVariances.length > 0
        ? Math.max(...priceVariances.map((v) => v.percentageDifference))
        : undefined,
      maxQuantityVariancePercent: qtyVariances.length > 0
        ? Math.max(...qtyVariances.map((v) => v.percentageDifference))
        : undefined,
    };

    const matchId = await ctx.db.insert("po_matches", {
      businessId: po.businessId,
      purchaseOrderId: args.purchaseOrderId,
      invoiceId: args.invoiceId,
      grnIds: grnIds.length > 0 ? grnIds : undefined,
      matchType: matchType as "two_way" | "three_way",
      status: status as "auto_approved" | "pending_review",
      lineItemPairings: pairings,
      overallVarianceSummary,
      createdAt: Date.now(),
    });

    return matchId;
  },
});

/**
 * Review a match (approve/reject/hold)
 */
export const review = mutation({
  args: {
    matchId: v.id("po_matches"),
    action: v.union(v.literal("approve"), v.literal("reject"), v.literal("hold")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) {
      throw new Error("Match not found");
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Verify business membership and role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", match.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
      throw new Error("Only admins or managers can review matches");
    }

    // Validate notes for reject/hold
    if ((args.action === "reject" || args.action === "hold") && !args.notes) {
      throw new Error("Notes are required for reject and hold actions");
    }

    // Map action to status
    const statusMap: Record<string, string> = {
      approve: "approved",
      reject: "disputed",
      hold: "on_hold",
    };

    const newStatus = statusMap[args.action];

    await ctx.db.patch(args.matchId, {
      status: newStatus as "approved" | "disputed" | "on_hold",
      reviewedBy: user._id,
      reviewNotes: args.notes,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // ============================================
    // Capture correction for DSPy training
    // ============================================
    if (match.aiMatchTier === 2 && match.lineItemPairings?.length > 0) {
      // Get vendor name from PO
      const po = await ctx.db.get(match.purchaseOrderId);
      const vendorName = (po as any)?.vendorName ?? "Unknown";

      const correctionType = args.action === "approve" ? "approval"
        : args.action === "reject" ? "rejection"
        : "override";

      // Capture one correction per AI-generated pairing
      for (const pairing of match.lineItemPairings) {
        if (pairing.matchMethod === "ai_semantic") {
          const poLine = po?.lineItems?.[pairing.poLineIndex];
          const invoicePairing = pairing.invoiceLineIndex !== undefined ? pairing.invoiceLineIndex : -1;

          await ctx.db.insert("po_match_corrections", {
            businessId: match.businessId,
            matchId: args.matchId,
            vendorName,
            originalPoLineDescription: poLine?.description ?? `PO Line ${pairing.poLineIndex}`,
            originalInvoiceLineDescription: `Invoice Line ${invoicePairing}`,
            originalConfidence: pairing.matchConfidence,
            correctedPoLineDescription: correctionType === "approval"
              ? (poLine?.description ?? `PO Line ${pairing.poLineIndex}`)
              : "REJECTED",
            correctedInvoiceLineDescription: correctionType === "approval"
              ? `Invoice Line ${invoicePairing}`
              : "REJECTED",
            correctionType,
            createdBy: identity.subject,
            createdAt: Date.now(),
          });
        }
      }
    }

    // On approve: update PO status to "invoiced" only if ALL PO line items
    // are fully covered by approved/auto_approved matches
    if (args.action === "approve") {
      const po = await ctx.db.get(match.purchaseOrderId);
      if (po && ["fully_received", "partially_received", "issued"].includes(po.status)) {
        // Query all approved/auto_approved matches for this PO
        const allMatchesForPo = await ctx.db
          .query("po_matches")
          .withIndex("by_purchaseOrderId", (q: any) =>
            q.eq("purchaseOrderId", match.purchaseOrderId)
          )
          .collect();

        const approvedMatches = allMatchesForPo.filter(
          (m: any) =>
            m.status === "approved" ||
            m.status === "auto_approved" ||
            // Include the current match being approved (its status hasn't
            // been read back yet since we just patched it above)
            m._id === args.matchId
        );

        // Sum matched invoice quantities per PO line index across all approved matches
        const matchedQtyByLine: Record<number, number> = {};
        for (const m of approvedMatches) {
          for (const pairing of (m.lineItemPairings ?? [])) {
            const idx = pairing.poLineIndex;
            const qty = pairing.invoiceQuantity ?? 0;
            matchedQtyByLine[idx] = (matchedQtyByLine[idx] ?? 0) + qty;
          }
        }

        // Check if every PO line item is fully covered
        const allLinesCovered = po.lineItems.every(
          (line: any, idx: number) =>
            (matchedQtyByLine[idx] ?? 0) >= line.quantity
        );

        if (allLinesCovered) {
          await ctx.db.patch(match.purchaseOrderId, {
            status: "invoiced",
            updatedAt: Date.now(),
          });
        }
      }
    }
  },
});

/**
 * Mark an invoice as not requiring a match
 * Clears the matchGated flag on the associated accounting entry
 */
export const markNoMatchRequired = mutation({
  args: {
    invoiceId: v.id("invoices"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new Error("Invoice not found");
    }

    const businessId = (invoice as any).businessId;
    if (!businessId) {
      throw new Error("Invoice has no business context");
    }

    // Verify membership and role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
      throw new Error("Only admins or managers can mark invoices as no match required");
    }

    // Clear matchGated on the invoice itself
    if ((invoice as any).matchGated) {
      await ctx.db.patch(args.invoiceId, {
        matchGated: false,
        updatedAt: Date.now(),
      } as any);
    }
  },
});

// ============================================
// INTERNAL MUTATIONS
// ============================================

/**
 * Auto-match an invoice to a PO (called internally after invoice extraction)
 */
export const autoMatch = internalMutation({
  args: {
    businessId: v.id("businesses"),
    invoiceId: v.id("invoices"),
    purchaseOrderRef: v.string(),
    invoiceLineItems: v.array(v.object({
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      itemCode: v.optional(v.string()),
    })),
    vendorId: v.optional(v.id("vendors")),
  },
  handler: async (ctx, args) => {
    // Find PO by reference number
    const pos = await ctx.db
      .query("purchase_orders")
      .withIndex("by_businessId_poNumber", (q: any) =>
        q.eq("businessId", args.businessId).eq("poNumber", args.purchaseOrderRef)
      )
      .collect();

    // If not found by exact PO number, try partial match
    let po: any = pos[0] ?? null;
    if (!po) {
      const allPos = await ctx.db
        .query("purchase_orders")
        .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
        .collect();

      const refLower = args.purchaseOrderRef.toLowerCase();
      po = allPos.find(
        (p) =>
          p.poNumber.toLowerCase() === refLower &&
          p.status !== "cancelled" &&
          p.status !== "closed" &&
          p.status !== "draft"
      ) ?? null;
    }

    if (!po) {
      return { matched: false };
    }

    // Optionally verify vendor matches
    if (args.vendorId && po.vendorId !== args.vendorId) {
      return { matched: false };
    }

    // Get tolerances
    const settings = await ctx.db
      .query("matching_settings")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
      .first();

    const tolerances = {
      quantityTolerancePercent: settings?.quantityTolerancePercent ?? 10,
      priceTolerancePercent: settings?.priceTolerancePercent ?? 5,
    };

    // Check if auto-match is enabled
    if (settings && !settings.autoMatchEnabled) {
      return { matched: false };
    }

    // Get GRNs for this PO
    const grns = await ctx.db
      .query("goods_received_notes")
      .withIndex("by_purchaseOrderId", (q: any) => q.eq("purchaseOrderId", po._id))
      .collect();

    const grnIds = grns.map((g: any) => g._id);
    const allGrnLineItems = grns.flatMap((grn: any) =>
      grn.lineItems.map((li: any, idx: number) => ({ ...li, grnIdx: idx }))
    );

    // Pair line items
    const pairings = pairLineItems(
      po.lineItems,
      args.invoiceLineItems,
      allGrnLineItems.length > 0 ? allGrnLineItems : undefined,
      tolerances
    );

    // Determine match type
    const matchType = grns.length > 0 ? "three_way" : "two_way";

    // Check variances + currency mismatch
    const allVariances = pairings.flatMap((p) => p.variances ?? []);
    const invoiceDoc = await ctx.db.get(args.invoiceId);
    const invExtracted = (invoiceDoc as any)?.extractedData;
    const invCurrency = invExtracted?.currency ?? invExtracted?.originalCurrency;
    if (invCurrency && po.currency && invCurrency !== po.currency) {
      allVariances.push({
        type: "currency_mismatch",
        expectedValue: 0,
        actualValue: 0,
        absoluteDifference: 0,
        percentageDifference: 0,
        exceedsTolerance: false,
      });
    }

    const exceedsToleranceCount = allVariances.filter((v) => v.exceedsTolerance).length;
    const status = exceedsToleranceCount > 0 ? "pending_review" : "auto_approved";

    // Build variance summary
    const priceVariances = allVariances.filter(
      (v) => v.type === "price_higher" || v.type === "price_lower"
    );
    const qtyVariances = allVariances.filter(
      (v) =>
        v.type === "quantity_over_invoiced" ||
        v.type === "quantity_under_invoiced" ||
        v.type === "over_received"
    );

    const overallVarianceSummary = {
      totalVariances: allVariances.length,
      exceedsToleranceCount,
      hasCurrencyMismatch: allVariances.some((v) => v.type === "currency_mismatch"),
      maxPriceVariancePercent: priceVariances.length > 0
        ? Math.max(...priceVariances.map((v) => v.percentageDifference))
        : undefined,
      maxQuantityVariancePercent: qtyVariances.length > 0
        ? Math.max(...qtyVariances.map((v) => v.percentageDifference))
        : undefined,
    };

    const matchId = await ctx.db.insert("po_matches", {
      businessId: args.businessId,
      purchaseOrderId: po._id,
      invoiceId: args.invoiceId,
      grnIds: grnIds.length > 0 ? grnIds : undefined,
      matchType: matchType as "two_way" | "three_way",
      status: status as "auto_approved" | "pending_review",
      lineItemPairings: pairings,
      overallVarianceSummary,
      createdAt: Date.now(),
    });

    return {
      matched: true,
      matchId,
      status,
    };
  },
});

/**
 * Re-evaluate matches when a GRN is created for a PO with existing matches
 */
export const reEvaluateForGrn = internalMutation({
  args: {
    purchaseOrderId: v.id("purchase_orders"),
    grnId: v.id("goods_received_notes"),
  },
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("po_matches")
      .withIndex("by_purchaseOrderId", (q: any) => q.eq("purchaseOrderId", args.purchaseOrderId))
      .collect();

    // Load PO for line item data
    const po = await ctx.db.get(args.purchaseOrderId);
    if (!po) return;

    // Load ALL GRNs for this PO (including the new one)
    const allGrns = await ctx.db
      .query("goods_received_notes")
      .withIndex("by_purchaseOrderId", (q: any) => q.eq("purchaseOrderId", args.purchaseOrderId))
      .collect();

    const allGrnLineItems = allGrns.flatMap((grn: any) =>
      grn.lineItems.map((li: any, idx: number) => ({ ...li, grnIdx: idx }))
    );

    // Get tolerances
    const settings = await ctx.db
      .query("matching_settings")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", po.businessId))
      .first();

    const tolerances = {
      quantityTolerancePercent: settings?.quantityTolerancePercent ?? 10,
      priceTolerancePercent: settings?.priceTolerancePercent ?? 5,
    };

    for (const match of matches) {
      // Add GRN to match if not already included
      const existingGrnIds = match.grnIds ?? [];
      const updatedGrnIds = existingGrnIds.includes(args.grnId)
        ? existingGrnIds
        : [...existingGrnIds, args.grnId];

      // Recalculate variances for each line item pairing with new GRN data
      const updatedPairings = (match.lineItemPairings ?? []).map((pairing: any) => {
        // Find GRN line for this PO line from aggregated GRN data
        const grnLine = allGrnLineItems.find(
          (g: any) => g.poLineItemIndex === pairing.poLineIndex
        );

        const updatedPairing = {
          ...pairing,
          grnQuantity: grnLine?.quantityReceived,
          grnLineIndex: grnLine ? allGrnLineItems.indexOf(grnLine) : pairing.grnLineIndex,
        };

        // Recalculate variances from scratch
        const newVariances = detectVariances(
          {
            poQuantity: updatedPairing.poQuantity,
            poUnitPrice: updatedPairing.poUnitPrice,
            invoiceQuantity: updatedPairing.invoiceQuantity,
            invoiceUnitPrice: updatedPairing.invoiceUnitPrice,
            grnQuantity: updatedPairing.grnQuantity,
          },
          tolerances
        );

        // Only add missing_grn if there is still no GRN data for this line
        if (updatedPairing.grnQuantity === undefined) {
          newVariances.push({
            type: "missing_grn" as VarianceType,
            expectedValue: updatedPairing.poQuantity,
            actualValue: 0,
            absoluteDifference: updatedPairing.poQuantity,
            percentageDifference: 100,
            exceedsTolerance: true,
          });
        }

        updatedPairing.variances = newVariances;
        return updatedPairing;
      });

      // Recalculate overall variance summary
      const allVariances = updatedPairings.flatMap((p: any) => p.variances ?? []);
      const exceedsToleranceCount = allVariances.filter((v: any) => v.exceedsTolerance).length;

      const priceVariances = allVariances.filter(
        (v: any) => v.type === "price_higher" || v.type === "price_lower"
      );
      const qtyVariances = allVariances.filter(
        (v: any) =>
          v.type === "quantity_over_invoiced" ||
          v.type === "quantity_under_invoiced" ||
          v.type === "over_received"
      );

      const overallVarianceSummary = {
        totalVariances: allVariances.length,
        exceedsToleranceCount,
        maxPriceVariancePercent: priceVariances.length > 0
          ? Math.max(...priceVariances.map((v: any) => v.percentageDifference))
          : undefined,
        maxQuantityVariancePercent: qtyVariances.length > 0
          ? Math.max(...qtyVariances.map((v: any) => v.percentageDifference))
          : undefined,
      };

      await ctx.db.patch(match._id, {
        grnIds: updatedGrnIds,
        matchType: "three_way",
        lineItemPairings: updatedPairings,
        overallVarianceSummary,
        updatedAt: Date.now(),
      });
    }
  },
});

// ============================================
// PUBLIC MUTATIONS (callable from UI / external pipelines)
// ============================================

/**
 * Internal mutation for scheduler-triggered auto-matching.
 * Called after invoice status updates to "completed".
 */
export const tryAutoMatchInternal = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    // Load the invoice
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      return { matched: false, reason: "Invoice not found" };
    }

    const businessId = invoice.businessId;
    if (!businessId) {
      return { matched: false, reason: "Invoice has no businessId" };
    }

    // Check if a match already exists for this invoice
    const existingMatches = await ctx.db
      .query("po_matches")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();

    const alreadyMatched = existingMatches.some(
      (m: any) => m.invoiceId === args.invoiceId
    );
    if (alreadyMatched) {
      return { matched: false, reason: "Invoice already has a match" };
    }

    // Extract PO reference from extractedData
    const extracted = (invoice as any).extractedData as any;
    if (!extracted) {
      return { matched: false, reason: "No extracted data on invoice" };
    }

    // Check multiple possible field names for PO reference
    const purchaseOrderRef =
      extracted.purchase_order_number?.value ??
      extracted.purchase_order_number ??
      extracted.purchaseOrderNumber ??
      extracted.po_number ??
      extracted.poNumber ??
      extracted.po_ref ??
      extracted.purchaseOrderRef ??
      null;

    if (!purchaseOrderRef || typeof purchaseOrderRef !== "string" || purchaseOrderRef.trim() === "") {
      return { matched: false, reason: "No PO reference found in extracted data" };
    }

    // Extract line items from invoice extractedData
    const rawLineItems = extracted.line_items ?? extracted.lineItems ?? [];
    const invoiceLineItems = rawLineItems.map((li: any) => ({
      description: li.description ?? li.item_description ?? "",
      quantity: Number(li.quantity) || 0,
      unitPrice: Number(li.unitPrice ?? li.unit_price ?? li.price) || 0,
      itemCode: li.itemCode ?? li.item_code ?? undefined,
    }));

    // Find PO by reference number
    const pos = await ctx.db
      .query("purchase_orders")
      .withIndex("by_businessId_poNumber", (q: any) =>
        q.eq("businessId", businessId).eq("poNumber", purchaseOrderRef.trim())
      )
      .collect();

    // If not found by exact PO number, try case-insensitive match
    let po: any = pos[0] ?? null;
    if (!po) {
      const allPos = await ctx.db
        .query("purchase_orders")
        .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
        .collect();

      const refLower = purchaseOrderRef.trim().toLowerCase();
      po = allPos.find(
        (p) =>
          p.poNumber.toLowerCase() === refLower &&
          p.status !== "cancelled" &&
          p.status !== "closed" &&
          p.status !== "draft"
      ) ?? null;
    }

    if (!po) {
      return { matched: false, reason: `No PO found matching reference "${purchaseOrderRef}"` };
    }

    // Get tolerances
    const settings = await ctx.db
      .query("matching_settings")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .first();

    const tolerances = {
      quantityTolerancePercent: settings?.quantityTolerancePercent ?? 10,
      priceTolerancePercent: settings?.priceTolerancePercent ?? 5,
    };

    // Check if auto-match is enabled
    if (settings && !settings.autoMatchEnabled) {
      return { matched: false, reason: "Auto-match is disabled for this business" };
    }

    // Get GRNs for this PO
    const grns = await ctx.db
      .query("goods_received_notes")
      .withIndex("by_purchaseOrderId", (q: any) => q.eq("purchaseOrderId", po._id))
      .collect();

    const grnIds = grns.map((g: any) => g._id);
    const allGrnLineItems = grns.flatMap((grn: any) =>
      grn.lineItems.map((li: any, idx: number) => ({ ...li, grnIdx: idx }))
    );

    // Pair line items
    const pairings = pairLineItems(
      po.lineItems,
      invoiceLineItems,
      allGrnLineItems.length > 0 ? allGrnLineItems : undefined,
      tolerances
    );

    // Determine match type
    const matchType = grns.length > 0 ? "three_way" : "two_way";

    // Check variances
    const allVariances = pairings.flatMap((p) => p.variances ?? []);
    const exceedsToleranceCount = allVariances.filter((v) => v.exceedsTolerance).length;
    const status = exceedsToleranceCount > 0 ? "pending_review" : "auto_approved";

    // Build variance summary
    const priceVariances = allVariances.filter(
      (v) => v.type === "price_higher" || v.type === "price_lower"
    );
    const qtyVariances = allVariances.filter(
      (v) =>
        v.type === "quantity_over_invoiced" ||
        v.type === "quantity_under_invoiced" ||
        v.type === "over_received"
    );

    const overallVarianceSummary = {
      totalVariances: allVariances.length,
      exceedsToleranceCount,
      maxPriceVariancePercent: priceVariances.length > 0
        ? Math.max(...priceVariances.map((v) => v.percentageDifference))
        : undefined,
      maxQuantityVariancePercent: qtyVariances.length > 0
        ? Math.max(...qtyVariances.map((v) => v.percentageDifference))
        : undefined,
    };

    const matchId = await ctx.db.insert("po_matches", {
      businessId,
      purchaseOrderId: po._id,
      invoiceId: args.invoiceId,
      grnIds: grnIds.length > 0 ? grnIds : undefined,
      matchType: matchType as "two_way" | "three_way",
      status: status as "auto_approved" | "pending_review",
      lineItemPairings: pairings,
      overallVarianceSummary,
      aiMatchTier: 1, // Deterministic Tier 1
      createdAt: Date.now(),
    });

    // ============================================
    // Tier 2 AI escalation
    // If any pairing has low confidence or match needs review,
    // schedule async AI matching via DSPy Lambda
    // ============================================
    const hasLowConfidence = pairings.some((p) => p.matchConfidence < 0.6);
    if (hasLowConfidence || status === "pending_review") {
      try {
        await ctx.scheduler.runAfter(0, internal.functions.poMatchingAI.matchWithAI, {
          businessId,
          matchId,
          poLineItems: po.lineItems.map((li: any, idx: number) => ({
            index: idx,
            description: li.description ?? "",
            item_code: li.itemCode ?? "",
            quantity: li.quantity ?? 0,
            unit_price: li.unitPrice ?? 0,
            unit_of_measure: li.unitOfMeasure ?? "",
          })),
          invoiceLineItems: invoiceLineItems.map((li: any, idx: number) => ({
            index: idx,
            description: li.description ?? "",
            item_code: li.itemCode ?? "",
            quantity: li.quantity ?? 0,
            unit_price: li.unitPrice ?? 0,
            unit_of_measure: "",
          })),
          grnLineItems: allGrnLineItems.map((li: any) => ({
            description: li.description ?? "",
            quantity: li.receivedQuantity ?? 0,
          })),
          vendorName: po.vendorName ?? "",
          tier1Pairings: pairings.map((p) => ({
            poLineIndex: p.poLineIndex,
            invoiceLineIndex: p.invoiceLineIndex,
            grnLineIndex: p.grnLineIndex,
            matchConfidence: p.matchConfidence,
            matchMethod: p.matchMethod,
          })),
        });
        console.log(`[tryAutoMatchInternal] Scheduled Tier 2 AI matching for match ${matchId}`);
      } catch (e) {
        console.warn("[tryAutoMatchInternal] Failed to schedule Tier 2 AI matching:", e);
      }
    }

    return {
      matched: true,
      matchId,
      status,
      purchaseOrderId: po._id,
      poNumber: po.poNumber,
    };
  },
});

/**
 * Try to auto-match an invoice to a PO.
 *
 * This is a public-facing wrapper around the autoMatch logic.
 * It can be called:
 *  1. From the OCR pipeline (Trigger.dev) after invoice extraction completes
 *  2. From the UI as a "Run Auto-Match" action on an invoice
 *
 * It reads the invoice's extractedData to find a PO reference,
 * then runs the same matching logic as the internal autoMatch mutation.
 */
export const tryAutoMatch = mutation({
  args: {
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Load the invoice
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new Error("Invoice not found");
    }

    const businessId = invoice.businessId;
    if (!businessId) {
      return { matched: false, reason: "Invoice has no businessId" };
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Check if a match already exists for this invoice
    const existingMatches = await ctx.db
      .query("po_matches")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();

    const alreadyMatched = existingMatches.some(
      (m: any) => m.invoiceId === args.invoiceId
    );
    if (alreadyMatched) {
      return { matched: false, reason: "Invoice already has a match" };
    }

    // Extract PO reference from extractedData
    const extracted = (invoice as any).extractedData as any;
    if (!extracted) {
      return { matched: false, reason: "No extracted data on invoice" };
    }

    // Check multiple possible field names for PO reference
    const purchaseOrderRef =
      extracted.purchase_order_number?.value ??
      extracted.purchase_order_number ??
      extracted.purchaseOrderNumber ??
      extracted.po_number ??
      extracted.poNumber ??
      extracted.po_ref ??
      extracted.purchaseOrderRef ??
      null;

    if (!purchaseOrderRef || typeof purchaseOrderRef !== "string" || purchaseOrderRef.trim() === "") {
      return { matched: false, reason: "No PO reference found in extracted data" };
    }

    // Extract line items from invoice extractedData
    const rawLineItems = extracted.line_items ?? extracted.lineItems ?? [];
    const invoiceLineItems = rawLineItems.map((li: any) => ({
      description: li.description ?? li.item_description ?? "",
      quantity: Number(li.quantity) || 0,
      unitPrice: Number(li.unitPrice ?? li.unit_price ?? li.price) || 0,
      itemCode: li.itemCode ?? li.item_code ?? undefined,
    }));

    // --- Core matching logic (same as autoMatch internalMutation) ---

    // Find PO by reference number
    const pos = await ctx.db
      .query("purchase_orders")
      .withIndex("by_businessId_poNumber", (q: any) =>
        q.eq("businessId", businessId).eq("poNumber", purchaseOrderRef.trim())
      )
      .collect();

    // If not found by exact PO number, try case-insensitive match
    let po: any = pos[0] ?? null;
    if (!po) {
      const allPos = await ctx.db
        .query("purchase_orders")
        .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
        .collect();

      const refLower = purchaseOrderRef.trim().toLowerCase();
      po = allPos.find(
        (p) =>
          p.poNumber.toLowerCase() === refLower &&
          p.status !== "cancelled" &&
          p.status !== "closed" &&
          p.status !== "draft"
      ) ?? null;
    }

    if (!po) {
      return { matched: false, reason: `No PO found matching reference "${purchaseOrderRef}"` };
    }

    // Get tolerances
    const settings = await ctx.db
      .query("matching_settings")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .first();

    const tolerances = {
      quantityTolerancePercent: settings?.quantityTolerancePercent ?? 10,
      priceTolerancePercent: settings?.priceTolerancePercent ?? 5,
    };

    // Check if auto-match is enabled
    if (settings && !settings.autoMatchEnabled) {
      return { matched: false, reason: "Auto-match is disabled for this business" };
    }

    // Get GRNs for this PO
    const grns = await ctx.db
      .query("goods_received_notes")
      .withIndex("by_purchaseOrderId", (q: any) => q.eq("purchaseOrderId", po._id))
      .collect();

    const grnIds = grns.map((g: any) => g._id);
    const allGrnLineItems = grns.flatMap((grn: any) =>
      grn.lineItems.map((li: any, idx: number) => ({ ...li, grnIdx: idx }))
    );

    // Pair line items
    const pairings = pairLineItems(
      po.lineItems,
      invoiceLineItems,
      allGrnLineItems.length > 0 ? allGrnLineItems : undefined,
      tolerances
    );

    // Determine match type
    const matchType = grns.length > 0 ? "three_way" : "two_way";

    // Check variances
    const allVariances = pairings.flatMap((p) => p.variances ?? []);
    const exceedsToleranceCount = allVariances.filter((v) => v.exceedsTolerance).length;
    const status = exceedsToleranceCount > 0 ? "pending_review" : "auto_approved";

    // Build variance summary
    const priceVariances = allVariances.filter(
      (v) => v.type === "price_higher" || v.type === "price_lower"
    );
    const qtyVariances = allVariances.filter(
      (v) =>
        v.type === "quantity_over_invoiced" ||
        v.type === "quantity_under_invoiced" ||
        v.type === "over_received"
    );

    const overallVarianceSummary = {
      totalVariances: allVariances.length,
      exceedsToleranceCount,
      maxPriceVariancePercent: priceVariances.length > 0
        ? Math.max(...priceVariances.map((v) => v.percentageDifference))
        : undefined,
      maxQuantityVariancePercent: qtyVariances.length > 0
        ? Math.max(...qtyVariances.map((v) => v.percentageDifference))
        : undefined,
    };

    const matchId = await ctx.db.insert("po_matches", {
      businessId,
      purchaseOrderId: po._id,
      invoiceId: args.invoiceId,
      grnIds: grnIds.length > 0 ? grnIds : undefined,
      matchType: matchType as "two_way" | "three_way",
      status: status as "auto_approved" | "pending_review",
      lineItemPairings: pairings,
      overallVarianceSummary,
      createdAt: Date.now(),
    });

    return {
      matched: true,
      matchId,
      status,
      purchaseOrderId: po._id,
      poNumber: po.poNumber,
    };
  },
});
