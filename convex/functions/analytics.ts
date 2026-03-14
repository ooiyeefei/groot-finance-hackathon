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

    // Fetch all journal entries for the business
    const allJournalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    console.log(`[Analytics] Query params: businessId=${args.businessId}, startDate=${args.startDate}, endDate=${args.endDate}`);
    console.log(`[Analytics] Found ${allJournalEntries.length} journal entries for businessId`);

    // Filter journal entries by date range and status
    const journalEntries = allJournalEntries.filter((entry) => {
      if (entry.status !== "posted") return false;
      if (!entry.transactionDate) return false;
      const inRange = entry.transactionDate >= args.startDate && entry.transactionDate <= args.endDate;
      return inRange;
    });

    console.log(`[Analytics] After filtering: ${journalEntries.length} journal entries in date range`);

    // Fetch all journal entry lines for these entries
    const journalEntryIds = new Set(journalEntries.map((e) => e._id));

    // Get all lines for these journal entries
    // Since we can't directly query by journalEntryId list, we need to fetch each entry's lines
    const allLines = await Promise.all(
      journalEntries.map(async (entry) => {
        const lines = await ctx.db
          .query("journal_entry_lines")
          .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", entry._id))
          .collect();
        return lines;
      })
    );

    const lines = allLines.flat();

    console.log(`[Analytics] Found ${lines.length} journal entry lines for filtered entries`);

    // Get business to determine home currency
    const business = await ctx.db.get(args.businessId);
    const homeCurrency = business?.homeCurrency || "MYR";

    // Calculate totals from journal entry lines
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalCogs = 0;
    const currencyBreakdown: Record<string, number> = { [homeCurrency]: 0 };
    const categoryBreakdown: Record<string, number> = {};

    for (const line of lines) {
      const accountCode = line.accountCode;

      // Revenue accounts (4000-4999) - credit side increases revenue
      if (accountCode >= "4000" && accountCode < "5000") {
        totalIncome += line.creditAmount;
        currencyBreakdown[homeCurrency] += line.creditAmount;
      }
      // Expense accounts (5000-5999) - debit side increases expenses
      else if (accountCode >= "5000" && accountCode < "6000") {
        totalExpenses += line.debitAmount;
        currencyBreakdown[homeCurrency] -= line.debitAmount;

        // Category breakdown by account name
        const categoryName = line.accountName;
        if (!categoryBreakdown[categoryName]) {
          categoryBreakdown[categoryName] = 0;
        }
        categoryBreakdown[categoryName] += line.debitAmount;
      }
      // COGS accounts (if they exist, typically 5xxx range, but let's handle them separately if needed)
      // For now, COGS is included in expenses (5000-5999 range)
    }

    const netProfit = totalIncome - totalExpenses - totalCogs;

    console.log(`[Analytics] FINAL TOTALS: income=${totalIncome}, expenses=${totalExpenses}, cogs=${totalCogs}, netProfit=${netProfit}`);

    return {
      userId: user._id,
      totalIncome,
      totalExpenses,
      totalCogs,
      netProfit,
      transactionCount: journalEntries.length,
      currencyBreakdown,
      categoryBreakdown,
      calculatedAt: Date.now(),
    };
  },
});

/**
 * Get aged receivables from sales_invoices (outstanding invoices by aging bucket).
 * Queries sales_invoices with status in ("sent", "overdue", "partially_paid").
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

    // Query outstanding sales invoices
    const invoices = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const receivables = invoices.filter((inv) => {
      if (inv.deletedAt) return false;
      return ["sent", "overdue", "partially_paid"].includes(inv.status);
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

    for (const inv of receivables) {
      const amount = inv.balanceDue;

      // Calculate days past due from dueDate
      const dueDate = new Date(inv.dueDate);
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
 * Get aged payables (AP invoices that are unpaid or partially paid)
 * Queries the invoices table with payment tracking fields.
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

    // Query invoices table for AP (supplier invoices with posted accounting status, not fully paid)
    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const payables = allInvoices.filter((inv) => {
      if (inv.deletedAt) return false;
      if (inv.accountingStatus !== "posted") return false;
      if (inv.paymentStatus === "paid") return false;
      // Only AP invoices (not expense claim receipts)
      if (inv.documentDomain === "expense_claims") return false;
      return true;
    });

    // Batch-fetch journal entries for amount calculation
    const journalEntryIds = payables
      .map((inv) => inv.journalEntryId)
      .filter(Boolean) as Array<any>;
    const journalEntries = await Promise.all(
      journalEntryIds.map((id) => ctx.db.get(id))
    );
    const journalEntryMap = new Map(
      journalEntries.filter(Boolean).map((je) => [je!._id.toString(), je!])
    );

    const currentDate = new Date();
    let current = 0;
    let late31_60 = 0;
    let late61_90 = 0;
    let late90Plus = 0;
    let totalOutstanding = 0;
    const riskDistribution = { low: 0, medium: 0, high: 0, critical: 0 };
    let highRiskCount = 0;
    const riskScores: number[] = [];

    for (const inv of payables) {
      // Get total amount: prefer journal entry totalDebit, fallback to extractedData
      const extracted = (inv as any).extractedData;
      let totalAmount = 0;
      if (inv.journalEntryId) {
        const je = journalEntryMap.get(inv.journalEntryId.toString());
        totalAmount = (je as any)?.totalDebit ?? 0;
      }
      if (!totalAmount && extracted) {
        const rawTotal = extracted.total_amount?.value ?? extracted.total_amount;
        totalAmount = typeof rawTotal === "number" ? rawTotal : parseFloat(rawTotal) || 0;
      }

      const paidAmount = inv.paidAmount ?? 0;
      const outstanding = Math.abs(totalAmount - paidAmount);

      // Calculate days past due
      const dueDate = inv.dueDate
        ? new Date(inv.dueDate)
        : new Date(inv._creationTime + 30 * 24 * 60 * 60 * 1000); // Default 30 days from creation

      const daysPastDue = Math.floor(
        (currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Categorize by age
      if (daysPastDue <= 30) {
        current += outstanding;
      } else if (daysPastDue <= 60) {
        late31_60 += outstanding;
      } else if (daysPastDue <= 90) {
        late61_90 += outstanding;
      } else {
        late90Plus += outstanding;
      }

      totalOutstanding += outstanding;

      // Calculate risk score (0-100)
      let riskScore = 0;
      if (daysPastDue <= 0) riskScore = 10;
      else if (daysPastDue <= 30) riskScore = 25;
      else if (daysPastDue <= 60) riskScore = 50;
      else if (daysPastDue <= 90) riskScore = 75;
      else riskScore = 95;

      // Adjust by amount
      if (outstanding > 10000) riskScore = Math.min(100, riskScore + 10);

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
 * Get overdue receivables for cash flow monitoring.
 * Queries sales_invoices with status in ("sent", "overdue", "partially_paid")
 * and filters by aging threshold. Joins to customers table for customer info.
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

    // Query outstanding sales invoices
    const invoices = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const receivables = invoices.filter((inv) => {
      if (inv.deletedAt) return false;
      return ["sent", "overdue", "partially_paid"].includes(inv.status);
    });

    // Batch-fetch customer names for all receivables with a customerId
    const customerIds = [...new Set(receivables.map((inv) => inv.customerId).filter(Boolean))];
    const customers = await Promise.all(customerIds.map((id) => ctx.db.get(id!)));
    const customerMap = new Map(
      customers.filter(Boolean).map((c) => [c!._id.toString(), c!.businessName])
    );

    const currentDate = new Date();
    const overdueItems: Array<{
      id: string;
      vendorName: string | null;
      amount: number;
      currency: string;
      dueDate: string;
      daysPastDue: number;
    }> = [];

    for (const inv of receivables) {
      const dueDate = new Date(inv.dueDate);
      const daysPastDue = Math.floor(
        (currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysPastDue > agingThreshold) {
        // Resolve customer name: prefer customers table, fallback to snapshot
        const customerName = inv.customerId
          ? (customerMap.get(inv.customerId.toString()) ?? inv.customerSnapshot.businessName)
          : inv.customerSnapshot.businessName;

        overdueItems.push({
          id: inv._id,
          vendorName: customerName || null,
          amount: inv.balanceDue,
          currency: inv.currency,
          dueDate: dueDate.toISOString(),
          daysPastDue,
        });
      }
    }

    return overdueItems;
  },
});

/**
 * Get upcoming payment deadlines from invoices table.
 * Returns AP invoices with due dates within the specified window.
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

    // Query invoices table for unpaid/partial AP invoices
    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const payables = allInvoices.filter((inv) => {
      if (inv.deletedAt) return false;
      if (inv.documentDomain === "expense_claims") return false;
      if (inv.paymentStatus === "paid") return false;
      if (!inv.dueDate) return false;
      return true;
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

    for (const inv of payables) {
      const dueDate = new Date(inv.dueDate!);

      if (dueDate >= currentDate && dueDate <= windowEnd) {
        const daysUntilDue = Math.floor(
          (dueDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Extract vendor name and amount from extractedData
        const extracted = (inv as any).extractedData;
        const vendorName = extracted?.vendor_name?.value ?? extracted?.vendor_name ?? null;
        const rawTotal = extracted?.total_amount?.value ?? extracted?.total_amount;
        const totalAmount = typeof rawTotal === "number" ? rawTotal : parseFloat(rawTotal) || 0;
        const outstanding = totalAmount - (inv.paidAmount ?? 0);
        const currency = extracted?.currency?.value ?? extracted?.currency ?? "MYR";

        upcomingPayments.push({
          id: inv._id,
          vendorName: typeof vendorName === "string" ? vendorName : null,
          amount: Math.abs(outstanding),
          currency: typeof currency === "string" ? currency : "MYR",
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
 * NOTE: Still uses accounting_entries for pending transactions with currency metadata.
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

    // NOTE: Still using accounting_entries for pending transactions
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
      const currency = txn.originalCurrency || "MYR";

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
 * NOTE: Still uses accounting_entries for pending transactions with due dates.
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

    // NOTE: Still using accounting_entries for pending transactions with due dates
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
    const homeCurrency = business?.homeCurrency || "MYR";

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
 * Queries the invoices table and extracts vendor name from extractedData.
 * Includes "Unassigned Vendor" row for invoices without a vendor name.
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

    // Query invoices table for unpaid/partial AP invoices
    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const payables = allInvoices.filter((inv) => {
      if (inv.deletedAt) return false;
      if (inv.documentDomain === "expense_claims") return false;
      if (inv.accountingStatus !== "posted") return false;
      if (inv.paymentStatus === "paid") return false;
      return true;
    });

    // Batch-fetch journal entries for amount calculation
    const journalEntryIds = payables
      .map((inv) => inv.journalEntryId)
      .filter(Boolean) as Array<any>;
    const journalEntries = await Promise.all(
      journalEntryIds.map((id) => ctx.db.get(id))
    );
    const journalEntryMap = new Map(
      journalEntries.filter(Boolean).map((je) => [je!._id.toString(), je!])
    );

    // Fetch all vendors for this business for name -> vendorId lookup
    const allVendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();
    const vendorByName = new Map(
      allVendors.map((v) => [v.name.toLowerCase(), v])
    );

    // Group by vendor name (extracted from invoice)
    const vendorGroups = new Map<
      string,
      { current: number; days1to30: number; days31to60: number; days61to90: number; days90plus: number; totalOutstanding: number; entryCount: number }
    >();

    const today = new Date();

    for (const inv of payables) {
      const extracted = (inv as any).extractedData;
      const rawVendorName = extracted?.vendor_name?.value ?? extracted?.vendor_name;
      const vendorName = typeof rawVendorName === "string" ? rawVendorName : null;
      const vendorKey = vendorName ? vendorName.toLowerCase() : "__unassigned__";

      // Get total amount from journal entry or extractedData
      let totalAmount = 0;
      if (inv.journalEntryId) {
        const je = journalEntryMap.get(inv.journalEntryId.toString());
        totalAmount = (je as any)?.totalDebit ?? 0;
      }
      if (!totalAmount && extracted) {
        const rawTotal = extracted.total_amount?.value ?? extracted.total_amount;
        totalAmount = typeof rawTotal === "number" ? rawTotal : parseFloat(rawTotal) || 0;
      }

      const paidAmount = inv.paidAmount ?? 0;
      const outstanding = Math.abs(totalAmount - paidAmount);

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
      const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
      const daysOverdue = dueDate
        ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      if (daysOverdue <= 0) group.current += outstanding;
      else if (daysOverdue <= 30) group.days1to30 += outstanding;
      else if (daysOverdue <= 60) group.days31to60 += outstanding;
      else if (daysOverdue <= 90) group.days61to90 += outstanding;
      else group.days90plus += outstanding;
    }

    // Build vendor array with vendorId lookup
    const vendorArray = Array.from(vendorGroups.entries()).map(([key, data]) => {
      const vendor = key !== "__unassigned__" ? vendorByName.get(key) : null;
      return {
        vendorId: vendor ? vendor._id.toString() : null,
        vendorName: vendor?.name ?? (key !== "__unassigned__" ? key : "Unassigned Vendor"),
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
 * Get individual unpaid invoices for a specific vendor (drilldown).
 * Queries the invoices table, matching vendor by name from extractedData or vendorId.
 * Returns invoiceId (not entryId) for the payment dialog.
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

    // Query invoices table for unpaid/partial AP invoices
    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Look up vendor name if vendorId is provided
    let targetVendorName: string | null = null;
    if (args.vendorId) {
      try {
        const vendor = await ctx.db.get(args.vendorId as any);
        targetVendorName = (vendor as any)?.name?.toLowerCase() ?? null;
      } catch {
        // vendorId might be a raw string name, not a Convex ID
        targetVendorName = args.vendorId.toLowerCase();
      }
    }

    const today = new Date();

    // Filter to posted, unpaid AP invoices
    const postedInvoices = allInvoices.filter((inv) => {
      if (inv.deletedAt) return false;
      if (inv.documentDomain === "expense_claims") return false;
      if (inv.accountingStatus !== "posted") return false;
      if (inv.paymentStatus === "paid") return false;
      return true;
    });

    // Batch-fetch journal entries for amount calculation
    const journalEntryIds = postedInvoices
      .map((inv) => inv.journalEntryId)
      .filter(Boolean) as Array<any>;
    const journalEntries = await Promise.all(
      journalEntryIds.map((id) => ctx.db.get(id))
    );
    const journalEntryMap = new Map(
      journalEntries.filter(Boolean).map((je) => [je!._id.toString(), je!])
    );

    // Filter by vendor
    const filtered = postedInvoices.filter((inv) => {
      const extracted = (inv as any).extractedData;
      const rawVendorName = extracted?.vendor_name?.value ?? extracted?.vendor_name;
      const invoiceVendorName = typeof rawVendorName === "string" ? rawVendorName.toLowerCase() : null;

      if (args.vendorId) {
        return invoiceVendorName === targetVendorName;
      } else {
        // Unassigned: no vendor name in extractedData
        return !invoiceVendorName;
      }
    });

    return filtered
      .map((inv) => {
        const extracted = (inv as any).extractedData;

        // Get total amount from journal entry or extractedData
        let totalAmount = 0;
        if (inv.journalEntryId) {
          const je = journalEntryMap.get(inv.journalEntryId.toString());
          totalAmount = (je as any)?.totalDebit ?? 0;
        }
        if (!totalAmount && extracted) {
          const rawTotal = extracted.total_amount?.value ?? extracted.total_amount;
          totalAmount = typeof rawTotal === "number" ? rawTotal : parseFloat(rawTotal) || 0;
        }

        const paidAmount = inv.paidAmount ?? 0;
        const outstanding = Math.abs(totalAmount - paidAmount);
        const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
        const daysOverdue = dueDate
          ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        // Extract reference number from extractedData
        const referenceNumber =
          extracted?.invoice_number?.value ??
          extracted?.invoice_number ??
          extracted?.reference_number?.value ??
          extracted?.reference_number ??
          null;

        // Extract currency
        const currency = extracted?.currency?.value ?? extracted?.currency ?? "MYR";

        // Determine status based on dueDate
        const isOverdue = dueDate ? dueDate < today : false;
        const status: "pending" | "overdue" = isOverdue ? "overdue" : "pending";

        return {
          invoiceId: inv._id,
          referenceNumber: typeof referenceNumber === "string" ? referenceNumber : null,
          originalAmount: totalAmount,
          originalCurrency: typeof currency === "string" ? currency : "MYR",
          homeCurrencyAmount: totalAmount,
          paidAmount,
          outstandingBalance: outstanding,
          transactionDate: inv._creationTime
            ? new Date(inv._creationTime).toISOString().split("T")[0]
            : "",
          dueDate: inv.dueDate ?? "",
          daysOverdue,
          status,
          category: null as string | null,
          notes: null as string | null,
        };
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  },
});

/**
 * Get pending payables due within a specified window (upcoming payments).
 * Includes overdue invoices at the top.
 * Queries the invoices table for AP data.
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

    // Query invoices table for unpaid/partial AP invoices with due dates
    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const today = new Date();
    const windowEnd = new Date(today.getTime() + args.daysAhead * 24 * 60 * 60 * 1000);
    const windowEndStr = windowEnd.toISOString().split("T")[0];

    const payables = allInvoices.filter((inv) => {
      if (inv.deletedAt) return false;
      if (inv.documentDomain === "expense_claims") return false;
      if (inv.accountingStatus !== "posted") return false;
      if (inv.paymentStatus === "paid") return false;
      if (!inv.dueDate) return false;
      // Include overdue (dueDate < today) and upcoming (dueDate <= windowEnd)
      return inv.dueDate <= windowEndStr;
    });

    // Batch-fetch journal entries for amount calculation
    const journalEntryIds = payables
      .map((inv) => inv.journalEntryId)
      .filter(Boolean) as Array<any>;
    const journalEntries = await Promise.all(
      journalEntryIds.map((id) => ctx.db.get(id))
    );
    const journalEntryMap = new Map(
      journalEntries.filter(Boolean).map((je) => [je!._id.toString(), je!])
    );

    // Fetch all vendors for this business for name -> vendorId lookup
    const allVendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();
    const vendorByName = new Map(
      allVendors.map((v) => [v.name.toLowerCase(), v])
    );

    const result = payables.map((inv) => {
      const extracted = (inv as any).extractedData;
      const dueDate = new Date(inv.dueDate!);
      const daysRemaining = Math.floor(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Get total amount from journal entry or extractedData
      let totalAmount = 0;
      if (inv.journalEntryId) {
        const je = journalEntryMap.get(inv.journalEntryId.toString());
        totalAmount = (je as any)?.totalDebit ?? 0;
      }
      if (!totalAmount && extracted) {
        const rawTotal = extracted.total_amount?.value ?? extracted.total_amount;
        totalAmount = typeof rawTotal === "number" ? rawTotal : parseFloat(rawTotal) || 0;
      }

      const paidAmount = inv.paidAmount ?? 0;
      const outstanding = Math.abs(totalAmount - paidAmount);

      // Extract vendor name and look up vendorId
      const rawVendorName = extracted?.vendor_name?.value ?? extracted?.vendor_name;
      const vendorName = typeof rawVendorName === "string" ? rawVendorName : null;
      const vendor = vendorName ? vendorByName.get(vendorName.toLowerCase()) : null;

      // Extract currency and reference number
      const currency = extracted?.currency?.value ?? extracted?.currency ?? "MYR";
      const referenceNumber =
        extracted?.invoice_number?.value ??
        extracted?.invoice_number ??
        extracted?.reference_number?.value ??
        extracted?.reference_number ??
        null;

      // Determine status based on dueDate
      const isOverdue = dueDate < today;
      const status: "pending" | "overdue" = isOverdue ? "overdue" : "pending";

      return {
        entryId: inv._id,
        vendorId: vendor ? vendor._id : null,
        vendorName: vendorName ?? "Unassigned Vendor",
        originalAmount: totalAmount,
        originalCurrency: typeof currency === "string" ? currency : "MYR",
        homeCurrencyAmount: totalAmount,
        outstandingBalance: outstanding,
        dueDate: inv.dueDate!,
        daysRemaining,
        status,
        referenceNumber: typeof referenceNumber === "string" ? referenceNumber : null,
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
 * Queries journal_entry_lines with vendor entity type for spend data.
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

    // Query journal entries for the business within the period
    const allJournalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const relevantEntries = allJournalEntries.filter(
      (je) =>
        je.status === "posted" &&
        je.transactionDate >= cutoffDate &&
        (je.sourceType === "vendor_invoice" || je.sourceType === "payment")
    );

    // Fetch all lines for relevant journal entries
    const allLines = await Promise.all(
      relevantEntries.map(async (entry) => {
        const lines = await ctx.db
          .query("journal_entry_lines")
          .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", entry._id))
          .collect();
        return lines.map((line) => ({ ...line, transactionDate: entry.transactionDate }));
      })
    );

    // Filter to expense account lines (5000-5999 = expense/COGS accounts, debit side)
    const expenseLines = allLines.flat().filter(
      (line) => line.accountCode >= "5000" && line.accountCode < "6000" && line.debitAmount > 0
    );

    // Also query invoices to map journal entries back to vendor names
    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Build a map of journalEntryId -> vendor name from invoices
    const jeToVendorName = new Map<string, string>();
    for (const inv of allInvoices) {
      if (inv.journalEntryId) {
        const extracted = (inv as any).extractedData;
        const rawVendorName = extracted?.vendor_name?.value ?? extracted?.vendor_name;
        if (typeof rawVendorName === "string") {
          jeToVendorName.set(inv.journalEntryId.toString(), rawVendorName);
        }
      }
    }

    // Fetch all vendors for this business for name -> vendorId lookup
    const allVendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();
    const vendorByName = new Map(
      allVendors.map((v) => [v.name.toLowerCase(), v])
    );

    // Aggregate by vendor
    const vendorSpend = new Map<string, { totalSpend: number; transactionCount: number }>();
    let totalSpend = 0;

    // Aggregate by category (account name)
    const categorySpend = new Map<string, { totalSpend: number; transactionCount: number }>();

    // Monthly trend
    const monthlySpend = new Map<string, { totalSpend: number; transactionCount: number }>();

    for (const line of expenseLines) {
      const amount = line.debitAmount;
      totalSpend += amount;

      // Vendor grouping: look up vendor name from journal entry -> invoice mapping
      const vendorName = jeToVendorName.get(line.journalEntryId.toString()) ?? null;
      const vendorKey = vendorName ? vendorName.toLowerCase() : "__unassigned__";

      const existingVendor = vendorSpend.get(vendorKey) ?? { totalSpend: 0, transactionCount: 0 };
      existingVendor.totalSpend += amount;
      existingVendor.transactionCount++;
      vendorSpend.set(vendorKey, existingVendor);

      // Category breakdown by account name
      const category = line.accountName ?? "Uncategorized";
      const existingCategory = categorySpend.get(category) ?? { totalSpend: 0, transactionCount: 0 };
      existingCategory.totalSpend += amount;
      existingCategory.transactionCount++;
      categorySpend.set(category, existingCategory);

      // Monthly trend
      const month = (line as any).transactionDate?.substring(0, 7) ?? "Unknown"; // "YYYY-MM"
      const existingMonth = monthlySpend.get(month) ?? { totalSpend: 0, transactionCount: 0 };
      existingMonth.totalSpend += amount;
      existingMonth.transactionCount++;
      monthlySpend.set(month, existingMonth);
    }

    // Top 10 vendors
    const topVendors = Array.from(vendorSpend.entries())
      .map(([key, data]) => {
        const vendor = key !== "__unassigned__" ? vendorByName.get(key) : null;
        return {
          vendorId: vendor ? vendor._id.toString() : null,
          vendorName: vendor?.name ?? (key !== "__unassigned__" ? key : "Unassigned Vendor"),
          totalSpend: data.totalSpend,
          transactionCount: data.transactionCount,
          percentOfTotal: totalSpend > 0 ? (data.totalSpend / totalSpend) * 100 : 0,
        };
      })
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 10);

    // Category breakdown
    const categoryBreakdown = Array.from(categorySpend.entries())
      .map(([category, data]) => ({
        category,
        totalSpend: data.totalSpend,
        percentOfTotal: totalSpend > 0 ? (data.totalSpend / totalSpend) * 100 : 0,
        transactionCount: data.transactionCount,
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend);

    // Monthly trend (last 12 months)
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
