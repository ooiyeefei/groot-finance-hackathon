/**
 * Trend Analysis - Financial metric aggregation by period
 *
 * Uses action (not reactive query) to avoid bandwidth burn on the free tier.
 * Aggregates journal entries by account code ranges into financial metrics,
 * grouped by time period (monthly/quarterly/yearly).
 *
 * Account code ranges (IFRS Chart of Accounts):
 * - Revenue: 4000-4999 (credit amounts)
 * - Expenses: 5000-5999 (debit amounts)
 * - Cash Flow: 1000-1099 (net of debits and credits)
 * - Profit: Revenue - Expenses (derived)
 */

import { v } from "convex/values";
import { action, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

// ============================================
// TYPES
// ============================================

interface PeriodBucket {
  label: string
  startDate: string
  endDate: string
  amount: number
  transactionCount: number
}

interface TrendAnalysisResult {
  metric: string
  periods: PeriodBucket[]
  homeCurrency: string
}

// ============================================
// INTERNAL QUERY — reads journal data (runs inside Convex)
// ============================================

export const getJournalDataForPeriod = internalQuery({
  args: {
    businessId: v.id("businesses"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    // Get posted journal entries in date range
    const entries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .filter((q) =>
        q.and(
          q.gte(q.field("transactionDate"), args.startDate),
          q.lte(q.field("transactionDate"), args.endDate),
          q.eq(q.field("status"), "posted")
        )
      )
      .collect();

    const entryIds = new Set(entries.map((e) => e._id));

    // Get all lines for this business, filter to matching entries
    const allLines = await ctx.db
      .query("journal_entry_lines")
      .withIndex("by_business_account", (q) => q.eq("businessId", args.businessId))
      .collect();

    const lines = allLines.filter((line) => entryIds.has(line.journalEntryId));

    // Return lines with their transaction dates (from parent entry)
    const entryDateMap = new Map(entries.map((e) => [e._id, e.transactionDate]));

    return lines.map((line) => ({
      accountCode: line.accountCode,
      debitAmount: line.debitAmount,
      creditAmount: line.creditAmount,
      transactionDate: entryDateMap.get(line.journalEntryId) || "",
    }));
  },
});

// ============================================
// PUBLIC ACTION — trend aggregation
// ============================================

export const analyzeTrends = action({
  args: {
    businessId: v.string(),
    mode: v.union(v.literal("compare"), v.literal("trend"), v.literal("growth")),
    metric: v.union(
      v.literal("revenue"),
      v.literal("expenses"),
      v.literal("profit"),
      v.literal("cash_flow")
    ),
    startDateA: v.string(),
    endDateA: v.string(),
    startDateB: v.optional(v.string()),
    endDateB: v.optional(v.string()),
    granularity: v.optional(
      v.union(v.literal("monthly"), v.literal("quarterly"), v.literal("yearly"))
    ),
  },
  handler: async (ctx, args) => {
    // Resolve business ID
    const business = await ctx.runQuery(internal.functions.trendAnalysis.lookupBusiness, {
      businessId: args.businessId,
    });
    if (!business) {
      return { error: "Business not found" };
    }

    const granularity = args.granularity || "monthly";

    if (args.mode === "compare") {
      // Two-period comparison
      if (!args.startDateB || !args.endDateB) {
        return { error: "Compare mode requires both period_a and period_b date ranges" };
      }

      const [linesA, linesB] = await Promise.all([
        ctx.runQuery(internal.functions.trendAnalysis.getJournalDataForPeriod, {
          businessId: business._id,
          startDate: args.startDateA,
          endDate: args.endDateA,
        }),
        ctx.runQuery(internal.functions.trendAnalysis.getJournalDataForPeriod, {
          businessId: business._id,
          startDate: args.startDateB,
          endDate: args.endDateB,
        }),
      ]);

      const amountA = aggregateMetric(linesA, args.metric);
      const amountB = aggregateMetric(linesB, args.metric);
      const absoluteChange = amountB - amountA;
      const percentageChange = amountA !== 0 ? (absoluteChange / Math.abs(amountA)) * 100 : amountB !== 0 ? 100 : 0;
      const direction = absoluteChange > 0 ? "up" : absoluteChange < 0 ? "down" : "stable";

      return {
        metric: args.metric,
        homeCurrency: business.homeCurrency || "MYR",
        periodA: {
          label: `${args.startDateA} to ${args.endDateA}`,
          startDate: args.startDateA,
          endDate: args.endDateA,
          amount: roundCurrency(amountA),
          transactionCount: linesA.length,
        },
        periodB: {
          label: `${args.startDateB} to ${args.endDateB}`,
          startDate: args.startDateB,
          endDate: args.endDateB,
          amount: roundCurrency(amountB),
          transactionCount: linesB.length,
        },
        absoluteChange: roundCurrency(absoluteChange),
        percentageChange: roundToDecimal(percentageChange, 1),
        direction,
      };
    }

    // Trend or growth mode — query the full date range
    const lines = await ctx.runQuery(
      internal.functions.trendAnalysis.getJournalDataForPeriod,
      {
        businessId: business._id,
        startDate: args.startDateA,
        endDate: args.endDateA,
      }
    );

    // Group lines by period buckets
    const buckets = groupByPeriod(lines, args.startDateA, args.endDateA, granularity, args.metric);

    // Calculate overall trend
    const firstAmount = buckets.length > 0 ? buckets[0].amount : 0;
    const lastAmount = buckets.length > 0 ? buckets[buckets.length - 1].amount : 0;
    const overallChange = lastAmount - firstAmount;
    const overallChangePercent = firstAmount !== 0 ? (overallChange / Math.abs(firstAmount)) * 100 : lastAmount !== 0 ? 100 : 0;
    const overallDirection = overallChange > 0 ? "up" : overallChange < 0 ? "down" : "stable";

    return {
      metric: args.metric,
      homeCurrency: business.homeCurrency || "MYR",
      periods: buckets,
      overallDirection,
      overallChangePercent: roundToDecimal(overallChangePercent, 1),
    };
  },
});

// Internal query to look up business by string ID
export const lookupBusiness = internalQuery({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    // Try direct lookup first (if it's a valid Convex ID)
    try {
      const normalized = ctx.db.normalizeId("businesses", args.businessId);
      if (normalized) {
        return await ctx.db.get(normalized);
      }
    } catch {
      // Not a valid ID format
    }
    return null;
  },
});

// ============================================
// HELPERS
// ============================================

interface JournalLine {
  accountCode: string;
  debitAmount: number;
  creditAmount: number;
  transactionDate: string;
}

function aggregateMetric(lines: JournalLine[], metric: string): number {
  let total = 0;
  for (const line of lines) {
    const code = line.accountCode;
    switch (metric) {
      case "revenue":
        if (code >= "4000" && code < "5000" && line.creditAmount > 0) {
          total += line.creditAmount;
        }
        break;
      case "expenses":
        if (code >= "5000" && code < "6000" && line.debitAmount > 0) {
          total += line.debitAmount;
        }
        break;
      case "profit":
        if (code >= "4000" && code < "5000" && line.creditAmount > 0) {
          total += line.creditAmount;
        }
        if (code >= "5000" && code < "6000" && line.debitAmount > 0) {
          total -= line.debitAmount;
        }
        break;
      case "cash_flow":
        if (code >= "1000" && code < "1100") {
          total += line.debitAmount - line.creditAmount;
        }
        break;
    }
  }
  return total;
}

function groupByPeriod(
  lines: JournalLine[],
  startDate: string,
  endDate: string,
  granularity: string,
  metric: string
): PeriodBucket[] {
  // Generate period boundaries
  const boundaries = generatePeriodBoundaries(startDate, endDate, granularity);

  // Bucket each line into its period
  const bucketMap = new Map<string, JournalLine[]>();
  for (const b of boundaries) {
    bucketMap.set(b.label, []);
  }

  for (const line of lines) {
    const d = line.transactionDate;
    for (const b of boundaries) {
      if (d >= b.startDate && d <= b.endDate) {
        bucketMap.get(b.label)!.push(line);
        break;
      }
    }
  }

  // Aggregate each bucket
  return boundaries.map((b) => {
    const bucketLines = bucketMap.get(b.label) || [];
    return {
      label: b.label,
      startDate: b.startDate,
      endDate: b.endDate,
      amount: roundCurrency(aggregateMetric(bucketLines, metric)),
      transactionCount: bucketLines.length,
    };
  });
}

function generatePeriodBoundaries(
  startDate: string,
  endDate: string,
  granularity: string
): Array<{ label: string; startDate: string; endDate: string }> {
  const boundaries: Array<{ label: string; startDate: string; endDate: string }> = [];
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let current = new Date(start);
  while (current <= end) {
    let periodStart: Date;
    let periodEnd: Date;
    let label: string;

    switch (granularity) {
      case "monthly":
        periodStart = new Date(current.getFullYear(), current.getMonth(), 1);
        periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
        label = `${monthNames[current.getMonth()]} ${current.getFullYear()}`;
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        break;
      case "quarterly": {
        const q = Math.floor(current.getMonth() / 3);
        periodStart = new Date(current.getFullYear(), q * 3, 1);
        periodEnd = new Date(current.getFullYear(), q * 3 + 3, 0);
        label = `Q${q + 1} ${current.getFullYear()}`;
        current = new Date(current.getFullYear(), q * 3 + 3, 1);
        break;
      }
      case "yearly":
        periodStart = new Date(current.getFullYear(), 0, 1);
        periodEnd = new Date(current.getFullYear(), 11, 31);
        label = `${current.getFullYear()}`;
        current = new Date(current.getFullYear() + 1, 0, 1);
        break;
      default:
        periodStart = new Date(current.getFullYear(), current.getMonth(), 1);
        periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
        label = `${monthNames[current.getMonth()]} ${current.getFullYear()}`;
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }

    // Clamp to the requested range
    const clampedStart = periodStart < start ? start : periodStart;
    const clampedEnd = periodEnd > end ? end : periodEnd;

    boundaries.push({
      label,
      startDate: formatDateISO(clampedStart),
      endDate: formatDateISO(clampedEnd),
    });
  }

  return boundaries;
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundToDecimal(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
