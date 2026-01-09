/**
 * Membership Functions - Convex queries and mutations for team management
 *
 * These functions handle:
 * - Team member invitations
 * - Role management
 * - Membership status changes
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// Role hierarchy for permission checks (simplified: owner > manager > employee)
const ROLE_HIERARCHY: Record<string, number> = {
  owner: 3,
  manager: 2,
  employee: 1,
};

function canManageRole(actorRole: string, targetRole: string): boolean {
  return (ROLE_HIERARCHY[actorRole] || 0) > (ROLE_HIERARCHY[targetRole] || 0);
}

// ============================================
// QUERIES
// ============================================

/**
 * Get membership for current user and specific business
 */
export const getMyMembership = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    return await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();
  },
});

/**
 * Get membership for current user by string business ID
 * Accepts both Convex IDs and legacy UUIDs
 */
export const verifyMembership = query({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Resolve business ID (supports both Convex and legacy IDs)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return null;
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    // Return membership with snake_case fields for API compatibility
    return {
      id: membership._id,
      user_id: user._id,
      business_id: membership.businessId,
      role: membership.role,
      invited_at: membership.invitedAt ? new Date(membership.invitedAt).toISOString() : undefined,
      joined_at: membership.joinedAt ? new Date(membership.joinedAt).toISOString() : new Date(membership._creationTime).toISOString(),
      last_accessed_at: membership.lastAccessedAt ? new Date(membership.lastAccessedAt).toISOString() : undefined,
      status: membership.status,
      created_at: new Date(membership._creationTime).toISOString(),
      updated_at: membership.updatedAt ? new Date(membership.updatedAt).toISOString() : new Date(membership._creationTime).toISOString(),
    };
  },
});

/**
 * Get all memberships for a business (team list)
 */
export const getByBusinessId = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Verify caller has access to this business
    const callerMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!callerMembership || callerMembership.status !== "active") {
      return [];
    }

    // Get all memberships
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Enrich with user details
    const enrichedMemberships = await Promise.all(
      memberships.map(async (membership) => {
        const memberUser = await ctx.db.get(membership.userId);
        return {
          ...membership,
          user: memberUser
            ? {
                _id: memberUser._id,
                email: memberUser.email,
                fullName: memberUser.fullName,
              }
            : null,
        };
      })
    );

    return enrichedMemberships;
  },
});

/**
 * Get pending invitations for a business
 */
export const getPendingInvitations = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Verify caller has admin/owner access
    const callerMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!callerMembership || !["owner", "manager"].includes(callerMembership.role)) {
      return [];
    }

    // Get pending memberships
    // (Convex doesn't support .filter() after .withIndex() - use JS filter)
    const allMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const pendingMemberships = allMemberships.filter((m) => m.status === "pending");

    // Enrich with user details
    return await Promise.all(
      pendingMemberships.map(async (membership) => {
        const memberUser = await ctx.db.get(membership.userId);
        return {
          ...membership,
          user: memberUser
            ? { email: memberUser.email, fullName: memberUser.fullName }
            : null,
        };
      })
    );
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Invite user to business by email
 * Creates pending membership
 */
export const inviteByEmail = mutation({
  args: {
    businessId: v.id("businesses"),
    email: v.string(),
    role: v.union(
      v.literal("manager"),
      v.literal("employee")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const inviter = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!inviter) {
      throw new Error("User not found");
    }

    // Check inviter's permission (owner and managers can invite)
    const inviterMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", inviter._id).eq("businessId", args.businessId)
      )
      .first();

    if (!inviterMembership || !["owner", "manager"].includes(inviterMembership.role)) {
      throw new Error("Insufficient permissions to invite");
    }

    // Can't invite to a role higher than your own
    if (!canManageRole(inviterMembership.role, args.role)) {
      throw new Error("Cannot invite to a role equal or higher than your own");
    }

    // Find or create user by email
    let invitee = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!invitee) {
      // Create placeholder user (will be updated when they sign up via Clerk)
      const inviteeId = await ctx.db.insert("users", {
        clerkUserId: `pending_${args.email}`, // Placeholder, updated on Clerk signup
        email: args.email,
        updatedAt: Date.now(),
      });
      invitee = await ctx.db.get(inviteeId);
    }

    if (!invitee) {
      throw new Error("Failed to create invitee");
    }

    // Check if already a member
    const existingMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", invitee._id).eq("businessId", args.businessId)
      )
      .first();

    if (existingMembership) {
      if (existingMembership.status === "active") {
        throw new Error("User is already a member");
      }
      if (existingMembership.status === "pending") {
        throw new Error("Invitation already pending");
      }
      // If suspended, can re-invite
      await ctx.db.patch(existingMembership._id, {
        role: args.role,
        status: "pending",
        updatedAt: Date.now(),
      });
      return existingMembership._id;
    }

    // Create pending membership
    const membershipId = await ctx.db.insert("business_memberships", {
      userId: invitee._id,
      businessId: args.businessId,
      role: args.role,
      status: "pending",
      updatedAt: Date.now(),
    });

    return membershipId;
  },
});

/**
 * Accept invitation (set status to active)
 */
export const acceptInvitation = mutation({
  args: { membershipId: v.id("business_memberships") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const membership = await ctx.db.get(args.membershipId);
    if (!membership) {
      throw new Error("Invitation not found");
    }

    // Verify this invitation is for the current user
    if (membership.userId !== user._id) {
      throw new Error("This invitation is not for you");
    }

    if (membership.status !== "pending") {
      throw new Error("Invitation is no longer pending");
    }

    await ctx.db.patch(args.membershipId, {
      status: "active",
      joinedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Set as active business if user doesn't have one
    if (!user.businessId) {
      await ctx.db.patch(user._id, {
        businessId: membership.businessId,
        updatedAt: Date.now(),
      });
    }

    return args.membershipId;
  },
});

/**
 * Decline/cancel invitation
 */
export const declineInvitation = mutation({
  args: { membershipId: v.id("business_memberships") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.status !== "pending") {
      throw new Error("Pending invitation not found");
    }

    // Can be declined by invitee or admin/owner
    const isInvitee = membership.userId === user._id;

    if (!isInvitee) {
      const callerMembership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", membership.businessId)
        )
        .first();

      if (!callerMembership || !["owner", "manager"].includes(callerMembership.role)) {
        throw new Error("Insufficient permissions");
      }
    }

    await ctx.db.delete(args.membershipId);
    return true;
  },
});

/**
 * Update member role (owner only)
 */
export const updateRole = mutation({
  args: {
    membershipId: v.id("business_memberships"),
    newRole: v.union(
      v.literal("manager"),
      v.literal("employee")
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

    const targetMembership = await ctx.db.get(args.membershipId);
    if (!targetMembership) {
      throw new Error("Membership not found");
    }

    // Get caller's membership (only owner can change roles)
    const callerMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", targetMembership.businessId)
      )
      .first();

    if (!callerMembership || callerMembership.role !== "owner") {
      throw new Error("Only owner can change member roles");
    }

    // Can't change owner role
    if (targetMembership.role === "owner") {
      throw new Error("Cannot change owner role");
    }

    // Can only assign roles lower than your own
    if (!canManageRole(callerMembership.role, args.newRole)) {
      throw new Error("Cannot assign role equal or higher than your own");
    }

    await ctx.db.patch(args.membershipId, {
      role: args.newRole,
      updatedAt: Date.now(),
    });

    return args.membershipId;
  },
});

/**
 * Remove member from business
 */
export const removeMember = mutation({
  args: { membershipId: v.id("business_memberships") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const targetMembership = await ctx.db.get(args.membershipId);
    if (!targetMembership) {
      throw new Error("Membership not found");
    }

    // Can't remove owner
    if (targetMembership.role === "owner") {
      throw new Error("Cannot remove business owner");
    }

    // Check if self-removal (leaving) or admin action
    const isSelf = targetMembership.userId === user._id;

    if (!isSelf) {
      const callerMembership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", targetMembership.businessId)
        )
        .first();

      if (!callerMembership || !["owner", "manager"].includes(callerMembership.role)) {
        throw new Error("Insufficient permissions");
      }

      // Can only remove members with lower role
      if (!canManageRole(callerMembership.role, targetMembership.role)) {
        throw new Error("Cannot remove member with equal or higher role");
      }
    }

    // Clear business from user if it was their active business
    const targetUser = await ctx.db.get(targetMembership.userId);
    if (targetUser?.businessId === targetMembership.businessId) {
      await ctx.db.patch(targetMembership.userId, {
        businessId: undefined,
        updatedAt: Date.now(),
      });
    }

    await ctx.db.delete(args.membershipId);
    return true;
  },
});

/**
 * Suspend member (set status to suspended)
 */
export const suspendMember = mutation({
  args: { membershipId: v.id("business_memberships") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const targetMembership = await ctx.db.get(args.membershipId);
    if (!targetMembership) {
      throw new Error("Membership not found");
    }

    if (targetMembership.role === "owner") {
      throw new Error("Cannot suspend business owner");
    }

    // Only owner can suspend members
    const callerMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", targetMembership.businessId)
      )
      .first();

    if (!callerMembership || callerMembership.role !== "owner") {
      throw new Error("Only owner can suspend members");
    }

    if (!canManageRole(callerMembership.role, targetMembership.role)) {
      throw new Error("Cannot suspend member with equal or higher role");
    }

    await ctx.db.patch(args.membershipId, {
      status: "suspended",
      updatedAt: Date.now(),
    });

    return args.membershipId;
  },
});

/**
 * Reactivate suspended member (owner only)
 */
export const reactivateMember = mutation({
  args: { membershipId: v.id("business_memberships") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const targetMembership = await ctx.db.get(args.membershipId);
    if (!targetMembership || targetMembership.status !== "suspended") {
      throw new Error("Suspended membership not found");
    }

    // Only owner can reactivate members
    const callerMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", targetMembership.businessId)
      )
      .first();

    if (!callerMembership || callerMembership.role !== "owner") {
      throw new Error("Only owner can reactivate members");
    }

    await ctx.db.patch(args.membershipId, {
      status: "active",
      updatedAt: Date.now(),
    });

    return args.membershipId;
  },
});

// ============================================
// STRING ID HELPERS (for backward compatibility)
// ============================================

/**
 * Update member role by string user ID and business ID
 * Accepts both Convex IDs and legacy UUIDs
 * Used by rbac.ts - only owner can change roles
 */
export const updateRoleByStringIds = mutation({
  args: {
    userId: v.string(),
    businessId: v.string(),
    newRole: v.union(
      v.literal("manager"),
      v.literal("employee")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const caller = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!caller) {
      throw new Error("Caller not found");
    }

    // Resolve target user (supports Convex ID or legacy UUID)
    const targetUser = await resolveById(ctx.db, "users", args.userId);
    if (!targetUser) {
      throw new Error("Target user not found");
    }

    // Resolve business (supports Convex ID or legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Find target's membership
    const targetMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", targetUser._id).eq("businessId", business._id)
      )
      .first();

    if (!targetMembership) {
      throw new Error("Membership not found");
    }

    // Get caller's membership for permission check (only owner can change roles)
    const callerMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", caller._id).eq("businessId", business._id)
      )
      .first();

    if (!callerMembership || callerMembership.role !== "owner") {
      throw new Error("Only owner can change member roles");
    }

    // Can't change owner role
    if (targetMembership.role === "owner") {
      throw new Error("Cannot change owner role");
    }

    // Can only assign roles lower than your own
    if (!canManageRole(callerMembership.role, args.newRole)) {
      throw new Error("Cannot assign role equal or higher than your own");
    }

    await ctx.db.patch(targetMembership._id, {
      role: args.newRole,
      updatedAt: Date.now(),
    });

    return targetMembership._id;
  },
});

/**
 * Get all members for a business by string business ID
 * Accepts both Convex IDs and legacy UUIDs
 * Returns enriched data with user details
 */
export const getBusinessUsersByStringId = query({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Resolve business (supports Convex ID or legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    // Verify caller has access to this business
    const callerMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!callerMembership || callerMembership.status !== "active") {
      return [];
    }

    // Only owner/manager can list all users
    if (!["owner", "manager"].includes(callerMembership.role)) {
      return [];
    }

    // Get all memberships
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Enrich with user details (format compatible with UserProfile)
    const enrichedMemberships = await Promise.all(
      memberships.map(async (membership) => {
        const memberUser = await ctx.db.get(membership.userId);
        return {
          id: membership._id,
          user_id: membership.userId,
          business_id: membership.businessId,
          role: membership.role,
          role_permissions: {
            employee: true,
            manager: membership.role === "owner" || membership.role === "manager",
            admin: membership.role === "owner",
          },
          status: membership.status,
          created_at: new Date(membership._creationTime).toISOString(),
          updated_at: membership.updatedAt
            ? new Date(membership.updatedAt).toISOString()
            : new Date(membership._creationTime).toISOString(),
          // Include user details
          user: memberUser
            ? {
                id: memberUser._id,
                clerkUserId: memberUser.clerkUserId,
                email: memberUser.email,
                fullName: memberUser.fullName,
              }
            : null,
        };
      })
    );

    return enrichedMemberships;
  },
});

/**
 * Get team members with manager information
 * Returns all active members in a business with their manager details
 * Replaces the Supabase RPC `get_manager_team_employees`
 */
export const getTeamMembersWithManagers = query({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Resolve business (supports Convex ID or legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    // Verify caller has access to this business
    const callerMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!callerMembership || callerMembership.status !== "active") {
      return [];
    }

    // Get all active memberships
    // (Convex doesn't support .filter() after .withIndex() - use JS filter)
    const teamMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const memberships = teamMemberships.filter((m) => m.status === "active");

    // Enrich with user details and manager info
    const enrichedMemberships = await Promise.all(
      memberships.map(async (membership) => {
        const memberUser = await ctx.db.get(membership.userId);

        // Get manager info if managerId exists
        let managerInfo = null;
        if (membership.managerId) {
          const managerUser = await ctx.db.get(membership.managerId);
          if (managerUser) {
            managerInfo = {
              id: managerUser._id,
              user_id: managerUser._id,
              full_name: managerUser.fullName || null,
              email: managerUser.email,
            };
          }
        }

        return {
          id: membership._id,
          membership_id: membership._id,
          user_id: membership.userId,
          business_id: membership.businessId,
          role: membership.role,
          role_permissions: {
            employee: true,
            manager: membership.role === "owner" || membership.role === "manager",
            admin: membership.role === "owner",
          },
          status: membership.status,
          full_name: memberUser?.fullName || null,
          email: memberUser?.email || null,
          home_currency: memberUser?.homeCurrency || business.homeCurrency || "SGD",
          clerk_user_id: memberUser?.clerkUserId || null,
          // Manager info
          manager_id: membership.managerId || null,
          manager_user_id: managerInfo?.user_id || null,
          manager_name: managerInfo?.full_name || null,
          // Timestamps
          created_at: new Date(membership._creationTime).toISOString(),
          updated_at: membership.updatedAt
            ? new Date(membership.updatedAt).toISOString()
            : new Date(membership._creationTime).toISOString(),
        };
      })
    );

    return enrichedMemberships;
  },
});

/**
 * Get business members filtered by role and status
 * Used by workflow engines to find approvers (e.g., find admin for high-value approval)
 */
export const getBusinessMembers = query({
  args: {
    businessId: v.string(),
    role: v.optional(v.string()),
    status: v.optional(v.string()),
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

    // Resolve business (supports Convex ID or legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    // Verify caller has access to this business
    const callerMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!callerMembership || callerMembership.status !== "active") {
      return [];
    }

    // Get all memberships and filter
    let memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter by role if specified
    if (args.role) {
      memberships = memberships.filter((m) => m.role === args.role);
    }

    // Filter by status if specified
    if (args.status) {
      memberships = memberships.filter((m) => m.status === args.status);
    }

    // Enrich with user details
    return await Promise.all(
      memberships.map(async (membership) => {
        const memberUser = await ctx.db.get(membership.userId);
        return {
          id: membership._id,
          userId: membership.userId,
          businessId: membership.businessId,
          role: membership.role,
          status: membership.status,
          email: memberUser?.email || null,
          fullName: memberUser?.fullName || null,
        };
      })
    );
  },
});

/**
 * Assign or update manager for an employee
 * Requires admin/owner permission in the business
 */
export const assignManager = mutation({
  args: {
    businessId: v.string(),
    employeeUserId: v.string(),
    managerUserId: v.optional(v.string()), // null to remove manager
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const caller = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!caller) {
      throw new Error("User not found");
    }

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Verify caller has owner permission (only owner can assign managers)
    const callerMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", caller._id).eq("businessId", business._id)
      )
      .first();

    if (!callerMembership || callerMembership.role !== "owner") {
      throw new Error("Only owner can assign managers");
    }

    // Resolve employee user
    const employee = await resolveById(ctx.db, "users", args.employeeUserId);
    if (!employee) {
      throw new Error("Employee not found");
    }

    // Find employee's membership
    const employeeMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", employee._id).eq("businessId", business._id)
      )
      .first();

    if (!employeeMembership || employeeMembership.status !== "active") {
      throw new Error("Employee membership not found or not active");
    }

    // If manager is provided, validate them
    let managerUserId: typeof employeeMembership.managerId = undefined;
    if (args.managerUserId) {
      const manager = await resolveById(ctx.db, "users", args.managerUserId);
      if (!manager) {
        throw new Error("Manager not found");
      }

      // Verify manager has appropriate role
      const managerMembership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", manager._id).eq("businessId", business._id)
        )
        .first();

      if (!managerMembership || managerMembership.status !== "active") {
        throw new Error("Manager membership not found or not active");
      }

      if (!["owner", "manager"].includes(managerMembership.role)) {
        throw new Error("Assigned user must have manager or owner role");
      }

      managerUserId = manager._id;
    }

    // Update the employee's manager
    await ctx.db.patch(employeeMembership._id, {
      managerId: managerUserId,
      updatedAt: Date.now(),
    });

    return employeeMembership._id;
  },
});
