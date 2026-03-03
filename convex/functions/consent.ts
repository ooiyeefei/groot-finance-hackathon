/**
 * Consent Convex Functions
 *
 * Queries and mutations for PDPA consent records.
 * Consent records are append-only — never deleted.
 * Revocation adds a timestamp to the existing record.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { getAuthenticatedUser } from "../lib/resolvers";

// ============================================
// VALIDATORS
// ============================================

const policyTypeValidator = v.union(
  v.literal("privacy_policy"),
  v.literal("terms_of_service")
);

const sourceValidator = v.union(
  v.literal("onboarding"),
  v.literal("invitation"),
  v.literal("banner"),
  v.literal("settings")
);

// ============================================
// QUERIES
// ============================================

/**
 * Check if the authenticated user has valid (non-revoked) consent
 * for a given policy type and version.
 */
export const hasAcceptedCurrentPolicy = query({
  args: {
    policyType: policyTypeValidator,
    policyVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      return { hasConsent: false };
    }

    const record = await ctx.db
      .query("consent_records")
      .withIndex("by_userId_policyType_policyVersion", (q) =>
        q
          .eq("userId", user._id)
          .eq("policyType", args.policyType)
          .eq("policyVersion", args.policyVersion)
      )
      .order("desc")
      .first();

    if (!record || record.revokedAt) {
      return { hasConsent: false };
    }

    return {
      hasConsent: true,
      record: {
        acceptedAt: record.acceptedAt,
        source: record.source,
        policyVersion: record.policyVersion,
      },
    };
  },
});

/**
 * Get all consent records for the authenticated user.
 */
export const getConsentHistory = query({
  args: {
    policyType: v.optional(policyTypeValidator),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      return { records: [] };
    }

    let q;
    if (args.policyType) {
      q = ctx.db
        .query("consent_records")
        .withIndex("by_userId_policyType", (q) =>
          q.eq("userId", user._id).eq("policyType", args.policyType!)
        );
    } else {
      q = ctx.db
        .query("consent_records")
        .withIndex("by_userId", (q) => q.eq("userId", user._id));
    }

    const records = await q.order("desc").collect();

    return {
      records: records.map((r) => ({
        policyType: r.policyType,
        policyVersion: r.policyVersion,
        acceptedAt: r.acceptedAt,
        source: r.source,
        revokedAt: r.revokedAt,
      })),
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Record a new consent action. Idempotent — if user already has
 * active consent for the same type+version, returns existing record ID.
 */
export const recordConsent = mutation({
  args: {
    policyType: policyTypeValidator,
    policyVersion: v.string(),
    source: sourceValidator,
    businessId: v.optional(v.id("businesses")),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Idempotency check: if active consent exists, return it
    const existing = await ctx.db
      .query("consent_records")
      .withIndex("by_userId_policyType_policyVersion", (q) =>
        q
          .eq("userId", user._id)
          .eq("policyType", args.policyType)
          .eq("policyVersion", args.policyVersion)
      )
      .order("desc")
      .first();

    if (existing && !existing.revokedAt) {
      return { success: true, consentRecordId: existing._id };
    }

    // Create new consent record
    const consentRecordId = await ctx.db.insert("consent_records", {
      userId: user._id,
      businessId: args.businessId,
      policyType: args.policyType,
      policyVersion: args.policyVersion,
      acceptedAt: Date.now(),
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      source: args.source,
    });

    return { success: true, consentRecordId };
  },
});

/**
 * Revoke an active consent record by adding a revokedAt timestamp.
 */
export const revokeConsent = mutation({
  args: {
    policyType: policyTypeValidator,
    policyVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const record = await ctx.db
      .query("consent_records")
      .withIndex("by_userId_policyType_policyVersion", (q) =>
        q
          .eq("userId", user._id)
          .eq("policyType", args.policyType)
          .eq("policyVersion", args.policyVersion)
      )
      .order("desc")
      .first();

    if (!record || record.revokedAt) {
      throw new Error("No active consent record found to revoke");
    }

    await ctx.db.patch(record._id, {
      revokedAt: Date.now(),
    });

    return { success: true, revokedRecordId: record._id };
  },
});
