/**
 * Stripe Integration Functions — connection metadata management
 *
 * Queries and mutations for managing Stripe integration status.
 * The Stripe secret key is stored in AWS SSM Parameter Store (not in Convex).
 * Connect/disconnect/sync operations happen via Next.js API routes which
 * call these mutations to update metadata.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";

// ============================================
// HELPER: Role check (reused across functions)
// ============================================
async function requireRole(
  ctx: {
    db: import("../_generated/server").DatabaseReader;
    auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
  },
  businessId: import("../_generated/dataModel").Id<"businesses">,
  allowedRoles: string[]
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await resolveUserByClerkId(ctx.db, identity.subject);
  if (!user) throw new Error("User not found");

  const membership = await ctx.db
    .query("business_memberships")
    .withIndex("by_userId_businessId", (q) =>
      q.eq("userId", user._id).eq("businessId", businessId)
    )
    .first();

  if (!membership || membership.status !== "active") {
    throw new Error("Not a member of this business");
  }

  if (!allowedRoles.includes(membership.role)) {
    throw new Error(`Not authorized: requires ${allowedRoles.join(" or ")} role`);
  }

  return { user, membership, clerkId: identity.subject };
}

// ============================================
// PUBLIC QUERIES
// ============================================

/**
 * Get Stripe connection status for a business
 */
export const getConnection = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.businessId, ["owner", "finance_admin", "manager"]);

    const integration = await ctx.db
      .query("stripe_integrations")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .first();

    if (!integration) return null;

    return {
      status: integration.status as "connected" | "disconnected",
      stripeAccountName: integration.stripeAccountName,
      stripeAccountId: integration.stripeAccountId,
      connectedAt: integration.connectedAt,
      lastSyncAt: integration.lastSyncAt,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Update connection metadata after API route stores key in SSM.
 * Called by POST /api/v1/stripe-integration/connect
 */
export const updateConnection = mutation({
  args: {
    businessId: v.id("businesses"),
    stripeAccountId: v.string(),
    stripeAccountName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireRole(ctx, args.businessId, ["owner"]);

    const existing = await ctx.db
      .query("stripe_integrations")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        stripeAccountId: args.stripeAccountId,
        stripeAccountName: args.stripeAccountName,
        status: "connected",
        connectedAt: now,
        disconnectedAt: undefined,
      });
    } else {
      await ctx.db.insert("stripe_integrations", {
        businessId: args.businessId,
        stripeAccountId: args.stripeAccountId,
        stripeAccountName: args.stripeAccountName,
        status: "connected",
        connectedAt: now,
        createdBy: clerkId,
      });
    }
  },
});

/**
 * Disconnect Stripe integration — preserves synced catalog items.
 * Key deletion from SSM happens in the API route before this mutation.
 */
export const disconnect = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.businessId, ["owner"]);

    const integration = await ctx.db
      .query("stripe_integrations")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .first();

    if (!integration) {
      throw new Error("No Stripe integration found for this business");
    }

    await ctx.db.patch(integration._id, {
      status: "disconnected",
      disconnectedAt: Date.now(),
    });
  },
});

/**
 * Update lastSyncAt timestamp on integration record.
 * Called by the sync API route after completing a sync.
 */
export const updateLastSync = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.businessId, ["owner", "finance_admin", "manager"]);

    const integration = await ctx.db
      .query("stripe_integrations")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .first();

    if (integration) {
      await ctx.db.patch(integration._id, {
        lastSyncAt: Date.now(),
      });
    }
  },
});
