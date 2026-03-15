/**
 * Export Schedules Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Creating, listing, updating, deleting export schedules
 * - Enabling/disabling schedules
 * - Running scheduled exports via cron
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";
import {
  exportModuleValidator,
  exportFrequencyValidator,
  dateRangeTypeValidator,
} from "../lib/validators";

// ============================================
// QUERIES
// ============================================

/**
 * List export schedules for a business
 */
export const list = query({
  args: {
    businessId: v.string(),
    isEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { schedules: [] };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { schedules: [] };
    }

    // Resolve businessId
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { schedules: [] };
    }

    // Verify user has access to business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { schedules: [] };
    }

    // Only finance_admin and owner can view schedules
    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      return { schedules: [] };
    }

    // Query schedules
    let schedules = await ctx.db
      .query("export_schedules")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Apply filters
    if (args.isEnabled !== undefined) {
      schedules = schedules.filter((s) => s.isEnabled === args.isEnabled);
    }

    // Sort by next run time
    schedules.sort((a, b) => a.nextRunAt - b.nextRunAt);

    // Enrich with template info
    const enrichedSchedules = await Promise.all(
      schedules.map(async (schedule) => {
        let templateName = "Unknown Template";
        let module: "expense" | "invoice" | "leave" | "accounting" | "master-data" = "expense";

        if (schedule.templateId) {
          const template = await ctx.db.get(schedule.templateId);
          if (template) {
            templateName = template.name;
            module = template.module;
          }
        } else if (schedule.prebuiltTemplateId) {
          // Pre-built template name will be resolved on frontend
          // Module is inferred from prebuiltId prefix
          templateName = schedule.prebuiltTemplateId;
          if (schedule.prebuiltTemplateId.includes("-leave")) {
            module = "leave";
          } else if (schedule.prebuiltTemplateId.includes("-accounting") || schedule.prebuiltTemplateId.includes("-journal") || schedule.prebuiltTemplateId.startsWith("sql-accounting-gl")) {
            module = "accounting";
          } else if (schedule.prebuiltTemplateId.includes("-invoice") || schedule.prebuiltTemplateId.startsWith("sql-accounting-a")) {
            module = "invoice";
          } else {
            module = "expense";
          }
        }

        const creator = schedule.createdBy
          ? await ctx.db.get(schedule.createdBy)
          : null;

        return {
          ...schedule,
          templateName,
          module,
          creator: creator
            ? {
                _id: creator._id,
                fullName: creator.fullName,
                email: creator.email,
              }
            : null,
        };
      })
    );

    return { schedules: enrichedSchedules };
  },
});

/**
 * Get a single export schedule
 */
export const get = query({
  args: {
    scheduleId: v.id("export_schedules"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) {
      return null;
    }

    // Verify user has admin access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", schedule.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      return null;
    }

    return schedule;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new export schedule
 */
export const create = mutation({
  args: {
    businessId: v.string(),
    templateId: v.optional(v.id("export_templates")),
    prebuiltTemplateId: v.optional(v.string()),
    frequency: exportFrequencyValidator,
    hourUtc: v.number(),
    minuteUtc: v.optional(v.number()),
    dayOfWeek: v.optional(v.number()),
    dayOfMonth: v.optional(v.number()),
    filters: v.optional(
      v.object({
        statusFilter: v.optional(v.array(v.string())),
        employeeIds: v.optional(v.array(v.id("users"))),
        dateRangeType: v.optional(dateRangeTypeValidator),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Resolve businessId
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Verify user has admin access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Only owners and finance admins can create schedules");
    }

    // Must have either templateId or prebuiltTemplateId
    if (!args.templateId && !args.prebuiltTemplateId) {
      throw new Error("Either templateId or prebuiltTemplateId is required");
    }

    // Validate frequency parameters
    if (args.frequency === "weekly" && args.dayOfWeek === undefined) {
      throw new Error("dayOfWeek is required for weekly schedules");
    }
    if (args.frequency === "monthly" && args.dayOfMonth === undefined) {
      throw new Error("dayOfMonth is required for monthly schedules");
    }

    // Calculate next run time
    const nextRunAt = calculateNextRunTime(
      args.frequency,
      args.hourUtc,
      args.minuteUtc ?? 0,
      args.dayOfWeek,
      args.dayOfMonth
    );

    const scheduleId = await ctx.db.insert("export_schedules", {
      businessId: business._id,
      templateId: args.templateId,
      prebuiltTemplateId: args.prebuiltTemplateId,
      frequency: args.frequency,
      hourUtc: args.hourUtc,
      minuteUtc: args.minuteUtc ?? 0,
      dayOfWeek: args.dayOfWeek,
      dayOfMonth: args.dayOfMonth,
      filters: args.filters,
      isEnabled: true,
      nextRunAt,
      createdBy: user._id,
    });

    return scheduleId;
  },
});

/**
 * Update an export schedule
 */
export const update = mutation({
  args: {
    scheduleId: v.id("export_schedules"),
    frequency: v.optional(exportFrequencyValidator),
    hourUtc: v.optional(v.number()),
    minuteUtc: v.optional(v.number()),
    dayOfWeek: v.optional(v.number()),
    dayOfMonth: v.optional(v.number()),
    filters: v.optional(
      v.object({
        statusFilter: v.optional(v.array(v.string())),
        employeeIds: v.optional(v.array(v.id("users"))),
        dateRangeType: v.optional(dateRangeTypeValidator),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    // Verify user has admin access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", schedule.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Only owners and finance admins can update schedules");
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    const frequency = args.frequency ?? schedule.frequency;
    const hourUtc = args.hourUtc ?? schedule.hourUtc;
    const minuteUtc = args.minuteUtc ?? schedule.minuteUtc;
    const dayOfWeek = args.dayOfWeek ?? schedule.dayOfWeek;
    const dayOfMonth = args.dayOfMonth ?? schedule.dayOfMonth;

    if (args.frequency !== undefined) updates.frequency = args.frequency;
    if (args.hourUtc !== undefined) updates.hourUtc = args.hourUtc;
    if (args.minuteUtc !== undefined) updates.minuteUtc = args.minuteUtc;
    if (args.dayOfWeek !== undefined) updates.dayOfWeek = args.dayOfWeek;
    if (args.dayOfMonth !== undefined) updates.dayOfMonth = args.dayOfMonth;
    if (args.filters !== undefined) updates.filters = args.filters;

    // Recalculate next run time if schedule changed
    if (
      args.frequency !== undefined ||
      args.hourUtc !== undefined ||
      args.minuteUtc !== undefined ||
      args.dayOfWeek !== undefined ||
      args.dayOfMonth !== undefined
    ) {
      updates.nextRunAt = calculateNextRunTime(
        frequency,
        hourUtc,
        minuteUtc ?? 0,
        dayOfWeek,
        dayOfMonth
      );
    }

    await ctx.db.patch(args.scheduleId, updates);
    return args.scheduleId;
  },
});

/**
 * Enable or disable a schedule
 */
export const setEnabled = mutation({
  args: {
    scheduleId: v.id("export_schedules"),
    isEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    // Verify user has admin access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", schedule.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Only owners and finance admins can toggle schedules");
    }

    // If enabling, recalculate next run time
    const updates: Record<string, unknown> = {
      isEnabled: args.isEnabled,
      updatedAt: Date.now(),
    };

    if (args.isEnabled) {
      updates.nextRunAt = calculateNextRunTime(
        schedule.frequency,
        schedule.hourUtc,
        schedule.minuteUtc ?? 0,
        schedule.dayOfWeek,
        schedule.dayOfMonth
      );
    }

    await ctx.db.patch(args.scheduleId, updates);
    return { success: true };
  },
});

/**
 * Delete an export schedule
 */
export const remove = mutation({
  args: {
    scheduleId: v.id("export_schedules"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    // Verify user has admin access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", schedule.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Only owners and finance admins can delete schedules");
    }

    await ctx.db.delete(args.scheduleId);
    return { success: true };
  },
});

// ============================================
// INTERNAL MUTATIONS (for cron job)
// ============================================

/**
 * Run scheduled exports (called by hourly cron job)
 */
export const runScheduledExports = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find all enabled schedules that are due
    const allSchedules = await ctx.db.query("export_schedules").collect();
    const dueSchedules = allSchedules.filter(
      (s) => s.isEnabled && s.nextRunAt <= now
    );

    console.log(
      `[Export Scheduler] Found ${dueSchedules.length} schedules due for execution`
    );

    let successCount = 0;
    let failCount = 0;

    for (const schedule of dueSchedules) {
      try {
        // Get module from template
        let module: "expense" | "invoice" | "leave" | "accounting" | "master-data" = "expense";
        let templateName = "Scheduled Export";
        if (schedule.templateId) {
          const template = await ctx.db.get(schedule.templateId);
          if (template) {
            module = template.module;
            templateName = template.name;
          }
        }

        // Convert schedule filters to history filters format
        const historyFilters = schedule.filters
          ? {
              statusFilter: schedule.filters.statusFilter,
              employeeIds: schedule.filters.employeeIds?.map((id) => id.toString()),
            }
          : undefined;

        // Create export history record
        const historyId = await ctx.db.insert("export_history", {
          businessId: schedule.businessId,
          templateId: schedule.templateId,
          prebuiltTemplateId: schedule.prebuiltTemplateId,
          templateName,
          module,
          recordCount: 0,
          fileSize: 0,
          filters: historyFilters,
          status: "processing",
          triggeredBy: "schedule",
          scheduleId: schedule._id,
        });

        // Note: Actual CSV generation would happen here via action
        // For now, mark as completed (placeholder)
        await ctx.db.patch(historyId, {
          status: "completed",
          completedAt: Date.now(),
        });

        // Update schedule with next run time and last run time
        const nextRunAt = calculateNextRunTime(
          schedule.frequency,
          schedule.hourUtc,
          schedule.minuteUtc ?? 0,
          schedule.dayOfWeek,
          schedule.dayOfMonth
        );

        await ctx.db.patch(schedule._id, {
          lastRunAt: now,
          nextRunAt,
        });

        successCount++;
      } catch (error) {
        console.error(
          `[Export Scheduler] Failed to run schedule ${schedule._id}:`,
          error
        );
        failCount++;
      }
    }

    console.log(
      `[Export Scheduler] Completed: ${successCount} succeeded, ${failCount} failed`
    );
    return { successCount, failCount };
  },
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculateNextRunTime(
  frequency: "daily" | "weekly" | "monthly",
  hourUtc: number,
  minuteUtc: number,
  dayOfWeek?: number,
  dayOfMonth?: number
): number {
  const now = new Date();
  const next = new Date(now);

  // Set time
  next.setUTCHours(hourUtc, minuteUtc, 0, 0);

  switch (frequency) {
    case "daily":
      // If time has passed today, move to tomorrow
      if (next <= now) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      break;

    case "weekly":
      if (dayOfWeek !== undefined) {
        // Move to next occurrence of dayOfWeek
        const currentDay = next.getUTCDay();
        let daysUntil = dayOfWeek - currentDay;
        if (daysUntil < 0 || (daysUntil === 0 && next <= now)) {
          daysUntil += 7;
        }
        next.setUTCDate(next.getUTCDate() + daysUntil);
      }
      break;

    case "monthly":
      if (dayOfMonth !== undefined) {
        next.setUTCDate(dayOfMonth);
        // If date has passed this month, move to next month
        if (next <= now) {
          next.setUTCMonth(next.getUTCMonth() + 1);
        }
        // Handle months with fewer days
        while (next.getUTCDate() !== dayOfMonth) {
          next.setUTCDate(dayOfMonth);
        }
      }
      break;
  }

  return next.getTime();
}
