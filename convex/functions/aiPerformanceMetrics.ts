/**
 * AI Performance Metrics — Real-time aggregation for the AI Performance Widget
 *
 * Extends the bridge pattern from aiDigest.ts with date-range filtering,
 * confidence averaging, and period-over-period trend comparison.
 *
 * Data sources: sales_orders (AR + fees), bank_transactions, corrections tables.
 * No new tables — all metrics derived from existing data.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";

// Reuse time saved estimates from aiDigest.ts
const TIME_SAVED = {
  ar_matching: 120,       // 2 min per manual AR match
  bank_recon: 90,         // 1.5 min per bank classification
  fee_classification: 60, // 1 min per fee classification
  auto_agent: 300,        // 5 min saved by full auto-approval (Triple-Lock)
};

type Period = "this_month" | "last_3_months" | "all_time";

interface PeriodBounds {
  start: number;
  end: number;
}

function getPeriodBounds(period: Period): { current: PeriodBounds; previous: PeriodBounds | null } {
  const now = Date.now();
  const today = new Date();

  if (period === "this_month") {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime();
    return {
      current: { start: monthStart, end: now },
      previous: { start: prevMonthStart, end: monthStart },
    };
  }

  if (period === "last_3_months") {
    const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1).getTime();
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, 1).getTime();
    return {
      current: { start: threeMonthsAgo, end: now },
      previous: { start: sixMonthsAgo, end: threeMonthsAgo },
    };
  }

  // all_time — no previous period for trend comparison
  return {
    current: { start: 0, end: now },
    previous: null,
  };
}

interface FeatureMetrics {
  total: number;
  confidence: number; // average confidence (0-1)
  corrections: number;
}

interface PeriodMetrics {
  overallConfidence: number;
  editRate: number;
  noEditRate: number;
  automationRate: number;
  missingFieldsRate: number;
  totalAiDecisions: number;
  decisionsRequiringReview: number;
  estimatedHoursSaved: number;
  distribution: {
    noEdit: number;
    edited: number;
    missing: number;
  };
  featureBreakdown: {
    ar: FeatureMetrics;
    bank: FeatureMetrics;
    fee: FeatureMetrics;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeMetricsForPeriod(ctx: any, businessId: string, bounds: PeriodBounds): Promise<PeriodMetrics> {
  const { start, end } = bounds;

  // ── AR Matching ──
  const allOrders = await ctx.db
    .query("sales_orders")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periodOrders = allOrders.filter((o: any) => {
    const ts = o.updatedAt ?? o._creationTime ?? 0;
    return ts >= start && ts <= end;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arWithAi = periodOrders.filter((o: any) => o.aiMatchTier === 1 || o.aiMatchTier === 2);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arAutoApproved = periodOrders.filter((o: any) => o.aiMatchStatus === "auto_approved").length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arApproved = periodOrders.filter((o: any) => o.aiMatchStatus === "approved").length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arPending = periodOrders.filter((o: any) => o.aiMatchStatus === "pending_review").length;

  // AR confidence: average of top suggestion confidence
  let arConfidenceSum = 0;
  let arConfidenceCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of arWithAi as any[]) {
    const conf = o.aiMatchSuggestions?.[0]?.confidence ?? o.matchConfidence;
    if (conf != null && conf > 0) {
      arConfidenceSum += conf;
      arConfidenceCount++;
    }
  }

  // ── Bank Recon ──
  let bankTotal = 0;
  let bankClassified = 0;
  let bankPending = 0;
  let bankConfidenceSum = 0;
  let bankConfidenceCount = 0;
  try {
    const bankTxns = await ctx.db
      .query("bank_transactions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const periodBank = bankTxns.filter((t: any) => {
      const ts = t.updatedAt ?? t.createdAt ?? t._creationTime ?? 0;
      return ts >= start && ts <= end;
    });

    bankTotal = periodBank.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bankClassified = periodBank.filter((t: any) => t.classificationTier && t.suggestedDebitAccountCode).length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bankPending = periodBank.filter((t: any) => t.classificationTier && !t.confirmedAt).length;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of periodBank as any[]) {
      if (t.classificationConfidence != null && t.classificationConfidence > 0) {
        bankConfidenceSum += t.classificationConfidence;
        bankConfidenceCount++;
      }
    }
  } catch {
    // Bank tables might not exist on all branches
  }

  // ── Fee Classification ──
  let feeTotal = 0;
  let feeClassified = 0;
  let feeMissing = 0;
  let feeConfidenceSum = 0;
  let feeConfidenceCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feeOrders = periodOrders.filter((o: any) => o.classifiedFees && o.classifiedFees.length > 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const order of feeOrders as any[]) {
    const fees = order.classifiedFees ?? [];
    feeTotal += fees.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    feeClassified += fees.filter((f: any) => f.tier === 1 || f.tier === 2).length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    feeMissing += fees.filter((f: any) => !f.accountCode).length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const f of fees as any[]) {
      if (f.confidence != null && f.confidence > 0) {
        feeConfidenceSum += f.confidence;
        feeConfidenceCount++;
      }
    }
  }

  // ── Corrections ──
  let arCorrections = 0;
  try {
    const allArCorrections = await ctx.db
      .query("order_matching_corrections")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_businessId_createdAt", (q: any) => q.eq("businessId", businessId))
      .collect();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arCorrections = allArCorrections.filter((c: any) => c.createdAt >= start && c.createdAt <= end).length;
  } catch {
    // Table might not exist
  }

  let bankCorrections = 0;
  try {
    const allBankCorrections = await ctx.db
      .query("bank_recon_corrections")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bankCorrections = allBankCorrections.filter((c: any) => c.createdAt >= start && c.createdAt <= end).length;
  } catch {
    // Table might not exist
  }

  let feeCorrections = 0;
  try {
    const allFeeCorrections = await ctx.db
      .query("fee_classification_corrections")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    feeCorrections = allFeeCorrections.filter((c: any) => {
      const ts = (c as any)._creationTime ?? 0;
      return ts >= start && ts <= end;
    }).length;
  } catch {
    // Table might not exist
  }

  // ── Aggregate ──
  const totalAiDecisions = arWithAi.length + bankClassified + feeClassified;
  const totalCorrections = arCorrections + bankCorrections + feeCorrections;
  const totalAccepted = totalAiDecisions - totalCorrections;
  const decisionsRequiringReview = arPending + bankPending + totalCorrections;

  // Volume-weighted confidence
  const totalConfidenceWeight = arConfidenceCount + bankConfidenceCount + feeConfidenceCount;
  const overallConfidence = totalConfidenceWeight > 0
    ? ((arConfidenceSum + bankConfidenceSum + feeConfidenceSum) / totalConfidenceWeight) * 100
    : 0;

  const editRate = totalAiDecisions > 0 ? (totalCorrections / totalAiDecisions) * 100 : 0;
  const noEditRate = totalAiDecisions > 0 ? 100 - editRate : 0;

  // Automation rate: auto-approved / total eligible (AR only for now — Triple-Lock)
  const totalEligible = arWithAi.length; // Only AR has auto-approval currently
  const automationRate = totalEligible > 0 ? (arAutoApproved / totalEligible) * 100 : 0;

  // Missing fields rate (OCR/fee only)
  const missingFieldsRate = feeTotal > 0 ? (feeMissing / feeTotal) * 100 : 0;

  // Hours saved calculation
  const arSuccessful = arApproved + arAutoApproved + arWithAi.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (o: any) => o.aiMatchTier === 1
  ).length;
  const totalTimeSavedSeconds =
    (arSuccessful - arAutoApproved) * TIME_SAVED.ar_matching +
    arAutoApproved * TIME_SAVED.auto_agent +
    bankClassified * TIME_SAVED.bank_recon +
    feeClassified * TIME_SAVED.fee_classification;

  return {
    overallConfidence: Math.round(overallConfidence * 10) / 10,
    editRate: Math.round(editRate * 10) / 10,
    noEditRate: Math.round(noEditRate * 10) / 10,
    automationRate: Math.round(automationRate * 10) / 10,
    missingFieldsRate: Math.round(missingFieldsRate * 10) / 10,
    totalAiDecisions,
    decisionsRequiringReview,
    estimatedHoursSaved: Math.round((totalTimeSavedSeconds / 3600) * 10) / 10,
    distribution: {
      noEdit: Math.max(0, totalAccepted),
      edited: totalCorrections,
      missing: feeMissing,
    },
    featureBreakdown: {
      ar: {
        total: arWithAi.length,
        confidence: arConfidenceCount > 0 ? Math.round((arConfidenceSum / arConfidenceCount) * 1000) / 10 : 0,
        corrections: arCorrections,
      },
      bank: {
        total: bankClassified,
        confidence: bankConfidenceCount > 0 ? Math.round((bankConfidenceSum / bankConfidenceCount) * 1000) / 10 : 0,
        corrections: bankCorrections,
      },
      fee: {
        total: feeClassified,
        confidence: feeConfidenceCount > 0 ? Math.round((feeConfidenceSum / feeConfidenceCount) * 1000) / 10 : 0,
        corrections: feeCorrections,
      },
    },
  };
}

/**
 * Get AI performance metrics for the dashboard widget.
 * Authenticated query — scoped to the user's active business.
 */
export const getAIPerformanceMetrics = query({
  args: {
    businessId: v.id("businesses"),
    period: v.union(
      v.literal("this_month"),
      v.literal("last_3_months"),
      v.literal("all_time")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const { current, previous } = getPeriodBounds(args.period);

    const currentMetrics = await computeMetricsForPeriod(ctx, args.businessId as string, current);

    // Compute trend deltas if previous period exists
    let trends: {
      confidenceDelta: number | null;
      editRateDelta: number | null;
      automationRateDelta: number | null;
      hoursSavedDelta: number | null;
    } | null = null;

    if (previous) {
      const prevMetrics = await computeMetricsForPeriod(ctx, args.businessId as string, previous);
      if (prevMetrics.totalAiDecisions > 0) {
        trends = {
          confidenceDelta: Math.round((currentMetrics.overallConfidence - prevMetrics.overallConfidence) * 10) / 10,
          editRateDelta: Math.round((currentMetrics.editRate - prevMetrics.editRate) * 10) / 10,
          automationRateDelta: Math.round((currentMetrics.automationRate - prevMetrics.automationRate) * 10) / 10,
          hoursSavedDelta: Math.round((currentMetrics.estimatedHoursSaved - prevMetrics.estimatedHoursSaved) * 10) / 10,
        };
      }
    }

    const periodLabels: Record<Period, string> = {
      this_month: "This Month",
      last_3_months: "Last 3 Months",
      all_time: "All Time",
    };

    return {
      ...currentMetrics,
      trends,
      periodLabel: periodLabels[args.period],
      isEmpty: currentMetrics.totalAiDecisions === 0,
    };
  },
});
