/**
 * Migration Verification: accounting_entries deprecation
 *
 * Ensures no new accounting_entries are created after migration cutoff date.
 * Counts legacy references to accounting_entries across all tables.
 *
 * @see docs/plans/2026-03-14-accounting-entries-to-journal-entries-migration.md#phase-4-task-42
 */

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Verify no new accounting_entries created after migration date
 *
 * Usage:
 * npx convex run migrations/deprecateAccountingEntries:verifyNoNewWrites --prod '{"migrationDate": "2026-03-14"}'
 */
export const verifyNoNewWrites = query({
  args: {
    migrationDate: v.string(), // Format: "YYYY-MM-DD"
  },
  handler: async (ctx, { migrationDate }) => {
    // Parse migration cutoff date (start of day in UTC)
    const cutoffDate = new Date(migrationDate);
    cutoffDate.setUTCHours(0, 0, 0, 0);
    const cutoffTimestamp = cutoffDate.getTime();

    // Fetch all accounting_entries (excluding deleted)
    const allEntries = await ctx.db
      .query("accounting_entries")
      .collect();

    const activeEntries = allEntries.filter((e) => !e.deletedAt);

    // Find entries created after cutoff
    const violatingEntries = activeEntries.filter(
      (e) => e._creationTime >= cutoffTimestamp
    );

    const result = {
      migrationDate,
      cutoffTimestamp,
      totalActiveEntries: activeEntries.length,
      entriesCreatedAfterMigration: violatingEntries.length,
      isClean: violatingEntries.length === 0,
      violations: violatingEntries.map((e) => ({
        id: e._id,
        businessId: e.businessId,
        createdAt: e._creationTime,
        createdDate: new Date(e._creationTime).toISOString(),
        transactionDate: e.transactionDate,
        amount: e.originalAmount,
        currency: e.originalCurrency,
        description: e.description,
        createdByMethod: e.createdByMethod,
      })),
    };

    if (result.isClean) {
      console.log(`✅ Verification passed: No accounting_entries created after ${migrationDate}`);
    } else {
      console.error(
        `❌ Verification failed: ${violatingEntries.length} accounting_entries created after ${migrationDate}`
      );
      console.error("Violations:", result.violations);
    }

    return result;
  },
});

/**
 * Count all legacy references to accountingEntryId across tables
 *
 * Scans all tables with accountingEntryId foreign keys and reports usage.
 *
 * Usage:
 * npx convex run migrations/deprecateAccountingEntries:countLegacyReferences --prod
 */
export const countLegacyReferences = query({
  args: {},
  handler: async (ctx) => {
    const results: Record<
      string,
      {
        totalRecords: number;
        referencesCount: number;
        sampleReferences: Array<{
          id: string;
          accountingEntryId: string;
          createdAt: number;
        }>;
      }
    > = {};

    // 1. expense_claims.accountingEntryId
    const expenseClaims = await ctx.db.query("expense_claims").collect();
    const expenseClaimsWithRef = expenseClaims.filter((ec) => ec.accountingEntryId);
    results.expense_claims = {
      totalRecords: expenseClaims.length,
      referencesCount: expenseClaimsWithRef.length,
      sampleReferences: expenseClaimsWithRef.slice(0, 5).map((ec) => ({
        id: ec._id,
        accountingEntryId: ec.accountingEntryId!,
        createdAt: ec._creationTime,
      })),
    };

    // 2. vendor_price_history.accountingEntryId
    const vendorPrices = await ctx.db.query("vendor_price_history").collect();
    const vendorPricesWithRef = vendorPrices.filter((vp) => vp.accountingEntryId);
    results.vendor_price_history = {
      totalRecords: vendorPrices.length,
      referencesCount: vendorPricesWithRef.length,
      sampleReferences: vendorPricesWithRef.slice(0, 5).map((vp) => ({
        id: vp._id,
        accountingEntryId: vp.accountingEntryId!,
        createdAt: vp._creationTime,
      })),
    };

    // 3. reconciliation_matches.accountingEntryId
    const reconciliationMatches = await ctx.db.query("reconciliation_matches").collect();
    const reconciliationMatchesWithRef = reconciliationMatches.filter(
      (rm) => rm.accountingEntryId
    );
    results.reconciliation_matches = {
      totalRecords: reconciliationMatches.length,
      referencesCount: reconciliationMatchesWithRef.length,
      sampleReferences: reconciliationMatchesWithRef.slice(0, 5).map((rm) => ({
        id: rm._id,
        accountingEntryId: rm.accountingEntryId!,
        createdAt: rm._creationTime,
      })),
    };

    // 4. po_matches.accountingEntryId
    const poMatches = await ctx.db.query("po_matches").collect();
    const poMatchesWithRef = poMatches.filter((pm) => pm.accountingEntryId);
    results.po_matches = {
      totalRecords: poMatches.length,
      referencesCount: poMatchesWithRef.length,
      sampleReferences: poMatchesWithRef.slice(0, 5).map((pm) => ({
        id: pm._id,
        accountingEntryId: pm.accountingEntryId!,
        createdAt: pm._creationTime,
      })),
    };

    // 5. conversations.contextTransactionId (optional reference)
    const conversations = await ctx.db.query("conversations").collect();
    const conversationsWithRef = conversations.filter((c) => c.contextTransactionId);
    results.conversations = {
      totalRecords: conversations.length,
      referencesCount: conversationsWithRef.length,
      sampleReferences: conversationsWithRef.slice(0, 5).map((c) => ({
        id: c._id,
        accountingEntryId: c.contextTransactionId!,
        createdAt: c._creationTime,
      })),
    };

    // Summary
    const totalReferences = Object.values(results).reduce(
      (sum, r) => sum + r.referencesCount,
      0
    );

    console.log("=== Legacy accountingEntryId References ===");
    for (const [table, data] of Object.entries(results)) {
      console.log(
        `${table}: ${data.referencesCount} references out of ${data.totalRecords} records`
      );
    }
    console.log(`Total legacy references: ${totalReferences}`);

    return {
      summary: {
        totalReferences,
        tablesWithReferences: Object.keys(results).filter(
          (k) => results[k].referencesCount > 0
        ),
      },
      tables: results,
    };
  },
});
