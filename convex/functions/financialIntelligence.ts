/**
 * Financial Intelligence - Category 3 Domain Intelligence API
 *
 * These are PUBLIC queries that expose Groot Finance's domain-specific intelligence
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

    // Fetch journal entries and lines
    const journalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .filter((q) => q.gte(q.field("transactionDate"), cutoffDate))
      .filter((q) => q.eq(q.field("status"), "posted"))
      .collect();

    const journalEntryIds = journalEntries.map((e) => e._id);

    // Get all expense lines (account codes 5000-5999, debit side)
    const allLines = await ctx.db.query("journal_entry_lines").withIndex("by_business_account", (q) => q.eq("businessId", business._id)).collect();
    const expenseLines = allLines.filter((line) => {
      if (!journalEntryIds.includes(line.journalEntryId)) return false;
      if (line.debitAmount === 0) return false; // Expenses increase with debits
      const code = line.accountCode;
      return code >= "5000" && code < "6000";
    });

    // Group by account name (category equivalent) for statistical analysis
    const byCategory: Record<string, Array<{ line: typeof expenseLines[0]; amount: number; entryId: string }>> = {};

    for (const line of expenseLines) {
      const category = line.accountName || "uncategorized";
      const amount = line.debitAmount;
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push({ line, amount, entryId: line.journalEntryId });
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
      for (const { line, amount, entryId } of items) {
        if (amount <= threshold) continue;

        const zScore = (amount - mean) / stdDev;
        const severity = amount > threshold3Sigma ? "high" : "medium";

        anomalies.push({
          transactionId: entryId,
          description: line.lineDescription || `${category} expense`,
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
      analyzedTransactions: expenseLines.length,
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

    // Fetch journal entries and lines
    const journalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .filter((q) => q.gte(q.field("transactionDate"), cutoffDate))
      .filter((q) => q.eq(q.field("status"), "posted"))
      .collect();

    const journalEntryIds = journalEntries.map((e) => e._id);

    // Get all lines for these entries
    const allLines = await ctx.db.query("journal_entry_lines").withIndex("by_business_account", (q) => q.eq("businessId", business._id)).collect();
    const relevantLines = allLines.filter((line) => journalEntryIds.includes(line.journalEntryId));

    // Calculate totals - THE INTELLIGENCE
    let totalIncome = 0;
    let totalExpenses = 0;

    for (const line of relevantLines) {
      const code = line.accountCode;
      // Revenue accounts (4000-4999) increase with credits
      if (code >= "4000" && code < "5000" && line.creditAmount > 0) {
        totalIncome += line.creditAmount;
      }
      // Expense accounts (5000-5999) increase with debits
      else if (code >= "5000" && code < "6000" && line.debitAmount > 0) {
        totalExpenses += line.debitAmount;
      }
    }

    const estimatedBalance = totalIncome - totalExpenses;

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
    const journalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .filter((q) => q.gte(q.field("transactionDate"), ninetyDaysAgo))
      .filter((q) => q.eq(q.field("status"), "posted"))
      .collect();

    const journalEntryIds = journalEntries.map((e) => e._id);

    // Get all expense lines (account codes 5000-5999, debit side)
    const allLines = await ctx.db.query("journal_entry_lines").withIndex("by_business_account", (q) => q.eq("businessId", business._id)).collect();
    const expenseLines = allLines.filter((line) => {
      if (!journalEntryIds.includes(line.journalEntryId)) return false;
      if (line.debitAmount === 0) return false;
      const code = line.accountCode;
      return code >= "5000" && code < "6000";
    });

    // Analyze each vendor - THE INTELLIGENCE
    const results: VendorRiskResult[] = [];

    for (const vendor of vendors) {
      if (vendor.status === "inactive") continue;

      // Filter expense lines for this vendor
      const vendorLines = expenseLines.filter(
        (line) => line.entityType === "vendor" && line.entityId === vendor._id.toString()
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
      if (vendorLines.length >= 3) {
        const amounts = vendorLines.map((line) => line.debitAmount);
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
      if (vendorLines.length === 0) {
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
        const recentSpend = vendorLines.reduce((sum, line) => sum + line.debitAmount, 0);

        results.push({
          vendorId: vendor._id.toString(),
          vendorName: vendor.name,
          riskScore,
          riskFactors: factors,
          severity: riskScore > 85 ? "high" : riskScore > 75 ? "medium" : "low",
          recentSpend: parseFloat(recentSpend.toFixed(2)),
          transactionCount: vendorLines.length,
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

    // Fetch journal entries and expense lines
    const journalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .filter((q) => q.gte(q.field("transactionDate"), cutoffDate))
      .filter((q) => q.eq(q.field("status"), "posted"))
      .collect();

    const journalEntryIds = journalEntries.map((e) => e._id);

    // Get all expense lines (account codes 5000-5999, debit side)
    const allLines = await ctx.db.query("journal_entry_lines").withIndex("by_business_account", (q) => q.eq("businessId", business._id)).collect();
    const expenseLines = allLines.filter((line) => {
      if (!journalEntryIds.includes(line.journalEntryId)) return false;
      if (line.debitAmount === 0) return false;
      const code = line.accountCode;
      return code >= "5000" && code < "6000";
    });

    // Group by account (category equivalent) and vendor - THE INTELLIGENCE
    const byCategory: Record<
      string,
      { total: number; byVendor: Record<string, { name: string; amount: number }> }
    > = {};

    for (const line of expenseLines) {
      const category = line.accountName || "uncategorized";
      const vendorKey = line.entityType === "vendor" && line.entityId ? line.entityId : "unknown";
      const vendorName = line.entityName || "Unknown Vendor";
      const amount = line.debitAmount;

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

    // Fetch journal entries
    const journalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .filter((q) => q.gte(q.field("transactionDate"), cutoffDate))
      .filter((q) => q.eq(q.field("status"), "posted"))
      .collect();

    const journalEntryIds = journalEntries.map((e) => e._id);

    // Get all expense lines (account codes 5000-5999, debit side)
    const allLines = await ctx.db.query("journal_entry_lines").withIndex("by_business_account", (q) => q.eq("businessId", business._id)).collect();
    const expenseLines = allLines.filter((line) => {
      if (!journalEntryIds.includes(line.journalEntryId)) return false;
      if (line.debitAmount === 0) return false;
      if (line.debitAmount < minAmount) return false;
      const code = line.accountCode;
      return code >= "5000" && code < "6000";
    });

    // Group by amount + vendor + date - THE INTELLIGENCE
    const grouped: Record<string, typeof expenseLines> = {};

    for (const line of expenseLines) {
      const entry = journalEntries.find((e) => e._id === line.journalEntryId);
      if (!entry) continue;

      const amount = line.debitAmount;
      const vendorName = line.entityName || "unknown";
      const key = `${vendorName}_${amount}_${entry.transactionDate}`;

      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(line);
    }

    // Find duplicates
    const duplicates: DuplicateResult[] = [];
    let potentialSavings = 0;

    for (const [, lines] of Object.entries(grouped)) {
      if (lines.length <= 1) continue;

      const firstLine = lines[0];
      const amount = firstLine.debitAmount;
      const entry = journalEntries.find((e) => e._id === firstLine.journalEntryId);

      duplicates.push({
        transactionIds: lines.map((l) => l.journalEntryId),
        amount,
        vendorName: firstLine.entityName || "Unknown",
        transactionDate: entry?.transactionDate || "",
        count: lines.length,
      });

      // Potential savings = duplicate amount (assuming all but one are duplicates)
      potentialSavings += amount * (lines.length - 1);
    }

    // Sort by amount descending
    duplicates.sort((a, b) => b.amount - a.amount);

    return {
      duplicates,
      transactionsAnalyzed: expenseLines.length,
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

    // Query journal entries and lines for this employee
    const allJournalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .filter((q) => q.eq(q.field("status"), "posted"))
      .collect();

    // Filter by date range if provided
    const filters = args.filters;
    let journalEntries = allJournalEntries;
    if (filters?.startDate) {
      journalEntries = journalEntries.filter((e) => e.transactionDate >= filters.startDate!);
    }
    if (filters?.endDate) {
      journalEntries = journalEntries.filter((e) => e.transactionDate <= filters.endDate!);
    }

    const journalEntryIds = journalEntries.map((e) => e._id);

    // Find expense journal entries created BY this employee
    // Strategy: journal entries with sourceType="expense_claim" AND createdBy=targetEmployee
    // OR journal entry lines with entityType="employee" AND entityId=targetEmployee (legacy data)
    const employeeJournalEntryIds = new Set(
      journalEntries
        .filter((e) =>
          (e.sourceType === "expense_claim" && e.createdBy === targetEmployee._id.toString()) ||
          (e.sourceType === "expense_claim" && e.createdBy === targetEmployee.clerkUserId)
        )
        .map((e) => e._id)
    );

    const allLines = await ctx.db.query("journal_entry_lines").withIndex("by_business_account", (q) => q.eq("businessId", business._id)).collect();
    let relevantLines = allLines.filter((line) => {
      if (!journalEntryIds.includes(line.journalEntryId)) return false;
      // Match by employee journal entry (new approach) OR legacy entityType=employee
      const isEmployeeExpenseJE = employeeJournalEntryIds.has(line.journalEntryId);
      const isLegacyEmployeeEntity = line.entityType === "employee" && line.entityId === targetEmployee._id.toString();
      if (!isEmployeeExpenseJE && !isLegacyEmployeeEntity) return false;
      // Only include debit lines (expenses), not credit lines (cash/AP)
      if (line.debitAmount <= 0) return false;
      return true;
    });

    // Apply optional filters
    if (filters) {
      if (filters.vendorName) {
        const vendorLower = filters.vendorName.toLowerCase();
        relevantLines = relevantLines.filter((line) =>
          (line.entityName || "").toLowerCase().includes(vendorLower)
        );
      }
      if (filters.category) {
        relevantLines = relevantLines.filter((line) => line.accountName === filters.category);
      }
      if (filters.transactionType) {
        // Filter by account code range
        if (filters.transactionType === "Expense") {
          relevantLines = relevantLines.filter((line) => {
            const code = line.accountCode;
            return code >= "5000" && code < "6000";
          });
        } else if (filters.transactionType === "Income") {
          relevantLines = relevantLines.filter((line) => {
            const code = line.accountCode;
            return code >= "4000" && code < "5000";
          });
        }
      }
    }

    // Sort by transaction date descending
    relevantLines.sort((a, b) => {
      const entryA = journalEntries.find((e) => e._id === a.journalEntryId);
      const entryB = journalEntries.find((e) => e._id === b.journalEntryId);
      return (entryB?.transactionDate || "").localeCompare(entryA?.transactionDate || "");
    });

    // Compute totals BEFORE applying limit
    const totalCount = relevantLines.length;
    const totalAmount = relevantLines.reduce(
      (sum, line) => sum + (line.debitAmount || line.creditAmount),
      0
    );

    // Apply limit
    const limit = Math.min(filters?.limit || 50, 50);
    const limited = relevantLines.slice(0, limit);

    // Build category ID → display name lookup from business custom categories
    const customCategories = (business.customExpenseCategories as Array<{
      id: string; category_name?: string; name?: string;
    }> | undefined) || [];
    const categoryLookup: Record<string, string> = {};
    for (const cat of customCategories) {
      if (cat.id) categoryLookup[cat.id] = cat.category_name || cat.name || cat.id;
    }

    // Map lines to response format
    const entries = limited.map((line) => {
      const entry = journalEntries.find((e) => e._id === line.journalEntryId);
      const code = line.accountCode;
      const isExpense = code >= "5000" && code < "6000";
      const isIncome = code >= "4000" && code < "5000";
      const transactionType = isExpense ? "Expense" : isIncome ? "Income" : "Other";

      return {
        id: line.journalEntryId,
        transactionDate: entry?.transactionDate || "",
        description: line.lineDescription || entry?.description || "",
        vendorName: line.entityName || "",
        originalAmount: line.debitAmount || line.creditAmount,
        homeCurrencyAmount: line.debitAmount || line.creditAmount,
        originalCurrency: business.homeCurrency || "MYR",
        homeCurrency: business.homeCurrency || "MYR",
        category: categoryLookup[line.accountName || ""] || line.accountName || "",
        transactionType,
        sourceDocumentType: entry?.sourceType || "",
      };
    });

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
      vendorName: v.optional(v.string()), // NEW: filter by vendor/merchant name
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

    // Query journal entries for business
    const allJournalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .filter((q) => q.eq(q.field("status"), "posted"))
      .collect();

    // Apply date filters
    const filters = args.filters;
    let journalEntries = allJournalEntries;
    if (filters?.startDate) {
      journalEntries = journalEntries.filter((e) => e.transactionDate >= filters.startDate!);
    }
    if (filters?.endDate) {
      journalEntries = journalEntries.filter((e) => e.transactionDate <= filters.endDate!);
    }

    const journalEntryIds = journalEntries.map((e) => e._id);

    // Build set of Clerk IDs for team members (for matching createdBy on JEs)
    const targetClerkIds = new Set<string>();
    for (const userId of targetUserIds) {
      const user = await resolveById(ctx.db, "users", userId);
      if (user?.clerkUserId) targetClerkIds.add(user.clerkUserId);
    }

    // Map: journalEntryId → employeeUserId for expense claim JEs created by team members
    const jeToEmployeeMap = new Map<string, string>();
    for (const je of journalEntries) {
      if (je.sourceType === "expense_claim" && je.createdBy) {
        if (targetUserIds.has(je.createdBy)) {
          jeToEmployeeMap.set(je._id.toString(), je.createdBy);
        } else if (targetClerkIds.has(je.createdBy)) {
          for (const uid of targetUserIds) {
            if (userNameMap[uid] && (await resolveById(ctx.db, "users", uid))?.clerkUserId === je.createdBy) {
              jeToEmployeeMap.set(je._id.toString(), uid);
              break;
            }
          }
        }
      }
    }

    // Get all lines for these entries
    const allLines = await ctx.db.query("journal_entry_lines").withIndex("by_business_account", (q) => q.eq("businessId", business._id)).collect();
    let relevantLines = allLines.filter((line) => {
      if (!journalEntryIds.includes(line.journalEntryId)) return false;
      // Match: expense JE created by team member (new) OR legacy entityType=employee
      const isTeamExpenseJE = jeToEmployeeMap.has(line.journalEntryId.toString());
      const isLegacyEntity = line.entityType === "employee" && line.entityId && targetUserIds.has(line.entityId);
      if (!isTeamExpenseJE && !isLegacyEntity) return false;
      // Only debit lines (expenses), not credit lines (cash/AP)
      if (line.debitAmount <= 0) return false;
      return true;
    });

    // Apply category filter if provided
    if (filters?.category) {
      relevantLines = relevantLines.filter((line) => line.accountName === filters.category);
    }

    // Apply vendor filter if provided (case-insensitive partial match)
    if (filters?.vendorName) {
      const vendorLower = filters.vendorName.toLowerCase();
      relevantLines = relevantLines.filter((line) =>
        (line.entityName || "").toLowerCase().includes(vendorLower) ||
        (line.lineDescription || "").toLowerCase().includes(vendorLower)
      );
    }

    // Compute summary
    const totalAmount = relevantLines.reduce(
      (sum, line) => sum + line.debitAmount,
      0
    );
    // Count unique employees (from both old entityId and new JE map)
    const allEmployeeIds = new Set<string>();
    for (const line of relevantLines) {
      const empId = line.entityId || jeToEmployeeMap.get(line.journalEntryId.toString());
      if (empId) allEmployeeIds.add(empId);
    }

    // Group by requested dimension
    const groupBy = filters?.groupBy || "employee";
    const groups: Record<string, { groupKey: string; groupId: string; totalAmount: number; recordCount: number }> = {};

    for (const line of relevantLines) {
      const amount = line.debitAmount;
      let key: string;
      let groupKey: string;

      if (groupBy === "employee") {
        // Use resolved employee ID from JE map or legacy entityId
        key = line.entityId || jeToEmployeeMap.get(line.journalEntryId.toString()) || "unknown";
        groupKey = userNameMap[key] || line.entityName || key;
      } else if (groupBy === "category") {
        key = line.accountName || "uncategorized";
        groupKey = key;
      } else {
        // vendor
        key = (line.entityName || "Unknown").toLowerCase();
        groupKey = line.entityName || "Unknown";
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
    for (const line of relevantLines) {
      const category = line.accountName || "uncategorized";
      const amount = line.debitAmount || line.creditAmount;
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
        employeesWithData: allEmployeeIds.size, // members who have transactions in this period
        recordCount: relevantLines.length,
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

    // Query journal entries
    let journalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .filter((q) => q.eq(q.field("status"), "posted"))
      .collect();

    // Apply date filters
    if (args.startDate) {
      journalEntries = journalEntries.filter((e) => e.transactionDate >= args.startDate!);
    }
    if (args.endDate) {
      journalEntries = journalEntries.filter((e) => e.transactionDate <= args.endDate!);
    }

    const journalEntryIds = journalEntries.map((e) => e._id);

    // Get all lines for these entries
    const allLines = await ctx.db.query("journal_entry_lines").withIndex("by_business_account", (q) => q.eq("businessId", business._id)).collect();
    let relevantLines = allLines.filter((line) => {
      if (!journalEntryIds.includes(line.journalEntryId)) return false;
      // Filter to target employee IDs
      if (line.entityType !== "employee") return false;
      if (!line.entityId || !targetUserIds.has(line.entityId)) return false;
      return true;
    });

    // Apply category filter if provided
    if (args.categoryFilter && args.categoryFilter.length > 0) {
      const categorySet = new Set(args.categoryFilter);
      relevantLines = relevantLines.filter((line) => categorySet.has(line.accountName || ""));
    }

    return relevantLines.map((line) => {
      const entry = journalEntries.find((e) => e._id === line.journalEntryId);
      const code = line.accountCode;
      const isExpense = code >= "5000" && code < "6000";
      const isIncome = code >= "4000" && code < "5000";
      const transactionType = isExpense ? "Expense" : isIncome ? "Income" : "Other";

      return {
        _id: line.journalEntryId,
        userId: line.entityId || "",
        userName: userNameMap[line.entityId || ""] || line.entityName || "",
        transactionDate: entry?.transactionDate || "",
        vendorName: line.entityName || "",
        category: line.accountName || "",
        categoryName: line.accountName || "",
        originalAmount: line.debitAmount || line.creditAmount,
        homeCurrencyAmount: line.debitAmount || line.creditAmount,
        currency: business.homeCurrency || "MYR",
        transactionType,
      };
    });
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

    // Query journal entries and lines
    const journalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .filter((q) => q.eq(q.field("status"), "posted"))
      .collect();

    const journalEntryIds = journalEntries.map((e) => e._id);

    // Get all lines for these entries
    const allLines = await ctx.db.query("journal_entry_lines").withIndex("by_business_account", (q) => q.eq("businessId", business._id)).collect();
    const relevantLines = allLines.filter((line) => journalEntryIds.includes(line.journalEntryId));

    // Return lines with only the fields needed for analysis
    // Map journal entry lines to what MCP tools expect
    return relevantLines.map((line) => {
      const entry = journalEntries.find((e) => e._id === line.journalEntryId);
      const code = line.accountCode;
      const isExpense = code >= "5000" && code < "6000";
      const isIncome = code >= "4000" && code < "5000";
      const transactionType = isExpense ? "Expense" : isIncome ? "Income" : "Other";

      return {
        _id: line.journalEntryId,
        businessId: business._id.toString(),
        transactionType,
        transactionDate: entry?.transactionDate || "",
        category: line.accountName,
        categoryName: line.accountName,
        vendorName: line.entityType === "vendor" ? line.entityName : undefined,
        vendorId: line.entityType === "vendor" ? line.entityId : undefined,
        description: line.lineDescription || entry?.description,
        originalAmount: line.debitAmount || line.creditAmount,
        homeCurrencyAmount: line.debitAmount || line.creditAmount,
        currency: business.homeCurrency || "MYR",
        deletedAt: undefined, // Journal entries don't have soft delete
      };
    });
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

// ============================================
// AR SUMMARY & AGING (Finance Admin/Owner only)
// ============================================

/**
 * AR Summary — aggregates sales invoice data by status, customer, and aging bucket.
 * Used by the AI agent for revenue and receivables analysis.
 */
export const getARSummary = query({
  args: {
    businessId: v.string(),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const emptyResult = { error: "", totalRevenue: 0, totalOutstanding: 0, totalOverdue: 0, currency: "MYR", invoiceCount: 0, statusBreakdown: [], agingBuckets: [], topCustomers: [] };

    // Auth: verify caller identity and business membership
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) { return { ...emptyResult, error: "Unauthorized" }; }
    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) { return { ...emptyResult, error: "User not found" }; }

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) { return { ...emptyResult, error: "Business not found" }; }

    const membership = await ctx.db.query("business_memberships")
      .withIndex("by_userId_businessId", (q) => q.eq("userId", user._id).eq("businessId", business._id))
      .first();
    if (!membership || membership.status !== "active") { return { ...emptyResult, error: "No active membership" }; }
    if (!["finance_admin", "owner"].includes(membership.role)) { return { ...emptyResult, error: "Insufficient permissions — finance admin or owner required" }; }

    const allInvoices = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter by date range if provided
    let invoices = allInvoices;
    if (args.startDate) {
      invoices = invoices.filter((inv) => (inv.invoiceDate || "") >= args.startDate!);
    }
    if (args.endDate) {
      invoices = invoices.filter((inv) => (inv.invoiceDate || "") <= args.endDate!);
    }

    const currency = business.homeCurrency || "MYR";
    const now = new Date();

    // Status breakdown
    const statusMap: Record<string, { count: number; totalAmount: number }> = {};
    let totalRevenue = 0;
    let totalOutstanding = 0;
    let totalOverdue = 0;

    // Aging buckets
    const aging: Record<string, { amount: number; count: number }> = {
      current: { amount: 0, count: 0 },
      "1-30": { amount: 0, count: 0 },
      "31-60": { amount: 0, count: 0 },
      "61-90": { amount: 0, count: 0 },
      "90+": { amount: 0, count: 0 },
    };

    // Customer breakdown
    const customerMap: Record<string, { outstanding: number; overdueDays: number }> = {};

    for (const inv of invoices) {
      const amount = inv.totalAmount || 0;
      const outstanding = amount - (inv.amountPaid || 0);
      const status = inv.status || "draft";

      totalRevenue += amount;

      // Status breakdown
      if (!statusMap[status]) statusMap[status] = { count: 0, totalAmount: 0 };
      statusMap[status].count++;
      statusMap[status].totalAmount += amount;

      // Outstanding and overdue
      if (["sent", "overdue", "partially_paid"].includes(status)) {
        totalOutstanding += outstanding;

        const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
        const daysOverdue = dueDate ? Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000)) : 0;

        if (status === "overdue" || (dueDate && dueDate < now)) {
          totalOverdue += outstanding;
        }

        // Aging bucket
        let bucket: string;
        if (daysOverdue <= 0) bucket = "current";
        else if (daysOverdue <= 30) bucket = "1-30";
        else if (daysOverdue <= 60) bucket = "31-60";
        else if (daysOverdue <= 90) bucket = "61-90";
        else bucket = "90+";

        aging[bucket].amount += outstanding;
        aging[bucket].count++;

        // Customer breakdown
        const snapshot = inv.customerSnapshot as { businessName?: string; name?: string } | undefined;
        const clientName = snapshot?.businessName || snapshot?.name || "Unknown Customer";
        if (!customerMap[clientName]) customerMap[clientName] = { outstanding: 0, overdueDays: 0 };
        customerMap[clientName].outstanding += outstanding;
        customerMap[clientName].overdueDays = Math.max(customerMap[clientName].overdueDays, daysOverdue);
      }
    }

    return {
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
      totalOverdue: parseFloat(totalOverdue.toFixed(2)),
      currency,
      invoiceCount: invoices.length,
      statusBreakdown: Object.entries(statusMap).map(([status, data]) => ({
        status,
        count: data.count,
        totalAmount: parseFloat(data.totalAmount.toFixed(2)),
      })),
      agingBuckets: Object.entries(aging).map(([bucket, data]) => ({
        bucket,
        amount: parseFloat(data.amount.toFixed(2)),
        count: data.count,
      })),
      topCustomers: Object.entries(customerMap)
        .map(([clientName, data]) => ({
          clientName,
          outstanding: parseFloat(data.outstanding.toFixed(2)),
          overdueDays: data.overdueDays,
        }))
        .sort((a, b) => b.outstanding - a.outstanding)
        .slice(0, 10),
    };
  },
});

// ============================================
// AP AGING & VENDOR BALANCES (Finance Admin/Owner only)
// ============================================

/**
 * AP Aging — aggregates purchase invoice data by vendor and aging bucket.
 * Used by the AI agent for payables and vendor balance analysis.
 */
export const getAPAging = query({
  args: {
    businessId: v.string(),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const emptyResult = { error: "", totalOutstanding: 0, totalOverdue: 0, currency: "MYR", agingBuckets: [], vendorBreakdown: [], upcomingDues: [] };

    // Auth: verify caller identity and business membership
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) { return { ...emptyResult, error: "Unauthorized" }; }
    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) { return { ...emptyResult, error: "User not found" }; }

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) { return { ...emptyResult, error: "Business not found" }; }

    const membership = await ctx.db.query("business_memberships")
      .withIndex("by_userId_businessId", (q) => q.eq("userId", user._id).eq("businessId", business._id))
      .first();
    if (!membership || membership.status !== "active") { return { ...emptyResult, error: "No active membership" }; }
    if (!["finance_admin", "owner"].includes(membership.role)) { return { ...emptyResult, error: "Insufficient permissions — finance admin or owner required" }; }

    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter to posted invoices (or at least completed) with payment data
    let invoices = allInvoices.filter((inv) => inv.accountingStatus === "posted" || inv.status === "completed");

    // Date filter using extractedData.invoice_date or creation time
    if (args.startDate) {
      invoices = invoices.filter((inv) => {
        const extracted = inv.extractedData as Record<string, unknown> | undefined;
        const invDate = (extracted?.invoice_date as string) ?? (extracted?.invoiceDate as string) ?? new Date(inv._creationTime).toISOString().split("T")[0];
        return invDate >= args.startDate!;
      });
    }
    if (args.endDate) {
      invoices = invoices.filter((inv) => {
        const extracted = inv.extractedData as Record<string, unknown> | undefined;
        const invDate = (extracted?.invoice_date as string) ?? (extracted?.invoiceDate as string) ?? new Date(inv._creationTime).toISOString().split("T")[0];
        return invDate <= args.endDate!;
      });
    }

    const currency = business.homeCurrency || "MYR";
    const now = new Date();

    let totalOutstanding = 0;
    let totalOverdue = 0;

    const aging: Record<string, { amount: number; count: number }> = {
      current: { amount: 0, count: 0 },
      "1-30": { amount: 0, count: 0 },
      "31-60": { amount: 0, count: 0 },
      "61-90": { amount: 0, count: 0 },
      "90+": { amount: 0, count: 0 },
    };

    const vendorMap: Record<string, { outstanding: number; oldestDueDate: string }> = {};
    const upcomingDues: Array<{ vendorName: string; invoiceNumber: string; amount: number; dueDate: string }> = [];

    for (const inv of invoices) {
      const extracted = inv.extractedData as Record<string, unknown> | undefined;
      const amount = (extracted?.total_amount as number) ?? (extracted?.totalAmount as number) ?? 0;
      const paidAmount = inv.paidAmount || 0;
      const outstanding = amount - paidAmount;

      if (outstanding <= 0) continue; // Fully paid

      totalOutstanding += outstanding;

      const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
      const daysOverdue = dueDate ? Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000)) : 0;

      if (dueDate && dueDate < now) {
        totalOverdue += outstanding;
      }

      // Aging bucket
      let bucket: string;
      if (!dueDate || dueDate >= now) bucket = "current";
      else if (daysOverdue <= 30) bucket = "1-30";
      else if (daysOverdue <= 60) bucket = "31-60";
      else if (daysOverdue <= 90) bucket = "61-90";
      else bucket = "90+";

      aging[bucket].amount += outstanding;
      aging[bucket].count++;

      // Vendor breakdown
      const vendorName = (extracted?.vendor_name as string) || (extracted?.vendorName as string) || "Unknown Vendor";
      if (!vendorMap[vendorName]) {
        vendorMap[vendorName] = { outstanding: 0, oldestDueDate: inv.dueDate || "" };
      }
      vendorMap[vendorName].outstanding += outstanding;
      if (inv.dueDate && inv.dueDate < vendorMap[vendorName].oldestDueDate) {
        vendorMap[vendorName].oldestDueDate = inv.dueDate;
      }

      // Upcoming dues (within next 14 days)
      const invoiceNumber = (extracted?.invoice_number as string) ?? (extracted?.invoiceNumber as string) ?? "—";
      if (dueDate && dueDate >= now) {
        const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / 86400000);
        if (daysUntilDue <= 14) {
          upcomingDues.push({
            vendorName,
            invoiceNumber,
            amount: parseFloat(outstanding.toFixed(2)),
            dueDate: inv.dueDate || "",
          });
        }
      }
    }

    return {
      totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
      totalOverdue: parseFloat(totalOverdue.toFixed(2)),
      currency,
      agingBuckets: Object.entries(aging).map(([bucket, data]) => ({
        bucket,
        amount: parseFloat(data.amount.toFixed(2)),
        count: data.count,
      })),
      vendorBreakdown: Object.entries(vendorMap)
        .map(([vendorName, data]) => ({
          vendorName,
          outstanding: parseFloat(data.outstanding.toFixed(2)),
          oldestDueDate: data.oldestDueDate,
        }))
        .sort((a, b) => b.outstanding - a.outstanding)
        .slice(0, 10),
      upcomingDues: upcomingDues.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 10),
    };
  },
});

// ============================================
// BUSINESS-WIDE TRANSACTIONS (Finance Admin/Owner only)
// ============================================

/**
 * Business-wide transaction query — returns transactions across ALL employees.
 * Unlike getTransactionsSafe (personal-scoped), this returns the entire business's
 * journal entry lines with employee attribution.
 */
export const getBusinessTransactions = query({
  args: {
    businessId: v.string(),
    query: v.optional(v.string()),
    category: v.optional(v.string()),
    transactionType: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const emptyResult = { error: "", transactions: [] as unknown[], totalAmount: 0, totalCount: 0, currency: "MYR" };

    // Auth: verify caller identity and business membership
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) { return { ...emptyResult, error: "Unauthorized" }; }
    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) { return { ...emptyResult, error: "User not found" }; }

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) { return { ...emptyResult, error: "Business not found" }; }

    const membership = await ctx.db.query("business_memberships")
      .withIndex("by_userId_businessId", (q) => q.eq("userId", user._id).eq("businessId", business._id))
      .first();
    if (!membership || membership.status !== "active") { return { ...emptyResult, error: "No active membership" }; }
    if (!["finance_admin", "owner"].includes(membership.role)) { return { ...emptyResult, error: "Insufficient permissions — finance admin or owner required" }; }

    const limit = Math.min(args.limit || 50, 100);
    const currency = business.homeCurrency || "MYR";

    // Query journal entries for business
    let journalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .filter((q) => q.eq(q.field("status"), "posted"))
      .collect();

    // Date filter
    if (args.startDate) {
      journalEntries = journalEntries.filter((e) => e.transactionDate >= args.startDate!);
    }
    if (args.endDate) {
      journalEntries = journalEntries.filter((e) => e.transactionDate <= args.endDate!);
    }

    const journalEntryIds = new Set(journalEntries.map((e) => e._id));
    const journalEntryMap = new Map(journalEntries.map((e) => [e._id.toString(), e]));

    // Get all lines
    const allLines = await ctx.db
      .query("journal_entry_lines")
      .withIndex("by_business_account", (q) => q.eq("businessId", business._id))
      .collect();

    let lines = allLines.filter((line) => journalEntryIds.has(line.journalEntryId));

    // Filter to expense/income lines (debit side for expenses, credit side for income)
    lines = lines.filter((line) => (line.debitAmount || 0) > 0 || (line.creditAmount || 0) > 0);

    // Category filter
    if (args.category) {
      const catLower = args.category.toLowerCase();
      lines = lines.filter((line) =>
        (line.accountName || "").toLowerCase().includes(catLower) ||
        (line.lineDescription || "").toLowerCase().includes(catLower)
      );
    }

    // Transaction type filter
    if (args.transactionType) {
      const typeMap: Record<string, string[]> = {
        "Income": ["4"],       // Revenue accounts 4xxx
        "Expense": ["5", "6"], // COGS 5xxx, Expenses 6xxx
        "Cost of Goods Sold": ["5"],
      };
      const prefixes = typeMap[args.transactionType] || [];
      if (prefixes.length > 0) {
        lines = lines.filter((line) =>
          prefixes.some((p) => (line.accountCode || "").startsWith(p))
        );
      }
    }

    // Query filter (vendor/description search)
    if (args.query) {
      const queryLower = args.query.toLowerCase();
      lines = lines.filter((line) =>
        (line.entityName || "").toLowerCase().includes(queryLower) ||
        (line.lineDescription || "").toLowerCase().includes(queryLower)
      );
    }

    const totalAmount = lines.reduce((sum, line) => sum + (line.debitAmount || line.creditAmount || 0), 0);
    const totalCount = lines.length;

    // Build user name map for attribution
    const userIds = new Set<string>();
    for (const line of lines) {
      if (line.entityType === "employee" && line.entityId) userIds.add(line.entityId);
    }
    const userNameMap: Record<string, string> = {};
    for (const uid of userIds) {
      const user = await resolveById(ctx.db, "users", uid);
      if (user) userNameMap[uid] = user.fullName || user.email || uid;
    }

    // Sort by date descending and limit
    const sortedLines = lines
      .map((line) => {
        const je = journalEntryMap.get(line.journalEntryId.toString());
        return {
          transactionDate: je?.transactionDate || "",
          vendorName: line.entityName || "Unknown",
          amount: line.debitAmount || line.creditAmount || 0,
          currency,
          category: line.accountName || "Uncategorized",
          description: line.lineDescription || je?.description || "",
          transactionType: (line.accountCode || "").startsWith("4") ? "Income"
            : (line.accountCode || "").startsWith("5") ? "Cost of Goods Sold"
            : "Expense",
          employeeName: (line.entityType === "employee" && line.entityId)
            ? (userNameMap[line.entityId] || line.entityId)
            : undefined,
        };
      })
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
      .slice(0, limit);

    return {
      transactions: sortedLines,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      totalCount,
      currency,
    };
  },
});
