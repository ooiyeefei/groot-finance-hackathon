/**
 * Action Center Jobs - Proactive analysis orchestration
 *
 * T028: Internal actions that run detection algorithms and create insights
 *
 * This module orchestrates the background analysis that powers the Action Center:
 * - Runs all detection algorithms in sequence
 * - Creates insights from detection results
 * - Called by cron jobs (every 4 hours for general, daily for deadlines)
 *
 * Detection algorithms are called from this orchestrator:
 * - detectAnomalies (>2σ from historical average)
 * - detectComplianceGaps (missing documents, regulations)
 * - trackDeadlines (upcoming filing/payment dates)
 * - forecastCashFlow (projected negative balance)
 * - detectDuplicates (potential duplicate transactions)
 */

import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

// ============================================
// INTERNAL QUERIES (for use in actions)
// ============================================

/**
 * Get all active businesses for proactive analysis
 */
export const getActiveBusinesses = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Get all businesses (businesses table doesn't have soft delete)
    const businesses = await ctx.db.query("businesses").collect();

    console.log(`[ActionCenterJobs] Found ${businesses.length} active businesses for analysis`);
    return businesses;
  },
});

/**
 * Get business members for insight creation
 */
export const getBusinessMembers = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Only active members (owners and finance admins) get insights
    const activeMembers = memberships.filter(
      (m) => m.status === "active" && (m.role === "owner" || m.role === "finance_admin")
    );

    return activeMembers;
  },
});

/**
 * Get recent transactions for a business (for anomaly detection)
 */
export const getRecentTransactions = internalQuery({
  args: {
    businessId: v.id("businesses"),
    dayRange: v.number(),
  },
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - args.dayRange * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(cutoffTime).toISOString().split("T")[0];

    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Filter to recent, non-deleted transactions
    const recentEntries = entries.filter(
      (e) => !e.deletedAt && e.transactionDate && e.transactionDate >= cutoffDate
    );

    return recentEntries;
  },
});

/**
 * Get historical transaction statistics (for baseline calculation)
 */
export const getTransactionStats = internalQuery({
  args: {
    businessId: v.id("businesses"),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Filter to non-deleted, expense transactions
    let expenses = entries.filter(
      (e) => !e.deletedAt && e.transactionType === "Expense"
    );

    if (args.category) {
      expenses = expenses.filter((e) => e.category === args.category);
    }

    if (expenses.length === 0) {
      return { count: 0, mean: 0, stdDev: 0, total: 0 };
    }

    // Calculate statistics
    const amounts = expenses.map((e) => Math.abs(e.homeCurrencyAmount || e.originalAmount || 0));
    const total = amounts.reduce((sum, a) => sum + a, 0);
    const mean = total / amounts.length;

    // Standard deviation
    const squaredDiffs = amounts.map((a) => Math.pow(a - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    return {
      count: amounts.length,
      mean,
      stdDev,
      total,
    };
  },
});

/**
 * Get uncategorized transaction count
 */
export const getUncategorizedCount = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const uncategorized = entries.filter(
      (e) => !e.deletedAt && (!e.category || e.category === "uncategorized")
    );

    return {
      uncategorizedCount: uncategorized.length,
      totalCount: entries.filter((e) => !e.deletedAt).length,
      transactions: uncategorized.slice(0, 10), // Return first 10 for metadata
    };
  },
});

// ============================================
// INTERNAL ACTIONS (for scheduled jobs)
// ============================================

/**
 * Main proactive analysis job - runs every 4 hours
 * Orchestrates all detection algorithms and creates insights
 */
export const runProactiveAnalysis = internalAction({
  args: {},
  handler: async (ctx): Promise<{ businessesAnalyzed: number; insightsCreated: number; durationMs: number }> => {
    console.log("[ActionCenterJobs] Starting proactive analysis run");
    const startTime = Date.now();

    // Get all active businesses
    const businesses = await ctx.runQuery(internal.functions.actionCenterJobs.getActiveBusinesses);

    let totalInsights = 0;

    for (const business of businesses) {
      console.log(`[ActionCenterJobs] Analyzing business: ${business._id}`);

      // Get business members for insight targeting
      const members = await ctx.runQuery(
        internal.functions.actionCenterJobs.getBusinessMembers,
        { businessId: business._id }
      );

      if (members.length === 0) {
        console.log(`[ActionCenterJobs] No active members for business ${business._id}, skipping`);
        continue;
      }

      // Run detection algorithms
      const insightsCreated = await ctx.runMutation(
        internal.functions.actionCenterJobs.runDetectionAlgorithms,
        {
          businessId: business._id,
          memberUserIds: members.map((m) => m.userId.toString()),
        }
      );

      totalInsights += insightsCreated;
    }

    const duration = Date.now() - startTime;
    console.log(
      `[ActionCenterJobs] Proactive analysis complete. ` +
        `Businesses: ${businesses.length}, Insights: ${totalInsights}, Duration: ${duration}ms`
    );

    return { businessesAnalyzed: businesses.length, insightsCreated: totalInsights, durationMs: duration };
  },
});

/**
 * Run all detection algorithms for a single business
 */
export const runDetectionAlgorithms = internalMutation({
  args: {
    businessId: v.id("businesses"),
    memberUserIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    let insightsCreated = 0;

    // 1. Anomaly Detection (>2σ from mean)
    const anomalyInsights = await runAnomalyDetection(ctx, args.businessId, args.memberUserIds);
    insightsCreated += anomalyInsights;

    // 2. Categorization Quality Detection
    const categorizationInsights = await runCategorizationDetection(ctx, args.businessId, args.memberUserIds);
    insightsCreated += categorizationInsights;

    // 3. Cash Flow Detection (simplified - full implementation in T032)
    const cashflowInsights = await runCashFlowDetection(ctx, args.businessId, args.memberUserIds);
    insightsCreated += cashflowInsights;

    // 4. Vendor Intelligence Detection (T095-T097)
    const vendorInsights = await runVendorIntelligenceDetection(ctx, args.businessId, args.memberUserIds);
    insightsCreated += vendorInsights;

    // 5. Critical Alerts Detection (T099-T104)
    const criticalInsights = await runCriticalAlertDetection(ctx, args.businessId, args.memberUserIds);
    insightsCreated += criticalInsights;

    console.log(`[ActionCenterJobs] Business ${args.businessId}: Created ${insightsCreated} insights`);
    return insightsCreated;
  },
});

// ============================================
// DETECTION ALGORITHMS (inline for T028)
// Will be extracted to separate files in T029-T033
// ============================================

/**
 * Anomaly Detection - Find transactions with amounts >2σ from category average
 */
async function runAnomalyDetection(
  ctx: any,
  businessId: any,
  memberUserIds: string[]
): Promise<number> {
  // Get recent transactions (last 90 days)
  const recentTxns = await ctx.db
    .query("accounting_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const recent = recentTxns.filter(
    (e: any) => !e.deletedAt && e.transactionDate && e.transactionDate >= ninetyDaysAgo
  );

  // Group by category to calculate stats
  const byCategory: Record<string, number[]> = {};
  for (const txn of recent) {
    const category = txn.category || "uncategorized";
    const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push(amount);
  }

  let insightsCreated = 0;

  // Check each category for anomalies
  for (const [category, amounts] of Object.entries(byCategory)) {
    if (amounts.length < 5) continue; // Need enough data points

    const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const squaredDiffs = amounts.map((a) => Math.pow(a - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) continue; // No variance

    // Find transactions >2σ from mean
    const threshold2Sigma = mean + 2 * stdDev;
    const threshold3Sigma = mean + 3 * stdDev;

    const recentCategoryTxns = recent.filter((t: any) => (t.category || "uncategorized") === category);
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    for (const txn of recentCategoryTxns) {
      if (txn.transactionDate < last7Days) continue; // Only alert on recent transactions

      const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);
      if (amount <= threshold2Sigma) continue;

      const deviation = ((amount - mean) / stdDev).toFixed(1);
      const priority = amount > threshold3Sigma ? "high" : "medium";

      // Create insight for each member
      for (const userId of memberUserIds) {
        await ctx.db.insert("actionCenterInsights", {
          userId,
          businessId: businessId.toString(),
          category: "anomaly",
          priority,
          status: "new",
          title: `Unusual ${category} expense detected`,
          description: `A ${category} expense of ${amount.toLocaleString()} is ${deviation}σ above your average of ${mean.toLocaleString()}.`,
          affectedEntities: [txn._id.toString()],
          recommendedAction: `Review this transaction to ensure it's legitimate and correctly categorized.`,
          detectedAt: Date.now(),
          metadata: {
            deviation: parseFloat(deviation),
            baseline: mean,
            category,
            transactionId: txn._id.toString(),
          },
        });
        insightsCreated++;
      }
    }
  }

  return insightsCreated;
}

/**
 * Categorization Detection - Alert on high percentage of uncategorized transactions
 */
async function runCategorizationDetection(
  ctx: any,
  businessId: any,
  memberUserIds: string[]
): Promise<number> {
  const entries = await ctx.db
    .query("accounting_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const activeEntries = entries.filter((e: any) => !e.deletedAt);
  const uncategorized = activeEntries.filter(
    (e: any) => !e.category || e.category === "uncategorized"
  );

  if (activeEntries.length < 10) return 0; // Not enough data

  const uncategorizedPct = (uncategorized.length / activeEntries.length) * 100;

  if (uncategorizedPct < 10) return 0; // Below threshold

  let insightsCreated = 0;
  const priority = uncategorizedPct > 30 ? "high" : uncategorizedPct > 20 ? "medium" : "low";

  for (const userId of memberUserIds) {
    await ctx.db.insert("actionCenterInsights", {
      userId,
      businessId: businessId.toString(),
      category: "categorization",
      priority,
      status: "new",
      title: `${uncategorized.length} transactions need categorization`,
      description: `${uncategorizedPct.toFixed(0)}% of your transactions are uncategorized. Proper categorization improves financial insights and reporting accuracy.`,
      affectedEntities: uncategorized.slice(0, 10).map((e: any) => e._id.toString()),
      recommendedAction: `Review and categorize your uncategorized transactions for better financial tracking.`,
      detectedAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // Expires in 7 days
      metadata: {
        uncategorizedCount: uncategorized.length,
        percentageAffected: uncategorizedPct,
      },
    });
    insightsCreated++;
  }

  return insightsCreated;
}

/**
 * Cash Flow Detection - Simple check for high expense ratio
 * Full implementation will use forecasting in T032
 */
async function runCashFlowDetection(
  ctx: any,
  businessId: any,
  memberUserIds: string[]
): Promise<number> {
  // Get transactions from last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const entries = await ctx.db
    .query("accounting_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const recent = entries.filter(
    (e: any) => !e.deletedAt && e.transactionDate && e.transactionDate >= thirtyDaysAgo
  );

  let totalIncome = 0;
  let totalExpenses = 0;

  for (const txn of recent) {
    const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);
    if (txn.transactionType === "Income") {
      totalIncome += amount;
    } else if (txn.transactionType === "Expense") {
      totalExpenses += amount;
    }
  }

  if (totalIncome === 0 && totalExpenses === 0) return 0;

  // Alert if expenses exceed income by significant margin
  const ratio = totalIncome > 0 ? totalExpenses / totalIncome : totalExpenses > 0 ? 999 : 0;

  if (ratio < 1.2) return 0; // Expenses less than 120% of income is fine

  let insightsCreated = 0;
  const priority = ratio > 2 ? "critical" : ratio > 1.5 ? "high" : "medium";

  for (const userId of memberUserIds) {
    await ctx.db.insert("actionCenterInsights", {
      userId,
      businessId: businessId.toString(),
      category: "cashflow",
      priority,
      status: "new",
      title: `Expenses exceeding income this month`,
      description: `Your expenses (${totalExpenses.toLocaleString()}) are ${((ratio - 1) * 100).toFixed(0)}% higher than income (${totalIncome.toLocaleString()}) over the last 30 days.`,
      affectedEntities: [],
      recommendedAction: `Review your recent expenses and consider cost-cutting measures or increasing revenue.`,
      detectedAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      metadata: {
        totalIncome,
        totalExpenses,
        ratio,
        periodDays: 30,
      },
    });
    insightsCreated++;
  }

  return insightsCreated;
}

/**
 * Vendor Intelligence Detection (T095-T097)
 * Analyzes vendor spending patterns, concentration risks, and vendor risk scores
 */
async function runVendorIntelligenceDetection(
  ctx: any,
  businessId: any,
  memberUserIds: string[]
): Promise<number> {
  let insightsCreated = 0;

  // --- VENDOR CONCENTRATION DETECTION ---
  const concentrationInsights = await runVendorConcentration(ctx, businessId, memberUserIds);
  insightsCreated += concentrationInsights;

  // --- VENDOR SPENDING CHANGES DETECTION ---
  const spendingChangeInsights = await runVendorSpendingChanges(ctx, businessId, memberUserIds);
  insightsCreated += spendingChangeInsights;

  // --- VENDOR RISK SCORING ---
  const riskInsights = await runVendorRiskAnalysis(ctx, businessId, memberUserIds);
  insightsCreated += riskInsights;

  return insightsCreated;
}

/**
 * Detect vendor concentration risk - single vendor >50% of category spend
 */
async function runVendorConcentration(
  ctx: any,
  businessId: any,
  memberUserIds: string[]
): Promise<number> {
  const threshold = 50;
  const lookbackDays = 90;
  const cutoffDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const entries = await ctx.db
    .query("accounting_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const expenses = entries.filter(
    (e: any) =>
      !e.deletedAt &&
      e.transactionType === "Expense" &&
      e.transactionDate &&
      e.transactionDate >= cutoffDate &&
      e.category
  );

  if (expenses.length < 10) return 0;

  // Group by category
  const byCategory: Record<string, { total: number; byVendor: Record<string, { name: string; amount: number }> }> = {};

  for (const txn of expenses) {
    const category = txn.category;
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

  let insightsCreated = 0;

  for (const [category, data] of Object.entries(byCategory)) {
    if (data.total < 1000) continue;

    for (const [vendorId, vendorData] of Object.entries(data.byVendor)) {
      const percentage = (vendorData.amount / data.total) * 100;
      if (percentage < threshold) continue;

      // Check for duplicate
      const existingInsights = await ctx.db
        .query("actionCenterInsights")
        .withIndex("by_category", (q: any) => q.eq("category", "optimization"))
        .collect();

      const isDuplicate = existingInsights.some(
        (i: any) =>
          i.metadata?.vendorId === vendorId &&
          i.metadata?.category === category &&
          i.metadata?.insightType === "vendor_concentration" &&
          i.detectedAt > Date.now() - 7 * 24 * 60 * 60 * 1000
      );

      if (isDuplicate) continue;

      const priority = percentage > 80 ? "high" : percentage > 65 ? "medium" : "low";

      for (const userId of memberUserIds) {
        await ctx.db.insert("actionCenterInsights", {
          userId,
          businessId: businessId.toString(),
          category: "optimization",
          priority,
          status: "new",
          title: `Vendor concentration risk: ${vendorData.name}`,
          description: `${vendorData.name} accounts for ${percentage.toFixed(0)}% of your ${category} spending. Consider diversifying suppliers.`,
          affectedEntities: [vendorId],
          recommendedAction: `Review your ${category} vendors and consider adding alternative suppliers.`,
          detectedAt: Date.now(),
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          metadata: {
            vendorId,
            vendorName: vendorData.name,
            category,
            concentrationPercentage: percentage,
            totalCategorySpend: data.total,
            insightType: "vendor_concentration",
          },
        });
        insightsCreated++;
      }
    }
  }

  return insightsCreated;
}

/**
 * Detect significant vendor spending changes (>50% change from previous period)
 */
async function runVendorSpendingChanges(
  ctx: any,
  businessId: any,
  memberUserIds: string[]
): Promise<number> {
  const changeThreshold = 50;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const entries = await ctx.db
    .query("accounting_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const expenses = entries.filter(
    (e: any) =>
      !e.deletedAt &&
      e.transactionType === "Expense" &&
      e.transactionDate &&
      e.transactionDate >= ninetyDaysAgo &&
      (e.vendorId || e.vendorName)
  );

  const vendorPeriods: Record<string, { name: string; recent: number; historical: number; historicalCount: number }> = {};

  for (const txn of expenses) {
    const vendorKey = txn.vendorId?.toString() || txn.vendorName || "unknown";
    const vendorName = txn.vendorName || "Unknown Vendor";
    const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);
    const date = txn.transactionDate || "";

    if (!vendorPeriods[vendorKey]) {
      vendorPeriods[vendorKey] = { name: vendorName, recent: 0, historical: 0, historicalCount: 0 };
    }

    if (date >= thirtyDaysAgo) {
      vendorPeriods[vendorKey].recent += amount;
    } else if (date >= sixtyDaysAgo) {
      vendorPeriods[vendorKey].historical += amount;
      vendorPeriods[vendorKey].historicalCount++;
    }
  }

  let insightsCreated = 0;

  for (const [vendorId, data] of Object.entries(vendorPeriods)) {
    if (data.historicalCount < 2 || data.historical < 100) continue;

    const changePercent = ((data.recent - data.historical) / data.historical) * 100;
    const absoluteChange = Math.abs(changePercent);

    if (absoluteChange < changeThreshold) continue;

    const existingInsights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_category", (q: any) => q.eq("category", "optimization"))
      .collect();

    const isDuplicate = existingInsights.some(
      (i: any) =>
        i.metadata?.vendorId === vendorId &&
        i.metadata?.insightType === "vendor_spending_change" &&
        i.detectedAt > Date.now() - 7 * 24 * 60 * 60 * 1000
    );

    if (isDuplicate) continue;

    const isIncrease = changePercent > 0;
    const priority = absoluteChange > 100 ? "high" : absoluteChange > 75 ? "medium" : "low";

    for (const userId of memberUserIds) {
      await ctx.db.insert("actionCenterInsights", {
        userId,
        businessId: businessId.toString(),
        category: "optimization",
        priority,
        status: "new",
        title: `${isIncrease ? "Increased" : "Decreased"} spending with ${data.name}`,
        description: `Spending with ${data.name} has ${isIncrease ? "increased" : "decreased"} by ${absoluteChange.toFixed(0)}%.`,
        affectedEntities: [vendorId],
        recommendedAction: isIncrease
          ? `Review recent transactions with ${data.name}.`
          : `Investigate why spending with ${data.name} has dropped.`,
        detectedAt: Date.now(),
        expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
        metadata: {
          vendorId,
          vendorName: data.name,
          recentSpend: data.recent,
          historicalSpend: data.historical,
          changePercent,
          insightType: "vendor_spending_change",
        },
      });
      insightsCreated++;
    }
  }

  return insightsCreated;
}

/**
 * Analyze vendor risk scores based on missing info, irregularity, inactivity
 */
async function runVendorRiskAnalysis(
  ctx: any,
  businessId: any,
  memberUserIds: string[]
): Promise<number> {
  const riskThreshold = 70;

  const vendors = await ctx.db
    .query("vendors")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const entries = await ctx.db
    .query("accounting_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const recentExpenses = entries.filter(
    (e: any) =>
      !e.deletedAt &&
      e.transactionType === "Expense" &&
      e.transactionDate &&
      e.transactionDate >= ninetyDaysAgo
  );

  let insightsCreated = 0;

  for (const vendor of vendors) {
    if (vendor.status === "inactive") continue;

    const vendorTxns = recentExpenses.filter(
      (e: any) => e.vendorId?.toString() === vendor._id.toString()
    );

    let riskScore = 0;
    const factors: string[] = [];

    // Missing contact info
    if (!vendor.email && !vendor.phone) {
      riskScore += 15;
      factors.push("No contact info");
    }

    // No tax ID
    if (!vendor.taxId) {
      riskScore += 10;
      factors.push("Missing tax ID");
    }

    // Prospective status
    if (vendor.status === "prospective") {
      riskScore += 15;
      factors.push("Unverified vendor");
    }

    // Transaction irregularity
    if (vendorTxns.length >= 3) {
      const amounts = vendorTxns.map((t: any) => Math.abs(t.homeCurrencyAmount || t.originalAmount || 0));
      const mean = amounts.reduce((sum: number, a: number) => sum + a, 0) / amounts.length;
      const variance = amounts.reduce((sum: number, a: number) => sum + Math.pow(a - mean, 2), 0) / amounts.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

      if (cv > 1.5) {
        riskScore += 30;
        factors.push("Highly irregular amounts");
      } else if (cv > 1) {
        riskScore += 20;
        factors.push("Irregular amounts");
      }
    }

    // Inactivity
    if (vendorTxns.length === 0) {
      const daysSinceUpdate = vendor.updatedAt
        ? (Date.now() - vendor.updatedAt) / (24 * 60 * 60 * 1000)
        : 365;

      if (daysSinceUpdate > 180) {
        riskScore += 20;
        factors.push("No transactions in 6+ months");
      }
    }

    if (riskScore < riskThreshold) continue;

    const existingInsights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_category", (q: any) => q.eq("category", "compliance"))
      .collect();

    const isDuplicate = existingInsights.some(
      (i: any) =>
        i.metadata?.vendorId === vendor._id.toString() &&
        i.metadata?.insightType === "vendor_risk" &&
        i.detectedAt > Date.now() - 14 * 24 * 60 * 60 * 1000
    );

    if (isDuplicate) continue;

    const priority = riskScore > 85 ? "high" : riskScore > 75 ? "medium" : "low";

    for (const userId of memberUserIds) {
      await ctx.db.insert("actionCenterInsights", {
        userId,
        businessId: businessId.toString(),
        category: "compliance",
        priority,
        status: "new",
        title: `High-risk vendor: ${vendor.name}`,
        description: `${vendor.name} has a risk score of ${riskScore}/100. Issues: ${factors.join(", ")}.`,
        affectedEntities: [vendor._id.toString()],
        recommendedAction: `Review and update vendor information for ${vendor.name}.`,
        detectedAt: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        metadata: {
          vendorId: vendor._id.toString(),
          vendorName: vendor.name,
          riskScore,
          riskFactors: factors,
          insightType: "vendor_risk",
        },
      });
      insightsCreated++;
    }
  }

  return insightsCreated;
}

/**
 * Critical Alert Detection (T099-T104)
 * Checks for time-sensitive issues requiring immediate attention
 */
async function runCriticalAlertDetection(
  ctx: any,
  businessId: any,
  memberUserIds: string[]
): Promise<number> {
  let insightsCreated = 0;

  // --- DEADLINE PROXIMITY ALERTS ---
  const deadlineAlerts = await runDeadlineProximityAlerts(ctx, businessId, memberUserIds);
  insightsCreated += deadlineAlerts;

  // --- CASH BALANCE ALERTS ---
  const cashAlerts = await runCashBalanceAlerts(ctx, businessId, memberUserIds);
  insightsCreated += cashAlerts;

  // --- DUPLICATE TRANSACTION ALERTS ---
  const duplicateAlerts = await runDuplicateTransactionAlerts(ctx, businessId, memberUserIds);
  insightsCreated += duplicateAlerts;

  return insightsCreated;
}

/**
 * Check for payment deadlines within warning window (14 days)
 */
async function runDeadlineProximityAlerts(
  ctx: any,
  businessId: any,
  memberUserIds: string[]
): Promise<number> {
  const warningDays = 14;
  const warningDate = new Date(Date.now() + warningDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  const entries = await ctx.db
    .query("accounting_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const upcomingDue = entries.filter((e: any) => {
    if (e.deletedAt) return false;
    if (!e.dueDate) return false;
    if (e.status === "paid") return false;
    return e.dueDate >= today && e.dueDate <= warningDate;
  });

  let insightsCreated = 0;

  for (const entry of upcomingDue) {
    const dueDate = new Date(entry.dueDate);
    const daysUntilDue = Math.ceil(
      (dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );

    // Check for duplicate
    const existingAlerts = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_category", (q: any) => q.eq("category", "deadline"))
      .collect();

    const isDuplicate = existingAlerts.some(
      (i: any) =>
        i.metadata?.transactionId === entry._id.toString() &&
        i.metadata?.insightType === "payment_due" &&
        i.detectedAt > Date.now() - 3 * 24 * 60 * 60 * 1000
    );

    if (isDuplicate) continue;

    const amount = Math.abs(entry.homeCurrencyAmount || entry.originalAmount || 0);
    const priority =
      daysUntilDue <= 3 ? "critical" : daysUntilDue <= 7 ? "high" : "medium";

    for (const userId of memberUserIds) {
      await ctx.db.insert("actionCenterInsights", {
        userId,
        businessId: businessId.toString(),
        category: "deadline",
        priority,
        status: "new",
        title: `Payment due in ${daysUntilDue} days: ${amount.toLocaleString()}`,
        description: `${entry.description || "Invoice"} of ${amount.toLocaleString()} is due on ${entry.dueDate}.`,
        affectedEntities: [entry._id.toString()],
        recommendedAction:
          daysUntilDue <= 3
            ? `Urgent: Process this payment immediately.`
            : `Schedule this payment before ${entry.dueDate}.`,
        detectedAt: Date.now(),
        expiresAt: dueDate.getTime(),
        metadata: {
          transactionId: entry._id.toString(),
          dueDate: entry.dueDate,
          daysUntilDue,
          amount,
          vendorName: entry.vendorName,
          insightType: "payment_due",
        },
      });
      insightsCreated++;
    }
  }

  return insightsCreated;
}

/**
 * Check cash runway based on burn rate
 */
async function runCashBalanceAlerts(
  ctx: any,
  businessId: any,
  memberUserIds: string[]
): Promise<number> {
  const warningDays = 30;
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const entries = await ctx.db
    .query("accounting_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const recent = entries.filter(
    (e: any) =>
      !e.deletedAt && e.transactionDate && e.transactionDate >= ninetyDaysAgo
  );

  let totalIncome = 0;
  let totalExpenses = 0;
  let cashBalance = 0;

  for (const txn of recent) {
    const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);
    if (txn.transactionType === "Income") {
      totalIncome += amount;
      cashBalance += amount;
    } else if (txn.transactionType === "Expense") {
      totalExpenses += amount;
      cashBalance -= amount;
    }
  }

  const monthlyBurnRate = totalExpenses / 3;
  if (monthlyBurnRate <= 0) return 0;

  const dailyBurnRate = monthlyBurnRate / 30;
  const runwayDays = dailyBurnRate > 0 ? Math.floor(cashBalance / dailyBurnRate) : 999;

  if (runwayDays >= warningDays) return 0;

  // Check for duplicate
  const existingAlerts = await ctx.db
    .query("actionCenterInsights")
    .withIndex("by_category", (q: any) => q.eq("category", "cashflow"))
    .collect();

  const isDuplicate = existingAlerts.some(
    (i: any) =>
      i.metadata?.insightType === "low_runway" &&
      i.businessId === businessId.toString() &&
      i.detectedAt > Date.now() - 7 * 24 * 60 * 60 * 1000
  );

  if (isDuplicate) return 0;

  let insightsCreated = 0;
  const priority =
    runwayDays <= 7 ? "critical" : runwayDays <= 14 ? "high" : "medium";

  for (const userId of memberUserIds) {
    await ctx.db.insert("actionCenterInsights", {
      userId,
      businessId: businessId.toString(),
      category: "cashflow",
      priority,
      status: "new",
      title: `Low cash runway: ${runwayDays} days`,
      description: `Based on your burn rate of ${monthlyBurnRate.toLocaleString()}/month, estimated runway is ${runwayDays} days.`,
      affectedEntities: [],
      recommendedAction:
        runwayDays <= 7
          ? `Critical: Review expenses and prioritize collections immediately.`
          : `Review cash flow and consider reducing non-essential expenses.`,
      detectedAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      metadata: {
        runwayDays,
        monthlyBurnRate,
        estimatedBalance: cashBalance,
        insightType: "low_runway",
      },
    });
    insightsCreated++;
  }

  return insightsCreated;
}

/**
 * Check for potential duplicate transactions
 */
async function runDuplicateTransactionAlerts(
  ctx: any,
  businessId: any,
  memberUserIds: string[]
): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const entries = await ctx.db
    .query("accounting_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const recent = entries.filter(
    (e: any) =>
      !e.deletedAt && e.transactionDate && e.transactionDate >= thirtyDaysAgo
  );

  // Group by amount + vendor + date
  const grouped: Record<string, any[]> = {};

  for (const txn of recent) {
    const key = `${txn.vendorName || "unknown"}_${txn.originalAmount}_${txn.transactionDate}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(txn);
  }

  const potentialDuplicates = Object.entries(grouped).filter(
    ([, txns]) => txns.length > 1
  );

  let insightsCreated = 0;

  for (const [, txns] of potentialDuplicates) {
    const firstTxn = txns[0];
    const amount = Math.abs(
      firstTxn.homeCurrencyAmount || firstTxn.originalAmount || 0
    );

    if (amount < 1000) continue;

    const existingAlerts = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_category", (q: any) => q.eq("category", "anomaly"))
      .collect();

    const txnIds = txns.map((t: any) => t._id.toString()).sort().join(",");
    const isDuplicate = existingAlerts.some(
      (i: any) =>
        i.metadata?.duplicateGroupIds === txnIds &&
        i.detectedAt > Date.now() - 7 * 24 * 60 * 60 * 1000
    );

    if (isDuplicate) continue;

    const priority = amount >= 10000 ? "high" : "medium";

    for (const userId of memberUserIds) {
      await ctx.db.insert("actionCenterInsights", {
        userId,
        businessId: businessId.toString(),
        category: "anomaly",
        priority,
        status: "new",
        title: `Potential duplicate: ${txns.length} transactions of ${amount.toLocaleString()}`,
        description: `Found ${txns.length} transactions with same amount and date. These may be duplicates.`,
        affectedEntities: txns.map((t: any) => t._id.toString()),
        recommendedAction: `Review these transactions to confirm they are not duplicates.`,
        detectedAt: Date.now(),
        expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
        metadata: {
          duplicateGroupIds: txnIds,
          amount,
          vendorName: firstTxn.vendorName,
          transactionDate: firstTxn.transactionDate,
          count: txns.length,
          insightType: "potential_duplicate",
        },
      });
      insightsCreated++;
    }
  }

  return insightsCreated;
}

/**
 * Deadline tracking job - runs daily at 6 AM
 * Will be fully implemented in T031
 */
export const runDeadlineTracking = internalAction({
  args: {},
  handler: async (ctx): Promise<{ businessesChecked: number; deadlinesFound: number }> => {
    console.log("[ActionCenterJobs] Starting deadline tracking run");

    // Get all active businesses
    const businesses = await ctx.runQuery(internal.functions.actionCenterJobs.getActiveBusinesses);

    // For now, just log - T031 will implement full deadline detection
    console.log(`[ActionCenterJobs] Would check deadlines for ${businesses.length} businesses`);

    return { businessesChecked: businesses.length, deadlinesFound: 0 };
  },
});

// ============================================
// TEST UTILITIES
// ============================================

/**
 * Test action for running proactive analysis on a specific business
 * Use for manual testing: npx convex run functions/actionCenterJobs:testRunAnalysis '{"businessId":"..."}'
 */
export const testRunAnalysis = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<{ insightsCreated: number }> => {
    console.log(`[TestAnalysis] Running analysis for business: ${args.businessId}`);

    // Get business members
    const members = await ctx.runQuery(internal.functions.actionCenterJobs.getBusinessMembers, {
      businessId: args.businessId,
    });

    const memberUserIds = members.map((m: any) => m.userId.toString());

    if (memberUserIds.length === 0) {
      console.log("[TestAnalysis] No members found, using businessId as fallback");
      memberUserIds.push(args.businessId.toString());
    }

    console.log(`[TestAnalysis] Found ${memberUserIds.length} members`);

    let totalInsights = 0;

    // Run all detection algorithms
    const anomalyInsights = await ctx.runMutation(internal.functions.actionCenterJobs.runDetectionForBusiness, {
      businessId: args.businessId,
      memberUserIds,
      detectionType: "anomaly",
    });
    totalInsights += anomalyInsights;

    const categorizationInsights = await ctx.runMutation(internal.functions.actionCenterJobs.runDetectionForBusiness, {
      businessId: args.businessId,
      memberUserIds,
      detectionType: "categorization",
    });
    totalInsights += categorizationInsights;

    const cashflowInsights = await ctx.runMutation(internal.functions.actionCenterJobs.runDetectionForBusiness, {
      businessId: args.businessId,
      memberUserIds,
      detectionType: "cashflow",
    });
    totalInsights += cashflowInsights;

    const vendorInsights = await ctx.runMutation(internal.functions.actionCenterJobs.runDetectionForBusiness, {
      businessId: args.businessId,
      memberUserIds,
      detectionType: "vendor",
    });
    totalInsights += vendorInsights;

    const criticalInsights = await ctx.runMutation(internal.functions.actionCenterJobs.runDetectionForBusiness, {
      businessId: args.businessId,
      memberUserIds,
      detectionType: "critical",
    });
    totalInsights += criticalInsights;

    console.log(`[TestAnalysis] Created ${totalInsights} total insights`);

    return { insightsCreated: totalInsights };
  },
});

/**
 * Internal mutation to run a specific detection type
 * Needed because actions can't directly access ctx.db
 */
export const runDetectionForBusiness = internalMutation({
  args: {
    businessId: v.id("businesses"),
    memberUserIds: v.array(v.string()),
    detectionType: v.union(
      v.literal("anomaly"),
      v.literal("categorization"),
      v.literal("cashflow"),
      v.literal("vendor"),
      v.literal("critical")
    ),
  },
  handler: async (ctx, args): Promise<number> => {
    const { businessId, memberUserIds, detectionType } = args;

    switch (detectionType) {
      case "anomaly":
        return await runAnomalyDetection(ctx, businessId, memberUserIds);
      case "categorization":
        return await runCategorizationDetection(ctx, businessId, memberUserIds);
      case "cashflow":
        return await runCashFlowDetection(ctx, businessId, memberUserIds);
      case "vendor":
        return await runVendorIntelligenceDetection(ctx, businessId, memberUserIds);
      case "critical":
        return await runCriticalAlertDetection(ctx, businessId, memberUserIds);
      default:
        return 0;
    }
  },
});
