/**
 * Chat Agent Corrections — collect user corrections for DSPy self-improving training
 *
 * Corrections are pooled globally across all businesses for training.
 * Business ID is retained for audit but not used for model isolation.
 */

import { v } from "convex/values";
import { mutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAuthenticatedUser } from "../lib/resolvers";

/**
 * Submit a chat agent correction from the frontend.
 * Called when a user clicks thumbs-down and selects a correction type.
 */
export const submit = mutation({
  args: {
    messageId: v.optional(v.string()),
    conversationId: v.optional(v.string()),
    correctionType: v.union(
      v.literal("intent"),
      v.literal("tool_selection"),
      v.literal("parameter_extraction")
    ),
    originalQuery: v.string(),
    originalIntent: v.optional(v.string()),
    originalToolName: v.optional(v.string()),
    originalParameters: v.optional(v.string()),
    correctedIntent: v.optional(v.string()),
    correctedToolName: v.optional(v.string()),
    correctedParameters: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) {
      throw new Error("Authentication required");
    }

    // Resolve businessId from user's membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();

    if (!membership) {
      throw new Error("No business membership found");
    }

    const correctionId = await ctx.db.insert("chat_agent_corrections", {
      businessId: membership.businessId,
      messageId: args.messageId,
      conversationId: args.conversationId,
      correctionType: args.correctionType,
      originalQuery: args.originalQuery,
      originalIntent: args.originalIntent,
      originalToolName: args.originalToolName,
      originalParameters: args.originalParameters,
      correctedIntent: args.correctedIntent,
      correctedToolName: args.correctedToolName,
      correctedParameters: args.correctedParameters,
      createdBy: user.clerkUserId,
      createdAt: Date.now(),
      consumed: false,
    });

    // Record override for DSPy metrics (027-dspy-dash)
    // Map correctionType to dashboard tool name
    const toolMap: Record<string, string> = {
      intent: "chat_intent",
      tool_selection: "chat_tool_selector",
      parameter_extraction: "chat_param_extractor",
    };
    const dashboardTool = toolMap[args.correctionType] || `chat_${args.correctionType}`;
    await ctx.scheduler.runAfter(0, internal.functions.dspyMetrics.recordOverride, {
      businessId: membership.businessId,
      tool: dashboardTool,
    });

    return { correctionId };
  },
});

/**
 * Get corrections ready for training — used by weekly optimization cron.
 * Checks minimum volume, diversity, and new-data-only gating.
 */
export const getCorrectionsReadyForTraining = internalQuery({
  args: {
    correctionType: v.string(),
    minCount: v.number(),
    minUniqueQueries: v.number(),
  },
  handler: async (ctx, args) => {
    const corrections = await ctx.db
      .query("chat_agent_corrections")
      .withIndex("by_correctionType", (q) =>
        q.eq("correctionType", args.correctionType)
      )
      .collect();

    const unconsumed = corrections.filter((c) => !c.consumed);
    const uniqueQueries = new Set(corrections.map((c) => c.originalQuery.toLowerCase().trim()));

    // Find the latest correction ID for new-data-only gating
    let latestCorrectionId = "";
    for (const c of corrections) {
      if (c._id > latestCorrectionId) {
        latestCorrectionId = c._id;
      }
    }

    return {
      corrections,
      totalCount: corrections.length,
      unconsumedCount: unconsumed.length,
      uniqueQueries: uniqueQueries.size,
      latestCorrectionId,
      isReady:
        corrections.length >= args.minCount &&
        uniqueQueries.size >= args.minUniqueQueries &&
        unconsumed.length > 0,
    };
  },
});

/**
 * Get the active model version for a given domain (e.g., "chat_intent").
 * Used by TypeScript LangGraph nodes to load optimized prompts at inference time.
 */
export const getActiveModelVersion = internalQuery({
  args: {
    domain: v.string(),
  },
  handler: async (ctx, args) => {
    const versions = await ctx.db
      .query("dspy_model_versions")
      .withIndex("by_platform_status", (q) =>
        q.eq("platform", args.domain).eq("status", "active")
      )
      .collect();

    if (versions.length === 0) return null;

    // Return the latest active version
    const latest = versions.sort((a, b) => b.version - a.version)[0];
    return {
      version: latest.version,
      optimizedPrompt: latest.optimizedPrompt || null,
      accuracy: latest.accuracy,
      trainedAt: latest.trainedAt,
      s3Key: latest.s3Key,
    };
  },
});
