/**
 * DSPy Metrics — Daily aggregate storage + dashboard queries (027-dspy-dash)
 *
 * Architecture:
 * - internalMutation `upsertMetric` / `recordTier1Hit` / `recordOverride` — atomic counter updates
 * - internalQuery `_getOverview` / `_getBusinessDetail` / `_getCorrectionFunnels` — heavy DB reads
 * - Public action wrappers — one-shot calls for frontend (no reactivity, saves bandwidth)
 *
 * All dashboard reads use action + internalQuery pattern per CLAUDE.md bandwidth rules.
 */

import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

// Tool names constant for validation
const VALID_TOOLS = [
  "classify_fees",
  "classify_bank_transaction",
  "match_orders",
  "match_po_invoice",
  "match_vendor_items",
] as const;

type ToolName = (typeof VALID_TOOLS)[number];

function getTodayUTC(): string {
  return new Date().toISOString().split("T")[0];
}

function getDateRangeStart(timeWindow: string): string {
  const now = new Date();
  if (timeWindow === "24h") {
    now.setDate(now.getDate() - 1);
  } else if (timeWindow === "7d") {
    now.setDate(now.getDate() - 7);
  } else {
    now.setDate(now.getDate() - 30);
  }
  return now.toISOString().split("T")[0];
}

// ─── Internal Mutations (called by HTTP endpoint + Convex internals) ───

export const upsertMetric = internalMutation({
  args: {
    businessId: v.id("businesses"),
    tool: v.string(),
    usedDspy: v.boolean(),
    confidence: v.number(),
    refineRetries: v.number(),
    latencyMs: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    success: v.boolean(),
  },
  handler: async (ctx, args) => {
    const date = getTodayUTC();

    const existing = await ctx.db
      .query("dspy_metrics_daily")
      .withIndex("by_business_tool_date", (q) =>
        q.eq("businessId", args.businessId).eq("tool", args.tool).eq("date", date)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        tier2Invocations: existing.tier2Invocations + 1,
        successCount: existing.successCount + (args.success ? 1 : 0),
        failureCount: existing.failureCount + (args.success ? 0 : 1),
        fallbackCount: existing.fallbackCount + (args.confidence === 0 ? 1 : 0),
        dspyUsedCount: existing.dspyUsedCount + (args.usedDspy ? 1 : 0),
        dspyNotUsedCount: existing.dspyNotUsedCount + (args.usedDspy ? 0 : 1),
        sumConfidence: existing.sumConfidence + args.confidence,
        sumConfidenceDspy: existing.sumConfidenceDspy + (args.usedDspy ? args.confidence : 0),
        sumConfidenceBase: existing.sumConfidenceBase + (args.usedDspy ? 0 : args.confidence),
        sumLatencyMs: existing.sumLatencyMs + args.latencyMs,
        totalRefineRetries: existing.totalRefineRetries + args.refineRetries,
        sumInputTokens: existing.sumInputTokens + args.inputTokens,
        sumOutputTokens: existing.sumOutputTokens + args.outputTokens,
      });
    } else {
      await ctx.db.insert("dspy_metrics_daily", {
        businessId: args.businessId,
        tool: args.tool,
        date,
        tier1Hits: 0,
        tier2Invocations: 1,
        successCount: args.success ? 1 : 0,
        failureCount: args.success ? 0 : 1,
        fallbackCount: args.confidence === 0 ? 1 : 0,
        dspyUsedCount: args.usedDspy ? 1 : 0,
        dspyNotUsedCount: args.usedDspy ? 0 : 1,
        sumConfidence: args.confidence,
        sumConfidenceDspy: args.usedDspy ? args.confidence : 0,
        sumConfidenceBase: args.usedDspy ? 0 : args.confidence,
        sumLatencyMs: args.latencyMs,
        totalRefineRetries: args.refineRetries,
        sumInputTokens: args.inputTokens,
        sumOutputTokens: args.outputTokens,
        overrideCount: 0,
      });
    }
  },
});

export const recordTier1Hit = internalMutation({
  args: {
    businessId: v.id("businesses"),
    tool: v.string(),
  },
  handler: async (ctx, args) => {
    const date = getTodayUTC();

    const existing = await ctx.db
      .query("dspy_metrics_daily")
      .withIndex("by_business_tool_date", (q) =>
        q.eq("businessId", args.businessId).eq("tool", args.tool).eq("date", date)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        tier1Hits: existing.tier1Hits + 1,
      });
    } else {
      await ctx.db.insert("dspy_metrics_daily", {
        businessId: args.businessId,
        tool: args.tool,
        date,
        tier1Hits: 1,
        tier2Invocations: 0,
        successCount: 0,
        failureCount: 0,
        fallbackCount: 0,
        dspyUsedCount: 0,
        dspyNotUsedCount: 0,
        sumConfidence: 0,
        sumConfidenceDspy: 0,
        sumConfidenceBase: 0,
        sumLatencyMs: 0,
        totalRefineRetries: 0,
        sumInputTokens: 0,
        sumOutputTokens: 0,
        overrideCount: 0,
      });
    }
  },
});

export const recordOverride = internalMutation({
  args: {
    businessId: v.id("businesses"),
    tool: v.string(),
  },
  handler: async (ctx, args) => {
    const date = getTodayUTC();

    const existing = await ctx.db
      .query("dspy_metrics_daily")
      .withIndex("by_business_tool_date", (q) =>
        q.eq("businessId", args.businessId).eq("tool", args.tool).eq("date", date)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        overrideCount: existing.overrideCount + 1,
      });
    } else {
      await ctx.db.insert("dspy_metrics_daily", {
        businessId: args.businessId,
        tool: args.tool,
        date,
        tier1Hits: 0,
        tier2Invocations: 0,
        successCount: 0,
        failureCount: 0,
        fallbackCount: 0,
        dspyUsedCount: 0,
        dspyNotUsedCount: 0,
        sumConfidence: 0,
        sumConfidenceDspy: 0,
        sumConfidenceBase: 0,
        sumLatencyMs: 0,
        totalRefineRetries: 0,
        sumInputTokens: 0,
        sumOutputTokens: 0,
        overrideCount: 1,
      });
    }
  },
});

export const cleanupOldMetrics = internalMutation({
  handler: async (ctx) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffDate = cutoff.toISOString().split("T")[0];

    const oldRows = await ctx.db
      .query("dspy_metrics_daily")
      .withIndex("by_date", (q) => q.lt("date", cutoffDate))
      .take(100);

    for (const row of oldRows) {
      await ctx.db.delete(row._id);
    }
  },
});

// ─── Internal Queries (called by actions, no reactivity) ───

export const _getOverview = internalQuery({
  args: {
    timeWindow: v.string(),
  },
  handler: async (ctx, args) => {
    const startDate = getDateRangeStart(args.timeWindow);

    // Get all metrics rows in the time window
    const allMetrics = await ctx.db
      .query("dspy_metrics_daily")
      .withIndex("by_date", (q) => q.gte("date", startDate))
      .collect();

    // Group by business
    const businessMap = new Map<string, {
      businessId: string;
      tools: Map<string, {
        tier1Hits: number;
        tier2Invocations: number;
        successCount: number;
        failureCount: number;
        fallbackCount: number;
        dspyUsedCount: number;
        dspyNotUsedCount: number;
        sumConfidence: number;
        sumConfidenceDspy: number;
        sumConfidenceBase: number;
        sumLatencyMs: number;
        totalRefineRetries: number;
        sumInputTokens: number;
        sumOutputTokens: number;
        overrideCount: number;
      }>;
    }>();

    for (const row of allMetrics) {
      const bid = row.businessId as string;
      if (!businessMap.has(bid)) {
        businessMap.set(bid, { businessId: bid, tools: new Map() });
      }
      const biz = businessMap.get(bid)!;
      const existing = biz.tools.get(row.tool);
      if (existing) {
        existing.tier1Hits += row.tier1Hits;
        existing.tier2Invocations += row.tier2Invocations;
        existing.successCount += row.successCount;
        existing.failureCount += row.failureCount;
        existing.fallbackCount += row.fallbackCount;
        existing.dspyUsedCount += row.dspyUsedCount;
        existing.dspyNotUsedCount += row.dspyNotUsedCount;
        existing.sumConfidence += row.sumConfidence;
        existing.sumConfidenceDspy += row.sumConfidenceDspy;
        existing.sumConfidenceBase += row.sumConfidenceBase;
        existing.sumLatencyMs += row.sumLatencyMs;
        existing.totalRefineRetries += row.totalRefineRetries;
        existing.sumInputTokens += row.sumInputTokens;
        existing.sumOutputTokens += row.sumOutputTokens;
        existing.overrideCount += row.overrideCount;
      } else {
        biz.tools.set(row.tool, {
          tier1Hits: row.tier1Hits,
          tier2Invocations: row.tier2Invocations,
          successCount: row.successCount,
          failureCount: row.failureCount,
          fallbackCount: row.fallbackCount,
          dspyUsedCount: row.dspyUsedCount,
          dspyNotUsedCount: row.dspyNotUsedCount,
          sumConfidence: row.sumConfidence,
          sumConfidenceDspy: row.sumConfidenceDspy,
          sumConfidenceBase: row.sumConfidenceBase,
          sumLatencyMs: row.sumLatencyMs,
          totalRefineRetries: row.totalRefineRetries,
          sumInputTokens: row.sumInputTokens,
          sumOutputTokens: row.sumOutputTokens,
          overrideCount: row.overrideCount,
        });
      }
    }

    // Look up business names
    const result = [];
    for (const [bid, biz] of businessMap) {
      const business = await ctx.db.get(bid as Id<"businesses">);
      const toolSummaries = [];
      for (const [toolName, metrics] of biz.tools) {
        const t2 = metrics.tier2Invocations || 1; // avoid div by 0
        toolSummaries.push({
          tool: toolName,
          tier1Hits: metrics.tier1Hits,
          tier2Invocations: metrics.tier2Invocations,
          successRate: metrics.tier2Invocations > 0 ? metrics.successCount / t2 : null,
          avgLatencyMs: metrics.tier2Invocations > 0 ? Math.round(metrics.sumLatencyMs / t2) : null,
          refineRetryRate: metrics.tier2Invocations > 0 ? metrics.totalRefineRetries / t2 : null,
          fallbackRate: metrics.tier2Invocations > 0 ? metrics.fallbackCount / t2 : null,
          avgConfidence: metrics.tier2Invocations > 0 ? metrics.sumConfidence / t2 : null,
          avgConfidenceDspy: metrics.dspyUsedCount > 0 ? metrics.sumConfidenceDspy / metrics.dspyUsedCount : null,
          avgConfidenceBase: metrics.dspyNotUsedCount > 0 ? metrics.sumConfidenceBase / metrics.dspyNotUsedCount : null,
          dspyUsageRate: metrics.tier2Invocations > 0 ? metrics.dspyUsedCount / t2 : null,
          tier1HitRate: (metrics.tier1Hits + metrics.tier2Invocations) > 0
            ? metrics.tier1Hits / (metrics.tier1Hits + metrics.tier2Invocations)
            : null,
          estimatedCostUsd: (metrics.sumInputTokens * 0.25 + metrics.sumOutputTokens * 1.50) / 1_000_000,
          overrideCount: metrics.overrideCount,
          totalClassifications: metrics.tier1Hits + metrics.tier2Invocations,
          accuracy: (metrics.tier1Hits + metrics.tier2Invocations) > 0
            ? 1 - metrics.overrideCount / (metrics.tier1Hits + metrics.tier2Invocations)
            : null,
          isDegraded: (metrics.tier2Invocations > 0) && (
            metrics.totalRefineRetries / t2 > 0.3 ||
            metrics.fallbackCount / t2 > 0.1
          ),
        });
      }
      result.push({
        businessId: bid,
        businessName: business?.name || "(unknown)",
        tools: toolSummaries,
      });
    }

    return result;
  },
});

export const _getBusinessDetail = internalQuery({
  args: {
    businessId: v.id("businesses"),
    timeWindow: v.string(),
  },
  handler: async (ctx, args) => {
    const startDate = getDateRangeStart(args.timeWindow);

    const rows = await ctx.db
      .query("dspy_metrics_daily")
      .withIndex("by_business", (q) =>
        q.eq("businessId", args.businessId)
      )
      .collect();

    // Filter by date range in JS
    const filtered = rows.filter((r) => r.date >= startDate);

    // Group by tool → daily time series
    const toolMap = new Map<string, Array<{
      date: string;
      tier1Hits: number;
      tier2Invocations: number;
      successCount: number;
      fallbackCount: number;
      dspyUsedCount: number;
      sumConfidence: number;
      sumConfidenceDspy: number;
      sumConfidenceBase: number;
      sumLatencyMs: number;
      totalRefineRetries: number;
      sumInputTokens: number;
      sumOutputTokens: number;
      overrideCount: number;
    }>>();

    for (const row of filtered) {
      if (!toolMap.has(row.tool)) {
        toolMap.set(row.tool, []);
      }
      toolMap.get(row.tool)!.push({
        date: row.date,
        tier1Hits: row.tier1Hits,
        tier2Invocations: row.tier2Invocations,
        successCount: row.successCount,
        fallbackCount: row.fallbackCount,
        dspyUsedCount: row.dspyUsedCount,
        sumConfidence: row.sumConfidence,
        sumConfidenceDspy: row.sumConfidenceDspy,
        sumConfidenceBase: row.sumConfidenceBase,
        sumLatencyMs: row.sumLatencyMs,
        totalRefineRetries: row.totalRefineRetries,
        sumInputTokens: row.sumInputTokens,
        sumOutputTokens: row.sumOutputTokens,
        overrideCount: row.overrideCount,
      });
    }

    const result: Record<string, Array<{
      date: string;
      tier1Hits: number;
      tier2Invocations: number;
      successCount: number;
      fallbackCount: number;
      dspyUsedCount: number;
      sumConfidence: number;
      sumConfidenceDspy: number;
      sumConfidenceBase: number;
      sumLatencyMs: number;
      totalRefineRetries: number;
      sumInputTokens: number;
      sumOutputTokens: number;
      overrideCount: number;
    }>> = {};
    for (const [tool, series] of toolMap) {
      result[tool] = series.sort((a, b) => a.date.localeCompare(b.date));
    }
    return result;
  },
});

export const _getCorrectionFunnels = internalQuery({
  handler: async (ctx) => {
    // Get all businesses
    const businesses = await ctx.db.query("businesses").collect();

    const result = [];

    for (const biz of businesses) {
      const toolCounts: Array<{ tool: string; correctionCount: number; threshold: number }> = [];

      // Cap at 200 per table — we only need the count, and BootstrapFewShot threshold is 20.
      // Beyond 200 corrections the exact count doesn't matter for the funnel visualization.
      const CORRECTION_CAP = 200;

      // Fee corrections
      const feeCorrCount = await ctx.db
        .query("fee_classification_corrections")
        .withIndex("by_businessId", (q) => q.eq("businessId", biz._id))
        .take(CORRECTION_CAP);
      toolCounts.push({ tool: "classify_fees", correctionCount: feeCorrCount.length, threshold: 20 });

      // Bank recon corrections
      const bankCorrCount = await ctx.db
        .query("bank_recon_corrections")
        .withIndex("by_businessId", (q) => q.eq("businessId", biz._id))
        .take(CORRECTION_CAP);
      toolCounts.push({ tool: "classify_bank_transaction", correctionCount: bankCorrCount.length, threshold: 20 });

      // AR matching corrections
      const arCorrCount = await ctx.db
        .query("order_matching_corrections")
        .withIndex("by_businessId_createdAt", (q) => q.eq("businessId", biz._id))
        .take(CORRECTION_CAP);
      toolCounts.push({ tool: "match_orders", correctionCount: arCorrCount.length, threshold: 20 });

      // PO matching corrections
      const poCorrCount = await ctx.db
        .query("po_match_corrections")
        .withIndex("by_businessId", (q) => q.eq("businessId", biz._id))
        .take(CORRECTION_CAP);
      toolCounts.push({ tool: "match_po_invoice", correctionCount: poCorrCount.length, threshold: 20 });

      // Vendor item corrections
      const vendorCorrCount = await ctx.db
        .query("vendor_item_matching_corrections")
        .withIndex("by_businessId_createdAt", (q) => q.eq("businessId", biz._id))
        .take(CORRECTION_CAP);
      toolCounts.push({ tool: "match_vendor_items", correctionCount: vendorCorrCount.length, threshold: 20 });

      // Chat agent corrections — grouped by correctionType
      const chatCorr = await ctx.db
        .query("chat_agent_corrections")
        .withIndex("by_businessId", (q) => q.eq("businessId", biz._id))
        .take(CORRECTION_CAP);
      const chatIntentCount = chatCorr.filter((c) => c.correctionType === "intent").length;
      const chatToolCount = chatCorr.filter((c) => c.correctionType === "tool_selection").length;
      const chatParamCount = chatCorr.filter((c) => c.correctionType === "parameter_extraction").length;
      toolCounts.push({ tool: "chat_intent", correctionCount: chatIntentCount, threshold: 20 });
      toolCounts.push({ tool: "chat_tool_selector", correctionCount: chatToolCount, threshold: 20 });
      toolCounts.push({ tool: "chat_param_extractor", correctionCount: chatParamCount, threshold: 20 });

      result.push({
        businessId: biz._id as string,
        businessName: biz.name || "(unknown)",
        tools: toolCounts,
      });
    }

    return result;
  },
});

// ─── Public Actions (frontend calls these via useAction) ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getDspyOverview = action({
  args: {
    timeWindow: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runQuery(internal.functions.dspyMetrics._getOverview, {
      timeWindow: args.timeWindow,
    });
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getDspyBusinessDetail = action({
  args: {
    businessId: v.id("businesses"),
    timeWindow: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runQuery(internal.functions.dspyMetrics._getBusinessDetail, {
      businessId: args.businessId,
      timeWindow: args.timeWindow,
    });
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getCorrectionFunnels = action({
  handler: async (ctx): Promise<any> => {
    return await ctx.runQuery(internal.functions.dspyMetrics._getCorrectionFunnels);
  },
});
