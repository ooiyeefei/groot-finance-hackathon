/**
 * Duplicate Matches Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Creating duplicate match records when potential duplicates are detected
 * - Dismissing duplicates (marking as "not a duplicate")
 * - Confirming duplicates
 * - Querying duplicate matches for claims and businesses
 *
 * Part of: 007-duplicate-expense-detection feature
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";
import { Doc } from "../_generated/dataModel";

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new duplicate match record
 * Called when duplicate detection identifies a potential duplicate
 */
export const createDuplicateMatch = mutation({
  args: {
    businessId: v.id("businesses"),
    sourceClaimId: v.id("expense_claims"),
    matchedClaimId: v.id("expense_claims"),
    matchTier: v.union(v.literal("exact"), v.literal("strong"), v.literal("fuzzy")),
    matchedFields: v.array(v.string()),
    confidenceScore: v.number(),
    isCrossUser: v.boolean(),
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

    // Verify membership in business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Verify both claims exist and belong to this business
    const sourceClaim = await ctx.db.get(args.sourceClaimId);
    const matchedClaim = await ctx.db.get(args.matchedClaimId);

    if (!sourceClaim || sourceClaim.businessId !== args.businessId) {
      throw new Error("Source claim not found or doesn't belong to this business");
    }
    if (!matchedClaim || matchedClaim.businessId !== args.businessId) {
      throw new Error("Matched claim not found or doesn't belong to this business");
    }

    // Check if this match already exists (avoid duplicates of duplicates)
    const existingMatch = await ctx.db
      .query("duplicate_matches")
      .withIndex("by_source_claim", (q) => q.eq("sourceClaimId", args.sourceClaimId))
      .filter((q) => q.eq(q.field("matchedClaimId"), args.matchedClaimId))
      .first();

    if (existingMatch) {
      // Return existing match ID instead of creating duplicate
      return existingMatch._id;
    }

    // Insert the duplicate match record
    const matchId = await ctx.db.insert("duplicate_matches", {
      businessId: args.businessId,
      sourceClaimId: args.sourceClaimId,
      matchedClaimId: args.matchedClaimId,
      matchTier: args.matchTier,
      matchedFields: args.matchedFields,
      confidenceScore: args.confidenceScore,
      isCrossUser: args.isCrossUser,
      status: "pending",
    });

    console.log(`[Convex] Created duplicate match ${matchId}: ${args.sourceClaimId} <-> ${args.matchedClaimId} (tier: ${args.matchTier})`);

    return matchId;
  },
});

/**
 * Dismiss a duplicate match (mark as "not a duplicate")
 * User has reviewed and determined these are not duplicates
 */
export const dismissDuplicate = mutation({
  args: {
    matchId: v.id("duplicate_matches"),
    reason: v.string(),
    resolvedBy: v.id("users"),
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

    // Get the match record
    const match = await ctx.db.get(args.matchId);
    if (!match) {
      throw new Error("Duplicate match not found");
    }

    // Verify membership in business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", match.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    // Update the match status
    await ctx.db.patch(args.matchId, {
      status: "dismissed",
      overrideReason: args.reason,
      resolvedBy: args.resolvedBy,
      resolvedAt: Date.now(),
    });

    console.log(`[Convex] Dismissed duplicate match ${args.matchId} with reason: ${args.reason}`);

    return args.matchId;
  },
});

/**
 * Confirm a duplicate
 * User has verified these claims are indeed duplicates
 */
export const confirmDuplicate = mutation({
  args: {
    matchId: v.id("duplicate_matches"),
    resolvedBy: v.id("users"),
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

    // Get the match record
    const match = await ctx.db.get(args.matchId);
    if (!match) {
      throw new Error("Duplicate match not found");
    }

    // Verify membership in business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", match.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    // Update the match status
    await ctx.db.patch(args.matchId, {
      status: "confirmed_duplicate",
      resolvedBy: args.resolvedBy,
      resolvedAt: Date.now(),
    });

    console.log(`[Convex] Confirmed duplicate match ${args.matchId}`);

    return args.matchId;
  },
});

// ============================================
// QUERIES
// ============================================

/**
 * Get duplicate matches for a specific claim
 * Returns all matches where the claim is either the source or matched claim
 */
export const getDuplicateMatches = query({
  args: {
    claimId: v.id("expense_claims"),
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

    // Get the claim to verify business access
    const claim = await ctx.db.get(args.claimId);
    if (!claim) {
      return [];
    }

    // Verify membership in business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", claim.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    // Get matches where this claim is the source
    const sourceMatches = await ctx.db
      .query("duplicate_matches")
      .withIndex("by_source_claim", (q) => q.eq("sourceClaimId", args.claimId))
      .collect();

    // Get matches where this claim is the matched claim
    const matchedMatches = await ctx.db
      .query("duplicate_matches")
      .withIndex("by_matched_claim", (q) => q.eq("matchedClaimId", args.claimId))
      .collect();

    // Combine and deduplicate (in case of any overlap)
    const allMatches = [...sourceMatches, ...matchedMatches];
    const uniqueMatches = allMatches.filter(
      (match, index, self) => index === self.findIndex((m) => m._id === match._id)
    );

    // Enrich with claim details
    const enrichedMatches = await Promise.all(
      uniqueMatches.map(async (match) => {
        const sourceClaim = await ctx.db.get(match.sourceClaimId);
        const matchedClaim = await ctx.db.get(match.matchedClaimId);
        const resolver: Doc<"users"> | null = match.resolvedBy
          ? await ctx.db.get(match.resolvedBy)
          : null;

        return {
          ...match,
          sourceClaim: sourceClaim
            ? {
                _id: sourceClaim._id,
                vendorName: sourceClaim.vendorName,
                totalAmount: sourceClaim.totalAmount,
                currency: sourceClaim.currency,
                transactionDate: sourceClaim.transactionDate,
                status: sourceClaim.status,
              }
            : null,
          matchedClaim: matchedClaim
            ? {
                _id: matchedClaim._id,
                vendorName: matchedClaim.vendorName,
                totalAmount: matchedClaim.totalAmount,
                currency: matchedClaim.currency,
                transactionDate: matchedClaim.transactionDate,
                status: matchedClaim.status,
              }
            : null,
          resolver: resolver
            ? {
                _id: resolver._id,
                fullName: resolver.fullName,
                email: resolver.email,
              }
            : null,
        };
      })
    );

    return enrichedMatches;
  },
});

/**
 * Get duplicate report for a business
 * Returns all duplicate matches filtered by status and date range
 */
export const getDuplicateReport = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("confirmed_duplicate"),
        v.literal("dismissed"),
        v.literal("all")
      )
    ),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { matches: [], summary: null };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { matches: [], summary: null };
    }

    // Verify membership in business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { matches: [], summary: null };
    }

    // Only owners, finance_admins, and managers can view duplicate reports
    if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
      return { matches: [], summary: null };
    }

    // Query matches for this business
    let matches;
    const statusFilter = args.status || "all";

    if (statusFilter === "all") {
      // Get all matches for the business
      matches = await ctx.db
        .query("duplicate_matches")
        .withIndex("by_business_status", (q) => q.eq("businessId", args.businessId))
        .collect();
    } else {
      // Get matches with specific status
      matches = await ctx.db
        .query("duplicate_matches")
        .withIndex("by_business_status", (q) =>
          q.eq("businessId", args.businessId).eq("status", statusFilter)
        )
        .collect();
    }

    // Apply date range filter based on claim creation time
    if (args.startDate || args.endDate) {
      const enrichedForFilter = await Promise.all(
        matches.map(async (match) => {
          const sourceClaim = await ctx.db.get(match.sourceClaimId);
          return { match, sourceClaim };
        })
      );

      matches = enrichedForFilter
        .filter(({ sourceClaim }) => {
          if (!sourceClaim?.transactionDate) return false;
          if (args.startDate && sourceClaim.transactionDate < args.startDate) return false;
          if (args.endDate && sourceClaim.transactionDate > args.endDate) return false;
          return true;
        })
        .map(({ match }) => match);
    }

    // Sort by creation time (newest first)
    matches.sort((a, b) => b._creationTime - a._creationTime);

    // Enrich with claim and user details
    const enrichedMatches = await Promise.all(
      matches.map(async (match) => {
        const sourceClaim = await ctx.db.get(match.sourceClaimId);
        const matchedClaim = await ctx.db.get(match.matchedClaimId);
        const resolver: Doc<"users"> | null = match.resolvedBy
          ? await ctx.db.get(match.resolvedBy)
          : null;

        // Get submitter details with proper typing
        const sourceSubmitter: Doc<"users"> | null = sourceClaim
          ? await ctx.db.get(sourceClaim.userId)
          : null;
        const matchedSubmitter: Doc<"users"> | null = matchedClaim
          ? await ctx.db.get(matchedClaim.userId)
          : null;

        return {
          ...match,
          sourceClaim: sourceClaim
            ? {
                _id: sourceClaim._id,
                vendorName: sourceClaim.vendorName,
                totalAmount: sourceClaim.totalAmount,
                currency: sourceClaim.currency,
                transactionDate: sourceClaim.transactionDate,
                status: sourceClaim.status,
                businessPurpose: sourceClaim.businessPurpose,
                submitter: sourceSubmitter
                  ? {
                      _id: sourceSubmitter._id,
                      fullName: sourceSubmitter.fullName,
                      email: sourceSubmitter.email,
                    }
                  : null,
              }
            : null,
          matchedClaim: matchedClaim
            ? {
                _id: matchedClaim._id,
                vendorName: matchedClaim.vendorName,
                totalAmount: matchedClaim.totalAmount,
                currency: matchedClaim.currency,
                transactionDate: matchedClaim.transactionDate,
                status: matchedClaim.status,
                businessPurpose: matchedClaim.businessPurpose,
                submitter: matchedSubmitter
                  ? {
                      _id: matchedSubmitter._id,
                      fullName: matchedSubmitter.fullName,
                      email: matchedSubmitter.email,
                    }
                  : null,
              }
            : null,
          resolver: resolver
            ? {
                _id: resolver._id,
                fullName: resolver.fullName,
                email: resolver.email,
              }
            : null,
        };
      })
    );

    // Calculate summary statistics
    const allMatchesForStats = await ctx.db
      .query("duplicate_matches")
      .withIndex("by_business_status", (q) => q.eq("businessId", args.businessId))
      .collect();

    const summary = {
      totalMatches: allMatchesForStats.length,
      pendingCount: allMatchesForStats.filter((m) => m.status === "pending").length,
      confirmedCount: allMatchesForStats.filter((m) => m.status === "confirmed_duplicate").length,
      dismissedCount: allMatchesForStats.filter((m) => m.status === "dismissed").length,
      exactMatchCount: allMatchesForStats.filter((m) => m.matchTier === "exact").length,
      strongMatchCount: allMatchesForStats.filter((m) => m.matchTier === "strong").length,
      fuzzyMatchCount: allMatchesForStats.filter((m) => m.matchTier === "fuzzy").length,
      crossUserCount: allMatchesForStats.filter((m) => m.isCrossUser).length,
    };

    return {
      matches: enrichedMatches,
      summary,
    };
  },
});

// ============================================
// INTERNAL MUTATIONS (for backend/Lambda use)
// ============================================

/**
 * Internal: Create duplicate match without auth (for Lambda/backend use)
 */
export const internalCreateDuplicateMatch = internalMutation({
  args: {
    businessId: v.id("businesses"),
    sourceClaimId: v.id("expense_claims"),
    matchedClaimId: v.id("expense_claims"),
    matchTier: v.union(v.literal("exact"), v.literal("strong"), v.literal("fuzzy")),
    matchedFields: v.array(v.string()),
    confidenceScore: v.number(),
    isCrossUser: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Check if this match already exists
    const existingMatch = await ctx.db
      .query("duplicate_matches")
      .withIndex("by_source_claim", (q) => q.eq("sourceClaimId", args.sourceClaimId))
      .filter((q) => q.eq(q.field("matchedClaimId"), args.matchedClaimId))
      .first();

    if (existingMatch) {
      return existingMatch._id;
    }

    const matchId = await ctx.db.insert("duplicate_matches", {
      businessId: args.businessId,
      sourceClaimId: args.sourceClaimId,
      matchedClaimId: args.matchedClaimId,
      matchTier: args.matchTier,
      matchedFields: args.matchedFields,
      confidenceScore: args.confidenceScore,
      isCrossUser: args.isCrossUser,
      status: "pending",
    });

    console.log(`[Convex Internal] Created duplicate match ${matchId}: ${args.sourceClaimId} <-> ${args.matchedClaimId}`);

    return matchId;
  },
});

/**
 * Internal: Batch create duplicate matches (for efficiency)
 */
export const internalBatchCreateDuplicateMatches = internalMutation({
  args: {
    matches: v.array(
      v.object({
        businessId: v.id("businesses"),
        sourceClaimId: v.id("expense_claims"),
        matchedClaimId: v.id("expense_claims"),
        matchTier: v.union(v.literal("exact"), v.literal("strong"), v.literal("fuzzy")),
        matchedFields: v.array(v.string()),
        confidenceScore: v.number(),
        isCrossUser: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results: string[] = [];

    for (const matchData of args.matches) {
      // Check if this match already exists
      const existingMatch = await ctx.db
        .query("duplicate_matches")
        .withIndex("by_source_claim", (q) => q.eq("sourceClaimId", matchData.sourceClaimId))
        .filter((q) => q.eq(q.field("matchedClaimId"), matchData.matchedClaimId))
        .first();

      if (existingMatch) {
        results.push(existingMatch._id);
        continue;
      }

      const matchId = await ctx.db.insert("duplicate_matches", {
        businessId: matchData.businessId,
        sourceClaimId: matchData.sourceClaimId,
        matchedClaimId: matchData.matchedClaimId,
        matchTier: matchData.matchTier,
        matchedFields: matchData.matchedFields,
        confidenceScore: matchData.confidenceScore,
        isCrossUser: matchData.isCrossUser,
        status: "pending",
      });

      results.push(matchId);
    }

    console.log(`[Convex Internal] Batch created ${results.length} duplicate matches`);

    return results;
  },
});
