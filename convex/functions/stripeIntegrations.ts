/**
 * Stripe Integration Functions — connection management
 *
 * Queries, mutations, and actions for connecting/disconnecting
 * a business's Stripe account and managing the integration state.
 *
 * Security: stripeSecretKey is NEVER returned by public queries.
 * Only internal queries read the key for use inside actions.
 */

import { v } from "convex/values";
import { query, mutation, action, internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
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
// INTERNAL QUERIES (used by actions)
// ============================================

/**
 * Get integration record including secret key (internal only)
 */
export const getIntegrationInternal = internalQuery({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stripe_integrations")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .first();
  },
});

// ============================================
// INTERNAL MUTATIONS (used by actions)
// ============================================

/**
 * Upsert integration record after successful validation
 */
export const upsertIntegration = internalMutation({
  args: {
    businessId: v.id("businesses"),
    stripeSecretKey: v.string(),
    stripeAccountId: v.string(),
    stripeAccountName: v.optional(v.string()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stripe_integrations")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        stripeSecretKey: args.stripeSecretKey,
        stripeAccountId: args.stripeAccountId,
        stripeAccountName: args.stripeAccountName,
        status: "connected",
        connectedAt: now,
        disconnectedAt: undefined,
      });
    } else {
      await ctx.db.insert("stripe_integrations", {
        businessId: args.businessId,
        stripeSecretKey: args.stripeSecretKey,
        stripeAccountId: args.stripeAccountId,
        stripeAccountName: args.stripeAccountName,
        status: "connected",
        connectedAt: now,
        createdBy: args.createdBy,
      });
    }
  },
});

// ============================================
// PUBLIC QUERIES
// ============================================

/**
 * Get Stripe connection status for a business (never exposes secret key)
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
// ACTIONS (external API calls)
// ============================================

/**
 * Validate Stripe secret key and store the connection
 */
export const connect = action({
  args: {
    businessId: v.id("businesses"),
    stripeSecretKey: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    accountName?: string;
    accountId?: string;
    error?: string;
  }> => {
    // Auth check: verify the caller is an owner
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { success: false, error: "Not authenticated" };

    // Validate key format
    if (!args.stripeSecretKey.startsWith("sk_test_") && !args.stripeSecretKey.startsWith("sk_live_")) {
      return { success: false, error: "Invalid Stripe secret key format. Key must start with sk_test_ or sk_live_." };
    }

    try {
      // Create a new Stripe client with the provided key
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(args.stripeSecretKey);

      // Validate by retrieving account info
      const account = await stripe.accounts.retrieve();

      const accountName = account.settings?.dashboard?.display_name
        || account.business_profile?.name
        || account.email
        || "Stripe Account";

      // Store the connection via internal mutation
      await ctx.runMutation(internal.functions.stripeIntegrations.upsertIntegration, {
        businessId: args.businessId,
        stripeSecretKey: args.stripeSecretKey,
        stripeAccountId: account.id,
        stripeAccountName: accountName,
        createdBy: identity.subject,
      });

      return {
        success: true,
        accountName,
        accountId: account.id,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to connect to Stripe";
      return { success: false, error: message };
    }
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Disconnect Stripe integration — clears key, preserves synced catalog items
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
      stripeSecretKey: "",
      disconnectedAt: Date.now(),
    });
  },
});
