/**
 * Automation Rate Metric Queries
 * Feature: 001-surface-automation-rate
 *
 * Aggregates AI decisions and corrections from 4 sources:
 * - AR Reconciliation (sales_orders + order_matching_corrections)
 * - Bank Classification (bank_transactions + bank_recon_corrections)
 * - Fee Breakdown (sales_orders.classifiedFees tier 2)
 * - Expense OCR (expense_claims with version > 1)
 */

import { v } from "convex/values";
import { query, action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// ============================================
// INPUT VALIDATORS
// ============================================

const getPeriodDateRangeArgs = {
  businessId: v.id("businesses"),
  period: v.union(
    v.literal("today"),
    v.literal("week"),
    v.literal("month"),
    v.literal("custom")
  ),
  startDate: v.optional(v.string()), // ISO date YYYY-MM-DD
  endDate: v.optional(v.string()),   // ISO date YYYY-MM-DD
};

const getAutomationRateTrendArgs = {
  businessId: v.id("businesses"),
  weeks: v.optional(v.number()), // default 8, max 52
};

const getLifetimeStatsArgs = {
  businessId: v.id("businesses"),
};

const getMilestonesArgs = {
  businessId: v.id("businesses"),
};

const checkMilestonesArgs = {
  businessId: v.id("businesses"),
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert period enum to Unix timestamp range (ms)
 */
function calculatePeriodDateRange(
  period: "today" | "week" | "month" | "custom",
  startDate?: string,
  endDate?: string
): { start: number; end: number; label: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "custom") {
    if (!startDate || !endDate) {
      throw new Error("startDate and endDate required for custom period");
    }
    return {
      start: new Date(startDate).getTime(),
      end: new Date(endDate).getTime() + 86400000 - 1, // End of day
      label: `${startDate} - ${endDate}`,
    };
  }

  if (period === "today") {
    return {
      start: today.getTime(),
      end: today.getTime() + 86400000 - 1, // End of today
      label: "Today",
    };
  }

  if (period === "week") {
    // Start of this week (Monday)
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() + daysToMonday);

    return {
      start: startOfWeek.getTime(),
      end: now.getTime(),
      label: "This week",
    };
  }

  if (period === "month") {
    // Start of this month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start: startOfMonth.getTime(),
      end: now.getTime(),
      label: "This month",
    };
  }

  throw new Error(`Invalid period: ${period}`);
}

/**
 * Generate week boundaries (Monday-Sunday) for trend chart
 */
function generateWeekRanges(weeks: number): Array<{
  weekStart: number; // Unix timestamp Monday 00:00:00
  weekEnd: number;   // Unix timestamp Sunday 23:59:59
  label: string;     // "Week of Mar 3"
}> {
  const ranges = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = 0; i < weeks; i++) {
    // Calculate Monday of the week (going backwards)
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + daysToMonday - (i * 7));

    // Calculate Sunday (end of week)
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // Format label
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const label = `Week of ${monthNames[monday.getMonth()]} ${monday.getDate()}`;

    ranges.unshift({
      weekStart: monday.getTime(),
      weekEnd: sunday.getTime(),
      label,
    });
  }

  return ranges;
}

// ============================================
// CORE AGGREGATION FUNCTION
// ============================================

/**
 * Aggregate automation rate data from all 4 AI sources
 * Returns total decisions and decisions reviewed (corrections)
 */
export async function aggregateAutomationRateData(
  ctx: any,
  businessId: Id<"businesses">,
  startTime: number,
  endTime: number
): Promise<{
  totalDecisions: number;
  decisionsReviewed: number;
  sources: {
    arRecon: { total: number; reviewed: number };
    bankRecon: { total: number; reviewed: number };
    feeClassification: { total: number; reviewed: number };
    expenseOCR: { total: number; reviewed: number };
  };
}> {
  // Run all 4 source queries in parallel
  const [arData, bankData, feeData, expenseData] = await Promise.all([
    // Source 1: AR Reconciliation
    aggregateARReconData(ctx, businessId, startTime, endTime),
    // Source 2: Bank Classification
    aggregateBankReconData(ctx, businessId, startTime, endTime),
    // Source 3: Fee Breakdown
    aggregateFeeClassificationData(ctx, businessId, startTime, endTime),
    // Source 4: Expense OCR
    aggregateExpenseOCRData(ctx, businessId, startTime, endTime),
  ]);

  return {
    totalDecisions: arData.total + bankData.total + feeData.total + expenseData.total,
    decisionsReviewed: arData.reviewed + bankData.reviewed + feeData.reviewed + expenseData.reviewed,
    sources: {
      arRecon: arData,
      bankRecon: bankData,
      feeClassification: feeData,
      expenseOCR: expenseData,
    },
  };
}

/**
 * AR Reconciliation: AI decisions from sales_orders, corrections from order_matching_corrections
 * Deduplication: First correction only per orderReference
 */
async function aggregateARReconData(
  ctx: any,
  businessId: Id<"businesses">,
  startTime: number,
  endTime: number
): Promise<{ total: number; reviewed: number }> {
  // Query AI-matched sales orders in period
  const aiOrders = await ctx.db
    .query("sales_orders")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .filter((q: any) =>
      q.and(
        q.neq(q.field("aiMatchStatus"), undefined),
        q.gte(q.field("createdAt"), startTime),
        q.lte(q.field("createdAt"), endTime)
      )
    )
    .collect();

  // Query corrections in period
  const corrections = await ctx.db
    .query("order_matching_corrections")
    .withIndex("by_businessId_createdAt", (q: any) =>
      q.eq("businessId", businessId).gte("createdAt", startTime).lte("createdAt", endTime)
    )
    .collect();

  // Deduplicate corrections by orderReference (first correction only)
  const correctedOrders = new Set<string>();
  for (const correction of corrections) {
    if (correction.orderReference) {
      correctedOrders.add(correction.orderReference);
    }
  }

  return {
    total: aiOrders.length,
    reviewed: correctedOrders.size,
  };
}

/**
 * Bank Classification: AI decisions from bank_transactions, corrections from bank_recon_corrections
 * Deduplication: First correction only per (bankTransactionDescription + vendorName)
 */
async function aggregateBankReconData(
  ctx: any,
  businessId: Id<"businesses">,
  startTime: number,
  endTime: number
): Promise<{ total: number; reviewed: number }> {
  // Query bank transactions with AI classification in period
  const classifiedTransactions = await ctx.db
    .query("bank_transactions")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .filter((q: any) =>
      q.and(
        q.or(
          q.neq(q.field("classificationTier"), undefined),
          q.neq(q.field("suggestedDebitAccountId"), undefined)
        ),
        q.gte(q.field("_creationTime"), startTime),
        q.lte(q.field("_creationTime"), endTime)
      )
    )
    .collect();

  // Query corrections in period
  const corrections = await ctx.db
    .query("bank_recon_corrections")
    .withIndex("by_businessId_createdAt", (q: any) =>
      q.eq("businessId", businessId).gte("createdAt", startTime).lte("createdAt", endTime)
    )
    .collect();

  // Deduplicate corrections by unique key
  const correctedTransactions = new Set<string>();
  for (const correction of corrections) {
    const key = `${correction.bankTransactionDescription || ""}_${correction.vendorName || ""}`;
    correctedTransactions.add(key);
  }

  return {
    total: classifiedTransactions.length,
    reviewed: correctedTransactions.size,
  };
}

/**
 * Fee Breakdown: AI tier 2 classifications from sales_orders.classifiedFees
 * No corrections table yet - assume 100% rate (0 corrections)
 */
async function aggregateFeeClassificationData(
  ctx: any,
  businessId: Id<"businesses">,
  startTime: number,
  endTime: number
): Promise<{ total: number; reviewed: number }> {
  // Query sales orders with tier 2 fee classifications in period
  const ordersWithFees = await ctx.db
    .query("sales_orders")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .filter((q: any) =>
      q.and(
        q.neq(q.field("classifiedFees"), undefined),
        q.gte(q.field("createdAt"), startTime),
        q.lte(q.field("createdAt"), endTime)
      )
    )
    .collect();

  // Count tier 2 classifications
  let tier2Count = 0;
  for (const order of ordersWithFees) {
    if (order.classifiedFees && Array.isArray(order.classifiedFees)) {
      for (const fee of order.classifiedFees) {
        if (fee.tier === 2) {
          tier2Count++;
        }
      }
    }
  }

  return {
    total: tier2Count,
    reviewed: 0, // No correction UI yet - assume 100% accuracy
  };
}

/**
 * Expense OCR: AI decisions from expense_claims, edits tracked via version > 1
 * Deduplication: First edit only per expense claim ID
 */
async function aggregateExpenseOCRData(
  ctx: any,
  businessId: Id<"businesses">,
  startTime: number,
  endTime: number
): Promise<{ total: number; reviewed: number }> {
  // Query expense claims with OCR data in period
  const claimsWithOCR = await ctx.db
    .query("expense_claims")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .filter((q: any) =>
      q.and(
        q.neq(q.field("confidenceScore"), undefined),
        q.gte(q.field("_creationTime"), startTime),
        q.lte(q.field("_creationTime"), endTime)
      )
    )
    .collect();

  // Count claims that were edited (version > 1 AND confidenceScore exists)
  const editedClaims = claimsWithOCR.filter((claim: any) => (claim.version || 1) > 1);

  return {
    total: claimsWithOCR.length,
    reviewed: editedClaims.length,
  };
}

// ============================================
// QUERIES
// ============================================

// ============================================
// PUBLIC ACTIONS (non-reactive — called once on mount)
// Internal queries live in automationRateInternal.ts to avoid circular refs.
// ============================================

/**
 * Get current automation rate — public action (NOT reactive query).
 */
export const getAutomationRate = action({
  args: getPeriodDateRangeArgs,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: async (ctx, args): Promise<any> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const range = calculatePeriodDateRange(args.period, args.startDate, args.endDate);
    return ctx.runQuery((internal.functions as any).automationRateInternal._computeAutomationRate, {
      businessId: args.businessId as string,
      periodStart: range.start,
      periodEnd: range.end,
      periodLabel: range.label,
    });
  },
});

/**
 * Get weekly trend data — public action (NOT reactive query).
 */
export const getAutomationRateTrend = action({
  args: getAutomationRateTrendArgs,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: async (ctx, args): Promise<any> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const weeks = Math.min(Math.max(args.weeks ?? 8, 1), 52);
    const weekRanges = generateWeekRanges(weeks);

    return ctx.runQuery((internal.functions as any).automationRateInternal._computeTrendData, {
      businessId: args.businessId as string,
      weekRangesJson: JSON.stringify(weekRanges),
    });
  },
});

/**
 * Get lifetime stats — public action (NOT reactive query).
 */
export const getLifetimeStats = action({
  args: getLifetimeStatsArgs,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: async (ctx, args): Promise<any> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return ctx.runQuery((internal.functions as any).automationRateInternal._computeLifetimeStats, {
      businessId: args.businessId as string,
    });
  },
});

/**
 * Get milestone achievement status for a business
 * Used by: Client milestone subscription hook
 */
export const getMilestones = query({
  args: getMilestonesArgs,
  handler: async (ctx, args) => {
    const { businessId } = args;

    // Get business record
    const business = await ctx.db.get(businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Return milestone timestamps (undefined if not achieved)
    return {
      milestone_90: business.automationMilestones?.milestone_90,
      milestone_95: business.automationMilestones?.milestone_95,
      milestone_99: business.automationMilestones?.milestone_99,
    };
  },
});

/**
 * Check and update milestone achievements for a business
 * Called by cron job - uses internalMutation (not exposed to client)
 */
export const checkMilestones = internalMutation({
  args: checkMilestonesArgs,
  handler: async (ctx, args) => {
    const { businessId } = args;

    // Get business record
    const business = await ctx.db.get(businessId);
    if (!business) return { newlyAchieved: [] };

    // Get current lifetime rate
    const data = await aggregateAutomationRateData(ctx, businessId, 0, Date.now());
    if (data.totalDecisions < 10) return { newlyAchieved: [] };

    const rate = ((data.totalDecisions - data.decisionsReviewed) / data.totalDecisions) * 100;

    const milestones = business.automationMilestones || {};
    const newlyAchieved: Array<{ threshold: number; currentRate: number; timestamp: number }> = [];
    const now = Date.now();

    // Check each threshold
    const thresholds = [
      { key: "milestone_90" as const, value: 90 },
      { key: "milestone_95" as const, value: 95 },
      { key: "milestone_99" as const, value: 99 },
    ];

    let updated = false;
    const updatedMilestones = { ...milestones };

    for (const { key, value } of thresholds) {
      if (rate >= value && !milestones[key]) {
        updatedMilestones[key] = now;
        newlyAchieved.push({ threshold: value, currentRate: rate, timestamp: now });
        updated = true;
      }
    }

    // Persist if any new milestones
    if (updated) {
      await ctx.db.patch(businessId, {
        automationMilestones: updatedMilestones,
      });
    }

    return { newlyAchieved };
  },
});

/**
 * Check milestones for ALL businesses (called by cron)
 */
export const checkAllBusinessMilestones = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all businesses
    const businesses = await ctx.db.query("businesses").collect();

    for (const business of businesses) {
      try {
        // Inline check (avoid internal function calls in Convex)
        const data = await aggregateAutomationRateData(ctx, business._id, 0, Date.now());
        if (data.totalDecisions < 10) continue;

        const rate = ((data.totalDecisions - data.decisionsReviewed) / data.totalDecisions) * 100;
        const milestones = business.automationMilestones || {};
        const now = Date.now();
        let updated = false;
        const updatedMilestones = { ...milestones };

        for (const { key, value } of [
          { key: "milestone_90" as const, value: 90 },
          { key: "milestone_95" as const, value: 95 },
          { key: "milestone_99" as const, value: 99 },
        ]) {
          if (rate >= value && !milestones[key]) {
            updatedMilestones[key] = now;
            updated = true;
          }
        }

        if (updated) {
          await ctx.db.patch(business._id, {
            automationMilestones: updatedMilestones,
          });
        }
      } catch {
        // Skip businesses that fail — don't block others
        continue;
      }
    }
  },
});
