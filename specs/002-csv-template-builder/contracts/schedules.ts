/**
 * Export Schedules API Contract
 *
 * Convex functions for managing scheduled exports.
 * Location: convex/functions/exportSchedules.ts
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";

// ============================================
// QUERIES
// ============================================

/**
 * List all schedules for a business
 *
 * @param businessId - Business to list schedules for
 * @returns Array of schedules with template info
 *
 * Access: finance_admin, owner
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Verify user has finance_admin or owner role
    // 2. Query all schedules for business
    // 3. Join with template info
    // 4. Return sorted by nextRunAt
  },
});

/**
 * Get a single schedule by ID
 *
 * @param scheduleId - Schedule ID
 * @returns Schedule details with template info
 *
 * Access: finance_admin, owner
 */
export const get = query({
  args: {
    scheduleId: v.id("export_schedules"),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Query schedule by ID
    // 2. Verify user has access to business
    // 3. Join with template info
    // 4. Return schedule or null
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new scheduled export
 *
 * @param businessId - Business to create schedule for
 * @param templateId - Custom template ID (optional)
 * @param prebuiltId - Pre-built template ID (optional)
 * @param frequency - "daily", "weekly", or "monthly"
 * @param hourUtc - Hour in UTC (0-23)
 * @param minuteUtc - Minute in UTC (0-59, default 0)
 * @param dayOfWeek - Day of week for weekly (0-6, 0=Sunday)
 * @param dayOfMonth - Day of month for monthly (1-28)
 * @param filters - Export filters
 * @returns Created schedule ID
 *
 * Access: finance_admin, owner only
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    templateId: v.optional(v.id("export_templates")),
    prebuiltId: v.optional(v.string()),
    frequency: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    hourUtc: v.number(),
    minuteUtc: v.optional(v.number()),
    dayOfWeek: v.optional(v.number()),
    dayOfMonth: v.optional(v.number()),
    filters: v.optional(v.object({
      statusFilter: v.optional(v.array(v.string())),
      employeeIds: v.optional(v.array(v.id("users"))),
      dateRangeType: v.optional(v.union(
        v.literal("previous_day"),
        v.literal("previous_week"),
        v.literal("previous_month"),
        v.literal("month_to_date"),
        v.literal("year_to_date")
      )),
    })),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Verify user has finance_admin or owner role
    // 2. Validate template exists
    // 3. Validate schedule params (dayOfWeek for weekly, dayOfMonth for monthly)
    // 4. Calculate nextRunAt based on frequency and schedule
    // 5. Create schedule record with isEnabled=true
    // 6. Return schedule ID
  },
});

/**
 * Update an existing schedule
 *
 * @param scheduleId - Schedule to update
 * @param frequency - Updated frequency
 * @param hourUtc - Updated hour
 * @param minuteUtc - Updated minute
 * @param dayOfWeek - Updated day of week
 * @param dayOfMonth - Updated day of month
 * @param filters - Updated filters
 *
 * Access: finance_admin, owner only
 */
export const update = mutation({
  args: {
    scheduleId: v.id("export_schedules"),
    frequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
    hourUtc: v.optional(v.number()),
    minuteUtc: v.optional(v.number()),
    dayOfWeek: v.optional(v.number()),
    dayOfMonth: v.optional(v.number()),
    filters: v.optional(v.object({
      statusFilter: v.optional(v.array(v.string())),
      employeeIds: v.optional(v.array(v.id("users"))),
      dateRangeType: v.optional(v.union(
        v.literal("previous_day"),
        v.literal("previous_week"),
        v.literal("previous_month"),
        v.literal("month_to_date"),
        v.literal("year_to_date")
      )),
    })),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Verify user has finance_admin or owner role
    // 2. Get schedule, verify business access
    // 3. Validate updated params
    // 4. Recalculate nextRunAt if schedule changed
    // 5. Update schedule record
  },
});

/**
 * Enable or disable a schedule
 *
 * @param scheduleId - Schedule to toggle
 * @param isEnabled - New enabled state
 *
 * Access: finance_admin, owner only
 */
export const setEnabled = mutation({
  args: {
    scheduleId: v.id("export_schedules"),
    isEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Verify user has finance_admin or owner role
    // 2. Get schedule, verify business access
    // 3. Update isEnabled
    // 4. If re-enabling, recalculate nextRunAt
  },
});

/**
 * Delete a schedule
 *
 * @param scheduleId - Schedule to delete
 *
 * Access: finance_admin, owner only
 */
export const remove = mutation({
  args: {
    scheduleId: v.id("export_schedules"),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Verify user has finance_admin or owner role
    // 2. Get schedule, verify business access
    // 3. Delete schedule record
  },
});

// ============================================
// INTERNAL MUTATIONS (for cron job)
// ============================================

/**
 * Update schedule after run (internal)
 *
 * Called by the cron job after executing a scheduled export.
 */
export const updateAfterRun = internalMutation({
  args: {
    scheduleId: v.id("export_schedules"),
    success: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Update lastRunAt to now
    // 2. Calculate nextRunAt based on frequency
    // 3. If failed, optionally disable after N consecutive failures
  },
});

// ============================================
// CRON JOB HANDLER
// ============================================

/**
 * Run scheduled exports (called by cron)
 *
 * Runs hourly, checks for due schedules, executes exports.
 *
 * Location: convex/functions/exportJobs.ts
 */
export const runScheduledExports = internalMutation({
  args: {},
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Query all schedules where:
    //    - isEnabled = true
    //    - nextRunAt <= now
    // 2. For each due schedule:
    //    a. Create export_history record
    //    b. Schedule generateCsv action
    //    c. Update schedule's lastRunAt and nextRunAt
    // 3. Log execution summary
  },
});
