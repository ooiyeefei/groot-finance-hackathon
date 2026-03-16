/**
 * E-Invoice Received Documents Functions (019-lhdn-einv-flow-2)
 *
 * Query operations for the einvoice_received_documents table.
 * Documents are inserted by the processLhdnReceivedDocuments mutation in system.ts
 * (called by the LHDN polling Lambda after fetching from LHDN MyInvois API).
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveById, resolveUserByClerkId } from "../lib/resolvers";

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
 * Mutation: Reject a received e-invoice document
 *
 * Called by the buyer rejection API route after LHDN rejection succeeds.
 * Validates status, updates the document, unlinks matched expense claim,
 * and creates a notification for the claim owner.
 */
export const rejectReceivedDocument = mutation({
  args: {
    documentId: v.id("einvoice_received_documents"),
    reason: v.string(),
    rejectedByUserId: v.string(),
  },
  handler: async (ctx, args) => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    // Fetch the document
    const doc = await ctx.db.get(args.documentId);
    if (!doc) {
      throw new Error("Received document not found");
    }

    // Validate status is "valid" (only valid documents can be rejected)
    if (doc.status !== "valid") {
      throw new Error(`Cannot reject document with status "${doc.status}". Only "valid" documents can be rejected.`);
    }

    // Get business for membership check
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", doc.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
      throw new Error("Not authorized: owner, finance_admin, or manager role required");
    }

    // Update the document to rejected
    await ctx.db.patch(doc._id, {
      status: "rejected" as const,
      rejectedAt: Date.now(),
      rejectionReason: args.reason,
      rejectedByUserId: args.rejectedByUserId,
    });

    // If matched to an expense claim, unlink and warn
    if (doc.matchedExpenseClaimId) {
      const claim = await ctx.db.get(doc.matchedExpenseClaimId);
      if (claim) {
        await ctx.db.patch(claim._id, {
          einvoiceRejectionWarning: true,
          einvoiceAttached: false,
          lhdnReceivedDocumentUuid: undefined,
          updatedAt: Date.now(),
        });

        // Create notification for the claim owner
        await ctx.scheduler.runAfter(0, internal.functions.notifications.create, {
          recipientUserId: claim.userId,
          businessId: doc.businessId,
          type: "lhdn_submission" as const,
          severity: "warning" as const,
          title: "E-Invoice Rejected",
          body: `The e-invoice from ${doc.supplierName || "supplier"} (${doc.lhdnDocumentUuid}) linked to your expense claim has been rejected. Reason: ${args.reason}`,
          resourceType: "expense_claim" as const,
          resourceId: claim._id as string,
          sourceEvent: `einvoice_rejected_${doc._id}`,
        });
      }
    }

    console.log(`[E-Invoice Reject] Document ${doc.lhdnDocumentUuid} rejected by ${args.rejectedByUserId}. Reason: ${args.reason}`);

    return { success: true, documentUuid: doc.lhdnDocumentUuid };
  },
});
