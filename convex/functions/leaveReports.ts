/**
 * 034-leave-enhance: Leave Reports
 *
 * Aggregation actions for leave reporting.
 * Uses action + internalQuery pattern to avoid reactive subscriptions (bandwidth budget).
 */

import { v } from "convex/values";
import { action, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// ============================================
// INTERNAL QUERIES (used by actions below)
// ============================================

export const _getBalanceSummaryData = internalQuery({
  args: {
    businessId: v.id("businesses"),
    year: v.number(),
    filterManagerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get balances for this business — filter by year using userId_year index
    // Note: No composite businessId+year index exists, so we use businessId index
    // and filter by year in JS. At scale (200 employees x 5 types = 1000 records/year),
    // this is acceptable per the "up to 200 employees" constraint.
    const allBalances = await ctx.db
      .query("leave_balances")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const yearBalances = allBalances.filter((b) => b.year === args.year);

    // Get memberships for team filtering
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const activeMembers = memberships.filter((m) => m.status === "active");

    // If manager filter, only include their direct reports
    let visibleUserIds: Set<string>;
    if (args.filterManagerId) {
      visibleUserIds = new Set(
        activeMembers
          .filter((m) => m.managerId?.toString() === args.filterManagerId)
          .map((m) => m.userId.toString())
      );
    } else {
      visibleUserIds = new Set(activeMembers.map((m) => m.userId.toString()));
    }

    const filteredBalances = yearBalances.filter((b) =>
      visibleUserIds.has(b.userId.toString())
    );

    // Enrich with user names and leave type info
    const employees = new Map<string, { userId: string; userName: string; teamName: string; balances: any[] }>();

    for (const bal of filteredBalances) {
      const userId = bal.userId.toString();
      if (!employees.has(userId)) {
        const user = await ctx.db.get(bal.userId);
        const membership = activeMembers.find((m) => m.userId.toString() === userId);
        let teamName = "Unassigned";
        if (membership?.managerId) {
          const manager = await ctx.db.get(membership.managerId);
          teamName = manager?.fullName || manager?.email || "Team";
        }
        employees.set(userId, {
          userId,
          userName: user?.fullName || user?.email || "Unknown",
          teamName,
          balances: [],
        });
      }

      const leaveType = await ctx.db.get(bal.leaveTypeId);
      const remaining = bal.entitled - bal.used + bal.adjustments + (bal.carryover ?? 0);

      employees.get(userId)!.balances.push({
        leaveTypeName: leaveType?.name || "Unknown",
        leaveTypeColor: leaveType?.color || "#888",
        entitled: bal.entitled,
        used: bal.used,
        adjustments: bal.adjustments,
        carryover: bal.carryover ?? 0,
        remaining,
      });
    }

    return Array.from(employees.values());
  },
});

export const _getAbsenceTrendsData = internalQuery({
  args: {
    businessId: v.id("businesses"),
    yearStart: v.string(),
    yearEnd: v.string(),
    filterManagerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get approved leave requests in the date range
    const approvedRequests = await ctx.db
      .query("leave_requests")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", args.businessId).eq("status", "approved")
      )
      .collect();

    // Filter by date range
    const inRange = approvedRequests.filter(
      (r) => r.startDate <= args.yearEnd && r.endDate >= args.yearStart
    );

    // If manager filter, get their direct reports
    let visibleUserIds: Set<string> | null = null;
    if (args.filterManagerId) {
      const memberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
        .collect();
      visibleUserIds = new Set(
        memberships
          .filter((m) => m.status === "active" && m.managerId?.toString() === args.filterManagerId)
          .map((m) => m.userId.toString())
      );
    }

    const filtered = visibleUserIds
      ? inRange.filter((r) => visibleUserIds!.has(r.userId.toString()))
      : inRange;

    // Aggregate by month
    const monthMap = new Map<string, { total: number; byType: Map<string, { name: string; color: string; days: number }> }>();

    for (const req of filtered) {
      const leaveType = await ctx.db.get(req.leaveTypeId);
      const ltName = leaveType?.name || "Unknown";
      const ltColor = leaveType?.color || "#888";

      // Walk through each day of the leave
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      const current = new Date(start);

      while (current <= end) {
        const dateStr = current.toISOString().split("T")[0];
        // Only count if within year range
        if (dateStr >= args.yearStart && dateStr <= args.yearEnd) {
          const day = current.getDay();
          // Skip weekends
          if (day !== 0 && day !== 6) {
            const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;

            if (!monthMap.has(monthKey)) {
              monthMap.set(monthKey, { total: 0, byType: new Map() });
            }
            const entry = monthMap.get(monthKey)!;
            entry.total++;

            if (!entry.byType.has(ltName)) {
              entry.byType.set(ltName, { name: ltName, color: ltColor, days: 0 });
            }
            entry.byType.get(ltName)!.days++;
          }
        }
        current.setDate(current.getDate() + 1);
      }
    }

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Convert to sorted array
    const months = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => {
        const [, monthStr] = key.split("-");
        const monthNum = parseInt(monthStr);
        return {
          month: monthNames[monthNum - 1],
          monthNumber: monthNum,
          totalAbsenceDays: val.total,
          byLeaveType: Array.from(val.byType.values()),
        };
      });

    const peakMonth = months.reduce((max, m) => (m.totalAbsenceDays > max.totalAbsenceDays ? m : max), months[0] || { month: "N/A", totalAbsenceDays: 0 });
    const totalAbsenceDays = months.reduce((sum, m) => sum + m.totalAbsenceDays, 0);

    return { months, peakMonth: peakMonth?.month || "N/A", totalAbsenceDays };
  },
});

// ============================================
// PUBLIC ACTIONS
// ============================================

export const balanceSummary = action({
  args: {
    businessId: v.string(),
    year: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { year: 0, yearLabel: "", employees: [] };

    const business = await ctx.runQuery(internal.functions.leaveBalances.resolveBusinessForImport, {
      businessId: args.businessId,
    });
    if (!business) return { year: 0, yearLabel: "", employees: [] };

    // Determine role and filter
    const user = await ctx.runQuery(internal.functions.leaveReports._resolveCallerRole, {
      clerkSubject: identity.subject,
      businessId: business._id,
    });
    if (!user) return { year: 0, yearLabel: "", employees: [] };

    const startMonth = (business as any).leaveYearStartMonth ?? 1;
    const now = new Date();
    let defaultYear: number;
    if (startMonth === 1) {
      defaultYear = now.getFullYear();
    } else {
      defaultYear = now.getMonth() + 1 >= startMonth ? now.getFullYear() : now.getFullYear() - 1;
    }
    const year = args.year ?? defaultYear;

    const yearLabel = startMonth === 1
      ? String(year)
      : `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][startMonth - 1]} ${year} - ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][(startMonth - 2 + 12) % 12]} ${year + 1}`;

    const employees = await ctx.runQuery(internal.functions.leaveReports._getBalanceSummaryData, {
      businessId: business._id,
      year,
      filterManagerId: user.role === "manager" ? user.userId : undefined,
    });

    return { year, yearLabel, employees };
  },
});

export const utilization = action({
  args: {
    businessId: v.string(),
    year: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { year: 0, yearLabel: "", teams: [], businessOverallRate: 0 };

    const business = await ctx.runQuery(internal.functions.leaveBalances.resolveBusinessForImport, {
      businessId: args.businessId,
    });
    if (!business) return { year: 0, yearLabel: "", teams: [], businessOverallRate: 0 };

    const user = await ctx.runQuery(internal.functions.leaveReports._resolveCallerRole, {
      clerkSubject: identity.subject,
      businessId: business._id,
    });
    if (!user) return { year: 0, yearLabel: "", teams: [], businessOverallRate: 0 };

    const startMonth = (business as any).leaveYearStartMonth ?? 1;
    const now = new Date();
    let defaultYear: number;
    if (startMonth === 1) {
      defaultYear = now.getFullYear();
    } else {
      defaultYear = now.getMonth() + 1 >= startMonth ? now.getFullYear() : now.getFullYear() - 1;
    }
    const year = args.year ?? defaultYear;

    const yearLabel = startMonth === 1
      ? String(year)
      : `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][startMonth - 1]} ${year} - ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][(startMonth - 2 + 12) % 12]} ${year + 1}`;

    // Call internalQuery directly (not another action)
    const employees = await ctx.runQuery(internal.functions.leaveReports._getBalanceSummaryData, {
      businessId: business._id,
      year,
      filterManagerId: user.role === "manager" ? user.userId : undefined,
    });

    // Aggregate by team
    const teamMap = new Map<string, {
      teamName: string;
      members: Set<string>;
      totalEntitled: number;
      totalUsed: number;
    }>();

    for (const emp of employees) {
      const teamKey = emp.teamName || "Unassigned";
      if (!teamMap.has(teamKey)) {
        teamMap.set(teamKey, { teamName: teamKey, members: new Set(), totalEntitled: 0, totalUsed: 0 });
      }
      const team = teamMap.get(teamKey)!;
      team.members.add(emp.userId);
      for (const bal of emp.balances) {
        team.totalEntitled += bal.entitled;
        team.totalUsed += bal.used;
      }
    }

    const teams = Array.from(teamMap.values()).map((t) => ({
      teamName: t.teamName,
      memberCount: t.members.size,
      totalEntitled: t.totalEntitled,
      totalUsed: t.totalUsed,
      utilizationRate: t.totalEntitled > 0 ? Math.round((t.totalUsed / t.totalEntitled) * 100) : 0,
    }));

    const totalEntitled = teams.reduce((sum, t) => sum + t.totalEntitled, 0);
    const totalUsed = teams.reduce((sum, t) => sum + t.totalUsed, 0);
    const businessOverallRate = totalEntitled > 0 ? Math.round((totalUsed / totalEntitled) * 100) : 0;

    return { year, yearLabel, teams, businessOverallRate };
  },
});

export const absenceTrends = action({
  args: {
    businessId: v.string(),
    year: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { year: 0, yearLabel: "", months: [], peakMonth: "N/A", totalAbsenceDays: 0 };

    const business = await ctx.runQuery(internal.functions.leaveBalances.resolveBusinessForImport, {
      businessId: args.businessId,
    });
    if (!business) return { year: 0, yearLabel: "", months: [], peakMonth: "N/A", totalAbsenceDays: 0 };

    const user = await ctx.runQuery(internal.functions.leaveReports._resolveCallerRole, {
      clerkSubject: identity.subject,
      businessId: business._id,
    });
    if (!user) return { year: 0, yearLabel: "", months: [], peakMonth: "N/A", totalAbsenceDays: 0 };

    const startMonth = (business as any).leaveYearStartMonth ?? 1;
    const now = new Date();
    let defaultYear: number;
    if (startMonth === 1) {
      defaultYear = now.getFullYear();
    } else {
      defaultYear = now.getMonth() + 1 >= startMonth ? now.getFullYear() : now.getFullYear() - 1;
    }
    const year = args.year ?? defaultYear;

    // Compute date range for the leave year
    const yearStartDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const endMonth = startMonth === 1 ? 12 : startMonth - 1;
    const endYear = startMonth === 1 ? year : year + 1;
    const lastDay = new Date(endYear, endMonth, 0).getDate();
    const yearEndDate = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const yearLabel = startMonth === 1
      ? String(year)
      : `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][startMonth - 1]} ${year} - ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][(startMonth - 2 + 12) % 12]} ${year + 1}`;

    const result = await ctx.runQuery(internal.functions.leaveReports._getAbsenceTrendsData, {
      businessId: business._id,
      yearStart: yearStartDate,
      yearEnd: yearEndDate,
      filterManagerId: user.role === "manager" ? user.userId : undefined,
    });

    return { year, yearLabel, ...result };
  },
});

// Internal helper: resolve caller and their role
export const _resolveCallerRole = internalQuery({
  args: {
    clerkSubject: v.string(),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const user = await resolveUserByClerkId(ctx.db, args.clerkSubject);
    if (!user) return null;

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return null;

    // Only admin/owner/manager can view reports
    if (!["owner", "finance_admin", "manager"].includes(membership.role)) return null;

    return {
      userId: user._id.toString(),
      role: membership.role,
    };
  },
});
