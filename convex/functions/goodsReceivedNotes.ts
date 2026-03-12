/**
 * Goods Received Notes (GRN) Functions - Convex queries and mutations
 *
 * These functions handle:
 * - GRN CRUD operations
 * - GRN number auto-generation
 * - PO received quantity updates on GRN creation
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId } from "../lib/resolvers";

// ============================================
// QUERIES
// ============================================

/**
 * List GRNs with filtering
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    purchaseOrderId: v.optional(v.id("purchase_orders")),
    vendorId: v.optional(v.id("vendors")),
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

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    // Query with appropriate index
    let grns;
    if (args.purchaseOrderId) {
      grns = await ctx.db
        .query("goods_received_notes")
        .withIndex("by_purchaseOrderId", (q: any) =>
          q.eq("purchaseOrderId", args.purchaseOrderId!)
        )
        .collect();
      // Filter by businessId for safety
      grns = grns.filter((g: any) => g.businessId === args.businessId);
    } else if (args.vendorId) {
      grns = await ctx.db
        .query("goods_received_notes")
        .withIndex("by_businessId_vendorId", (q: any) =>
          q.eq("businessId", args.businessId).eq("vendorId", args.vendorId!)
        )
        .collect();
    } else {
      grns = await ctx.db
        .query("goods_received_notes")
        .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
        .collect();
    }

    // Sort by creation date descending
    grns.sort((a: any, b: any) => b.createdAt - a.createdAt);

    // Enrich with vendor name and PO number
    const enriched = await Promise.all(
      grns.map(async (grn: any) => {
        const vendor = await ctx.db.get(grn.vendorId) as any;
        let poNumber: string | undefined;
        if (grn.purchaseOrderId) {
          const po = await ctx.db.get(grn.purchaseOrderId) as any;
          poNumber = po?.poNumber;
        }
        return {
          ...grn,
          vendorName: vendor?.name ?? "Unknown Vendor",
          poNumber,
        };
      })
    );

    return enriched;
  },
});

/**
 * Get a single GRN with vendor and PO context
 */
export const get = query({
  args: { grnId: v.id("goods_received_notes") },
  handler: async (ctx, args) => {
    const grn = await ctx.db.get(args.grnId);
    if (!grn) {
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

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", grn.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    const vendor = await ctx.db.get(grn.vendorId);

    let purchaseOrder = null;
    if (grn.purchaseOrderId) {
      purchaseOrder = await ctx.db.get(grn.purchaseOrderId);
    }

    return {
      ...grn,
      vendor: vendor ?? null,
      purchaseOrder,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new GRN
 * If linked to a PO, updates PO received quantities and status
 */
export const create = mutation({
  args: {
    vendorId: v.id("vendors"),
    purchaseOrderId: v.optional(v.id("purchase_orders")),
    grnDate: v.string(),
    lineItems: v.array(v.object({
      poLineItemIndex: v.optional(v.number()),
      itemCode: v.optional(v.string()),
      description: v.string(),
      quantityReceived: v.number(),
      quantityRejected: v.optional(v.number()),
      condition: v.optional(v.union(
        v.literal("good"),
        v.literal("damaged"),
        v.literal("rejected")
      )),
      notes: v.optional(v.string()),
    })),
    sourceDocumentId: v.optional(v.id("_storage")),
    sourceInvoiceId: v.optional(v.id("invoices")),
    notes: v.optional(v.string()),
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

    // Validate vendor exists
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", vendor.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Validate PO if linked
    let po = null;
    if (args.purchaseOrderId) {
      po = await ctx.db.get(args.purchaseOrderId);
      if (!po) {
        throw new Error("Purchase order not found");
      }
      if (po.businessId !== vendor.businessId) {
        throw new Error("Purchase order does not belong to this business");
      }
      if (po.status === "draft" || po.status === "cancelled" || po.status === "closed") {
        throw new Error(`Cannot receive against a ${po.status} purchase order`);
      }
    }

    // Generate GRN number
    const settings = await ctx.db
      .query("matching_settings")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", vendor.businessId))
      .first();

    const prefix = settings?.grnNumberPrefix ?? "GRN";
    const year = new Date().getFullYear();

    const existingGRNs = await ctx.db
      .query("goods_received_notes")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", vendor.businessId))
      .collect();

    const yearGRNs = existingGRNs.filter((grn: any) => {
      const grnYear = grn.grnNumber?.match(/\d{4}/)?.[0];
      return grnYear === String(year);
    });

    const nextNumber = yearGRNs.length + 1;
    const grnNumber = `${prefix}-${year}-${String(nextNumber).padStart(3, "0")}`;

    // Build line items with PO reference data
    const lineItems = args.lineItems.map((item) => {
      const enriched: any = {
        ...item,
      };

      // Add ordered quantity from PO if linked
      if (po && item.poLineItemIndex !== undefined && item.poLineItemIndex !== null) {
        const poLine = po.lineItems[item.poLineItemIndex];
        if (poLine) {
          enriched.quantityOrdered = poLine.quantity;
        }
      }

      return enriched;
    });

    const grnId = await ctx.db.insert("goods_received_notes", {
      businessId: vendor.businessId,
      vendorId: args.vendorId,
      grnNumber,
      purchaseOrderId: args.purchaseOrderId,
      grnDate: args.grnDate,
      receivedBy: user._id,
      lineItems,
      sourceDocumentId: args.sourceDocumentId,
      sourceInvoiceId: args.sourceInvoiceId,
      notes: args.notes,
      createdBy: user._id,
      createdAt: Date.now(),
    });

    // Update PO received quantities if linked
    if (po && args.purchaseOrderId) {
      const lineUpdates = args.lineItems
        .filter((item) => item.poLineItemIndex !== undefined && item.poLineItemIndex !== null)
        .map((item) => ({
          lineIndex: item.poLineItemIndex!,
          additionalReceived: item.quantityReceived,
        }));

      if (lineUpdates.length > 0) {
        // Directly update PO line items (we're in a mutation, so we can patch)
        const updatedLineItems = [...po.lineItems];
        for (const update of lineUpdates) {
          if (update.lineIndex >= 0 && update.lineIndex < updatedLineItems.length) {
            const line = updatedLineItems[update.lineIndex];
            updatedLineItems[update.lineIndex] = {
              ...line,
              receivedQuantity: (line.receivedQuantity ?? 0) + update.additionalReceived,
            };
          }
        }

        // Determine new PO status
        const allFullyReceived = updatedLineItems.every(
          (line) => (line.receivedQuantity ?? 0) >= line.quantity
        );
        const someReceived = updatedLineItems.some(
          (line) => (line.receivedQuantity ?? 0) > 0
        );

        let newStatus = po.status;
        if (allFullyReceived) {
          newStatus = "fully_received";
        } else if (someReceived && (po.status === "issued" || po.status === "partially_received")) {
          newStatus = "partially_received";
        }

        await ctx.db.patch(args.purchaseOrderId, {
          lineItems: updatedLineItems,
          status: newStatus,
          updatedAt: Date.now(),
        });
      }

      // Re-evaluate existing matches for this PO — recalculate variances
      // with new GRN data, remove "missing_grn" where applicable, and
      // upgrade matchType to "three_way"
      const existingMatches = await ctx.db
        .query("po_matches")
        .withIndex("by_purchaseOrderId", (q: any) => q.eq("purchaseOrderId", args.purchaseOrderId))
        .collect();

      if (existingMatches.length > 0) {
        // Load ALL GRNs for this PO (including the one just created)
        const allGrns = await ctx.db
          .query("goods_received_notes")
          .withIndex("by_purchaseOrderId", (q: any) => q.eq("purchaseOrderId", args.purchaseOrderId))
          .collect();

        const allGrnLineItems = allGrns.flatMap((grn: any) =>
          grn.lineItems.map((li: any, idx: number) => ({ ...li, grnIdx: idx }))
        );

        // Get tolerances
        const matchSettings = await ctx.db
          .query("matching_settings")
          .withIndex("by_businessId", (q: any) => q.eq("businessId", vendor.businessId))
          .first();

        const tolerances = {
          quantityTolerancePercent: matchSettings?.quantityTolerancePercent ?? 10,
          priceTolerancePercent: matchSettings?.priceTolerancePercent ?? 5,
        };

        for (const match of existingMatches) {
          if (match.status === "pending_review" || match.status === "on_hold") {
            const existingGrnIds = match.grnIds ?? [];
            const updatedGrnIds = existingGrnIds.includes(grnId)
              ? existingGrnIds
              : [...existingGrnIds, grnId];

            // Recalculate variances for each line item pairing
            const updatedPairings = (match.lineItemPairings ?? []).map((pairing: any) => {
              const grnLine = allGrnLineItems.find(
                (g: any) => g.poLineItemIndex === pairing.poLineIndex
              );

              const updatedPairing = {
                ...pairing,
                grnQuantity: grnLine?.quantityReceived,
                grnLineIndex: grnLine ? allGrnLineItems.indexOf(grnLine) : pairing.grnLineIndex,
              };

              // Recalculate variances
              const newVariances: any[] = [];

              // Quantity variance (invoice vs PO)
              if (updatedPairing.invoiceQuantity !== undefined) {
                const qtyDiff = updatedPairing.invoiceQuantity - updatedPairing.poQuantity;
                const qtyPct = updatedPairing.poQuantity > 0
                  ? Math.abs(qtyDiff / updatedPairing.poQuantity) * 100
                  : 0;
                if (Math.abs(qtyDiff) > 0.001) {
                  newVariances.push({
                    type: qtyDiff > 0 ? "quantity_over_invoiced" : "quantity_under_invoiced",
                    expectedValue: updatedPairing.poQuantity,
                    actualValue: updatedPairing.invoiceQuantity,
                    absoluteDifference: Math.abs(qtyDiff),
                    percentageDifference: Math.round(qtyPct * 100) / 100,
                    exceedsTolerance: qtyPct > tolerances.quantityTolerancePercent,
                  });
                }
              }

              // Price variance (invoice vs PO)
              if (updatedPairing.invoiceUnitPrice !== undefined) {
                const priceDiff = updatedPairing.invoiceUnitPrice - updatedPairing.poUnitPrice;
                const pricePct = updatedPairing.poUnitPrice > 0
                  ? Math.abs(priceDiff / updatedPairing.poUnitPrice) * 100
                  : 0;
                if (Math.abs(priceDiff) > 0.001) {
                  newVariances.push({
                    type: priceDiff > 0 ? "price_higher" : "price_lower",
                    expectedValue: updatedPairing.poUnitPrice,
                    actualValue: updatedPairing.invoiceUnitPrice,
                    absoluteDifference: Math.abs(priceDiff),
                    percentageDifference: Math.round(pricePct * 100) / 100,
                    exceedsTolerance: pricePct > tolerances.priceTolerancePercent,
                  });
                }
              }

              // Over-received (GRN quantity > PO quantity)
              if (updatedPairing.grnQuantity !== undefined) {
                const overReceived = updatedPairing.grnQuantity - updatedPairing.poQuantity;
                if (overReceived > 0.001) {
                  const overPct = updatedPairing.poQuantity > 0
                    ? (overReceived / updatedPairing.poQuantity) * 100
                    : 0;
                  newVariances.push({
                    type: "over_received",
                    expectedValue: updatedPairing.poQuantity,
                    actualValue: updatedPairing.grnQuantity,
                    absoluteDifference: overReceived,
                    percentageDifference: Math.round(overPct * 100) / 100,
                    exceedsTolerance: overPct > tolerances.quantityTolerancePercent,
                  });
                }
              }

              // Only add missing_grn if there is still no GRN data for this line
              if (updatedPairing.grnQuantity === undefined) {
                newVariances.push({
                  type: "missing_grn",
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
        }
      }
    }

    return grnId;
  },
});
