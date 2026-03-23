/**
 * Leave Balances Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Balance queries (user's own, team balances for managers)
 * - Balance updates (on approval/cancellation)
 * - Balance initialization for new employees
 * - Admin adjustments
 */

import { v } from "convex/values";
import { query, mutation, action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// ============================================
// QUERIES
// ============================================

/**
 * Get current user's leave balances for a year
 */
export const getMyBalances = query({
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

    // 034-leave-enhance: Use configured leave year start month for default year
    const startMonth = (business as any).leaveYearStartMonth ?? 1;
    let defaultYear: number;
    if (startMonth === 1) {
      defaultYear = new Date().getFullYear();
    } else {
      const now = new Date();
      defaultYear = now.getMonth() + 1 >= startMonth ? now.getFullYear() : now.getFullYear() - 1;
    }
    const year = args.year ?? defaultYear;

    // Get all balances for the user
    const balances = await ctx.db
      .query("leave_balances")
      .withIndex("by_userId_year", (q) =>
        q.eq("userId", user._id).eq("year", year)
      )
      .collect();

    // Filter by business
    const businessBalances = balances.filter(
      (b) => b.businessId === business._id
    );

    // Enrich with leave type info and compute remaining
    const enrichedBalances = await Promise.all(
      businessBalances.map(async (balance) => {
        const leaveType = await ctx.db.get(balance.leaveTypeId);
        const remaining =
          balance.entitled -
          balance.used +
          balance.adjustments +
          (balance.carryover ?? 0);

        return {
          ...balance,
          remaining,
          leaveType: leaveType
            ? {
                _id: leaveType._id,
                name: leaveType.name,
                code: leaveType.code,
                color: leaveType.color,
                deductsBalance: leaveType.deductsBalance,
              }
            : null,
        };
      })
    );

    // Sort by leave type sort order
    enrichedBalances.sort((a, b) => {
      if (!a.leaveType || !b.leaveType) return 0;
      return (a.leaveType as any).sortOrder - (b.leaveType as any).sortOrder;
    });

    return enrichedBalances;
  },
});

/**
 * Get balances for a specific user (admin/manager query)
 */
export const getByUser = query({
  args: {
    businessId: v.string(),
    userId: v.string(),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!currentUser) return [];

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return [];

    // Verify current user has permission to view
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", currentUser._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    // Only managers, finance_admin, and owners can view other users' balances
    const canView =
      membership.role === "owner" ||
      membership.role === "finance_admin" ||
      membership.role === "manager";

    if (!canView) return [];

    // Resolve target user
    const targetUser = await resolveById(ctx.db, "users", args.userId);
    if (!targetUser) return [];

    // Get balances for target user
    const balances = await ctx.db
      .query("leave_balances")
      .withIndex("by_userId_year", (q) =>
        q.eq("userId", targetUser._id).eq("year", args.year)
      )
      .collect();

    // Filter by business
    const businessBalances = balances.filter(
      (b) => b.businessId === business._id
    );

    // Enrich with leave type info and compute remaining
    const enrichedBalances = await Promise.all(
      businessBalances.map(async (balance) => {
        const leaveType = await ctx.db.get(balance.leaveTypeId);
        const remaining =
          balance.entitled -
          balance.used +
          balance.adjustments +
          (balance.carryover ?? 0);

        return {
          ...balance,
          remaining,
          leaveType: leaveType
            ? {
                _id: leaveType._id,
                name: leaveType.name,
                code: leaveType.code,
                color: leaveType.color,
              }
            : null,
        };
      })
    );

    return enrichedBalances;
  },
});

/**
 * Get team balances for a manager
 */
export const getTeamBalances = query({
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

    // Verify user has permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    const role = membership.role;

    // Get team members based on role
    let teamMemberIds: Set<string> = new Set();

    if (role === "owner" || role === "finance_admin") {
      // Get all active members in the business
      const allMembers = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();

      allMembers
        .filter((m) => m.status === "active")
        .forEach((m) => teamMemberIds.add(m.userId.toString()));
    } else if (role === "manager") {
      // Get direct reports
      const allMembers = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();

      allMembers
        .filter((m) => m.status === "active" && m.managerId === user._id)
        .forEach((m) => teamMemberIds.add(m.userId.toString()));

      // Include self
      teamMemberIds.add(user._id.toString());
    } else {
      // Employees only see their own
      teamMemberIds.add(user._id.toString());
    }

    // Get balances for all team members
    const allBalances = await ctx.db
      .query("leave_balances")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter by year and team membership
    const teamBalances = allBalances.filter(
      (b) =>
        b.year === args.year && teamMemberIds.has(b.userId.toString())
    );

    // Group by user and enrich
    const userBalanceMap = new Map<string, any[]>();

    for (const balance of teamBalances) {
      const userId = balance.userId.toString();
      if (!userBalanceMap.has(userId)) {
        userBalanceMap.set(userId, []);
      }

      const leaveType = await ctx.db.get(balance.leaveTypeId);
      const remaining =
        balance.entitled -
        balance.used +
        balance.adjustments +
        (balance.carryover ?? 0);

      userBalanceMap.get(userId)!.push({
        ...balance,
        remaining,
        leaveType: leaveType
          ? {
              _id: leaveType._id,
              name: leaveType.name,
              code: leaveType.code,
              color: leaveType.color,
            }
          : null,
      });
    }

    // Build result with user info
    const result = [];
    for (const [userId, balances] of userBalanceMap) {
      const memberUser = await resolveById(ctx.db, "users", userId);
      result.push({
        user: memberUser
          ? {
              _id: memberUser._id,
              fullName: memberUser.fullName,
              email: memberUser.email,
            }
          : null,
        balances,
      });
    }

    return result;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Initialize balances for a user (called when employee joins or at year start)
 */
export const initialize = mutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!currentUser) throw new Error("User not found");

    // Verify admin permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", currentUser._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Only admins can initialize balances");
    }

    // Get all active leave types for the business
    const leaveTypes = await ctx.db
      .query("leave_types")
      .withIndex("by_businessId_isActive", (q) =>
        q.eq("businessId", args.businessId).eq("isActive", true)
      )
      .collect();

    const createdIds = [];

    for (const leaveType of leaveTypes) {
      // Check if balance already exists
      const existing = await ctx.db
        .query("leave_balances")
        .withIndex("by_businessId_userId_leaveTypeId_year", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("userId", args.userId)
            .eq("leaveTypeId", leaveType._id)
            .eq("year", args.year)
        )
        .first();

      if (!existing) {
        const id = await ctx.db.insert("leave_balances", {
          businessId: args.businessId,
          userId: args.userId,
          leaveTypeId: leaveType._id,
          year: args.year,
          entitled: leaveType.defaultDays,
          used: 0,
          adjustments: 0,
          lastUpdated: Date.now(),
        });
        createdIds.push(id);
      }
    }

    return {
      created: createdIds.length,
      balanceIds: createdIds,
    };
  },
});

/**
 * Adjust a balance (admin only)
 */
export const adjust = mutation({
  args: {
    balanceId: v.id("leave_balances"),
    adjustment: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!currentUser) throw new Error("User not found");

    const balance = await ctx.db.get(args.balanceId);
    if (!balance) throw new Error("Balance not found");

    // Verify admin permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", currentUser._id).eq("businessId", balance.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Only admins can adjust balances");
    }

    // Reason is required
    if (!args.reason || args.reason.trim().length === 0) {
      throw new Error("Adjustment reason is required");
    }

    // Update the balance
    const newAdjustments = balance.adjustments + args.adjustment;
    await ctx.db.patch(args.balanceId, {
      adjustments: newAdjustments,
      lastUpdated: Date.now(),
    });

    // TODO: Create audit event for the adjustment

    return args.balanceId;
  },
});

/**
 * Update entitled days for a balance (admin only)
 */
export const updateEntitled = mutation({
  args: {
    balanceId: v.id("leave_balances"),
    entitled: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!currentUser) throw new Error("User not found");

    const balance = await ctx.db.get(args.balanceId);
    if (!balance) throw new Error("Balance not found");

    // Verify admin permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", currentUser._id).eq("businessId", balance.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      throw new Error("Only admins can update entitlements");
    }

    // Validate
    if (args.entitled < 0) {
      throw new Error("Entitled days cannot be negative");
    }

    // Update the balance
    await ctx.db.patch(args.balanceId, {
      entitled: args.entitled,
      lastUpdated: Date.now(),
    });

    return args.balanceId;
  },
});

/**
 * Auto-initialize balances for a user when they join
 * Called internally when membership is activated
 * Uses custom entitlements from membership if set, else leave type defaults
 */
export const initializeForUser = mutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const currentYear = new Date().getFullYear();

    // Get membership to check for custom entitlements
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", args.userId).eq("businessId", args.businessId)
      )
      .first();

    const customEntitlements = (membership?.leaveEntitlements as Record<string, number>) || {};

    // Get all active leave types for the business
    const leaveTypes = await ctx.db
      .query("leave_types")
      .withIndex("by_businessId_isActive", (q) =>
        q.eq("businessId", args.businessId).eq("isActive", true)
      )
      .collect();

    const createdIds = [];

    for (const leaveType of leaveTypes) {
      // Check if balance already exists
      const existing = await ctx.db
        .query("leave_balances")
        .withIndex("by_businessId_userId_leaveTypeId_year", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("userId", args.userId)
            .eq("leaveTypeId", leaveType._id)
            .eq("year", currentYear)
        )
        .first();

      if (!existing) {
        // Use custom entitlement if set, otherwise use leave type default
        const entitledDays = customEntitlements[leaveType._id] ?? leaveType.defaultDays;

        const id = await ctx.db.insert("leave_balances", {
          businessId: args.businessId,
          userId: args.userId,
          leaveTypeId: leaveType._id,
          year: currentYear,
          entitled: entitledDays,
          used: 0,
          adjustments: 0,
          lastUpdated: Date.now(),
        });
        createdIds.push(id);
      }
    }

    console.log(`[Leave Balances] Initialized ${createdIds.length} balances for user ${args.userId}`);
    return { created: createdIds.length };
  },
});

/**
 * Initialize balances for a new year with carryover calculation
 * Uses custom entitlements from membership if set, else leave type defaults
 */
export const initializeForYear = mutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    const previousYear = args.year - 1;

    // Get membership to check for custom entitlements
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", args.userId).eq("businessId", args.businessId)
      )
      .first();

    const customEntitlements = (membership?.leaveEntitlements as Record<string, number>) || {};

    // Get all active leave types for the business
    const leaveTypes = await ctx.db
      .query("leave_types")
      .withIndex("by_businessId_isActive", (q) =>
        q.eq("businessId", args.businessId).eq("isActive", true)
      )
      .collect();

    const createdIds = [];

    for (const leaveType of leaveTypes) {
      // Check if balance already exists for the new year
      const existing = await ctx.db
        .query("leave_balances")
        .withIndex("by_businessId_userId_leaveTypeId_year", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("userId", args.userId)
            .eq("leaveTypeId", leaveType._id)
            .eq("year", args.year)
        )
        .first();

      if (existing) continue;

      // Get previous year's balance for carryover calculation
      const previousBalance = await ctx.db
        .query("leave_balances")
        .withIndex("by_businessId_userId_leaveTypeId_year", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("userId", args.userId)
            .eq("leaveTypeId", leaveType._id)
            .eq("year", previousYear)
        )
        .first();

      // Calculate carryover based on policy
      let carryover = 0;
      if (previousBalance) {
        const previousRemaining =
          previousBalance.entitled -
          previousBalance.used +
          previousBalance.adjustments +
          (previousBalance.carryover ?? 0);

        const policy = leaveType.carryoverPolicy ?? "none";
        const cap = leaveType.carryoverCap ?? 0;

        if (policy === "unlimited") {
          carryover = Math.max(0, previousRemaining);
        } else if (policy === "cap" && cap > 0) {
          carryover = Math.min(Math.max(0, previousRemaining), cap);
        }
        // "none" policy = 0 carryover
      }

      // Use custom entitlement if set, otherwise use leave type default
      const entitledDays = customEntitlements[leaveType._id] ?? leaveType.defaultDays;

      const id = await ctx.db.insert("leave_balances", {
        businessId: args.businessId,
        userId: args.userId,
        leaveTypeId: leaveType._id,
        year: args.year,
        entitled: entitledDays,
        used: 0,
        adjustments: 0,
        carryover: carryover > 0 ? carryover : undefined,
        lastUpdated: Date.now(),
      });
      createdIds.push(id);
    }

    console.log(`[Leave Balances] Initialized ${createdIds.length} balances for year ${args.year}`);
    return { created: createdIds.length, year: args.year };
  },
});

/**
 * Ensure balances exist for a user and year (lazy initialization)
 * Returns true if balances were created, false if they already existed
 * Uses custom entitlements from membership if set, else leave type defaults
 */
export const ensureBalancesExist = mutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if any balances exist for this user/year
    const existingBalances = await ctx.db
      .query("leave_balances")
      .withIndex("by_userId_year", (q) =>
        q.eq("userId", args.userId).eq("year", args.year)
      )
      .collect();

    const businessBalances = existingBalances.filter(
      (b) => b.businessId === args.businessId
    );

    if (businessBalances.length > 0) {
      return { created: false, count: businessBalances.length };
    }

    // Get membership to check for custom entitlements
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", args.userId).eq("businessId", args.businessId)
      )
      .first();

    const customEntitlements = (membership?.leaveEntitlements as Record<string, number>) || {};

    // No balances exist - initialize them
    const previousYear = args.year - 1;

    // Get all active leave types
    const leaveTypes = await ctx.db
      .query("leave_types")
      .withIndex("by_businessId_isActive", (q) =>
        q.eq("businessId", args.businessId).eq("isActive", true)
      )
      .collect();

    const createdIds = [];

    for (const leaveType of leaveTypes) {
      // Get previous year's balance for carryover
      const previousBalance = await ctx.db
        .query("leave_balances")
        .withIndex("by_businessId_userId_leaveTypeId_year", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("userId", args.userId)
            .eq("leaveTypeId", leaveType._id)
            .eq("year", previousYear)
        )
        .first();

      // Calculate carryover
      let carryover = 0;
      if (previousBalance) {
        const previousRemaining =
          previousBalance.entitled -
          previousBalance.used +
          previousBalance.adjustments +
          (previousBalance.carryover ?? 0);

        const policy = leaveType.carryoverPolicy ?? "none";
        const cap = leaveType.carryoverCap ?? 0;

        if (policy === "unlimited") {
          carryover = Math.max(0, previousRemaining);
        } else if (policy === "cap" && cap > 0) {
          carryover = Math.min(Math.max(0, previousRemaining), cap);
        }
      }

      // Use custom entitlement if set, otherwise use leave type default
      const entitledDays = customEntitlements[leaveType._id] ?? leaveType.defaultDays;

      const id = await ctx.db.insert("leave_balances", {
        businessId: args.businessId,
        userId: args.userId,
        leaveTypeId: leaveType._id,
        year: args.year,
        entitled: entitledDays,
        used: 0,
        adjustments: 0,
        carryover: carryover > 0 ? carryover : undefined,
        lastUpdated: Date.now(),
      });
      createdIds.push(id);
    }

    console.log(`[Leave Balances] Lazy-initialized ${createdIds.length} balances for user ${args.userId}, year ${args.year}`);
    return { created: true, count: createdIds.length };
  },
});

/**
 * Get all employees with their balances for admin view
 */
export const getAllEmployeeBalances = query({
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

    // Verify admin permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      return []; // Only admins can view all balances
    }

    // Get all active members
    const members = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const activeMembers = members.filter((m) => m.status === "active");

    // Get all leave types
    const leaveTypes = await ctx.db
      .query("leave_types")
      .withIndex("by_businessId_isActive", (q) =>
        q.eq("businessId", business._id).eq("isActive", true)
      )
      .collect();

    // Build employee balance data
    const employeeData = await Promise.all(
      activeMembers.map(async (member) => {
        const memberUser = await ctx.db.get(member.userId);
        if (!memberUser) return null;

        // Get balances for this user
        const balances = await ctx.db
          .query("leave_balances")
          .withIndex("by_userId_year", (q) =>
            q.eq("userId", member.userId).eq("year", args.year)
          )
          .collect();

        const businessBalances = balances.filter(
          (b) => b.businessId === business._id
        );

        // Enrich balances with leave type info
        const enrichedBalances = await Promise.all(
          businessBalances.map(async (balance) => {
            const leaveType = await ctx.db.get(balance.leaveTypeId);
            const remaining =
              balance.entitled -
              balance.used +
              balance.adjustments +
              (balance.carryover ?? 0);

            return {
              ...balance,
              remaining,
              leaveType: leaveType
                ? {
                    _id: leaveType._id,
                    name: leaveType.name,
                    code: leaveType.code,
                    color: leaveType.color,
                  }
                : null,
            };
          })
        );

        return {
          user: {
            _id: memberUser._id,
            fullName: memberUser.fullName,
            email: memberUser.email,
          },
          membership: {
            _id: member._id,
            role: member.role,
            leaveEntitlements: member.leaveEntitlements as Record<string, number> | undefined,
          },
          balances: enrichedBalances,
          hasBalances: enrichedBalances.length > 0,
        };
      })
    );

    // Filter out nulls and sort by name
    return employeeData
      .filter((e) => e !== null)
      .sort((a, b) => (a!.user.fullName || "").localeCompare(b!.user.fullName || ""));
  },
});

/**
 * Initialize balances for all employees in a business (admin bulk action)
 */
export const initializeAllEmployees = mutation({
  args: {
    businessId: v.id("businesses"),
    year: v.number(),
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
      throw new Error("Only admins can initialize all balances");
    }

    // Get all active members
    const members = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const activeMembers = members.filter((m) => m.status === "active");

    // Get all active leave types
    const leaveTypes = await ctx.db
      .query("leave_types")
      .withIndex("by_businessId_isActive", (q) =>
        q.eq("businessId", args.businessId).eq("isActive", true)
      )
      .collect();

    const previousYear = args.year - 1;
    let totalCreated = 0;
    let totalSkipped = 0;

    for (const member of activeMembers) {
      // Get custom entitlements for this member
      const customEntitlements = (member.leaveEntitlements as Record<string, number>) || {};

      for (const leaveType of leaveTypes) {
        // Check if balance already exists
        const existing = await ctx.db
          .query("leave_balances")
          .withIndex("by_businessId_userId_leaveTypeId_year", (q) =>
            q
              .eq("businessId", args.businessId)
              .eq("userId", member.userId)
              .eq("leaveTypeId", leaveType._id)
              .eq("year", args.year)
          )
          .first();

        if (existing) {
          totalSkipped++;
          continue;
        }

        // Get previous year's balance for carryover
        const previousBalance = await ctx.db
          .query("leave_balances")
          .withIndex("by_businessId_userId_leaveTypeId_year", (q) =>
            q
              .eq("businessId", args.businessId)
              .eq("userId", member.userId)
              .eq("leaveTypeId", leaveType._id)
              .eq("year", previousYear)
          )
          .first();

        // Calculate carryover
        let carryover = 0;
        if (previousBalance) {
          const previousRemaining =
            previousBalance.entitled -
            previousBalance.used +
            previousBalance.adjustments +
            (previousBalance.carryover ?? 0);

          const policy = leaveType.carryoverPolicy ?? "none";
          const cap = leaveType.carryoverCap ?? 0;

          if (policy === "unlimited") {
            carryover = Math.max(0, previousRemaining);
          } else if (policy === "cap" && cap > 0) {
            carryover = Math.min(Math.max(0, previousRemaining), cap);
          }
        }

        // Use custom entitlement if set, otherwise use leave type default
        const entitledDays = customEntitlements[leaveType._id] ?? leaveType.defaultDays;

        await ctx.db.insert("leave_balances", {
          businessId: args.businessId,
          userId: member.userId,
          leaveTypeId: leaveType._id,
          year: args.year,
          entitled: entitledDays,
          used: 0,
          adjustments: 0,
          carryover: carryover > 0 ? carryover : undefined,
          lastUpdated: Date.now(),
        });
        totalCreated++;
      }
    }

    console.log(`[Leave Balances] Bulk initialized: ${totalCreated} created, ${totalSkipped} skipped`);
    return {
      created: totalCreated,
      skipped: totalSkipped,
      employees: activeMembers.length,
      leaveTypes: leaveTypes.length,
    };
  },
});

/**
 * Reinitialize balances for a specific user after entitlement changes
 * Updates existing balances and creates any missing ones
 */
export const reinitializeUserBalances = mutation({
  args: {
    membershipId: v.id("business_memberships"),
    year: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const actorUser = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!actorUser) throw new Error("User not found");

    const targetMembership = await ctx.db.get(args.membershipId);
    if (!targetMembership) throw new Error("Membership not found");

    // Verify admin permission
    const actorMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", actorUser._id).eq("businessId", targetMembership.businessId)
      )
      .first();

    if (!actorMembership || actorMembership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (actorMembership.role !== "owner" && actorMembership.role !== "finance_admin") {
      throw new Error("Only admins can reinitialize balances");
    }

    const year = args.year ?? new Date().getFullYear();
    const customEntitlements = (targetMembership.leaveEntitlements as Record<string, number>) || {};

    // Get all active leave types
    const leaveTypes = await ctx.db
      .query("leave_types")
      .withIndex("by_businessId_isActive", (q) =>
        q.eq("businessId", targetMembership.businessId).eq("isActive", true)
      )
      .collect();

    let updated = 0;
    let created = 0;

    for (const leaveType of leaveTypes) {
      const entitledDays = customEntitlements[leaveType._id] ?? leaveType.defaultDays;

      // Check if balance already exists
      const existingBalance = await ctx.db
        .query("leave_balances")
        .withIndex("by_userId_year", (q) =>
          q.eq("userId", targetMembership.userId).eq("year", year)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("businessId"), targetMembership.businessId),
            q.eq(q.field("leaveTypeId"), leaveType._id)
          )
        )
        .first();

      if (existingBalance) {
        // Update existing balance with new entitled days
        await ctx.db.patch(existingBalance._id, {
          entitled: entitledDays,
          lastUpdated: Date.now(),
        });
        updated++;
      } else {
        // Create new balance
        await ctx.db.insert("leave_balances", {
          businessId: targetMembership.businessId,
          userId: targetMembership.userId,
          leaveTypeId: leaveType._id,
          year,
          entitled: entitledDays,
          used: 0,
          adjustments: 0,
          lastUpdated: Date.now(),
        });
        created++;
      }
    }

    console.log(`[Leave Balances] Reinitialized for user: ${updated} updated, ${created} created`);
    return { updated, created };
  },
});

// ============================================
// 034-leave-enhance: BULK IMPORT
// ============================================

/**
 * Internal mutation: bulk upsert leave balances from CSV import.
 * Creates new records or updates existing ones.
 */
export const bulkUpsert = internalMutation({
  args: {
    businessId: v.id("businesses"),
    balances: v.array(
      v.object({
        userId: v.id("users"),
        leaveTypeId: v.id("leave_types"),
        year: v.number(),
        entitled: v.number(),
        used: v.optional(v.number()),
        carryover: v.optional(v.number()),
        adjustments: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let created = 0;
    let updated = 0;

    for (const balance of args.balances) {
      // Check if balance already exists
      const existing = await ctx.db
        .query("leave_balances")
        .withIndex("by_businessId_userId_leaveTypeId_year", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("userId", balance.userId)
            .eq("leaveTypeId", balance.leaveTypeId)
            .eq("year", balance.year)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          entitled: balance.entitled,
          ...(balance.used !== undefined && { used: balance.used }),
          ...(balance.carryover !== undefined && { carryover: balance.carryover }),
          ...(balance.adjustments !== undefined && { adjustments: balance.adjustments }),
          importSource: "csv_import" as const,
          importedAt: Date.now(),
          lastUpdated: Date.now(),
        });
        updated++;
      } else {
        await ctx.db.insert("leave_balances", {
          businessId: args.businessId,
          userId: balance.userId,
          leaveTypeId: balance.leaveTypeId,
          year: balance.year,
          entitled: balance.entitled,
          used: balance.used ?? 0,
          adjustments: balance.adjustments ?? 0,
          carryover: balance.carryover,
          importSource: "csv_import" as const,
          importedAt: Date.now(),
          lastUpdated: Date.now(),
        });
        created++;
      }
    }

    return { created, updated };
  },
});

/**
 * Public action: Import leave balances from parsed CSV data.
 * Validates emails → userIds and codes → leaveTypeIds, then calls bulkUpsert.
 */
export const importFromCsv = action({
  args: {
    businessId: v.string(),
    rows: v.array(
      v.object({
        employeeEmail: v.string(),
        leaveTypeCode: v.string(),
        year: v.number(),
        entitled: v.number(),
        used: v.optional(v.number()),
        carryover: v.optional(v.number()),
        adjustments: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args): Promise<{ created: number; updated: number; skipped: number; errors: Array<{ row: number; reason: string }> }> => {
    // Resolve business
    const business = await ctx.runQuery(internal.functions.leaveBalances.resolveBusinessForImport, {
      businessId: args.businessId,
    });
    if (!business) {
      return { created: 0, updated: 0, skipped: args.rows.length, errors: [{ row: 0, reason: "Business not found" }] };
    }

    // Get all members and leave types for lookup
    const lookups = await ctx.runQuery(internal.functions.leaveBalances.getImportLookups, {
      businessId: business._id,
    });

    const emailToUserId = new Map<string, string>(
      lookups.members.map((m: any) => [m.email?.toLowerCase(), m.userId])
    );
    const codeToLeaveTypeId = new Map<string, string>(
      lookups.leaveTypes.map((lt: any) => [lt.code?.toUpperCase(), lt._id])
    );

    const validBalances: any[] = [];
    const errors: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < args.rows.length; i++) {
      const row = args.rows[i];
      const rowNum = i + 1;

      // Resolve employee
      const userId = emailToUserId.get(row.employeeEmail.toLowerCase());
      if (!userId) {
        errors.push({ row: rowNum, reason: `Employee email not found: ${row.employeeEmail}` });
        continue;
      }

      // Resolve leave type
      const leaveTypeId = codeToLeaveTypeId.get(row.leaveTypeCode.toUpperCase());
      if (!leaveTypeId) {
        errors.push({ row: rowNum, reason: `Leave type code not found: ${row.leaveTypeCode}` });
        continue;
      }

      // Validate year
      const currentYear = new Date().getFullYear();
      if (row.year < currentYear - 5 || row.year > currentYear + 1) {
        errors.push({ row: rowNum, reason: `Year out of range: ${row.year} (must be ${currentYear - 5}-${currentYear + 1})` });
        continue;
      }

      validBalances.push({
        userId,
        leaveTypeId,
        year: row.year,
        entitled: row.entitled,
        used: row.used,
        carryover: row.carryover,
        adjustments: row.adjustments,
      });
    }

    // Bulk upsert valid balances
    let created = 0;
    let updated = 0;
    if (validBalances.length > 0) {
      const result = await ctx.runMutation(internal.functions.leaveBalances.bulkUpsert, {
        businessId: business._id,
        balances: validBalances,
      });
      created = result.created;
      updated = result.updated;
    }

    return {
      created,
      updated,
      skipped: errors.length,
      errors,
    };
  },
});

/**
 * Internal query: resolve business ID for import validation.
 */
export const resolveBusinessForImport = internalQuery({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    return await resolveById(ctx.db, "businesses", args.businessId);
  },
});

/**
 * Internal query: get member emails and leave type codes for import lookups.
 */
export const getImportLookups = internalQuery({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    // Get all active members
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const activeMembers = memberships.filter((m) => m.status === "active");

    const members = await Promise.all(
      activeMembers.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return { userId: m.userId.toString(), email: user?.email };
      })
    );

    // Get all active leave types
    const leaveTypes = await ctx.db
      .query("leave_types")
      .withIndex("by_businessId_isActive", (q) =>
        q.eq("businessId", args.businessId).eq("isActive", true)
      )
      .collect();

    return {
      members: members.filter((m) => m.email),
      leaveTypes: leaveTypes.map((lt) => ({ _id: lt._id.toString(), code: lt.code })),
    };
  },
});
