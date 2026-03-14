/**
 * Trial Balance Generator
 *
 * Lists all accounts with their debit/credit balances.
 * Proves that total debits = total credits (fundamental accounting equation).
 *
 * Performance: Uses 3 queries total (accounts + entries + lines) instead of
 * O(accounts × entries) N+1 pattern.
 */

import { QueryCtx } from "../../_generated/server";
import { Id } from "../../_generated/dataModel";

export interface TrialBalanceLine {
  accountCode: string;
  accountName: string;
  accountType: string;
  debitBalance: number;
  creditBalance: number;
}

export interface TrialBalanceStatement {
  businessId: Id<"businesses">;
  asOfDate: string;
  currency: string;
  lines: TrialBalanceLine[];
  totalDebits: number;
  totalCredits: number;
  balanced: boolean;
  generatedAt: number;
}

export async function generateTrialBalance(
  ctx: QueryCtx,
  args: {
    businessId: Id<"businesses">;
    asOfDate: string;
  }
): Promise<TrialBalanceStatement> {
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
    .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
    .collect();

  // Filter to lines from posted entries in date range
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

  // Step 4: Calculate balances per account
  const balances = accounts.map((account) => {
    const totals = accountTotals.get(account._id as string) || {
      totalDebits: 0,
      totalCredits: 0,
    };

    let debitBalance = 0;
    let creditBalance = 0;

    if (account.normalBalance === "debit") {
      const netBalance = totals.totalDebits - totals.totalCredits;
      if (netBalance >= 0) {
        debitBalance = netBalance;
      } else {
        creditBalance = Math.abs(netBalance);
      }
    } else {
      const netBalance = totals.totalCredits - totals.totalDebits;
      if (netBalance >= 0) {
        creditBalance = netBalance;
      } else {
        debitBalance = Math.abs(netBalance);
      }
    }

    return {
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      debitBalance,
      creditBalance,
    };
  });

  // Filter out zero balances
  const nonZeroBalances = balances.filter(
    (b) => b.debitBalance > 0 || b.creditBalance > 0
  );

  // Calculate totals
  const totalDebits = nonZeroBalances.reduce(
    (sum, b) => sum + b.debitBalance,
    0
  );
  const totalCredits = nonZeroBalances.reduce(
    (sum, b) => sum + b.creditBalance,
    0
  );

  const balanced = Math.abs(totalDebits - totalCredits) < 0.01;

  return {
    businessId,
    asOfDate,
    currency: business.homeCurrency,
    lines: nonZeroBalances.sort((a, b) =>
      a.accountCode.localeCompare(b.accountCode)
    ),
    totalDebits,
    totalCredits,
    balanced,
    generatedAt: Date.now(),
  };
}
