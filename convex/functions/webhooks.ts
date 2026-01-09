/**
 * Webhook Actions - Convex actions for Clerk webhook handling
 *
 * These actions are called from the webhook API route and delegate
 * to internal mutations for database operations.
 *
 * Actions can:
 * 1. Call internal mutations (which bypass auth)
 * 2. Be invoked from outside Convex
 */

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id, Doc } from "../_generated/dataModel";

// ============================================
// RETURN TYPES
// ============================================

type WebhookUserCreatedResult =
  | { success: true; action: "already_exists"; userId: Id<"users"> }
  | { success: true; action: "invitation_linked"; userId: Id<"users">; businessId?: Id<"businesses"> }
  | { success: true; action: "user_created"; userId: Id<"users">; businessId: Id<"businesses"> };

type WebhookUserUpdatedResult =
  | { success: true; userId: Id<"users"> }
  | { success: false; error: string };

type WebhookUserDeletedResult = { success: true };

// ============================================
// ACTIONS
// ============================================

/**
 * Handle Clerk user.created event
 *
 * Two scenarios:
 * 1. Invitation-based: Links Clerk user to existing invitation
 * 2. Direct signup: Creates new business and user profile
 */
export const handleUserCreated = action({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    fullName: v.string(),
  },
  handler: async (ctx, args): Promise<WebhookUserCreatedResult> => {
    const email = args.email.toLowerCase();

    console.log(`[Webhook Action] Processing user.created for Clerk ID: ${args.clerkUserId}`);

    // Check if user already exists by Clerk ID
    // @ts-ignore - Convex internal API types cause "Type instantiation is excessively deep" error
    const getByClerkIdFn = internal.functions.users.getByClerkIdInternal;
    const existingUser: Doc<"users"> | null = await ctx.runMutation(getByClerkIdFn, {
      clerkUserId: args.clerkUserId,
    });

    if (existingUser) {
      console.log(`[Webhook Action] User already exists with Clerk ID: ${args.clerkUserId}`);
      return { success: true, action: "already_exists", userId: existingUser._id };
    }

    // Check for pending invitation
    // @ts-ignore - Convex internal API types cause deep type error
    const findPendingInvitationFn = internal.functions.users.findPendingInvitationByEmail;
    const pendingInvitation: (Doc<"users"> & { role?: string }) | null = await ctx.runMutation(
      findPendingInvitationFn,
      { email: email }
    );

    if (pendingInvitation) {
      console.log(`[Webhook Action] Found pending invitation for ${email}`);

      // Link invitation to Clerk user
      // @ts-ignore - Convex internal API types cause deep type error
      const linkInvitationFn = internal.functions.users.linkInvitationToClerk;
      await ctx.runMutation(linkInvitationFn, {
        userId: pendingInvitation._id,
        clerkUserId: args.clerkUserId,
        fullName: args.fullName,
      });

      // Create employee profile if business exists
      if (pendingInvitation.businessId) {
        // @ts-ignore - Convex internal API types cause deep type error
        const createEmployeeProfileFn = internal.functions.users.createEmployeeProfileInternal;
        await ctx.runMutation(createEmployeeProfileFn, {
          userId: pendingInvitation._id,
          businessId: pendingInvitation.businessId,
          role: (pendingInvitation.role || "employee") as "admin" | "manager" | "employee" | "owner",
        });
      }

      console.log(`[Webhook Action] Successfully linked invitation for ${email}`);
      return {
        success: true,
        action: "invitation_linked",
        userId: pendingInvitation._id,
        businessId: pendingInvitation.businessId,
      };
    }

    // Direct signup - create new user with business
    console.log(`[Webhook Action] Creating new user from direct signup: ${email}`);

    // @ts-ignore - Convex internal API types cause deep type error
    const createUserWithBusinessFn = internal.functions.users.createUserWithBusinessInternal;
    const result: { userId: Id<"users">; businessId: Id<"businesses"> } = await ctx.runMutation(
      createUserWithBusinessFn,
      { clerkUserId: args.clerkUserId, email: email, fullName: args.fullName }
    );

    console.log(`[Webhook Action] Created user ${result.userId} with business ${result.businessId}`);
    return {
      success: true,
      action: "user_created",
      userId: result.userId,
      businessId: result.businessId,
    };
  },
});

/**
 * Handle Clerk user.updated event
 * Syncs name and email changes from Clerk
 */
export const handleUserUpdated = action({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    fullName: v.string(),
  },
  handler: async (ctx, args): Promise<WebhookUserUpdatedResult> => {
    console.log(`[Webhook Action] Processing user.updated for Clerk ID: ${args.clerkUserId}`);

    // @ts-ignore - Convex internal API types cause deep type error
    const updateUserFn = internal.functions.users.updateUserInternal;
    const userId: Id<"users"> | null = await ctx.runMutation(
      updateUserFn,
      { clerkUserId: args.clerkUserId, email: args.email.toLowerCase(), fullName: args.fullName }
    );

    if (!userId) {
      console.log(`[Webhook Action] User not found for update: ${args.clerkUserId}`);
      return { success: false, error: "User not found" };
    }

    console.log(`[Webhook Action] Successfully updated user: ${userId}`);
    return { success: true, userId };
  },
});

/**
 * Handle Clerk user.deleted event
 * Soft deletes user by anonymizing data
 */
export const handleUserDeleted = action({
  args: {
    clerkUserId: v.string(),
  },
  handler: async (ctx, args): Promise<WebhookUserDeletedResult> => {
    console.log(`[Webhook Action] Processing user.deleted for Clerk ID: ${args.clerkUserId}`);

    // @ts-ignore - Convex internal API types cause deep type error
    const softDeleteUserFn = internal.functions.users.softDeleteUser;
    await ctx.runMutation(softDeleteUserFn, {
      clerkUserId: args.clerkUserId,
    });

    console.log(`[Webhook Action] Successfully soft-deleted user: ${args.clerkUserId}`);
    return { success: true };
  },
});
