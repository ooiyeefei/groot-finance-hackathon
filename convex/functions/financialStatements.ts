/**
 * Financial Statements Functions
 *
 * Query endpoints for generating financial statements.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { generateProfitLossStatement } from "../lib/statement_generators/profit_loss_generator";
import { generateTrialBalance } from "../lib/statement_generators/trial_balance_generator";

/**
 * Generate Profit & Loss Statement
 */
export const profitLoss = query({
  args: {
    businessId: v.id("businesses"),
    dateFrom: v.string(),
    dateTo: v.string(),
  },
  handler: async (ctx, args) => {
    return await generateProfitLossStatement(ctx, args);
  },
});

/**
 * Generate Trial Balance
 */
export const trialBalance = query({
  args: {
    businessId: v.id("businesses"),
    asOfDate: v.string(),
  },
  handler: async (ctx, args) => {
    return await generateTrialBalance(ctx, args);
  },
});

/**
 * Get dashboard metrics (current month summary)
 */
export const dashboardMetrics = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM
    const dateFrom = `${currentMonth}-01`;
    const dateTo = now.toISOString().slice(0, 10);

    // Generate P&L for current month
    const pl = await generateProfitLossStatement(ctx, {
      businessId: args.businessId,
      dateFrom,
      dateTo,
    });

    // Get cash balance (Trial Balance for just Cash account)
    const cashAccount = await ctx.db
      .query("chart_of_accounts")
      .withIndex("by_business_code", (q) =>
        q.eq("businessId", args.businessId).eq("accountCode", "1000")
      )
      .first();

    let cashBalance = 0;
    if (cashAccount) {
      const allEntries = await ctx.db
        .query("journal_entries")
        .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
        .collect();

      // Filter by date and status in memory
      const entries = allEntries.filter(
        (e) => e.transactionDate <= dateTo && e.status === "posted"
      );

      const entryIds = entries.map((e) => e._id);
      const lines = await Promise.all(
        entryIds.map(async (entryId) => {
          return await ctx.db
            .query("journal_entry_lines")
            .withIndex("by_journal_entry", (q) =>
              q.eq("journalEntryId", entryId)
            )
            .filter((q) => q.eq(q.field("accountId"), cashAccount._id))
            .collect();
        })
      );

      const cashLines = lines.flat();
      const totalDebits = cashLines.reduce((sum, l) => sum + l.debitAmount, 0);
      const totalCredits = cashLines.reduce(
        (sum, l) => sum + l.creditAmount,
        0
      );
      cashBalance = totalDebits - totalCredits; // Cash is a debit-normal account
    }

    return {
      period: {
        dateFrom,
        dateTo,
      },
      revenue: pl.revenue.total,
      expenses:
        pl.costOfGoodsSold.total +
        pl.operatingExpenses.total +
        pl.otherExpenses.total,
      netProfit: pl.netProfit,
      cashBalance,
    };
  },
});
