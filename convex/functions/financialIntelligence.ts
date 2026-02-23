/**
 * Financial Intelligence - Category 3 Domain Intelligence API
 *
 * These are PUBLIC queries that expose FinanSEAL's domain-specific intelligence
 * for on-demand use by the AI agent. Following the Clockwise MCP model:
 *
 * "The tools themselves aren't simple CRUD operations. The scheduling
 * intelligence happens server-side, not sent back for analysis by the agent's LLM."
 *
 * The SAME algorithms that run in actionCenterJobs (cron) are exposed here
 * for real-time, on-demand analysis. The intelligence IS the query.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface AnomalyResult {
  transactionId: string;
  description: string;
  category: string;
  amount: number;
  zScore: number;
  severity: "high" | "medium";
  baseline: number;
  stdDev: number;
}

interface CashFlowAnalysis {
  runwayDays: number;
  monthlyBurnRate: number;
  estimatedBalance: number;
  totalIncome: number;
  totalExpenses: number;
  expenseToIncomeRatio: number;
  currency: string;
  alerts: Array<{
    type: "low_runway" | "expense_exceeding_income";
    severity: "critical" | "high" | "medium";
    message: string;
  }>;
  periodDays: number;
}

interface VendorRiskResult {
  vendorId: string;
  vendorName: string;
  riskScore: number;
  riskFactors: string[];
  severity: "high" | "medium" | "low";
  recentSpend: number;
  transactionCount: number;
}

interface VendorConcentrationResult {
  vendorId: string;
  vendorName: string;
  category: string;
  concentrationPercentage: number;
  totalCategorySpend: number;
  vendorSpend: number;
  severity: "high" | "medium" | "low";
}

interface DuplicateResult {
  transactionIds: string[];
  amount: number;
  vendorName: string;
  transactionDate: string;
  count: number;
}

// ============================================
// PUBLIC QUERIES - THE INTELLIGENCE LAYER
// ============================================

/**
 * Detect anomalies in expenses - returns transactions with amounts >2σ from category average
 *
 * THIS IS CATEGORY 3: The server performs statistical analysis and returns structured insights.
 * The LLM just presents the results - it doesn't analyze raw transaction data.
 */
export const detectAnomalies = query({
  args: {
    businessId: v.string(),
    dateRangeDays: v.optional(v.number()), // Default 90 days
    sensitivity: v.optional(v.union(v.literal("high"), v.literal("medium"), v.literal("low"))), // 1.5σ, 2σ, 3σ
  },
  handler: async (ctx, args): Promise<{
    anomalies: AnomalyResult[];
    analyzedTransactions: number;
    categoriesAnalyzed: number;
    periodDays: number;
  }> => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { anomalies: [], analyzedTransactions: 0, categoriesAnalyzed: 0, periodDays: 0 };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { anomalies: [], analyzedTransactions: 0, categoriesAnalyzed: 0, periodDays: 0 };
    }

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { anomalies: [], analyzedTransactions: 0, categoriesAnalyzed: 0, periodDays: 0 };
    }

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { anomalies: [], analyzedTransactions: 0, categoriesAnalyzed: 0, periodDays: 0 };
    }

    // Configuration
    const dateRangeDays = args.dateRangeDays ?? 90;
    const sigmaThreshold = args.sensitivity === "high" ? 1.5 : args.sensitivity === "low" ? 3 : 2;

    const cutoffDate = new Date(Date.now() - dateRangeDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    // Fetch transactions
    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const recentExpenses = entries.filter(
      (e) =>
        !e.deletedAt &&
        e.transactionType === "Expense" &&
        e.transactionDate &&
        e.transactionDate >= cutoffDate
    );

    // Group by category for statistical analysis
    const byCategory: Record<string, Array<{ txn: typeof recentExpenses[0]; amount: number }>> = {};

    for (const txn of recentExpenses) {
      const category = txn.category || "uncategorized";
      const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push({ txn, amount });
    }

    // Run anomaly detection - THE INTELLIGENCE
    const anomalies: AnomalyResult[] = [];

    for (const [category, items] of Object.entries(byCategory)) {
      if (items.length < 5) continue; // Need enough data points for statistical significance

      const amounts = items.map((i) => i.amount);
      const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;

      // Calculate standard deviation
      const squaredDiffs = amounts.map((a) => Math.pow(a - mean, 2));
      const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / amounts.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev === 0) continue; // No variance means no anomalies

      const threshold = mean + sigmaThreshold * stdDev;
      const threshold3Sigma = mean + 3 * stdDev;

      // Find anomalies
      for (const { txn, amount } of items) {
        if (amount <= threshold) continue;

        const zScore = (amount - mean) / stdDev;
        const severity = amount > threshold3Sigma ? "high" : "medium";

        anomalies.push({
          transactionId: txn._id.toString(),
          description: txn.description || `${category} expense`,
          category,
          amount,
          zScore: parseFloat(zScore.toFixed(2)),
          severity,
          baseline: parseFloat(mean.toFixed(2)),
          stdDev: parseFloat(stdDev.toFixed(2)),
        });
      }
    }

    // Sort by z-score descending (most anomalous first)
    anomalies.sort((a, b) => b.zScore - a.zScore);

    return {
      anomalies,
      analyzedTransactions: recentExpenses.length,
      categoriesAnalyzed: Object.keys(byCategory).length,
      periodDays: dateRangeDays,
    };
  },
});

/**
 * Analyze cash flow health and runway - returns projected runway days and alerts
 *
 * THIS IS CATEGORY 3: The server calculates burn rate, runway, and generates alerts.
 * The LLM receives structured insights, not raw transaction data to analyze.
 */
export const analyzeCashFlow = query({
  args: {
    businessId: v.string(),
    horizonDays: v.optional(v.number()), // Analysis period, default 90 days
  },
  handler: async (ctx, args): Promise<CashFlowAnalysis | null> => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return null;

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return null;

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") return null;

    const horizonDays = args.horizonDays ?? 90;
    const cutoffDate = new Date(Date.now() - horizonDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const recent = entries.filter(
      (e) => !e.deletedAt && e.transactionDate && e.transactionDate >= cutoffDate
    );

    // Calculate totals - THE INTELLIGENCE
    let totalIncome = 0;
    let totalExpenses = 0;
    let estimatedBalance = 0;

    for (const txn of recent) {
      const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);
      if (txn.transactionType === "Income") {
        totalIncome += amount;
        estimatedBalance += amount;
      } else if (txn.transactionType === "Expense") {
        totalExpenses += amount;
        estimatedBalance -= amount;
      }
    }

    // Calculate burn rate and runway
    const months = horizonDays / 30;
    const monthlyBurnRate = totalExpenses / months;
    const dailyBurnRate = monthlyBurnRate / 30;
    const runwayDays = dailyBurnRate > 0 ? Math.floor(estimatedBalance / dailyBurnRate) : 999;
    const expenseToIncomeRatio = totalIncome > 0 ? totalExpenses / totalIncome : totalExpenses > 0 ? 999 : 0;

    // Generate alerts - THE INTELLIGENCE
    const alerts: CashFlowAnalysis["alerts"] = [];

    // Low runway alert
    if (runwayDays < 30) {
      alerts.push({
        type: "low_runway",
        severity: runwayDays <= 7 ? "critical" : runwayDays <= 14 ? "high" : "medium",
        message: `Cash runway is only ${runwayDays} days based on current burn rate of ${monthlyBurnRate.toLocaleString()}/month`,
      });
    }

    // Expense exceeding income alert
    if (expenseToIncomeRatio > 1.2) {
      alerts.push({
        type: "expense_exceeding_income",
        severity: expenseToIncomeRatio > 2 ? "critical" : expenseToIncomeRatio > 1.5 ? "high" : "medium",
        message: `Expenses (${totalExpenses.toLocaleString()}) are ${((expenseToIncomeRatio - 1) * 100).toFixed(0)}% higher than income (${totalIncome.toLocaleString()})`,
      });
    }

    return {
      runwayDays,
      monthlyBurnRate: parseFloat(monthlyBurnRate.toFixed(2)),
      estimatedBalance: parseFloat(estimatedBalance.toFixed(2)),
      totalIncome: parseFloat(totalIncome.toFixed(2)),
      totalExpenses: parseFloat(totalExpenses.toFixed(2)),
      expenseToIncomeRatio: parseFloat(expenseToIncomeRatio.toFixed(2)),
      currency: business.homeCurrency || "MYR",
      alerts,
      periodDays: horizonDays,
    };
  },
});

/**
 * Analyze vendor risk scores - returns vendors with elevated risk based on multiple factors
 *
 * THIS IS CATEGORY 3: The server calculates risk scores using domain heuristics.
 * The LLM receives structured risk assessments, not raw vendor data to analyze.
 */
export const analyzeVendorRisk = query({
  args: {
    businessId: v.string(),
    vendorId: v.optional(v.string()), // Optional: analyze specific vendor
    riskThreshold: v.optional(v.number()), // Default 70
  },
  handler: async (ctx, args): Promise<{
    vendors: VendorRiskResult[];
    totalVendorsAnalyzed: number;
    highRiskCount: number;
  }> => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { vendors: [], totalVendorsAnalyzed: 0, highRiskCount: 0 };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { vendors: [], totalVendorsAnalyzed: 0, highRiskCount: 0 };
    }

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { vendors: [], totalVendorsAnalyzed: 0, highRiskCount: 0 };
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { vendors: [], totalVendorsAnalyzed: 0, highRiskCount: 0 };
    }

    const riskThreshold = args.riskThreshold ?? 70;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    // Get vendors
    let vendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter to specific vendor if requested
    if (args.vendorId) {
      vendors = vendors.filter((v) => v._id.toString() === args.vendorId);
    }

    // Get recent transactions for analysis
    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const recentExpenses = entries.filter(
      (e) =>
        !e.deletedAt &&
        e.transactionType === "Expense" &&
        e.transactionDate &&
        e.transactionDate >= ninetyDaysAgo
    );

    // Analyze each vendor - THE INTELLIGENCE
    const results: VendorRiskResult[] = [];

    for (const vendor of vendors) {
      if (vendor.status === "inactive") continue;

      const vendorTxns = recentExpenses.filter(
        (e) => e.vendorId?.toString() === vendor._id.toString()
      );

      let riskScore = 0;
      const factors: string[] = [];

      // Missing contact info (+15 risk)
      if (!vendor.email && !vendor.phone) {
        riskScore += 15;
        factors.push("No contact info");
      }

      // Missing tax ID (+10 risk)
      if (!vendor.taxId) {
        riskScore += 10;
        factors.push("Missing tax ID");
      }

      // Prospective/unverified status (+15 risk)
      if (vendor.status === "prospective") {
        riskScore += 15;
        factors.push("Unverified vendor");
      }

      // Transaction irregularity - high coefficient of variation (+20-30 risk)
      if (vendorTxns.length >= 3) {
        const amounts = vendorTxns.map((t) =>
          Math.abs(t.homeCurrencyAmount || t.originalAmount || 0)
        );
        const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
        const variance =
          amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length;
        const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

        if (cv > 1.5) {
          riskScore += 30;
          factors.push("Highly irregular payment amounts");
        } else if (cv > 1) {
          riskScore += 20;
          factors.push("Irregular payment amounts");
        }
      }

      // Inactivity - no transactions in 6+ months (+20 risk)
      if (vendorTxns.length === 0) {
        const daysSinceUpdate = vendor.updatedAt
          ? (Date.now() - vendor.updatedAt) / (24 * 60 * 60 * 1000)
          : 365;

        if (daysSinceUpdate > 180) {
          riskScore += 20;
          factors.push("No transactions in 6+ months");
        }
      }

      // Only include vendors above threshold
      if (riskScore >= riskThreshold) {
        const recentSpend = vendorTxns.reduce(
          (sum, t) => sum + Math.abs(t.homeCurrencyAmount || t.originalAmount || 0),
          0
        );

        results.push({
          vendorId: vendor._id.toString(),
          vendorName: vendor.name,
          riskScore,
          riskFactors: factors,
          severity: riskScore > 85 ? "high" : riskScore > 75 ? "medium" : "low",
          recentSpend: parseFloat(recentSpend.toFixed(2)),
          transactionCount: vendorTxns.length,
        });
      }
    }

    // Sort by risk score descending
    results.sort((a, b) => b.riskScore - a.riskScore);

    return {
      vendors: results,
      totalVendorsAnalyzed: vendors.length,
      highRiskCount: results.filter((v) => v.severity === "high").length,
    };
  },
});

/**
 * Detect vendor concentration risk - finds vendors with >X% of category spend
 *
 * THIS IS CATEGORY 3: The server identifies concentration risks using business logic.
 */
export const analyzeVendorConcentration = query({
  args: {
    businessId: v.string(),
    concentrationThreshold: v.optional(v.number()), // Default 50%
    dateRangeDays: v.optional(v.number()), // Default 90
  },
  handler: async (ctx, args): Promise<{
    concentrationRisks: VendorConcentrationResult[];
    categoriesAnalyzed: number;
  }> => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { concentrationRisks: [], categoriesAnalyzed: 0 };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { concentrationRisks: [], categoriesAnalyzed: 0 };
    }

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { concentrationRisks: [], categoriesAnalyzed: 0 };
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { concentrationRisks: [], categoriesAnalyzed: 0 };
    }

    const threshold = args.concentrationThreshold ?? 50;
    const dateRangeDays = args.dateRangeDays ?? 90;
    const cutoffDate = new Date(Date.now() - dateRangeDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const expenses = entries.filter(
      (e) =>
        !e.deletedAt &&
        e.transactionType === "Expense" &&
        e.transactionDate &&
        e.transactionDate >= cutoffDate &&
        e.category
    );

    // Group by category and vendor - THE INTELLIGENCE
    const byCategory: Record<
      string,
      { total: number; byVendor: Record<string, { name: string; amount: number }> }
    > = {};

    for (const txn of expenses) {
      const category = txn.category!;
      const vendorKey = txn.vendorId?.toString() || txn.vendorName || "unknown";
      const vendorName = txn.vendorName || "Unknown Vendor";
      const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);

      if (!byCategory[category]) {
        byCategory[category] = { total: 0, byVendor: {} };
      }
      byCategory[category].total += amount;

      if (!byCategory[category].byVendor[vendorKey]) {
        byCategory[category].byVendor[vendorKey] = { name: vendorName, amount: 0 };
      }
      byCategory[category].byVendor[vendorKey].amount += amount;
    }

    // Find concentration risks
    const risks: VendorConcentrationResult[] = [];

    for (const [category, data] of Object.entries(byCategory)) {
      if (data.total < 1000) continue; // Skip low-spend categories

      for (const [vendorId, vendorData] of Object.entries(data.byVendor)) {
        const percentage = (vendorData.amount / data.total) * 100;

        if (percentage >= threshold) {
          risks.push({
            vendorId,
            vendorName: vendorData.name,
            category,
            concentrationPercentage: parseFloat(percentage.toFixed(1)),
            totalCategorySpend: parseFloat(data.total.toFixed(2)),
            vendorSpend: parseFloat(vendorData.amount.toFixed(2)),
            severity: percentage > 80 ? "high" : percentage > 65 ? "medium" : "low",
          });
        }
      }
    }

    // Sort by concentration percentage descending
    risks.sort((a, b) => b.concentrationPercentage - a.concentrationPercentage);

    return {
      concentrationRisks: risks,
      categoriesAnalyzed: Object.keys(byCategory).length,
    };
  },
});

/**
 * Detect potential duplicate transactions
 *
 * THIS IS CATEGORY 3: The server identifies duplicates using pattern matching.
 */
export const detectDuplicates = query({
  args: {
    businessId: v.string(),
    dateRangeDays: v.optional(v.number()), // Default 30
    minAmount: v.optional(v.number()), // Default 100
  },
  handler: async (ctx, args): Promise<{
    duplicates: DuplicateResult[];
    transactionsAnalyzed: number;
    potentialSavings: number;
  }> => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { duplicates: [], transactionsAnalyzed: 0, potentialSavings: 0 };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { duplicates: [], transactionsAnalyzed: 0, potentialSavings: 0 };
    }

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { duplicates: [], transactionsAnalyzed: 0, potentialSavings: 0 };
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { duplicates: [], transactionsAnalyzed: 0, potentialSavings: 0 };
    }

    const dateRangeDays = args.dateRangeDays ?? 30;
    const minAmount = args.minAmount ?? 100;
    const cutoffDate = new Date(Date.now() - dateRangeDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const recent = entries.filter(
      (e) => !e.deletedAt && e.transactionDate && e.transactionDate >= cutoffDate
    );

    // Group by amount + vendor + date - THE INTELLIGENCE
    const grouped: Record<string, typeof recent> = {};

    for (const txn of recent) {
      const amount = Math.abs(txn.originalAmount || 0);
      if (amount < minAmount) continue;

      const key = `${txn.vendorName || "unknown"}_${amount}_${txn.transactionDate}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(txn);
    }

    // Find duplicates
    const duplicates: DuplicateResult[] = [];
    let potentialSavings = 0;

    for (const [, txns] of Object.entries(grouped)) {
      if (txns.length <= 1) continue;

      const firstTxn = txns[0];
      const amount = Math.abs(firstTxn.homeCurrencyAmount || firstTxn.originalAmount || 0);

      duplicates.push({
        transactionIds: txns.map((t) => t._id.toString()),
        amount,
        vendorName: firstTxn.vendorName || "Unknown",
        transactionDate: firstTxn.transactionDate || "",
        count: txns.length,
      });

      // Potential savings = duplicate amount (assuming all but one are duplicates)
      potentialSavings += amount * (txns.length - 1);
    }

    // Sort by amount descending
    duplicates.sort((a, b) => b.amount - a.amount);

    return {
      duplicates,
      transactionsAnalyzed: recent.length,
      potentialSavings: parseFloat(potentialSavings.toFixed(2)),
    };
  },
});

// DISABLED: actionCenterInsights table does not exist - feature was disabled
// Uncomment when Action Center feature is re-enabled
/*
export const getInsightById = query({
  args: {
    insightId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return null;

    // Try to find the insight
    const insight = await ctx.db
      .query("actionCenterInsights")
      .filter((q) => q.eq(q.field("_id"), args.insightId as any))
      .first();

    if (!insight) {
      // Try string comparison for legacy IDs
      const allInsights = await ctx.db.query("actionCenterInsights").collect();
      const found = allInsights.find((i) => i._id.toString() === args.insightId);
      if (!found) return null;

      // Verify user has access to this business
      const business = await resolveById(ctx.db, "businesses", found.businessId);
      if (!business) return null;

      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", business._id)
        )
        .first();

      if (!membership || membership.status !== "active") return null;

      return found;
    }

    // Verify user has access
    const business = await resolveById(ctx.db, "businesses", insight.businessId);
    if (!business) return null;

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") return null;

    return insight;
  },
});
*/

// ============================================
// MANAGER CROSS-EMPLOYEE QUERY FUNCTIONS
// ============================================

/**
 * Get employee expenses for a manager.
 * Fetches accounting entries for a specific employee, authorized by manager relationship.
 *
 * Authorization:
 * - Manager: target employee must be a direct report (managerId match)
 * - Finance admin / Owner: any employee in business
 * - Employee: denied
 */
export const getEmployeeExpensesForManager = query({
  args: {
    businessId: v.string(),
    requestingUserId: v.string(),
    targetEmployeeId: v.string(),
    filters: v.optional(v.object({
      vendorName: v.optional(v.string()),
      category: v.optional(v.string()),
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      transactionType: v.optional(v.string()),
      limit: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { authorized: false, error: "Business not found", entries: [], totalCount: 0, totalAmount: 0, currency: "MYR", employeeName: "" };
    }

    // Resolve requesting user
    const requester = await resolveById(ctx.db, "users", args.requestingUserId);
    if (!requester) {
      return { authorized: false, error: "Requesting user not found", entries: [], totalCount: 0, totalAmount: 0, currency: "MYR", employeeName: "" };
    }

    // Get requester's membership and role
    const requesterMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", requester._id).eq("businessId", business._id)
      )
      .first();

    if (!requesterMembership || requesterMembership.status !== "active") {
      return { authorized: false, error: "Not a member of this business", entries: [], totalCount: 0, totalAmount: 0, currency: "MYR", employeeName: "" };
    }

    const role = requesterMembership.role;

    // Resolve target employee
    const targetEmployee = await resolveById(ctx.db, "users", args.targetEmployeeId);
    if (!targetEmployee) {
      return { authorized: false, error: "Target employee not found", entries: [], totalCount: 0, totalAmount: 0, currency: "MYR", employeeName: "" };
    }

    // Authorization check
    const isSelfQuery = targetEmployee._id === requester._id;

    if (!isSelfQuery) {
      if (role === "employee") {
        return { authorized: false, error: "Employees cannot query other employees' data", entries: [], totalCount: 0, totalAmount: 0, currency: "MYR", employeeName: targetEmployee.fullName || "" };
      }

      if (role === "manager") {
        // Verify target is a direct report
        const targetMembership = await ctx.db
          .query("business_memberships")
          .withIndex("by_userId_businessId", (q) =>
            q.eq("userId", targetEmployee._id).eq("businessId", business._id)
          )
          .first();

        if (!targetMembership || targetMembership.managerId !== requester._id) {
          return { authorized: false, error: "You can only view data for your direct reports", entries: [], totalCount: 0, totalAmount: 0, currency: "MYR", employeeName: targetEmployee.fullName || "" };
        }
      }
      // finance_admin and owner: allowed for any employee in business
    }
    // Self-query: any role can query their own expenses

    // Query accounting entries
    const allEntries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter: userId match, not deleted, apply optional filters
    let filtered = allEntries.filter((e) =>
      e.userId === targetEmployee._id && !e.deletedAt
    );

    const filters = args.filters;
    if (filters) {
      if (filters.vendorName) {
        const vendorLower = filters.vendorName.toLowerCase();
        filtered = filtered.filter((e) =>
          (e.vendorName || "").toLowerCase().includes(vendorLower)
        );
      }
      if (filters.category) {
        filtered = filtered.filter((e) => e.category === filters.category);
      }
      if (filters.startDate) {
        filtered = filtered.filter((e) =>
          e.transactionDate && e.transactionDate >= filters.startDate!
        );
      }
      if (filters.endDate) {
        filtered = filtered.filter((e) =>
          e.transactionDate && e.transactionDate <= filters.endDate!
        );
      }
      if (filters.transactionType) {
        filtered = filtered.filter((e) => e.transactionType === filters.transactionType);
      }
    }

    // Sort by transactionDate descending
    filtered.sort((a, b) =>
      (b.transactionDate || "").localeCompare(a.transactionDate || "")
    );

    // Compute totals BEFORE applying limit
    const totalCount = filtered.length;
    const totalAmount = filtered.reduce(
      (sum, e) => sum + Math.abs(e.homeCurrencyAmount || e.originalAmount || 0),
      0
    );

    // Apply limit
    const limit = Math.min(filters?.limit || 50, 50);
    const limited = filtered.slice(0, limit);

    // Map entries to response format
    const entries = limited.map((e) => ({
      id: e._id.toString(),
      transactionDate: e.transactionDate || "",
      description: e.description || "",
      vendorName: e.vendorName || "",
      originalAmount: e.originalAmount || 0,
      homeCurrencyAmount: e.homeCurrencyAmount || e.originalAmount || 0,
      originalCurrency: e.originalCurrency || "MYR",
      homeCurrency: e.homeCurrency || business.homeCurrency || "MYR",
      category: e.category || "",
      transactionType: e.transactionType,
      sourceDocumentType: e.sourceDocumentType || "",
    }));

    return {
      authorized: true,
      entries,
      totalCount,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      currency: business.homeCurrency || "MYR",
      employeeName: targetEmployee.fullName || targetEmployee.email || "",
    };
  },
});

/**
 * Get team expense summary for a manager.
 * Aggregates accounting entries across all direct reports.
 *
 * Authorization:
 * - Manager: aggregates only direct reports
 * - Finance admin / Owner: aggregates all business employees
 */
export const getTeamExpenseSummary = query({
  args: {
    businessId: v.string(),
    requestingUserId: v.string(),
    filters: v.optional(v.object({
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      category: v.optional(v.string()),
      groupBy: v.optional(v.string()), // "employee" | "category" | "vendor"
    })),
  },
  handler: async (ctx, args) => {
    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { authorized: false, error: "Business not found", summary: { totalAmount: 0, currency: "MYR", employeeCount: 0, recordCount: 0 }, breakdown: [], topCategories: [] };
    }

    // Resolve requesting user
    const requester = await resolveById(ctx.db, "users", args.requestingUserId);
    if (!requester) {
      return { authorized: false, error: "Requesting user not found", summary: { totalAmount: 0, currency: "MYR", employeeCount: 0, recordCount: 0 }, breakdown: [], topCategories: [] };
    }

    // Get requester's membership
    const requesterMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", requester._id).eq("businessId", business._id)
      )
      .first();

    if (!requesterMembership || requesterMembership.status !== "active") {
      return { authorized: false, error: "Not a member of this business", summary: { totalAmount: 0, currency: "MYR", employeeCount: 0, recordCount: 0 }, breakdown: [], topCategories: [] };
    }

    const role = requesterMembership.role;
    if (role === "employee") {
      return { authorized: false, error: "Employees cannot access team data", summary: { totalAmount: 0, currency: "MYR", employeeCount: 0, recordCount: 0 }, breakdown: [], topCategories: [] };
    }

    // Get target employee IDs based on role
    const allMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const activeMemberships = allMemberships.filter((m) => m.status === "active");

    let targetUserIds: Set<string>;
    if (role === "manager") {
      // Only direct reports
      targetUserIds = new Set(
        activeMemberships
          .filter((m) => m.managerId === requester._id)
          .map((m) => m.userId.toString())
      );
    } else {
      // Finance admin / Owner: all employees except self
      targetUserIds = new Set(
        activeMemberships
          .filter((m) => m.userId !== requester._id)
          .map((m) => m.userId.toString())
      );
    }

    if (targetUserIds.size === 0) {
      return {
        authorized: true,
        summary: { totalAmount: 0, currency: business.homeCurrency || "MYR", employeeCount: 0, recordCount: 0 },
        breakdown: [],
        topCategories: [],
      };
    }

    // Build user name map
    const userNameMap: Record<string, string> = {};
    for (const userId of targetUserIds) {
      const user = await resolveById(ctx.db, "users", userId);
      if (user) {
        userNameMap[userId] = user.fullName || user.email || userId;
      }
    }

    // Query all entries for business
    const allEntries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter to target users, not deleted, apply optional filters
    let filtered = allEntries.filter((e) =>
      targetUserIds.has(e.userId.toString()) && !e.deletedAt
    );

    const filters = args.filters;
    if (filters) {
      if (filters.startDate) {
        filtered = filtered.filter((e) =>
          e.transactionDate && e.transactionDate >= filters.startDate!
        );
      }
      if (filters.endDate) {
        filtered = filtered.filter((e) =>
          e.transactionDate && e.transactionDate <= filters.endDate!
        );
      }
      if (filters.category) {
        filtered = filtered.filter((e) => e.category === filters.category);
      }
    }

    // Compute summary
    const totalAmount = filtered.reduce(
      (sum, e) => sum + Math.abs(e.homeCurrencyAmount || e.originalAmount || 0),
      0
    );
    const uniqueEmployees = new Set(filtered.map((e) => e.userId.toString()));

    // Group by requested dimension
    const groupBy = filters?.groupBy || "employee";
    const groups: Record<string, { groupKey: string; groupId: string; totalAmount: number; recordCount: number }> = {};

    for (const entry of filtered) {
      const amount = Math.abs(entry.homeCurrencyAmount || entry.originalAmount || 0);
      let key: string;
      let groupKey: string;

      if (groupBy === "employee") {
        key = entry.userId.toString();
        groupKey = userNameMap[key] || key;
      } else if (groupBy === "category") {
        key = entry.category || "uncategorized";
        groupKey = key;
      } else {
        // vendor
        key = (entry.vendorName || "Unknown").toLowerCase();
        groupKey = entry.vendorName || "Unknown";
      }

      if (!groups[key]) {
        groups[key] = { groupKey, groupId: key, totalAmount: 0, recordCount: 0 };
      }
      groups[key].totalAmount += amount;
      groups[key].recordCount++;
    }

    // Build breakdown with percentages, sorted by amount descending
    const breakdown = Object.values(groups)
      .map((g) => ({
        ...g,
        totalAmount: parseFloat(g.totalAmount.toFixed(2)),
        percentage: totalAmount > 0 ? parseFloat(((g.totalAmount / totalAmount) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    // Compute top categories (always, regardless of groupBy)
    const categoryGroups: Record<string, number> = {};
    for (const entry of filtered) {
      const category = entry.category || "uncategorized";
      const amount = Math.abs(entry.homeCurrencyAmount || entry.originalAmount || 0);
      categoryGroups[category] = (categoryGroups[category] || 0) + amount;
    }

    const topCategories = Object.entries(categoryGroups)
      .map(([category, amount]) => ({
        category,
        categoryName: category,
        totalAmount: parseFloat(amount.toFixed(2)),
        percentage: totalAmount > 0 ? parseFloat(((amount / totalAmount) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5);

    return {
      authorized: true,
      summary: {
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        currency: business.homeCurrency || "MYR",
        employeeCount: targetUserIds.size,       // total team members in scope
        employeesWithData: uniqueEmployees.size, // members who have transactions in this period
        recordCount: filtered.length,
      },
      breakdown,
      topCategories,
    };
  },
});

/**
 * Get team expenses for MCP server analytics tool.
 * Returns raw expense data for server-side computation.
 *
 * System-level query - no Clerk auth required.
 * Authorization: validates managerUserId has manager/finance_admin/owner role.
 */
export const getMcpTeamExpenses = query({
  args: {
    businessId: v.string(),
    managerUserId: v.string(),
    employeeIds: v.optional(v.array(v.string())),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    categoryFilter: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return [];

    // Resolve manager user
    const manager = await resolveById(ctx.db, "users", args.managerUserId);
    if (!manager) return [];

    // Verify manager's role
    const managerMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", manager._id).eq("businessId", business._id)
      )
      .first();

    if (!managerMembership || managerMembership.status !== "active") return [];

    const role = managerMembership.role;
    if (!["manager", "finance_admin", "owner"].includes(role)) return [];

    // Get target employee IDs
    const allMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const activeMemberships = allMemberships.filter((m) => m.status === "active");

    let targetUserIds: Set<string>;
    if (args.employeeIds && args.employeeIds.length > 0) {
      // Specific employees requested - validate they're in scope
      const allowedIds = role === "manager"
        ? new Set(activeMemberships.filter((m) => m.managerId === manager._id).map((m) => m.userId.toString()))
        : new Set(activeMemberships.map((m) => m.userId.toString()));

      targetUserIds = new Set(args.employeeIds.filter((id) => allowedIds.has(id)));
    } else {
      // All in scope
      targetUserIds = role === "manager"
        ? new Set(activeMemberships.filter((m) => m.managerId === manager._id).map((m) => m.userId.toString()))
        : new Set(activeMemberships.filter((m) => m.userId !== manager._id).map((m) => m.userId.toString()));
    }

    if (targetUserIds.size === 0) return [];

    // Build user name map
    const userNameMap: Record<string, string> = {};
    for (const userId of targetUserIds) {
      const user = await resolveById(ctx.db, "users", userId);
      if (user) {
        userNameMap[userId] = user.fullName || user.email || userId;
      }
    }

    // Query entries
    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter
    let filtered = entries.filter((e) =>
      targetUserIds.has(e.userId.toString()) && !e.deletedAt
    );

    if (args.startDate) {
      filtered = filtered.filter((e) => e.transactionDate && e.transactionDate >= args.startDate!);
    }
    if (args.endDate) {
      filtered = filtered.filter((e) => e.transactionDate && e.transactionDate <= args.endDate!);
    }
    if (args.categoryFilter && args.categoryFilter.length > 0) {
      const categorySet = new Set(args.categoryFilter);
      filtered = filtered.filter((e) => categorySet.has(e.category || ""));
    }

    return filtered.map((e) => ({
      _id: e._id.toString(),
      userId: e.userId.toString(),
      userName: userNameMap[e.userId.toString()] || "",
      transactionDate: e.transactionDate || "",
      vendorName: e.vendorName || "",
      category: e.category || "",
      categoryName: e.category || "",
      originalAmount: e.originalAmount || 0,
      homeCurrencyAmount: e.homeCurrencyAmount || e.originalAmount || 0,
      currency: e.originalCurrency || business.homeCurrency || "MYR",
      transactionType: e.transactionType,
    }));
  },
});

// ============================================
// MCP SYSTEM DATA ACCESS (No Auth Required)
// Used by MCP Lambda tools via HTTP API
// ============================================

/**
 * Get accounting entries for a business (MCP system access)
 * Used by MCP tools (detect_anomalies, forecast_cash_flow, analyze_vendor_risk)
 *
 * This is a system-level query that doesn't require Clerk authentication.
 * Authorization is implicit via the businessId - only the MCP Lambda knows valid IDs.
 */
export const getMcpAccountingEntries = query({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Return entries with only the fields needed for analysis
    // Map actual schema fields to what MCP tools expect
    return entries.map((e) => ({
      _id: e._id.toString(),
      businessId: e.businessId?.toString() ?? "",
      transactionType: e.transactionType,
      transactionDate: e.transactionDate,
      category: e.category,
      categoryName: e.category, // MCP tools expect categoryName, schema has category
      vendorName: e.vendorName,
      vendorId: e.vendorId?.toString(),
      description: e.description,
      originalAmount: e.originalAmount,
      homeCurrencyAmount: e.homeCurrencyAmount,
      currency: e.originalCurrency, // MCP tools expect currency, schema has originalCurrency
      deletedAt: e.deletedAt,
    }));
  },
});

/**
 * Get vendors for a business (MCP system access)
 * Used by MCP tools (analyze_vendor_risk)
 */
export const getMcpVendors = query({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    return vendors.map((v) => ({
      _id: v._id.toString(),
      businessId: v.businessId.toString(),
      name: v.name,
      email: v.email,
      phone: v.phone,
      taxId: v.taxId,
      status: v.status,
      updatedAt: v.updatedAt,
    }));
  },
});

/**
 * Get expense claims for a business (MCP system access)
 * Used by MCP tools (create_proposal, confirm_proposal)
 */
export const getMcpExpenseClaims = query({
  args: {
    businessId: v.string(),
    claimId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    const claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    let filtered = claims.filter((c) => !c.deletedAt);

    // Filter to specific claim if requested
    if (args.claimId) {
      filtered = filtered.filter((c) => c._id.toString() === args.claimId);
    }

    return filtered.map((c) => ({
      _id: c._id.toString(),
      businessId: c.businessId.toString(),
      status: c.status,
      vendorName: c.vendorName,
      totalAmount: c.totalAmount,
      currency: c.currency,
      transactionDate: c.transactionDate,
      description: c.description,
      expenseCategory: c.expenseCategory,
    }));
  },
});

/**
 * Update expense claim status (MCP system access)
 * Used by MCP tools (confirm_proposal)
 */
export const mcpUpdateExpenseClaimStatus = mutation({
  args: {
    claimId: v.string(),
    status: v.string(),
    approvalNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const claim = await resolveById(ctx.db, "expense_claims", args.claimId);
    if (!claim) {
      return { success: false, error: "CLAIM_NOT_FOUND" };
    }

    const updateData: Record<string, unknown> = {
      status: args.status,
      updatedAt: Date.now(),
    };

    if (args.status === "approved") {
      updateData.approvedAt = Date.now();
      updateData.approvalNote = args.approvalNote || "Approved via MCP";
    } else if (args.status === "rejected") {
      updateData.rejectedAt = Date.now();
      updateData.rejectionReason = args.approvalNote || "Rejected via MCP";
    }

    await ctx.db.patch(claim._id, updateData);
    return { success: true, claimId: args.claimId };
  },
});
