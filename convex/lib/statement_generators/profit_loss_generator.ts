/**
 * Profit & Loss Statement Generator
 *
 * Generates income statement showing:
 * - Revenue (credit balances on 4xxx accounts)
 * - Expenses (debit balances on 5xxx accounts)
 * - Net Profit = Revenue - Expenses
 *
 * Performance: Uses single query on journal_entry_lines by_businessId index
 * instead of N+1 pattern (one query per journal entry).
 *
 * @see specs/001-accounting-double-entry/data-model.md
 */

import { QueryCtx } from "../../_generated/server";
import { Id } from "../../_generated/dataModel";

export interface ProfitLossLine {
  accountCode: string;
  accountName: string;
  amount: number;
}

export interface ProfitLossStatement {
  businessId: Id<"businesses">;
  dateFrom: string;
  dateTo: string;
  currency: string;
  revenue: {
    lines: ProfitLossLine[];
    total: number;
  };
  costOfGoodsSold: {
    lines: ProfitLossLine[];
    total: number;
  };
  grossProfit: number;
  operatingExpenses: {
    lines: ProfitLossLine[];
    total: number;
  };
  operatingIncome: number;
  otherIncome: {
    lines: ProfitLossLine[];
    total: number;
  };
  otherExpenses: {
    lines: ProfitLossLine[];
    total: number;
  };
  netProfit: number;
  generatedAt: number;
}

/**
 * Generate Profit & Loss Statement for a date range
 *
 * Optimized: Fetches posted entry IDs first, then queries all lines by business
 * and filters to matching entries in memory. This is O(2) queries instead of O(N+1).
 */
export async function generateProfitLossStatement(
  ctx: QueryCtx,
  args: {
    businessId: Id<"businesses">;
    dateFrom: string;
    dateTo: string;
  }
): Promise<ProfitLossStatement> {
  const { businessId, dateFrom, dateTo } = args;

  // Get business for currency
  const business = await ctx.db.get(businessId);
  if (!business) {
    throw new Error("Business not found");
  }

  // Step 1: Get posted entry IDs in date range
  const allEntries = await ctx.db
    .query("journal_entries")
    .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
    .collect();

  const postedEntryIds = new Set(
    allEntries
      .filter(
        (e) =>
          e.transactionDate >= dateFrom &&
          e.transactionDate <= dateTo &&
          e.status === "posted"
      )
      .map((e) => e._id)
  );

  // Step 2: Get ALL lines for this business in one query (eliminates N+1)
  const allLines = await ctx.db
    .query("journal_entry_lines")
    .withIndex("by_business_account", (q) => q.eq("businessId", businessId))
    .collect();

  // Filter to lines belonging to posted entries in the date range
  const lines = allLines.filter((line) => postedEntryIds.has(line.journalEntryId));

  // Group by account and calculate net amounts
  const accountBalances = new Map<
    string,
    { code: string; name: string; type: string; balance: number }
  >();

  for (const line of lines) {
    const key = line.accountCode;
    const existing = accountBalances.get(key) || {
      code: line.accountCode,
      name: line.accountName,
      type: line.accountType,
      balance: 0,
    };

    // Revenue: credit increases balance (credit - debit)
    // Expense: debit increases balance (debit - credit)
    if (line.accountType === "Revenue") {
      existing.balance += line.creditAmount - line.debitAmount;
    } else if (line.accountType === "Expense") {
      existing.balance += line.debitAmount - line.creditAmount;
    }

    accountBalances.set(key, existing);
  }

  // Categorize accounts
  const revenue: ProfitLossLine[] = [];
  const costOfGoodsSold: ProfitLossLine[] = [];
  const operatingExpenses: ProfitLossLine[] = [];
  const otherIncome: ProfitLossLine[] = [];
  const otherExpenses: ProfitLossLine[] = [];

  for (const [code, data] of accountBalances) {
    if (data.balance === 0) continue; // Skip zero balances

    const line: ProfitLossLine = {
      accountCode: data.code,
      accountName: data.name,
      amount: Math.abs(data.balance), // Always positive for display
    };

    // Revenue accounts (4xxx)
    if (data.type === "Revenue") {
      if (code >= "4900") {
        otherIncome.push(line);
      } else {
        revenue.push(line);
      }
    }

    // Expense accounts (5xxx)
    if (data.type === "Expense") {
      if (code === "5100") {
        costOfGoodsSold.push(line);
      } else if (code >= "5900") {
        otherExpenses.push(line);
      } else {
        operatingExpenses.push(line);
      }
    }
  }

  // Calculate totals
  const revenueTotal = revenue.reduce((sum, l) => sum + l.amount, 0);
  const cogsTotal = costOfGoodsSold.reduce((sum, l) => sum + l.amount, 0);
  const grossProfit = revenueTotal - cogsTotal;

  const opExpensesTotal = operatingExpenses.reduce(
    (sum, l) => sum + l.amount,
    0
  );
  const operatingIncome = grossProfit - opExpensesTotal;

  const otherIncomeTotal = otherIncome.reduce((sum, l) => sum + l.amount, 0);
  const otherExpensesTotal = otherExpenses.reduce(
    (sum, l) => sum + l.amount,
    0
  );

  const netProfit = operatingIncome + otherIncomeTotal - otherExpensesTotal;

  return {
    businessId,
    dateFrom,
    dateTo,
    currency: business.homeCurrency,
    revenue: {
      lines: revenue.sort((a, b) => a.accountCode.localeCompare(b.accountCode)),
      total: revenueTotal,
    },
    costOfGoodsSold: {
      lines: costOfGoodsSold.sort((a, b) =>
        a.accountCode.localeCompare(b.accountCode)
      ),
      total: cogsTotal,
    },
    grossProfit,
    operatingExpenses: {
      lines: operatingExpenses.sort((a, b) =>
        a.accountCode.localeCompare(b.accountCode)
      ),
      total: opExpensesTotal,
    },
    operatingIncome,
    otherIncome: {
      lines: otherIncome.sort((a, b) =>
        a.accountCode.localeCompare(b.accountCode)
      ),
      total: otherIncomeTotal,
    },
    otherExpenses: {
      lines: otherExpenses.sort((a, b) =>
        a.accountCode.localeCompare(b.accountCode)
      ),
      total: otherExpensesTotal,
    },
    netProfit,
    generatedAt: Date.now(),
  };
}
