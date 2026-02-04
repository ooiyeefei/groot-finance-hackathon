/**
 * Public Holidays Functions - Convex queries and mutations
 *
 * These functions handle:
 * - System holiday queries (by country, by year)
 * - Business-specific holiday queries (system + custom merged)
 * - Custom holiday management (admin only)
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// Supported country codes for SEA region
const SUPPORTED_COUNTRIES = ["MY", "SG", "ID", "PH", "TH", "VN"];

// ============================================
// QUERIES
// ============================================

/**
 * Get system holidays for a country and year
 */
export const getByCountry = query({
  args: {
    countryCode: v.string(),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    // Validate country code
    if (!SUPPORTED_COUNTRIES.includes(args.countryCode)) {
      return [];
    }

    // Get system holidays (businessId is null for system holidays)
    const holidays = await ctx.db
      .query("public_holidays")
      .withIndex("by_countryCode_year", (q) =>
        q.eq("countryCode", args.countryCode).eq("year", args.year)
      )
      .collect();

    // Filter to only system holidays (not custom)
    const systemHolidays = holidays.filter((h) => !h.isCustom);

    // Sort by date
    systemHolidays.sort((a, b) => a.date.localeCompare(b.date));

    return systemHolidays;
  },
});

/**
 * Get all holidays for a business (system + custom merged)
 */
export const getForBusiness = query({
  args: {
    businessId: v.string(),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return [];

    // Verify user is a member
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    // Get the business's country code
    const countryCode = business.countryCode ?? "MY"; // Default to Malaysia

    // Get system holidays for the country
    const systemHolidays = await ctx.db
      .query("public_holidays")
      .withIndex("by_countryCode_year", (q) =>
        q.eq("countryCode", countryCode).eq("year", args.year)
      )
      .collect();

    // Get custom holidays for this business
    const customHolidays = await ctx.db
      .query("public_holidays")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter custom holidays by year
    const customHolidaysForYear = customHolidays.filter(
      (h) => h.year === args.year
    );

    // Merge system (non-custom) and custom holidays
    const mergedHolidays = [
      ...systemHolidays.filter((h) => !h.isCustom),
      ...customHolidaysForYear,
    ];

    // Sort by date
    mergedHolidays.sort((a, b) => a.date.localeCompare(b.date));

    return mergedHolidays;
  },
});

/**
 * Get custom holidays for a business
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
 * Get holiday dates as strings for a business and year
 * Useful for date pickers and business day calculations
 */
export const getHolidayDates = query({
  args: {
    businessId: v.string(),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return [];

    // Verify user is a member
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    // Get the business's country code
    const countryCode = business.countryCode ?? "MY";

    // Get system holidays for the country
    const systemHolidays = await ctx.db
      .query("public_holidays")
      .withIndex("by_countryCode_year", (q) =>
        q.eq("countryCode", countryCode).eq("year", args.year)
      )
      .collect();

    // Get custom holidays for this business
    const customHolidays = await ctx.db
      .query("public_holidays")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Merge and return just the dates
    const allDates = new Set<string>();

    systemHolidays
      .filter((h) => !h.isCustom)
      .forEach((h) => allDates.add(h.date));

    customHolidays
      .filter((h) => h.year === args.year)
      .forEach((h) => allDates.add(h.date));

    return Array.from(allDates).sort();
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
 * Bulk import system holidays for a country and year
 * Skips duplicates automatically
 */
export const bulkImportSystem = mutation({
  args: {
    businessId: v.id("businesses"),
    countryCode: v.string(),
    year: v.number(),
    holidays: v.array(
      v.object({
        date: v.string(),
        name: v.string(),
      })
    ),
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
      throw new Error("Only admins can import holidays");
    }

    // Validate country code
    if (!SUPPORTED_COUNTRIES.includes(args.countryCode)) {
      throw new Error(`Unsupported country: ${args.countryCode}`);
    }

    // Get existing system holidays for this country/year
    const existingHolidays = await ctx.db
      .query("public_holidays")
      .withIndex("by_countryCode_year", (q) =>
        q.eq("countryCode", args.countryCode).eq("year", args.year)
      )
      .collect();

    const existingDates = new Set(
      existingHolidays.filter((h) => !h.isCustom).map((h) => h.date)
    );

    // Also check for business-specific holidays to avoid duplicates
    const businessHolidays = await ctx.db
      .query("public_holidays")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const businessDates = new Set(
      businessHolidays.filter((h) => h.year === args.year).map((h) => h.date)
    );

    // Insert new holidays, skipping duplicates
    let imported = 0;
    let skipped = 0;

    for (const holiday of args.holidays) {
      // Skip if already exists as system or business holiday
      if (existingDates.has(holiday.date) || businessDates.has(holiday.date)) {
        skipped++;
        continue;
      }

      await ctx.db.insert("public_holidays", {
        businessId: args.businessId,
        countryCode: args.countryCode,
        date: holiday.date,
        name: holiday.name,
        year: args.year,
        isCustom: false, // System holidays from API
        updatedAt: Date.now(),
      });

      imported++;
    }

    console.log(
      `[Holiday Import] Imported ${imported} holidays for ${args.countryCode} ${args.year}, skipped ${skipped} duplicates`
    );

    return {
      imported,
      skipped,
      total: args.holidays.length,
    };
  },
});

/**
 * Clear all system holidays for a business (before re-importing)
 */
export const clearSystemHolidays = mutation({
  args: {
    businessId: v.id("businesses"),
    year: v.optional(v.number()),
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
      throw new Error("Only admins can clear holidays");
    }

    // Get system holidays for this business
    const holidays = await ctx.db
      .query("public_holidays")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Filter to system holidays only (not custom)
    let toDelete = holidays.filter((h) => !h.isCustom);

    // Filter by year if specified
    if (args.year) {
      toDelete = toDelete.filter((h) => h.year === args.year);
    }

    // Delete them
    for (const holiday of toDelete) {
      await ctx.db.delete(holiday._id);
    }

    console.log(`[Holiday Clear] Cleared ${toDelete.length} system holidays`);

    return { deleted: toDelete.length };
  },
});

/**
 * Update a holiday (admin only)
 * Works for both system and custom holidays belonging to the business
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

    // Must have a businessId (belongs to a business, not global system data)
    if (!holiday.businessId) {
      throw new Error("Cannot update global system holidays");
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
