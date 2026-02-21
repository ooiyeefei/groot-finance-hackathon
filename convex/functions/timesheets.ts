/**
 * Timesheet Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Timesheet CRUD and status transitions
 * - Employee confirmation workflow
 * - Manager approval for anomaly-flagged timesheets
 * - Auto-generation from attendance records (cron)
 * - Auto-confirmation past deadline (cron)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { Id, Doc } from "../_generated/dataModel";

// ============================================
// QUERIES
// ============================================

/**
 * Get the current user's timesheets for a business.
 * Optionally filtered by year. Sorted by periodStartDate descending.
 */
export const getMyTimesheets = query({
  args: {
    businessId: v.string(),
    year: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return [];

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    // Fetch timesheets for the user
    let timesheets = await ctx.db
      .query("timesheets")
      .withIndex("by_businessId_userId_periodStartDate", (q) =>
        q.eq("businessId", business._id).eq("userId", user._id)
      )
      .collect();

    // Filter by year if specified
    if (args.year) {
      const yearStart = `${args.year}-01-01`;
      const yearEnd = `${args.year}-12-31`;
      timesheets = timesheets.filter(
        (ts) => ts.periodStartDate >= yearStart && ts.periodStartDate <= yearEnd
      );
    }

    // Sort by periodStartDate descending
    timesheets.sort((a, b) => b.periodStartDate.localeCompare(a.periodStartDate));

    // Apply limit
    const limit = args.limit ?? 50;
    return timesheets.slice(0, limit);
  },
});

/**
 * Get a single timesheet by ID.
 * Enriched with user info (fullName, email) and approver info.
 * Access: Owner of timesheet, assigned approver, or admin (owner/finance_admin).
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

    // Resolve the timesheet ID
    let timesheet: Doc<"timesheets"> | null;
    try {
      timesheet = await ctx.db.get(args.id as Id<"timesheets">);
    } catch {
      return null;
    }
    if (!timesheet) return null;

    // Check access: must be member of the business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", timesheet!.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return null;

    const role = membership.role;

    // Check if user can view this timesheet
    const canView =
      role === "owner" ||
      role === "finance_admin" ||
      timesheet.userId === user._id ||
      timesheet.approverId === user._id;

    if (!canView) return null;

    // Enrich with user info
    const timesheetUser = await ctx.db.get(timesheet.userId) as Doc<"users"> | null;
    const approver = timesheet.approverId
      ? (await ctx.db.get(timesheet.approverId) as Doc<"users"> | null)
      : null;

    return {
      ...timesheet,
      user: timesheetUser
        ? {
            _id: timesheetUser._id,
            fullName: timesheetUser.fullName,
            email: timesheetUser.email,
          }
        : null,
      approver: approver
        ? {
            _id: approver._id,
            fullName: approver.fullName,
            email: approver.email,
          }
        : null,
    };
  },
});

/**
 * Get timesheets pending manager review.
 * Returns timesheets where status="confirmed" AND hasAnomalies=true AND approverId=currentUser.
 * Access: Manager+
 */
export const getPendingForManager = query({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return [];

    // Verify user has approval permissions (manager+)
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    const role = membership.role;
    if (role === "employee") return []; // Employees can't approve

    // Get confirmed timesheets assigned to current user
    let timesheets = await ctx.db
      .query("timesheets")
      .withIndex("by_approverId_status", (q) =>
        q.eq("approverId", user._id).eq("status", "confirmed")
      )
      .collect();

    // Filter to only those with anomalies
    timesheets = timesheets.filter((ts) => ts.hasAnomalies === true);

    // For owners/finance_admins, also include unassigned confirmed timesheets with anomalies
    if (role === "owner" || role === "finance_admin") {
      const allConfirmed = await ctx.db
        .query("timesheets")
        .withIndex("by_businessId_status", (q) =>
          q.eq("businessId", business._id).eq("status", "confirmed")
        )
        .collect();

      const existingIds = new Set(timesheets.map((ts) => ts._id));
      for (const ts of allConfirmed) {
        if (!existingIds.has(ts._id) && ts.hasAnomalies) {
          timesheets.push(ts);
        }
      }
    }

    // Enrich with user info
    const enrichedTimesheets = await Promise.all(
      timesheets.map(async (ts) => {
        const tsUser = await ctx.db.get(ts.userId);
        return {
          ...ts,
          user: tsUser
            ? {
                _id: tsUser._id,
                fullName: tsUser.fullName,
                email: tsUser.email,
              }
            : null,
        };
      })
    );

    // Sort by periodStartDate ascending (oldest first for FIFO processing)
    enrichedTimesheets.sort((a, b) =>
      a.periodStartDate.localeCompare(b.periodStartDate)
    );

    return enrichedTimesheets;
  },
});

/**
 * Get all timesheets for a business (admin view).
 * Optionally filtered by periodStartDate and status.
 * Access: Owner/finance_admin only.
 */
export const getBusinessTimesheets = query({
  args: {
    businessId: v.string(),
    periodStartDate: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return [];

    // Verify admin role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    const role = membership.role;
    if (role !== "owner" && role !== "finance_admin") return [];

    // Fetch all timesheets for the business
    let timesheets = await ctx.db
      .query("timesheets")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter by status if specified
    if (args.status) {
      timesheets = timesheets.filter((ts) => ts.status === args.status);
    }

    // Filter by periodStartDate if specified
    if (args.periodStartDate) {
      timesheets = timesheets.filter(
        (ts) => ts.periodStartDate === args.periodStartDate
      );
    }

    // Enrich with user info
    const enrichedTimesheets = await Promise.all(
      timesheets.map(async (ts) => {
        const tsUser = await ctx.db.get(ts.userId) as Doc<"users"> | null;
        const approver = ts.approverId
          ? (await ctx.db.get(ts.approverId) as Doc<"users"> | null)
          : null;

        return {
          ...ts,
          user: tsUser
            ? {
                _id: tsUser._id,
                fullName: tsUser.fullName,
                email: tsUser.email,
              }
            : null,
          approver: approver
            ? {
                _id: approver._id,
                fullName: approver.fullName,
                email: approver.email,
              }
            : null,
        };
      })
    );

    // Sort by periodStartDate desc, then by user name
    enrichedTimesheets.sort((a, b) => {
      const dateCompare = b.periodStartDate.localeCompare(a.periodStartDate);
      if (dateCompare !== 0) return dateCompare;
      return (a.user?.fullName ?? "").localeCompare(b.user?.fullName ?? "");
    });

    return enrichedTimesheets;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Confirm a timesheet (draft -> confirmed or auto-approved).
 * If no anomalies: auto-approve (status -> "approved").
 * If anomalies: status -> "confirmed" (routes to approverId for review).
 */
export const confirm = mutation({
  args: {
    id: v.id("timesheets"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const timesheet = await ctx.db.get(args.id);
    if (!timesheet) throw new Error("Timesheet not found");

    // Verify ownership
    if (timesheet.userId !== user._id) {
      throw new Error("Not authorized to confirm this timesheet");
    }

    // Can only confirm draft timesheets
    if (timesheet.status !== "draft") {
      throw new Error("Can only confirm draft timesheets");
    }

    const now = Date.now();

    if (!timesheet.hasAnomalies) {
      // Auto-approve: no anomalies means no manager review needed
      await ctx.db.patch(args.id, {
        status: "approved",
        confirmedAt: now,
        confirmedBy: "employee",
        approvedAt: now,
        updatedAt: now,
      });
    } else {
      // Route to approverId for review
      await ctx.db.patch(args.id, {
        status: "confirmed",
        confirmedAt: now,
        confirmedBy: "employee",
        updatedAt: now,
      });
    }

    // Audit log
    await ctx.db.insert("audit_events", {
      businessId: timesheet.businessId,
      actorUserId: user._id,
      eventType: "timesheet.confirmed",
      targetEntityType: "timesheets",
      targetEntityId: args.id as unknown as string,
      details: {
        hasAnomalies: timesheet.hasAnomalies,
        autoApproved: !timesheet.hasAnomalies,
        periodStartDate: timesheet.periodStartDate,
        periodEndDate: timesheet.periodEndDate,
      },
    });

    return args.id;
  },
});

/**
 * Edit a daily entry within a timesheet.
 * Only allowed in draft or confirmed status. If confirmed, resets to draft.
 * Adds "manual_edit" flag and sets hasAnomalies=true.
 */
export const editEntry = mutation({
  args: {
    id: v.id("timesheets"),
    date: v.string(),
    checkInTime: v.optional(v.number()),
    checkOutTime: v.optional(v.number()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const timesheet = await ctx.db.get(args.id);
    if (!timesheet) throw new Error("Timesheet not found");

    // Verify ownership
    if (timesheet.userId !== user._id) {
      throw new Error("Not authorized to edit this timesheet");
    }

    // Can only edit draft or confirmed timesheets
    if (timesheet.status !== "draft" && timesheet.status !== "confirmed") {
      throw new Error("Can only edit draft or confirmed timesheets");
    }

    // Reason is required
    if (!args.reason || args.reason.trim().length === 0) {
      throw new Error("Reason is required for manual edits");
    }

    // Find the daily entry for the given date
    const dailyEntries = [...timesheet.dailyEntries];
    const entryIndex = dailyEntries.findIndex((e) => e.date === args.date);

    if (entryIndex === -1) {
      throw new Error(`No entry found for date ${args.date}`);
    }

    const entry = { ...dailyEntries[entryIndex] };

    // Update check-in/check-out times
    if (args.checkInTime !== undefined) {
      entry.checkInTime = args.checkInTime;
    }
    if (args.checkOutTime !== undefined) {
      entry.checkOutTime = args.checkOutTime;
    }

    // Recalculate regularMinutes if both times are present
    if (entry.checkInTime !== undefined && entry.checkOutTime !== undefined) {
      const workedMinutes = Math.round(
        (entry.checkOutTime - entry.checkInTime) / 60000
      );
      // regularMinutes capped at scheduled hours; the rest is overtime
      // For simplicity, we set regularMinutes to workedMinutes (overtime calc at generation)
      entry.regularMinutes = Math.max(0, workedMinutes);
    }

    // Add manual_edit flag
    if (!entry.flags.includes("manual_edit")) {
      entry.flags = [...entry.flags, "manual_edit"];
    }

    // Replace the entry
    dailyEntries[entryIndex] = entry;

    // Recalculate totals
    const totalRegularMinutes = dailyEntries.reduce(
      (sum, e) => sum + e.regularMinutes,
      0
    );
    const totalOvertimeMinutes = dailyEntries.reduce(
      (sum, e) => sum + e.overtimeMinutes,
      0
    );
    const attendanceDeductionMinutes = dailyEntries.reduce(
      (sum, e) => sum + e.hoursDeducted,
      0
    );
    const netPayableMinutes =
      totalRegularMinutes + totalOvertimeMinutes - attendanceDeductionMinutes;

    // Build anomaly summary
    const anomalySummary: string[] = [];
    for (const e of dailyEntries) {
      for (const flag of e.flags) {
        const desc = `${e.date}: ${flag}`;
        if (!anomalySummary.includes(desc)) {
          anomalySummary.push(desc);
        }
      }
    }

    const now = Date.now();

    // If confirmed, reset to draft (employee changed their mind)
    const newStatus = timesheet.status === "confirmed" ? "draft" : timesheet.status;

    await ctx.db.patch(args.id, {
      dailyEntries,
      totalRegularMinutes,
      totalOvertimeMinutes,
      attendanceDeductionMinutes,
      netPayableMinutes,
      hasAnomalies: true,
      anomalySummary,
      status: newStatus,
      // Clear confirmation if resetting to draft
      ...(newStatus === "draft" && timesheet.status === "confirmed"
        ? { confirmedAt: undefined, confirmedBy: undefined }
        : {}),
      updatedAt: now,
    });

    // Audit log
    await ctx.db.insert("audit_events", {
      businessId: timesheet.businessId,
      actorUserId: user._id,
      eventType: "timesheet.entry_edited",
      targetEntityType: "timesheets",
      targetEntityId: args.id as unknown as string,
      details: {
        date: args.date,
        reason: args.reason,
        checkInTime: args.checkInTime,
        checkOutTime: args.checkOutTime,
        previousStatus: timesheet.status,
        newStatus,
      },
    });

    return args.id;
  },
});

/**
 * Approve a timesheet (confirmed -> approved).
 * Access: Assigned approverId, owner, or finance_admin.
 */
export const approve = mutation({
  args: {
    id: v.id("timesheets"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const timesheet = await ctx.db.get(args.id);
    if (!timesheet) throw new Error("Timesheet not found");

    // Can only approve confirmed timesheets
    if (timesheet.status !== "confirmed") {
      throw new Error("Can only approve confirmed timesheets");
    }

    // Verify approver has permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", timesheet.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    const role = membership.role;
    const isAssignedApprover = timesheet.approverId === user._id;
    const canApprove =
      isAssignedApprover || role === "owner" || role === "finance_admin";

    if (!canApprove) {
      throw new Error("Not authorized to approve this timesheet");
    }

    const now = Date.now();

    await ctx.db.patch(args.id, {
      status: "approved",
      approvedAt: now,
      approverNotes: args.notes,
      updatedAt: now,
    });

    // Audit log
    await ctx.db.insert("audit_events", {
      businessId: timesheet.businessId,
      actorUserId: user._id,
      eventType: "timesheet.approved",
      targetEntityType: "timesheets",
      targetEntityId: args.id as unknown as string,
      details: {
        periodStartDate: timesheet.periodStartDate,
        periodEndDate: timesheet.periodEndDate,
        timesheetUserId: timesheet.userId as unknown as string,
        notes: args.notes,
      },
    });

    return args.id;
  },
});

/**
 * Reject a timesheet (confirmed -> draft).
 * Sends it back to the employee for corrections.
 * Access: Assigned approverId, owner, or finance_admin.
 */
export const reject = mutation({
  args: {
    id: v.id("timesheets"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const timesheet = await ctx.db.get(args.id);
    if (!timesheet) throw new Error("Timesheet not found");

    // Can only reject confirmed timesheets
    if (timesheet.status !== "confirmed") {
      throw new Error("Can only reject confirmed timesheets");
    }

    // Reason is required
    if (!args.reason || args.reason.trim().length === 0) {
      throw new Error("Rejection reason is required");
    }

    // Verify approver has permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", timesheet.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    const role = membership.role;
    const isAssignedApprover = timesheet.approverId === user._id;
    const canReject =
      isAssignedApprover || role === "owner" || role === "finance_admin";

    if (!canReject) {
      throw new Error("Not authorized to reject this timesheet");
    }

    const now = Date.now();

    await ctx.db.patch(args.id, {
      status: "draft",
      approverNotes: args.reason,
      // Clear confirmation so employee must re-confirm
      confirmedAt: undefined,
      confirmedBy: undefined,
      updatedAt: now,
    });

    // Audit log
    await ctx.db.insert("audit_events", {
      businessId: timesheet.businessId,
      actorUserId: user._id,
      eventType: "timesheet.rejected",
      targetEntityType: "timesheets",
      targetEntityId: args.id as unknown as string,
      details: {
        periodStartDate: timesheet.periodStartDate,
        periodEndDate: timesheet.periodEndDate,
        timesheetUserId: timesheet.userId as unknown as string,
        reason: args.reason,
      },
    });

    return args.id;
  },
});

// ============================================
// INTERNAL MUTATIONS (for cron jobs)
// ============================================

/**
 * Helper: Format a Date object as ISO date string (YYYY-MM-DD)
 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Helper: Add days to a date
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Helper: Calculate period start/end dates based on frequency.
 * Returns the most recently completed period.
 */
function calculatePeriodDates(
  frequency: string,
  startDay: number,
  today: Date
): { periodStart: Date; periodEnd: Date } | null {
  if (frequency === "weekly") {
    // startDay: 0=Sun, 1=Mon, ..., 6=Sat
    // Find the most recent occurrence of startDay before today
    const currentDay = today.getDay();
    let daysBack = currentDay - startDay;
    if (daysBack <= 0) daysBack += 7;
    const periodEnd = addDays(today, -daysBack + 7 - 1); // end of the period
    const periodStart = addDays(periodEnd, -6); // 7 days period

    // Only return if the period has ended (periodEnd < today)
    if (periodEnd >= today) {
      // The period hasn't ended yet; return the previous one
      return {
        periodStart: addDays(periodStart, -7),
        periodEnd: addDays(periodEnd, -7),
      };
    }
    return { periodStart, periodEnd };
  }

  if (frequency === "biweekly") {
    // Similar to weekly but 14-day periods
    const currentDay = today.getDay();
    let daysBack = currentDay - startDay;
    if (daysBack <= 0) daysBack += 7;
    // We need to figure out which 14-day cycle we're in
    // Use a reference date (epoch adjusted) for biweekly alignment
    const refDate = new Date("2024-01-01"); // Monday as reference
    const daysSinceRef = Math.floor(
      (today.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const adjustedDays = ((daysSinceRef % 14) + 14) % 14;
    const periodEnd = addDays(today, -adjustedDays - 1);
    const periodStart = addDays(periodEnd, -13);

    if (periodEnd >= today) {
      return {
        periodStart: addDays(periodStart, -14),
        periodEnd: addDays(periodEnd, -14),
      };
    }
    return { periodStart, periodEnd };
  }

  if (frequency === "monthly") {
    // startDay: 1-28 (day of month when period starts)
    const year = today.getFullYear();
    const month = today.getMonth();
    const todayDay = today.getDate();

    if (todayDay >= startDay) {
      // Current period started this month, previous period ended yesterday or earlier
      const periodStart = new Date(year, month - 1, startDay);
      const periodEnd = addDays(new Date(year, month, startDay), -1);
      return { periodStart, periodEnd };
    } else {
      // Current period started last month
      const periodStart = new Date(year, month - 2, startDay);
      const periodEnd = addDays(new Date(year, month - 1, startDay), -1);
      return { periodStart, periodEnd };
    }
  }

  return null;
}

/**
 * Generate timesheets for all businesses with active pay period configs.
 * Called by cron at the end of each pay period.
 *
 * For each tracked employee, generates a timesheet by:
 * 1. Fetching attendance_records for the period
 * 2. Fetching approved leave_requests overlapping the period
 * 3. Fetching public_holidays for the period
 * 4. Building daily entries and calculating totals
 * 5. Detecting anomalies
 * 6. Inserting timesheet with status "draft"
 */
export const generateTimesheets = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = new Date();
    const todayStr = formatDate(today);
    let generatedCount = 0;

    // Get all active pay period configs
    const allConfigs = await ctx.db.query("pay_period_configs").collect();
    const activeConfigs = allConfigs.filter((c) => c.isActive);

    for (const config of activeConfigs) {
      // Calculate if a period just ended
      const periodDates = calculatePeriodDates(
        config.frequency,
        config.startDay,
        today
      );
      if (!periodDates) continue;

      const periodStartStr = formatDate(periodDates.periodStart);
      const periodEndStr = formatDate(periodDates.periodEnd);

      // Get all tracked employees for this business
      const memberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", config.businessId)
        )
        .collect();

      const trackedMembers = memberships.filter(
        (m) => m.status === "active" && m.isAttendanceTracked === true
      );

      // Get the business's country code for holiday lookups
      const business = await ctx.db.get(config.businessId);
      const countryCode = business?.countryCode ?? "MY";

      // Get public holidays for this period
      const periodYear = periodDates.periodStart.getFullYear();
      const holidays = await ctx.db
        .query("public_holidays")
        .withIndex("by_countryCode_year", (q) =>
          q.eq("countryCode", countryCode).eq("year", periodYear)
        )
        .collect();

      // Also get business-specific holidays
      const businessHolidays = await ctx.db
        .query("public_holidays")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", config.businessId)
        )
        .collect();

      // Combine and filter to period
      const allHolidays = [...holidays, ...businessHolidays];
      const periodHolidayDates = new Set(
        allHolidays
          .filter((h) => h.date >= periodStartStr && h.date <= periodEndStr)
          .map((h) => h.date)
      );

      for (const member of trackedMembers) {
        // Check if timesheet already exists for this user + period
        const existingTimesheet = await ctx.db
          .query("timesheets")
          .withIndex("by_businessId_userId_periodStartDate", (q) =>
            q
              .eq("businessId", config.businessId)
              .eq("userId", member.userId)
              .eq("periodStartDate", periodStartStr)
          )
          .first();

        if (existingTimesheet) continue; // Skip if already generated

        // Get the work schedule for this employee
        let workSchedule;
        if (member.workScheduleId) {
          workSchedule = await ctx.db.get(member.workScheduleId);
        }
        if (!workSchedule) {
          // Fall back to default work schedule
          workSchedule = await ctx.db
            .query("work_schedules")
            .withIndex("by_businessId_isDefault", (q) =>
              q.eq("businessId", config.businessId).eq("isDefault", true)
            )
            .first();
        }

        // Default work days: Mon-Fri
        const workDays = workSchedule?.workDays ?? [1, 2, 3, 4, 5];
        const regularMinutesPerDay = workSchedule
          ? workSchedule.regularHoursPerDay * 60
          : 480; // 8 hours default

        // Get attendance records for the period
        const attendanceRecords = await ctx.db
          .query("attendance_records")
          .withIndex("by_businessId_userId_date", (q) =>
            q
              .eq("businessId", config.businessId)
              .eq("userId", member.userId)
          )
          .collect();

        // Filter to period range
        const periodAttendance = attendanceRecords.filter(
          (r) => r.date >= periodStartStr && r.date <= periodEndStr
        );

        // Build attendance lookup by date
        const attendanceByDate = new Map(
          periodAttendance.map((r) => [r.date, r])
        );

        // Get approved leave requests overlapping the period
        const leaveRequests = await ctx.db
          .query("leave_requests")
          .withIndex("by_businessId_userId", (q) =>
            q
              .eq("businessId", config.businessId)
              .eq("userId", member.userId)
          )
          .collect();

        const approvedLeaves = leaveRequests.filter(
          (lr) =>
            lr.status === "approved" &&
            lr.startDate <= periodEndStr &&
            lr.endDate >= periodStartStr
        );

        // Build set of leave dates with their type
        const leaveDateMap = new Map<string, string>();
        for (const leave of approvedLeaves) {
          const leaveType = await ctx.db.get(leave.leaveTypeId);
          const leaveTypeName = leaveType?.name ?? "Leave";
          // Iterate through each date in the leave period
          const leaveStart = new Date(leave.startDate + "T00:00:00");
          const leaveEnd = new Date(leave.endDate + "T00:00:00");
          const current = new Date(leaveStart);
          while (current <= leaveEnd) {
            const dateStr = formatDate(current);
            if (dateStr >= periodStartStr && dateStr <= periodEndStr) {
              leaveDateMap.set(dateStr, leaveTypeName);
            }
            current.setDate(current.getDate() + 1);
          }
        }

        // Get manager as approver
        const approverId = member.managerId ?? undefined;

        // Build daily entries
        const dailyEntries: Array<{
          date: string;
          attendanceRecordId?: string;
          dayType: string;
          leaveType?: string;
          checkInTime?: number;
          checkOutTime?: number;
          regularMinutes: number;
          overtimeMinutes: number;
          overtimeTier?: string;
          attendanceStatus: string;
          latenessMinutes: number;
          earlyDepartureMinutes: number;
          hoursDeducted: number;
          deductionWaived: boolean;
          flags: string[];
        }> = [];

        const anomalies: string[] = [];
        let totalRegularMinutes = 0;
        let totalOvertimeMinutes = 0;
        let attendanceDeductionMinutes = 0;
        let publicHolidayDays = 0;
        const leaveCountMap = new Map<string, number>();
        const overtimeTierMap = new Map<
          string,
          { multiplier: number; minutes: number }
        >();

        // Iterate each day in the period
        const currentDate = new Date(periodDates.periodStart);
        const endDate = new Date(periodDates.periodEnd);

        while (currentDate <= endDate) {
          const dateStr = formatDate(currentDate);
          const dayOfWeek = currentDate.getDay();
          const isWorkDay = workDays.includes(dayOfWeek);
          const isHoliday = periodHolidayDates.has(dateStr);
          const isLeave = leaveDateMap.has(dateStr);
          const attendance = attendanceByDate.get(dateStr);

          let dayType: string;
          let leaveType: string | undefined;
          let regularMinutes = 0;
          let overtimeMinutes = 0;
          let latenessMinutes = 0;
          let earlyDepartureMinutes = 0;
          let hoursDeducted = 0;
          let deductionWaived = false;
          let attendanceStatus = "present";
          const flags: string[] = [];

          if (isHoliday) {
            dayType = "public_holiday";
            publicHolidayDays++;
            attendanceStatus = "present"; // Not counted as absence

            // If worked on holiday, it's overtime
            if (attendance && attendance.checkOutTime) {
              const workedMinutes = Math.round(
                (attendance.checkOutTime - attendance.checkInTime) / 60000
              );
              overtimeMinutes = Math.max(0, workedMinutes);
              // Track as public_holiday overtime tier
              const existing = overtimeTierMap.get("Public Holiday") ?? {
                multiplier: 2.0,
                minutes: 0,
              };
              existing.minutes += overtimeMinutes;
              overtimeTierMap.set("Public Holiday", existing);
            }
          } else if (isLeave) {
            dayType = "leave";
            leaveType = leaveDateMap.get(dateStr);
            attendanceStatus = "present"; // Leave is not an absence
            // Count leave days by type
            const currentCount = leaveCountMap.get(leaveType!) ?? 0;
            leaveCountMap.set(leaveType!, currentCount + 1);
          } else if (!isWorkDay) {
            dayType = "rest_day";
            attendanceStatus = "present";

            // If worked on rest day, it's overtime
            if (attendance && attendance.checkOutTime) {
              const workedMinutes = Math.round(
                (attendance.checkOutTime - attendance.checkInTime) / 60000
              );
              overtimeMinutes = Math.max(0, workedMinutes);
              const existing = overtimeTierMap.get("Rest Day") ?? {
                multiplier: 1.5,
                minutes: 0,
              };
              existing.minutes += overtimeMinutes;
              overtimeTierMap.set("Rest Day", existing);
            }
          } else {
            // Regular workday
            dayType = "workday";

            if (!attendance) {
              // Missing attendance on a workday
              attendanceStatus = "absent";
              flags.push("missing_checkin");
              anomalies.push(`${dateStr}: missing_checkin`);
            } else {
              attendanceStatus = attendance.attendanceStatus ?? "present";
              latenessMinutes = attendance.latenessMinutes ?? 0;
              earlyDepartureMinutes = attendance.earlyDepartureMinutes ?? 0;
              hoursDeducted = attendance.hoursDeducted ?? 0;
              deductionWaived = attendance.deductionWaived ?? false;

              if (!attendance.checkOutTime) {
                // Incomplete session
                flags.push("incomplete_session");
                anomalies.push(`${dateStr}: incomplete_session`);
                // Use whatever time is available
                regularMinutes = 0;
              } else {
                const workedMinutes = Math.round(
                  (attendance.checkOutTime - attendance.checkInTime) / 60000
                );
                regularMinutes = Math.min(
                  workedMinutes,
                  regularMinutesPerDay
                );
                // Overtime on a regular workday
                if (workedMinutes > regularMinutesPerDay) {
                  overtimeMinutes = workedMinutes - regularMinutesPerDay;
                  const existing = overtimeTierMap.get("Standard OT") ?? {
                    multiplier: 1.5,
                    minutes: 0,
                  };
                  existing.minutes += overtimeMinutes;
                  overtimeTierMap.set("Standard OT", existing);
                }
              }

              // Check for location flag
              if (attendance.locationFlagged) {
                flags.push("location_flagged");
                anomalies.push(`${dateStr}: location_flagged`);
              }

              // Check for manual edit flag
              if (attendance.source === "manual") {
                flags.push("manual_edit");
                anomalies.push(`${dateStr}: manual_edit`);
              }

              if (latenessMinutes > 0) {
                attendanceStatus = "late";
              }
              if (earlyDepartureMinutes > 0) {
                attendanceStatus = "early_departure";
              }
            }
          }

          totalRegularMinutes += regularMinutes;
          totalOvertimeMinutes += overtimeMinutes;
          if (!deductionWaived) {
            attendanceDeductionMinutes += hoursDeducted;
          }

          dailyEntries.push({
            date: dateStr,
            attendanceRecordId: attendance
              ? (attendance._id as unknown as string)
              : undefined,
            dayType,
            leaveType,
            checkInTime: attendance?.checkInTime,
            checkOutTime: attendance?.checkOutTime ?? undefined,
            regularMinutes,
            overtimeMinutes,
            attendanceStatus,
            latenessMinutes,
            earlyDepartureMinutes,
            hoursDeducted,
            deductionWaived,
            flags,
          });

          currentDate.setDate(currentDate.getDate() + 1);
        }

        // Build overtime tiers array
        const overtimeByTier = Array.from(overtimeTierMap.entries()).map(
          ([label, data]) => ({
            tierLabel: label,
            multiplier: data.multiplier,
            minutes: data.minutes,
          })
        );

        // Build leave days array
        const leaveDays = Array.from(leaveCountMap.entries()).map(
          ([leaveType, days]) => ({
            leaveType,
            days,
          })
        );

        const hasAnomalies = anomalies.length > 0;
        const netPayableMinutes =
          totalRegularMinutes +
          totalOvertimeMinutes -
          attendanceDeductionMinutes;

        // Insert the timesheet
        await ctx.db.insert("timesheets", {
          businessId: config.businessId,
          userId: member.userId,
          payPeriodConfigId: config._id,
          periodStartDate: periodStartStr,
          periodEndDate: periodEndStr,
          dailyEntries,
          totalRegularMinutes,
          totalOvertimeMinutes,
          overtimeByTier,
          leaveDays,
          publicHolidayDays,
          attendanceDeductionMinutes,
          netPayableMinutes,
          hasAnomalies,
          anomalySummary: hasAnomalies ? anomalies : undefined,
          status: "draft",
          approverId,
          updatedAt: Date.now(),
        });

        generatedCount++;
      }
    }

    console.log(
      `[generateTimesheets] Generated ${generatedCount} timesheets for ${todayStr}`
    );

    return { generated: generatedCount };
  },
});

/**
 * Auto-confirm draft timesheets past the confirmation deadline.
 * Called by cron daily.
 *
 * Finds draft timesheets where (periodEndDate + confirmationDeadlineDays) < today.
 * Auto-confirms with confirmedBy="system".
 * If no anomalies, auto-approves.
 */
export const autoConfirmPastDeadline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = new Date();
    const todayStr = formatDate(today);
    let confirmedCount = 0;
    let autoApprovedCount = 0;

    // Get all active pay period configs
    const allConfigs = await ctx.db.query("pay_period_configs").collect();
    const activeConfigs = allConfigs.filter((c) => c.isActive);

    for (const config of activeConfigs) {
      // Get draft timesheets for this business
      const draftTimesheets = await ctx.db
        .query("timesheets")
        .withIndex("by_businessId_status", (q) =>
          q.eq("businessId", config.businessId).eq("status", "draft")
        )
        .collect();

      for (const timesheet of draftTimesheets) {
        // Check if this timesheet uses this config
        if (
          timesheet.payPeriodConfigId !== config._id
        ) {
          continue;
        }

        // Calculate the deadline date
        const periodEnd = new Date(timesheet.periodEndDate + "T00:00:00");
        const deadlineDate = addDays(
          periodEnd,
          config.confirmationDeadlineDays
        );
        const deadlineDateStr = formatDate(deadlineDate);

        // If today is past the deadline, auto-confirm
        if (todayStr > deadlineDateStr) {
          const now = Date.now();

          if (!timesheet.hasAnomalies) {
            // No anomalies: auto-confirm + auto-approve
            await ctx.db.patch(timesheet._id, {
              status: "approved",
              confirmedAt: now,
              confirmedBy: "system",
              approvedAt: now,
              updatedAt: now,
            });
            autoApprovedCount++;
          } else {
            // Has anomalies: auto-confirm, route to approver
            await ctx.db.patch(timesheet._id, {
              status: "confirmed",
              confirmedAt: now,
              confirmedBy: "system",
              updatedAt: now,
            });
          }

          confirmedCount++;
        }
      }
    }

    console.log(
      `[autoConfirmPastDeadline] Auto-confirmed ${confirmedCount} timesheets (${autoApprovedCount} auto-approved) on ${todayStr}`
    );

    return { confirmed: confirmedCount, autoApproved: autoApprovedCount };
  },
});
