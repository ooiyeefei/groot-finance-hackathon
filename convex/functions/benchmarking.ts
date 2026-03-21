/**
 * Benchmarking — Opt-in CRUD + Aggregate Queries (031-chat-cross-biz-voice)
 *
 * Handles business opt-in/out for anonymized benchmarking,
 * metric aggregation queries, and business metric computation.
 */

import { v } from "convex/values";
import { mutation, query, action, internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

// ============================================
// PUBLIC — Opt-in Management
// ============================================

/**
 * Toggle benchmarking opt-in/out.
 * RBAC: finance_admin or owner only (checked by MCP tool layer).
 */
export const toggleOptIn = mutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.string(),
    action: v.union(v.literal("opt_in"), v.literal("opt_out")),
    industryGroup: v.string(),
    industryLabel: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("benchmarking_opt_ins")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .first();

    const now = Date.now();

    if (args.action === "opt_in") {
      if (existing) {
        await ctx.db.patch(existing._id, {
          isActive: true,
          industryGroup: args.industryGroup,
          industryLabel: args.industryLabel,
          optedInAt: now,
          optedInBy: args.userId,
          optedOutAt: undefined,
        });
      } else {
        await ctx.db.insert("benchmarking_opt_ins", {
          businessId: args.businessId,
          isActive: true,
          industryGroup: args.industryGroup,
          industryLabel: args.industryLabel,
          optedInAt: now,
          optedInBy: args.userId,
        });
      }
      return { isActive: true };
    } else {
      if (existing) {
        await ctx.db.patch(existing._id, {
          isActive: false,
          optedOutAt: now,
        });
      }
      return { isActive: false };
    }
  },
});

/**
 * Get opt-in status for a business.
 */
export const getOptInStatus = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("benchmarking_opt_ins")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .first();
  },
});

// ============================================
// INTERNAL — Aggregation Support
// ============================================

/**
 * Get all opted-in businesses for a specific industry group.
 * Used by weekly aggregation job.
 */
export const getOptedInByIndustry = internalQuery({
  args: {
    industryGroup: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("benchmarking_opt_ins")
      .withIndex("by_industry_active", (q) =>
        q.eq("industryGroup", args.industryGroup).eq("isActive", true)
      )
      .collect();
  },
});

/**
 * Get all distinct active industry groups.
 * Used by weekly aggregation to know which groups to process.
 */
export const getActiveIndustryGroups = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allActive = await ctx.db
      .query("benchmarking_opt_ins")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const groups = new Map<string, string>();
    for (const opt of allActive) {
      groups.set(opt.industryGroup, opt.industryLabel);
    }

    return Array.from(groups.entries()).map(([group, label]) => ({
      industryGroup: group,
      industryLabel: label,
    }));
  },
});

/**
 * Get pre-computed benchmark aggregates for a metric + industry.
 * Public: called by MCP server via ConvexHttpClient.
 */
export const getAggregates = query({
  args: {
    industryGroup: v.string(),
    metric: v.string(),
    period: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("benchmarking_aggregates")
      .withIndex("by_industry_metric", (q) =>
        q
          .eq("industryGroup", args.industryGroup)
          .eq("metric", args.metric)
          .eq("period", args.period)
      )
      .first();
  },
});

/**
 * Upsert benchmark aggregates (used by weekly aggregation job).
 */
export const upsertAggregate = internalMutation({
  args: {
    industryGroup: v.string(),
    industryLabel: v.string(),
    metric: v.string(),
    period: v.string(),
    sampleSize: v.number(),
    average: v.float64(),
    median: v.float64(),
    p25: v.float64(),
    p75: v.float64(),
    p10: v.float64(),
    p90: v.float64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("benchmarking_aggregates")
      .withIndex("by_industry_metric", (q) =>
        q
          .eq("industryGroup", args.industryGroup)
          .eq("metric", args.metric)
          .eq("period", args.period)
      )
      .first();

    const data = { ...args, updatedAt: Date.now() };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("benchmarking_aggregates", data);
    }
  },
});

// Shared handler for metrics computation (used by both public and internal queries)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function metricsHandler(ctx: any, args: { businessId: any; periodStart: string; periodEnd: string }) {
  const lines = await ctx.db
    .query("journal_entry_lines")
    .withIndex("by_business_account", (q: any) => q.eq("businessId", args.businessId))
    .collect();

  const startTs = new Date(args.periodStart).getTime();
  const endTs = new Date(args.periodEnd).getTime();
  const periodLines = lines.filter(
    (l: any) => l.createdAt >= startTs && l.createdAt <= endTs
  );

  let revenue = 0, cogs = 0, opex = 0;
  for (const line of periodLines) {
    const code = line.accountCode;
    if (code.startsWith("4")) revenue += line.creditAmount - line.debitAmount;
    else if (code === "5100") cogs += line.debitAmount - line.creditAmount;
    else if (code >= "5200" && code < "5900") opex += line.debitAmount - line.creditAmount;
  }

  const grossMargin = revenue > 0 ? (revenue - cogs) / revenue : 0;
  const cogsRatio = revenue > 0 ? cogs / revenue : 0;
  const opexRatio = revenue > 0 ? opex / revenue : 0;

  const salesInvoices = await ctx.db
    .query("sales_invoices")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
    .filter((q: any) => q.neq(q.field("status"), "cancelled"))
    .take(200);

  let arDays = 0;
  if (salesInvoices.length > 0) {
    const now = Date.now();
    let totalDays = 0, counted = 0;
    for (const inv of salesInvoices) {
      if (inv.invoiceDate) {
        const invoiceTs = new Date(inv.invoiceDate).getTime();
        const paidTs = inv.paidAt ? new Date(inv.paidAt).getTime() : now;
        const days = Math.round((paidTs - invoiceTs) / (1000 * 60 * 60 * 24));
        if (days >= 0) { totalDays += days; counted++; }
      }
    }
    arDays = counted > 0 ? totalDays / counted : 0;
  }

  const apInvoices = await ctx.db
    .query("invoices")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
    .filter((q: any) => q.eq(q.field("paymentStatus"), "paid"))
    .take(200);

  let apDays = 0;
  if (apInvoices.length > 0) {
    let totalPaymentDays = 0, counted = 0;
    for (const inv of apInvoices) {
      const issueDate = inv.extractedData?.issue_date;
      const history = inv.paymentHistory as Array<{ date?: string }> | undefined;
      if (issueDate && history && history.length > 0) {
        const lastPayment = history[history.length - 1];
        if (lastPayment.date) {
          const days = Math.round(
            (new Date(lastPayment.date).getTime() - new Date(issueDate as string).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (days >= 0) { totalPaymentDays += days; counted++; }
        }
      }
    }
    apDays = counted > 0 ? totalPaymentDays / counted : 0;
  }

  return {
    gross_margin: Math.round(grossMargin * 10000) / 10000,
    cogs_ratio: Math.round(cogsRatio * 10000) / 10000,
    opex_ratio: Math.round(opexRatio * 10000) / 10000,
    ar_days: Math.round(arDays * 10) / 10,
    ap_days: Math.round(apDays * 10) / 10,
  };
}

const metricsArgs = {
  businessId: v.id("businesses"),
  periodStart: v.string(),
  periodEnd: v.string(),
};

/** Internal version for use by aggregation action. */
export const computeBusinessMetricsInternal = internalQuery({
  args: metricsArgs,
  handler: metricsHandler,
});

/** Public version for MCP server via ConvexHttpClient. */
export const computeBusinessMetrics = query({
  args: metricsArgs,
  handler: metricsHandler,
});

// ============================================
// ACTION — Weekly Aggregation (EventBridge)
// ============================================

const METRICS = ["gross_margin", "cogs_ratio", "opex_ratio", "ar_days", "ap_days"] as const;
const MIN_SAMPLE = 10;

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

/**
 * Run weekly benchmarking aggregation.
 * Called by EventBridge → Lambda → Convex HTTP API.
 * Computes aggregate stats for each industry group with >=10 opted-in businesses.
 */
export const runAggregation = action({
  args: {},
  handler: async (ctx) => {
    // Get all active industry groups
    const groups = await ctx.runQuery(internal.functions.benchmarking.getActiveIndustryGroups);

    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    const period = `${now.getFullYear()}-Q${quarter}`;
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);
    const periodStart = quarterStart.toISOString().split("T")[0];
    const periodEnd = quarterEnd.toISOString().split("T")[0];

    let industriesProcessed = 0;
    let metricsComputed = 0;

    for (const group of groups) {
      const optIns = await ctx.runQuery(
        internal.functions.benchmarking.getOptedInByIndustry,
        { industryGroup: group.industryGroup }
      );

      if (optIns.length < MIN_SAMPLE) {
        console.log(`[Benchmarking] Skipping ${group.industryLabel} (${optIns.length} < ${MIN_SAMPLE})`);
        continue;
      }

      // Compute metrics for each business
      const allMetrics: Record<string, number[]> = {};
      for (const m of METRICS) allMetrics[m] = [];

      for (const opt of optIns) {
        try {
          const bm = await ctx.runQuery(
            internal.functions.benchmarking.computeBusinessMetricsInternal,
            { businessId: opt.businessId, periodStart, periodEnd }
          );
          for (const m of METRICS) {
            const val = bm[m];
            if (typeof val === "number" && !isNaN(val)) {
              allMetrics[m].push(val);
            }
          }
        } catch (err) {
          console.warn(`[Benchmarking] Failed for business ${opt.businessId}:`, err);
        }
      }

      // Compute and upsert aggregates per metric
      for (const m of METRICS) {
        const values = allMetrics[m].sort((a, b) => a - b);
        if (values.length < MIN_SAMPLE) continue;

        const sum = values.reduce((s, v) => s + v, 0);
        await ctx.runMutation(internal.functions.benchmarking.upsertAggregate, {
          industryGroup: group.industryGroup,
          industryLabel: group.industryLabel,
          metric: m,
          period,
          sampleSize: values.length,
          average: sum / values.length,
          median: computePercentile(values, 50),
          p10: computePercentile(values, 10),
          p25: computePercentile(values, 25),
          p75: computePercentile(values, 75),
          p90: computePercentile(values, 90),
        });
        metricsComputed++;
      }

      industriesProcessed++;
    }

    return { industriesProcessed, metricsComputed, period };
  },
});
