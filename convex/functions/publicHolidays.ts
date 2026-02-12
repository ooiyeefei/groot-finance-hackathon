/**
 * Public Holidays Functions - Convex queries and mutations
 *
 * Handles custom business holiday management (admin only).
 * System holidays are provided by the date-holidays library on the client side.
 * This table is used ONLY for custom business-specific holidays.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// ============================================
// QUERIES
// ============================================

/**
 * Get custom holidays for a business + business countryCode
 * System holidays are generated client-side via date-holidays library.
 */
export const getForBusiness = query({
  args: {
    businessId: v.string(),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { customHolidays: [], countryCode: "MY" };

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return { customHolidays: [], countryCode: "MY" };

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return { customHolidays: [], countryCode: "MY" };

    // Verify user is a member
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { customHolidays: [], countryCode: business.countryCode ?? "MY" };
    }

    const countryCode = business.countryCode ?? "MY";

    // Get custom holidays for this business
    const customHolidays = await ctx.db
      .query("public_holidays")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter to custom holidays for the requested year
    const customHolidaysForYear = customHolidays
      .filter((h) => h.isCustom && h.year === args.year)
      .sort((a, b) => a.date.localeCompare(b.date));

    return { customHolidays: customHolidaysForYear, countryCode };
  },
});

/**
 * Get custom holidays for a business (admin view)
 */
export const getCustomHolidays = query({
  args: {
    businessId: v.string(),
    year: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return [];

    // Verify admin permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      return []; // Only admins can see custom holidays list
    }

    // Get custom holidays for this business
    let customHolidays = await ctx.db
      .query("public_holidays")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter to custom only
    customHolidays = customHolidays.filter((h) => h.isCustom);

    // Filter by year if specified
    if (args.year) {
      customHolidays = customHolidays.filter((h) => h.year === args.year);
    }

    // Sort by date
    customHolidays.sort((a, b) => a.date.localeCompare(b.date));

    return customHolidays;
  },
});

/**
 * Get custom holiday dates + countryCode for business day calculations
 * System holiday dates are generated client-side via date-holidays library.
 */
export const getHolidayDates = query({
  args: {
    businessId: v.string(),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { customDates: [], countryCode: "MY" };

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return { customDates: [], countryCode: "MY" };

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return { customDates: [], countryCode: "MY" };

    // Verify user is a member
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { customDates: [], countryCode: business.countryCode ?? "MY" };
    }

    const countryCode = business.countryCode ?? "MY";

    // Get custom holidays for this business
    const customHolidays = await ctx.db
      .query("public_holidays")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const customDates = customHolidays
      .filter((h) => h.isCustom && h.year === args.year)
      .map((h) => h.date)
      .sort();

    return { customDates, countryCode };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Add a custom holiday (admin only)
 */
export const addCustom = mutation({
  args: {
    businessId: v.id("businesses"),
    date: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    // Verify admin permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Only admins can add custom holidays");
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(args.date)) {
      throw new Error("Invalid date format. Use YYYY-MM-DD");
    }

    // Parse year from date
    const year = parseInt(args.date.substring(0, 4));

    // Validate name
    if (!args.name || args.name.trim().length === 0) {
      throw new Error("Holiday name is required");
    }

    // Check for duplicate (same business and date)
    const existingHolidays = await ctx.db
      .query("public_holidays")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const duplicate = existingHolidays.find((h) => h.date === args.date);
    if (duplicate) {
      throw new Error(`A holiday already exists on ${args.date}`);
    }

    // Get business country code
    const business = await ctx.db.get(args.businessId);
    const countryCode = business?.countryCode ?? "MY";

    // Create the custom holiday
    const holidayId = await ctx.db.insert("public_holidays", {
      businessId: args.businessId,
      countryCode,
      date: args.date,
      name: args.name.trim(),
      year,
      isCustom: true,
      updatedAt: Date.now(),
    });

    return holidayId;
  },
});

/**
 * Remove a custom holiday (admin only)
 */
export const removeCustom = mutation({
  args: {
    id: v.id("public_holidays"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const holiday = await ctx.db.get(args.id);
    if (!holiday) throw new Error("Holiday not found");

    // Can only remove custom holidays
    if (!holiday.isCustom) {
      throw new Error("Cannot remove system holidays");
    }

    if (!holiday.businessId) {
      throw new Error("Cannot remove system holidays");
    }

    // Verify admin permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", holiday.businessId!)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Only admins can remove custom holidays");
    }

    // Delete the holiday
    await ctx.db.delete(args.id);

    return args.id;
  },
});

/**
 * Update a custom holiday (admin only)
 */
export const updateCustom = mutation({
  args: {
    id: v.id("public_holidays"),
    date: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const holiday = await ctx.db.get(args.id);
    if (!holiday) throw new Error("Holiday not found");

    // Must be a custom holiday with businessId
    if (!holiday.isCustom || !holiday.businessId) {
      throw new Error("Cannot update system holidays");
    }

    // Verify admin permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", holiday.businessId!)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Only admins can update holidays");
    }

    // Build update object
    const updates: Record<string, any> = {
      updatedAt: Date.now(),
    };

    if (args.date) {
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(args.date)) {
        throw new Error("Invalid date format. Use YYYY-MM-DD");
      }
      updates.date = args.date;
      updates.year = parseInt(args.date.substring(0, 4));
    }

    if (args.name) {
      if (args.name.trim().length === 0) {
        throw new Error("Holiday name cannot be empty");
      }
      updates.name = args.name.trim();
    }

    await ctx.db.patch(args.id, updates);

    return args.id;
  },
});
