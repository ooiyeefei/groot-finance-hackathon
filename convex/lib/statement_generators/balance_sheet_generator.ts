/**
 * Balance Sheet Generator
 *
 * Point-in-time snapshot of financial position: Assets = Liabilities + Equity.
 * All posted journal entries up to asOfDate are included.
 *
 * Retained earnings are calculated dynamically by summing all Revenue (4xxx)
 * minus all Expenses (5xxx) for posted entries up to asOfDate.
 *
 * Performance: Uses 3 queries total (accounts + entries + lines) instead of
 * O(accounts × entries) N+1 pattern.
 */

import { QueryCtx } from "../../_generated/server";
import { Id } from "../../_generated/dataModel";

export interface BalanceSheetLine {
  accountCode: string;
  accountName: string;
  accountType: string;
  balance: number; // Always positive
}

export interface BalanceSheetStatement {
  businessId: Id<"businesses">;
  asOfDate: string;
  currency: string;
  currentAssets: { lines: BalanceSheetLine[]; total: number };
  nonCurrentAssets: { lines: BalanceSheetLine[]; total: number };
  totalAssets: number;
  currentLiabilities: { lines: BalanceSheetLine[]; total: number };
  nonCurrentLiabilities: { lines: BalanceSheetLine[]; total: number };
  totalLiabilities: number;
  equity: { lines: BalanceSheetLine[]; total: number };
  retainedEarnings: number;
  totalEquity: number; // equity.total + retainedEarnings
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
  generatedAt: number;
}

/**
 * Classify an account code into a balance sheet section based on sub-range.
 *
 * - 1000-1499: Current Assets
 * - 1500-1999: Non-Current Assets
 * - 2000-2499: Current Liabilities
 * - 2500-2999: Non-Current Liabilities
 * - 3000-3999: Equity
 * - 4000-4999: Revenue (used for retained earnings calc only)
 * - 5000-5999: Expense (used for retained earnings calc only)
 */
function classifyAccount(
  accountCode: string
): "currentAsset" | "nonCurrentAsset" | "currentLiability" | "nonCurrentLiability" | "equity" | "revenue" | "expense" | null {
  const code = parseInt(accountCode, 10);
  if (isNaN(code)) return null;

  if (code >= 1000 && code <= 1499) return "currentAsset";
  if (code >= 1500 && code <= 1999) return "nonCurrentAsset";
  if (code >= 2000 && code <= 2499) return "currentLiability";
  if (code >= 2500 && code <= 2999) return "nonCurrentLiability";
  if (code >= 3000 && code <= 3999) return "equity";
  if (code >= 4000 && code <= 4999) return "revenue";
  if (code >= 5000 && code <= 5999) return "expense";
  return null;
}

export async function generateBalanceSheet(
  ctx: QueryCtx,
  args: {
    businessId: Id<"businesses">;
    asOfDate: string;
  }
): Promise<BalanceSheetStatement> {
  const { businessId, asOfDate } = args;

  const business = await ctx.db.get(businessId);
  if (!business) {
    throw new Error("Business not found");
  }

  // Step 1: Get all active accounts
  const accounts = await ctx.db
    .query("chart_of_accounts")
    .withIndex("by_business_active", (q) =>
      q.eq("businessId", businessId).eq("isActive", true)
    )
    .collect();

  // Step 2: Get posted entry IDs up to asOfDate (one query)
  const allEntries = await ctx.db
    .query("journal_entries")
    .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
    .collect();

  const postedEntryIds = new Set(
    allEntries
      .filter((e) => e.transactionDate <= asOfDate && e.status === "posted")
      .map((e) => e._id)
  );

  // Step 3: Get ALL lines for this business (one query — eliminates O(accounts × entries) N+1)
  const allLines = await ctx.db
    .query("journal_entry_lines")
    .withIndex("by_business_account", (q) => q.eq("businessId", businessId))
    .collect();

  // Filter to lines from posted entries up to asOfDate
  const postedLines = allLines.filter((line) =>
    postedEntryIds.has(line.journalEntryId)
  );

  // Group lines by accountId and sum debits/credits
  const accountTotals = new Map<
    string,
    { totalDebits: number; totalCredits: number }
  >();

  for (const line of postedLines) {
    const accountIdStr = line.accountId as string;
    const existing = accountTotals.get(accountIdStr) || {
      totalDebits: 0,
      totalCredits: 0,
    };
    existing.totalDebits += line.debitAmount;
    existing.totalCredits += line.creditAmount;
    accountTotals.set(accountIdStr, existing);
  }

  // Step 4: Build balance sheet sections
  const currentAssetLines: BalanceSheetLine[] = [];
  const nonCurrentAssetLines: BalanceSheetLine[] = [];
  const currentLiabilityLines: BalanceSheetLine[] = [];
  const nonCurrentLiabilityLines: BalanceSheetLine[] = [];
  const equityLines: BalanceSheetLine[] = [];

  // Track revenue and expense totals for retained earnings calculation
  let totalRevenue = 0; // credits - debits for revenue accounts
  let totalExpenses = 0; // debits - credits for expense accounts

  // Build account lookup for quick access
  const accountMap = new Map(accounts.map((a) => [a._id as string, a]));

  for (const account of accounts) {
    const totals = accountTotals.get(account._id as string) || {
      totalDebits: 0,
      totalCredits: 0,
    };

    const classification = classifyAccount(account.accountCode);
    if (!classification) continue;

    // Revenue and expense accounts contribute to retained earnings, not directly to BS
    if (classification === "revenue") {
      totalRevenue += totals.totalCredits - totals.totalDebits;
      continue;
    }
    if (classification === "expense") {
      totalExpenses += totals.totalDebits - totals.totalCredits;
      continue;
    }

    // Calculate net balance based on account nature
    let balance: number;
    if (classification === "currentAsset" || classification === "nonCurrentAsset") {
      // Assets: normal debit balance
      balance = totals.totalDebits - totals.totalCredits;
    } else {
      // Liabilities & Equity: normal credit balance
      balance = totals.totalCredits - totals.totalDebits;
    }

    // Filter out zero-balance accounts
    if (Math.abs(balance) < 0.01) continue;

    const line: BalanceSheetLine = {
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      balance: Math.abs(balance),
    };

    // If balance is contra (negative), still include but as absolute value
    // The sign is implicit in the section placement
    switch (classification) {
      case "currentAsset":
        currentAssetLines.push(line);
        break;
      case "nonCurrentAsset":
        nonCurrentAssetLines.push(line);
        break;
      case "currentLiability":
        currentLiabilityLines.push(line);
        break;
      case "nonCurrentLiability":
        nonCurrentLiabilityLines.push(line);
        break;
      case "equity":
        equityLines.push(line);
        break;
    }
  }

  // Sort each section by account code
  const sortByCode = (a: BalanceSheetLine, b: BalanceSheetLine) =>
    a.accountCode.localeCompare(b.accountCode);

  currentAssetLines.sort(sortByCode);
  nonCurrentAssetLines.sort(sortByCode);
  currentLiabilityLines.sort(sortByCode);
  nonCurrentLiabilityLines.sort(sortByCode);
  equityLines.sort(sortByCode);

  // Calculate section totals
  const currentAssetsTotal = currentAssetLines.reduce((sum, l) => sum + l.balance, 0);
  const nonCurrentAssetsTotal = nonCurrentAssetLines.reduce((sum, l) => sum + l.balance, 0);
  const totalAssets = currentAssetsTotal + nonCurrentAssetsTotal;

  const currentLiabilitiesTotal = currentLiabilityLines.reduce((sum, l) => sum + l.balance, 0);
  const nonCurrentLiabilitiesTotal = nonCurrentLiabilityLines.reduce((sum, l) => sum + l.balance, 0);
  const totalLiabilities = currentLiabilitiesTotal + nonCurrentLiabilitiesTotal;

  const equityTotal = equityLines.reduce((sum, l) => sum + l.balance, 0);

  // Retained earnings = Revenue - Expenses (accumulated P&L)
  const retainedEarnings = totalRevenue - totalExpenses;

  const totalEquity = equityTotal + retainedEarnings;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  // Verify A = L + E
  const balanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01;

  return {
    businessId,
    asOfDate,
    currency: business.homeCurrency,
    currentAssets: { lines: currentAssetLines, total: currentAssetsTotal },
    nonCurrentAssets: { lines: nonCurrentAssetLines, total: nonCurrentAssetsTotal },
    totalAssets,
    currentLiabilities: { lines: currentLiabilityLines, total: currentLiabilitiesTotal },
    nonCurrentLiabilities: { lines: nonCurrentLiabilityLines, total: nonCurrentLiabilitiesTotal },
    totalLiabilities,
    equity: { lines: equityLines, total: equityTotal },
    retainedEarnings,
    totalEquity,
    totalLiabilitiesAndEquity,
    balanced,
    generatedAt: Date.now(),
  };
}
