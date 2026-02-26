/**
 * E-Invoice Received Documents Functions (019-lhdn-einv-flow-2)
 *
 * Query operations for the einvoice_received_documents table.
 * Documents are inserted by the processLhdnReceivedDocuments mutation in system.ts
 * (called by the LHDN polling Lambda after fetching from LHDN MyInvois API).
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { resolveById } from "../lib/resolvers";

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
