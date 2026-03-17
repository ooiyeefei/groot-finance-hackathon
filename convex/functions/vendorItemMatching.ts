/**
 * Vendor Item Matching — Convex functions for DSPy Tier 2
 *
 * Manages cross-vendor item matching via Lambda DSPy module:
 * - suggestMatches: On-demand batch matching via "Suggest Matches" button
 * - suggestMatchesForItem: Lightweight auto-suggest after invoice processing
 * - recordCorrection: User confirms/rejects match → training data
 * - triggerOptimization: MIPROv2 weekly optimization
 *
 * Feature: 001-dspy-vendor-item-matcher (#320)
 */

import { v } from "convex/values";
import { action, mutation, internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId } from "../lib/resolvers";
import { callMCPTool } from "../lib/mcpClient";
import { Id } from "../_generated/dataModel";

// Constants
const MIN_ITEMS_FOR_SUGGESTIONS = 5;
const MIN_VENDORS_FOR_SUGGESTIONS = 2;
const MIN_CORRECTIONS_FOR_BOOTSTRAP = 20;
const MIN_CORRECTIONS_FOR_OPTIMIZATION = 20;
const MIN_UNIQUE_PAIRS_FOR_OPTIMIZATION = 10;

// ============================================
// INTERNAL QUERIES (called from actions — not reactive)
// ============================================

/**
 * T006: Get unique items grouped by vendor for matching.
 * Bandwidth-safe: .take(100) limit.
 */
export const _getItemsForMatching = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("vendor_price_history")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .take(200);

    // Filter non-archived, deduplicate by vendor+description
    const seen = new Set<string>();
    const items: Array<{
      itemDescription: string;
      vendorId: string;
      vendorName: string;
      itemIdentifier: string;
    }> = [];

    for (const r of records) {
      if (r.archivedFlag) continue;
      const key = `${r.vendorId}||${r.itemDescription.toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Get vendor name (cache-friendly since we're iterating)
      const vendor = await ctx.db.get(r.vendorId);

      items.push({
        itemDescription: r.itemDescription,
        vendorId: r.vendorId as string,
        vendorName: vendor?.name ?? "Unknown",
        itemIdentifier: r.itemIdentifier ?? r.itemDescription,
      });

      if (items.length >= 100) break;
    }

    return items;
  },
});

/**
 * T007: Get rejected pair keys for dedup.
 */
export const _getRejectedPairKeys = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const rejections = await ctx.db
      .query("vendor_item_matching_corrections")
      .withIndex("by_businessId_createdAt", (q) =>
        q.eq("businessId", args.businessId)
      )
      .take(200);

    return rejections
      .filter((r) => !r.isMatch)
      .map((r) => r.normalizedPairKey);
  },
});

/**
 * T008: Get active model S3 key.
 */
export const _getActiveModel = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const models = await ctx.db
      .query("dspy_model_versions")
      .withIndex("by_platform_status", (q) =>
        q.eq("platform", "vendor_item_matching").eq("status", "active")
      )
      .take(10);

    // Find model for this business (s3Key contains businessId)
    const businessModel = models.find((m) =>
      m.s3Key.includes(args.businessId as string)
    );

    return businessModel?.s3Key ?? null;
  },
});

/**
 * T015: Get corrections for Lambda training data.
 */
export const _getCorrections = internalQuery({
  args: {
    businessId: v.id("businesses"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const corrections = await ctx.db
      .query("vendor_item_matching_corrections")
      .withIndex("by_businessId_createdAt", (q) =>
        q.eq("businessId", args.businessId)
      )
      .take(limit);

    // Deduplicate by pairKey (keep latest)
    const byPairKey = new Map<string, typeof corrections[0]>();
    for (const c of corrections) {
      const existing = byPairKey.get(c.normalizedPairKey);
      if (!existing || c.createdAt > existing.createdAt) {
        byPairKey.set(c.normalizedPairKey, c);
      }
    }

    return [...byPairKey.values()];
  },
});

/**
 * T019: Check optimization readiness.
 */
export const _checkOptimizationReadiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const corrections = await ctx.db
      .query("vendor_item_matching_corrections")
      .withIndex("by_businessId_createdAt", (q) =>
        q.eq("businessId", args.businessId)
      )
      .take(200);

    const uniquePairs = new Set(corrections.map((c) => c.normalizedPairKey));

    return {
      ready:
        corrections.length >= MIN_CORRECTIONS_FOR_OPTIMIZATION &&
        uniquePairs.size >= MIN_UNIQUE_PAIRS_FOR_OPTIMIZATION,
      correctionCount: corrections.length,
      uniquePairCount: uniquePairs.size,
    };
  },
});

// ============================================
// ACTIONS (call Lambda via MCP)
// ============================================

/**
 * T011: Internal action wrapper for auto-suggest trigger from recordPriceObservationsBatch.
 * Needed because scheduler.runAfter in internalMutation can only call internal functions.
 */
export const _autoSuggestTrigger = internalAction({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<void> => {
    // Reuse the same logic as suggestMatches but without auth check
    const items = await ctx.runQuery(
      internal.functions.vendorItemMatching._getItemsForMatching,
      { businessId: args.businessId }
    );

    const vendorIds = new Set(items.map((i) => i.vendorId));
    if (items.length < MIN_ITEMS_FOR_SUGGESTIONS || vendorIds.size < MIN_VENDORS_FOR_SUGGESTIONS) {
      return;
    }

    const rejectedPairKeys = await ctx.runQuery(
      internal.functions.vendorItemMatching._getRejectedPairKeys,
      { businessId: args.businessId }
    );

    const modelS3Key = await ctx.runQuery(
      internal.functions.vendorItemMatching._getActiveModel,
      { businessId: args.businessId }
    );

    const corrections = await ctx.runQuery(
      internal.functions.vendorItemMatching._getCorrections,
      { businessId: args.businessId, limit: 50 }
    );

    const result = await callMCPTool<{
      suggestions: Array<{
        itemDescriptionA: string;
        itemDescriptionB: string;
        vendorIdA: string;
        vendorIdB: string;
        confidence: number;
        reasoning: string;
        suggestedGroupName: string;
      }>;
    }>({
      toolName: "match_vendor_items",
      args: {
        items,
        businessCorrections: corrections.map((c) => ({
          itemDescriptionA: c.itemDescriptionA,
          itemDescriptionB: c.itemDescriptionB,
          isMatch: c.isMatch,
        })),
        modelS3Key,
        rejectedPairKeys,
        maxSuggestions: 5, // Auto-suggest: fewer results than on-demand
      },
      businessId: args.businessId as string,
    });

    // Auto-create ai-suggested groups for high-confidence matches
    if (result?.suggestions) {
      for (const s of result.suggestions) {
        if (s.confidence >= 0.8) {
          await ctx.runMutation(
            internal.functions.crossVendorItemGroups._createFromAutoSuggest,
            {
              businessId: args.businessId,
              groupName: s.suggestedGroupName || `${s.itemDescriptionA} / ${s.itemDescriptionB}`,
              vendorIdA: s.vendorIdA as Id<"vendors">,
              vendorIdB: s.vendorIdB as Id<"vendors">,
              itemIdentifierA: s.itemDescriptionA,
              itemIdentifierB: s.itemDescriptionB,
            }
          );
        }
      }
    }
  },
});

/**
 * T009: Suggest matches — on-demand from UI.
 */
export const suggestMatches = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<{
    suggestions: Array<{
      itemDescriptionA: string;
      itemDescriptionB: string;
      vendorIdA: string;
      vendorIdB: string;
      confidence: number;
      reasoning: string;
      suggestedGroupName: string;
    }>;
    usedDspy: boolean;
    confidenceCapped: boolean;
  }> => {
    // Get items for matching
    const items = await ctx.runQuery(
      internal.functions.vendorItemMatching._getItemsForMatching,
      { businessId: args.businessId }
    );

    // Check minimum requirements
    const vendorIds = new Set(items.map((i) => i.vendorId));
    if (
      items.length < MIN_ITEMS_FOR_SUGGESTIONS ||
      vendorIds.size < MIN_VENDORS_FOR_SUGGESTIONS
    ) {
      return { suggestions: [], usedDspy: false, confidenceCapped: true };
    }

    // Get rejected pair keys
    const rejectedPairKeys = await ctx.runQuery(
      internal.functions.vendorItemMatching._getRejectedPairKeys,
      { businessId: args.businessId }
    );

    // Get active model
    const modelS3Key = await ctx.runQuery(
      internal.functions.vendorItemMatching._getActiveModel,
      { businessId: args.businessId }
    );

    // Get corrections for inline BootstrapFewShot
    const corrections = await ctx.runQuery(
      internal.functions.vendorItemMatching._getCorrections,
      { businessId: args.businessId, limit: 50 }
    );

    // Call Lambda
    const result = await callMCPTool<{
      suggestions: Array<{
        itemDescriptionA: string;
        itemDescriptionB: string;
        vendorIdA: string;
        vendorIdB: string;
        confidence: number;
        reasoning: string;
        suggestedGroupName: string;
      }>;
      usedDspy: boolean;
      confidenceCapped: boolean;
    }>({
      toolName: "match_vendor_items",
      args: {
        items,
        businessCorrections: corrections.map((c) => ({
          itemDescriptionA: c.itemDescriptionA,
          itemDescriptionB: c.itemDescriptionB,
          isMatch: c.isMatch,
        })),
        modelS3Key,
        rejectedPairKeys,
        maxSuggestions: 20,
      },
      businessId: args.businessId as string,
    });

    return result ?? { suggestions: [], usedDspy: false, confidenceCapped: true };
  },
});

/**
 * T021: Trigger MIPROv2 optimization.
 */
export const triggerOptimization = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    accuracy?: number;
    modelAccepted?: boolean;
  }> => {
    // Check readiness
    const readiness = await ctx.runQuery(
      internal.functions.vendorItemMatching._checkOptimizationReadiness,
      { businessId: args.businessId }
    );

    if (!readiness.ready) {
      return { success: false };
    }

    // Get corrections
    const corrections = await ctx.runQuery(
      internal.functions.vendorItemMatching._getCorrections,
      { businessId: args.businessId, limit: 200 }
    );

    // Get current model
    const currentModelS3Key = await ctx.runQuery(
      internal.functions.vendorItemMatching._getActiveModel,
      { businessId: args.businessId }
    );

    // Call Lambda optimizer
    const result = await callMCPTool<{
      success: boolean;
      s3Key: string;
      accuracy: number;
      trainingExamples: number;
      previousAccuracy?: number;
      modelAccepted: boolean;
    }>({
      toolName: "optimize_vendor_item_model",
      args: {
        businessId: args.businessId as string,
        corrections: corrections.map((c) => ({
          itemDescriptionA: c.itemDescriptionA,
          itemDescriptionB: c.itemDescriptionB,
          isMatch: c.isMatch,
        })),
        currentModelS3Key,
        optimizerType: "miprov2",
      },
      businessId: args.businessId as string,
    });

    if (!result) {
      return { success: false };
    }

    // Record training result
    if (result.success && result.s3Key) {
      await ctx.runMutation(
        internal.functions.vendorItemMatching._recordTrainingResult,
        {
          s3Key: result.s3Key,
          accuracy: result.accuracy,
          trainingExamples: result.trainingExamples,
          modelAccepted: result.modelAccepted,
          optimizerType: "miprov2",
        }
      );
    }

    return {
      success: result.success,
      accuracy: result.accuracy,
      modelAccepted: result.modelAccepted,
    };
  },
});

// ============================================
// MUTATIONS (User-facing)
// ============================================

/**
 * T014: Record user correction (confirm/reject match).
 */
export const recordCorrection = mutation({
  args: {
    itemDescriptionA: v.string(),
    itemDescriptionB: v.string(),
    vendorIdA: v.id("vendors"),
    vendorIdB: v.id("vendors"),
    isMatch: v.boolean(),
    originalConfidence: v.optional(v.number()),
    originalReasoning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    // Get vendor to determine businessId
    const vendorA = await ctx.db.get(args.vendorIdA);
    if (!vendorA) throw new Error("Vendor A not found");

    const businessId = vendorA.businessId;

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    // Generate normalized pair key (sorted for consistency)
    const normA = args.itemDescriptionA.toLowerCase().trim().replace(/\s+/g, " ");
    const normB = args.itemDescriptionB.toLowerCase().trim().replace(/\s+/g, " ");
    const normalizedPairKey = [normA, normB].sort().join("||");

    // Check for existing correction with same pair key → supersede
    const existing = await ctx.db
      .query("vendor_item_matching_corrections")
      .withIndex("by_businessId_pairKey", (q) =>
        q.eq("businessId", businessId).eq("normalizedPairKey", normalizedPairKey)
      )
      .first();

    if (existing) {
      // Supersede: delete old correction
      await ctx.db.delete(existing._id);
    }

    // Insert new correction
    await ctx.db.insert("vendor_item_matching_corrections", {
      businessId,
      itemDescriptionA: args.itemDescriptionA,
      itemDescriptionB: args.itemDescriptionB,
      vendorIdA: args.vendorIdA,
      vendorIdB: args.vendorIdB,
      normalizedPairKey,
      isMatch: args.isMatch,
      originalConfidence: args.originalConfidence,
      originalReasoning: args.originalReasoning,
      correctedBy: user._id as string,
      createdAt: Date.now(),
    });

    // If confirmed match → update cross_vendor_item_groups matchSource
    if (args.isMatch) {
      const groups = await ctx.db
        .query("cross_vendor_item_groups")
        .withIndex("by_match_source", (q) =>
          q.eq("businessId", businessId).eq("matchSource", "ai-suggested")
        )
        .take(50);

      // Find group containing both items
      for (const group of groups) {
        const hasA = group.itemReferences.some(
          (r) =>
            r.vendorId === args.vendorIdA &&
            r.itemIdentifier.toLowerCase() === normA
        );
        const hasB = group.itemReferences.some(
          (r) =>
            r.vendorId === args.vendorIdB &&
            r.itemIdentifier.toLowerCase() === normB
        );
        if (hasA && hasB) {
          await ctx.db.patch(group._id, { matchSource: "user-confirmed" });
          break;
        }
      }
    } else {
      // If rejected → delete ai-suggested group containing this pair
      const groups = await ctx.db
        .query("cross_vendor_item_groups")
        .withIndex("by_match_source", (q) =>
          q.eq("businessId", businessId).eq("matchSource", "ai-suggested")
        )
        .take(50);

      for (const group of groups) {
        const hasA = group.itemReferences.some(
          (r) =>
            r.vendorId === args.vendorIdA &&
            r.itemIdentifier.toLowerCase() === normA
        );
        const hasB = group.itemReferences.some(
          (r) =>
            r.vendorId === args.vendorIdB &&
            r.itemIdentifier.toLowerCase() === normB
        );
        if (hasA && hasB) {
          await ctx.db.delete(group._id);
          break;
        }
      }
    }

    return { success: true };
  },
});

// ============================================
// INTERNAL MUTATIONS (System)
// ============================================

/**
 * T020: Record model training result in dspy_model_versions.
 */
export const _recordTrainingResult = internalMutation({
  args: {
    s3Key: v.string(),
    accuracy: v.number(),
    trainingExamples: v.number(),
    modelAccepted: v.boolean(),
    optimizerType: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.modelAccepted) {
      // Deactivate current active model
      const currentModels = await ctx.db
        .query("dspy_model_versions")
        .withIndex("by_platform_status", (q) =>
          q.eq("platform", "vendor_item_matching").eq("status", "active")
        )
        .collect();

      for (const model of currentModels) {
        await ctx.db.patch(model._id, { status: "inactive" });
      }

      // Get next version number
      const allModels = await ctx.db
        .query("dspy_model_versions")
        .withIndex("by_platform_version", (q) =>
          q.eq("platform", "vendor_item_matching")
        )
        .collect();
      const nextVersion = allModels.length + 1;

      // Insert new active model
      await ctx.db.insert("dspy_model_versions", {
        platform: "vendor_item_matching",
        version: nextVersion,
        s3Key: args.s3Key,
        status: "active",
        trainingExamples: args.trainingExamples,
        accuracy: args.accuracy,
        optimizerType: args.optimizerType,
        trainedAt: Date.now(),
      });
    } else {
      // Record failed attempt
      const allModels = await ctx.db
        .query("dspy_model_versions")
        .withIndex("by_platform_version", (q) =>
          q.eq("platform", "vendor_item_matching")
        )
        .collect();

      await ctx.db.insert("dspy_model_versions", {
        platform: "vendor_item_matching",
        version: allModels.length + 1,
        s3Key: args.s3Key || "",
        status: "failed",
        trainingExamples: args.trainingExamples,
        accuracy: args.accuracy,
        optimizerType: args.optimizerType,
        trainedAt: Date.now(),
      });
    }
  },
});
