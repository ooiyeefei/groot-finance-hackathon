/**
 * E-Invoice Received Documents Functions (019-lhdn-einv-flow-2)
 *
 * Query operations for the einvoice_received_documents table.
 * Documents are inserted by the processLhdnReceivedDocuments mutation in system.ts
 * (called by the LHDN polling Lambda after fetching from LHDN MyInvois API).
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveById, resolveUserByClerkId } from "../lib/resolvers";
import { createRejectionNotification } from "./notifications";

/**
 * Query: List unmatched received documents for a business
 * Used by admin review dashboard to manually resolve Tier 3 fuzzy matches
 */
export const listUnmatched = query({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return [];

    const docs = await ctx.db
      .query("einvoice_received_documents")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", business._id).eq("status", "valid")
      )
      .collect();

    // Return only unmatched documents
    return docs
      .filter((doc) => !doc.matchedExpenseClaimId)
      .map((doc) => ({
        _id: doc._id,
        lhdnDocumentUuid: doc.lhdnDocumentUuid,
        supplierName: doc.supplierName,
        supplierTin: doc.supplierTin,
        total: doc.total,
        dateTimeIssued: doc.dateTimeIssued,
        buyerEmail: doc.buyerEmail,
        matchCandidateClaimIds: doc.matchCandidateClaimIds,
        matchTier: doc.matchTier,
        matchConfidence: doc.matchConfidence,
        processedAt: doc.processedAt,
      }));
  },
});

/**
 * Query: Get a received document by its LHDN document UUID
 * Used by the buyer rejection API route to look up the document
 */
export const getByUuid = query({
  args: {
    uuid: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const doc = await ctx.db
      .query("einvoice_received_documents")
      .withIndex("by_lhdnDocumentUuid", (q: any) => q.eq("lhdnDocumentUuid", args.uuid))
      .first();

    return doc;
  },
});

/**
 * Mutation: Reject a received e-invoice (buyer rejection)
 *
 * Called by the buyer rejection API route after LHDN rejection succeeds.
 * Validates status, updates the document, updates linked AP invoice or expense claim,
 * and creates a notification for the stakeholder.
 *
 * Security: Requires authentication + document validation
 */
export const rejectReceivedDocument = mutation({
  args: {
    documentId: v.id("einvoice_received_documents"),
    documentUuid: v.string(),
    reason: v.string(),
    rejectedByUserId: v.string(),
  },
  handler: async (ctx, args) => {
    // Authenticate
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required");
    }

    // Fetch the document
    const doc = await ctx.db.get(args.documentId);
    if (!doc) {
      throw new Error("Received document not found");
    }

    // Validate status is "valid" (only valid documents can be rejected)
    if (doc.status !== "valid") {
      throw new Error(`Cannot reject document with status "${doc.status}". Only "valid" documents can be rejected.`);
    }

    // Note: 72-hour window validation is performed in the API route
    // using doc.processedAt. No need to duplicate the check here.

    // Update the document to rejected
    await ctx.db.patch(doc._id, {
      status: "rejected" as const,
      rejectedAt: Date.now(),
      rejectionReason: args.reason,
      rejectedByUserId: args.rejectedByUserId,
    });

    // Handle side effects based on what this e-invoice is linked to
    const supplierName = doc.supplierName || "Unknown Supplier";

    // Check if linked to expense claim (small merchant e-invoices)
    // NOTE: AP invoice matching (doc.matchedInvoiceId) not yet implemented in schema
    if (doc.matchedExpenseClaimId) {
      const claim = await ctx.db.get(doc.matchedExpenseClaimId);
      if (claim) {
        // Clear e-invoice attachment from claim
        // Note: lhdnReceivedStatus schema only supports "valid" | "cancelled", not "rejected"
        // Rejection status is tracked in einvoice_received_documents table
        await ctx.db.patch(claim._id, {
          einvoiceAttached: false,
          updatedAt: Date.now(),
        });

        // Notify claim submitter
        await createRejectionNotification(
          ctx,
          claim.userId,
          doc.businessId,
          supplierName,
          args.reason,
          `/expense-claims/${claim._id}`
        );

        console.log(`[E-Invoice Reject] Expense claim ${claim._id} e-invoice attachment cleared`);
      }
    }
    // If neither linked, no side effects (orphan document rejection)
    else {
      console.log(`[E-Invoice Reject] Document ${doc.lhdnDocumentUuid} rejected (no linked invoice/claim)`);
    }

    console.log(`[E-Invoice Reject] Document ${doc.lhdnDocumentUuid} rejected by ${args.rejectedByUserId}. Reason: ${args.reason}`);

    return { success: true, documentUuid: doc.lhdnDocumentUuid };
  },
});
