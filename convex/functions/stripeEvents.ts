/**
 * Stripe Events Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Stripe webhook event storage and idempotency
 * - Event processing tracking
 * - Error logging for failed webhook processing
 *
 * Note: These functions are primarily used by internal webhook handlers,
 * so some don't require user authentication.
 */

import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";

// ============================================
// WEBHOOK QUERIES (for webhook handlers - no user auth required)
// Security: Stripe signature verification done in API route
// ============================================

/**
 * Check if a Stripe event has already been processed (idempotency check)
 * Used by webhook handlers to avoid duplicate processing
 *
 * Note: No user authentication required since webhooks from Stripe
 * authenticate via signature verification, not Clerk sessions.
 */
export const getByStripeEventId = query({
  args: { stripeEventId: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("stripe_events")
      .withIndex("by_stripeEventId", (q) =>
        q.eq("stripeEventId", args.stripeEventId)
      )
      .first();

    return event;
  },
});

/**
 * Check if event exists (simple boolean check)
 * Used by webhook handler for idempotency check
 */
export const exists = query({
  args: { stripeEventId: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("stripe_events")
      .withIndex("by_stripeEventId", (q) =>
        q.eq("stripeEventId", args.stripeEventId)
      )
      .first();

    return !!event;
  },
});

// ============================================
// WEBHOOK MUTATIONS (for webhook handlers - no user auth required)
// Security: Stripe signature verification done in API route
// ============================================

/**
 * Store a new Stripe event
 * Called at the start of webhook processing
 */
export const create = mutation({
  args: {
    stripeEventId: v.string(),
    eventType: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    // Check for duplicate
    const existing = await ctx.db
      .query("stripe_events")
      .withIndex("by_stripeEventId", (q) =>
        q.eq("stripeEventId", args.stripeEventId)
      )
      .first();

    if (existing) {
      // Event already exists, return existing ID
      return existing._id;
    }

    const eventId = await ctx.db.insert("stripe_events", {
      stripeEventId: args.stripeEventId,
      eventType: args.eventType,
      payload: args.payload,
    });

    return eventId;
  },
});

/**
 * Mark event as successfully processed
 */
export const markProcessed = mutation({
  args: { stripeEventId: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("stripe_events")
      .withIndex("by_stripeEventId", (q) =>
        q.eq("stripeEventId", args.stripeEventId)
      )
      .first();

    if (!event) {
      throw new Error("Event not found");
    }

    await ctx.db.patch(event._id, {
      processedAt: Date.now(),
      processingError: undefined, // Clear any previous error
    });

    return event._id;
  },
});

/**
 * Mark event as failed with error message
 */
export const markFailed = mutation({
  args: {
    stripeEventId: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("stripe_events")
      .withIndex("by_stripeEventId", (q) =>
        q.eq("stripeEventId", args.stripeEventId)
      )
      .first();

    if (!event) {
      throw new Error("Event not found");
    }

    await ctx.db.patch(event._id, {
      processingError: args.error,
    });

    return event._id;
  },
});

// ============================================
// ADMIN QUERIES (require authentication)
// ============================================

/**
 * List recent Stripe events for finance_admin dashboard
 * Only owners/finance_admins of any business can view
 */
export const listRecent = query({
  args: {
    eventType: v.optional(v.string()),
    limit: v.optional(v.number()),
    showErrorsOnly: v.optional(v.boolean()),
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

    // Verify user is an owner or finance_admin of at least one business
    // (Convex doesn't support .filter() after .withIndex() - use JS find)
    const allMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const finance_adminMembership = allMemberships.find(
      (m) => m.status === "active" && (m.role === "owner" || m.role === "finance_admin")
    );

    if (!finance_adminMembership) {
      return [];
    }

    const limit = args.limit ?? 50;

    let events;
    if (args.eventType) {
      events = await ctx.db
        .query("stripe_events")
        .withIndex("by_eventType", (q) => q.eq("eventType", args.eventType!))
        .collect();
    } else {
      events = await ctx.db.query("stripe_events").collect();
    }

    // Filter errors only if requested
    if (args.showErrorsOnly) {
      events = events.filter((e) => e.processingError);
    }

    // Sort by creation time (newest first)
    events.sort((a, b) => b._creationTime - a._creationTime);

    // Apply limit and exclude full payload for list view
    return events.slice(0, limit).map((e) => ({
      _id: e._id,
      _creationTime: e._creationTime,
      stripeEventId: e.stripeEventId,
      eventType: e.eventType,
      processedAt: e.processedAt,
      processingError: e.processingError,
      // Omit full payload for performance
    }));
  },
});

/**
 * Get full event details including payload
 * For debugging specific events
 */
export const getFullEvent = query({
  args: { stripeEventId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Verify finance_admin access
    // (Convex doesn't support .filter() after .withIndex() - use JS find)
    const userMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const membership = userMemberships.find(
      (m) => m.status === "active" && (m.role === "owner" || m.role === "finance_admin")
    );

    if (!membership) {
      return null;
    }

    const event = await ctx.db
      .query("stripe_events")
      .withIndex("by_stripeEventId", (q) =>
        q.eq("stripeEventId", args.stripeEventId)
      )
      .first();

    return event;
  },
});

/**
 * Get event processing statistics
 */
export const getStats = query({
  args: {
    since: v.optional(v.number()), // Timestamp to filter from
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Verify finance_admin access
    // (Convex doesn't support .filter() after .withIndex() - use JS find)
    const statsMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const membership = statsMemberships.find(
      (m) => m.status === "active" && (m.role === "owner" || m.role === "finance_admin")
    );

    if (!membership) {
      return null;
    }

    let events = await ctx.db.query("stripe_events").collect();

    // Filter by timestamp if provided
    if (args.since) {
      events = events.filter((e) => e._creationTime >= args.since!);
    }

    // Calculate statistics
    const total = events.length;
    const processed = events.filter((e) => e.processedAt).length;
    const failed = events.filter((e) => e.processingError).length;
    const pending = total - processed - failed;

    // Event type breakdown
    const byType: Record<string, number> = {};
    for (const event of events) {
      byType[event.eventType] = (byType[event.eventType] || 0) + 1;
    }

    return {
      total,
      processed,
      failed,
      pending,
      byType,
    };
  },
});

// ============================================
// ADMIN MUTATIONS
// ============================================

/**
 * Retry processing a failed event
 * Clears the error so it can be reprocessed
 */
export const clearError = mutation({
  args: { stripeEventId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Verify finance_admin access
    // (Convex doesn't support .filter() after .withIndex() - use JS find)
    const clearMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const membership = clearMemberships.find(
      (m) => m.status === "active" && m.role === "owner"
    );

    if (!membership) {
      throw new Error("Only owners can retry failed events");
    }

    const event = await ctx.db
      .query("stripe_events")
      .withIndex("by_stripeEventId", (q) =>
        q.eq("stripeEventId", args.stripeEventId)
      )
      .first();

    if (!event) {
      throw new Error("Event not found");
    }

    await ctx.db.patch(event._id, {
      processingError: undefined,
      processedAt: undefined,
    });

    return event._id;
  },
});
