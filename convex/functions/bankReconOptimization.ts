/**
 * Bank Recon DSPy Optimization — weekly batch optimization via MIPROv2
 *
 * Triggered by cron job. For each business with enough NEW corrections,
 * runs MIPROv2 optimization on the DSPy Lambda and records results.
 *
 * Safeguards:
 * 1. Minimum volume: ≥20 total corrections for the business
 * 2. Minimum diversity: ≥10 unique descriptions in corrections (prevents overfitting)
 * 3. New data only: skips if no new corrections since last optimization
 *
 * Follows the same pattern as dspyOptimization.ts (fee classification).
 * Key difference: bank recon is per-business, fee classification is per-platform.
 */

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _internal: any = require("../_generated/api").internal;
import { callMCPTool } from "../lib/mcpClient";

const MIN_CORRECTIONS_FOR_OPTIMIZATION = 20;
const MIN_UNIQUE_DESCRIPTIONS = 10;

/**
 * Get businesses ready for optimization — checks volume, diversity, and new data.
 */
export const getBusinessesReadyForOptimization = internalQuery({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const allCorrections = await ctx.db
      .query("bank_recon_corrections")
      .collect();

    // Group by businessId
    const businessData = new Map<string, {
      businessId: string;
      count: number;
      uniqueDescriptions: Set<string>;
      latestCorrectionId: string;
    }>();

    for (const c of allCorrections) {
      const bizId = c.businessId as string;
      const existing = businessData.get(bizId) ?? {
        businessId: bizId,
        count: 0,
        uniqueDescriptions: new Set<string>(),
        latestCorrectionId: "",
      };
      existing.count++;
      existing.uniqueDescriptions.add(c.bankTransactionDescription.toLowerCase().trim());
      // Track latest correction ID (Convex IDs are sortable)
      if (c._id > existing.latestCorrectionId) {
        existing.latestCorrectionId = c._id;
      }
      businessData.set(bizId, existing);
    }

    const readyBusinesses: Array<{
      businessId: string;
      totalCorrections: number;
      uniqueDescriptions: number;
      latestCorrectionId: string;
      reason: string;
    }> = [];

    const skippedBusinesses: Array<{ businessId: string; reason: string }> = [];

    for (const [bizId, data] of businessData) {
      // Check 1: Minimum volume
      if (data.count < MIN_CORRECTIONS_FOR_OPTIMIZATION && !args.force) {
        skippedBusinesses.push({
          businessId: bizId,
          reason: `Only ${data.count} corrections (need ${MIN_CORRECTIONS_FOR_OPTIMIZATION})`,
        });
        continue;
      }

      // Check 2: Minimum diversity (prevents overfitting to same few descriptions)
      if (data.uniqueDescriptions.size < MIN_UNIQUE_DESCRIPTIONS && !args.force) {
        skippedBusinesses.push({
          businessId: bizId,
          reason: `Only ${data.uniqueDescriptions.size} unique descriptions (need ${MIN_UNIQUE_DESCRIPTIONS})`,
        });
        continue;
      }

      // Check 3: New data since last optimization
      // For bank recon, we use platform="bank_recon_{businessId}" in dspy_model_versions
      const platformKey = `bank_recon_${bizId}`;
      const activeModel = await ctx.db
        .query("dspy_model_versions")
        .withIndex("by_platform_status", (q) =>
          q.eq("platform", platformKey).eq("status", "active")
        )
        .first();

      if (activeModel?.lastCorrectionId && activeModel.lastCorrectionId >= data.latestCorrectionId && !args.force) {
        skippedBusinesses.push({
          businessId: bizId,
          reason: `No new corrections since last optimization (lastCorrectionId: ${activeModel.lastCorrectionId})`,
        });
        continue;
      }

      readyBusinesses.push({
        businessId: bizId,
        totalCorrections: data.count,
        uniqueDescriptions: data.uniqueDescriptions.size,
        latestCorrectionId: data.latestCorrectionId,
        reason: activeModel?.lastCorrectionId
          ? `${data.count} corrections, ${data.uniqueDescriptions.size} unique descriptions, new data since last optimization`
          : `${data.count} corrections, ${data.uniqueDescriptions.size} unique descriptions, first optimization`,
      });
    }

    // Log skips for visibility
    for (const skip of skippedBusinesses) {
      console.log(`[BankRecon DSPy] Skipping business ${skip.businessId}: ${skip.reason}`);
    }

    return readyBusinesses;
  },
});

/**
 * Get all corrections for a business (for training data).
 */
export const getAllCorrectionsForBusiness = internalQuery({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const corrections = await ctx.db
      .query("bank_recon_corrections")
      .collect();

    return corrections
      .filter((c) => (c.businessId as string) === args.businessId)
      .map((c) => ({
        _id: c._id,
        description: c.bankTransactionDescription,
        bankName: c.bankName,
        originalDebitAccountCode: c.originalDebitAccountCode,
        originalCreditAccountCode: c.originalCreditAccountCode,
        correctedDebitAccountCode: c.correctedDebitAccountCode,
        correctedCreditAccountCode: c.correctedCreditAccountCode,
        correctionType: c.correctionType,
      }));
  },
});

/**
 * Get latest active model for a business (bank_recon domain).
 */
export const getLatestModel = internalQuery({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const platformKey = `bank_recon_${args.businessId}`;
    const model = await ctx.db
      .query("dspy_model_versions")
      .withIndex("by_platform_status", (q) =>
        q.eq("platform", platformKey).eq("status", "active")
      )
      .first();

    if (!model) return null;

    return {
      version: model.version,
      s3Key: model.s3Key,
      accuracy: model.accuracy,
      trainingExamples: model.trainingExamples,
      trainedAt: model.trainedAt,
      lastCorrectionId: model.lastCorrectionId ?? null,
    };
  },
});

/**
 * Record the lastCorrectionId on the active model after optimization.
 */
export const markOptimizationConsumed = internalMutation({
  args: {
    businessId: v.string(),
    lastCorrectionId: v.string(),
  },
  handler: async (ctx, args) => {
    const platformKey = `bank_recon_${args.businessId}`;
    const activeModel = await ctx.db
      .query("dspy_model_versions")
      .withIndex("by_platform_status", (q) =>
        q.eq("platform", platformKey).eq("status", "active")
      )
      .first();

    if (activeModel) {
      await ctx.db.patch(activeModel._id, {
        lastCorrectionId: args.lastCorrectionId,
      });
    }
  },
});

/**
 * Trigger optimization for a single business.
 */
export const triggerOptimization = internalAction({
  args: {
    businessId: v.string(),
    latestCorrectionId: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Get all corrections for this business
    const corrections = await ctx.runQuery(
      _internal.functions.bankReconOptimization.getAllCorrectionsForBusiness,
      { businessId: args.businessId }
    );

    if (corrections.length < MIN_CORRECTIONS_FOR_OPTIMIZATION) {
      console.log(`[BankRecon DSPy] Skipping business ${args.businessId}: only ${corrections.length} corrections (need ${MIN_CORRECTIONS_FOR_OPTIMIZATION})`);
      return;
    }

    // 2. Get current active model
    const activeModel = await ctx.runQuery(
      _internal.functions.bankReconOptimization.getLatestModel,
      { businessId: args.businessId }
    );

    // 3. Call optimize_bank_recon_model on DSPy Lambda via MCP
    interface OptimizeResult {
      success: boolean;
      newModelS3Key?: string;
      beforeAccuracy: number;
      afterAccuracy?: number;
      trainingExamples: number;
      testSetSize: number;
      optimizerType: string;
      errorMessage?: string;
      durationMs: number;
    }

    try {
      const result = await callMCPTool<OptimizeResult>({
        toolName: "optimize_bank_recon_model",
        businessId: args.businessId,
        args: {
          corrections,
          currentModelS3Key: activeModel?.s3Key ?? null,
          optimizerType: "miprov2",
        },
      });

      if (!result) {
        console.error(`[BankRecon DSPy] Optimization returned null for business ${args.businessId}`);
        return;
      }

      // 4. Record result in Convex
      if (result.success && result.newModelS3Key) {
        const platformKey = `bank_recon_${args.businessId}`;
        await ctx.runMutation(
          _internal.functions.dspyModelVersions.recordTrainingResult,
          {
            platform: platformKey,
            s3Key: result.newModelS3Key,
            accuracy: result.afterAccuracy ?? 0,
            trainingExamples: result.trainingExamples,
            optimizerType: "miprov2",
            beforeAccuracy: result.beforeAccuracy,
          }
        );

        // 5. Mark corrections as consumed (prevents re-optimizing same data)
        await ctx.runMutation(
          _internal.functions.bankReconOptimization.markOptimizationConsumed,
          {
            businessId: args.businessId,
            lastCorrectionId: args.latestCorrectionId,
          }
        );

        console.log(
          `[BankRecon DSPy] Optimization completed for business ${args.businessId}: ${result.beforeAccuracy} -> ${result.afterAccuracy} (${result.durationMs}ms, consumed up to ${args.latestCorrectionId})`
        );
      } else {
        console.warn(`[BankRecon DSPy] Optimization did not improve for business ${args.businessId}: ${result.errorMessage}`);
      }
    } catch (error) {
      console.error(`[BankRecon DSPy] Optimization failed for business ${args.businessId}:`, error);
    }
  },
});

/**
 * Weekly optimization runner — called by cron.
 * Checks safeguards (volume, diversity, new data) before optimizing each business.
 */
export const weeklyOptimization = internalAction({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const businesses = await ctx.runQuery(
      _internal.functions.bankReconOptimization.getBusinessesReadyForOptimization as any,
      { force: args.force ?? false }
    );

    console.log(`[BankRecon DSPy] Weekly optimization: ${businesses.length} businesses ready`);

    for (const biz of businesses as Array<{ businessId: string; latestCorrectionId: string; reason: string }>) {
      console.log(`[BankRecon DSPy] Optimizing business ${biz.businessId}: ${biz.reason}`);
      try {
        await ctx.runAction(
          _internal.functions.bankReconOptimization.triggerOptimization as any,
          { businessId: biz.businessId, latestCorrectionId: biz.latestCorrectionId }
        );
      } catch (error) {
        console.error(`[BankRecon DSPy] Failed to optimize business ${biz.businessId}:`, error);
      }
    }
  },
});
