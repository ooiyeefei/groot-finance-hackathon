/**
 * Budget Tracking Functions — Convex backend
 *
 * Provides budget utilization queries and threshold alerting for expense categories.
 *
 * Architecture:
 * - getBudgetUtilization (internalQuery): Reads business categories + expense claims,
 *   computes spend vs budget for each category with a budgetLimit set.
 * - getBudgetStatus (action): Non-reactive wrapper — avoids bandwidth burn from
 *   reactive subscriptions on large expense_claims scans.
 * - checkBudgetThresholds (internalMutation): Creates Action Center insights when
 *   a category crosses 80% or 100% of its monthly budget.
 */

import { v } from "convex/values";
import { query, mutation, action, internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// Statuses that count toward budget spend (approved or paid out)
const BUDGET_COUNTABLE_STATUSES = ["approved", "reimbursed"];

// ============================================
// INTERNAL QUERY — Budget Utilization
// ============================================

/**
 * Calculate budget utilization for a business's expense categories.
 *
 * For each category that has a budgetLimit defined, sums up approved/reimbursed
 * expense claims in the given period (month) and returns utilization metrics.
 */
export const getBudgetUtilization = internalQuery({
  args: {
    businessId: v.id("businesses"),
    categoryId: v.optional(v.string()),
    period: v.optional(v.string()), // "YYYY-MM" format
  },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      return {
        categories: [],
        totalBudget: 0,
        totalSpend: 0,
        overallStatus: "on_track" as const,
        period: "",
        currency: "",
      };
    }

    // Resolve period
    const now = new Date();
    const currentPeriod = args.period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [year, month] = currentPeriod.split("-").map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    // Get custom expense categories with budget limits
    const allCategories = (business.customExpenseCategories as any[]) || [];
    const budgetedCategories = allCategories.filter((cat: any) => {
      if (!cat.budgetLimit || cat.budgetLimit <= 0) return false;
      if (!cat.is_active) return false;
      if (args.categoryId && cat.id !== args.categoryId) return false;
      return true;
    });

    if (budgetedCategories.length === 0) {
      return {
        categories: [],
        totalBudget: 0,
        totalSpend: 0,
        overallStatus: "on_track" as const,
        period: currentPeriod,
        currency: (business as any).homeCurrency || "MYR",
      };
    }

    // Query all expense claims for this business in the period
    const claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Filter to approved/reimbursed claims within the period
    const periodClaims = claims.filter((claim) => {
      // Must be in a budget-countable status
      if (!BUDGET_COUNTABLE_STATUSES.includes(claim.status)) return false;

      // Must have a transaction date within the period
      if (!claim.transactionDate) return false;
      const claimDate = new Date(claim.transactionDate);
      return claimDate >= periodStart && claimDate <= periodEnd;
    });

    // Build a map of category spend
    const categorySpendMap: Record<string, number> = {};
    for (const claim of periodClaims) {
      if (!claim.expenseCategory) continue;
      const amount = claim.homeCurrencyAmount ?? claim.totalAmount ?? 0;
      const key = claim.expenseCategory;
      categorySpendMap[key] = (categorySpendMap[key] || 0) + amount;
    }

    // Build result for each budgeted category
    let totalBudget = 0;
    let totalSpend = 0;

    const categories = budgetedCategories.map((cat: any) => {
      const budgetLimit = cat.budgetLimit as number;
      const budgetCurrency = cat.budgetCurrency || (business as any).homeCurrency || "MYR";

      // Match by category name or ID — expenseCategory field may contain either
      const currentSpend = (categorySpendMap[cat.id] || 0) + (categorySpendMap[cat.category_name] || 0);
      const remaining = budgetLimit - currentSpend;
      const percentUsed = budgetLimit > 0 ? (currentSpend / budgetLimit) * 100 : 0;

      let status: "on_track" | "warning" | "overspent";
      if (percentUsed >= 100) {
        status = "overspent";
      } else if (percentUsed >= 80) {
        status = "warning";
      } else {
        status = "on_track";
      }

      totalBudget += budgetLimit;
      totalSpend += currentSpend;

      return {
        categoryId: cat.id as string,
        categoryName: cat.category_name as string,
        budgetLimit,
        budgetCurrency,
        currentSpend,
        remaining,
        percentUsed: Math.round(percentUsed * 10) / 10, // 1 decimal place
        status,
      };
    });

    // Overall status
    const overallPercent = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0;
    let overallStatus: "on_track" | "warning" | "overspent";
    if (overallPercent >= 100) {
      overallStatus = "overspent";
    } else if (overallPercent >= 80) {
      overallStatus = "warning";
    } else {
      overallStatus = "on_track";
    }

    return {
      categories,
      totalBudget,
      totalSpend,
      overallStatus,
      period: currentPeriod,
      currency: (business as any).homeCurrency || "MYR",
    };
  },
});

// ============================================
// PUBLIC ACTION — Non-reactive budget status
// ============================================

/**
 * Public action wrapper for getBudgetUtilization.
 * Uses action (not query) to avoid reactive subscriptions — saves bandwidth
 * per Rule 1 in CLAUDE.md bandwidth guidelines.
 */
export const getBudgetStatus = action({
  args: {
    businessId: v.string(),
    category: v.optional(v.string()),
    period: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    categories: Array<{
      categoryId: string;
      categoryName: string;
      budgetLimit: number;
      budgetCurrency: string;
      currentSpend: number;
      remaining: number;
      percentUsed: number;
      status: "on_track" | "warning" | "overspent";
    }>;
    totalBudget: number;
    totalSpend: number;
    overallStatus: "on_track" | "warning" | "overspent";
    period: string;
    currency: string;
  }> => {
    // Normalize businessId to Convex ID
    const businessId = args.businessId as Id<"businesses">;

    const result = await ctx.runQuery(internal.functions.budgetTracking.getBudgetUtilization, {
      businessId,
      categoryId: args.category,
      period: args.period,
    });

    return result;
  },
});

// ============================================
// INTERNAL MUTATION — Budget Threshold Alerts
// ============================================

/**
 * Check if a category has crossed budget warning (80%) or exceeded (100%) thresholds.
 * Creates an Action Center insight if no duplicate exists for this category+threshold+period.
 *
 * Called after expense claim approval to detect budget overruns in near-real-time.
 */
export const checkBudgetThresholds = internalMutation({
  args: {
    businessId: v.id("businesses"),
    categoryId: v.string(),
    categoryName: v.string(),
  },
  handler: async (ctx, args): Promise<string | null> => {
    // Get current budget utilization for this category
    const utilization = await ctx.runQuery(internal.functions.budgetTracking.getBudgetUtilization, {
      businessId: args.businessId,
      categoryId: args.categoryId,
    });

    if (!utilization.categories || utilization.categories.length === 0) {
      return null; // No budget set for this category
    }

    const categoryData = utilization.categories[0];
    const { percentUsed, budgetLimit, currentSpend } = categoryData;
    const period = utilization.period;

    // Determine which threshold was crossed
    let insightType: "budget_warning" | "budget_exceeded" | null = null;
    let thresholdCrossed: number | null = null;
    let priority: "high" | "critical" | null = null;

    if (percentUsed >= 100) {
      insightType = "budget_exceeded";
      thresholdCrossed = 100;
      priority = "critical";
    } else if (percentUsed >= 80) {
      insightType = "budget_warning";
      thresholdCrossed = 80;
      priority = "high";
    }

    if (!insightType || !thresholdCrossed || !priority) {
      return null; // Below both thresholds
    }

    // Dedup check: look for existing insight with same categoryId + thresholdCrossed + period
    const existingInsights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_business_priority", (q) =>
        q.eq("businessId", args.businessId as unknown as string)
      )
      .collect();

    const isDuplicate = existingInsights.some((insight) => {
      const meta = insight.metadata as any;
      if (!meta) return false;
      return (
        meta.categoryId === args.categoryId &&
        meta.thresholdCrossed === thresholdCrossed &&
        meta.budgetPeriod === period
      );
    });

    if (isDuplicate) {
      console.log(
        `[BudgetTracking] Skipping duplicate ${insightType} for ${args.categoryName} (${period})`
      );
      return null;
    }

    // Find a userId to attribute the insight to (business owner or first finance_admin)
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const ownerMembership = memberships.find(
      (m) => m.status === "active" && (m.role === "owner" || m.role === "finance_admin")
    );

    const userId = ownerMembership?.userId
      ? String(ownerMembership.userId)
      : "system";

    const title =
      insightType === "budget_exceeded"
        ? `Budget Exceeded: ${args.categoryName}`
        : `Budget Warning: ${args.categoryName}`;

    const description = `${args.categoryName} spending is at ${Math.round(percentUsed)}% of ${utilization.currency} ${budgetLimit.toLocaleString()} monthly budget`;

    const recommendedAction = `Review spending in ${args.categoryName} and consider adjusting budget or reducing expenses`;

    // Create the insight via the existing internalCreate function
    // @ts-ignore — Convex type instantiation depth limit
    const insightId = await ctx.runMutation(internal.functions.actionCenterInsights.internalCreate, {
      userId,
      businessId: args.businessId as unknown as string,
      category: "optimization" as const,
      priority,
      title,
      description,
      affectedEntities: [args.categoryId],
      recommendedAction,
      expiresAt: undefined,
      metadata: {
        insightType,
        categoryId: args.categoryId,
        categoryName: args.categoryName,
        budgetLimit,
        currentSpend,
        percentUsed: Math.round(percentUsed * 10) / 10,
        budgetPeriod: period,
        thresholdCrossed,
      },
    });

    console.log(
      `[BudgetTracking] Created ${insightType} insight for ${args.categoryName}: ${Math.round(percentUsed)}% of budget (${period})`
    );

    return insightId;
  },
});
