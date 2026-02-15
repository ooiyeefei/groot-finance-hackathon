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

    // Fetch business to get category names
    const business = await ctx.db.get(args.businessId);

    // Build category lookup map (ID -> display name)
    const categoryLookup: Record<string, string> = {};
    if (business?.customExpenseCategories) {
      const categories = business.customExpenseCategories as Array<{
        id: string;
        category_name: string;
      }>;
      for (const cat of categories) {
        categoryLookup[cat.id] = cat.category_name;
      }
    }

    // Fetch all transactions for the period
    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    console.log(`[Analytics] Query params: businessId=${args.businessId}, startDate=${args.startDate}, endDate=${args.endDate}`);
    console.log(`[Analytics] Found ${entries.length} entries for businessId`);

    // Filter by date range and active status
    const transactions = entries.filter((entry) => {
      if (entry.deletedAt) {
        console.log(`[Analytics] Entry ${entry._id} filtered: deletedAt=${entry.deletedAt}`);
        return false;
      }
      if (!entry.transactionDate) {
        console.log(`[Analytics] Entry ${entry._id} filtered: missing transactionDate`);
        return false;
      }
      const inRange = entry.transactionDate >= args.startDate && entry.transactionDate <= args.endDate;
      if (!inRange) {
        console.log(`[Analytics] Entry ${entry._id} filtered: transactionDate=${entry.transactionDate} not in range ${args.startDate} to ${args.endDate}`);
      }
      return inRange;
    });

    console.log(`[Analytics] After filtering: ${transactions.length} transactions in date range`);

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

      console.log(`[Analytics] Processing txn ${txn._id}: type="${txn.transactionType}", amount=${amount}, homeCurrencyAmount=${txn.homeCurrencyAmount}, originalAmount=${txn.originalAmount}`);

      if (txn.transactionType === "Income") {
        totalIncome += amount;
      } else if (txn.transactionType === "Expense") {
        totalExpenses += Math.abs(amount);
      } else if (txn.transactionType === "Cost of Goods Sold") {
        totalCogs += Math.abs(amount);
      } else {
        console.log(`[Analytics] WARNING: Unknown transactionType "${txn.transactionType}" for txn ${txn._id}`);
      }

      // Currency breakdown (net by currency)
      if (!currencyBreakdown[currency]) {
        currencyBreakdown[currency] = 0;
      }
      currencyBreakdown[currency] +=
        txn.transactionType === "Income" ? amount : -Math.abs(amount);

      // Category breakdown (expenses + COGS only)
      // Look up display name from categoryLookup, fallback to category value
      if (txn.transactionType === "Expense" || txn.transactionType === "Cost of Goods Sold") {
        const displayName = categoryLookup[category] || category;
        if (!categoryBreakdown[displayName]) {
          categoryBreakdown[displayName] = 0;
        }
        categoryBreakdown[displayName] += Math.abs(amount);
      }
    }

    const netProfit = totalIncome - totalExpenses - totalCogs;

    console.log(`[Analytics] FINAL TOTALS: income=${totalIncome}, expenses=${totalExpenses}, cogs=${totalCogs}, netProfit=${netProfit}`);

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

// ============================================
// AP VENDOR MANAGEMENT QUERIES
// ============================================

/**
 * Get aged payables grouped by vendor with aging bucket breakdown.
 * Includes "Unassigned Vendor" row for entries without vendorId.
 */
export const getAgedPayablesByVendor = query({
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

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const payables = entries.filter(
      (e) =>
        !e.deletedAt &&
        (e.status === "pending" || e.status === "overdue") &&
        (e.transactionType === "Expense" || e.transactionType === "Cost of Goods Sold")
    );

    // Group by vendorId
    const vendorGroups = new Map<
      string,
      { current: number; days1to30: number; days31to60: number; days61to90: number; days90plus: number; totalOutstanding: number; entryCount: number }
    >();

    const today = new Date();

    // Fetch all vendors for name lookup and payment terms
    const vendorIds = [...new Set(payables.map((e) => e.vendorId).filter(Boolean))];
    const vendors = await Promise.all(vendorIds.map((id) => ctx.db.get(id!)));
    const vendorMap = new Map(vendors.filter(Boolean).map((v) => [v!._id.toString(), v!]));

    for (const entry of payables) {
      const vendorKey = entry.vendorId ? entry.vendorId.toString() : "__unassigned__";
      const outstanding = (entry.homeCurrencyAmount ?? entry.originalAmount) - (entry.paidAmount ?? 0);

      if (!vendorGroups.has(vendorKey)) {
        vendorGroups.set(vendorKey, {
          current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0,
          totalOutstanding: 0, entryCount: 0,
        });
      }

      const group = vendorGroups.get(vendorKey)!;
      group.totalOutstanding += outstanding;
      group.entryCount++;

      // Calculate days overdue from dueDate
      const dueDate = entry.dueDate ? new Date(entry.dueDate) : null;
      const daysOverdue = dueDate
        ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      if (daysOverdue <= 0) group.current += outstanding;
      else if (daysOverdue <= 30) group.days1to30 += outstanding;
      else if (daysOverdue <= 60) group.days31to60 += outstanding;
      else if (daysOverdue <= 90) group.days61to90 += outstanding;
      else group.days90plus += outstanding;
    }

    // Build vendor array
    const vendorArray = Array.from(vendorGroups.entries()).map(([key, data]) => {
      const vendor = key !== "__unassigned__" ? vendorMap.get(key) : null;
      return {
        vendorId: key !== "__unassigned__" ? key : null,
        vendorName: vendor?.name ?? "Unassigned Vendor",
        paymentTerms: vendor?.paymentTerms,
        ...data,
      };
    });

    // Sort by totalOutstanding descending
    vendorArray.sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    // Calculate totals
    const totals = vendorArray.reduce(
      (acc, v) => ({
        current: acc.current + v.current,
        days1to30: acc.days1to30 + v.days1to30,
        days31to60: acc.days31to60 + v.days31to60,
        days61to90: acc.days61to90 + v.days61to90,
        days90plus: acc.days90plus + v.days90plus,
        totalOutstanding: acc.totalOutstanding + v.totalOutstanding,
      }),
      { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0, totalOutstanding: 0 }
    );

    return { vendors: vendorArray, totals };
  },
});

/**
 * Get individual unpaid entries for a specific vendor (drilldown).
 */
export const getVendorPayablesDrilldown = query({
  args: {
    businessId: v.id("businesses"),
    vendorId: v.optional(v.string()),
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

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const today = new Date();

    const filtered = entries.filter((e) => {
      if (e.deletedAt) return false;
      if (e.status !== "pending" && e.status !== "overdue") return false;
      if (e.transactionType !== "Expense" && e.transactionType !== "Cost of Goods Sold") return false;

      // Match vendorId (null/undefined for unassigned)
      if (args.vendorId) {
        return e.vendorId?.toString() === args.vendorId;
      } else {
        return !e.vendorId;
      }
    });

    return filtered
      .map((e) => {
        const outstanding = e.originalAmount - (e.paidAmount ?? 0);
        const dueDate = e.dueDate ? new Date(e.dueDate) : null;
        const daysOverdue = dueDate
          ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        return {
          entryId: e._id,
          referenceNumber: e.referenceNumber,
          originalAmount: e.originalAmount,
          originalCurrency: e.originalCurrency,
          homeCurrencyAmount: e.homeCurrencyAmount ?? e.originalAmount,
          paidAmount: e.paidAmount ?? 0,
          outstandingBalance: outstanding,
          transactionDate: e.transactionDate,
          dueDate: e.dueDate ?? "",
          daysOverdue,
          status: e.status as "pending" | "overdue",
          category: e.category,
          notes: e.notes,
        };
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  },
});

/**
 * Get pending payables due within a specified window (upcoming payments).
 * Includes overdue entries at the top.
 */
export const getAPUpcomingPayments = query({
  args: {
    businessId: v.id("businesses"),
    daysAhead: v.union(v.literal(7), v.literal(14), v.literal(30)),
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

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const today = new Date();
    const windowEnd = new Date(today.getTime() + args.daysAhead * 24 * 60 * 60 * 1000);
    const windowEndStr = windowEnd.toISOString().split("T")[0];
    const todayStr = today.toISOString().split("T")[0];

    const payables = entries.filter((e) => {
      if (e.deletedAt) return false;
      if (e.status !== "pending" && e.status !== "overdue") return false;
      if (e.transactionType !== "Expense" && e.transactionType !== "Cost of Goods Sold") return false;
      if (!e.dueDate) return false;
      // Include overdue (dueDate < today) and upcoming (dueDate <= windowEnd)
      return e.dueDate <= windowEndStr;
    });

    // Fetch vendor names
    const vendorIds = [...new Set(payables.map((e) => e.vendorId).filter(Boolean))];
    const vendors = await Promise.all(vendorIds.map((id) => ctx.db.get(id!)));
    const vendorMap = new Map(vendors.filter(Boolean).map((v) => [v!._id.toString(), v!.name]));

    const result = payables.map((e) => {
      const dueDate = new Date(e.dueDate!);
      const daysRemaining = Math.floor(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        entryId: e._id,
        vendorId: e.vendorId,
        vendorName: e.vendorId ? (vendorMap.get(e.vendorId.toString()) ?? "Unknown Vendor") : "Unassigned Vendor",
        originalAmount: e.originalAmount,
        originalCurrency: e.originalCurrency,
        homeCurrencyAmount: e.homeCurrencyAmount ?? e.originalAmount,
        outstandingBalance: e.originalAmount - (e.paidAmount ?? 0),
        dueDate: e.dueDate!,
        daysRemaining,
        status: e.status as "pending" | "overdue",
        referenceNumber: e.referenceNumber,
      };
    });

    // Sort: overdue first (most overdue at top), then by dueDate ascending
    result.sort((a, b) => {
      if (a.daysRemaining < 0 && b.daysRemaining >= 0) return -1;
      if (a.daysRemaining >= 0 && b.daysRemaining < 0) return 1;
      return a.daysRemaining - b.daysRemaining;
    });

    return result;
  },
});

/**
 * Get vendor spend analytics for a selectable period.
 * Returns top vendors, category breakdown, monthly trend, and total spend.
 */
export const getVendorSpendAnalytics = query({
  args: {
    businessId: v.id("businesses"),
    periodDays: v.union(v.literal(30), v.literal(90), v.literal(365)),
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

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    const cutoffDate = new Date(Date.now() - args.periodDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const spendEntries = entries.filter(
      (e) =>
        !e.deletedAt &&
        (e.transactionType === "Expense" || e.transactionType === "Cost of Goods Sold") &&
        (e.status === "paid" || e.status === "pending" || e.status === "overdue") &&
        e.transactionDate >= cutoffDate
    );

    // Fetch vendor names
    const vendorIds = [...new Set(spendEntries.map((e) => e.vendorId).filter(Boolean))];
    const vendors = await Promise.all(vendorIds.map((id) => ctx.db.get(id!)));
    const vendorMap = new Map(vendors.filter(Boolean).map((v) => [v!._id.toString(), v!.name]));

    // Aggregate by vendor
    const vendorSpend = new Map<string, { totalSpend: number; transactionCount: number }>();
    let totalSpend = 0;

    for (const e of spendEntries) {
      const amount = e.homeCurrencyAmount ?? e.originalAmount;
      totalSpend += amount;

      const vendorKey = e.vendorId?.toString() ?? "__unassigned__";
      const existing = vendorSpend.get(vendorKey) ?? { totalSpend: 0, transactionCount: 0 };
      existing.totalSpend += amount;
      existing.transactionCount++;
      vendorSpend.set(vendorKey, existing);
    }

    // Top 10 vendors
    const topVendors = Array.from(vendorSpend.entries())
      .map(([key, data]) => ({
        vendorId: key !== "__unassigned__" ? key : null,
        vendorName: key !== "__unassigned__" ? (vendorMap.get(key) ?? "Unknown Vendor") : "Unassigned Vendor",
        totalSpend: data.totalSpend,
        transactionCount: data.transactionCount,
        percentOfTotal: totalSpend > 0 ? (data.totalSpend / totalSpend) * 100 : 0,
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 10);

    // Category breakdown
    const categorySpend = new Map<string, { totalSpend: number; transactionCount: number }>();
    for (const e of spendEntries) {
      const category = e.category ?? "Uncategorized";
      const amount = e.homeCurrencyAmount ?? e.originalAmount;
      const existing = categorySpend.get(category) ?? { totalSpend: 0, transactionCount: 0 };
      existing.totalSpend += amount;
      existing.transactionCount++;
      categorySpend.set(category, existing);
    }

    const categoryBreakdown = Array.from(categorySpend.entries())
      .map(([category, data]) => ({
        category,
        totalSpend: data.totalSpend,
        percentOfTotal: totalSpend > 0 ? (data.totalSpend / totalSpend) * 100 : 0,
        transactionCount: data.transactionCount,
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend);

    // Monthly trend (last 12 months)
    const monthlySpend = new Map<string, { totalSpend: number; transactionCount: number }>();
    for (const e of spendEntries) {
      const month = e.transactionDate.substring(0, 7); // "YYYY-MM"
      const amount = e.homeCurrencyAmount ?? e.originalAmount;
      const existing = monthlySpend.get(month) ?? { totalSpend: 0, transactionCount: 0 };
      existing.totalSpend += amount;
      existing.transactionCount++;
      monthlySpend.set(month, existing);
    }

    const monthlyTrend = Array.from(monthlySpend.entries())
      .map(([month, data]) => ({
        month,
        totalSpend: data.totalSpend,
        transactionCount: data.transactionCount,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);

    return { topVendors, categoryBreakdown, monthlyTrend, totalSpend };
  },
});
