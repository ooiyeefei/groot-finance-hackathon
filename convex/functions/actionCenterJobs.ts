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
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { callLLMJson } from "../lib/llm";
import { callMCPToolsBatch } from "../lib/mcpClient";

// ============================================
// DETECTION CONSTANTS
// ============================================

/** Dedup window: skip creating insight if same type exists within this period */
const DEDUP_WINDOW_MS = 90 * 24 * 60 * 60 * 1000; // 90 days (3 months)

/** Dedup window for deadline-specific alerts (shorter — re-alert as deadlines approach) */
const DEADLINE_DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// IFRS category code → human-readable display name
const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  travel_expenses: "Travel Expenses",
  professional_services: "Professional Services",
  marketing_advertising: "Marketing & Advertising",
  utilities: "Utilities",
  office_supplies: "Office Supplies",
  maintenance_repairs: "Maintenance & Repairs",
  training_development: "Training & Development",
  entertainment_meals: "Entertainment & Meals",
  vehicle_transport: "Vehicle & Transport",
  miscellaneous_expenses: "Miscellaneous",
  other_operating: "Other Operating",
  uncategorized: "Uncategorized",
};

// ============================================
// HELPER UTILITIES
// ============================================

/**
 * Resolve a category code to a human-readable display name.
 *
 * Priority:
 * 1. IFRS standard code lookup (e.g., "travel_expenses" → "Travel Expenses")
 * 2. Business custom category lookup (e.g., "other_9gsnmr" → "Others")
 * 3. Fallback: strip random suffix, capitalize (e.g., "other_9gsnmr" → "Other")
 */
function resolveCategoryName(
  categoryCode: string,
  businessCustomCategories?: Array<{ id: string; category_name: string }>,
): string {
  if (!categoryCode) return "Uncategorized";

  // 1. Check IFRS standard codes
  if (CATEGORY_DISPLAY_NAMES[categoryCode]) {
    return CATEGORY_DISPLAY_NAMES[categoryCode];
  }

  // 2. Check business custom categories
  if (businessCustomCategories) {
    const custom = businessCustomCategories.find((c) => c.id === categoryCode);
    if (custom?.category_name) {
      return custom.category_name;
    }
  }

  // 3. Fallback: strip _[random] suffix, capitalize
  const cleaned = categoryCode.replace(/_[a-z0-9]{4,}$/i, "");
  if (cleaned && cleaned !== categoryCode) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).replace(/_/g, " ");
  }

  // Last resort: capitalize and replace underscores
  return categoryCode.charAt(0).toUpperCase() + categoryCode.slice(1).replace(/_/g, " ");
}

/**
 * Classify a journal entry line's domain based on entityType and accountCode.
 * - "ap_vendor": entityType is "vendor" — AP/supplier domain
 * - "cogs": accountCode starts with "5" and has vendor entity — Cost of Goods Sold
 * - "expense_claim": entityType is "employee" or no entity — employee expense claim domain
 */
function classifyLineDomain(line: any): "ap_vendor" | "cogs" | "expense_claim" {
  if (line.entityType === "vendor") return "ap_vendor";
  if (line.entityType === "employee") return "expense_claim";
  return "expense_claim";
}

/**
 * Compute materiality-aware priority for anomalies.
 * Considers both σ-deviation AND absolute amount relative to business size.
 *
 * Returns null to suppress the anomaly entirely, or a priority string.
 */
function computeMaterialityPriority(
  amount: number,
  monthlyExpenses: number,
  sigmaDeviation: number,
): "critical" | "high" | "medium" | "low" | null {
  if (monthlyExpenses <= 0) {
    // Can't compute materiality — fall back to σ-only
    return sigmaDeviation > 3 ? "high" : "medium";
  }

  const materialityPct = amount / monthlyExpenses;

  // Below 0.1% of monthly expenses → suppress entirely
  if (materialityPct < 0.001) return null;

  // Below 1% → cap at "low" regardless of σ
  if (materialityPct < 0.01) return "low";

  // Above 1%: use σ-based logic
  if (sigmaDeviation > 3 && materialityPct >= 0.05) return "high";
  if (sigmaDeviation > 3) return "medium";
  return "medium";
}

/**
 * Compute Jaccard similarity between two titles for semantic dedup.
 * Tokenizes, removes stopwords, and computes |intersection| / |union|.
 */
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
 * Get structured business summary for LLM prompts (Layer 2)
 *
 * Returns a compact overview of the business's financial state:
 * income/expenses, top vendors, category breakdown, AR/AP status,
 * and existing insights. Used by enrichInsight and runAIDiscovery.
 */
export const getBusinessSummary = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Business info
    const business = await ctx.db.get(args.businessId);

    // Journal entries (last 90 days)
    const journalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
      .collect();

    const recentEntries = journalEntries.filter(
      (e: any) => e.status === "posted" && e.transactionDate && e.transactionDate >= ninetyDaysAgo
    );

    // Load all journal entry lines for recent entries
    const allLines: any[] = [];
    for (const entry of recentEntries) {
      const lines = await ctx.db
        .query("journal_entry_lines")
        .withIndex("by_journal_entry", (q: any) => q.eq("journalEntryId", entry._id))
        .collect();
      allLines.push(...lines);
    }

    let totalIncome = 0;
    let totalExpenses = 0;
    const supplierSpend: Record<string, { name: string; amount: number; count: number }> = {};
    const merchantSpend: Record<string, { name: string; amount: number; count: number }> = {};
    const categorySpend: Record<string, number> = {};
    let pendingPayables = 0;
    let overduePayables = 0;

    for (const line of allLines) {
      // Income: account codes 4000-4999 (credit amounts)
      if (line.accountCode >= "4000" && line.accountCode < "5000" && line.creditAmount > 0) {
        totalIncome += line.creditAmount;
      }
      // Expenses: account codes 5000-5999 (debit amounts)
      if (line.accountCode >= "5000" && line.accountCode < "6000" && line.debitAmount > 0) {
        totalExpenses += line.debitAmount;
        const catName = line.accountName || "Uncategorized";
        categorySpend[catName] = (categorySpend[catName] || 0) + line.debitAmount;

        // Separate AP suppliers from expense-claim merchants
        const domain = classifyLineDomain(line);
        const payeeName = line.entityName || "Unknown";
        if (domain === "ap_vendor" || domain === "cogs") {
          if (!supplierSpend[payeeName]) supplierSpend[payeeName] = { name: payeeName, amount: 0, count: 0 };
          supplierSpend[payeeName].amount += line.debitAmount;
          supplierSpend[payeeName].count++;
        } else {
          if (!merchantSpend[payeeName]) merchantSpend[payeeName] = { name: payeeName, amount: 0, count: 0 };
          merchantSpend[payeeName].amount += line.debitAmount;
          merchantSpend[payeeName].count++;
        }
      }
    }

    // AP pending/overdue from invoices table
    const invoices = await ctx.db
      .query("invoices")
      .filter((q: any) =>
        q.and(
          q.eq(q.field("businessId"), args.businessId),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .collect();

    for (const inv of invoices) {
      const amount = (inv as any).extractedData?.total_amount || 0;
      const paid = (inv as any).paidAmount || 0;
      const remaining = amount - paid;
      if ((inv as any).paymentStatus === "unpaid" || (inv as any).paymentStatus === "partial") {
        pendingPayables += remaining;
      }
      if ((inv as any).dueDate && (inv as any).dueDate < ninetyDaysAgo && (inv as any).paymentStatus !== "paid") {
        overduePayables += remaining;
      }
    }

    // Top suppliers (AP) by spend
    const topSuppliers = Object.values(supplierSpend)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((v) => `${v.name}: ${v.amount.toLocaleString()} (${v.count} txns)`);

    // Top merchants (expense claims) by spend
    const topMerchants = Object.values(merchantSpend)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((v) => `${v.name}: ${v.amount.toLocaleString()} (${v.count} txns)`);

    // Category breakdown (already resolved to display names)
    const categories = Object.entries(categorySpend)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat, amt]) => `${cat}: ${amt.toLocaleString()}`);

    // Sales invoices status
    const salesInvoices = await ctx.db
      .query("sales_invoices")
      .filter((q: any) =>
        q.and(
          q.eq(q.field("businessId"), args.businessId),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .collect();

    const arOutstanding = salesInvoices
      .filter((i: any) => ["sent", "partially_paid", "overdue"].includes(i.status))
      .reduce((sum: number, i: any) => sum + (i.balanceDue ?? i.totalAmount), 0);
    const arOverdueCount = salesInvoices.filter((i: any) => i.status === "overdue").length;

    // Expense claims
    const expenseClaims = await ctx.db
      .query("expense_claims")
      .filter((q: any) =>
        q.and(
          q.eq(q.field("businessId"), args.businessId),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .collect();

    const recentClaims = expenseClaims.filter(
      (c: any) => c.transactionDate && c.transactionDate >= ninetyDaysAgo
    );

    // Existing insights
    const insights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_business_priority", (q: any) => q.eq("businessId", args.businessId.toString()))
      .collect();

    const activeInsights = insights
      .filter((i: any) => i.status === "new" || i.status === "reviewed")
      .map((i: any) => i.title);

    return {
      businessName: business?.name || "Unknown",
      country: (business as any)?.countryCode || "MY",
      homeCurrency: business?.homeCurrency || "MYR",
      totalIncome: Math.round(totalIncome),
      totalExpenses: Math.round(totalExpenses),
      transactionCount: recentEntries.length,
      topVendors: topSuppliers, // backward compat alias
      topSuppliers,
      topMerchants,
      categories,
      arOutstanding: Math.round(arOutstanding),
      arOverdueCount,
      apPending: Math.round(pendingPayables),
      apOverdue: Math.round(overduePayables),
      claimCount: recentClaims.length,
      existingInsightTitles: activeInsights,
    };
  },
});

/**
 * Get recent transactions for a business (for anomaly detection)
 * Returns journal entries with their lines for the given date range.
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
      .query("journal_entries")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
      .collect();

    // Filter to recent, posted entries
    const recentEntries = entries.filter(
      (e: any) => e.status === "posted" && e.transactionDate && e.transactionDate >= cutoffDate
    );

    return recentEntries;
  },
});

/**
 * Get historical transaction statistics (for baseline calculation)
 * Queries journal_entry_lines for expense accounts (5000-5999).
 */
export const getTransactionStats = internalQuery({
  args: {
    businessId: v.id("businesses"),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Query expense lines (account codes 5000-5999)
    const lines = await ctx.db
      .query("journal_entry_lines")
      .withIndex("by_business_account", (q: any) => q.eq("businessId", args.businessId))
      .collect();

    let expenseLines = lines.filter(
      (l: any) => l.accountCode >= "5000" && l.accountCode < "6000" && l.debitAmount > 0
    );

    if (args.category) {
      expenseLines = expenseLines.filter((l: any) => l.accountName === args.category);
    }

    if (expenseLines.length === 0) {
      return { count: 0, mean: 0, stdDev: 0, total: 0 };
    }

    // Calculate statistics
    const amounts = expenseLines.map((l: any) => l.debitAmount);
    const total = amounts.reduce((sum: number, a: number) => sum + a, 0);
    const mean = total / amounts.length;

    // Standard deviation
    const squaredDiffs = amounts.map((a: number) => Math.pow(a - mean, 2));
    const variance = squaredDiffs.reduce((sum: number, d: number) => sum + d, 0) / amounts.length;
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
 * Checks journal_entry_lines for lines without a meaningful account name.
 */
export const getUncategorizedCount = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const lines = await ctx.db
      .query("journal_entry_lines")
      .withIndex("by_business_account", (q: any) => q.eq("businessId", args.businessId))
      .collect();

    // Expense lines (5000-5999) without proper categorization
    const expenseLines = lines.filter(
      (l: any) => l.accountCode >= "5000" && l.accountCode < "6000" && l.debitAmount > 0
    );

    const uncategorized = expenseLines.filter(
      (l: any) => !l.accountName || l.accountName === "uncategorized" || l.accountName === "Uncategorized"
    );

    return {
      uncategorizedCount: uncategorized.length,
      totalCount: expenseLines.length,
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

      // Run detection algorithms (Layer 1)
      const insightsCreated = await ctx.runMutation(
        internal.functions.actionCenterJobs.runDetectionAlgorithms,
        {
          businessId: business._id,
          memberUserIds: members.map((m: { userId: { toString(): string } }) => m.userId.toString()),
        }
      );

      totalInsights += insightsCreated;

      // Layer 2a: Schedule LLM enrichment for newly created insights
      if (insightsCreated > 0) {
        const recentInsights = await ctx.runQuery(
          internal.functions.actionCenterJobs.getRecentUnenrichedInsights,
          { businessId: business._id.toString() }
        );

        for (const insight of recentInsights) {
          await ctx.scheduler.runAfter(0, internal.functions.actionCenterJobs.enrichInsight, {
            insightId: insight._id,
          });
        }
      }
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

    // 6. Stale Payable Detection — AP entries aging without dueDate or payment activity
    const stalePayableInsights = await runStalePayableDetection(ctx, args.businessId, args.memberUserIds);
    insightsCreated += stalePayableInsights;

    // 7. Expense Claim Pattern Detection — domain-specific detection for employee expenses
    const claimPatternInsights = await runExpenseClaimPatternDetection(ctx, args.businessId, args.memberUserIds);
    insightsCreated += claimPatternInsights;

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
  // Get recent journal entries (last 90 days) with their expense lines
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const journalEntries = await ctx.db
    .query("journal_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const recentJE = journalEntries.filter(
    (e: any) => e.status === "posted" && e.transactionDate && e.transactionDate >= ninetyDaysAgo
  );

  // Build a map of journalEntryId -> transactionDate for date filtering
  const jeMap = new Map<string, any>();
  for (const je of recentJE) {
    jeMap.set(je._id.toString(), je);
  }

  // Get all expense lines for this business (account codes 5000-5999)
  const allLines = await ctx.db
    .query("journal_entry_lines")
    .withIndex("by_business_account", (q: any) => q.eq("businessId", businessId))
    .collect();

  const expenseLines = allLines.filter(
    (l: any) => l.accountCode >= "5000" && l.accountCode < "6000" && l.debitAmount > 0 && jeMap.has(l.journalEntryId.toString())
  );

  // Load business custom categories for name resolution
  const business = await ctx.db.get(businessId);
  const customCategories = ((business as any)?.customExpenseCategories as Array<{ id: string; category_name: string }>) || [];

  // Calculate monthly expenses for materiality threshold
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const monthlyExpenses = expenseLines
    .filter((l: any) => {
      const je = jeMap.get(l.journalEntryId.toString());
      return je && je.transactionDate >= thirtyDaysAgo;
    })
    .reduce((sum: number, l: any) => sum + l.debitAmount, 0);

  // Group by account name (category) to calculate stats
  const byCategory: Record<string, Array<{ amount: number; line: any; je: any }>> = {};
  for (const line of expenseLines) {
    const category = line.accountName || "uncategorized";
    const amount = line.debitAmount;
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push({ amount, line, je: jeMap.get(line.journalEntryId.toString()) });
  }

  let insightsCreated = 0;

  // Pre-fetch existing anomaly insights for dedup (one query instead of per-txn)
  const existingAnomalyInsights = await ctx.db
    .query("actionCenterInsights")
    .withIndex("by_category", (q: any) => q.eq("category", "anomaly"))
    .collect();

  const dedupCutoff = Date.now() - DEDUP_WINDOW_MS;

  // Check each category for anomalies
  for (const [category, entries] of Object.entries(byCategory)) {
    const amounts = entries.map((e) => e.amount);
    if (amounts.length < 3) continue; // Need enough data points

    const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const squaredDiffs = amounts.map((a) => Math.pow(a - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) continue; // No variance

    // Find transactions >2σ from mean
    const threshold2Sigma = mean + 2 * stdDev;

    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Resolve category name for display
    const categoryDisplayName = resolveCategoryName(category, customCategories);

    for (const entry of entries) {
      const je = entry.je;
      if (!je || je.transactionDate < last7Days) continue; // Only alert on recent transactions

      const amount = entry.amount;
      if (amount <= threshold2Sigma) continue;

      // Dedup: skip if an anomaly insight for this journal entry exists within dedup window
      const jeIdStr = je._id.toString();
      const isDuplicate = existingAnomalyInsights.some(
        (i: any) =>
          i.metadata?.transactionId === jeIdStr &&
          i.businessId === businessId.toString() &&
          i.detectedAt > dedupCutoff
      );

      if (isDuplicate) continue;

      const sigmaDeviation = (amount - mean) / stdDev;
      const deviation = sigmaDeviation.toFixed(1);

      // Apply materiality-based priority scoring
      const priority = computeMaterialityPriority(amount, monthlyExpenses, sigmaDeviation);
      if (priority === null) continue; // Below materiality threshold — suppress

      // Create insight for each member
      for (const userId of memberUserIds) {
        await ctx.db.insert("actionCenterInsights", {
          userId,
          businessId: businessId.toString(),
          category: "anomaly",
          priority,
          status: "new",
          title: `Unusual expense detected in "${categoryDisplayName}"`,
          description: `An expense of ${amount.toLocaleString()} in "${categoryDisplayName}" is ${deviation}σ above your average of ${mean.toLocaleString()}.`,
          affectedEntities: [jeIdStr],
          recommendedAction: `Review this transaction to ensure it's legitimate and correctly categorized.`,
          detectedAt: Date.now(),
          metadata: {
            deviation: parseFloat(deviation),
            baseline: mean,
            category,
            categoryDisplayName,
            transactionId: jeIdStr,
            sourceDataDomain: classifyLineDomain(entry.line),
            materialityPct: monthlyExpenses > 0 ? amount / monthlyExpenses : undefined,
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
  // Query expense lines (5000-5999) for categorization quality
  const lines = await ctx.db
    .query("journal_entry_lines")
    .withIndex("by_business_account", (q: any) => q.eq("businessId", businessId))
    .collect();

  const expenseLines = lines.filter(
    (l: any) => l.accountCode >= "5000" && l.accountCode < "6000" && l.debitAmount > 0
  );

  const uncategorized = expenseLines.filter(
    (l: any) => !l.accountName || l.accountName === "uncategorized" || l.accountName === "Uncategorized"
  );

  if (expenseLines.length < 10) return 0; // Not enough data

  const uncategorizedPct = (uncategorized.length / expenseLines.length) * 100;

  if (uncategorizedPct < 10) return 0; // Below threshold

  // Check for duplicate insight
  const existingInsights = await ctx.db
    .query("actionCenterInsights")
    .withIndex("by_category", (q: any) => q.eq("category", "categorization"))
    .collect();

  const isDuplicate = existingInsights.some(
    (i: any) =>
      i.businessId === businessId.toString() &&
      i.detectedAt > Date.now() - DEDUP_WINDOW_MS
  );

  if (isDuplicate) return 0;

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
      description: `${uncategorizedPct.toFixed(0)}% of your expense transactions are uncategorized. Proper categorization improves financial insights and reporting accuracy.`,
      affectedEntities: uncategorized.slice(0, 10).map((l: any) => l.journalEntryId.toString()),
      recommendedAction: `Review and categorize your uncategorized transactions for better financial tracking.`,
      detectedAt: Date.now(),
      // No expiresAt — insight persists until user dismisses or actions it
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
  // Get journal entries from last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const journalEntries = await ctx.db
    .query("journal_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const recentJE = journalEntries.filter(
    (e: any) => e.status === "posted" && e.transactionDate && e.transactionDate >= thirtyDaysAgo
  );

  // Get lines for recent entries
  let totalIncome = 0;
  let totalExpenses = 0;

  for (const je of recentJE) {
    const lines = await ctx.db
      .query("journal_entry_lines")
      .withIndex("by_journal_entry", (q: any) => q.eq("journalEntryId", je._id))
      .collect();

    for (const line of lines) {
      // Income: account codes 4000-4999 (credit amounts)
      if (line.accountCode >= "4000" && line.accountCode < "5000" && line.creditAmount > 0) {
        totalIncome += line.creditAmount;
      }
      // Expenses: account codes 5000-5999 (debit amounts)
      if (line.accountCode >= "5000" && line.accountCode < "6000" && line.debitAmount > 0) {
        totalExpenses += line.debitAmount;
      }
    }
  }

  if (totalIncome === 0 && totalExpenses === 0) return 0;

  // Alert if expenses exceed income by significant margin
  // Handle zero income case separately
  const hasNoIncome = totalIncome === 0 && totalExpenses > 0;
  const ratio = totalIncome > 0 ? totalExpenses / totalIncome : totalExpenses > 0 ? 999 : 0;

  if (!hasNoIncome && ratio < 1.2) return 0; // Expenses less than 120% of income is fine

  // Check for duplicate insight
  const existingInsights = await ctx.db
    .query("actionCenterInsights")
    .withIndex("by_category", (q: any) => q.eq("category", "cashflow"))
    .collect();

  const isDuplicate = existingInsights.some(
    (i: any) =>
      i.businessId === businessId.toString() &&
      i.metadata?.insightType === "expense_exceeding_income" &&
      i.detectedAt > Date.now() - DEDUP_WINDOW_MS
  );

  if (isDuplicate) return 0;

  let insightsCreated = 0;
  const priority = ratio > 2 ? "critical" : ratio > 1.5 ? "high" : "medium";

  for (const userId of memberUserIds) {
    await ctx.db.insert("actionCenterInsights", {
      userId,
      businessId: businessId.toString(),
      category: "cashflow",
      priority,
      status: "new",
      title: hasNoIncome ? `Expenses with no income recorded` : `Expenses exceeding income this month`,
      description: hasNoIncome
        ? `You have ${totalExpenses.toLocaleString()} in expenses but no income recorded in the last 30 days.`
        : `Your expenses (${totalExpenses.toLocaleString()}) are ${((ratio - 1) * 100).toFixed(0)}% higher than income (${totalIncome.toLocaleString()}) over the last 30 days.`,
      affectedEntities: [],
      recommendedAction: hasNoIncome
        ? `Record your income transactions or review if all expenses are legitimate.`
        : `Review your recent expenses and consider cost-cutting measures or increasing revenue.`,
      detectedAt: Date.now(),
      // No expiresAt — persists until user acts
      metadata: {
        totalIncome,
        totalExpenses,
        ratio,
        periodDays: 30,
        insightType: "expense_exceeding_income",
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

  // --- #320: PRICE ANOMALY ALERTS (from vendor_price_anomalies table) ---
  const priceAnomalyInsights = await runPriceAnomalyDetection(ctx, businessId, memberUserIds);
  insightsCreated += priceAnomalyInsights;

  return insightsCreated;
}

/**
 * T064: Surface active price anomalies from #320 vendor_price_anomalies table.
 * Bandwidth-safe: uses indexed query with .take(10) limit.
 */
async function runPriceAnomalyDetection(
  ctx: any,
  businessId: any,
  memberUserIds: string[]
): Promise<number> {
  // Get high-impact active anomalies from last 7 days
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const anomalies = await ctx.db
    .query("vendor_price_anomalies")
    .withIndex("by_business_severity", (q: any) =>
      q.eq("businessId", businessId).eq("severityLevel", "high-impact").eq("status", "active")
    )
    .take(10);

  const recentAnomalies = anomalies.filter(
    (a: any) => a.createdTimestamp >= sevenDaysAgo
  );

  if (recentAnomalies.length === 0) return 0;

  let insightsCreated = 0;

  // Group by vendor for summarized insights
  const byVendor = new Map<string, any[]>();
  for (const a of recentAnomalies) {
    const vendorId = a.vendorId.toString();
    if (!byVendor.has(vendorId)) byVendor.set(vendorId, []);
    byVendor.get(vendorId)!.push(a);
  }

  for (const [vendorId, vendorAnomalies] of byVendor) {
    const vendor = await ctx.db.get(vendorId as any);
    const vendorName = vendor?.name ?? "Unknown Vendor";
    const maxChange = Math.max(...vendorAnomalies.map((a: any) => a.percentageChange));

    // Check for duplicate insight
    const existing = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_businessId_type", (q: any) =>
        q.eq("businessId", businessId).eq("insightType", "vendor_price_anomaly")
      )
      .take(20);

    const alreadyExists = existing.some(
      (e: any) =>
        e.metadata?.vendorId === vendorId &&
        e.status === "active" &&
        Date.now() - e.createdAt < 7 * 24 * 60 * 60 * 1000
    );

    if (alreadyExists) continue;

    await ctx.db.insert("actionCenterInsights", {
      businessId,
      insightType: "vendor_price_anomaly",
      title: `${vendorName}: ${vendorAnomalies.length} price anomal${vendorAnomalies.length === 1 ? "y" : "ies"} detected`,
      description: `Price increases up to ${maxChange.toFixed(1)}% detected for ${vendorName}. Review in Vendor Intelligence.`,
      severity: "warning",
      status: "active",
      category: "vendor",
      actionUrl: "/vendor-intelligence/alerts",
      targetUserIds: memberUserIds,
      metadata: { vendorId, anomalyCount: vendorAnomalies.length, maxPercentChange: maxChange },
      createdAt: Date.now(),
      expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000, // 14 day expiry
    });

    insightsCreated++;
  }

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

  // Get journal entries in the lookback period
  const journalEntries = await ctx.db
    .query("journal_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const recentJE = journalEntries.filter(
    (e: any) => e.status === "posted" && e.transactionDate && e.transactionDate >= cutoffDate
  );

  // Get vendor expense lines from recent journal entries
  const vendorLines: any[] = [];
  for (const je of recentJE) {
    const lines = await ctx.db
      .query("journal_entry_lines")
      .withIndex("by_journal_entry", (q: any) => q.eq("journalEntryId", je._id))
      .collect();

    // DOMAIN SEPARATION: Only analyze vendor lines (entityType="vendor") — NOT expense claims
    const vendorExpenseLines = lines.filter(
      (l: any) =>
        l.accountCode >= "5000" && l.accountCode < "6000" &&
        l.debitAmount > 0 &&
        l.entityType === "vendor" && l.entityId // Must have vendor entity
    );
    vendorLines.push(...vendorExpenseLines);
  }

  if (vendorLines.length < 5) return 0;

  // Calculate total AP spend for overall concentration
  const totalAPSpend = vendorLines.reduce(
    (sum: number, l: any) => sum + l.debitAmount, 0
  );

  if (totalAPSpend < 1000) return 0;

  // Group by supplier
  const bySupplier: Record<string, { name: string; amount: number; count: number }> = {};

  for (const line of vendorLines) {
    const supplierKey = line.entityId;
    const supplierName = line.entityName || "Unknown Supplier";
    const amount = line.debitAmount;

    if (!bySupplier[supplierKey]) {
      bySupplier[supplierKey] = { name: supplierName, amount: 0, count: 0 };
    }
    bySupplier[supplierKey].amount += amount;
    bySupplier[supplierKey].count++;
  }

  // Collect ALL concentrated suppliers into one summary
  const concentratedSuppliers: Array<{ id: string; name: string; percentage: number; amount: number }> = [];

  for (const [supplierId, data] of Object.entries(bySupplier)) {
    const percentage = (data.amount / totalAPSpend) * 100;
    if (percentage >= threshold) {
      concentratedSuppliers.push({
        id: supplierId,
        name: data.name,
        percentage,
        amount: data.amount,
      });
    }
  }

  if (concentratedSuppliers.length === 0) return 0;

  // Check for duplicate summary insight
  const existingInsights = await ctx.db
    .query("actionCenterInsights")
    .withIndex("by_category", (q: any) => q.eq("category", "optimization"))
    .collect();

  const isDuplicate = existingInsights.some(
    (i: any) =>
      i.metadata?.insightType === "supplier_concentration" &&
      i.businessId === businessId.toString() &&
      i.detectedAt > Date.now() - DEDUP_WINDOW_MS
  );

  if (isDuplicate) return 0;

  // Create ONE consolidated summary card
  const maxPct = Math.max(...concentratedSuppliers.map((s) => s.percentage));
  const priority = maxPct > 80 ? "high" : maxPct > 65 ? "medium" : "low";

  const supplierList = concentratedSuppliers
    .sort((a, b) => b.percentage - a.percentage)
    .map((s) => `${s.name}: ${s.percentage.toFixed(0)}% of AP spend`)
    .join("; ");

  let insightsCreated = 0;

  for (const userId of memberUserIds) {
    await ctx.db.insert("actionCenterInsights", {
      userId,
      businessId: businessId.toString(),
      category: "optimization",
      priority,
      status: "new",
      title: `Supplier concentration risk: ${concentratedSuppliers.length} supplier${concentratedSuppliers.length > 1 ? "s" : ""} above ${threshold}%`,
      description: `${supplierList}. High reliance on few suppliers exposes the business to supply-chain risk if any face issues or increase prices.`,
      affectedEntities: concentratedSuppliers.map((s) => s.id),
      recommendedAction: `Diversify supplier base to reduce dependency. Negotiate better terms with current suppliers and identify alternatives.`,
      detectedAt: Date.now(),
      metadata: {
        consolidatedEntities: concentratedSuppliers,
        totalAPSpend,
        insightType: "supplier_concentration",
        sourceDataDomain: "ap_vendor",
      },
    });
    insightsCreated++;
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

  // Get journal entries in the lookback period
  const journalEntries = await ctx.db
    .query("journal_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const recentJE = journalEntries.filter(
    (e: any) => e.status === "posted" && e.transactionDate && e.transactionDate >= ninetyDaysAgo
  );

  // Build date map for journal entries
  const jeDateMap = new Map<string, string>();
  for (const je of recentJE) {
    jeDateMap.set(je._id.toString(), je.transactionDate);
  }

  // Get vendor expense lines from recent journal entries
  const vendorLines: Array<{ entityId: string; entityName: string; amount: number; date: string }> = [];
  for (const je of recentJE) {
    const lines = await ctx.db
      .query("journal_entry_lines")
      .withIndex("by_journal_entry", (q: any) => q.eq("journalEntryId", je._id))
      .collect();

    // DOMAIN SEPARATION: Only analyze vendor lines — NOT expense claims
    for (const l of lines) {
      if (l.accountCode >= "5000" && l.accountCode < "6000" && l.debitAmount > 0 && l.entityType === "vendor" && l.entityId) {
        vendorLines.push({
          entityId: l.entityId,
          entityName: l.entityName || "Unknown Supplier",
          amount: l.debitAmount,
          date: je.transactionDate || "",
        });
      }
    }
  }

  const supplierPeriods: Record<string, { name: string; recent: number; historical: number; historicalCount: number }> = {};

  for (const line of vendorLines) {
    const supplierKey = line.entityId;
    const supplierName = line.entityName;
    const amount = line.amount;
    const date = line.date;

    if (!supplierPeriods[supplierKey]) {
      supplierPeriods[supplierKey] = { name: supplierName, recent: 0, historical: 0, historicalCount: 0 };
    }

    if (date >= thirtyDaysAgo) {
      supplierPeriods[supplierKey].recent += amount;
    } else if (date >= sixtyDaysAgo) {
      supplierPeriods[supplierKey].historical += amount;
      supplierPeriods[supplierKey].historicalCount++;
    }
  }

  // Collect all significant changes into one summary
  const significantChanges: Array<{ id: string; name: string; changePercent: number; recent: number; historical: number }> = [];

  for (const [supplierId, data] of Object.entries(supplierPeriods)) {
    if (data.historicalCount < 2 || data.historical < 100) continue;

    const changePercent = ((data.recent - data.historical) / data.historical) * 100;
    if (Math.abs(changePercent) < changeThreshold) continue;

    significantChanges.push({
      id: supplierId,
      name: data.name,
      changePercent,
      recent: data.recent,
      historical: data.historical,
    });
  }

  if (significantChanges.length === 0) return 0;

  // Check for duplicate summary insight
  const existingInsights = await ctx.db
    .query("actionCenterInsights")
    .withIndex("by_category", (q: any) => q.eq("category", "optimization"))
    .collect();

  const isDuplicate = existingInsights.some(
    (i: any) =>
      i.metadata?.insightType === "supplier_spending_changes" &&
      i.businessId === businessId.toString() &&
      i.detectedAt > Date.now() - DEDUP_WINDOW_MS
  );

  if (isDuplicate) return 0;

  // Create ONE consolidated summary card
  const maxChange = Math.max(...significantChanges.map((s) => Math.abs(s.changePercent)));
  const priority = maxChange > 100 ? "high" : maxChange > 75 ? "medium" : "low";

  const changeList = significantChanges
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .map((s) => `${s.name}: ${s.changePercent > 0 ? "+" : ""}${s.changePercent.toFixed(0)}%`)
    .join("; ");

  let insightsCreated = 0;

  for (const userId of memberUserIds) {
    await ctx.db.insert("actionCenterInsights", {
      userId,
      businessId: businessId.toString(),
      category: "optimization",
      priority,
      status: "new",
      title: `Supplier spending changes: ${significantChanges.length} supplier${significantChanges.length > 1 ? "s" : ""} with significant shifts`,
      description: `${changeList}. Review supplier relationships for cost optimization opportunities.`,
      affectedEntities: significantChanges.map((s) => s.id),
      recommendedAction: `Review recent invoices from affected suppliers. Negotiate terms or explore alternatives where costs have increased.`,
      detectedAt: Date.now(),
      metadata: {
        consolidatedEntities: significantChanges,
        insightType: "supplier_spending_changes",
        sourceDataDomain: "ap_vendor",
      },
    });
    insightsCreated++;
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

  // Get vendor expense lines from journal_entry_lines
  const vendorExpenseLines = await ctx.db
    .query("journal_entry_lines")
    .withIndex("by_entity", (q: any) => q.eq("entityType", "vendor"))
    .collect();

  // Filter to this business's recent expense lines
  const recentVendorLines = vendorExpenseLines.filter(
    (l: any) =>
      l.businessId?.toString() === businessId.toString() &&
      l.accountCode >= "5000" && l.accountCode < "6000" &&
      l.debitAmount > 0
  );

  let insightsCreated = 0;

  for (const vendor of vendors) {
    if (vendor.status === "inactive") continue;

    const vendorTxns = recentVendorLines.filter(
      (l: any) => l.entityId === vendor._id.toString()
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
      factors.push("Unverified supplier");
    }

    // Transaction irregularity
    if (vendorTxns.length >= 3) {
      const amounts = vendorTxns.map((t: any) => t.debitAmount);
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
        (i.metadata?.insightType === "vendor_risk" || i.metadata?.insightType === "supplier_risk") &&
        i.detectedAt > Date.now() - DEDUP_WINDOW_MS
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
        title: `High-risk supplier: ${vendor.name}`,
        description: `${vendor.name} has a risk score of ${riskScore}/100. Issues: ${factors.join(", ")}.`,
        affectedEntities: [vendor._id.toString()],
        recommendedAction: `Review and update supplier information for ${vendor.name}.`,
        detectedAt: Date.now(),
        // No expiresAt — persists until user acts
        metadata: {
          vendorId: vendor._id.toString(),
          vendorName: vendor.name,
          riskScore,
          riskFactors: factors,
          insightType: "supplier_risk",
          sourceDataDomain: "ap_vendor",
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

  // Use invoices table for deadline tracking (AP documents with dueDate)
  const invoices = await ctx.db
    .query("invoices")
    .filter((q: any) =>
      q.and(
        q.eq(q.field("businessId"), businessId),
        q.eq(q.field("deletedAt"), undefined)
      )
    )
    .collect();

  const upcomingDue = invoices.filter((inv: any) => {
    if (!inv.dueDate) return false;
    if (inv.paymentStatus === "paid") return false;
    return inv.dueDate >= today && inv.dueDate <= warningDate;
  });

  let insightsCreated = 0;

  for (const invoice of upcomingDue) {
    const dueDate = new Date(invoice.dueDate);
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
        i.metadata?.transactionId === invoice._id.toString() &&
        i.metadata?.insightType === "payment_due" &&
        i.detectedAt > Date.now() - DEADLINE_DEDUP_WINDOW_MS
    );

    if (isDuplicate) continue;

    const totalAmount = (invoice as any).extractedData?.total_amount || 0;
    const paidAmount = (invoice as any).paidAmount || 0;
    const amount = totalAmount - paidAmount;
    const vendorName = (invoice as any).extractedData?.vendor_name || "Unknown";
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
        description: `Invoice from ${vendorName} of ${amount.toLocaleString()} is due on ${invoice.dueDate}.`,
        affectedEntities: [invoice._id.toString()],
        recommendedAction:
          daysUntilDue <= 3
            ? `Urgent: Process this payment immediately.`
            : `Schedule this payment before ${invoice.dueDate}.`,
        detectedAt: Date.now(),
        expiresAt: dueDate.getTime(),
        metadata: {
          transactionId: invoice._id.toString(),
          dueDate: invoice.dueDate,
          daysUntilDue,
          amount,
          vendorName,
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

  // Get journal entries for cash balance calculation
  const journalEntries = await ctx.db
    .query("journal_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const recentJE = journalEntries.filter(
    (e: any) => e.status === "posted" && e.transactionDate && e.transactionDate >= ninetyDaysAgo
  );

  let totalIncome = 0;
  let totalExpenses = 0;
  let cashBalance = 0;

  for (const je of recentJE) {
    const lines = await ctx.db
      .query("journal_entry_lines")
      .withIndex("by_journal_entry", (q: any) => q.eq("journalEntryId", je._id))
      .collect();

    for (const line of lines) {
      // Income: account codes 4000-4999 (credit amounts)
      if (line.accountCode >= "4000" && line.accountCode < "5000" && line.creditAmount > 0) {
        totalIncome += line.creditAmount;
        cashBalance += line.creditAmount;
      }
      // Expenses: account codes 5000-5999 (debit amounts)
      if (line.accountCode >= "5000" && line.accountCode < "6000" && line.debitAmount > 0) {
        totalExpenses += line.debitAmount;
        cashBalance -= line.debitAmount;
      }
    }
  }

  const monthlyBurnRate = totalExpenses / 3;
  if (monthlyBurnRate <= 0) return 0;

  const dailyBurnRate = monthlyBurnRate / 30;

  // If cash balance is negative or zero, runway is 0 (already in deficit)
  // Don't create this alert if already in deficit - the "expenses exceeding income" alert handles that
  if (cashBalance <= 0) return 0;

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
      i.detectedAt > Date.now() - DEDUP_WINDOW_MS
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
      description: `Based on your burn rate of ${monthlyBurnRate.toLocaleString()}/month, you have approximately ${runwayDays} days of runway remaining.`,
      affectedEntities: [],
      recommendedAction:
        runwayDays <= 7
          ? `Critical: Review expenses and prioritize collections immediately.`
          : `Review cash flow and consider reducing non-essential expenses.`,
      detectedAt: Date.now(),
      // No expiresAt — persists until user acts
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

  // Get journal entries for duplicate detection
  const journalEntries = await ctx.db
    .query("journal_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  const recentJE = journalEntries.filter(
    (e: any) => e.status === "posted" && e.transactionDate && e.transactionDate >= thirtyDaysAgo
  );

  // Group by amount + date (using totalDebit as the amount and description for context)
  const grouped: Record<string, any[]> = {};

  for (const je of recentJE) {
    const key = `${je.description || "unknown"}_${je.totalDebit}_${je.transactionDate}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(je);
  }

  const potentialDuplicates = Object.entries(grouped).filter(
    ([, txns]) => txns.length > 1
  );

  let insightsCreated = 0;

  for (const [, txns] of potentialDuplicates) {
    const firstTxn = txns[0];
    const amount = firstTxn.totalDebit || 0;

    // Skip trivial amounts (< 5 in home currency) to avoid noise from rounding
    if (amount < 5) continue;

    const existingAlerts = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_category", (q: any) => q.eq("category", "anomaly"))
      .collect();

    const txnIds = txns.map((t: any) => t._id.toString()).sort().join(",");
    // Dedup: skip if insight exists for these transactions (regardless of age, unless actioned)
    const isDuplicate = existingAlerts.some(
      (i: any) =>
        i.metadata?.duplicateGroupIds === txnIds &&
        i.status !== "actioned" &&
        i.detectedAt > Date.now() - DEDUP_WINDOW_MS
    );

    if (isDuplicate) continue;

    const priority = amount >= 10000 ? "high" : amount >= 1000 ? "medium" : "low";

    for (const userId of memberUserIds) {
      await ctx.db.insert("actionCenterInsights", {
        userId,
        businessId: businessId.toString(),
        category: "anomaly",
        priority,
        status: "new",
        title: `Potential duplicate: ${txns.length} entries of ${amount.toLocaleString()}`,
        description: `Found ${txns.length} journal entries with same amount and date. These may be duplicates.`,
        affectedEntities: txns.map((t: any) => t._id.toString()),
        recommendedAction: `Review these entries to confirm they are not duplicates.`,
        detectedAt: Date.now(),
        // No expiresAt — persists until user acts
        metadata: {
          duplicateGroupIds: txnIds,
          amount,
          description: firstTxn.description,
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

/**
 * Stale Payable Detection — Flag pending AP entries aging without dueDate or payment
 *
 * Catches payables that slip through the cracks because:
 * - No dueDate set → markOverduePayables cron won't flag them
 * - Status still "pending" but no payment activity
 * - Sitting for 30+ days without attention
 */
async function runStalePayableDetection(
  ctx: any,
  businessId: any,
  memberUserIds: string[]
): Promise<number> {
  // Use invoices table to find stale unpaid payables
  const invoices = await ctx.db
    .query("invoices")
    .filter((q: any) =>
      q.and(
        q.eq(q.field("businessId"), businessId),
        q.eq(q.field("deletedAt"), undefined)
      )
    )
    .collect();

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  // Find unpaid invoices that are old and have no dueDate
  const staleInvoices = invoices.filter((inv: any) => {
    if (inv.paymentStatus === "paid") return false;
    if (inv.dueDate) return false; // Has dueDate — handled by deadline alerts
    if (!inv._creationTime || inv._creationTime > thirtyDaysAgo) return false; // Less than 30 days old
    return true;
  });

  if (staleInvoices.length === 0) return 0;

  // Dedup: check for existing stale payable insight
  const existingInsights = await ctx.db
    .query("actionCenterInsights")
    .withIndex("by_category", (q: any) => q.eq("category", "deadline"))
    .collect();

  const dedupCutoff = Date.now() - DEDUP_WINDOW_MS;
  const isDuplicate = existingInsights.some(
    (i: any) =>
      i.businessId === businessId.toString() &&
      i.metadata?.insightType === "stale_payables" &&
      i.detectedAt > dedupCutoff
  );

  if (isDuplicate) return 0;

  const totalAmount = staleInvoices.reduce(
    (sum: number, inv: any) => {
      const total = (inv as any).extractedData?.total_amount || 0;
      const paid = (inv as any).paidAmount || 0;
      return sum + (total - paid);
    },
    0
  );

  // Calculate age of oldest invoice
  const oldestCreation = Math.min(...staleInvoices.map((inv: any) => inv._creationTime));
  const daysOld = Math.floor((Date.now() - oldestCreation) / (24 * 60 * 60 * 1000));
  const priority = daysOld > 90 ? "high" : daysOld > 60 ? "medium" : "low";

  let insightsCreated = 0;
  for (const userId of memberUserIds) {
    await ctx.db.insert("actionCenterInsights", {
      userId,
      businessId: businessId.toString(),
      category: "deadline" as const,
      priority: priority as "high" | "medium" | "low",
      status: "new" as const,
      title: `${staleInvoices.length} unpaid bill${staleInvoices.length > 1 ? "s" : ""} aging ${daysOld}+ days`,
      description: `${staleInvoices.length} payable${staleInvoices.length > 1 ? "s" : ""} totaling ${totalAmount.toLocaleString()} have no due date set and have been pending for ${daysOld}+ days. Set due dates or record payments.`,
      affectedEntities: staleInvoices.map((inv: any) => inv._id.toString()),
      recommendedAction: `Set due dates on these payables and schedule payments. Bills without due dates are easy to forget.`,
      detectedAt: Date.now(),
      // No expiresAt — persists until user acts
      metadata: {
        insightType: "stale_payables",
        count: staleInvoices.length,
        totalAmount,
        daysOld,
        vendors: [...new Set(staleInvoices.map((inv: any) => (inv as any).extractedData?.vendor_name).filter(Boolean))],
      },
    });
    insightsCreated++;
  }

  return insightsCreated;
}

/**
 * Expense Claim Pattern Detection — domain-specific analysis for employee expenses
 *
 * Detects patterns that finance managers and auditors actually care about:
 * 1. Potential split claims — multiple small claims from same employee on same day
 *    that collectively exceed a threshold (possible approval-threshold avoidance)
 * 2. Employee expense spikes — sudden increase in an employee's claim volume
 *    compared to their historical average
 *
 * NOT flagged (normal patterns):
 * - Same merchant repeatedly (coffee shop, phone plan — personal preference)
 * - Consistent monthly amounts (recurring business expenses)
 */
async function runExpenseClaimPatternDetection(
  ctx: any,
  businessId: any,
  memberUserIds: string[]
): Promise<number> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const claims = await ctx.db
    .query("expense_claims")
    .filter((q: any) =>
      q.and(
        q.eq(q.field("businessId"), businessId),
        q.eq(q.field("deletedAt"), undefined)
      )
    )
    .collect();

  const recentClaims = claims.filter(
    (c: any) => c.transactionDate && c.transactionDate >= ninetyDaysAgo
  );

  if (recentClaims.length < 5) return 0; // Not enough data

  let insightsCreated = 0;

  // --- 1. SPLIT CLAIM DETECTION ---
  // Multiple claims from same employee on same day that add up to a large amount
  // This is the #1 expense fraud pattern — splitting to stay under approval thresholds
  const byEmployeeDay: Record<string, { claims: any[]; total: number }> = {};

  for (const claim of recentClaims) {
    if (!claim.transactionDate) continue;
    // Only check claims from last 30 days for split detection
    if (claim.transactionDate < thirtyDaysAgo) continue;
    const key = `${claim.userId}_${claim.transactionDate}`;
    const amount = Math.abs(claim.homeCurrencyAmount || claim.totalAmount || 0);
    if (!byEmployeeDay[key]) byEmployeeDay[key] = { claims: [], total: 0 };
    byEmployeeDay[key].claims.push(claim);
    byEmployeeDay[key].total += amount;
  }

  // Collect potential split claims (3+ claims on same day, total > 500)
  const splitCandidates: Array<{ userId: string; date: string; count: number; total: number; merchants: string[] }> = [];

  for (const [key, data] of Object.entries(byEmployeeDay)) {
    if (data.claims.length < 3) continue; // Need 3+ claims on same day
    if (data.total < 500) continue; // Total must be material

    const [userId, date] = key.split("_");
    const merchants = [...new Set(data.claims.map((c: any) => c.vendorName).filter(Boolean))];

    splitCandidates.push({ userId, date, count: data.claims.length, total: data.total, merchants });
  }

  if (splitCandidates.length > 0) {
    // Dedup check
    const existingInsights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_category", (q: any) => q.eq("category", "compliance"))
      .collect();

    const isDuplicate = existingInsights.some(
      (i: any) =>
        i.metadata?.insightType === "split_claims" &&
        i.businessId === businessId.toString() &&
        i.detectedAt > Date.now() - DEDUP_WINDOW_MS
    );

    if (!isDuplicate) {
      const summary = splitCandidates
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
        .map((s) => `${s.count} claims on ${s.date} totaling ${s.total.toLocaleString()}`)
        .join("; ");

      const priority = splitCandidates.some((s) => s.total > 2000) ? "high" : "medium";

      for (const userId of memberUserIds) {
        await ctx.db.insert("actionCenterInsights", {
          userId,
          businessId: businessId.toString(),
          category: "compliance" as const,
          priority: priority as "high" | "medium",
          status: "new" as const,
          title: `Potential split claims: ${splitCandidates.length} instance${splitCandidates.length > 1 ? "s" : ""} detected`,
          description: `${summary}. Multiple small claims on the same day may indicate split submissions to stay under approval thresholds.`,
          affectedEntities: splitCandidates.flatMap((s) => s.userId ? [s.userId] : []),
          recommendedAction: `Review these claims to verify they are legitimate separate expenses and not split to avoid approval limits.`,
          detectedAt: Date.now(),
          metadata: {
            consolidatedEntities: splitCandidates,
            insightType: "split_claims",
            sourceDataDomain: "expense_claim",
          },
        });
        insightsCreated++;
      }
    }
  }

  // --- 2. EMPLOYEE EXPENSE SPIKE DETECTION ---
  // Compare each employee's last 30 days vs their 60-90 day average
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const byEmployee: Record<string, { recent: number; historical: number; historicalMonths: number; recentCount: number }> = {};

  for (const claim of recentClaims) {
    const empId = claim.userId?.toString();
    if (!empId) continue;
    const amount = Math.abs(claim.homeCurrencyAmount || claim.totalAmount || 0);
    const date = claim.transactionDate || "";

    if (!byEmployee[empId]) byEmployee[empId] = { recent: 0, historical: 0, historicalMonths: 2, recentCount: 0 };

    if (date >= thirtyDaysAgo) {
      byEmployee[empId].recent += amount;
      byEmployee[empId].recentCount++;
    } else if (date >= sixtyDaysAgo) {
      byEmployee[empId].historical += amount;
    }
  }

  // Find employees with significant spikes (>100% increase and material amount)
  const spikeEmployees: Array<{ userId: string; recent: number; monthlyAvg: number; increase: number }> = [];

  for (const [empId, data] of Object.entries(byEmployee)) {
    if (data.recentCount < 2) continue; // Need at least 2 recent claims
    const monthlyAvg = data.historical / data.historicalMonths;
    if (monthlyAvg < 100) continue; // Not enough historical spend to compare

    const increase = monthlyAvg > 0 ? ((data.recent - monthlyAvg) / monthlyAvg) * 100 : 0;
    if (increase < 100) continue; // Less than 2x spike — not significant
    if (data.recent < 500) continue; // Total must be material

    spikeEmployees.push({ userId: empId, recent: data.recent, monthlyAvg, increase });
  }

  if (spikeEmployees.length > 0) {
    const existingInsights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_category", (q: any) => q.eq("category", "anomaly"))
      .collect();

    const isDuplicate = existingInsights.some(
      (i: any) =>
        i.metadata?.insightType === "employee_expense_spike" &&
        i.businessId === businessId.toString() &&
        i.detectedAt > Date.now() - DEDUP_WINDOW_MS
    );

    if (!isDuplicate) {
      const summary = spikeEmployees
        .sort((a, b) => b.increase - a.increase)
        .slice(0, 5)
        .map((s) => `${s.recent.toLocaleString()} this month vs ${s.monthlyAvg.toLocaleString()} avg (+${s.increase.toFixed(0)}%)`)
        .join("; ");

      const maxIncrease = Math.max(...spikeEmployees.map((s) => s.increase));
      const priority = maxIncrease > 300 ? "high" : "medium";

      for (const userId of memberUserIds) {
        await ctx.db.insert("actionCenterInsights", {
          userId,
          businessId: businessId.toString(),
          category: "anomaly" as const,
          priority: priority as "high" | "medium",
          status: "new" as const,
          title: `Employee expense spike: ${spikeEmployees.length} employee${spikeEmployees.length > 1 ? "s" : ""} with unusual increase`,
          description: `${summary}. Sudden increases in employee claims may warrant review to verify legitimacy.`,
          affectedEntities: spikeEmployees.map((s) => s.userId),
          recommendedAction: `Review recent expense claims from these employees. Verify the increase is due to legitimate business activity (e.g., travel, events).`,
          detectedAt: Date.now(),
          metadata: {
            consolidatedEntities: spikeEmployees,
            insightType: "employee_expense_spike",
            sourceDataDomain: "expense_claim",
          },
        });
        insightsCreated++;
      }
    }
  }

  return insightsCreated;
}

// ============================================
// EVENT-DRIVEN INSIGHT GENERATION
// ============================================

/**
 * Lightweight anomaly check for a single new transaction.
 * Scheduled from journal entry creation so insights surface immediately
 * instead of waiting up to 4 hours for the cron.
 *
 * Only runs anomaly detection (the most valuable for real-time feedback).
 * Other detection types (cashflow, vendor, etc.) remain on the 4h cron.
 */
export const analyzeNewTransaction = internalMutation({
  args: {
    transactionId: v.id("journal_entries"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    // Get journal entry
    const journalEntry = await ctx.db.get(args.transactionId);
    if (!journalEntry || journalEntry.status === "voided") return 0;

    // Get journal entry lines
    const lines = await ctx.db
      .query("journal_entry_lines")
      .withIndex("by_journal_entry", (q: any) => q.eq("journalEntryId", args.transactionId))
      .collect();

    // Only check expenses for anomalies (account codes 5000-5999)
    const expenseLines = lines.filter(
      (line: any) => line.accountCode >= "5000" && line.accountCode < "6000" && line.debitAmount > 0
    );

    if (expenseLines.length === 0) return 0; // Not an expense transaction

    // Use account name as category and sum debit amounts
    const category = expenseLines[0]?.accountName || "uncategorized";
    const amount = expenseLines.reduce((sum: number, line: any) => sum + line.debitAmount, 0);
    if (amount === 0) return 0;

    // Load business for custom categories + materiality
    const business = await ctx.db.get(args.businessId);
    const customCategories = ((business as any)?.customExpenseCategories as Array<{ id: string; category_name: string }>) || [];
    const categoryDisplayName = resolveCategoryName(category, customCategories);

    // Get historical stats for this category (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Get all journal entries for this business
    const allJournalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
      .collect();

    // Filter for posted expense entries in date range
    const recentExpenseEntries = allJournalEntries.filter(
      (e: any) =>
        e.status === "posted" &&
        e.transactionDate &&
        e.transactionDate >= ninetyDaysAgo &&
        e._id.toString() !== args.transactionId.toString() // exclude this txn from baseline
    );

    // Get lines for these entries and filter by same account
    const categoryAmounts: number[] = [];
    for (const entry of recentExpenseEntries) {
      const entryLines = await ctx.db
        .query("journal_entry_lines")
        .withIndex("by_journal_entry", (q: any) => q.eq("journalEntryId", entry._id))
        .collect();

      const entryExpenseLines = entryLines.filter(
        (line: any) =>
          line.accountName === category && // Same account/category
          line.debitAmount > 0
      );

      if (entryExpenseLines.length > 0) {
        const entryAmount = entryExpenseLines.reduce((sum: number, line: any) => sum + line.debitAmount, 0);
        categoryAmounts.push(entryAmount);
      }
    }

    if (categoryAmounts.length < 3) return 0; // Not enough history

    const mean = categoryAmounts.reduce((sum: number, a: number) => sum + a, 0) / categoryAmounts.length;
    const squaredDiffs = categoryAmounts.map((a: number) => Math.pow(a - mean, 2));
    const variance = squaredDiffs.reduce((sum: number, d: number) => sum + d, 0) / categoryAmounts.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    const threshold2Sigma = mean + 2 * stdDev;
    if (amount <= threshold2Sigma) return 0; // Not anomalous

    // Check for existing anomaly insight for this transaction
    const existingInsights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_category", (q: any) => q.eq("category", "anomaly"))
      .collect();

    const txnIdStr = args.transactionId.toString();
    const dedupCutoff = Date.now() - DEDUP_WINDOW_MS;
    const isDuplicate = existingInsights.some(
      (i: any) =>
        i.metadata?.transactionId === txnIdStr &&
        i.businessId === args.businessId.toString() &&
        i.detectedAt > dedupCutoff
    );

    if (isDuplicate) return 0;

    // Get business members
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
      .collect();

    const memberUserIds = memberships
      .filter((m: any) => m.status === "active" && ["owner", "finance_admin", "admin"].includes(m.role))
      .map((m: any) => m.userId.toString());

    if (memberUserIds.length === 0) return 0;

    const sigmaDeviation = (amount - mean) / stdDev;
    const deviation = sigmaDeviation.toFixed(1);

    // Simple amount-based priority (vendor surge detection removed for journal entries)
    const priority = amount >= 10000 ? "high" : amount >= 1000 ? "medium" : "low";

    let insightsCreated = 0;
    for (const userId of memberUserIds) {
      await ctx.db.insert("actionCenterInsights", {
        userId,
        businessId: args.businessId.toString(),
        category: "anomaly" as const,
        priority,
        status: "new" as const,
        title: `Unusual expense detected in "${categoryDisplayName}"`,
        description: `An expense of ${amount.toLocaleString()} in "${categoryDisplayName}" is ${deviation}σ above your average of ${mean.toLocaleString()}.`,
        affectedEntities: [txnIdStr],
        recommendedAction: `Review this transaction to ensure it's legitimate and correctly categorized.`,
        detectedAt: Date.now(),
        metadata: {
          deviation: parseFloat(deviation),
          baseline: mean,
          category,
          categoryDisplayName,
          transactionId: txnIdStr,
          sourceDataDomain: journalEntry.sourceType || "manual",
        },
      });
      insightsCreated++;
    }

    if (insightsCreated > 0) {
      console.log(
        `[ActionCenterJobs] Real-time anomaly: ${category} expense ${amount} (${deviation}σ) → ${insightsCreated} insights`
      );
    }

    // Vendor surge detection skipped for journal entries (vendor info is in source documents)

    return insightsCreated;
  },
});

// ============================================
// LAYER 2a: LLM INSIGHT ENRICHMENT
// ============================================

/**
 * Enrich an existing insight with LLM-generated contextual explanation.
 *
 * Called async after Layer 1 creates an insight. Patches the insight's
 * description and recommendedAction in-place with richer, business-contextual text.
 * Stores original template text in metadata.originalDescription.
 */
export const enrichInsight = internalAction({
  args: {
    insightId: v.id("actionCenterInsights"),
  },
  handler: async (ctx, args) => {
    // 1. Read the insight
    const insight = await ctx.runQuery(internal.functions.actionCenterJobs.getInsightForEnrichment, {
      insightId: args.insightId,
    });

    if (!insight) {
      console.log(`[Layer2] Insight ${args.insightId} not found, skipping enrichment`);
      return;
    }

    // 2. Get structured analysis from MCP tools (single source of truth)
    const businessId = insight.businessId;

    const mcpResults = await callMCPToolsBatch(businessId, [
      { toolName: "detect_anomalies", args: { date_range_days: 90, sensitivity: "medium" } },
      { toolName: "analyze_vendor_risk", args: {} },
    ]);

    // Also get basic business context for the LLM prompt
    const summary = await ctx.runQuery(internal.functions.actionCenterJobs.getBusinessSummaryByStringId, {
      businessIdStr: businessId,
    });

    // Build MCP analysis context for the LLM
    const anomalyData = mcpResults["detect_anomalies"] as any;
    const vendorData = mcpResults["analyze_vendor_risk"] as any;

    const mcpContext = [
      anomalyData?.anomalies?.length > 0
        ? `Anomaly analysis: ${anomalyData.anomalies.length} anomalies detected (${anomalyData.summary?.sensitivity_used || "medium"} sensitivity)`
        : "Anomaly analysis: No anomalies detected",
      vendorData?.vendor_profiles?.length > 0
        ? `Vendor risk: ${vendorData.vendor_profiles.filter((v: any) => v.risk_score > 50).length} high-risk vendors, ${vendorData.concentration_risks?.length || 0} concentration risks`
        : "Vendor risk: No significant vendor risks",
    ].join("\n");

    const businessName = summary?.businessName || "Unknown";
    const homeCurrency = summary?.homeCurrency || "MYR";

    // 3. Call LLM with structured MCP data (not raw DB queries)
    const systemPrompt = `You are a financial analyst for a Southeast Asian SME called "${businessName}".
Enrich this financial alert with business context and specific, actionable advice.
Be concise (2-3 sentences per field). Use the business's home currency (${homeCurrency}).

IMPORTANT TERMINOLOGY RULES:
- Use "supplier" for AP/COGS payees (businesses that supply goods/services). NEVER use "vendor".
- Use "merchant" for expense-claim payees (restaurants, shops, transport — places employees visit).
- Supplier concentration/risk analysis applies ONLY to AP suppliers, not expense-claim merchants.
- Do NOT suggest "diversifying merchants" for expense claims — that's not a business risk.

Respond ONLY in valid JSON — no markdown, no explanation outside the JSON.`;

    const userPrompt = `Alert: ${insight.title}
Raw analysis: ${insight.description}
Category: ${insight.category} | Priority: ${insight.priority}

MCP Intelligence (server-side analysis):
${mcpContext}

${summary ? `Business context (last 90 days):
- Income: ${summary.totalIncome.toLocaleString()} ${homeCurrency}
- Expenses: ${summary.totalExpenses.toLocaleString()} ${homeCurrency} (${summary.transactionCount} transactions)
- Top suppliers (AP): ${summary.topSuppliers?.join(", ") || summary.topVendors?.join(", ") || "None"}
- Top merchants (Expense Claims): ${summary.topMerchants?.join(", ") || "None"}
- Categories: ${summary.categories.join(", ") || "None"}
- AR outstanding: ${summary.arOutstanding.toLocaleString()} (${summary.arOverdueCount} overdue)
- AP pending: ${summary.apPending.toLocaleString()} (${(summary.apOverdue || 0).toLocaleString()} overdue)` : ""}

Respond in this exact JSON format:
{"description":"2-3 sentence explanation of WHY this matters for this specific business","recommendation":"Specific step-by-step action to take","connectedSignal":"One related pattern to watch (or null if none)"}`;

    interface EnrichmentResult {
      description?: string;
      recommendation?: string;
      connectedSignal?: string | null;
    }

    const result = await callLLMJson<EnrichmentResult>({
      systemPrompt,
      userPrompt,
      maxTokens: 400,
      temperature: 0.3,
    });

    if (!result || !result.description) {
      console.log(`[Layer2] LLM returned no enrichment for insight ${args.insightId}`);
      return;
    }

    // 5. Sanitize LLM output: replace "vendor" with correct domain term
    let sanitizedDescription = result.description;
    let sanitizedRecommendation = result.recommendation || insight.recommendedAction;
    sanitizedDescription = sanitizedDescription.replace(/\bvendor\b/gi, "supplier");
    sanitizedDescription = sanitizedDescription.replace(/\bvendors\b/gi, "suppliers");
    sanitizedRecommendation = sanitizedRecommendation.replace(/\bvendor\b/gi, "supplier");
    sanitizedRecommendation = sanitizedRecommendation.replace(/\bvendors\b/gi, "suppliers");

    // 6. Patch insight in-place
    await ctx.runMutation(internal.functions.actionCenterJobs.patchInsightEnrichment, {
      insightId: args.insightId,
      enrichedDescription: sanitizedDescription,
      enrichedRecommendation: sanitizedRecommendation,
      originalDescription: insight.description,
      originalRecommendation: insight.recommendedAction,
      connectedSignal: result.connectedSignal || undefined,
    });

    console.log(`[Layer2] Enriched insight ${args.insightId}: "${insight.title}"`);
  },
});

/**
 * Helper query: read insight for enrichment (used by enrichInsight action)
 */
export const getInsightForEnrichment = internalQuery({
  args: { insightId: v.id("actionCenterInsights") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.insightId);
  },
});

/**
 * Helper query: get business summary by string ID (resolves string → Id)
 */
export const getBusinessSummaryByStringId = internalQuery({
  args: { businessIdStr: v.string() },
  handler: async (ctx, args) => {
    // Try to resolve the string as a Convex ID
    const businesses = await ctx.db.query("businesses").collect();
    const business = businesses.find((b: any) => b._id.toString() === args.businessIdStr);
    if (!business) return null;

    // Delegate to getBusinessSummary logic (inline to avoid circular dependency)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Journal entries (last 90 days)
    const journalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", business._id))
      .collect();

    const recentJE = journalEntries.filter(
      (e: any) => e.status === "posted" && e.transactionDate && e.transactionDate >= ninetyDaysAgo
    );

    // Load all journal entry lines for recent entries
    const allLines: any[] = [];
    for (const entry of recentJE) {
      const lines = await ctx.db
        .query("journal_entry_lines")
        .withIndex("by_journal_entry", (q: any) => q.eq("journalEntryId", entry._id))
        .collect();
      allLines.push(...lines);
    }

    let totalIncome = 0;
    let totalExpenses = 0;
    const supplierSpend: Record<string, { name: string; amount: number; count: number }> = {};
    const merchantSpend: Record<string, { name: string; amount: number; count: number }> = {};
    const categorySpend: Record<string, number> = {};
    let pendingPayables = 0;
    let overduePayables = 0;

    for (const line of allLines) {
      if (line.accountCode >= "4000" && line.accountCode < "5000" && line.creditAmount > 0) {
        totalIncome += line.creditAmount;
      }
      if (line.accountCode >= "5000" && line.accountCode < "6000" && line.debitAmount > 0) {
        totalExpenses += line.debitAmount;
        const catName = line.accountName || "Uncategorized";
        categorySpend[catName] = (categorySpend[catName] || 0) + line.debitAmount;
        const domain = classifyLineDomain(line);
        const payeeName = line.entityName || "Unknown";
        if (domain === "ap_vendor" || domain === "cogs") {
          if (!supplierSpend[payeeName]) supplierSpend[payeeName] = { name: payeeName, amount: 0, count: 0 };
          supplierSpend[payeeName].amount += line.debitAmount;
          supplierSpend[payeeName].count++;
        } else {
          if (!merchantSpend[payeeName]) merchantSpend[payeeName] = { name: payeeName, amount: 0, count: 0 };
          merchantSpend[payeeName].amount += line.debitAmount;
          merchantSpend[payeeName].count++;
        }
      }
    }

    // AP pending/overdue from invoices table
    const bsInvoices = await ctx.db
      .query("invoices")
      .filter((q: any) =>
        q.and(
          q.eq(q.field("businessId"), business._id),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .collect();

    for (const inv of bsInvoices) {
      const invAmount = (inv as any).extractedData?.total_amount || 0;
      const paid = (inv as any).paidAmount || 0;
      const remaining = invAmount - paid;
      if ((inv as any).paymentStatus === "unpaid" || (inv as any).paymentStatus === "partial") {
        pendingPayables += remaining;
      }
      if ((inv as any).dueDate && (inv as any).dueDate < ninetyDaysAgo && (inv as any).paymentStatus !== "paid") {
        overduePayables += remaining;
      }
    }

    const topSuppliers = Object.values(supplierSpend).sort((a, b) => b.amount - a.amount).slice(0, 5).map((v) => `${v.name}: ${v.amount.toLocaleString()} (${v.count} txns)`);
    const topMerchants = Object.values(merchantSpend).sort((a, b) => b.amount - a.amount).slice(0, 5).map((v) => `${v.name}: ${v.amount.toLocaleString()} (${v.count} txns)`);
    const categories = Object.entries(categorySpend).sort(([, a], [, b]) => b - a).slice(0, 5).map(([cat, amt]) => `${cat}: ${amt.toLocaleString()}`);

    const salesInvoices = await ctx.db.query("sales_invoices").filter((q: any) => q.and(q.eq(q.field("businessId"), business._id), q.eq(q.field("deletedAt"), undefined))).collect();
    const arOutstanding = salesInvoices.filter((i: any) => ["sent", "partially_paid", "overdue"].includes(i.status)).reduce((sum: number, i: any) => sum + (i.balanceDue ?? i.totalAmount), 0);
    const arOverdueCount = salesInvoices.filter((i: any) => i.status === "overdue").length;

    const insights = await ctx.db.query("actionCenterInsights").withIndex("by_business_priority", (q: any) => q.eq("businessId", business._id.toString())).collect();
    const existingInsightTitles = insights.filter((i: any) => i.status === "new" || i.status === "reviewed").map((i: any) => i.title);

    return {
      businessName: business.name || "Unknown",
      country: business.countryCode || "MY",
      homeCurrency: business.homeCurrency || "MYR",
      totalIncome: Math.round(totalIncome),
      totalExpenses: Math.round(totalExpenses),
      transactionCount: recentJE.length,
      topVendors: topSuppliers,
      topSuppliers,
      topMerchants,
      categories,
      arOutstanding: Math.round(arOutstanding),
      arOverdueCount,
      apPending: Math.round(pendingPayables),
      apOverdue: Math.round(overduePayables),
      existingInsightTitles,
    };
  },
});

/**
 * Helper query: get transaction details for affected entities
 * Looks up journal entries by ID string.
 */
export const getTransactionDetails = internalQuery({
  args: { transactionIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const details: string[] = [];
    for (const idStr of args.transactionIds) {
      try {
        // Try as journal entry
        const allJE = await ctx.db.query("journal_entries").collect();
        const je = allJE.find((e: any) => e._id.toString() === idStr);
        if (je) {
          // Get lines for description
          const lines = await ctx.db
            .query("journal_entry_lines")
            .withIndex("by_journal_entry", (q: any) => q.eq("journalEntryId", je._id))
            .collect();

          const expenseLines = lines.filter((l: any) => l.accountCode >= "5000" && l.accountCode < "6000" && l.debitAmount > 0);
          const vendorLine = lines.find((l: any) => l.entityType === "vendor");
          const vendorName = vendorLine?.entityName || "Unknown";
          const category = expenseLines[0]?.accountName || "uncategorized";

          details.push(
            `- ${je.sourceType || "manual"}: ${vendorName}, ${je.totalDebit.toLocaleString()} ${je.homeCurrency || ""}, ${je.transactionDate || ""}, category: ${category}, status: ${je.status || "unknown"}`
          );
        }
      } catch {
        // Skip if can't resolve
      }
    }
    return details.join("\n");
  },
});

/**
 * Helper mutation: patch insight with enriched content
 */
export const patchInsightEnrichment = internalMutation({
  args: {
    insightId: v.id("actionCenterInsights"),
    enrichedDescription: v.string(),
    enrichedRecommendation: v.string(),
    originalDescription: v.string(),
    originalRecommendation: v.string(),
    connectedSignal: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const insight = await ctx.db.get(args.insightId);
    if (!insight) return;

    const existingMetadata = (insight.metadata as Record<string, unknown>) || {};

    await ctx.db.patch(args.insightId, {
      description: args.enrichedDescription,
      recommendedAction: args.enrichedRecommendation,
      metadata: {
        ...existingMetadata,
        originalDescription: args.originalDescription,
        originalRecommendation: args.originalRecommendation,
        connectedSignal: args.connectedSignal,
        aiEnriched: true,
      },
    });
  },
});

/**
 * Enrich any recent unenriched insights for a business.
 * Scheduled after real-time detection (analyzeNewTransaction) creates insights.
 */
export const enrichRecentInsights = internalAction({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const recentInsights = await ctx.runQuery(
      internal.functions.actionCenterJobs.getRecentUnenrichedInsights,
      { businessId: args.businessId }
    );

    for (const insight of recentInsights) {
      await ctx.scheduler.runAfter(0, internal.functions.actionCenterJobs.enrichInsight, {
        insightId: insight._id,
      });
    }

    if (recentInsights.length > 0) {
      console.log(`[Layer2] Scheduled enrichment for ${recentInsights.length} insights (business ${args.businessId})`);
    }
  },
});

// ============================================
// LAYER 2b: AI NOVEL DISCOVERY
// ============================================

/**
 * AI-powered novel discovery — finds patterns that hard-coded algorithms miss.
 *
 * Runs daily via cron. For each business:
 * 1. Queries structured business summary
 * 2. Calls LLM to find 0-3 novel patterns
 * 3. Creates new insights for valid findings
 */
export const runAIDiscovery = internalAction({
  args: {},
  handler: async (ctx): Promise<{ businessesAnalyzed: number; insightsCreated: number; durationMs: number }> => {
    console.log("[Layer2b] Starting AI discovery run");
    const startTime = Date.now();

    const businesses = await ctx.runQuery(internal.functions.actionCenterJobs.getActiveBusinesses);
    let totalInsights = 0;

    for (const business of businesses) {
      const businessIdStr = business._id.toString();

      // Get members for insight creation
      const members = await ctx.runQuery(internal.functions.actionCenterJobs.getBusinessMembers, {
        businessId: business._id,
      });

      if (members.length === 0) continue;

      // Call MCP tools for structured intelligence (single source of truth)
      const mcpResults = await callMCPToolsBatch(businessIdStr, [
        { toolName: "detect_anomalies", args: { date_range_days: 90, sensitivity: "medium" } },
        { toolName: "forecast_cash_flow", args: { horizon_days: 30, scenario: "moderate" } },
        { toolName: "analyze_vendor_risk", args: {} },
      ]);

      // Also get basic summary for context
      const summary = await ctx.runQuery(internal.functions.actionCenterJobs.getBusinessSummary, {
        businessId: business._id,
      });

      if (!summary || summary.transactionCount < 5) continue;

      // Format MCP results for LLM consumption
      const anomalyData = mcpResults["detect_anomalies"] as any;
      const forecastData = mcpResults["forecast_cash_flow"] as any;
      const vendorData = mcpResults["analyze_vendor_risk"] as any;

      const mcpIntelligence = [
        // Anomalies
        anomalyData?.anomalies?.length > 0
          ? `ANOMALIES (${anomalyData.anomalies.length} found):\n${anomalyData.anomalies.slice(0, 5).map((a: any) =>
              `  - ${a.description}: ${a.amount} ${a.currency}, z-score ${a.z_score?.toFixed(1)}, severity: ${a.severity}`
            ).join("\n")}`
          : "ANOMALIES: None detected",
        // Cash flow forecast
        forecastData?.alerts?.length > 0
          ? `CASH FLOW ALERTS:\n${forecastData.alerts.map((a: any) =>
              `  - ${a.type}: ${a.message}`
            ).join("\n")}`
          : "CASH FLOW: Healthy — no alerts",
        // Vendor risks
        vendorData?.concentration_risks?.length > 0
          ? `VENDOR RISKS:\n${vendorData.concentration_risks.map((r: any) =>
              `  - ${r.vendor_name}: ${r.percentage?.toFixed(0)}% of ${r.category} spend`
            ).join("\n")}`
          : "VENDOR RISKS: No concentration risks",
        vendorData?.spending_changes?.length > 0
          ? `SPENDING CHANGES:\n${vendorData.spending_changes.slice(0, 3).map((c: any) =>
              `  - ${c.vendor_name}: ${c.direction} ${Math.abs(c.change_percentage)?.toFixed(0)}%`
            ).join("\n")}`
          : "",
      ].filter(Boolean).join("\n\n");

      const systemPrompt = `You are a CFO-grade financial analyst for Southeast Asian SMEs.
Review this business's intelligence report and find 0-3 actionable insights that standard detection rules missed.
Focus on CROSS-DOMAIN patterns — connections between anomalies, cash flow, and supplier risks that individual tools can't see.

CRITICAL RULES:
1. TERMINOLOGY: Use "supplier" for AP/COGS payees, "merchant" for expense-claim payees. NEVER use "vendor".
2. DOMAIN SEPARATION: Supplier concentration/risk analysis applies ONLY to AP suppliers. Do NOT analyze expense-claim merchants for concentration risk — employees can eat at the same restaurant without it being a business risk.
3. MATERIALITY: Only flag findings that represent >1% of monthly expenses. Ignore trivial amounts regardless of statistical deviation.
4. NO GENERIC ADVICE: Do not suggest "diversifying merchants" or "reviewing small expenses". Focus on findings a CFO would act on.
5. If nothing notable beyond what's already flagged, respond with an empty array.

Respond ONLY in valid JSON array — no markdown, no explanation outside the array.`;

      const userPrompt = `Business: ${summary.businessName} (${summary.country})
Home currency: ${summary.homeCurrency}

=== MCP INTELLIGENCE REPORT ===
${mcpIntelligence}

=== BUSINESS SUMMARY (90 days) ===
- Income: ${summary.totalIncome.toLocaleString()} from ${summary.transactionCount} transactions
- Expenses: ${summary.totalExpenses.toLocaleString()}
- Categories: ${summary.categories.join(", ") || "None"}
- Top suppliers (AP — supply-chain risk relevant): ${summary.topSuppliers?.join(", ") || summary.topVendors?.join(", ") || "None"}
- Top merchants (Expense Claims — NOT relevant for concentration risk): ${summary.topMerchants?.join(", ") || "None"}
- AR outstanding: ${summary.arOutstanding.toLocaleString()} (${summary.arOverdueCount} overdue)
- AP pending: ${summary.apPending.toLocaleString()} (${(summary.apOverdue || 0).toLocaleString()} overdue)
- Expense claims: ${summary.claimCount} recent claims

Already flagged (do NOT repeat these):
${summary.existingInsightTitles.slice(0, 10).map((t: string) => `- ${t}`).join("\n") || "- None"}

Respond with JSON array (0-3 items):
[{"title":"Short title (max 80 chars)","description":"Why this matters (2-3 sentences)","category":"anomaly|optimization|compliance|cashflow","priority":"high|medium|low","recommendation":"Specific action to take"}]`;

      interface DiscoveryInsight {
        title?: string;
        description?: string;
        category?: string;
        priority?: string;
        recommendation?: string;
      }

      const discoveries = await callLLMJson<DiscoveryInsight[]>({
        systemPrompt,
        userPrompt,
        maxTokens: 600,
        temperature: 0.4,
      });

      if (!discoveries || !Array.isArray(discoveries) || discoveries.length === 0) {
        continue;
      }

      // Create insights for valid discoveries
      const validCategories = ["anomaly", "compliance", "deadline", "cashflow", "optimization", "categorization"];
      const validPriorities = ["critical", "high", "medium", "low"];
      const memberUserIds = members.map((m: any) => m.userId.toString());

      for (const disc of discoveries.slice(0, 3)) {
        if (!disc.title || !disc.description) continue;

        // POST-LLM VALIDATION: Reject insights that violate domain separation rules
        // LLMs sometimes ignore prompt instructions, so we enforce rules programmatically
        const combinedText = `${disc.title} ${disc.description} ${disc.recommendation || ""}`.toLowerCase();
        const hasForbiddenVendorTerms = /\bvendor\b/.test(combinedText) && (
          combinedText.includes("expense") ||
          combinedText.includes("meal") ||
          combinedText.includes("merchant") ||
          combinedText.includes("claim")
        );
        if (hasForbiddenVendorTerms) {
          console.log(`[Layer2b] Rejected LLM insight (vendor term in expense context): "${disc.title}"`);
          continue;
        }
        // Reject insights about individual small expense amounts (not CFO-grade)
        const smallAmountMatch = combinedText.match(/(\d+\.?\d*)\s*myr/);
        if (smallAmountMatch) {
          const mentionedAmount = parseFloat(smallAmountMatch[1]);
          if (mentionedAmount < 500 && summary.totalExpenses > 0) {
            console.log(`[Layer2b] Rejected LLM insight (trivial amount ${mentionedAmount} MYR): "${disc.title}"`);
            continue;
          }
        }

        const category = validCategories.includes(disc.category || "") ? disc.category! : "optimization";
        const priority = validPriorities.includes(disc.priority || "") ? disc.priority! : "medium";

        // Dedup: check if similar title already exists
        const existingInsights = await ctx.runQuery(internal.functions.actionCenterJobs.checkInsightExists, {
          businessId: business._id.toString(),
          title: disc.title,
        });

        if (existingInsights) continue;

        // Create for each member
        for (const userId of memberUserIds) {
          await ctx.runMutation(internal.functions.actionCenterInsights.internalCreate, {
            userId,
            businessId: business._id.toString(),
            category: category as "anomaly" | "compliance" | "deadline" | "cashflow" | "optimization" | "categorization",
            priority: priority as "critical" | "high" | "medium" | "low",
            title: disc.title.slice(0, 100),
            description: disc.description,
            affectedEntities: [],
            recommendedAction: disc.recommendation || "Review this pattern and take appropriate action.",
            metadata: {
              insightType: "ai_discovery",
              aiGenerated: true,
            },
          });
          totalInsights++;
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[Layer2b] AI discovery complete. Businesses: ${businesses.length}, ` +
      `New insights: ${totalInsights}, Duration: ${duration}ms`
    );

    return { businessesAnalyzed: businesses.length, insightsCreated: totalInsights, durationMs: duration };
  },
});

/**
 * Helper query: get recently created insights that haven't been AI-enriched yet
 */
export const getRecentUnenrichedInsights = internalQuery({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    const insights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_business_priority", (q: any) => q.eq("businessId", args.businessId))
      .collect();

    // Return insights created in last 5 minutes that aren't enriched yet
    return insights.filter(
      (i) =>
        i.detectedAt > fiveMinutesAgo &&
        !(i.metadata as any)?.aiEnriched
    );
  },
});

/**
 * Helper query: check if an insight with similar title exists for a business
 */
export const checkInsightExists = internalQuery({
  args: {
    businessId: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const insights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_business_priority", (q: any) => q.eq("businessId", args.businessId))
      .collect();

    const dedupCutoff = Date.now() - DEDUP_WINDOW_MS;
    return insights.some(
      (i) =>
        i.title === args.title &&
        i.detectedAt > dedupCutoff &&
        i.status !== "actioned"
    );
  },
});

// ============================================
// TEST UTILITIES
// ============================================

/**
 * Test action for running proactive analysis on a specific business
 * Use for manual testing: npx convex run functions/actionCenterJobs:testRunAnalysis '{"businessId":"..."}'
 * Internal-only — not exposed to frontend clients.
 */
export const testRunAnalysis = internalAction({
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
