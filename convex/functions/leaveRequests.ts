/**
 * Leave Requests Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Leave request CRUD operations
 * - Status transitions with approval workflow
 * - Role-based access control (similar to expense claims)
 * - Auto-routing to assigned manager
 * - Balance updates on approval/cancellation
 */

import { v } from "convex/values";
import { query, mutation, action, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";
import { leaveRequestStatusValidator } from "../lib/validators";

// Role hierarchy for permission checks
const ROLE_HIERARCHY: Record<string, number> = {
  owner: 4,
  finance_admin: 3,
  manager: 2,
  employee: 1,
};

// ============================================
// QUERIES
// ============================================

/**
 * List leave requests with filtering and role-based access
 * - Owners/Admins: See all requests in business
 * - Managers: See their own + requests assigned to them for approval
 * - Employees: See only their own requests
 */
export const list = query({
  args: {
    businessId: v.string(),
    status: v.optional(v.string()),
    userId: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { requests: [], total: 0 };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { requests: [], total: 0 };
    }

    // Resolve businessId
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { requests: [], total: 0 };
    }

    // Get user's membership in this business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { requests: [], total: 0 };
    }

    const limit = args.limit ?? 50;
    const role = membership.role;

    // Get all requests for the business
    let requests = await ctx.db
      .query("leave_requests")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Apply role-based filtering
    if (role === "employee") {
      // Employees only see their own requests
      requests = requests.filter((req) => req.userId === user._id);
    } else if (role === "manager") {
      // Managers see their own + requests where they are the approver
      requests = requests.filter(
        (req) => req.userId === user._id || req.approverId === user._id
      );
    }
    // Owners and finance_admins see all requests

    // Apply status filter
    if (args.status) {
      requests = requests.filter((req) => req.status === args.status);
    }

    // Apply user filter
    if (args.userId) {
      const filterUser = await resolveById(ctx.db, "users", args.userId);
      if (filterUser) {
        requests = requests.filter((req) => req.userId === filterUser._id);
      }
    }

    // Apply date range filter (based on startDate of leave)
    if (args.startDate) {
      requests = requests.filter((req) => req.startDate >= args.startDate!);
    }
    if (args.endDate) {
      requests = requests.filter((req) => req.endDate <= args.endDate!);
    }

    // Sort by creation time (newest first)
    requests.sort((a, b) => b._creationTime - a._creationTime);

    // Apply limit
    const total = requests.length;
    const paginatedRequests = requests.slice(0, limit);

    // Enrich with user and leave type info
    const enrichedRequests = await Promise.all(
      paginatedRequests.map(async (req) => {
        const reqUser = await ctx.db.get(req.userId);
        const leaveType = await ctx.db.get(req.leaveTypeId);
        const approver = req.approverId ? await ctx.db.get(req.approverId) : null;

        return {
          ...req,
          user: reqUser ? { _id: reqUser._id, fullName: reqUser.fullName, email: reqUser.email } : null,
          leaveType: leaveType ? { _id: leaveType._id, name: leaveType.name, code: leaveType.code, color: leaveType.color } : null,
          approver: approver ? { _id: approver._id, fullName: approver.fullName, email: approver.email } : null,
        };
      })
    );

    return { requests: enrichedRequests, total };
  },
});

/**
 * Get a single leave request by ID
 */
export const getById = query({
  args: {
    id: v.id("leave_requests"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return null;

    const request = await ctx.db.get(args.id);
    if (!request) return null;

    // Check access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", request.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return null;

    const role = membership.role;

    // Check if user can view this request
    const canView =
      role === "owner" ||
      role === "finance_admin" ||
      request.userId === user._id ||
      request.approverId === user._id;

    if (!canView) return null;

    // Enrich with related data
    const reqUser = await ctx.db.get(request.userId);
    const leaveType = await ctx.db.get(request.leaveTypeId);
    const approver = request.approverId ? await ctx.db.get(request.approverId) : null;

    return {
      ...request,
      user: reqUser ? { _id: reqUser._id, fullName: reqUser.fullName, email: reqUser.email } : null,
      leaveType: leaveType ? { _id: leaveType._id, name: leaveType.name, code: leaveType.code, color: leaveType.color, deductsBalance: leaveType.deductsBalance } : null,
      approver: approver ? { _id: approver._id, fullName: approver.fullName, email: approver.email } : null,
    };
  },
});

/**
 * Get pending requests for a manager (requests where they are the approver)
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

    // Verify user has approval permissions
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    const role = membership.role;
    if (role === "employee") return []; // Employees can't approve

    // Get pending requests
    let requests = await ctx.db
      .query("leave_requests")
      .withIndex("by_approverId_status", (q) =>
        q.eq("approverId", user._id).eq("status", "submitted")
      )
      .collect();

    // For owners/admins, also include unassigned submitted requests
    if (role === "owner" || role === "finance_admin") {
      const allSubmitted = await ctx.db
        .query("leave_requests")
        .withIndex("by_businessId_status", (q) =>
          q.eq("businessId", business._id).eq("status", "submitted")
        )
        .collect();

      // Merge and dedupe
      const requestIds = new Set(requests.map((r) => r._id));
      for (const req of allSubmitted) {
        if (!requestIds.has(req._id)) {
          requests.push(req);
        }
      }
    }

    // Enrich with user and leave type info
    const enrichedRequests = await Promise.all(
      requests.map(async (req) => {
        const reqUser = await ctx.db.get(req.userId);
        const leaveType = await ctx.db.get(req.leaveTypeId);

        return {
          ...req,
          user: reqUser ? { _id: reqUser._id, fullName: reqUser.fullName, email: reqUser.email } : null,
          leaveType: leaveType ? { _id: leaveType._id, name: leaveType.name, code: leaveType.code, color: leaveType.color } : null,
        };
      })
    );

    // Sort by submission date (oldest first for FIFO processing)
    enrichedRequests.sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));

    return enrichedRequests;
  },
});

/**
 * Get user's own leave requests
 */
export const getMyRequests = query({
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

    // Get user's requests
    const requests = await ctx.db
      .query("leave_requests")
      .withIndex("by_businessId_userId", (q) =>
        q.eq("businessId", business._id).eq("userId", user._id)
      )
      .collect();

    // Filter by year if specified
    let filteredRequests = requests;
    if (args.year) {
      const yearStart = `${args.year}-01-01`;
      const yearEnd = `${args.year}-12-31`;
      filteredRequests = requests.filter(
        (req) => req.startDate >= yearStart && req.startDate <= yearEnd
      );
    }

    // Enrich with leave type info
    const enrichedRequests = await Promise.all(
      filteredRequests.map(async (req) => {
        const leaveType = await ctx.db.get(req.leaveTypeId);
        const approver = req.approverId ? await ctx.db.get(req.approverId) : null;

        return {
          ...req,
          leaveType: leaveType ? { _id: leaveType._id, name: leaveType.name, code: leaveType.code, color: leaveType.color } : null,
          approver: approver ? { _id: approver._id, fullName: approver.fullName } : null,
        };
      })
    );

    // Sort by start date (most recent first)
    enrichedRequests.sort((a, b) => b.startDate.localeCompare(a.startDate));

    return enrichedRequests;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new leave request (draft status)
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    leaveTypeId: v.id("leave_types"),
    startDate: v.string(),
    endDate: v.string(),
    totalDays: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    // Verify user is a member of the business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Validate leave type exists and is active
    const leaveType = await ctx.db.get(args.leaveTypeId);
    if (!leaveType || !leaveType.isActive) {
      throw new Error("Invalid or inactive leave type");
    }
    if (leaveType.businessId !== args.businessId) {
      throw new Error("Leave type does not belong to this business");
    }

    // Check for overlapping requests
    const existingRequests = await ctx.db
      .query("leave_requests")
      .withIndex("by_businessId_userId", (q) =>
        q.eq("businessId", args.businessId).eq("userId", user._id)
      )
      .collect();

    const overlapping = existingRequests.filter((req) => {
      if (req.status === "cancelled" || req.status === "rejected") return false;
      // Check date overlap
      return !(req.endDate < args.startDate || req.startDate > args.endDate);
    });

    if (overlapping.length > 0) {
      throw new Error("Leave request overlaps with existing request(s)");
    }

    // Get approver from user's manager assignment
    const approverId = membership.managerId ?? undefined;

    // Create the request
    const requestId = await ctx.db.insert("leave_requests", {
      businessId: args.businessId,
      userId: user._id,
      leaveTypeId: args.leaveTypeId,
      startDate: args.startDate,
      endDate: args.endDate,
      totalDays: args.totalDays,
      status: "draft",
      notes: args.notes,
      approverId: approverId,
      updatedAt: Date.now(),
    });

    return requestId;
  },
});

/**
 * Update a leave request (only draft status)
 */
export const update = mutation({
  args: {
    id: v.id("leave_requests"),
    leaveTypeId: v.optional(v.id("leave_types")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    totalDays: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Leave request not found");

    // Verify ownership
    if (request.userId !== user._id) {
      throw new Error("Not authorized to update this request");
    }

    // Can only update draft requests
    if (request.status !== "draft") {
      throw new Error("Can only update draft requests");
    }

    // Validate leave type if changing
    if (args.leaveTypeId) {
      const leaveType = await ctx.db.get(args.leaveTypeId);
      if (!leaveType || !leaveType.isActive) {
        throw new Error("Invalid or inactive leave type");
      }
    }

    // Check for overlapping requests if dates are changing
    if (args.startDate || args.endDate) {
      const newStartDate = args.startDate ?? request.startDate;
      const newEndDate = args.endDate ?? request.endDate;

      const existingRequests = await ctx.db
        .query("leave_requests")
        .withIndex("by_businessId_userId", (q) =>
          q.eq("businessId", request.businessId).eq("userId", user._id)
        )
        .collect();

      const overlapping = existingRequests.filter((req) => {
        if (req._id === args.id) return false; // Exclude current request
        if (req.status === "cancelled" || req.status === "rejected") return false;
        return !(req.endDate < newStartDate || req.startDate > newEndDate);
      });

      if (overlapping.length > 0) {
        throw new Error("Updated dates overlap with existing request(s)");
      }
    }

    // Update the request
    await ctx.db.patch(args.id, {
      ...(args.leaveTypeId && { leaveTypeId: args.leaveTypeId }),
      ...(args.startDate && { startDate: args.startDate }),
      ...(args.endDate && { endDate: args.endDate }),
      ...(args.totalDays !== undefined && { totalDays: args.totalDays }),
      ...(args.notes !== undefined && { notes: args.notes }),
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Submit a leave request for approval (draft → submitted)
 */
export const submit = mutation({
  args: {
    id: v.id("leave_requests"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Leave request not found");

    // Verify ownership
    if (request.userId !== user._id) {
      throw new Error("Not authorized to submit this request");
    }

    // Can only submit draft requests
    if (request.status !== "draft") {
      throw new Error("Can only submit draft requests");
    }

    // Validate totalDays > 0
    if (request.totalDays <= 0) {
      throw new Error("Request must have at least 1 business day");
    }

    // Check balance if the leave type deducts balance
    const leaveType = await ctx.db.get(request.leaveTypeId);
    if (leaveType?.deductsBalance) {
      const currentYear = new Date().getFullYear();
      const balance = await ctx.db
        .query("leave_balances")
        .withIndex("by_businessId_userId_leaveTypeId_year", (q) =>
          q
            .eq("businessId", request.businessId)
            .eq("userId", user._id)
            .eq("leaveTypeId", request.leaveTypeId)
            .eq("year", currentYear)
        )
        .first();

      if (balance) {
        const remaining = balance.entitled - balance.used + balance.adjustments + (balance.carryover ?? 0);
        if (request.totalDays > remaining) {
          throw new Error(`Insufficient balance. Available: ${remaining} days, Requested: ${request.totalDays} days`);
        }
      }
    }

    // Update to submitted
    await ctx.db.patch(args.id, {
      status: "submitted",
      submittedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * 034-leave-enhance: Internal query for overlap detection data.
 * Used by the checkOverlapsForApproval action (not exposed as reactive query).
 */
export const _getOverlapData = internalQuery({
  args: {
    businessId: v.string(),
    leaveRequestId: v.id("leave_requests"),
    clerkSubject: v.string(),
  },
  handler: async (ctx, args) => {
    const emptyResult = { hasOverlaps: false, overlappingMembers: [] as any[], totalOverlapDays: 0 };

    const user = await resolveUserByClerkId(ctx.db, args.clerkSubject);
    if (!user) return emptyResult;

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return emptyResult;

    const targetRequest = await ctx.db.get(args.leaveRequestId);
    if (!targetRequest) return emptyResult;

    const targetStart = targetRequest.startDate;
    const targetEnd = targetRequest.endDate;

    // Find direct reports of the approver
    const allMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const activeMemberships = allMemberships.filter((m) => m.status === "active");

    const teamMemberIds = new Set<string>();
    for (const m of activeMemberships) {
      if (m.managerId && m.managerId.toString() === user._id.toString()) {
        teamMemberIds.add(m.userId.toString());
      }
    }

    // Exclude requesting employee and approver
    teamMemberIds.delete(targetRequest.userId.toString());
    teamMemberIds.delete(user._id.toString());

    if (teamMemberIds.size === 0) return emptyResult;

    // Query approved + submitted leave requests
    const approvedRequests = await ctx.db
      .query("leave_requests")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", business._id).eq("status", "approved")
      )
      .collect();

    const submittedRequests = await ctx.db
      .query("leave_requests")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", business._id).eq("status", "submitted")
      )
      .collect();

    const allRelevantRequests = [...approvedRequests, ...submittedRequests].filter(
      (r) =>
        teamMemberIds.has(r.userId.toString()) &&
        r._id.toString() !== args.leaveRequestId.toString() &&
        r.startDate <= targetEnd &&
        r.endDate >= targetStart
    );

    if (allRelevantRequests.length === 0) return emptyResult;

    const overlappingMembers: Array<{
      userId: string;
      userName: string;
      leaveTypeName: string;
      leaveStatus: string;
      overlapDates: string[];
    }> = [];

    const allOverlapDates = new Set<string>();

    for (const req of allRelevantRequests) {
      const overlapStart = req.startDate > targetStart ? req.startDate : targetStart;
      const overlapEnd = req.endDate < targetEnd ? req.endDate : targetEnd;

      const dates: string[] = [];
      const current = new Date(overlapStart);
      const end = new Date(overlapEnd);
      while (current <= end) {
        const dateStr = current.toISOString().split("T")[0];
        dates.push(dateStr);
        allOverlapDates.add(dateStr);
        current.setDate(current.getDate() + 1);
      }

      const reqUser = await ctx.db.get(req.userId);
      const leaveType = await ctx.db.get(req.leaveTypeId);

      overlappingMembers.push({
        userId: req.userId.toString(),
        userName: reqUser?.fullName || reqUser?.email || "Unknown",
        leaveTypeName: leaveType?.name || "Unknown",
        leaveStatus: req.status,
        overlapDates: dates,
      });
    }

    return {
      hasOverlaps: true,
      overlappingMembers,
      totalOverlapDays: allOverlapDates.size,
    };
  },
});

/**
 * 034-leave-enhance: Check for overlapping team leave before approval.
 * Action (not reactive query) to avoid bandwidth waste from subscriptions.
 */
export const checkOverlapsForApproval = action({
  args: {
    businessId: v.string(),
    leaveRequestId: v.id("leave_requests"),
  },
  handler: async (ctx, args): Promise<{ hasOverlaps: boolean; overlappingMembers: any[]; totalOverlapDays: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { hasOverlaps: false, overlappingMembers: [], totalOverlapDays: 0 };

    return await ctx.runQuery(internal.functions.leaveRequests._getOverlapData, {
      businessId: args.businessId,
      leaveRequestId: args.leaveRequestId,
      clerkSubject: identity.subject,
    });
  },
});

/**
 * Approve a leave request (submitted → approved)
 * Also updates the user's leave balance
 */
export const approve = mutation({
  args: {
    id: v.id("leave_requests"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Leave request not found");

    // Can only approve submitted requests
    if (request.status !== "submitted") {
      throw new Error("Can only approve submitted requests");
    }

    // Verify approver has permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", request.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    const role = membership.role;
    const isAssignedApprover = request.approverId === user._id;
    const canApprove = isAssignedApprover || role === "owner" || role === "finance_admin";

    if (!canApprove) {
      throw new Error("Not authorized to approve this request");
    }

    // Update request status
    await ctx.db.patch(args.id, {
      status: "approved",
      approvedAt: Date.now(),
      approverNotes: args.notes,
      updatedAt: Date.now(),
    });

    // Update leave balance
    const leaveType = await ctx.db.get(request.leaveTypeId);
    if (leaveType?.deductsBalance) {
      const currentYear = parseInt(request.startDate.substring(0, 4));
      const balance = await ctx.db
        .query("leave_balances")
        .withIndex("by_businessId_userId_leaveTypeId_year", (q) =>
          q
            .eq("businessId", request.businessId)
            .eq("userId", request.userId)
            .eq("leaveTypeId", request.leaveTypeId)
            .eq("year", currentYear)
        )
        .first();

      if (balance) {
        await ctx.db.patch(balance._id, {
          used: balance.used + request.totalDays,
          lastUpdated: Date.now(),
        });
      } else {
        // Create balance record if it doesn't exist (shouldn't happen normally)
        await ctx.db.insert("leave_balances", {
          businessId: request.businessId,
          userId: request.userId,
          leaveTypeId: request.leaveTypeId,
          year: currentYear,
          entitled: leaveType.defaultDays,
          used: request.totalDays,
          adjustments: 0,
          lastUpdated: Date.now(),
        });
      }
    }

    return args.id;
  },
});

/**
 * Reject a leave request (submitted → rejected)
 */
export const reject = mutation({
  args: {
    id: v.id("leave_requests"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Leave request not found");

    // Can only reject submitted requests
    if (request.status !== "submitted") {
      throw new Error("Can only reject submitted requests");
    }

    // Verify approver has permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", request.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    const role = membership.role;
    const isAssignedApprover = request.approverId === user._id;
    const canReject = isAssignedApprover || role === "owner" || role === "finance_admin";

    if (!canReject) {
      throw new Error("Not authorized to reject this request");
    }

    // Reason is required
    if (!args.reason || args.reason.trim().length === 0) {
      throw new Error("Rejection reason is required");
    }

    // Update request status
    await ctx.db.patch(args.id, {
      status: "rejected",
      approvedAt: Date.now(), // We use approvedAt for both approval and rejection timestamps
      approverNotes: args.reason,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Cancel a leave request (submitted/approved → cancelled)
 * Restores balance if previously approved
 */
export const cancel = mutation({
  args: {
    id: v.id("leave_requests"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Leave request not found");

    // Verify ownership
    if (request.userId !== user._id) {
      throw new Error("Not authorized to cancel this request");
    }

    // Check if can be cancelled
    const canCancel =
      request.status === "draft" ||
      request.status === "submitted" ||
      request.status === "approved";

    if (!canCancel) {
      throw new Error(`Cannot cancel a ${request.status} request`);
    }

    // For approved requests, check if start date is in the future
    if (request.status === "approved") {
      const today = new Date().toISOString().split("T")[0];
      if (request.startDate <= today) {
        throw new Error("Cannot cancel approved leave that has already started");
      }
    }

    const previousStatus = request.status;

    // Update request status
    await ctx.db.patch(args.id, {
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelReason: args.reason,
      updatedAt: Date.now(),
    });

    // Restore balance if was approved and leave type deducts balance
    if (previousStatus === "approved") {
      const leaveType = await ctx.db.get(request.leaveTypeId);
      if (leaveType?.deductsBalance) {
        const year = parseInt(request.startDate.substring(0, 4));
        const balance = await ctx.db
          .query("leave_balances")
          .withIndex("by_businessId_userId_leaveTypeId_year", (q) =>
            q
              .eq("businessId", request.businessId)
              .eq("userId", request.userId)
              .eq("leaveTypeId", request.leaveTypeId)
              .eq("year", year)
          )
          .first();

        if (balance) {
          await ctx.db.patch(balance._id, {
            used: Math.max(0, balance.used - request.totalDays),
            lastUpdated: Date.now(),
          });
        }
      }
    }

    return args.id;
  },
});
