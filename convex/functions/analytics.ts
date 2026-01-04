/**
 * Analytics Functions - Convex queries for financial analytics
 *
 * Replaces Supabase RPC function `get_dashboard_analytics`
 * These queries implement the analytics logic directly in Convex
 *
 * Features:
 * - Dashboard analytics (income, expenses, profit, breakdowns)
 * - Aged receivables/payables calculation
 * - Cash flow monitoring queries
 * - Multi-tenant isolation with business context
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";

// ============================================
// DASHBOARD ANALYTICS
// ============================================

/**
 * Get dashboard analytics for a business within a date range
 * Replaces Supabase RPC: get_dashboard_analytics
 */
export const getDashboardAnalytics = query({
  args: {
    businessId: v.id("businesses"),
    startDate: v.string(),  // ISO date string YYYY-MM-DD
    endDate: v.string(),    // ISO date string YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    // Fetch all transactions for the period
    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Filter by date range and active status
    const transactions = entries.filter((entry) => {
      if (entry.deletedAt) return false;
      if (!entry.transactionDate) return false;
      return entry.transactionDate >= args.startDate && entry.transactionDate <= args.endDate;
    });

    // Calculate totals
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalCogs = 0;
    const currencyBreakdown: Record<string, number> = {};
    const categoryBreakdown: Record<string, number> = {};

    for (const txn of transactions) {
      const amount = txn.homeCurrencyAmount || txn.originalAmount || 0;
      const currency = txn.homeCurrency || txn.originalCurrency || "SGD";
      const category = txn.category || "uncategorized";

      if (txn.transactionType === "Income") {
        totalIncome += amount;
      } else if (txn.transactionType === "Expense") {
        totalExpenses += Math.abs(amount);
      } else if (txn.transactionType === "Cost of Goods Sold") {
        totalCogs += Math.abs(amount);
      }

      // Currency breakdown (net by currency)
      if (!currencyBreakdown[currency]) {
        currencyBreakdown[currency] = 0;
      }
      currencyBreakdown[currency] +=
        txn.transactionType === "Income" ? amount : -Math.abs(amount);

      // Category breakdown (expenses + COGS only)
      if (txn.transactionType === "Expense" || txn.transactionType === "Cost of Goods Sold") {
        if (!categoryBreakdown[category]) {
          categoryBreakdown[category] = 0;
        }
        categoryBreakdown[category] += Math.abs(amount);
      }
    }

    const netProfit = totalIncome - totalExpenses - totalCogs;

    return {
      userId: user._id,
      totalIncome,
      totalExpenses,
      totalCogs,
      netProfit,
      transactionCount: transactions.length,
      currencyBreakdown,
      categoryBreakdown,
      calculatedAt: Date.now(),
    };
  },
});

/**
 * Get aged receivables (income transactions that are pending/overdue)
 */
export const getAgedReceivables = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    // Fetch income transactions with pending/overdue status
    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const receivables = entries.filter((entry) => {
      if (entry.deletedAt) return false;
      if (entry.transactionType !== "Income") return false;
      return ["pending", "overdue"].includes(entry.status);
    });

    const currentDate = new Date();
    let current = 0;
    let late31_60 = 0;
    let late61_90 = 0;
    let late90Plus = 0;
    let totalOutstanding = 0;
    const riskDistribution = { low: 0, medium: 0, high: 0, critical: 0 };
    let highRiskCount = 0;
    const riskScores: number[] = [];

    for (const txn of receivables) {
      const amount = txn.homeCurrencyAmount || txn.originalAmount || 0;

      // Calculate days past due
      const transactionDate = new Date(txn.transactionDate);
      const dueDate = txn.dueDate
        ? new Date(txn.dueDate)
        : new Date(transactionDate.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 days

      const daysPastDue = Math.floor(
        (currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Categorize by age
      if (daysPastDue <= 30) {
        current += amount;
      } else if (daysPastDue <= 60) {
        late31_60 += amount;
      } else if (daysPastDue <= 90) {
        late61_90 += amount;
      } else {
        late90Plus += amount;
      }

      totalOutstanding += amount;

      // Calculate risk score (0-100)
      let riskScore = 0;
      if (daysPastDue <= 0) riskScore = 10;
      else if (daysPastDue <= 30) riskScore = 25;
      else if (daysPastDue <= 60) riskScore = 50;
      else if (daysPastDue <= 90) riskScore = 75;
      else riskScore = 95;

      // Adjust by amount
      if (amount > 10000) riskScore = Math.min(100, riskScore + 10);

      riskScores.push(riskScore);

      // Categorize risk level
      if (riskScore < 25) riskDistribution.low++;
      else if (riskScore < 50) riskDistribution.medium++;
      else if (riskScore < 75) riskDistribution.high++;
      else riskDistribution.critical++;

      if (riskScore >= 50) highRiskCount++;
    }

    const averageRiskScore =
      riskScores.length > 0 ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length : 0;

    return {
      current,
      late31_60,
      late61_90,
      late90Plus,
      totalOutstanding,
      riskDistribution,
      averageRiskScore,
      highRiskTransactions: highRiskCount,
      transactionCount: receivables.length,
    };
  },
});

/**
 * Get aged payables (expense transactions that are pending/overdue)
 */
export const getAgedPayables = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    // Fetch expense transactions with pending/overdue status
    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const payables = entries.filter((entry) => {
      if (entry.deletedAt) return false;
      if (entry.transactionType !== "Expense" && entry.transactionType !== "Cost of Goods Sold")
        return false;
      return ["pending", "overdue"].includes(entry.status);
    });

    const currentDate = new Date();
    let current = 0;
    let late31_60 = 0;
    let late61_90 = 0;
    let late90Plus = 0;
    let totalOutstanding = 0;
    const riskDistribution = { low: 0, medium: 0, high: 0, critical: 0 };
    let highRiskCount = 0;
    const riskScores: number[] = [];

    for (const txn of payables) {
      const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);

      // Calculate days past due
      const transactionDate = new Date(txn.transactionDate);
      const dueDate = txn.dueDate
        ? new Date(txn.dueDate)
        : new Date(transactionDate.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 days

      const daysPastDue = Math.floor(
        (currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Categorize by age
      if (daysPastDue <= 30) {
        current += amount;
      } else if (daysPastDue <= 60) {
        late31_60 += amount;
      } else if (daysPastDue <= 90) {
        late61_90 += amount;
      } else {
        late90Plus += amount;
      }

      totalOutstanding += amount;

      // Calculate risk score (0-100)
      let riskScore = 0;
      if (daysPastDue <= 0) riskScore = 10;
      else if (daysPastDue <= 30) riskScore = 25;
      else if (daysPastDue <= 60) riskScore = 50;
      else if (daysPastDue <= 90) riskScore = 75;
      else riskScore = 95;

      // Adjust by amount
      if (amount > 10000) riskScore = Math.min(100, riskScore + 10);

      riskScores.push(riskScore);

      // Categorize risk level
      if (riskScore < 25) riskDistribution.low++;
      else if (riskScore < 50) riskDistribution.medium++;
      else if (riskScore < 75) riskDistribution.high++;
      else riskDistribution.critical++;

      if (riskScore >= 50) highRiskCount++;
    }

    const averageRiskScore =
      riskScores.length > 0 ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length : 0;

    return {
      current,
      late31_60,
      late61_90,
      late90Plus,
      totalOutstanding,
      riskDistribution,
      averageRiskScore,
      highRiskTransactions: highRiskCount,
      transactionCount: payables.length,
    };
  },
});

// ============================================
// CASH FLOW MONITORING QUERIES
// ============================================

/**
 * Get overdue receivables for cash flow monitoring
 */
export const getOverdueReceivables = query({
  args: {
    businessId: v.id("businesses"),
    agingThresholdDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    const agingThreshold = args.agingThresholdDays ?? 45;

    // Fetch income transactions with pending/overdue status
    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const receivables = entries.filter((entry) => {
      if (entry.deletedAt) return false;
      if (entry.transactionType !== "Income") return false;
      return ["pending", "overdue"].includes(entry.status);
    });

    const currentDate = new Date();
    const overdueItems: Array<{
      id: string;
      vendorName: string | null;
      amount: number;
      currency: string;
      dueDate: string;
      daysPastDue: number;
    }> = [];

    for (const txn of receivables) {
      const transactionDate = new Date(txn.transactionDate);
      const dueDate = txn.dueDate
        ? new Date(txn.dueDate)
        : new Date(transactionDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      const daysPastDue = Math.floor(
        (currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysPastDue > agingThreshold) {
        overdueItems.push({
          id: txn._id,
          vendorName: txn.vendorName || null,
          amount: txn.homeCurrencyAmount || txn.originalAmount || 0,
          currency: txn.homeCurrency || txn.originalCurrency || "SGD",
          dueDate: dueDate.toISOString(),
          daysPastDue,
        });
      }
    }

    return overdueItems;
  },
});

/**
 * Get upcoming payment deadlines
 */
export const getUpcomingPayments = query({
  args: {
    businessId: v.id("businesses"),
    windowDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    const windowDays = args.windowDays ?? 7;

    // Fetch expense transactions with pending status
    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const payables = entries.filter((entry) => {
      if (entry.deletedAt) return false;
      if (entry.transactionType !== "Expense" && entry.transactionType !== "Cost of Goods Sold")
        return false;
      return ["pending"].includes(entry.status);
    });

    const currentDate = new Date();
    const windowEnd = new Date(currentDate.getTime() + windowDays * 24 * 60 * 60 * 1000);

    const upcomingPayments: Array<{
      id: string;
      vendorName: string | null;
      amount: number;
      currency: string;
      dueDate: string;
      daysUntilDue: number;
    }> = [];

    for (const txn of payables) {
      if (!txn.dueDate) continue;

      const dueDate = new Date(txn.dueDate);

      if (dueDate >= currentDate && dueDate <= windowEnd) {
        const daysUntilDue = Math.floor(
          (dueDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        upcomingPayments.push({
          id: txn._id,
          vendorName: txn.vendorName || null,
          amount: Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0),
          currency: txn.homeCurrency || txn.originalCurrency || "SGD",
          dueDate: dueDate.toISOString(),
          daysUntilDue,
        });
      }
    }

    return upcomingPayments;
  },
});

/**
 * Get currency exposure breakdown
 */
export const getCurrencyExposure = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    // Fetch transactions with pending status
    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const activeTransactions = entries.filter((entry) => {
      if (entry.deletedAt) return false;
      return ["pending"].includes(entry.status);
    });

    const currencyTotals: Record<string, number> = {};
    let totalAmount = 0;

    for (const txn of activeTransactions) {
      const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);
      const currency = txn.originalCurrency || "SGD";

      if (!currencyTotals[currency]) {
        currencyTotals[currency] = 0;
      }

      currencyTotals[currency] += amount;
      totalAmount += amount;
    }

    // Calculate percentages
    const currencyExposure: Array<{
      currency: string;
      amount: number;
      percentage: number;
    }> = [];

    for (const [currency, amount] of Object.entries(currencyTotals)) {
      currencyExposure.push({
        currency,
        amount,
        percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0,
      });
    }

    // Sort by amount descending
    currencyExposure.sort((a, b) => b.amount - a.amount);

    return {
      currencyExposure,
      totalOutstanding: totalAmount,
      transactionCount: activeTransactions.length,
    };
  },
});

/**
 * Get cash flow projection data
 */
export const getCashFlowProjection = query({
  args: {
    businessId: v.id("businesses"),
    periodDays: v.number(),  // 7, 30, or 90
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    const currentDate = new Date();
    const periodEnd = new Date(currentDate.getTime() + args.periodDays * 24 * 60 * 60 * 1000);

    const currentDateStr = currentDate.toISOString().split("T")[0];
    const periodEndStr = periodEnd.toISOString().split("T")[0];

    // Fetch transactions with due dates in the period
    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const relevantTransactions = entries.filter((entry) => {
      if (entry.deletedAt) return false;
      if (!entry.dueDate) return false;
      return entry.dueDate >= currentDateStr && entry.dueDate <= periodEndStr;
    });

    let projectedInflows = 0;
    let projectedOutflows = 0;

    for (const txn of relevantTransactions) {
      const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);

      if (txn.transactionType === "Income") {
        projectedInflows += amount;
      } else {
        projectedOutflows += amount;
      }
    }

    // Get business home currency
    const business = await ctx.db.get(args.businessId);
    const homeCurrency = business?.homeCurrency || "SGD";

    return {
      periodStart: currentDateStr,
      periodEnd: periodEndStr,
      periodDays: args.periodDays,
      projectedInflows,
      projectedOutflows,
      netCashFlow: projectedInflows - projectedOutflows,
      currency: homeCurrency,
      transactionCount: relevantTransactions.length,
    };
  },
});
