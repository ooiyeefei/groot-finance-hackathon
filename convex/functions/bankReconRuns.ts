/**
 * Bank Recon Runs Functions — Convex queries and mutations
 *
 * Tracks chat-triggered bank reconciliation executions.
 * Provides concurrency guard (only one active run per business).
 */

import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";

const reconStatusValidator = v.union(
  v.literal("running"),
  v.literal("complete"),
  v.literal("failed")
);

// ============================================
// INTERNAL MUTATIONS
// ============================================

/**
 * Create a new recon run — returns null if a run is already in progress
 */
export const create = internalMutation({
  args: {
    businessId: v.id("businesses"),
    bankAccountId: v.id("bank_accounts"),
    triggeredBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Concurrency guard: check for active run
    const activeRun = await ctx.db
      .query("bank_recon_runs")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", args.businessId).eq("status", "running")
      )
      .first();

    if (activeRun) {
      return { error: "reconciliation_in_progress", runId: activeRun._id };
    }

    const id = await ctx.db.insert("bank_recon_runs", {
      businessId: args.businessId,
      bankAccountId: args.bankAccountId,
      triggeredBy: args.triggeredBy,
      status: "running",
      startedAt: Date.now(),
      matchedCount: 0,
      pendingReviewCount: 0,
      unmatchedCount: 0,
    });

    return { runId: id };
  },
});

/**
 * Update run with results
 */
export const updateStatus = internalMutation({
  args: {
    runId: v.id("bank_recon_runs"),
    status: reconStatusValidator,
    matchedCount: v.optional(v.number()),
    pendingReviewCount: v.optional(v.number()),
    unmatchedCount: v.optional(v.number()),
    errorReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { runId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }
    if (updates.status === "complete" || updates.status === "failed") {
      patch.completedAt = Date.now();
    }
    await ctx.db.patch(runId, patch);
  },
});

// ============================================
// INTERNAL QUERIES
// ============================================

/**
 * Get active (running) recon run for a business
 */
export const getActiveRun = internalQuery({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bank_recon_runs")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", args.businessId).eq("status", "running")
      )
      .first();
  },
});

/**
 * Get latest completed run for a bank account
 */
export const getLatestByAccount = internalQuery({
  args: { bankAccountId: v.id("bank_accounts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bank_recon_runs")
      .withIndex("by_bankAccountId", (q) =>
        q.eq("bankAccountId", args.bankAccountId)
      )
      .order("desc")
      .first();
  },
});
