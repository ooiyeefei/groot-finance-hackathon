/**
 * User Functions - Convex queries and mutations for user management
 *
 * These functions handle:
 * - User lookup and profile management
 * - User creation/sync from Clerk
 * - Business context switching
 * - User preferences
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// ============================================
// QUERIES
// ============================================

/**
 * Get the currently authenticated user
 * Creates user record if doesn't exist (first login)
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    return user;
  },
});

/**
 * Get user by ID (Convex ID or legacy UUID)
 */
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    return await resolveById(ctx.db, "users", args.id);
  },
});

/**
 * Get user by Clerk ID
 */
export const getByClerkId = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await resolveUserByClerkId(ctx.db, args.clerkUserId);
  },
});

/**
 * Get user by email
 */
export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

/**
 * Get users by business ID (team members)
 */
export const getByBusinessId = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    // Get all memberships for the business
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Fetch user details for each membership
    const users = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        return user ? { ...user, role: membership.role, membershipStatus: membership.status } : null;
      })
    );

    return users.filter(Boolean);
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create or update user from Clerk webhook/sync
 * Called when user signs up or updates profile in Clerk
 *
 * MIGRATION HANDLING:
 * When migrating from Supabase, users may have `clerkUserId = "migrated_${legacyUuid}"`.
 * When the actual user logs in with their real Clerk ID, we need to:
 * 1. First try to find by Clerk ID (existing users)
 * 2. If not found, try to find by email (migrated users)
 * 3. If found by email, update the clerkUserId to the real Clerk ID (account merge)
 * 4. Only create new user if not found by either method
 */
export const upsertFromClerk = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Step 1: Try to find by Clerk ID (existing users with correct ID)
    const existingByClerkId = await resolveUserByClerkId(ctx.db, args.clerkUserId);

    if (existingByClerkId) {
      // Update existing user
      await ctx.db.patch(existingByClerkId._id, {
        email: args.email,
        fullName: args.fullName,
        updatedAt: Date.now(),
      });
      return existingByClerkId._id;
    }

    // Step 2: Try to find by email (migrated users with "migrated_xxx" clerkUserId)
    const existingByEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existingByEmail) {
      // Found user by email - this is likely a migrated user
      // Update their clerkUserId to the real Clerk ID (account merge)
      const wasMigrated = existingByEmail.clerkUserId?.startsWith("migrated_");
      console.log(`[upsertFromClerk] Found user by email: ${args.email}, migrated=${wasMigrated}`);
      console.log(`[upsertFromClerk] Updating clerkUserId from "${existingByEmail.clerkUserId}" to "${args.clerkUserId}"`);

      await ctx.db.patch(existingByEmail._id, {
        clerkUserId: args.clerkUserId, // Update to real Clerk ID
        email: args.email,
        fullName: args.fullName,
        updatedAt: Date.now(),
      });
      return existingByEmail._id;
    }

    // Step 3: Create new user (no existing user found)
    const userId = await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      email: args.email,
      fullName: args.fullName,
      homeCurrency: "MYR", // Default for SEA users
      updatedAt: Date.now(),
    });

    return userId;
  },
});

/**
 * Update user profile
 * Requires authentication
 */
export const updateProfile = mutation({
  args: {
    fullName: v.optional(v.string()),
    homeCurrency: v.optional(v.string()),
    department: v.optional(v.string()),
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

    await ctx.db.patch(user._id, {
      ...(args.fullName !== undefined && { fullName: args.fullName }),
      ...(args.homeCurrency !== undefined && { homeCurrency: args.homeCurrency }),
      ...(args.department !== undefined && { department: args.department }),
      updatedAt: Date.now(),
    });

    return user._id;
  },
});

/**
 * Update user preferences
 */
export const updatePreferences = mutation({
  args: {
    theme: v.optional(v.string()),
    language: v.optional(v.string()),
    notifications: v.optional(v.boolean()),
    timezone: v.optional(v.string()),
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

    const currentPreferences = user.preferences || {};
    const newPreferences = {
      ...currentPreferences,
      ...(args.theme !== undefined && { theme: args.theme }),
      ...(args.language !== undefined && { language: args.language }),
      ...(args.notifications !== undefined && { notifications: args.notifications }),
      ...(args.timezone !== undefined && { timezone: args.timezone }),
    };

    await ctx.db.patch(user._id, {
      preferences: newPreferences,
      updatedAt: Date.now(),
    });

    return user._id;
  },
});

/**
 * Switch active business context
 * Accepts string business ID (Convex ID or legacy UUID)
 */
export const switchBusiness = mutation({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Resolve business ID (supports both Convex and legacy IDs)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Verify user has access to this business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    await ctx.db.patch(user._id, {
      businessId: business._id,
      updatedAt: Date.now(),
    });

    // Update last accessed time in membership
    await ctx.db.patch(membership._id, {
      lastAccessedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return user._id;
  },
});

// ============================================
// ONBOARDING MUTATIONS
// ============================================

/**
 * Ensure user exists with a business (full onboarding flow)
 * Called during app initialization to ensure user has proper setup
 *
 * Handles multiple scenarios:
 * 1. Existing user with active membership → return profile
 * 2. Existing user without membership → create finance_admin membership
 * 3. Pending invitation by email → link Clerk account and activate
 * 4. New user (direct signup) → create user, business, and owner membership
 *
 * Returns UserProfile compatible data or null on failure
 */
export const ensureUserWithBusiness = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // SCENARIO 1: Check if user already exists by Clerk ID
    let user = await resolveUserByClerkId(ctx.db, args.clerkUserId);

    if (user) {
      // User exists - check for business membership
      if (user.businessId) {
        const membership = await ctx.db
          .query("business_memberships")
          .withIndex("by_userId_businessId", (q) =>
            q.eq("userId", user!._id).eq("businessId", user!.businessId!)
          )
          .first();

        if (membership && membership.status === "active") {
          // User has active membership - return profile
          return {
            id: membership._id,
            user_id: user._id,
            business_id: membership.businessId,
            role: membership.role,
            role_permissions: {
              employee: true,
              manager: membership.role === "manager" || membership.role === "owner",
              finance_admin: membership.role === "owner",
            },
            created_at: new Date(membership._creationTime).toISOString(),
            updated_at: membership.updatedAt
              ? new Date(membership.updatedAt).toISOString()
              : new Date(membership._creationTime).toISOString(),
          };
        }

        // User has businessId but no active membership - find any membership
        // (Convex doesn't support .filter() after .withIndex() - use JS find)
        const userMemberships = await ctx.db
          .query("business_memberships")
          .withIndex("by_userId", (q) => q.eq("userId", user!._id))
          .collect();

        const anyMembership = userMemberships.find((m) => m.status === "active");

        if (anyMembership) {
          // Update user's businessId to this membership's business
          await ctx.db.patch(user._id, {
            businessId: anyMembership.businessId,
            updatedAt: Date.now(),
          });

          return {
            id: anyMembership._id,
            user_id: user._id,
            business_id: anyMembership.businessId,
            role: anyMembership.role,
            role_permissions: {
              employee: true,
              manager: anyMembership.role === "manager" || anyMembership.role === "owner",
              finance_admin: anyMembership.role === "owner",
            },
            created_at: new Date(anyMembership._creationTime).toISOString(),
            updated_at: anyMembership.updatedAt
              ? new Date(anyMembership.updatedAt).toISOString()
              : new Date(anyMembership._creationTime).toISOString(),
          };
        }
      } else {
        // User has no businessId - check for any membership
        // (Convex doesn't support .filter() after .withIndex() - use JS find)
        const noBusinessMemberships = await ctx.db
          .query("business_memberships")
          .withIndex("by_userId", (q) => q.eq("userId", user!._id))
          .collect();

        const anyMembership = noBusinessMemberships.find((m) => m.status === "active");

        if (anyMembership) {
          // Link user to this business
          await ctx.db.patch(user._id, {
            businessId: anyMembership.businessId,
            updatedAt: Date.now(),
          });

          return {
            id: anyMembership._id,
            user_id: user._id,
            business_id: anyMembership.businessId,
            role: anyMembership.role,
            role_permissions: {
              employee: true,
              manager: anyMembership.role === "manager" || anyMembership.role === "owner",
              finance_admin: anyMembership.role === "owner",
            },
            created_at: new Date(anyMembership._creationTime).toISOString(),
            updated_at: anyMembership.updatedAt
              ? new Date(anyMembership.updatedAt).toISOString()
              : new Date(anyMembership._creationTime).toISOString(),
          };
        }
      }

      // User exists but has no membership - fall through to create business
    }

    // SCENARIO 2: Check for pending invitation by email
    const existingByEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existingByEmail && existingByEmail.clerkUserId !== args.clerkUserId) {
      // Found user by email with different/no Clerk ID - this is a pending invitation
      // Check if it's a placeholder (pending_ or migrated_ prefix)
      const isPlaceholder =
        existingByEmail.clerkUserId?.startsWith("pending_") ||
        existingByEmail.clerkUserId?.startsWith("migrated_") ||
        !existingByEmail.clerkUserId;

      if (isPlaceholder) {
        // Link Clerk account to existing user
        await ctx.db.patch(existingByEmail._id, {
          clerkUserId: args.clerkUserId,
          fullName: args.fullName || existingByEmail.fullName,
          updatedAt: Date.now(),
        });

        // Check for pending membership
        // (Convex doesn't support .filter() after .withIndex() - use JS find)
        const inviteMemberships = await ctx.db
          .query("business_memberships")
          .withIndex("by_userId", (q) => q.eq("userId", existingByEmail._id))
          .collect();

        const pendingMembership = inviteMemberships.find((m) => m.status === "pending");

        if (pendingMembership) {
          // Activate the pending membership
          await ctx.db.patch(pendingMembership._id, {
            status: "active",
            joinedAt: Date.now(),
            updatedAt: Date.now(),
          });

          // Update user's businessId
          await ctx.db.patch(existingByEmail._id, {
            businessId: pendingMembership.businessId,
            updatedAt: Date.now(),
          });

          return {
            id: pendingMembership._id,
            user_id: existingByEmail._id,
            business_id: pendingMembership.businessId,
            role: pendingMembership.role,
            role_permissions: {
              employee: true,
              manager: pendingMembership.role === "manager" || pendingMembership.role === "owner",
              finance_admin: pendingMembership.role === "owner",
            },
            created_at: new Date(pendingMembership._creationTime).toISOString(),
            updated_at: new Date().toISOString(),
          };
        }

        // Check for active membership
        // (Convex doesn't support .filter() after .withIndex() - use JS find)
        const activeMembership = inviteMemberships.find((m) => m.status === "active");

        if (activeMembership) {
          await ctx.db.patch(existingByEmail._id, {
            businessId: activeMembership.businessId,
            updatedAt: Date.now(),
          });

          return {
            id: activeMembership._id,
            user_id: existingByEmail._id,
            business_id: activeMembership.businessId,
            role: activeMembership.role,
            role_permissions: {
              employee: true,
              manager: activeMembership.role === "manager" || activeMembership.role === "owner",
              finance_admin: activeMembership.role === "owner",
            },
            created_at: new Date(activeMembership._creationTime).toISOString(),
            updated_at: activeMembership.updatedAt
              ? new Date(activeMembership.updatedAt).toISOString()
              : new Date(activeMembership._creationTime).toISOString(),
          };
        }

        // User found by email but has no membership - use this user for business creation
        user = await ctx.db.get(existingByEmail._id);
      }
    }

    // SCENARIO 3: Create new user and business (direct signup)
    if (!user) {
      // Create new user
      const userId = await ctx.db.insert("users", {
        clerkUserId: args.clerkUserId,
        email: args.email,
        fullName: args.fullName,
        homeCurrency: "SGD", // Default for SEA
        updatedAt: Date.now(),
      });
      user = await ctx.db.get(userId);
    }

    if (!user) {
      throw new Error("Failed to create user");
    }

    // Create personal business
    const businessName = args.fullName
      ? `${args.fullName}'s Business`
      : `${args.email.split("@")[0]}'s Business`;

    const businessId = await ctx.db.insert("businesses", {
      name: businessName,
      slug: `${args.email.split("@")[0]}-business-${Date.now()}`,
      countryCode: "SG",
      homeCurrency: "SGD",
      logoFallbackColor: "#3b82f6",
      updatedAt: Date.now(),
    });

    // Create owner membership
    const membershipId = await ctx.db.insert("business_memberships", {
      userId: user._id,
      businessId,
      role: "owner",
      status: "active",
      joinedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update user with businessId
    await ctx.db.patch(user._id, {
      businessId,
      updatedAt: Date.now(),
    });

    return {
      id: membershipId,
      user_id: user._id,
      business_id: businessId,
      role: "owner",
      role_permissions: {
        employee: true,
        manager: true,
        finance_admin: true,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  },
});

/**
 * Update user's full name (finance_admin function)
 * Allows finance_admin/owner to update other users' names in their business
 * Accepts string user IDs (Convex ID or legacy UUID)
 */
export const updateFullNameByAdmin = mutation({
  args: {
    targetUserId: v.string(),
    fullName: v.string(),
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Validate name
    const trimmedName = args.fullName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      throw new Error("Name must be at least 2 characters long");
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

    // Resolve target user
    const targetUser = await resolveById(ctx.db, "users", args.targetUserId);
    if (!targetUser) {
      throw new Error("Target user not found");
    }

    // If updating self, no permission check needed
    if (targetUser._id !== caller._id) {
      // Verify caller has finance_admin/owner permission
      const callerMembership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", caller._id).eq("businessId", business._id)
        )
        .first();

      if (!callerMembership || !["owner", "finance_admin"].includes(callerMembership.role)) {
        throw new Error("Admin permissions required to update other users");
      }

      // Verify target user is in the same business
      const targetMembership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", targetUser._id).eq("businessId", business._id)
        )
        .first();

      if (!targetMembership || targetMembership.status !== "active") {
        throw new Error("Target user not found in this business");
      }
    }

    // Update the user's name
    await ctx.db.patch(targetUser._id, {
      fullName: trimmedName,
      updatedAt: Date.now(),
    });

    return targetUser._id;
  },
});

// ============================================
// INTERNAL MUTATIONS (for webhooks/system use)
// ============================================

/**
 * Internal: Check if user exists by Clerk ID
 * Used by webhook handlers
 */
export const getByClerkIdInternal = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await resolveUserByClerkId(ctx.db, args.clerkUserId);
  },
});

/**
 * Internal: Find pending invitation by email
 * Returns user if found with pending membership (invitation exists)
 *
 * Invitations are tracked via:
 * 1. User with placeholder clerkUserId (pending_* or migrated_*)
 * 2. business_memberships with status="pending"
 */
export const findPendingInvitationByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    // Find user by email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    if (!user) {
      return null;
    }

    // Check if clerkUserId is a placeholder (not yet linked to real Clerk account)
    const isPlaceholder =
      user.clerkUserId?.startsWith("pending_") ||
      user.clerkUserId?.startsWith("migrated_") ||
      !user.clerkUserId?.startsWith("user_");

    if (!isPlaceholder) {
      return null; // User already has a real Clerk account
    }

    // Check for pending membership (invitation)
    // (Convex doesn't support .filter() after .withIndex() - use JS find)
    const userInviteMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const pendingMembership = userInviteMemberships.find((m) => m.status === "pending");

    if (pendingMembership) {
      // Return user with business context from pending membership
      return {
        ...user,
        businessId: pendingMembership.businessId,
        role: pendingMembership.role,
      };
    }

    return null;
  },
});

/**
 * Internal: Link Clerk user to existing invitation
 * Called when invited user signs up
 */
export const linkInvitationToClerk = internalMutation({
  args: {
    userId: v.id("users"),
    clerkUserId: v.string(),
    fullName: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      clerkUserId: args.clerkUserId,
      fullName: args.fullName,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Create employee profile (business membership)
 * Used for invitation-based signups
 */
export const createEmployeeProfileInternal = internalMutation({
  args: {
    userId: v.id("users"),
    businessId: v.id("businesses"),
    role: v.union(
      v.literal("owner"),
      v.literal("finance_admin"),
      v.literal("manager"),
      v.literal("employee")
    ),
  },
  handler: async (ctx, args) => {
    // Check if membership already exists
    const existingMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", args.userId).eq("businessId", args.businessId)
      )
      .first();

    if (existingMembership) {
      // Membership already exists, just ensure it's active
      if (existingMembership.status !== "active") {
        await ctx.db.patch(existingMembership._id, {
          status: "active",
          joinedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      return existingMembership._id;
    }

    // Create new membership
    const membershipId = await ctx.db.insert("business_memberships", {
      userId: args.userId,
      businessId: args.businessId,
      role: args.role,
      status: "active",
      joinedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update user's businessId
    await ctx.db.patch(args.userId, {
      businessId: args.businessId,
      updatedAt: Date.now(),
    });

    return membershipId;
  },
});

/**
 * Internal: Create user and business for direct signup
 * Used when user signs up without invitation
 */
export const createUserWithBusinessInternal = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    fullName: v.string(),
  },
  handler: async (ctx, args) => {
    // Create user
    const userId = await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      email: args.email.toLowerCase(),
      fullName: args.fullName,
      homeCurrency: "SGD", // Default for SEA
      updatedAt: Date.now(),
    });

    // Create personal business
    const businessName = args.fullName
      ? `${args.fullName}'s Business`
      : `${args.email.split("@")[0]}'s Business`;

    const businessId = await ctx.db.insert("businesses", {
      name: businessName,
      slug: `${args.email.split("@")[0]}-business-${Date.now()}`,
      countryCode: "SG",
      homeCurrency: "SGD",
      logoFallbackColor: "#3b82f6",
      updatedAt: Date.now(),
    });

    // Create owner membership
    await ctx.db.insert("business_memberships", {
      userId,
      businessId,
      role: "owner",
      status: "active",
      joinedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update user with businessId
    await ctx.db.patch(userId, {
      businessId,
      updatedAt: Date.now(),
    });

    return { userId, businessId };
  },
});

/**
 * Internal: Update user profile (for user.updated webhook)
 */
export const updateUserInternal = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    fullName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await resolveUserByClerkId(ctx.db, args.clerkUserId);
    if (!user) {
      return null;
    }

    await ctx.db.patch(user._id, {
      email: args.email.toLowerCase(),
      fullName: args.fullName,
      updatedAt: Date.now(),
    });

    return user._id;
  },
});

/**
 * Internal: Soft delete user (for user.deleted webhook)
 * Anonymizes data while preserving foreign key integrity
 */
export const softDeleteUser = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveUserByClerkId(ctx.db, args.clerkUserId);
    if (!user) {
      return; // Already deleted
    }

    // Soft delete by clearing Clerk ID and anonymizing data
    await ctx.db.patch(user._id, {
      clerkUserId: undefined,
      email: `deleted_${args.clerkUserId}@deleted.local`,
      fullName: "Deleted User",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Delete user (hard delete - called from Clerk webhook on user deletion)
 */
export const deleteUser = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveUserByClerkId(ctx.db, args.clerkUserId);
    if (!user) {
      return; // Already deleted
    }

    // Delete all memberships
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const membership of memberships) {
      await ctx.db.delete(membership._id);
    }

    // Delete user
    await ctx.db.delete(user._id);
  },
});

/**
 * DEBUG: List all users (no auth - for debugging only)
 * Use this to debug data during migration
 */
export const listAll = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const users = await ctx.db
      .query("users")
      .order("desc")
      .take(limit);

    // Return simplified data for debugging
    return users.map((u) => ({
      _id: u._id,
      clerkUserId: u.clerkUserId,
      email: u.email,
      businessId: u.businessId,
    }));
  },
});

/**
 * Accept invitation for a new user
 * Links Clerk account to invitation placeholder and activates membership
 * 
 * FLOW: New user accepts invitation via email link
 * 1. Find placeholder user by email
 * 2. Update with Clerk ID and set active business
 * 3. Activate the pending membership
 * 4. Return membership profile
 */
export const acceptInvitation = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    // Find the placeholder user by email (created when invitation was sent)
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    if (!user) {
      throw new Error("Invitation not found - user record missing");
    }

    // Check if this user already has a Clerk ID (already linked)
    if (user.clerkUserId && !user.clerkUserId.startsWith("pending_")) {
      // User already linked - just return profile
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", args.businessId)
        )
        .first();

      if (!membership) {
        throw new Error("Membership not found");
      }

      return {
        id: membership._id,
        user_id: user._id,
        business_id: membership.businessId,
        role: membership.role,
        role_permissions: {
          employee: true,
          manager: membership.role === "manager" || membership.role === "owner",
          finance_admin: membership.role === "owner",
        },
        created_at: new Date(membership._creationTime).toISOString(),
        updated_at: membership.updatedAt
          ? new Date(membership.updatedAt).toISOString()
          : new Date(membership._creationTime).toISOString(),
      };
    }

    // Find the pending membership for this user and business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership) {
      throw new Error("Invitation membership not found");
    }

    // Update user with Clerk ID and set active business
    await ctx.db.patch(user._id, {
      clerkUserId: args.clerkUserId,
      businessId: args.businessId,
      fullName: args.fullName || user.fullName,
      updatedAt: Date.now(),
    });

    // Activate the membership
    await ctx.db.patch(membership._id, {
      status: "active",
      joinedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      id: membership._id,
      user_id: user._id,
      business_id: membership.businessId,
      role: membership.role,
      role_permissions: {
        employee: true,
        manager: membership.role === "manager" || membership.role === "owner",
        finance_admin: membership.role === "owner",
      },
      created_at: new Date(membership._creationTime).toISOString(),
      updated_at: new Date().toISOString(),
    };
  },
});
