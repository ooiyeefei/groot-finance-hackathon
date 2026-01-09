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
    // Note: Cast to Function to avoid "Type instantiation is excessively deep" error
    const existingUser = await (ctx.runMutation as Function)(
      internal.functions.users.getByClerkIdInternal,
      { clerkUserId: args.clerkUserId }
    ) as Doc<"users"> | null;

    if (existingUser) {
      console.log(`[Webhook Action] User already exists with Clerk ID: ${args.clerkUserId}`);
      return { success: true, action: "already_exists", userId: existingUser._id };
    }

    // Check for pending invitation
    const pendingInvitation = await (ctx.runMutation as Function)(
      internal.functions.users.findPendingInvitationByEmail,
      { email: email }
    ) as (Doc<"users"> & { role?: string }) | null;

    if (pendingInvitation) {
      console.log(`[Webhook Action] Found pending invitation for ${email}`);

      // Link invitation to Clerk user
      await (ctx.runMutation as Function)(internal.functions.users.linkInvitationToClerk, {
        userId: pendingInvitation._id,
        clerkUserId: args.clerkUserId,
        fullName: args.fullName,
      });

      // Create employee profile if business exists
      if (pendingInvitation.businessId) {
        await (ctx.runMutation as Function)(internal.functions.users.createEmployeeProfileInternal, {
          userId: pendingInvitation._id,
          businessId: pendingInvitation.businessId,
          role: pendingInvitation.role || "employee",
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

    const result = await (ctx.runMutation as Function)(
      internal.functions.users.createUserWithBusinessInternal,
      { clerkUserId: args.clerkUserId, email: email, fullName: args.fullName }
    ) as { userId: Id<"users">; businessId: Id<"businesses"> };

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

    const userId = await (ctx.runMutation as Function)(
      internal.functions.users.updateUserInternal,
      { clerkUserId: args.clerkUserId, email: args.email.toLowerCase(), fullName: args.fullName }
    ) as Id<"users"> | null;

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

    await (ctx.runMutation as Function)(internal.functions.users.softDeleteUser, {
      clerkUserId: args.clerkUserId,
    });

    console.log(`[Webhook Action] Successfully soft-deleted user: ${args.clerkUserId}`);
    return { success: true };
  },
});
