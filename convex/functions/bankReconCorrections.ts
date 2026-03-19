/**
 * Bank Recon Corrections — stores user corrections for DSPy training
 *
 * When a user changes the suggested GL accounts for a bank transaction,
 * the correction is stored here and later consumed by the DSPy optimizer
 * to improve classification accuracy.
 */

import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAuthenticatedUser } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";

const BANK_RECON_ROLES = ["owner", "finance_admin", "manager"];

/**
 * Create a correction record when a user overrides a classification.
 * Internal mutation — called from bank transaction update flow.
 */
export const create = internalMutation({
  args: {
    businessId: v.id("businesses"),
    bankTransactionDescription: v.string(),
    bankName: v.string(),
    originalDebitAccountCode: v.string(),
    originalCreditAccountCode: v.string(),
    correctedDebitAccountCode: v.string(),
    correctedCreditAccountCode: v.string(),
    correctionType: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const correctionId = await ctx.db.insert("bank_recon_corrections", {
      businessId: args.businessId,
      bankTransactionDescription: args.bankTransactionDescription,
      bankName: args.bankName,
      originalDebitAccountCode: args.originalDebitAccountCode,
      originalCreditAccountCode: args.originalCreditAccountCode,
      correctedDebitAccountCode: args.correctedDebitAccountCode,
      correctedCreditAccountCode: args.correctedCreditAccountCode,
      correctionType: args.correctionType,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

    // Record override for DSPy metrics (027-dspy-dash)
    await ctx.scheduler.runAfter(0, internal.functions.dspyMetrics.recordOverride, {
      businessId: args.businessId,
      tool: "classify_bank_transaction",
    });

    return correctionId;
  },
});

/**
 * List corrections for a business — authenticated query for UI display.
 */
export const listForBusiness = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Check membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("No access to this business");
    }

    if (!BANK_RECON_ROLES.includes(membership.role)) {
      throw new Error("Insufficient permissions");
    }

    return await ctx.db
      .query("bank_recon_corrections")
      .withIndex("by_businessId_createdAt", (q) =>
        q.eq("businessId", args.businessId)
      )
      .order("desc")
      .collect();
  },
});

/**
 * Get training data for DSPy optimization — internal query.
 * Returns corrections with unique description count and optional afterCorrectionId filter.
 */
export const getTrainingData = internalQuery({
  args: {
    businessId: v.id("businesses"),
    afterCorrectionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let corrections = await ctx.db
      .query("bank_recon_corrections")
      .withIndex("by_businessId_createdAt", (q) =>
        q.eq("businessId", args.businessId)
      )
      .order("asc")
      .collect();

    // Filter to only corrections after the given ID (for incremental optimization)
    if (args.afterCorrectionId) {
      const afterIdx = corrections.findIndex(
        (c) => c._id === args.afterCorrectionId
      );
      if (afterIdx >= 0) {
        corrections = corrections.slice(afterIdx + 1);
      }
    }

    // Count unique descriptions for training diversity check
    const uniqueDescriptions = new Set(
      corrections.map((c) => c.bankTransactionDescription.toLowerCase().trim())
    );

    return {
      corrections: corrections.map((c) => ({
        _id: c._id,
        description: c.bankTransactionDescription,
        bankName: c.bankName,
        originalDebitAccountCode: c.originalDebitAccountCode,
        originalCreditAccountCode: c.originalCreditAccountCode,
        correctedDebitAccountCode: c.correctedDebitAccountCode,
        correctedCreditAccountCode: c.correctedCreditAccountCode,
        correctionType: c.correctionType,
        createdAt: c.createdAt,
      })),
      uniqueDescriptions: uniqueDescriptions.size,
      totalCorrections: corrections.length,
    };
  },
});
