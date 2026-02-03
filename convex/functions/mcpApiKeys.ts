/**
 * MCP API Keys - Convex Functions
 *
 * Handles API key validation, rate limiting, and key management
 * for the Category 3 MCP Server.
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Rate limit window in milliseconds (1 minute)
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

/**
 * Validate an API key and return associated business context
 * Called on every MCP request for immediate revocation support
 */
export const validateApiKey = query({
  args: {
    keyPrefix: v.string(),
    keyHash: v.string(),
  },
  handler: async (ctx, args) => {
    // Find key by prefix (fast index lookup)
    const apiKey = await ctx.db
      .query("mcp_api_keys")
      .withIndex("by_keyPrefix", (q) => q.eq("keyPrefix", args.keyPrefix))
      .first();

    if (!apiKey) {
      return { valid: false, error: "API_KEY_NOT_FOUND" };
    }

    // Check if revoked
    if (apiKey.revokedAt) {
      return { valid: false, error: "API_KEY_REVOKED" };
    }

    // Check if expired
    if (apiKey.expiresAt && apiKey.expiresAt < Date.now()) {
      return { valid: false, error: "API_KEY_EXPIRED" };
    }

    // Verify hash matches (bcrypt comparison done client-side for security)
    // The Lambda will compare the provided hash with the stored hash
    if (apiKey.key !== args.keyHash) {
      return { valid: false, error: "API_KEY_INVALID" };
    }

    // Get business info
    const business = await ctx.db.get(apiKey.businessId);
    if (!business) {
      return { valid: false, error: "BUSINESS_NOT_FOUND" };
    }

    return {
      valid: true,
      apiKeyId: apiKey._id,
      businessId: apiKey.businessId,
      businessName: business.name,
      permissions: apiKey.permissions,
      rateLimitPerMinute: apiKey.rateLimitPerMinute,
      keyPrefix: apiKey.keyPrefix,
    };
  },
});

/**
 * Check and increment rate limit for an API key
 * Uses sliding window counter pattern
 */
export const checkRateLimit = mutation({
  args: {
    apiKeyId: v.id("mcp_api_keys"),
    rateLimitPerMinute: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    // Get current rate limit record
    const rateLimit = await ctx.db
      .query("mcp_rate_limits")
      .withIndex("by_apiKeyId", (q) => q.eq("apiKeyId", args.apiKeyId))
      .first();

    if (!rateLimit) {
      // First request - create new rate limit record
      await ctx.db.insert("mcp_rate_limits", {
        apiKeyId: args.apiKeyId,
        windowStart: now,
        requestCount: 1,
      });
      return { allowed: true, remaining: args.rateLimitPerMinute - 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    }

    // Check if window has expired
    if (rateLimit.windowStart < windowStart) {
      // Reset window
      await ctx.db.patch(rateLimit._id, {
        windowStart: now,
        requestCount: 1,
      });
      return { allowed: true, remaining: args.rateLimitPerMinute - 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    }

    // Check if over limit
    if (rateLimit.requestCount >= args.rateLimitPerMinute) {
      const resetAt = rateLimit.windowStart + RATE_LIMIT_WINDOW_MS;
      const retryAfter = Math.ceil((resetAt - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter,
      };
    }

    // Increment counter
    await ctx.db.patch(rateLimit._id, {
      requestCount: rateLimit.requestCount + 1,
    });

    return {
      allowed: true,
      remaining: args.rateLimitPerMinute - rateLimit.requestCount - 1,
      resetAt: rateLimit.windowStart + RATE_LIMIT_WINDOW_MS,
    };
  },
});

/**
 * Update lastUsedAt timestamp for an API key
 * Called after successful requests
 */
export const updateLastUsed = mutation({
  args: {
    apiKeyId: v.id("mcp_api_keys"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.apiKeyId, {
      lastUsedAt: Date.now(),
    });
  },
});

/**
 * Generate a new API key for a business
 * Returns the plaintext key (only shown once) and creates the hashed record
 * Uses authenticated user from Clerk context
 */
export const generateApiKey = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
    permissions: v.array(v.string()),
    rateLimitPerMinute: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    // The hashed key is provided by the caller (client hashes it)
    keyHash: v.string(),
    keyPrefix: v.string(),
  },
  handler: async (ctx, args) => {
    // Get authenticated user from Clerk context
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Resolve user from Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Verify business exists
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Verify user is a member of this business with owner role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized to create API keys for this business");
    }

    if (membership.role !== "owner") {
      throw new Error("Only business owners can create API keys");
    }

    // Check prefix uniqueness
    const existingKey = await ctx.db
      .query("mcp_api_keys")
      .withIndex("by_keyPrefix", (q) => q.eq("keyPrefix", args.keyPrefix))
      .first();

    if (existingKey) {
      throw new Error("Key prefix collision - please regenerate");
    }

    // Create the API key record
    const apiKeyId = await ctx.db.insert("mcp_api_keys", {
      key: args.keyHash,
      keyPrefix: args.keyPrefix,
      businessId: args.businessId,
      name: args.name,
      permissions: args.permissions,
      rateLimitPerMinute: args.rateLimitPerMinute ?? 60,
      expiresAt: args.expiresAt,
      createdBy: user._id,
      createdAt: Date.now(),
    });

    return { apiKeyId, keyPrefix: args.keyPrefix };
  },
});

/**
 * Revoke an API key (soft delete)
 */
export const revokeApiKey = mutation({
  args: {
    apiKeyId: v.id("mcp_api_keys"),
  },
  handler: async (ctx, args) => {
    const apiKey = await ctx.db.get(args.apiKeyId);
    if (!apiKey) {
      throw new Error("API key not found");
    }

    if (apiKey.revokedAt) {
      throw new Error("API key already revoked");
    }

    await ctx.db.patch(args.apiKeyId, {
      revokedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * List API keys for a business (for admin UI)
 */
export const listApiKeys = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("mcp_api_keys")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Return keys without the hash
    return keys.map((key) => ({
      _id: key._id,
      keyPrefix: key.keyPrefix,
      name: key.name,
      permissions: key.permissions,
      rateLimitPerMinute: key.rateLimitPerMinute,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
      revokedAt: key.revokedAt,
      isActive: !key.revokedAt && (!key.expiresAt || key.expiresAt > Date.now()),
    }));
  },
});
