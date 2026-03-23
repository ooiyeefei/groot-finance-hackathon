/**
 * Financial Statements Functions
 *
 * Non-reactive action endpoints for generating financial statements.
 * Uses action + internalQuery pattern per CLAUDE.md bandwidth rules —
 * heavy aggregations must NOT use reactive `query`.
 *
 * Internal queries live in financialStatementsInternal.ts to avoid
 * circular type inference.
 *
 * Access: Owner/Admin and Manager roles only (enforced at UI + chat agent layers).
 */

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

/**
 * Generate Trial Balance — non-reactive action
 */
export const getTrialBalance = action({
  args: {
    businessId: v.string(),
    asOfDate: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runQuery(
      internal.functions.financialStatementsInternal.trialBalance,
      args
    );
  },
});

/**
 * Generate Profit & Loss Statement — non-reactive action
 */
export const getProfitLoss = action({
  args: {
    businessId: v.string(),
    dateFrom: v.string(),
    dateTo: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runQuery(
      internal.functions.financialStatementsInternal.profitLoss,
      args
    );
  },
});

/**
 * Generate P&L with Period Comparison — non-reactive action
 */
export const getProfitLossComparison = action({
  args: {
    businessId: v.string(),
    dateFrom: v.string(),
    dateTo: v.string(),
    comparisonDateFrom: v.string(),
    comparisonDateTo: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    const [current, comparison] = await Promise.all([
      ctx.runQuery(
        internal.functions.financialStatementsInternal.profitLoss,
        {
          businessId: args.businessId,
          dateFrom: args.dateFrom,
          dateTo: args.dateTo,
        }
      ),
      ctx.runQuery(
        internal.functions.financialStatementsInternal.profitLoss,
        {
          businessId: args.businessId,
          dateFrom: args.comparisonDateFrom,
          dateTo: args.comparisonDateTo,
        }
      ),
    ]);

    const calcVariance = (currentVal: number, comparisonVal: number) => ({
      amount: currentVal - comparisonVal,
      percentage:
        comparisonVal !== 0
          ? ((currentVal - comparisonVal) / Math.abs(comparisonVal)) * 100
          : currentVal !== 0
            ? 100
            : 0,
    });

    return {
      current,
      comparison,
      variance: {
        revenue: calcVariance(current.revenue.total, comparison.revenue.total),
        costOfGoodsSold: calcVariance(
          current.costOfGoodsSold.total,
          comparison.costOfGoodsSold.total
        ),
        grossProfit: calcVariance(current.grossProfit, comparison.grossProfit),
        operatingExpenses: calcVariance(
          current.operatingExpenses.total,
          comparison.operatingExpenses.total
        ),
        operatingIncome: calcVariance(
          current.operatingIncome,
          comparison.operatingIncome
        ),
        netProfit: calcVariance(current.netProfit, comparison.netProfit),
      },
    };
  },
});

/**
 * Generate Balance Sheet — non-reactive action
 */
export const getBalanceSheet = action({
  args: {
    businessId: v.string(),
    asOfDate: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runQuery(
      internal.functions.financialStatementsInternal.balanceSheet,
      args
    );
  },
});

/**
 * Generate Cash Flow Statement — non-reactive action
 */
export const getCashFlow = action({
  args: {
    businessId: v.string(),
    dateFrom: v.string(),
    dateTo: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runQuery(
      internal.functions.financialStatementsInternal.cashFlow,
      args
    );
  },
});

/**
 * Get dashboard metrics (current month summary) — non-reactive action
 */
export const getDashboardMetrics = action({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const dateFrom = `${currentMonth}-01`;
    const dateTo = now.toISOString().slice(0, 10);

    const pl = await ctx.runQuery(
      internal.functions.financialStatementsInternal.profitLoss,
      {
        businessId: args.businessId,
        dateFrom,
        dateTo,
      }
    );

    const tb = await ctx.runQuery(
      internal.functions.financialStatementsInternal.trialBalance,
      {
        businessId: args.businessId,
        asOfDate: dateTo,
      }
    );

    const cashLine = tb.lines.find((l: any) => l.accountCode === "1000");
    const cashBalance = cashLine
      ? cashLine.debitBalance - cashLine.creditBalance
      : 0;

    return {
      period: { dateFrom, dateTo },
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
