/**
 * PO Matching AI — Tier 2 AI matching integration for AP 3-way matching.
 *
 * Called when Tier 1 deterministic matching produces low confidence.
 * Uses DSPy Lambda via MCP for AI-enhanced line item pairing and
 * variance diagnosis. Falls back gracefully if Lambda is unavailable.
 *
 * Follows the same pattern as feeClassificationActions.ts.
 */

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { callMCPTool } from "../lib/mcpClient";

// Plan-based monthly AI call limits
const AI_CALL_LIMITS: Record<string, number> = {
  FREE: 150,
  PRO: 500,
  ENTERPRISE: 999999,
};
const DEFAULT_AI_CALL_LIMIT = 150;

// ============================================
// TIER 2: AI MATCHING VIA MCP/DSPY LAMBDA
// ============================================

/**
 * Tier 2 AI Matching — calls DSPy Lambda via MCP when Tier 1 confidence is low.
 * Reads matching_settings for AI toggle + quota, gets active DSPy model,
 * fetches recent corrections for few-shot context, then calls MCP.
 */
export const matchWithAI = internalAction({
  args: {
    businessId: v.id("businesses"),
    matchId: v.id("po_matches"),
    poLineItems: v.array(v.object({
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      totalAmount: v.number(),
    })),
    invoiceLineItems: v.array(v.object({
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      totalAmount: v.number(),
    })),
    grnLineItems: v.array(v.object({
      description: v.string(),
      quantity: v.number(),
    })),
    vendorName: v.string(),
    tier1Pairings: v.array(v.object({
      poLineIndex: v.number(),
      invoiceLineIndex: v.optional(v.number()),
      grnLineIndex: v.optional(v.number()),
      matchConfidence: v.number(),
      matchMethod: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    // 1. Check matching_settings for AI toggle and quota
    const settings = await ctx.runQuery(
      internal.functions.poMatchingAI.getMatchingSettings as any,
      { businessId: args.businessId }
    );

    // AI enabled by default if no settings found
    const aiEnabled = settings?.aiEnabled ?? true;
    if (!aiEnabled) {
      console.log("[PO-AI] AI matching disabled for business, skipping Tier 2");
      return;
    }

    // Check monthly quota
    const aiCallsThisMonth = settings?.aiCallsThisMonth ?? 0;
    const aiCallLimit = DEFAULT_AI_CALL_LIMIT; // TODO: look up business plan
    if (aiCallsThisMonth >= aiCallLimit) {
      console.warn(`[PO-AI] Monthly AI call quota exceeded (${aiCallsThisMonth}/${aiCallLimit}), skipping Tier 2`);
      return;
    }

    // 2. Get active DSPy model for PO matching domain
    const platform = `po_matching_${args.businessId}`;
    const activeModel = await ctx.runQuery(
      internal.functions.dspyModelVersions.getActiveModel as any,
      { platform }
    );

    // 3. Get recent corrections for few-shot context
    const corrections = await ctx.runQuery(
      internal.functions.poMatchingAI.getTrainingCorrections as any,
      { businessId: args.businessId }
    );

    const fewShotExamples = (corrections ?? []).map((c: any) => ({
      vendorName: c.vendorName,
      poLineDescription: c.originalPoLineDescription,
      invoiceLineDescription: c.originalInvoiceLineDescription,
      correctedPoLineDescription: c.correctedPoLineDescription,
      correctedInvoiceLineDescription: c.correctedInvoiceLineDescription,
      correctionType: c.correctionType,
    }));

    // 4. Call MCP Lambda for AI matching
    interface AIMatchResult {
      pairings: Array<{
        poLineIndex: number;
        invoiceLineIndex: number;
        confidence: number;
        reasoning: string;
      }>;
      overallReasoning: string;
      overallConfidence: number;
      modelVersion: string;
    }

    let result: AIMatchResult | null = null;

    try {
      result = await callMCPTool<AIMatchResult>({
        toolName: "match_po_invoice",
        businessId: args.businessId as string,
        args: {
          poLineItems: args.poLineItems,
          invoiceLineItems: args.invoiceLineItems,
          grnLineItems: args.grnLineItems,
          vendorName: args.vendorName,
          tier1Pairings: args.tier1Pairings,
          fewShotExamples,
          modelS3Key: activeModel?.s3Key ?? null,
        },
      });
    } catch (error) {
      console.warn("[PO-AI] MCP Lambda call failed, match stays as Tier 1:", error);
      return;
    }

    if (!result || !result.pairings) {
      console.warn("[PO-AI] MCP returned no results, match stays as Tier 1");
      return;
    }

    // 5. Update match with AI results
    await ctx.runMutation(
      internal.functions.poMatchingAI.updateMatchFromAI as any,
      {
        matchId: args.matchId,
        pairings: result.pairings,
        overallReasoning: result.overallReasoning,
        modelVersion: result.modelVersion,
        overallConfidence: result.overallConfidence,
      }
    );

    // 6. Increment AI call counter
    if (settings?._id) {
      await ctx.runMutation(
        internal.functions.poMatchingAI.incrementAICallCounter as any,
        { settingsId: settings._id }
      );
    }

    console.log(`[PO-AI] Tier 2 complete for match ${args.matchId}: ${result.pairings.length} pairings, confidence=${result.overallConfidence.toFixed(2)}, model=${result.modelVersion}`);
  },
});

// ============================================
// UPDATE MATCH FROM AI RESULTS
// ============================================

/**
 * Updates the po_matches record with AI results.
 * Merges AI pairings with Tier 1 pairings (replaces low-confidence ones).
 * Auto-approves if all pairings meet confidence threshold and no tolerance violations.
 */
export const updateMatchFromAI = internalMutation({
  args: {
    matchId: v.id("po_matches"),
    pairings: v.array(v.object({
      poLineIndex: v.number(),
      invoiceLineIndex: v.number(),
      confidence: v.number(),
      reasoning: v.string(),
    })),
    overallReasoning: v.string(),
    modelVersion: v.string(),
    overallConfidence: v.number(),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) {
      console.warn(`[PO-AI] Match ${args.matchId} not found, skipping update`);
      return;
    }

    // Merge AI pairings with existing Tier 1 pairings
    const existingPairings = [...match.lineItemPairings];
    const aiPairingMap = new Map<number, (typeof args.pairings)[0]>();
    for (const aiPairing of args.pairings) {
      aiPairingMap.set(aiPairing.poLineIndex, aiPairing);
    }

    const mergedPairings = existingPairings.map((existing) => {
      const aiPairing = aiPairingMap.get(existing.poLineIndex);
      if (aiPairing && aiPairing.confidence > existing.matchConfidence) {
        // Replace low-confidence Tier 1 pairing with AI pairing
        return {
          ...existing,
          invoiceLineIndex: aiPairing.invoiceLineIndex,
          matchConfidence: aiPairing.confidence,
          matchMethod: "ai_semantic" as const,
        };
      }
      return existing;
    });

    // Check if auto-approval conditions are met:
    // All pairings >= 0.6 confidence AND no tolerance violations
    const allHighConfidence = mergedPairings.every((p) => p.matchConfidence >= 0.6);
    const noToleranceViolations = mergedPairings.every((p) => {
      if (!p.variances) return true;
      return p.variances.every((v) => !v.exceedsTolerance);
    });
    const shouldAutoApprove = allHighConfidence && noToleranceViolations;

    await ctx.db.patch(args.matchId, {
      lineItemPairings: mergedPairings as any,
      aiMatchTier: 2,
      aiModelVersion: args.modelVersion,
      aiReasoningTrace: args.overallReasoning,
      aiConfidenceOverall: args.overallConfidence,
      aiMatchedAt: Date.now(),
      ...(shouldAutoApprove ? { status: "approved" } : {}),
    });
  },
});

// ============================================
// VARIANCE DIAGNOSIS VIA AI
// ============================================

/**
 * Calls Lambda for AI-powered variance diagnosis.
 * Explains why a variance exists and suggests resolution.
 */
export const diagnoseVarianceAI = internalAction({
  args: {
    matchId: v.id("po_matches"),
    poLine: v.object({
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      totalAmount: v.number(),
    }),
    invoiceLine: v.object({
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      totalAmount: v.number(),
    }),
    grnLine: v.optional(v.object({
      description: v.string(),
      quantity: v.number(),
    })),
    vendorName: v.string(),
    varianceType: v.string(),
    varianceAmount: v.number(),
  },
  handler: async (ctx, args) => {
    interface VarianceDiagnosisResult {
      diagnosis: string;
      suggestedAction: string;
      confidence: number;
    }

    let result: VarianceDiagnosisResult | null = null;

    try {
      result = await callMCPTool<VarianceDiagnosisResult>({
        toolName: "diagnose_variance",
        businessId: "", // Variance diagnosis doesn't need business scoping
        args: {
          poLine: args.poLine,
          invoiceLine: args.invoiceLine,
          grnLine: args.grnLine ?? null,
          vendorName: args.vendorName,
          varianceType: args.varianceType,
          varianceAmount: args.varianceAmount,
        },
      });
    } catch (error) {
      console.warn("[PO-AI] Variance diagnosis MCP call failed:", error);
      return;
    }

    if (!result || !result.diagnosis) {
      console.warn("[PO-AI] Variance diagnosis returned no results");
      return;
    }

    // Update the match with the AI diagnosis
    const diagnosisText = `[${args.varianceType}] ${result.diagnosis}\nSuggested action: ${result.suggestedAction}`;

    const match = await ctx.runQuery(
      internal.functions.poMatchingAI.getMatch as any,
      { matchId: args.matchId }
    );

    // Append to existing diagnosis if present
    const existingDiagnosis = match?.aiVarianceDiagnosis ?? "";
    const updatedDiagnosis = existingDiagnosis
      ? `${existingDiagnosis}\n---\n${diagnosisText}`
      : diagnosisText;

    await ctx.runMutation(
      internal.functions.poMatchingAI.patchMatchDiagnosis as any,
      { matchId: args.matchId, aiVarianceDiagnosis: updatedDiagnosis }
    );

    console.log(`[PO-AI] Variance diagnosis complete for match ${args.matchId}: ${args.varianceType}`);
  },
});

// ============================================
// HELPER QUERIES AND MUTATIONS
// ============================================

/**
 * Get matching settings for a business.
 */
export const getMatchingSettings = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("matching_settings")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .first();
  },
});

/**
 * Get a po_matches record by ID (for use in actions).
 */
export const getMatch = internalQuery({
  args: {
    matchId: v.id("po_matches"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.matchId);
  },
});

/**
 * Patch match with variance diagnosis (for use in actions).
 */
export const patchMatchDiagnosis = internalMutation({
  args: {
    matchId: v.id("po_matches"),
    aiVarianceDiagnosis: v.string(),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) {
      console.warn(`[PO-AI] Match ${args.matchId} not found for diagnosis update`);
      return;
    }
    await ctx.db.patch(args.matchId, {
      aiVarianceDiagnosis: args.aiVarianceDiagnosis,
    });
  },
});

/**
 * Increment AI call counter on matching_settings.
 */
export const incrementAICallCounter = internalMutation({
  args: {
    settingsId: v.id("matching_settings"),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.db.get(args.settingsId);
    if (!settings) return;

    // Reset counter if we're in a new month
    const now = Date.now();
    const lastReset = settings.aiCallsResetAt ?? 0;
    const lastResetDate = new Date(lastReset);
    const currentDate = new Date(now);
    const isNewMonth =
      lastResetDate.getFullYear() !== currentDate.getFullYear() ||
      lastResetDate.getMonth() !== currentDate.getMonth();

    await ctx.db.patch(args.settingsId, {
      aiCallsThisMonth: isNewMonth ? 1 : (settings.aiCallsThisMonth ?? 0) + 1,
      aiCallsResetAt: isNewMonth ? now : settings.aiCallsResetAt,
      updatedAt: now,
    });
  },
});

// ============================================
// TRAINING CORRECTIONS QUERIES
// ============================================

/**
 * Get corrections for training — returns last 50 corrections for a business.
 * Used for few-shot examples in AI matching.
 */
export const getTrainingCorrections = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const corrections = await ctx.db
      .query("po_match_corrections")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .order("desc")
      .collect();

    return corrections.slice(0, 50);
  },
});

/**
 * Count corrections per business — used for DSPy optimization threshold checks.
 */
export const countCorrections = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const corrections = await ctx.db
      .query("po_match_corrections")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    return corrections.length;
  },
});
