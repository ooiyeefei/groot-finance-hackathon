/**
 * Trial Balance Generator
 *
 * Lists all accounts with their debit/credit balances.
 * Proves that total debits = total credits (fundamental accounting equation).
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

  // Get all active accounts
  const accounts = await ctx.db
    .query("chart_of_accounts")
    .withIndex("by_business_active", (q) =>
      q.eq("businessId", businessId).eq("isActive", true)
    )
    .collect();

  // Calculate balance for each account
  const balances = await Promise.all(
    accounts.map(async (account) => {
      // Get all lines for this account up to asOfDate
      const allEntries = await ctx.db
        .query("journal_entries")
        .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
        .collect();

      // Filter by date and status in memory
      const entries = allEntries.filter(
        (e) => e.transactionDate <= asOfDate && e.status === "posted"
      );

      const entryIds = entries.map((e) => e._id);

      const lines = await Promise.all(
        entryIds.map(async (entryId) => {
          return await ctx.db
            .query("journal_entry_lines")
            .withIndex("by_journal_entry", (q) =>
              q.eq("journalEntryId", entryId)
            )
            .filter((q) => q.eq(q.field("accountId"), account._id))
            .collect();
        })
      );

      const accountLines = lines.flat();

      // Sum debits and credits
      const totalDebits = accountLines.reduce(
        (sum, l) => sum + l.debitAmount,
        0
      );
      const totalCredits = accountLines.reduce(
        (sum, l) => sum + l.creditAmount,
        0
      );

      // Calculate net balance based on normal balance
      let debitBalance = 0;
      let creditBalance = 0;

      if (account.normalBalance === "debit") {
        const netBalance = totalDebits - totalCredits;
        if (netBalance >= 0) {
          debitBalance = netBalance;
        } else {
          creditBalance = Math.abs(netBalance);
        }
      } else {
        const netBalance = totalCredits - totalDebits;
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
    })
  );

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
