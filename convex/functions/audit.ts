/**
 * Audit Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Audit event logging for compliance (SOC2, GDPR)
 * - Multi-tenant isolation with business context
 * - Query filtering and pagination
 *
 * Tracks: permission changes, data access, deletions, sensitive operations
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// ============================================
// QUERIES
// ============================================

/**
 * List audit events with filtering and pagination
 * Enforces multi-tenant isolation with businessId
 */
export const list = query({
  args: {
    businessId: v.string(), // Accepts Convex ID or legacy UUID
    eventType: v.optional(v.string()),
    targetEntityType: v.optional(v.string()),
    targetEntityId: v.optional(v.string()),
    actorUserId: v.optional(v.string()), // Accepts Convex ID or legacy UUID
    dateFrom: v.optional(v.number()),      // Unix timestamp
    dateTo: v.optional(v.number()),        // Unix timestamp
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { events: [], nextCursor: null, totalCount: 0 };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { events: [], nextCursor: null, totalCount: 0 };
    }

    // Resolve businessId (supports both Convex ID and legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { events: [], nextCursor: null, totalCount: 0 };
    }

    // Verify membership with admin access for audit logs
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { events: [], nextCursor: null, totalCount: 0 };
    }

    // Only admins/owners can view audit logs
    if (!["owner", "admin"].includes(membership.role)) {
      return { events: [], nextCursor: null, totalCount: 0 };
    }

    const limit = args.limit ?? 100;

    // Query audit events for this business
    let events = await ctx.db
      .query("audit_events")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Apply filters
    if (args.eventType) {
      events = events.filter((e) => e.eventType === args.eventType);
    }
    if (args.targetEntityType) {
      events = events.filter((e) => e.targetEntityType === args.targetEntityType);
    }
    if (args.targetEntityId) {
      events = events.filter((e) => e.targetEntityId === args.targetEntityId);
    }
    if (args.actorUserId) {
      // Resolve actor user ID (supports both Convex ID and legacy UUID)
      const actorUser = await resolveById(ctx.db, "users", args.actorUserId);
      if (actorUser) {
        events = events.filter((e) => e.actorUserId === actorUser._id);
      }
    }
    if (args.dateFrom) {
      events = events.filter((e) => e._creationTime >= args.dateFrom!);
    }
    if (args.dateTo) {
      events = events.filter((e) => e._creationTime <= args.dateTo!);
    }

    // Sort by creation time (newest first)
    events.sort((a, b) => b._creationTime - a._creationTime);

    // Get total count before pagination
    const totalCount = events.length;

    // Pagination
    const startIndex = args.cursor ? parseInt(args.cursor, 10) : 0;
    const paginatedEvents = events.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < events.length ? String(startIndex + limit) : null;

    // Fetch actor user details for each event
    const eventsWithActor = await Promise.all(
      paginatedEvents.map(async (event) => {
        const actor = await ctx.db.get(event.actorUserId);
        return {
          ...event,
          actorUser: actor
            ? {
                id: actor._id,
                fullName: actor.fullName || "",
                email: actor.email,
              }
            : null,
        };
      })
    );

    return {
      events: eventsWithActor,
      nextCursor,
      totalCount,
    };
  },
});

/**
 * Get single audit event by ID
 */
export const getById = query({
  args: {
    id: v.id("audit_events"),
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

    const event = await ctx.db.get(args.id);
    if (!event) {
      return null;
    }

    // Verify user has access to this business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", event.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    // Only admins/owners can view audit logs
    if (!["owner", "admin"].includes(membership.role)) {
      return null;
    }

    // Fetch actor details
    const actor = await ctx.db.get(event.actorUserId);

    return {
      ...event,
      actorUser: actor
        ? {
            id: actor._id,
            fullName: actor.fullName || "",
            email: actor.email,
          }
        : null,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new audit event
 * Automatically captures business context and actor information
 */
export const create = mutation({
  args: {
    businessId: v.string(), // Accepts Convex ID or legacy UUID
    eventType: v.string(),
    targetEntityType: v.string(),
    targetEntityId: v.string(),
    details: v.optional(v.any()),
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

    // Resolve businessId (supports both Convex ID and legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Verify user belongs to this business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Create the audit event
    const eventId = await ctx.db.insert("audit_events", {
      businessId: business._id,
      actorUserId: user._id,
      eventType: args.eventType,
      targetEntityType: args.targetEntityType,
      targetEntityId: args.targetEntityId,
      details: args.details,
    });

    return eventId;
  },
});

/**
 * Internal mutation for creating audit events (no auth check)
 * Used by other mutations to log their actions
 */
export const logEvent = mutation({
  args: {
    businessId: v.string(), // Accepts Convex ID or legacy UUID
    actorUserId: v.string(), // Accepts Convex ID or legacy UUID
    eventType: v.string(),
    targetEntityType: v.string(),
    targetEntityId: v.string(),
    details: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Resolve businessId (supports both Convex ID and legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Resolve actorUserId (supports both Convex ID and legacy UUID)
    const actorUser = await resolveById(ctx.db, "users", args.actorUserId);
    if (!actorUser) {
      throw new Error("Actor user not found");
    }

    // Direct insert without auth check - caller is responsible
    const eventId = await ctx.db.insert("audit_events", {
      businessId: business._id,
      actorUserId: actorUser._id,
      eventType: args.eventType,
      targetEntityType: args.targetEntityType,
      targetEntityId: args.targetEntityId,
      details: args.details,
    });

    return eventId;
  },
});
