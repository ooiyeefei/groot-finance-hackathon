/**
 * Bank Transactions Functions - Convex queries and mutations
 * 021-bank-statement-import-recon
 *
 * Handles bank transaction import, listing, duplicate detection,
 * currency validation, row limits, status management, AI classification,
 * GL posting, and batch operations.
 * Access restricted to owner/finance_admin/manager roles.
 */

import { v } from "convex/values";
import { query, mutation, action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAuthenticatedUser } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";
import { classifyBankTransactionWithRules, loadBankReconRules } from "../lib/bankReconClassifier";
import { createDraftJournalEntry } from "../lib/bankReconGLPoster";
import { callMCPTool } from "../lib/mcpClient";

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
          q.eq("bankAccountId", args.bankAccountId!).eq("reconciliationStatus", args.status as "unmatched" | "suggested" | "reconciled" | "categorized" | "classified" | "posted")
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
    const classified = transactions.filter((t) => t.reconciliationStatus === "classified").length;
    const posted = transactions.filter((t) => t.reconciliationStatus === "posted").length;

    // Count high-confidence items for batch actions
    const highConfidenceClassified = transactions.filter(
      (t) => (t.reconciliationStatus === "classified" || t.reconciliationStatus === "suggested") &&
        (t.classificationConfidence ?? 0) >= 0.90
    ).length;

    return {
      total,
      reconciled,
      suggested,
      unmatched,
      categorized,
      classified,
      posted,
      highConfidenceClassified,
      progressPercent: total > 0 ? Math.round(((reconciled + categorized + posted) / total) * 100) : 0,
    };
  },
});

/**
 * Get detailed reconciliation summary with financial amounts.
 * Used by the reconciliation summary panel to show progress and balances.
 */
export const getReconciliationSummary = query({
  args: {
    bankAccountId: v.id("bank_accounts"),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get bank account to determine businessId
    const bankAccount = await ctx.db.get(args.bankAccountId);
    if (!bankAccount || bankAccount.deletedAt) return null;

    const hasAccess = await checkBankReconAccess(ctx, bankAccount.businessId);
    if (!hasAccess) return null;

    let transactions = await ctx.db
      .query("bank_transactions")
      .withIndex("by_bankAccountId", (q) =>
        q.eq("bankAccountId", args.bankAccountId)
      )
      .collect();

    transactions = transactions.filter((t) => !t.deletedAt);

    // Date range filter
    if (args.dateFrom) {
      transactions = transactions.filter((t) => t.transactionDate >= args.dateFrom!);
    }
    if (args.dateTo) {
      transactions = transactions.filter((t) => t.transactionDate <= args.dateTo!);
    }

    // Calculate financial totals
    let totalDebits = 0;
    let totalCredits = 0;
    let reconciledDebits = 0;
    let reconciledCredits = 0;
    let postedDebits = 0;
    let postedCredits = 0;
    let unmatchedDebits = 0;
    let unmatchedCredits = 0;

    const unmatchedItems: Array<{
      id: string;
      date: string;
      description: string;
      amount: number;
      direction: string;
    }> = [];

    for (const t of transactions) {
      const amt = Math.abs(t.amount);
      if (t.direction === "debit") {
        totalDebits += amt;
      } else {
        totalCredits += amt;
      }

      if (t.reconciliationStatus === "reconciled") {
        if (t.direction === "debit") reconciledDebits += amt;
        else reconciledCredits += amt;
      } else if (t.reconciliationStatus === "posted") {
        if (t.direction === "debit") postedDebits += amt;
        else postedCredits += amt;
      } else if (t.reconciliationStatus === "unmatched") {
        if (t.direction === "debit") unmatchedDebits += amt;
        else unmatchedCredits += amt;
        unmatchedItems.push({
          id: t._id,
          date: t.transactionDate,
          description: t.description,
          amount: t.amount,
          direction: t.direction,
        });
      }
    }

    // Compute closing balance (credits - debits for bank statement perspective)
    const closingBalance = totalCredits - totalDebits;

    // Sort unmatched by date descending, limit to 50
    unmatchedItems.sort((a, b) => b.date.localeCompare(a.date));
    const outstandingItems = unmatchedItems.slice(0, 50);

    return {
      bankAccountId: args.bankAccountId,
      bankName: bankAccount.bankName,
      accountNumberLast4: bankAccount.accountNumberLast4,
      currency: bankAccount.currency,

      // Counts
      totalTransactions: transactions.length,
      reconciledCount: transactions.filter((t) => t.reconciliationStatus === "reconciled").length,
      classifiedCount: transactions.filter((t) => t.reconciliationStatus === "classified").length,
      postedCount: transactions.filter((t) => t.reconciliationStatus === "posted").length,
      unmatchedCount: transactions.filter((t) => t.reconciliationStatus === "unmatched").length,
      categorizedCount: transactions.filter((t) => t.reconciliationStatus === "categorized").length,

      // Financial amounts
      closingBalance: Math.round(closingBalance * 100) / 100,
      totalDebits: Math.round(totalDebits * 100) / 100,
      totalCredits: Math.round(totalCredits * 100) / 100,
      reconciledAmount: Math.round((reconciledDebits + reconciledCredits) * 100) / 100,
      postedAmount: Math.round((postedDebits + postedCredits) * 100) / 100,
      unmatchedAmount: Math.round((unmatchedDebits + unmatchedCredits) * 100) / 100,

      // Remaining difference
      remainingDifference: Math.round((unmatchedDebits + unmatchedCredits) * 100) / 100,

      // Outstanding items (unmatched, capped at 50)
      outstandingItems,
      totalOutstandingItems: unmatchedItems.length,

      // Progress
      progressPercent: transactions.length > 0
        ? Math.round(
            ((transactions.filter((t) =>
              t.reconciliationStatus === "reconciled" ||
              t.reconciliationStatus === "posted" ||
              t.reconciliationStatus === "categorized"
            ).length) / transactions.length) * 100
          )
        : 0,
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
      v.literal("categorized"),
      v.literal("classified"),
      v.literal("posted")
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

// ============================================
// T017: classifyBatch — AI classification action
// ============================================

// Internal query to fetch unmatched transactions for classification
export const _getUnmatchedForClassification = internalQuery({
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

// Internal query to load classification rules
export const _loadClassificationRules = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    return await loadBankReconRules(ctx, args.businessId);
  },
});

// Internal query to get bank account details
export const _getBankAccount = internalQuery({
  args: {
    bankAccountId: v.id("bank_accounts"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.bankAccountId);
  },
});

// Internal query to look up COA by account code
export const _getCoaByCode = internalQuery({
  args: {
    businessId: v.id("businesses"),
    accountCode: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chart_of_accounts")
      .withIndex("by_business_code", (q) =>
        q.eq("businessId", args.businessId).eq("accountCode", args.accountCode)
      )
      .first();
  },
});

// Internal query to get training corrections for DSPy
export const _getTrainingCorrections = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const corrections = await ctx.db
      .query("bank_recon_corrections")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    return corrections.map((c) => ({
      description: c.bankTransactionDescription,
      bankName: c.bankName,
      correctedDebitAccountCode: c.correctedDebitAccountCode,
      correctedCreditAccountCode: c.correctedCreditAccountCode,
    }));
  },
});

// Internal mutation to update a bank transaction with classification results
export const _updateClassification = internalMutation({
  args: {
    id: v.id("bank_transactions"),
    suggestedDebitAccountId: v.id("chart_of_accounts"),
    suggestedCreditAccountId: v.id("chart_of_accounts"),
    classificationConfidence: v.number(),
    classificationTier: v.number(),
    classificationReasoning: v.string(),
    classifiedBy: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      suggestedDebitAccountId: args.suggestedDebitAccountId,
      suggestedCreditAccountId: args.suggestedCreditAccountId,
      classificationConfidence: args.classificationConfidence,
      classificationTier: args.classificationTier,
      classificationReasoning: args.classificationReasoning,
      classifiedBy: args.classifiedBy,
      classifiedAt: Date.now(),
      reconciliationStatus: "classified",
    });
  },
});

export const classifyBatch = action({
  args: {
    businessId: v.id("businesses"),
    bankAccountId: v.id("bank_accounts"),
  },
  handler: async (ctx, args) => {
    // Fetch unmatched transactions
    const transactions = await ctx.runQuery(
      internal.functions.bankTransactions._getUnmatchedForClassification,
      { bankAccountId: args.bankAccountId }
    );

    if (transactions.length === 0) {
      return { classified: 0, alreadyClassified: 0, errors: 0 };
    }

    // Load classification rules
    const rules = await ctx.runQuery(
      internal.functions.bankTransactions._loadClassificationRules,
      { businessId: args.businessId }
    );

    // Get bank account for bankName
    const bankAccount = await ctx.runQuery(
      internal.functions.bankTransactions._getBankAccount,
      { bankAccountId: args.bankAccountId }
    );
    if (!bankAccount) throw new Error("Bank account not found");

    // Load training corrections for Tier 2 (DSPy)
    const corrections = await ctx.runQuery(
      internal.functions.bankTransactions._getTrainingCorrections,
      { businessId: args.businessId }
    );

    let classified = 0;
    let alreadyClassified = 0;
    let errors = 0;

    // COA code-to-ID cache
    const coaCache: Record<string, Id<"chart_of_accounts"> | null> = {};

    async function resolveCoaId(code: string): Promise<Id<"chart_of_accounts"> | null> {
      // If code is "BANK_GL", resolve to the bank account's GL account
      if (code === "BANK_GL") {
        return bankAccount!.glAccountId ?? null;
      }
      if (code in coaCache) return coaCache[code];
      const coa = await ctx.runQuery(
        internal.functions.bankTransactions._getCoaByCode,
        { businessId: args.businessId, accountCode: code }
      );
      coaCache[code] = coa?._id ?? null;
      return coaCache[code];
    }

    for (const tx of transactions) {
      // Skip already classified
      if (tx.suggestedDebitAccountId && tx.suggestedCreditAccountId) {
        alreadyClassified++;
        continue;
      }

      try {
        // Tier 1: Rule-based classification
        const tier1Result = classifyBankTransactionWithRules(
          tx.description,
          tx.direction,
          rules,
          bankAccount.bankName
        );

        if (tier1Result) {
          const debitId = await resolveCoaId(tier1Result.debitAccountCode);
          const creditId = await resolveCoaId(tier1Result.creditAccountCode);

          if (debitId && creditId) {
            await ctx.runMutation(
              internal.functions.bankTransactions._updateClassification,
              {
                id: tx._id,
                suggestedDebitAccountId: debitId,
                suggestedCreditAccountId: creditId,
                classificationConfidence: tier1Result.confidence,
                classificationTier: 1,
                classificationReasoning: tier1Result.reasoning,
                classifiedBy: "tier1_rules",
              }
            );
            classified++;
            continue;
          }
        }

        // Tier 2: Lambda AI classification via MCP
        interface Tier2Result {
          debitAccountCode: string;
          debitAccountName: string;
          creditAccountCode: string;
          creditAccountName: string;
          confidence: number;
          reasoning: string;
        }

        const tier2Result = await callMCPTool<Tier2Result>({
          toolName: "classify_bank_transaction",
          args: {
            description: tx.description,
            amount: tx.amount,
            direction: tx.direction,
            bankName: bankAccount.bankName,
            transactionDate: tx.transactionDate,
            reference: tx.reference ?? "",
            corrections: corrections.length >= 5 ? corrections.slice(-50) : [],
          },
          businessId: args.businessId as string,
        });

        if (tier2Result) {
          const debitId = await resolveCoaId(tier2Result.debitAccountCode);
          const creditId = await resolveCoaId(tier2Result.creditAccountCode);

          if (debitId && creditId) {
            await ctx.runMutation(
              internal.functions.bankTransactions._updateClassification,
              {
                id: tx._id,
                suggestedDebitAccountId: debitId,
                suggestedCreditAccountId: creditId,
                classificationConfidence: tier2Result.confidence,
                classificationTier: 2,
                classificationReasoning: tier2Result.reasoning,
                classifiedBy: "tier2_ai",
              }
            );
            classified++;
          } else {
            errors++;
          }
        } else {
          // MCP call failed — skip but don't error
          errors++;
        }
      } catch (err) {
        console.error(`Classification error for tx ${tx._id}:`, err);
        errors++;
      }
    }

    return { classified, alreadyClassified, errors };
  },
});

// ============================================
// T018: confirmClassification — Post to GL
// ============================================

export const confirmClassification = mutation({
  args: {
    id: v.id("bank_transactions"),
  },
  handler: async (ctx, args) => {
    const tx = await ctx.db.get(args.id);
    if (!tx) throw new Error("Transaction not found");

    const { userId } = await requireBankReconAccess(ctx, tx.businessId);

    if (!tx.suggestedDebitAccountId || !tx.suggestedCreditAccountId) {
      throw new Error("Transaction has no classification data");
    }

    // Get the bank account's GL account ID
    const bankAccount = await ctx.db.get(tx.bankAccountId);
    if (!bankAccount) throw new Error("Bank account not found");

    // Create draft journal entry
    const jeId = await createDraftJournalEntry(ctx, {
      businessId: tx.businessId,
      bankTransactionId: tx._id,
      debitAccountId: tx.suggestedDebitAccountId,
      creditAccountId: tx.suggestedCreditAccountId,
      amount: tx.amount,
      description: tx.description,
      transactionDate: tx.transactionDate,
      createdBy: userId as unknown as string,
    });

    // Update bank transaction
    await ctx.db.patch(args.id, {
      journalEntryId: jeId,
      reconciliationStatus: "posted",
    });

    return { journalEntryId: jeId };
  },
});

// ============================================
// T019: rejectClassification — Reset classification
// ============================================

export const rejectClassification = mutation({
  args: {
    id: v.id("bank_transactions"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tx = await ctx.db.get(args.id);
    if (!tx) throw new Error("Transaction not found");

    const { userId } = await requireBankReconAccess(ctx, tx.businessId);

    // Store correction for DSPy training if we have classification data
    if (tx.suggestedDebitAccountId && tx.suggestedCreditAccountId) {
      const debitAccount = await ctx.db.get(tx.suggestedDebitAccountId);
      const creditAccount = await ctx.db.get(tx.suggestedCreditAccountId);
      const bankAccount = await ctx.db.get(tx.bankAccountId);

      if (debitAccount && creditAccount && bankAccount) {
        await ctx.db.insert("bank_recon_corrections", {
          businessId: tx.businessId,
          bankTransactionDescription: tx.description,
          bankName: bankAccount.bankName,
          originalDebitAccountCode: debitAccount.accountCode,
          originalCreditAccountCode: creditAccount.accountCode,
          correctedDebitAccountCode: "REJECTED",
          correctedCreditAccountCode: "REJECTED",
          correctionType: "rejection",
          createdBy: userId as unknown as string,
          createdAt: Date.now(),
        });

        // Record override for DSPy metrics (027-dspy-dash)
        await ctx.scheduler.runAfter(0, internal.functions.dspyMetrics.recordOverride, {
          businessId: tx.businessId,
          tool: "classify_bank_transaction",
        });
      }
    }

    // Reset classification fields
    await ctx.db.patch(args.id, {
      suggestedDebitAccountId: undefined,
      suggestedCreditAccountId: undefined,
      classificationConfidence: undefined,
      classificationTier: undefined,
      classificationReasoning: undefined,
      classifiedAt: undefined,
      classifiedBy: undefined,
      reconciliationStatus: "unmatched",
    });
  },
});

// ============================================
// T020: overrideClassification — User-corrected GL posting
// ============================================

export const overrideClassification = mutation({
  args: {
    id: v.id("bank_transactions"),
    debitAccountId: v.id("chart_of_accounts"),
    creditAccountId: v.id("chart_of_accounts"),
  },
  handler: async (ctx, args) => {
    const tx = await ctx.db.get(args.id);
    if (!tx) throw new Error("Transaction not found");

    const { userId } = await requireBankReconAccess(ctx, tx.businessId);

    // Store correction for DSPy training
    const debitAccount = await ctx.db.get(args.debitAccountId);
    const creditAccount = await ctx.db.get(args.creditAccountId);
    const bankAccount = await ctx.db.get(tx.bankAccountId);

    if (!debitAccount) throw new Error("Debit account not found");
    if (!creditAccount) throw new Error("Credit account not found");
    if (!bankAccount) throw new Error("Bank account not found");

    // Record correction if there was a previous classification
    if (tx.suggestedDebitAccountId && tx.suggestedCreditAccountId) {
      const origDebit = await ctx.db.get(tx.suggestedDebitAccountId);
      const origCredit = await ctx.db.get(tx.suggestedCreditAccountId);

      await ctx.db.insert("bank_recon_corrections", {
        businessId: tx.businessId,
        bankTransactionDescription: tx.description,
        bankName: bankAccount.bankName,
        originalDebitAccountCode: origDebit?.accountCode ?? "unknown",
        originalCreditAccountCode: origCredit?.accountCode ?? "unknown",
        correctedDebitAccountCode: debitAccount.accountCode,
        correctedCreditAccountCode: creditAccount.accountCode,
        correctionType: "override",
        createdBy: userId as unknown as string,
        createdAt: Date.now(),
      });

      // Record override for DSPy metrics (027-dspy-dash)
      await ctx.scheduler.runAfter(0, internal.functions.dspyMetrics.recordOverride, {
        businessId: tx.businessId,
        tool: "classify_bank_transaction",
      });
    }

    // Create draft journal entry with overridden accounts
    const jeId = await createDraftJournalEntry(ctx, {
      businessId: tx.businessId,
      bankTransactionId: tx._id,
      debitAccountId: args.debitAccountId,
      creditAccountId: args.creditAccountId,
      amount: tx.amount,
      description: tx.description,
      transactionDate: tx.transactionDate,
      createdBy: userId as unknown as string,
    });

    // Update bank transaction with override
    await ctx.db.patch(args.id, {
      suggestedDebitAccountId: args.debitAccountId,
      suggestedCreditAccountId: args.creditAccountId,
      journalEntryId: jeId,
      reconciliationStatus: "posted",
      classifiedBy: "user_override",
    });

    return { journalEntryId: jeId };
  },
});

// ============================================
// T028: batchConfirmHighConfidence
// ============================================

export const batchConfirmHighConfidence = mutation({
  args: {
    businessId: v.id("businesses"),
    bankAccountId: v.id("bank_accounts"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireBankReconAccess(ctx, args.businessId);

    // Fetch classified transactions with high confidence
    const allTransactions = await ctx.db
      .query("bank_transactions")
      .withIndex("by_bankAccountId", (q) =>
        q.eq("bankAccountId", args.bankAccountId)
      )
      .collect();

    const highConfidence = allTransactions.filter(
      (t) =>
        !t.deletedAt &&
        (t.reconciliationStatus === "classified" || t.reconciliationStatus === "suggested") &&
        (t.classificationConfidence ?? 0) >= 0.90
    );

    let confirmed = 0;
    let journalEntriesCreated = 0;

    for (const tx of highConfidence) {
      try {
        if (tx.reconciliationStatus === "suggested" && !tx.suggestedDebitAccountId) {
          // Suggested match (no classification) — just confirm
          await ctx.db.patch(tx._id, { reconciliationStatus: "reconciled" });
          confirmed++;
        } else if (tx.suggestedDebitAccountId && tx.suggestedCreditAccountId && !tx.journalEntryId) {
          // Classified with accounts — create JE and post
          const jeId = await createDraftJournalEntry(ctx, {
            businessId: tx.businessId,
            bankTransactionId: tx._id,
            debitAccountId: tx.suggestedDebitAccountId,
            creditAccountId: tx.suggestedCreditAccountId,
            amount: tx.amount,
            description: tx.description,
            transactionDate: tx.transactionDate,
            createdBy: userId as unknown as string,
          });

          await ctx.db.patch(tx._id, {
            journalEntryId: jeId,
            reconciliationStatus: "posted",
          });

          confirmed++;
          journalEntriesCreated++;
        }
      } catch (err) {
        console.error(`Batch confirm error for tx ${tx._id}:`, err);
      }
    }

    return { confirmed, journalEntriesCreated };
  },
});

// ============================================
// T029: batchPostToGL
// ============================================

export const batchPostToGL = mutation({
  args: {
    businessId: v.id("businesses"),
    bankAccountId: v.id("bank_accounts"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireBankReconAccess(ctx, args.businessId);

    // Fetch classified transactions without JE
    const allTransactions = await ctx.db
      .query("bank_transactions")
      .withIndex("by_bankAccountId", (q) =>
        q.eq("bankAccountId", args.bankAccountId)
      )
      .collect();

    const needPosting = allTransactions.filter(
      (t) =>
        !t.deletedAt &&
        t.reconciliationStatus === "classified" &&
        t.suggestedDebitAccountId &&
        t.suggestedCreditAccountId &&
        !t.journalEntryId
    );

    let posted = 0;
    let errorsCount = 0;

    for (const tx of needPosting) {
      try {
        const jeId = await createDraftJournalEntry(ctx, {
          businessId: tx.businessId,
          bankTransactionId: tx._id,
          debitAccountId: tx.suggestedDebitAccountId!,
          creditAccountId: tx.suggestedCreditAccountId!,
          amount: tx.amount,
          description: tx.description,
          transactionDate: tx.transactionDate,
          createdBy: userId as unknown as string,
        });

        await ctx.db.patch(tx._id, {
          journalEntryId: jeId,
          reconciliationStatus: "posted",
        });

        posted++;
      } catch (err) {
        console.error(`Batch post error for tx ${tx._id}:`, err);
        errorsCount++;
      }
    }

    return { posted, errors: errorsCount };
  },
});
