/**
 * Manual Exchange Rates Functions
 *
 * Manage manual currency exchange rates.
 * Manual rates take priority over API rates.
 *
 * Rate resolution priority:
 * 1. Manual rate for exact date
 * 2. Manual rate for closest earlier date (within 7 days)
 * 3. API rate (if available)
 * 4. Fallback to 1.0 (warning logged)
 *
 * @see specs/001-accounting-double-entry/data-model.md
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";

/**
 * Create a manual exchange rate
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    fromCurrency: v.string(),
    toCurrency: v.string(),
    rate: v.number(),
    effectiveDate: v.string(), // YYYY-MM-DD
    reason: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    // Validate rate
    if (args.rate <= 0) {
      throw new ConvexError({
        message: "Exchange rate must be positive",
        code: "INVALID_RATE",
        rate: args.rate,
      });
    }

    // Check for duplicate
    const existing = await ctx.db
      .query("manual_exchange_rates")
      .withIndex("by_business_pair_date", (q) =>
        q
          .eq("businessId", args.businessId)
          .eq("fromCurrency", args.fromCurrency)
          .eq("toCurrency", args.toCurrency)
          .eq("effectiveDate", args.effectiveDate)
      )
      .first();

    if (existing) {
      throw new ConvexError({
        message: `Rate already exists for ${args.fromCurrency}/${args.toCurrency} on ${args.effectiveDate}`,
        code: "DUPLICATE_RATE",
        existingRateId: existing._id,
      });
    }

    const now = Date.now();

    const rateId = await ctx.db.insert("manual_exchange_rates", {
      businessId: args.businessId,
      fromCurrency: args.fromCurrency,
      toCurrency: args.toCurrency,
      rate: args.rate,
      effectiveDate: args.effectiveDate,
      reason: args.reason,
      source: args.source,
      enteredBy: userId,
      createdAt: now,
    });

    return rateId;
  },
});

/**
 * Update a manual exchange rate
 */
export const update = mutation({
  args: {
    rateId: v.id("manual_exchange_rates"),
    rate: v.optional(v.number()),
    reason: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    const existingRate = await ctx.db.get(args.rateId);
    if (!existingRate) {
      throw new ConvexError({
        message: "Exchange rate not found",
        code: "RATE_NOT_FOUND",
      });
    }

    // Validate new rate if provided
    if (args.rate !== undefined && args.rate <= 0) {
      throw new ConvexError({
        message: "Exchange rate must be positive",
        code: "INVALID_RATE",
        rate: args.rate,
      });
    }

    const now = Date.now();

    await ctx.db.patch(args.rateId, {
      rate: args.rate ?? existingRate.rate,
      reason: args.reason ?? existingRate.reason,
      source: args.source ?? existingRate.source,
      updatedBy: userId,
      updatedAt: now,
    });

    return args.rateId;
  },
});

/**
 * Delete a manual exchange rate
 */
export const deleteRate = mutation({
  args: {
    rateId: v.id("manual_exchange_rates"),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    const rate = await ctx.db.get(args.rateId);
    if (!rate) {
      throw new ConvexError({
        message: "Exchange rate not found",
        code: "RATE_NOT_FOUND",
      });
    }

    await ctx.db.delete(args.rateId);

    return args.rateId;
  },
});

/**
 * List manual exchange rates for a business
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    fromCurrency: v.optional(v.string()),
    toCurrency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let rates;

    if (args.fromCurrency && args.toCurrency) {
      // Filter by currency pair
      rates = await ctx.db
        .query("manual_exchange_rates")
        .withIndex("by_pair", (q) =>
          q
            .eq("fromCurrency", args.fromCurrency!)
            .eq("toCurrency", args.toCurrency!)
        )
        .collect();

      // Filter by business in memory
      rates = rates.filter((r) => r.businessId === args.businessId);
    } else {
      // Get all rates for business
      rates = await ctx.db
        .query("manual_exchange_rates")
        .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
        .collect();
    }

    // Sort by effectiveDate descending
    return rates.sort((a, b) =>
      b.effectiveDate.localeCompare(a.effectiveDate)
    );
  },
});

/**
 * Get exchange rate for a currency pair on a specific date
 *
 * Resolution priority:
 * 1. Exact manual rate for date
 * 2. Closest earlier manual rate (within 7 days)
 * 3. Return null (caller should use API or fallback)
 */
export const getRate = query({
  args: {
    businessId: v.id("businesses"),
    fromCurrency: v.string(),
    toCurrency: v.string(),
    date: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    // Same currency = rate 1.0
    if (args.fromCurrency === args.toCurrency) {
      return {
        rate: 1.0,
        source: "same_currency" as const,
        effectiveDate: args.date,
        isManual: false,
      };
    }

    // Get all manual rates for this currency pair
    const allRates = await ctx.db
      .query("manual_exchange_rates")
      .withIndex("by_pair", (q) =>
        q.eq("fromCurrency", args.fromCurrency).eq("toCurrency", args.toCurrency)
      )
      .collect();

    // Filter by business
    const rates = allRates.filter((r) => r.businessId === args.businessId);

    if (rates.length === 0) {
      return null; // No manual rate, caller should use API
    }

    // 1. Try exact match for date
    const exactMatch = rates.find((r) => r.effectiveDate === args.date);
    if (exactMatch) {
      return {
        rate: exactMatch.rate,
        source: exactMatch.source || "manual",
        effectiveDate: exactMatch.effectiveDate,
        isManual: true,
        rateId: exactMatch._id,
      };
    }

    // 2. Find closest earlier rate (within 7 days)
    const earlierRates = rates
      .filter((r) => r.effectiveDate <= args.date)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));

    if (earlierRates.length > 0) {
      const closestRate = earlierRates[0];

      // Calculate days difference
      const rateDate = new Date(closestRate.effectiveDate);
      const targetDate = new Date(args.date);
      const daysDiff = Math.floor(
        (targetDate.getTime() - rateDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff <= 7) {
        return {
          rate: closestRate.rate,
          source: closestRate.source || "manual",
          effectiveDate: closestRate.effectiveDate,
          isManual: true,
          rateId: closestRate._id,
          daysOld: daysDiff,
        };
      }
    }

    // No suitable manual rate found
    return null;
  },
});

/**
 * Get exchange rate by ID
 */
export const getById = query({
  args: {
    rateId: v.id("manual_exchange_rates"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.rateId);
  },
});
