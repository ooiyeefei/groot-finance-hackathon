/**
 * Internal queries for automation rate — separated from actions to avoid
 * TypeScript circular reference errors (action referencing internal in same file).
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { aggregateAutomationRateData } from "./automationRate";

export const _computeAutomationRate = internalQuery({
  args: {
    businessId: v.string(),
    periodStart: v.number(),
    periodEnd: v.number(),
    periodLabel: v.string(),
  },
  handler: async (ctx, args) => {
    const data = await aggregateAutomationRateData(
      ctx,
      args.businessId as Id<"businesses">,
      args.periodStart,
      args.periodEnd
    );

    const rate = data.totalDecisions === 0
      ? 0
      : ((data.totalDecisions - data.decisionsReviewed) / data.totalDecisions) * 100;

    const hasMinimumData = data.totalDecisions >= 10;
    let message: string | undefined;
    if (data.totalDecisions === 0) {
      message = "No AI activity in this period";
    } else if (!hasMinimumData) {
      message = "Collecting data... (need 10+ decisions for reliable rate)";
    }

    return {
      rate,
      totalDecisions: data.totalDecisions,
      decisionsReviewed: data.decisionsReviewed,
      period: {
        start: new Date(args.periodStart).toISOString().split("T")[0],
        end: new Date(args.periodEnd).toISOString().split("T")[0],
        label: args.periodLabel,
      },
      hasMinimumData,
      message,
      sources: data.sources,
      timestamp: Date.now(),
    };
  },
});

export const _computeTrendData = internalQuery({
  args: {
    businessId: v.string(),
    weekRangesJson: v.string(),
  },
  handler: async (ctx, args) => {
    const weekRanges = JSON.parse(args.weekRangesJson) as Array<{
      weekStart: number; weekEnd: number; label: string;
    }>;

    const optimizationEvents = await ctx.db
      .query("dspy_model_versions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((q: any) => q.eq(q.field("status"), "active"))
      .collect();

    const trendData = await Promise.all(
      weekRanges.map(async (weekRange) => {
        const data = await aggregateAutomationRateData(
          ctx,
          args.businessId as Id<"businesses">,
          weekRange.weekStart,
          weekRange.weekEnd
        );

        const rate = data.totalDecisions === 0
          ? null
          : ((data.totalDecisions - data.decisionsReviewed) / data.totalDecisions) * 100;

        const eventsInWeek = optimizationEvents.filter((event) => {
          const trainedAt = event.trainedAt || 0;
          return trainedAt >= weekRange.weekStart && trainedAt <= weekRange.weekEnd;
        });

        return {
          weekStart: new Date(weekRange.weekStart).toISOString().split("T")[0],
          weekEnd: new Date(weekRange.weekEnd).toISOString().split("T")[0],
          week: weekRange.label,
          rate,
          totalDecisions: data.totalDecisions,
          decisionsReviewed: data.decisionsReviewed,
          hasMinimumData: data.totalDecisions >= 10,
          optimizationEvents: eventsInWeek.map((event) => ({
            date: event.trainedAt || 0,
            label: "Model optimized",
            modelType: event.domain || "unknown",
            optimizerType: event.optimizerType || "unknown",
          })),
        };
      })
    );

    return trendData;
  },
});

export const _computeLifetimeStats = internalQuery({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const businessId = args.businessId as Id<"businesses">;
    const business = await ctx.db.get(businessId);
    if (!business) return null;

    const data = await aggregateAutomationRateData(ctx, businessId, 0, Date.now());

    const rate = data.totalDecisions === 0
      ? 0
      : ((data.totalDecisions - data.decisionsReviewed) / data.totalDecisions) * 100;

    const [firstAROrder, firstBankTxn, firstExpense] = await Promise.all([
      ctx.db
        .query("sales_orders")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((q: any) => q.neq(q.field("aiMatchStatus"), undefined))
        .order("asc")
        .first(),
      ctx.db
        .query("bank_transactions")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((q: any) => q.neq(q.field("classificationTier"), undefined))
        .order("asc")
        .first(),
      ctx.db
        .query("expense_claims")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((q: any) => q.neq(q.field("confidenceScore"), undefined))
        .order("asc")
        .first(),
    ]);

    const firstDecisionTimes = [
      firstAROrder?.createdAt,
      firstBankTxn?._creationTime,
      firstExpense?._creationTime,
    ].filter((t) => t !== undefined) as number[];

    const firstDecisionDate = firstDecisionTimes.length > 0
      ? new Date(Math.min(...firstDecisionTimes)).toISOString().split("T")[0]
      : null;

    const lastDecisionDate = data.totalDecisions > 0
      ? new Date().toISOString().split("T")[0]
      : null;

    const totalSeconds = data.decisionsReviewed * 120;
    const hours = Math.floor(totalSeconds / 3600);
    const formatted = hours === 0 ? "< 1 hour" : `${hours} hour${hours > 1 ? "s" : ""}`;

    return {
      rate,
      totalDecisions: data.totalDecisions,
      decisionsReviewed: data.decisionsReviewed,
      firstDecisionDate,
      lastDecisionDate,
      sources: data.sources,
      timesSaved: { totalSeconds, formatted },
    };
  },
});
