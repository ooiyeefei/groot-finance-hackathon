/**
 * Attendance Records Functions
 * Check-in/out, daily records, manual entry, waiver, auto-close.
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";

// ============================================
// QUERIES
// ============================================

export const getMyToday = query({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return null;
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return null;

    const today = new Date().toISOString().split("T")[0];
    return await ctx.db
      .query("attendance_records")
      .withIndex("by_businessId_userId_date", (q) =>
        q.eq("businessId", business._id).eq("userId", user._id).eq("date", today)
      )
      .first();
  },
});

export const getMyRecords = query({
  args: { businessId: v.string(), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return [];

    const records = await ctx.db
      .query("attendance_records")
      .withIndex("by_businessId_userId_date", (q) =>
        q.eq("businessId", business._id).eq("userId", user._id)
      )
      .collect();

    return records.filter((r) => r.date >= args.startDate && r.date <= args.endDate);
  },
});

export const getTeamToday = query({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return [];

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();
    if (!membership || membership.status !== "active") return [];
    if (membership.role !== "owner" && membership.role !== "finance_admin" && membership.role !== "manager") return [];

    const today = new Date().toISOString().split("T")[0];

    // Get tracked employees
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const trackedMembers = memberships.filter((m) => m.status === "active" && m.isAttendanceTracked);

    // For managers, filter to direct reports only
    const relevantMembers = membership.role === "manager"
      ? trackedMembers.filter((m) => m.managerId === user._id)
      : trackedMembers;

    const results = [];
    for (const member of relevantMembers) {
      const userDoc = await ctx.db.get(member.userId);
      const record = await ctx.db
        .query("attendance_records")
        .withIndex("by_businessId_userId_date", (q) =>
          q.eq("businessId", business._id).eq("userId", member.userId).eq("date", today)
        )
        .first();

      results.push({
        user: userDoc ? { _id: userDoc._id, fullName: userDoc.fullName, email: userDoc.email } : null,
        attendanceRecord: record,
        status: record ? record.status : "not_checked_in",
      });
    }

    return results;
  },
});

export const getTeamRecords = query({
  args: { businessId: v.string(), startDate: v.string(), endDate: v.string(), userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return [];

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();
    if (!membership || membership.status !== "active") return [];
    if (membership.role !== "owner" && membership.role !== "finance_admin" && membership.role !== "manager") return [];

    // If filtering by specific user
    if (args.userId) {
      const targetUser = await resolveById(ctx.db, "users", args.userId);
      if (!targetUser) return [];
      const records = await ctx.db
        .query("attendance_records")
        .withIndex("by_businessId_userId_date", (q) =>
          q.eq("businessId", business._id).eq("userId", targetUser._id)
        )
        .collect();
      return [{ user: { _id: targetUser._id, fullName: targetUser.fullName, email: targetUser.email }, records: records.filter((r) => r.date >= args.startDate && r.date <= args.endDate) }];
    }

    // Get all tracked employee records
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const trackedMembers = memberships.filter((m) => m.status === "active" && m.isAttendanceTracked);
    const relevantMembers = membership.role === "manager"
      ? trackedMembers.filter((m) => m.managerId === user._id)
      : trackedMembers;

    const results = [];
    for (const member of relevantMembers) {
      const userDoc = await ctx.db.get(member.userId);
      const records = await ctx.db
        .query("attendance_records")
        .withIndex("by_businessId_userId_date", (q) =>
          q.eq("businessId", business._id).eq("userId", member.userId)
        )
        .collect();

      results.push({
        user: userDoc ? { _id: userDoc._id, fullName: userDoc.fullName, email: userDoc.email } : null,
        records: records.filter((r) => r.date >= args.startDate && r.date <= args.endDate),
      });
    }

    return results;
  },
});

// ============================================
// MUTATIONS
// ============================================

export const checkIn = mutation({
  args: {
    businessId: v.id("businesses"),
    location: v.optional(v.object({ lat: v.number(), lng: v.number(), accuracy: v.number() })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();
    if (!membership || membership.status !== "active") throw new Error("Not a member");
    if (!membership.isAttendanceTracked) throw new Error("Attendance tracking not enabled for this employee");

    const today = new Date().toISOString().split("T")[0];

    // Check for existing incomplete record today
    const existing = await ctx.db
      .query("attendance_records")
      .withIndex("by_businessId_userId_date", (q) =>
        q.eq("businessId", args.businessId).eq("userId", user._id).eq("date", today)
      )
      .first();
    if (existing && existing.status === "incomplete") {
      throw new Error("Already checked in. Please check out first.");
    }
    if (existing) {
      throw new Error("Already have an attendance record for today.");
    }

    // Get work schedule for break minutes
    const schedule = membership.workScheduleId
      ? await ctx.db.get(membership.workScheduleId)
      : await ctx.db
          .query("work_schedules")
          .withIndex("by_businessId_isDefault", (q) =>
            q.eq("businessId", args.businessId).eq("isDefault", true)
          )
          .first();

    const breakMinutes = schedule?.breakMinutes ?? 60;

    const now = Date.now();
    const recordId = await ctx.db.insert("attendance_records", {
      businessId: args.businessId,
      userId: user._id,
      date: today,
      checkInTime: now,
      breakMinutes,
      status: "incomplete",
      attendanceStatus: "present",
      source: "auto",
      location: args.location,
      deductionWaived: false,
    });

    // Log audit event
    await ctx.db.insert("audit_events", {
      businessId: args.businessId,
      actorUserId: user._id,
      eventType: "attendance.check_in",
      targetEntityType: "attendance_records",
      targetEntityId: recordId as unknown as string,
      details: { date: today, location: args.location },
    });

    return recordId;
  },
});

export const checkOut = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();
    if (!membership || membership.status !== "active") throw new Error("Not a member");

    const today = new Date().toISOString().split("T")[0];
    const record = await ctx.db
      .query("attendance_records")
      .withIndex("by_businessId_userId_date", (q) =>
        q.eq("businessId", args.businessId).eq("userId", user._id).eq("date", today)
      )
      .first();
    if (!record || record.status !== "incomplete") {
      throw new Error("No active check-in found for today");
    }

    const now = Date.now();
    const totalMinutes = Math.max(0, Math.floor((now - record.checkInTime) / 60000) - record.breakMinutes);

    // Get work schedule for classification
    const schedule = membership.workScheduleId
      ? await ctx.db.get(membership.workScheduleId)
      : await ctx.db
          .query("work_schedules")
          .withIndex("by_businessId_isDefault", (q) =>
            q.eq("businessId", args.businessId).eq("isDefault", true)
          )
          .first();

    // Simple classification
    let attendanceStatus: "present" | "late" | "early_departure" | "absent" = "present";
    let latenessMinutes = 0;
    let earlyDepartureMinutes = 0;
    let hoursDeducted = 0;

    if (schedule) {
      const [startH, startM] = schedule.startTime.split(":").map(Number);
      const [endH, endM] = schedule.endTime.split(":").map(Number);
      const scheduledStartMin = startH * 60 + startM;
      const scheduledEndMin = endH * 60 + endM;

      const checkInDate = new Date(record.checkInTime);
      const actualStartMin = checkInDate.getUTCHours() * 60 + checkInDate.getUTCMinutes();
      const checkOutDate = new Date(now);
      const actualEndMin = checkOutDate.getUTCHours() * 60 + checkOutDate.getUTCMinutes();
      const grace = schedule.graceMinutes;

      if (actualStartMin > scheduledStartMin + grace) {
        latenessMinutes = actualStartMin - scheduledStartMin;
        attendanceStatus = "late";
      }
      if (actualEndMin < scheduledEndMin - grace) {
        earlyDepartureMinutes = scheduledEndMin - actualEndMin;
        if (attendanceStatus === "present") attendanceStatus = "early_departure";
      }
      hoursDeducted = (latenessMinutes + earlyDepartureMinutes) / 60;
    }

    await ctx.db.patch(record._id, {
      checkOutTime: now,
      totalMinutes,
      status: "complete",
      attendanceStatus,
      latenessMinutes,
      earlyDepartureMinutes,
      hoursDeducted,
      updatedAt: now,
    });

    await ctx.db.insert("audit_events", {
      businessId: args.businessId,
      actorUserId: user._id,
      eventType: "attendance.check_out",
      targetEntityType: "attendance_records",
      targetEntityId: record._id as unknown as string,
      details: { date: today, totalMinutes },
    });

    return record._id;
  },
});

export const manualEntry = mutation({
  args: {
    businessId: v.id("businesses"),
    date: v.string(),
    checkInTime: v.number(),
    checkOutTime: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();
    if (!membership || membership.status !== "active") throw new Error("Not a member");
    if (!membership.isAttendanceTracked) throw new Error("Attendance tracking not enabled");

    if (!args.reason.trim()) throw new Error("Reason is required for manual entries");

    const schedule = membership.workScheduleId
      ? await ctx.db.get(membership.workScheduleId)
      : await ctx.db
          .query("work_schedules")
          .withIndex("by_businessId_isDefault", (q) =>
            q.eq("businessId", args.businessId).eq("isDefault", true)
          )
          .first();

    const breakMinutes = schedule?.breakMinutes ?? 60;
    const totalMinutes = Math.max(0, Math.floor((args.checkOutTime - args.checkInTime) / 60000) - breakMinutes);

    // Check for existing record
    const existing = await ctx.db
      .query("attendance_records")
      .withIndex("by_businessId_userId_date", (q) =>
        q.eq("businessId", args.businessId).eq("userId", user._id).eq("date", args.date)
      )
      .first();

    const now = Date.now();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        checkInTime: args.checkInTime,
        checkOutTime: args.checkOutTime,
        totalMinutes,
        status: "flagged",
        source: "manual",
        manualEditReason: args.reason,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new
    const recordId = await ctx.db.insert("attendance_records", {
      businessId: args.businessId,
      userId: user._id,
      date: args.date,
      checkInTime: args.checkInTime,
      checkOutTime: args.checkOutTime,
      totalMinutes,
      breakMinutes,
      status: "flagged",
      attendanceStatus: "present",
      source: "manual",
      manualEditReason: args.reason,
      deductionWaived: false,
    });

    await ctx.db.insert("audit_events", {
      businessId: args.businessId,
      actorUserId: user._id,
      eventType: "attendance.manual_entry",
      targetEntityType: "attendance_records",
      targetEntityId: recordId as unknown as string,
      details: { date: args.date, reason: args.reason },
    });

    return recordId;
  },
});

export const waiveDeduction = mutation({
  args: {
    id: v.id("attendance_records"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", record.businessId)
      )
      .first();
    if (!membership || membership.status !== "active") throw new Error("Not a member");
    if (membership.role !== "owner" && membership.role !== "finance_admin" && membership.role !== "manager") {
      throw new Error("Insufficient permissions");
    }

    await ctx.db.patch(args.id, {
      deductionWaived: true,
      waivedBy: user._id,
      waivedReason: args.reason,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("audit_events", {
      businessId: record.businessId,
      actorUserId: user._id,
      eventType: "attendance.waive_deduction",
      targetEntityType: "attendance_records",
      targetEntityId: args.id as unknown as string,
      details: { reason: args.reason },
    });
  },
});

// ============================================
// INTERNAL (CRON)
// ============================================

export const autoCloseIncompleteSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Find all businesses
    const businesses = await ctx.db.query("businesses").collect();

    for (const business of businesses) {
      // Get incomplete records
      const incompleteRecords = await ctx.db
        .query("attendance_records")
        .withIndex("by_businessId_status", (q) =>
          q.eq("businessId", business._id).eq("status", "incomplete")
        )
        .collect();

      for (const record of incompleteRecords) {
        // Get the employee's work schedule
        const membership = await ctx.db
          .query("business_memberships")
          .withIndex("by_userId_businessId", (q) =>
            q.eq("userId", record.userId).eq("businessId", business._id)
          )
          .first();

        const schedule = membership?.workScheduleId
          ? await ctx.db.get(membership.workScheduleId)
          : await ctx.db
              .query("work_schedules")
              .withIndex("by_businessId_isDefault", (q) =>
                q.eq("businessId", business._id).eq("isDefault", true)
              )
              .first();

        if (!schedule) continue;

        // Parse end time and create checkout timestamp for that day
        const [endH, endM] = schedule.endTime.split(":").map(Number);
        const dateParts = record.date.split("-").map(Number);
        const checkOutTime = Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], endH, endM, 0);

        const totalMinutes = Math.max(0, Math.floor((checkOutTime - record.checkInTime) / 60000) - record.breakMinutes);

        await ctx.db.patch(record._id, {
          checkOutTime,
          totalMinutes,
          status: "auto_closed",
          attendanceStatus: "present",
          source: "system",
          updatedAt: Date.now(),
        });
      }
    }
  },
});

// ============================================
// TRACKING STATUS (SELF-CHECK)
// ============================================

/**
 * Returns whether the current user has attendance tracking enabled.
 * Used by the UI to conditionally show/hide the check-in widget.
 */
export const getMyTrackingStatus = query({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { isTracked: false };
    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return { isTracked: false };
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return { isTracked: false };

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();
    if (!membership || membership.status !== "active") return { isTracked: false };

    return { isTracked: !!membership.isAttendanceTracked };
  },
});

// ============================================
// ATTENDANCE TRACKING ADMIN
// ============================================

/**
 * List active business members with their attendance tracking status.
 * Used by the admin settings UI to toggle tracking per employee.
 */
export const listMembersAttendanceStatus = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];

    // Verify caller is admin/owner
    const callerMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();
    if (!callerMembership || callerMembership.status !== "active") return [];
    if (!["owner", "finance_admin"].includes(callerMembership.role)) return [];

    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const active = memberships.filter((m) => m.status === "active");

    return await Promise.all(
      active.map(async (m) => {
        const memberUser = await ctx.db.get(m.userId);
        return {
          membershipId: m._id,
          userId: m.userId,
          fullName: memberUser?.fullName || memberUser?.email || "Unknown",
          email: memberUser?.email || null,
          role: m.role,
          isAttendanceTracked: m.isAttendanceTracked ?? false,
          workScheduleId: m.workScheduleId ?? null,
        };
      })
    );
  },
});

/**
 * Toggle attendance tracking for a specific employee.
 * Only owner/finance_admin can perform this action.
 */
export const toggleAttendanceTracking = mutation({
  args: {
    membershipId: v.id("business_memberships"),
    isAttendanceTracked: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const targetMembership = await ctx.db.get(args.membershipId);
    if (!targetMembership) throw new Error("Membership not found");

    // Verify caller is admin/owner in the same business
    const callerMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", targetMembership.businessId)
      )
      .first();
    if (!callerMembership || callerMembership.status !== "active") {
      throw new Error("Not authorized");
    }
    if (!["owner", "finance_admin"].includes(callerMembership.role)) {
      throw new Error("Only owners and finance admins can manage attendance tracking");
    }

    await ctx.db.patch(args.membershipId, {
      isAttendanceTracked: args.isAttendanceTracked,
    });

    return { success: true };
  },
});
