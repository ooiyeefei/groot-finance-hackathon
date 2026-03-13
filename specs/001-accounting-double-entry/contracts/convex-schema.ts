/**
 * Convex Schema: Double-Entry Accounting System
 *
 * This schema implements GAAP/IFRS/MAS-8 compliant double-entry bookkeeping.
 * Add these table definitions to convex/schema.ts
 *
 * @see specs/001-accounting-double-entry/data-model.md for field descriptions
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ============================================================================
// CHART OF ACCOUNTS
// ============================================================================

const chartOfAccounts = defineTable({
  // Identity
  businessId: v.id("businesses"),
  accountCode: v.string(),              // "1000", "4100", "5200"
  accountName: v.string(),              // "Cash", "Sales Revenue"

  // Classification
  accountType: v.union(
    v.literal("Asset"),
    v.literal("Liability"),
    v.literal("Equity"),
    v.literal("Revenue"),
    v.literal("Expense")
  ),
  accountSubtype: v.optional(v.string()),
  normalBalance: v.union(v.literal("debit"), v.literal("credit")),

  // Hierarchy
  parentAccountId: v.optional(v.id("chart_of_accounts")),
  level: v.number(),                    // 0 = top-level, 1 = sub-account

  // Status
  isActive: v.boolean(),
  isSystemAccount: v.boolean(),         // Cannot be deleted

  // Metadata
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),

  // Audit
  createdBy: v.string(),                // Clerk userId
  createdAt: v.number(),
  updatedBy: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
})
  .index("by_businessId", ["businessId"])
  .index("by_business_code", ["businessId", "accountCode"])
  .index("by_business_active", ["businessId", "isActive"])
  .index("by_business_type", ["businessId", "accountType", "isActive"]);

// ============================================================================
// JOURNAL ENTRIES (HEADER)
// ============================================================================

const journalEntries = defineTable({
  // Identity
  businessId: v.id("businesses"),
  entryNumber: v.string(),              // "JE-2026-00001"

  // Dates
  transactionDate: v.string(),          // YYYY-MM-DD
  postingDate: v.string(),              // YYYY-MM-DD

  // Description
  description: v.string(),
  memo: v.optional(v.string()),

  // Status
  status: v.union(
    v.literal("draft"),
    v.literal("posted"),
    v.literal("reversed"),
    v.literal("voided")
  ),

  // Source tracking
  sourceType: v.union(
    v.literal("manual"),
    v.literal("sales_invoice"),
    v.literal("expense_claim"),
    v.literal("ar_reconciliation"),
    v.literal("migrated")
  ),
  sourceId: v.optional(v.string()),

  // Fiscal period
  fiscalYear: v.number(),
  fiscalPeriod: v.string(),             // "2026-01"

  // Currency
  homeCurrency: v.string(),

  // Balancing validation (denormalized)
  totalDebit: v.number(),
  totalCredit: v.number(),
  lineCount: v.number(),

  // Reversal tracking
  reversedBy: v.optional(v.id("journal_entries")),
  reversalOf: v.optional(v.id("journal_entries")),

  // Audit trail
  createdBy: v.string(),
  createdAt: v.number(),
  postedBy: v.optional(v.string()),
  postedAt: v.optional(v.number()),

  // Locking
  accountingPeriodId: v.optional(v.id("accounting_periods")),
  isPeriodLocked: v.boolean(),
})
  .index("by_business_date_status", ["businessId", "transactionDate", "status"])
  .index("by_business_period", ["businessId", "fiscalPeriod", "status"])
  .index("by_source", ["sourceType", "sourceId"])
  .index("by_posted_date", ["businessId", "postingDate"])
  .index("by_business_entry_number", ["businessId", "entryNumber"]);

// ============================================================================
// JOURNAL ENTRY LINES
// ============================================================================

const journalEntryLines = defineTable({
  // Parent reference
  journalEntryId: v.id("journal_entries"),
  businessId: v.id("businesses"),       // Denormalized for performance

  // Line ordering
  lineOrder: v.number(),

  // Account reference (denormalized)
  accountId: v.id("chart_of_accounts"),
  accountCode: v.string(),
  accountName: v.string(),
  accountType: v.string(),

  // Amounts
  debitAmount: v.number(),              // Must be 0 if creditAmount > 0
  creditAmount: v.number(),             // Must be 0 if debitAmount > 0
  homeCurrencyAmount: v.number(),

  // Foreign currency support
  foreignCurrency: v.optional(v.string()),
  foreignAmount: v.optional(v.number()),
  exchangeRate: v.optional(v.number()),
  rateSource: v.optional(v.union(
    v.literal("api"),
    v.literal("manual"),
    v.literal("fallback")
  )),

  // Line description
  lineDescription: v.optional(v.string()),

  // Entity tracking
  entityType: v.optional(v.union(
    v.literal("customer"),
    v.literal("vendor"),
    v.literal("employee")
  )),
  entityId: v.optional(v.string()),
  entityName: v.optional(v.string()),

  // "Against Account" (ERPNext pattern)
  againstAccountCode: v.optional(v.string()),
  againstAccountName: v.optional(v.string()),

  // Tax tracking
  taxCode: v.optional(v.string()),
  taxRate: v.optional(v.number()),
  taxAmount: v.optional(v.number()),

  // Bank reconciliation
  bankReconciled: v.boolean(),
  bankReconciledDate: v.optional(v.string()),

  // Audit
  createdAt: v.number(),
})
  .index("by_journal_entry", ["journalEntryId", "lineOrder"])
  .index("by_account_date", ["accountId", "businessId", "journalEntryId"])
  .index("by_business_account", ["businessId", "accountId"])
  .index("by_entity", ["entityType", "entityId", "businessId"])
  .index("by_bank_reconciled", ["businessId", "bankReconciled"]);

// ============================================================================
// ACCOUNTING PERIODS
// ============================================================================

const accountingPeriods = defineTable({
  // Identity
  businessId: v.id("businesses"),
  periodCode: v.string(),               // "2026-01"
  periodName: v.string(),               // "January 2026"

  // Date range
  startDate: v.string(),                // YYYY-MM-DD
  endDate: v.string(),                  // YYYY-MM-DD

  // Fiscal year
  fiscalYear: v.number(),
  fiscalQuarter: v.optional(v.number()),

  // Status
  status: v.union(v.literal("open"), v.literal("closed")),

  // Closing
  closedBy: v.optional(v.string()),
  closedAt: v.optional(v.number()),
  closingNotes: v.optional(v.string()),

  // Validation
  journalEntryCount: v.number(),
  totalDebits: v.number(),
  totalCredits: v.number(),

  // Audit
  createdBy: v.string(),
  createdAt: v.number(),
})
  .index("by_business", ["businessId", "fiscalYear", "periodCode"])
  .index("by_business_status", ["businessId", "status"])
  .index("by_business_dates", ["businessId", "startDate", "endDate"]);

// ============================================================================
// MANUAL EXCHANGE RATES
// ============================================================================

const manualExchangeRates = defineTable({
  // Identity
  businessId: v.id("businesses"),

  // Currency pair
  fromCurrency: v.string(),
  toCurrency: v.string(),

  // Rate
  rate: v.number(),
  effectiveDate: v.string(),            // YYYY-MM-DD

  // Metadata
  reason: v.optional(v.string()),
  source: v.optional(v.string()),

  // Audit
  enteredBy: v.string(),
  createdAt: v.number(),
  updatedBy: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
})
  .index("by_business_pair_date", ["businessId", "fromCurrency", "toCurrency", "effectiveDate"])
  .index("by_business", ["businessId", "effectiveDate"])
  .index("by_pair", ["fromCurrency", "toCurrency", "effectiveDate"]);

// ============================================================================
// MIGRATION REPORTS (OPTIONAL - FOR TRACKING)
// ============================================================================

const migrationReports = defineTable({
  businessId: v.id("businesses"),
  reportType: v.string(),               // "accounting_entries_migration"

  // Timestamps
  startedAt: v.number(),
  completedAt: v.number(),
  duration: v.number(),                 // seconds

  // Summary
  totalRecords: v.number(),
  migratedCount: v.number(),
  errorCount: v.number(),
  successRate: v.string(),              // "95.5%"

  // Detailed errors
  skippedRecords: v.array(v.object({
    id: v.string(),
    legacyId: v.optional(v.string()),
    date: v.optional(v.string()),
    amount: v.optional(v.number()),
    category: v.optional(v.string()),
    reason: v.string(),
    details: v.string(),
    originalData: v.any(),
  })),

  validationErrors: v.array(v.object({
    entryId: v.string(),
    error: v.string(),
  })),

  // Audit
  createdBy: v.string(),
  createdAt: v.number(),
})
  .index("by_business", ["businessId", "createdAt"]);

// ============================================================================
// EXPORT SCHEMA
// ============================================================================

export const accountingSchema = {
  chart_of_accounts: chartOfAccounts,
  journal_entries: journalEntries,
  journal_entry_lines: journalEntryLines,
  accounting_periods: accountingPeriods,
  manual_exchange_rates: manualExchangeRates,
  migration_reports: migrationReports,
};

// ============================================================================
// USAGE IN convex/schema.ts
// ============================================================================

/*
import { defineSchema } from "convex/server";
import { accountingSchema } from "../specs/001-accounting-double-entry/contracts/convex-schema";

export default defineSchema({
  // ... existing tables
  businesses: ...,
  users: ...,

  // Add accounting tables
  ...accountingSchema,
});
*/

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate journal entry balance (debits = credits)
 * Call this before posting an entry
 */
export function validateBalance(lines: Array<{ debitAmount: number; creditAmount: number }>) {
  const totalDebits = lines.reduce((sum, l) => sum + l.debitAmount, 0);
  const totalCredits = lines.reduce((sum, l) => sum + l.creditAmount, 0);

  // Allow 0.01 rounding tolerance
  const diff = Math.abs(totalDebits - totalCredits);

  if (diff > 0.01) {
    throw new Error(`Unbalanced entry: Debits=${totalDebits.toFixed(2)}, Credits=${totalCredits.toFixed(2)}, Diff=${diff.toFixed(2)}`);
  }

  return { totalDebits, totalCredits, balanced: true };
}

/**
 * Validate line mutual exclusivity (debit XOR credit)
 */
export function validateLine(line: { debitAmount: number; creditAmount: number }) {
  if (line.debitAmount > 0 && line.creditAmount > 0) {
    throw new Error("Line cannot have both debit and credit amounts");
  }

  if (line.debitAmount === 0 && line.creditAmount === 0) {
    throw new Error("Line must have either debit or credit amount");
  }

  return true;
}

/**
 * Generate next entry number
 */
export function generateEntryNumber(year: number, sequenceNumber: number): string {
  return `JE-${year}-${String(sequenceNumber).padStart(5, '0')}`;
}

/**
 * Validate account code format
 */
export function validateAccountCode(code: string, type: string): boolean {
  const num = parseInt(code, 10);

  const ranges = {
    "Asset": [1000, 1999],
    "Liability": [2000, 2999],
    "Equity": [3000, 3999],
    "Revenue": [4000, 4999],
    "Expense": [5000, 5999],
  };

  const [min, max] = ranges[type as keyof typeof ranges] || [0, 0];
  return num >= min && num <= max;
}

/**
 * Calculate fiscal period from date
 */
export function calculateFiscalPeriod(date: string): { fiscalYear: number; fiscalPeriod: string } {
  const [year, month] = date.split('-').map(Number);
  return {
    fiscalYear: year,
    fiscalPeriod: `${year}-${String(month).padStart(2, '0')}`,
  };
}
