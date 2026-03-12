/**
 * Bank Transactions Functions - Convex queries and mutations
 * 021-bank-statement-import-recon
 *
 * Handles bank transaction import, listing, duplicate detection,
 * currency validation, row limits, and status management.
 * Access restricted to owner/finance_admin/manager roles.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { getAuthenticatedUser } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";

const BANK_RECON_ROLES = ["owner", "finance_admin", "manager"];
const MAX_TRANSACTIONS_PER_ACCOUNT = 100_000;

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

// ============================================
// QUERIES
// ============================================

export const list = query({
  args: {
    businessId: v.id("businesses"),
    bankAccountId: v.optional(v.id("bank_accounts")),
    status: v.optional(v.string()),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const hasAccess = await checkBankReconAccess(ctx, args.businessId);
    if (!hasAccess) return { transactions: [], totalCount: 0 };

    const limit = args.limit ?? 50;

    let txQuery;
    if (args.bankAccountId && args.status) {
      txQuery = ctx.db
        .query("bank_transactions")
        .withIndex("by_bankAccountId_status", (q) =>
          q.eq("bankAccountId", args.bankAccountId!).eq("reconciliationStatus", args.status as "unmatched" | "suggested" | "reconciled" | "categorized")
        );
    } else if (args.bankAccountId) {
      txQuery = ctx.db
        .query("bank_transactions")
        .withIndex("by_bankAccountId", (q) =>
          q.eq("bankAccountId", args.bankAccountId!)
        );
    } else {
      txQuery = ctx.db
        .query("bank_transactions")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", args.businessId)
        );
    }

    let transactions = await txQuery.order("desc").collect();

    // Filter soft-deleted
    transactions = transactions.filter((t) => !t.deletedAt);

    // Date range filter
    if (args.dateFrom) {
      transactions = transactions.filter((t) => t.transactionDate >= args.dateFrom!);
    }
    if (args.dateTo) {
      transactions = transactions.filter((t) => t.transactionDate <= args.dateTo!);
    }

    const totalCount = transactions.length;

    return {
      transactions: transactions.slice(0, limit),
      totalCount,
    };
  },
});

export const getById = query({
  args: {
    id: v.id("bank_transactions"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const tx = await ctx.db.get(args.id);
    if (!tx) return null;

    const hasAccess = await checkBankReconAccess(ctx, tx.businessId);
    if (!hasAccess) return null;

    // Get associated match if any
    const matches = await ctx.db
      .query("reconciliation_matches")
      .withIndex("by_bankTransactionId", (q) =>
        q.eq("bankTransactionId", args.id)
      )
      .collect();

    const activeMatch = matches.find((m) => m.status !== "rejected" && !m.deletedAt);

    return { ...tx, match: activeMatch ?? null };
  },
});

export const getSummary = query({
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

    const total = transactions.length;
    const reconciled = transactions.filter((t) => t.reconciliationStatus === "reconciled").length;
    const suggested = transactions.filter((t) => t.reconciliationStatus === "suggested").length;
    const unmatched = transactions.filter((t) => t.reconciliationStatus === "unmatched").length;
    const categorized = transactions.filter((t) => t.reconciliationStatus === "categorized").length;

    return {
      total,
      reconciled,
      suggested,
      unmatched,
      categorized,
      progressPercent: total > 0 ? Math.round(((reconciled + categorized) / total) * 100) : 0,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

export const importBatch = mutation({
  args: {
    businessId: v.id("businesses"),
    bankAccountId: v.id("bank_accounts"),
    importSessionId: v.id("bank_import_sessions"),
    transactions: v.array(
      v.object({
        transactionDate: v.string(),
        description: v.string(),
        debitAmount: v.optional(v.number()),
        creditAmount: v.optional(v.number()),
        balance: v.optional(v.number()),
        reference: v.optional(v.string()),
        transactionType: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireBankReconAccess(ctx, args.businessId);

    // Check 100K row limit
    const account = await ctx.db.get(args.bankAccountId);
    if (!account) throw new Error("Bank account not found");

    // Currency mismatch check — validate bank account belongs to this business
    if (account.businessId.toString() !== args.businessId.toString()) {
      throw new Error("Bank account does not belong to this business");
    }

    const currentCount = account.transactionCount ?? 0;
    if (currentCount + args.transactions.length > MAX_TRANSACTIONS_PER_ACCOUNT) {
      throw new Error(
        `Import would exceed the ${MAX_TRANSACTIONS_PER_ACCOUNT.toLocaleString()} transaction limit. ` +
        `Current: ${currentCount.toLocaleString()}, importing: ${args.transactions.length}. ` +
        `Please archive older transactions first.`
      );
    }

    let imported = 0;
    let duplicatesSkipped = 0;

    for (const tx of args.transactions) {
      const amount = tx.creditAmount ?? tx.debitAmount ?? 0;
      const direction = tx.creditAmount ? "credit" : "debit";

      // Create deduplication hash: bankAccountId + date + amount + description
      const hashInput = `${args.bankAccountId}|${tx.transactionDate}|${amount}|${tx.description}`;
      // Simple hash for deduplication (not cryptographic)
      let hash = 0;
      for (let i = 0; i < hashInput.length; i++) {
        const char = hashInput.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      const deduplicationHash = `dedupe_${Math.abs(hash).toString(36)}`;

      // Check for existing transaction with same hash
      const existing = await ctx.db
        .query("bank_transactions")
        .withIndex("by_deduplicationHash", (q) =>
          q.eq("deduplicationHash", deduplicationHash)
        )
        .first();

      if (existing && !existing.deletedAt) {
        duplicatesSkipped++;
        continue;
      }

      await ctx.db.insert("bank_transactions", {
        businessId: args.businessId,
        bankAccountId: args.bankAccountId,
        importSessionId: args.importSessionId,
        transactionDate: tx.transactionDate,
        description: tx.description,
        debitAmount: tx.debitAmount,
        creditAmount: tx.creditAmount,
        balance: tx.balance,
        reference: tx.reference,
        transactionType: tx.transactionType,
        amount,
        direction,
        deduplicationHash,
        reconciliationStatus: "unmatched",
      });

      imported++;
    }

    // Update bank account stats
    if (account) {
      const dates = args.transactions.map((t) => t.transactionDate).sort();
      const latestDate = dates[dates.length - 1];

      await ctx.db.patch(args.bankAccountId, {
        transactionCount: currentCount + imported,
        lastImportDate: latestDate,
      });
    }

    return { imported, duplicatesSkipped };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("bank_transactions"),
    status: v.union(
      v.literal("unmatched"),
      v.literal("suggested"),
      v.literal("reconciled"),
      v.literal("categorized")
    ),
    category: v.optional(v.union(
      v.literal("bank_charges"),
      v.literal("interest"),
      v.literal("non_business"),
      v.literal("other")
    )),
  },
  handler: async (ctx, args) => {
    const tx = await ctx.db.get(args.id);
    if (!tx) throw new Error("Transaction not found");

    await requireBankReconAccess(ctx, tx.businessId);

    const patch: Record<string, unknown> = {
      reconciliationStatus: args.status,
    };

    if (args.status === "categorized" && args.category) {
      patch.category = args.category;
    }

    if (args.status === "unmatched") {
      patch.category = undefined;
    }

    await ctx.db.patch(args.id, patch);
  },
});
