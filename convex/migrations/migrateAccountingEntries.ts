/**
 * Migration: accounting_entries → journal_entries
 *
 * Converts single-entry accounting records to double-entry journal entries.
 * Strategy: Big Bang with skip-bad-records (best for simple data model).
 *
 * @see specs/001-accounting-double-entry/tasks.md#51-migration-script
 */

import { internalMutation, query } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

// Category to GL account mapping
const CATEGORY_TO_ACCOUNT: Record<string, { revenue?: string; expense?: string }> = {
  "Sales": { revenue: "4100" },
  "Service Revenue": { revenue: "4200" },
  "Interest Income": { revenue: "4900" },
  "Office Supplies": { expense: "5100" },
  "Travel": { expense: "5200" },
  "Marketing": { expense: "5300" },
  "Salary": { expense: "5400" },
  "Rent": { expense: "5500" },
  "Utilities": { expense: "5600" },
  "Platform Fees": { expense: "5800" },
};

export const migrateAccountingEntries = internalMutation({
  args: {
    businessId: v.id("businesses"),
    dryRun: v.optional(v.boolean()), // If true, only validate, don't create entries
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();

    // Fetch all accounting_entries for this business
    const allEntries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const entries = allEntries.filter((e) => !e.deletedAt);

    const skippedRecords: Array<{
      id: string;
      date?: string;
      amount?: number;
      category?: string;
      reason: string;
      details: string;
      originalData: any;
    }> = [];

    let migratedCount = 0;

    for (const entry of entries) {
      try {
        // Validate required fields
        if (!entry.originalAmount || entry.originalAmount === 0) {
          skippedRecords.push({
            id: entry._id,
            reason: "Missing or zero amount",
            details: `Amount: ${entry.originalAmount}`,
            originalData: entry,
          });
          continue;
        }

        if (!entry.transactionType) {
          skippedRecords.push({
            id: entry._id,
            amount: entry.originalAmount,
            reason: "Missing transaction type",
            details: "transactionType is required",
            originalData: entry,
          });
          continue;
        }

        if (!entry.transactionDate) {
          skippedRecords.push({
            id: entry._id,
            amount: entry.originalAmount,
            reason: "Missing transaction date",
            details: "transactionDate is required",
            originalData: entry,
          });
          continue;
        }

        // Map category to GL account
        const isIncome = entry.transactionType === "Income";
        const category = entry.category || "Uncategorized";
        const mapping = CATEGORY_TO_ACCOUNT[category];

        let glAccount: string;
        if (isIncome) {
          glAccount = mapping?.revenue || "4999"; // Uncategorized Income
        } else {
          glAccount = mapping?.expense || "5999"; // Uncategorized Expense
        }

        if (args.dryRun) {
          // Dry run: only count, don't create
          migratedCount++;
          continue;
        }

        // Create journal entry
        const lines = isIncome
          ? [
              {
                accountCode: "1200", // AR
                debitAmount: entry.originalAmount,
                creditAmount: 0,
                lineDescription: entry.description || "Income",
              },
              {
                accountCode: glAccount,
                debitAmount: 0,
                creditAmount: entry.originalAmount,
                lineDescription: category,
              },
            ]
          : [
              {
                accountCode: glAccount,
                debitAmount: entry.originalAmount,
                creditAmount: 0,
                lineDescription: entry.description || "Expense",
              },
              {
                accountCode: "2100", // AP
                debitAmount: 0,
                creditAmount: entry.originalAmount,
                lineDescription: category,
              },
            ];

        // Create journal entry directly (can't call mutations from mutations in Convex)
        const now = Date.now();
        const transactionDate = entry.transactionDate;
        const year = new Date(transactionDate).getFullYear();
        const month = String(new Date(transactionDate).getMonth() + 1).padStart(2, "0");
        const fiscalPeriod = `${year}-${month}`;

        // Get next entry number
        const existingEntries = await ctx.db
          .query("journal_entries")
          .withIndex("by_businessId", (q) => q.eq("businessId", entry.businessId!))
          .collect();
        const entryNumber = `JE-${year}-${String(existingEntries.length + 1).padStart(5, "0")}`;

        // Look up account IDs, create missing accounts on-the-fly
        const accounts = await ctx.db
          .query("chart_of_accounts")
          .withIndex("by_businessId", (q) => q.eq("businessId", entry.businessId!))
          .collect();
        const accountMap = new Map(accounts.map((a) => [a.accountCode, a]));

        // Auto-create any missing accounts referenced by this entry
        for (const line of lines) {
          if (!accountMap.has(line.accountCode)) {
            const isRevenue = line.accountCode.startsWith("4");
            const isExpense = line.accountCode.startsWith("5");
            const isAsset = line.accountCode.startsWith("1");
            const isLiability = line.accountCode.startsWith("2");
            const accountType = isRevenue ? "Revenue" as const : isExpense ? "Expense" as const : isAsset ? "Asset" as const : isLiability ? "Liability" as const : "Expense" as const;
            const normalBalance = (isRevenue || isLiability) ? "credit" as const : "debit" as const;
            const newId = await ctx.db.insert("chart_of_accounts", {
              businessId: entry.businessId!,
              accountCode: line.accountCode,
              accountName: `${line.lineDescription || line.accountCode} (migrated)`,
              accountType,
              accountSubtype: "Migrated",
              normalBalance,
              level: 0,
              isActive: true,
              isSystemAccount: false,
              description: `Auto-created during migration for code ${line.accountCode}`,
              tags: ["migrated"],
              createdBy: "system-migration",
              createdAt: now,
            });
            accountMap.set(line.accountCode, { _id: newId, accountCode: line.accountCode, accountName: `${line.lineDescription || line.accountCode} (migrated)`, accountType } as any);
          }
        }

        const totalDebit = lines.reduce((s, l) => s + l.debitAmount, 0);
        const totalCredit = lines.reduce((s, l) => s + l.creditAmount, 0);

        const journalEntryId = await ctx.db.insert("journal_entries", {
          businessId: entry.businessId!,
          entryNumber,
          transactionDate,
          postingDate: transactionDate,
          description: entry.description || `Migrated: ${category}`,
          status: "posted",
          totalDebit,
          totalCredit,
          lineCount: lines.length,
          sourceType: "migrated",
          sourceId: entry._id,
          homeCurrency: entry.homeCurrency || entry.originalCurrency || "MYR",
          fiscalYear: year,
          fiscalPeriod,
          isPeriodLocked: false,
          postedAt: now,
          postedBy: "system-migration",
          createdBy: "system-migration",
          createdAt: now,
        });

        // Create journal entry lines
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const account = accountMap.get(line.accountCode);
          await ctx.db.insert("journal_entry_lines", {
            journalEntryId,
            businessId: entry.businessId!,
            accountId: account?._id || ("unknown" as any),
            accountCode: line.accountCode,
            accountName: account?.accountName || line.accountCode,
            accountType: account?.accountType || "Expense",
            debitAmount: line.debitAmount,
            creditAmount: line.creditAmount,
            homeCurrencyAmount: line.debitAmount || line.creditAmount,
            lineDescription: line.lineDescription,
            lineOrder: i + 1,
            bankReconciled: false,
            createdAt: now,
          });
        }

        migratedCount++;
      } catch (error: any) {
        skippedRecords.push({
          id: entry._id,
          date: entry.transactionDate,
          amount: entry.originalAmount,
          category: entry.category,
          reason: "Validation or creation failed",
          details: error.message,
          originalData: entry,
        });
      }
    }

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    const errorCount = skippedRecords.length;
    const successRate = ((migratedCount / entries.length) * 100).toFixed(1);

    // Create migration report
    const reportId = await ctx.db.insert("migration_reports", {
      businessId: args.businessId,
      reportType: "accounting_entries_migration",
      startedAt: startTime,
      completedAt: endTime,
      duration,
      totalRecords: entries.length,
      migratedCount,
      errorCount,
      successRate: `${successRate}%`,
      skippedRecords,
      validationErrors: [],
      createdBy: "system",
      createdAt: endTime,
    });

    return {
      reportId,
      totalRecords: entries.length,
      migratedCount,
      errorCount,
      successRate: `${successRate}%`,
      duration,
    };
  },
});

export const getMigrationReport = query({
  args: { reportId: v.id("migration_reports") },
  handler: async (ctx, { reportId }) => {
    return await ctx.db.get(reportId);
  },
});

/**
 * Clean up duplicate migrated entries (keep only latest per sourceId)
 */
export const cleanupDuplicateMigrations = internalMutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const allEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    const migrated = allEntries.filter((e) => e.sourceType === "migrated");

    // Group by sourceId
    const bySource: Record<string, typeof migrated> = {};
    for (const e of migrated) {
      const sid = e.sourceId || "";
      if (!bySource[sid]) bySource[sid] = [];
      bySource[sid].push(e);
    }

    let deletedEntries = 0;
    let deletedLines = 0;

    for (const [sourceId, entries] of Object.entries(bySource)) {
      if (entries.length <= 1) continue;

      // Sort by _creationTime desc, keep the latest
      entries.sort((a, b) => b._creationTime - a._creationTime);
      const toDelete = entries.slice(1); // all except latest

      for (const entry of toDelete) {
        // Delete associated lines
        const lines = await ctx.db
          .query("journal_entry_lines")
          .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", entry._id))
          .collect();
        for (const line of lines) {
          await ctx.db.delete(line._id);
          deletedLines++;
        }
        await ctx.db.delete(entry._id);
        deletedEntries++;
      }
    }

    return { deletedEntries, deletedLines, remainingMigrated: migrated.length - deletedEntries };
  },
});
