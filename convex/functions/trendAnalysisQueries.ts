/**
 * Trend Analysis - Internal Queries
 *
 * Separated from trendAnalysis.ts to avoid circular type references
 * when the action references internal queries in the same module.
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

/**
 * Fetch journal entry lines for a business within a date range.
 * Returns flattened line data with transaction dates from parent entries.
 */
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

/**
 * Look up a business by its string ID (normalizes to Convex ID).
 */
export const lookupBusiness = internalQuery({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
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
