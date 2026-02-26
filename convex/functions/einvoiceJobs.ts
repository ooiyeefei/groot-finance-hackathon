/**
 * E-Invoice Jobs — Mutations (019-lhdn-einv-flow-2)
 *
 * Internal mutations for e-invoice matching helpers,
 * called by actions in einvoiceJobsNode.ts (email processing).
 *
 * Exports:
 * - findClaimByEmailRef: Tier 1 matching by email ref (used by email processing)
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

// ============================================
// MATCHING HELPERS (used by email processing in einvoiceJobsNode.ts)
// ============================================

export const findClaimByEmailRef = internalMutation({
  args: { emailRef: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("expense_claims")
      .withIndex("by_einvoiceEmailRef", (q) => q.eq("einvoiceEmailRef", args.emailRef))
      .first();
  },
});
