/**
 * Migration: accounting_entries → journal_entries
 *
 * Converts single-entry accounting records to double-entry journal entries.
 * Strategy: Big Bang with skip-bad-records (best for simple data model).
 *
 * @see specs/001-accounting-double-entry/tasks.md#51-migration-script
 */

import { internalMutation } from "../_generated/server";
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

        await ctx.runMutation(
          "functions/journalEntries:createInternal" as any,
          {
            businessId: entry.businessId,
            transactionDate: entry.transactionDate,
            description: entry.description || `Migrated: ${category}`,
            sourceType: "migrated" as const,
            sourceId: entry._id,
            lines,
          }
        );

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
