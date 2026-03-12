/**
 * Reconciliation Matches Functions - Convex queries, mutations, and actions
 * 021-bank-statement-import-recon
 *
 * Auto-matching engine + manual reconciliation workflows + split matching.
 * Matches bank transactions against accounting_entries.
 * Access restricted to owner/finance_admin/manager roles.
 */

import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation, action } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAuthenticatedUser } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";

const BANK_RECON_ROLES = ["owner", "finance_admin", "manager"];

async function requireBankReconAccess(
  ctx: { db: any; auth: any },
  businessId: Id<"businesses">
): Promise<{ userId: Id<"users"> }> {
  const user = await getAuthenticatedUser(ctx);
  if (!user) throw new Error("Not authenticated");

  const membership = await ctx.db
    .query("business_memberships")
    .withIndex("by_userId_businessId", (q: any) =>
      q.eq("userId", user._id).eq("businessId", businessId)
    )
    .first();

  if (!membership || membership.status !== "active") {
    throw new Error("No access to this business");
  }

  if (!BANK_RECON_ROLES.includes(membership.role)) {
    throw new Error("Insufficient permissions for bank reconciliation");
  }

  return { userId: user._id };
}

async function checkBankReconAccess(
  ctx: { db: any; auth: any },
  businessId: Id<"businesses">
): Promise<boolean> {
  const user = await getAuthenticatedUser(ctx);
  if (!user) return false;

  const membership = await ctx.db
    .query("business_memberships")
    .withIndex("by_userId_businessId", (q: any) =>
      q.eq("userId", user._id).eq("businessId", businessId)
    )
    .first();

  if (!membership || membership.status !== "active") return false;
  return BANK_RECON_ROLES.includes(membership.role);
}

/**
 * Compute word-overlap score between two strings.
 * Returns 0..1 representing fraction of significant words that overlap.
 */
function descriptionSimilarity(a: string, b: string): number {
  const stopWords = new Set(["the", "a", "an", "of", "to", "in", "for", "and", "or", "is", "on", "at", "by", "from", "with"]);

  const tokenize = (s: string) =>
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

  const tokensA = tokenize(a);
  const tokensB = new Set(tokenize(b));

  if (tokensA.length === 0 || tokensB.size === 0) return 0;

  const matches = tokensA.filter((w) => tokensB.has(w)).length;
  return matches / Math.max(tokensA.length, tokensB.size);
}

// ============================================
// QUERIES
// ============================================

export const getCandidates = query({
  args: {
    bankTransactionId: v.id("bank_transactions"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const bankTx = await ctx.db.get(args.bankTransactionId);
    if (!bankTx) return [];

    const hasAccess = await checkBankReconAccess(ctx, bankTx.businessId);
    if (!hasAccess) return [];

    // Get existing matches to filter rejected ones
    const existingMatches = await ctx.db
      .query("reconciliation_matches")
      .withIndex("by_bankTransactionId", (q) =>
        q.eq("bankTransactionId", args.bankTransactionId)
      )
      .collect();

    const rejectedEntryIds = new Set(
      existingMatches
        .filter((m) => m.status === "rejected")
        .map((m) => m.accountingEntryId.toString())
    );

    // Find candidate accounting entries by amount match
    const allEntries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) =>
        q.eq("businessId", bankTx.businessId)
      )
      .collect();

    const candidates = [];

    for (const entry of allEntries) {
      if (entry.deletedAt) continue;
      if (rejectedEntryIds.has(entry._id.toString())) continue;

      // Skip entries already reconciled by another bank transaction
      const entryMatches = await ctx.db
        .query("reconciliation_matches")
        .withIndex("by_accountingEntryId", (q) =>
          q.eq("accountingEntryId", entry._id)
        )
        .collect();
      const isAlreadyReconciled = entryMatches.some(
        (m) => m.status === "confirmed" && !m.deletedAt
      );
      if (isAlreadyReconciled) continue;

      const entryAmount = entry.originalAmount;
      let confidenceScore = 0;
      let matchReason = "";

      // Exact amount match is the baseline
      if (Math.abs(entryAmount - bankTx.amount) < 0.01) {
        confidenceScore = 0.3;
        matchReason = "Amount match";

        // Reference match in description
        const refNum = entry.referenceNumber?.toLowerCase() ?? "";
        const desc = bankTx.description.toLowerCase();
        const bankRef = bankTx.reference?.toLowerCase() ?? "";

        if (refNum && (desc.includes(refNum) || bankRef.includes(refNum))) {
          confidenceScore = 0.95;
          matchReason = "Reference + amount match";
        } else {
          // Date proximity check (±3 days)
          const entryDate = new Date(entry.transactionDate);
          const txDate = new Date(bankTx.transactionDate);
          const daysDiff = Math.abs(
            (entryDate.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysDiff <= 3) {
            confidenceScore = 0.7;
            matchReason = "Amount + date proximity match";
          }
        }

        // Description similarity boost
        const descScore = descriptionSimilarity(
          bankTx.description,
          [entry.description ?? "", entry.vendorName ?? ""].join(" ")
        );
        if (descScore >= 0.3 && confidenceScore < 0.95) {
          confidenceScore = Math.min(confidenceScore + descScore * 0.2, 0.94);
          matchReason += " + description similarity";
        }

        if (confidenceScore >= 0.3) {
          const confidenceLevel =
            confidenceScore >= 0.9 ? "high" :
            confidenceScore >= 0.6 ? "medium" : "low";

          candidates.push({
            accountingEntry: entry,
            confidenceScore,
            confidenceLevel,
            matchReason,
          });
        }
      }
    }

    // Sort by confidence score descending
    candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);

    return candidates.slice(0, 10);
  },
});

export const getByBankTransaction = query({
  args: {
    bankTransactionId: v.id("bank_transactions"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const matches = await ctx.db
      .query("reconciliation_matches")
      .withIndex("by_bankTransactionId", (q) =>
        q.eq("bankTransactionId", args.bankTransactionId)
      )
      .collect();

    const activeMatch = matches.find(
      (m) => (m.status === "confirmed" || m.status === "suggested") && !m.deletedAt
    );

    if (!activeMatch) return null;

    const accountingEntry = await ctx.db.get(activeMatch.accountingEntryId);

    return {
      ...activeMatch,
      accountingEntry,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

export const confirmMatch = mutation({
  args: {
    matchId: v.id("reconciliation_matches"),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Match not found");

    const { userId } = await requireBankReconAccess(ctx, match.businessId);

    await ctx.db.patch(args.matchId, {
      status: "confirmed",
      confirmedBy: userId,
      confirmedAt: Date.now(),
    });

    // Update bank transaction status
    await ctx.db.patch(match.bankTransactionId, {
      reconciliationStatus: "reconciled",
    });
  },
});

export const rejectMatch = mutation({
  args: {
    matchId: v.id("reconciliation_matches"),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Match not found");

    const { userId } = await requireBankReconAccess(ctx, match.businessId);

    await ctx.db.patch(args.matchId, {
      status: "rejected",
      confirmedBy: userId,
      confirmedAt: Date.now(),
    });

    // Check if there are other non-rejected matches for this transaction
    const otherMatches = await ctx.db
      .query("reconciliation_matches")
      .withIndex("by_bankTransactionId", (q) =>
        q.eq("bankTransactionId", match.bankTransactionId)
      )
      .collect();

    const hasOtherSuggestions = otherMatches.some(
      (m) => m._id.toString() !== args.matchId.toString() && m.status === "suggested" && !m.deletedAt
    );

    if (!hasOtherSuggestions) {
      await ctx.db.patch(match.bankTransactionId, {
        reconciliationStatus: "unmatched",
      });
    }
  },
});

export const createManualMatch = mutation({
  args: {
    bankTransactionId: v.id("bank_transactions"),
    accountingEntryId: v.id("accounting_entries"),
  },
  handler: async (ctx, args) => {
    const bankTx = await ctx.db.get(args.bankTransactionId);
    if (!bankTx) throw new Error("Bank transaction not found");

    const { userId } = await requireBankReconAccess(ctx, bankTx.businessId);

    const matchId = await ctx.db.insert("reconciliation_matches", {
      businessId: bankTx.businessId,
      bankTransactionId: args.bankTransactionId,
      accountingEntryId: args.accountingEntryId,
      matchType: "manual",
      confidenceScore: 1.0,
      confidenceLevel: "high",
      matchReason: "Manual match by user",
      status: "confirmed",
      confirmedBy: userId,
      confirmedAt: Date.now(),
    });

    await ctx.db.patch(args.bankTransactionId, {
      reconciliationStatus: "reconciled",
    });

    return matchId;
  },
});

/**
 * Split matching: match one bank transaction to multiple accounting entries
 * whose amounts sum to the bank transaction amount.
 */
export const createSplitMatch = mutation({
  args: {
    bankTransactionId: v.id("bank_transactions"),
    accountingEntryIds: v.array(v.id("accounting_entries")),
  },
  handler: async (ctx, args) => {
    const bankTx = await ctx.db.get(args.bankTransactionId);
    if (!bankTx) throw new Error("Bank transaction not found");

    const { userId } = await requireBankReconAccess(ctx, bankTx.businessId);

    if (args.accountingEntryIds.length < 2) {
      throw new Error("Split match requires at least 2 accounting entries");
    }

    // Verify the entries sum to the bank transaction amount
    let total = 0;
    for (const entryId of args.accountingEntryIds) {
      const entry = await ctx.db.get(entryId);
      if (!entry) throw new Error(`Accounting entry ${entryId} not found`);
      if (entry.deletedAt) throw new Error(`Accounting entry ${entryId} is deleted`);
      total += entry.originalAmount;
    }

    if (Math.abs(total - bankTx.amount) >= 0.01) {
      throw new Error(
        `Split entries total (${total.toFixed(2)}) does not match bank transaction amount (${bankTx.amount.toFixed(2)})`
      );
    }

    // Create a match record for each entry
    const matchIds: Id<"reconciliation_matches">[] = [];
    for (const entryId of args.accountingEntryIds) {
      const entry = await ctx.db.get(entryId);
      const fraction = entry!.originalAmount / bankTx.amount;

      const matchId = await ctx.db.insert("reconciliation_matches", {
        businessId: bankTx.businessId,
        bankTransactionId: args.bankTransactionId,
        accountingEntryId: entryId,
        matchType: "manual",
        confidenceScore: 1.0,
        confidenceLevel: "high",
        matchReason: `Split match (${args.accountingEntryIds.length} entries, ${Math.round(fraction * 100)}% of total)`,
        status: "confirmed",
        confirmedBy: userId,
        confirmedAt: Date.now(),
      });
      matchIds.push(matchId);
    }

    await ctx.db.patch(args.bankTransactionId, {
      reconciliationStatus: "reconciled",
    });

    return matchIds;
  },
});

export const unmatch = mutation({
  args: {
    bankTransactionId: v.id("bank_transactions"),
  },
  handler: async (ctx, args) => {
    const bankTx = await ctx.db.get(args.bankTransactionId);
    if (!bankTx) throw new Error("Bank transaction not found");

    await requireBankReconAccess(ctx, bankTx.businessId);

    // Find and soft-delete active matches (supports split matches — multiple confirmed)
    const matches = await ctx.db
      .query("reconciliation_matches")
      .withIndex("by_bankTransactionId", (q) =>
        q.eq("bankTransactionId", args.bankTransactionId)
      )
      .collect();

    for (const match of matches) {
      if (match.status === "confirmed" && !match.deletedAt) {
        await ctx.db.patch(match._id, {
          deletedAt: Date.now(),
        });
      }
    }

    await ctx.db.patch(args.bankTransactionId, {
      reconciliationStatus: "unmatched",
    });
  },
});

// ============================================
// INTERNAL FUNCTIONS (used by action)
// ============================================

export const internalGetUnmatchedTransactions = internalQuery({
  args: {
    bankAccountId: v.id("bank_accounts"),
  },
  handler: async (ctx, args) => {
    const transactions = await ctx.db
      .query("bank_transactions")
      .withIndex("by_bankAccountId_status", (q) =>
        q.eq("bankAccountId", args.bankAccountId).eq("reconciliationStatus", "unmatched")
      )
      .collect();

    return transactions.filter((t) => !t.deletedAt);
  },
});

export const internalFindCandidates = internalQuery({
  args: {
    bankTransactionId: v.id("bank_transactions"),
  },
  handler: async (ctx, args) => {
    const bankTx = await ctx.db.get(args.bankTransactionId);
    if (!bankTx) return [];

    const existingMatches = await ctx.db
      .query("reconciliation_matches")
      .withIndex("by_bankTransactionId", (q) =>
        q.eq("bankTransactionId", args.bankTransactionId)
      )
      .collect();

    const rejectedEntryIds = new Set(
      existingMatches.filter((m) => m.status === "rejected").map((m) => m.accountingEntryId.toString())
    );

    const allEntries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", bankTx.businessId))
      .collect();

    const candidates: Array<{
      accountingEntryId: Id<"accounting_entries">;
      confidenceScore: number;
      confidenceLevel: "high" | "medium" | "low";
      matchReason: string;
    }> = [];

    for (const entry of allEntries) {
      if (entry.deletedAt) continue;
      if (rejectedEntryIds.has(entry._id.toString())) continue;

      const entryMatches = await ctx.db
        .query("reconciliation_matches")
        .withIndex("by_accountingEntryId", (q) => q.eq("accountingEntryId", entry._id))
        .collect();
      if (entryMatches.some((m) => m.status === "confirmed" && !m.deletedAt)) continue;

      const entryAmount = entry.originalAmount;
      if (Math.abs(entryAmount - bankTx.amount) >= 0.01) continue;

      let confidenceScore = 0.3;
      let matchReason = "Amount match";

      const refNum = entry.referenceNumber?.toLowerCase() ?? "";
      const desc = bankTx.description.toLowerCase();
      const bankRef = bankTx.reference?.toLowerCase() ?? "";

      if (refNum && (desc.includes(refNum) || bankRef.includes(refNum))) {
        confidenceScore = 0.95;
        matchReason = "Reference + amount match";
      } else {
        const entryDate = new Date(entry.transactionDate);
        const txDate = new Date(bankTx.transactionDate);
        const daysDiff = Math.abs((entryDate.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff <= 3) {
          confidenceScore = 0.7;
          matchReason = "Amount + date proximity match";
        }
      }

      // Description similarity boost
      const descScore = descriptionSimilarity(
        bankTx.description,
        [entry.description ?? "", entry.vendorName ?? ""].join(" ")
      );
      if (descScore >= 0.3 && confidenceScore < 0.95) {
        confidenceScore = Math.min(confidenceScore + descScore * 0.2, 0.94);
        matchReason += " + description similarity";
      }

      candidates.push({
        accountingEntryId: entry._id,
        confidenceScore,
        confidenceLevel: confidenceScore >= 0.9 ? "high" : confidenceScore >= 0.6 ? "medium" : "low",
        matchReason,
      });
    }

    candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
    return candidates.slice(0, 5);
  },
});

export const internalCreateSuggestedMatch = internalMutation({
  args: {
    businessId: v.id("businesses"),
    bankTransactionId: v.id("bank_transactions"),
    accountingEntryId: v.id("accounting_entries"),
    confidenceScore: v.number(),
    confidenceLevel: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
    matchReason: v.string(),
  },
  handler: async (ctx, args) => {
    const existingMatches = await ctx.db
      .query("reconciliation_matches")
      .withIndex("by_bankTransactionId", (q) => q.eq("bankTransactionId", args.bankTransactionId))
      .collect();

    if (existingMatches.some((m) => (m.status === "suggested" || m.status === "confirmed") && !m.deletedAt)) {
      return;
    }

    await ctx.db.insert("reconciliation_matches", {
      businessId: args.businessId,
      bankTransactionId: args.bankTransactionId,
      accountingEntryId: args.accountingEntryId,
      matchType: "auto",
      confidenceScore: args.confidenceScore,
      confidenceLevel: args.confidenceLevel,
      matchReason: args.matchReason,
      status: "suggested",
    });

    await ctx.db.patch(args.bankTransactionId, {
      reconciliationStatus: "suggested",
    });
  },
});

// ============================================
// ACTIONS (server-side matching engine)
// ============================================

export const runMatching = action({
  args: {
    businessId: v.id("businesses"),
    bankAccountId: v.id("bank_accounts"),
  },
  handler: async (ctx, args): Promise<{ matched: number; unmatched: number }> => {
    const transactions = await ctx.runQuery(
      internal.functions.reconciliationMatches.internalGetUnmatchedTransactions,
      { bankAccountId: args.bankAccountId }
    );

    let matched = 0;

    for (const tx of transactions) {
      const candidates = await ctx.runQuery(
        internal.functions.reconciliationMatches.internalFindCandidates,
        { bankTransactionId: tx._id }
      );

      if (!candidates || candidates.length === 0) continue;

      const best = candidates[0];

      await ctx.runMutation(
        internal.functions.reconciliationMatches.internalCreateSuggestedMatch,
        {
          businessId: args.businessId,
          bankTransactionId: tx._id,
          accountingEntryId: best.accountingEntryId,
          confidenceScore: best.confidenceScore,
          confidenceLevel: best.confidenceLevel,
          matchReason: best.matchReason,
        }
      );

      matched++;
    }

    return { matched, unmatched: transactions.length - matched };
  },
});

export const getReconciliationSummary = query({
  args: {
    businessId: v.id("businesses"),
    bankAccountId: v.id("bank_accounts"),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const hasAccess = await checkBankReconAccess(ctx, args.businessId);
    if (!hasAccess) return null;

    let transactions = await ctx.db
      .query("bank_transactions")
      .withIndex("by_bankAccountId", (q) =>
        q.eq("bankAccountId", args.bankAccountId)
      )
      .collect();

    transactions = transactions.filter((t) => !t.deletedAt);

    if (args.dateFrom) {
      transactions = transactions.filter((t) => t.transactionDate >= args.dateFrom!);
    }
    if (args.dateTo) {
      transactions = transactions.filter((t) => t.transactionDate <= args.dateTo!);
    }

    // Sort by date
    transactions.sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

    const totalCredits = transactions
      .filter((t) => t.direction === "credit")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalDebits = transactions
      .filter((t) => t.direction === "debit")
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      totalTransactions: transactions.length,
      reconciled: transactions.filter((t) => t.reconciliationStatus === "reconciled").length,
      suggested: transactions.filter((t) => t.reconciliationStatus === "suggested").length,
      unmatched: transactions.filter((t) => t.reconciliationStatus === "unmatched").length,
      categorized: transactions.filter((t) => t.reconciliationStatus === "categorized").length,
      totalCredits,
      totalDebits,
      openingBalance: transactions[0]?.balance ?? 0,
      closingBalance: transactions[transactions.length - 1]?.balance ?? 0,
    };
  },
});
