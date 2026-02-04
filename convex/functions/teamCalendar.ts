/**
 * Team Calendar Functions - Convex queries
 *
 * These functions handle:
 * - Calendar event queries (leave events + holidays)
 * - Team availability view for managers
 * - Conflict detection
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// ============================================
// QUERIES
// ============================================

/**
 * Get calendar events for a date range
 * Returns leave events and holidays for the team
 */
export const getEvents = query({
  args: {
    businessId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { leaveEvents: [], holidays: [], conflicts: [] };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { leaveEvents: [], holidays: [], conflicts: [] };
    }

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { leaveEvents: [], holidays: [], conflicts: [] };
    }

    // Verify user is a member
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { leaveEvents: [], holidays: [], conflicts: [] };
    }

    const role = membership.role;

    // Determine which users to include based on role
    let teamUserIds: Set<string> = new Set();

    if (role === "owner" || role === "finance_admin") {
      // See all active members
      const allMembers = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();

      allMembers
        .filter((m) => m.status === "active")
        .forEach((m) => teamUserIds.add(m.userId.toString()));
    } else if (role === "manager") {
      // See direct reports + self
      const allMembers = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();

      allMembers
        .filter((m) => m.status === "active" && m.managerId === user._id)
        .forEach((m) => teamUserIds.add(m.userId.toString()));

      teamUserIds.add(user._id.toString());
    } else {
      // Employees see their team (all active members in business)
      // This allows viewing team calendar for coordination
      const allMembers = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();

      allMembers
        .filter((m) => m.status === "active")
        .forEach((m) => teamUserIds.add(m.userId.toString()));
    }

    // Get leave requests for the date range
    const allRequests = await ctx.db
      .query("leave_requests")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter by date range and team membership
    // Only show approved and submitted requests (not drafts)
    const relevantRequests = allRequests.filter((req) => {
      const isInDateRange =
        req.startDate <= args.endDate && req.endDate >= args.startDate;
      const isTeamMember = teamUserIds.has(req.userId.toString());
      const isVisible =
        req.status === "approved" || req.status === "submitted";
      return isInDateRange && isTeamMember && isVisible;
    });

    // Build leave events with user and leave type info
    const leaveEvents = await Promise.all(
      relevantRequests.map(async (req) => {
        const reqUser = await ctx.db.get(req.userId);
        const leaveType = await ctx.db.get(req.leaveTypeId);

        return {
          requestId: req._id,
          userId: req.userId,
          userName: reqUser?.fullName ?? reqUser?.email ?? "Unknown",
          leaveType: leaveType?.name ?? "Unknown",
          leaveTypeColor: leaveType?.color,
          startDate: req.startDate,
          endDate: req.endDate,
          status: req.status,
        };
      })
    );

    // Get holidays for the date range
    const countryCode = business.countryCode ?? "MY";
    const startYear = parseInt(args.startDate.substring(0, 4));
    const endYear = parseInt(args.endDate.substring(0, 4));

    const allHolidays: any[] = [];

    // Get system holidays for each year in range
    for (let year = startYear; year <= endYear; year++) {
      const systemHolidays = await ctx.db
        .query("public_holidays")
        .withIndex("by_countryCode_year", (q) =>
          q.eq("countryCode", countryCode).eq("year", year)
        )
        .collect();

      allHolidays.push(...systemHolidays.filter((h) => !h.isCustom));
    }

    // Get custom holidays for the business
    const customHolidays = await ctx.db
      .query("public_holidays")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter custom holidays to date range
    const relevantCustomHolidays = customHolidays.filter(
      (h) => h.date >= args.startDate && h.date <= args.endDate
    );

    allHolidays.push(...relevantCustomHolidays);

    // Filter all holidays to date range
    const holidaysInRange = allHolidays.filter(
      (h) => h.date >= args.startDate && h.date <= args.endDate
    );

    // Detect conflicts (dates with multiple people on leave)
    const dateAbsenceCount = new Map<string, number>();

    for (const event of leaveEvents) {
      if (event.status !== "approved") continue; // Only count approved

      // Count each day in the leave range
      const start = new Date(event.startDate);
      const end = new Date(event.endDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        dateAbsenceCount.set(dateStr, (dateAbsenceCount.get(dateStr) ?? 0) + 1);
      }
    }

    // Dates with more than 1 person absent are conflicts
    const conflicts = Array.from(dateAbsenceCount.entries())
      .filter(([, count]) => count > 1)
      .map(([date]) => date)
      .sort();

    return {
      leaveEvents,
      holidays: holidaysInRange,
      conflicts,
    };
  },
});

/**
 * Get upcoming team absences (next 30 days)
 */
export const getUpcomingAbsences = query({
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

    // Verify user is a member
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    // Calculate date range (today to 30 days from now)
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const thirtyDaysLater = new Date(
      today.getTime() + 30 * 24 * 60 * 60 * 1000
    );
    const endStr = thirtyDaysLater.toISOString().split("T")[0];

    // Get approved leave requests in the next 30 days
    const allRequests = await ctx.db
      .query("leave_requests")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", business._id).eq("status", "approved")
      )
      .collect();

    // Filter by date range
    const upcomingRequests = allRequests.filter(
      (req) => req.startDate <= endStr && req.endDate >= todayStr
    );

    // Enrich with user info
    const enrichedRequests = await Promise.all(
      upcomingRequests.map(async (req) => {
        const reqUser = await ctx.db.get(req.userId);
        const leaveType = await ctx.db.get(req.leaveTypeId);

        return {
          requestId: req._id,
          userId: req.userId,
          userName: reqUser?.fullName ?? reqUser?.email ?? "Unknown",
          leaveType: leaveType?.name ?? "Unknown",
          leaveTypeColor: leaveType?.color,
          startDate: req.startDate,
          endDate: req.endDate,
          totalDays: req.totalDays,
        };
      })
    );

    // Sort by start date
    enrichedRequests.sort((a, b) => a.startDate.localeCompare(b.startDate));

    return enrichedRequests;
  },
});
