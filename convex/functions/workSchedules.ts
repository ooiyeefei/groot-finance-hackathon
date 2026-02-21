/**
 * Work Schedules Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Work schedule CRUD operations
 * - Role-based access control (owner/finance_admin only for modifications)
 * - Default schedule management
 * - Schedule assignment validation
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";

// Helper function to parse time string to minutes
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// ============================================
// QUERIES
// ============================================

/**
 * List work schedules for a business
 * - Auth: Manager or higher role required
 * - Returns all schedules, optionally filtered by isActive status
 */
export const list = query({
  args: {
    businessId: v.string(),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Resolve businessId (could be Convex ID or legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    // Check user's membership and role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    // Require at least manager role
    const role = membership.role;
    if (role !== "manager" && role !== "finance_admin" && role !== "owner") {
      return [];
    }

    // Get schedules for the business
    let schedules = await ctx.db
      .query("work_schedules")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Apply activeOnly filter if specified
    if (args.activeOnly === true) {
      schedules = schedules.filter((schedule) => schedule.isActive);
    }

    // Sort by name
    schedules.sort((a, b) => a.name.localeCompare(b.name));

    // Enrich with overtime rule info if available
    const enrichedSchedules = await Promise.all(
      schedules.map(async (schedule) => {
        const overtimeRule = schedule.overtimeRuleId
          ? await ctx.db.get(schedule.overtimeRuleId)
          : null;

        return {
          ...schedule,
          overtimeRule: overtimeRule
            ? {
                _id: overtimeRule._id,
                name: overtimeRule.name,
                rateTiers: overtimeRule.rateTiers,
              }
            : null,
        };
      })
    );

    return enrichedSchedules;
  },
});

/**
 * Get a single work schedule by ID
 * - Auth: Manager or higher in the schedule's business
 * - Returns the schedule with enriched overtime rule info
 */
export const getById = query({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return null;

    // Get the schedule directly (no legacy ID support for work_schedules)
    const scheduleId = args.id as Id<"work_schedules">;
    const schedule = await ctx.db.get(scheduleId);
    if (!schedule) return null;

    // Check user's membership in the schedule's business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", schedule.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return null;

    // Require at least manager role
    const role = membership.role;
    if (role !== "manager" && role !== "finance_admin" && role !== "owner") {
      return null;
    }

    // Enrich with overtime rule info
    const overtimeRule = schedule.overtimeRuleId
      ? await ctx.db.get(schedule.overtimeRuleId)
      : null;

    return {
      ...schedule,
      overtimeRule: overtimeRule
        ? {
            _id: overtimeRule._id,
            name: overtimeRule.name,
            rateTiers: overtimeRule.rateTiers,
          }
        : null,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new work schedule
 * - Auth: Owner or finance_admin only
 * - Calculates regularHoursPerDay from times and break
 * - Handles default schedule setting
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    workDays: v.array(v.number()),
    breakMinutes: v.number(),
    graceMinutes: v.number(),
    overtimeRuleId: v.optional(v.id("overtime_rules")),
    isDefault: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    // Verify user is owner or finance_admin of the business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Only owner and finance_admin can create schedules
    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Not authorized to create work schedules");
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(args.startTime) || !timeRegex.test(args.endTime)) {
      throw new Error("Invalid time format. Use HH:MM format");
    }

    // Calculate regular hours per day
    const startMinutes = parseTimeToMinutes(args.startTime);
    const endMinutes = parseTimeToMinutes(args.endTime);

    if (endMinutes <= startMinutes) {
      throw new Error("End time must be after start time");
    }

    const workMinutes = endMinutes - startMinutes - args.breakMinutes;
    if (workMinutes <= 0) {
      throw new Error("Work hours must be positive after accounting for break time");
    }

    const regularHoursPerDay = workMinutes / 60;

    // Validate work days (0-6)
    if (args.workDays.length === 0) {
      throw new Error("At least one work day must be selected");
    }
    if (args.workDays.some((day) => day < 0 || day > 6)) {
      throw new Error("Invalid work day. Days must be 0-6 (Sunday-Saturday)");
    }

    // If setting as default, unset other defaults
    if (args.isDefault) {
      const existingDefaults = await ctx.db
        .query("work_schedules")
        .withIndex("by_businessId_isDefault", (q) =>
          q.eq("businessId", args.businessId).eq("isDefault", true)
        )
        .collect();

      for (const existing of existingDefaults) {
        await ctx.db.patch(existing._id, {
          isDefault: false,
          updatedAt: Date.now(),
        });
      }
    }

    // Validate overtime rule if provided
    if (args.overtimeRuleId) {
      const overtimeRule = await ctx.db.get(args.overtimeRuleId);
      if (!overtimeRule || overtimeRule.businessId !== args.businessId) {
        throw new Error("Invalid overtime rule");
      }
    }

    // Create the schedule
    const scheduleId = await ctx.db.insert("work_schedules", {
      businessId: args.businessId,
      name: args.name,
      startTime: args.startTime,
      endTime: args.endTime,
      workDays: args.workDays,
      breakMinutes: args.breakMinutes,
      graceMinutes: args.graceMinutes,
      regularHoursPerDay,
      overtimeRuleId: args.overtimeRuleId,
      isDefault: args.isDefault,
      isActive: true,
      updatedAt: Date.now(),
    });

    return scheduleId;
  },
});

/**
 * Update an existing work schedule
 * - Auth: Owner or finance_admin only
 * - Recalculates regularHoursPerDay if times change
 * - Handles default schedule updates
 */
export const update = mutation({
  args: {
    id: v.id("work_schedules"),
    name: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    workDays: v.optional(v.array(v.number())),
    breakMinutes: v.optional(v.number()),
    graceMinutes: v.optional(v.number()),
    overtimeRuleId: v.optional(v.id("overtime_rules")),
    isDefault: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const schedule = await ctx.db.get(args.id);
    if (!schedule) throw new Error("Work schedule not found");

    // Verify user is owner or finance_admin of the business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", schedule.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Only owner and finance_admin can update schedules
    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Not authorized to update work schedules");
    }

    // Validate time format if provided
    if (args.startTime || args.endTime) {
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (args.startTime && !timeRegex.test(args.startTime)) {
        throw new Error("Invalid start time format. Use HH:MM format");
      }
      if (args.endTime && !timeRegex.test(args.endTime)) {
        throw new Error("Invalid end time format. Use HH:MM format");
      }
    }

    // Calculate new regular hours if time fields changed
    let regularHoursPerDay = schedule.regularHoursPerDay;
    const newStartTime = args.startTime ?? schedule.startTime;
    const newEndTime = args.endTime ?? schedule.endTime;
    const newBreakMinutes = args.breakMinutes ?? schedule.breakMinutes;

    if (args.startTime || args.endTime || args.breakMinutes !== undefined) {
      const startMinutes = parseTimeToMinutes(newStartTime);
      const endMinutes = parseTimeToMinutes(newEndTime);

      if (endMinutes <= startMinutes) {
        throw new Error("End time must be after start time");
      }

      const workMinutes = endMinutes - startMinutes - newBreakMinutes;
      if (workMinutes <= 0) {
        throw new Error("Work hours must be positive after accounting for break time");
      }

      regularHoursPerDay = workMinutes / 60;
    }

    // Validate work days if provided
    if (args.workDays) {
      if (args.workDays.length === 0) {
        throw new Error("At least one work day must be selected");
      }
      if (args.workDays.some((day) => day < 0 || day > 6)) {
        throw new Error("Invalid work day. Days must be 0-6 (Sunday-Saturday)");
      }
    }

    // If setting as default, unset other defaults
    if (args.isDefault === true) {
      const existingDefaults = await ctx.db
        .query("work_schedules")
        .withIndex("by_businessId_isDefault", (q) =>
          q.eq("businessId", schedule.businessId).eq("isDefault", true)
        )
        .collect();

      for (const existing of existingDefaults) {
        if (existing._id !== args.id) {
          await ctx.db.patch(existing._id, {
            isDefault: false,
            updatedAt: Date.now(),
          });
        }
      }
    }

    // Validate overtime rule if provided
    if (args.overtimeRuleId) {
      const overtimeRule = await ctx.db.get(args.overtimeRuleId);
      if (!overtimeRule || overtimeRule.businessId !== schedule.businessId) {
        throw new Error("Invalid overtime rule");
      }
    }

    // Update the schedule
    await ctx.db.patch(args.id, {
      ...(args.name && { name: args.name }),
      ...(args.startTime && { startTime: args.startTime }),
      ...(args.endTime && { endTime: args.endTime }),
      ...(args.workDays && { workDays: args.workDays }),
      ...(args.breakMinutes !== undefined && { breakMinutes: args.breakMinutes }),
      ...(args.graceMinutes !== undefined && { graceMinutes: args.graceMinutes }),
      ...(regularHoursPerDay !== schedule.regularHoursPerDay && { regularHoursPerDay }),
      ...(args.overtimeRuleId !== undefined && { overtimeRuleId: args.overtimeRuleId }),
      ...(args.isDefault !== undefined && { isDefault: args.isDefault }),
      ...(args.isActive !== undefined && { isActive: args.isActive }),
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Remove (soft delete) a work schedule
 * - Auth: Owner or finance_admin only
 * - Validates schedule is not assigned to any employees
 * - Validates it's not the only active schedule
 * - Soft deletes by setting isActive = false
 */
export const remove = mutation({
  args: {
    id: v.id("work_schedules"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const schedule = await ctx.db.get(args.id);
    if (!schedule) throw new Error("Work schedule not found");

    // Verify user is owner or finance_admin of the business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", schedule.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Only owner and finance_admin can remove schedules
    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Not authorized to remove work schedules");
    }

    // Check if schedule is assigned to any employees
    const assignedMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", schedule.businessId))
      .filter((q) => q.eq(q.field("workScheduleId"), args.id))
      .collect();

    if (assignedMemberships.length > 0) {
      throw new Error(
        `Cannot remove schedule. It is assigned to ${assignedMemberships.length} employee(s). Please reassign them first.`
      );
    }

    // Check if this is the only active schedule
    const activeSchedules = await ctx.db
      .query("work_schedules")
      .withIndex("by_businessId", (q) => q.eq("businessId", schedule.businessId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    if (activeSchedules.length === 1 && activeSchedules[0]._id === args.id) {
      throw new Error("Cannot remove the only active work schedule");
    }

    // If this was the default schedule, unset the default flag
    if (schedule.isDefault) {
      await ctx.db.patch(args.id, {
        isDefault: false,
      });
    }

    // Soft delete by setting isActive to false
    await ctx.db.patch(args.id, {
      isActive: false,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});