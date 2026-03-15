/**
 * DSPy Optimization — weekly batch optimization via MIPROv2
 *
 * Triggered by cron job. For each platform with enough NEW corrections,
 * runs MIPROv2 optimization on the DSPy Lambda and records results.
 *
 * Safeguards:
 * 1. Minimum diversity: ≥10 unique fee names in corrections (prevents overfitting)
 * 2. New data only: skips if no new corrections since last optimization
 * 3. Minimum volume: ≥100 total corrections for the platform
 */

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _internal: any = require("../_generated/api").internal;
import { callMCPTool } from "../lib/mcpClient";

const MIN_CORRECTIONS_FOR_OPTIMIZATION = 100;
const MIN_UNIQUE_FEE_NAMES = 10;

/**
 * Get platforms ready for optimization — checks volume, diversity, and new data.
 */
export const getPlatformsReadyForOptimization = internalQuery({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const allCorrections = await ctx.db
      .query("fee_classification_corrections")
      .collect();

    // Group by platform
    const platformData = new Map<string, {
      count: number;
      uniqueFeeNames: Set<string>;
      latestCorrectionId: string;
    }>();

    for (const c of allCorrections) {
      const existing = platformData.get(c.platform) ?? {
        count: 0,
        uniqueFeeNames: new Set<string>(),
        latestCorrectionId: "",
      };
      existing.count++;
      existing.uniqueFeeNames.add(c.originalFeeName.toLowerCase());
      // Track latest correction ID (Convex IDs are sortable)
      if (c._id > existing.latestCorrectionId) {
        existing.latestCorrectionId = c._id;
      }
      platformData.set(c.platform, existing);
    }

    const readyPlatforms: Array<{
      platform: string;
      totalCorrections: number;
      uniqueFeeNames: number;
      latestCorrectionId: string;
      reason: string;
    }> = [];

    const skippedPlatforms: Array<{ platform: string; reason: string }> = [];

    for (const [platform, data] of platformData) {
      // Check 1: Minimum volume
      if (data.count < MIN_CORRECTIONS_FOR_OPTIMIZATION && !args.force) {
        skippedPlatforms.push({
          platform,
          reason: `Only ${data.count} corrections (need ${MIN_CORRECTIONS_FOR_OPTIMIZATION})`,
        });
        continue;
      }

      // Check 2: Minimum diversity (prevents overfitting to same few fees)
      if (data.uniqueFeeNames.size < MIN_UNIQUE_FEE_NAMES && !args.force) {
        skippedPlatforms.push({
          platform,
          reason: `Only ${data.uniqueFeeNames.size} unique fee names (need ${MIN_UNIQUE_FEE_NAMES})`,
        });
        continue;
      }

      // Check 3: New data since last optimization
      const activeModel = await ctx.db
        .query("dspy_model_versions")
        .withIndex("by_platform_status", (q) =>
          q.eq("platform", platform).eq("status", "active")
        )
        .first();

      if (activeModel?.lastCorrectionId && activeModel.lastCorrectionId >= data.latestCorrectionId && !args.force) {
        skippedPlatforms.push({
          platform,
          reason: `No new corrections since last optimization (lastCorrectionId: ${activeModel.lastCorrectionId})`,
        });
        continue;
      }

      readyPlatforms.push({
        platform,
        totalCorrections: data.count,
        uniqueFeeNames: data.uniqueFeeNames.size,
        latestCorrectionId: data.latestCorrectionId,
        reason: activeModel?.lastCorrectionId
          ? `${data.count} corrections, ${data.uniqueFeeNames.size} unique fees, new data since last optimization`
          : `${data.count} corrections, ${data.uniqueFeeNames.size} unique fees, first optimization`,
      });
    }

    // Log skips for visibility
    for (const skip of skippedPlatforms) {
      console.log(`[DSPy] Skipping ${skip.platform}: ${skip.reason}`);
    }

    return readyPlatforms;
  },
});

/**
 * Get all corrections for a platform (pooled across all businesses).
 */
export const getAllCorrectionsForPlatform = internalQuery({
  args: {
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const corrections = await ctx.db
      .query("fee_classification_corrections")
      .collect();

    return corrections
      .filter((c) => c.platform === args.platform)
      .map((c) => ({
        _id: c._id,
        feeName: c.originalFeeName,
        originalAccountCode: c.originalAccountCode,
        correctedAccountCode: c.correctedAccountCode,
        platform: c.platform,
      }));
  },
});

/**
 * Record the lastCorrectionId on the active model after optimization.
 */
export const markOptimizationConsumed = internalMutation({
  args: {
    platform: v.string(),
    lastCorrectionId: v.string(),
  },
  handler: async (ctx, args) => {
    const activeModel = await ctx.db
      .query("dspy_model_versions")
      .withIndex("by_platform_status", (q) =>
        q.eq("platform", args.platform).eq("status", "active")
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
 * Trigger optimization for a single platform.
 */
export const triggerOptimization = internalAction({
  args: {
    platform: v.string(),
    latestCorrectionId: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Get all corrections for this platform
    const corrections = await ctx.runQuery(_internal.functions.dspyOptimization.getAllCorrectionsForPlatform, { platform: args.platform });

    if (corrections.length < MIN_CORRECTIONS_FOR_OPTIMIZATION) {
      console.log(`[DSPy] Skipping ${args.platform}: only ${corrections.length} corrections (need ${MIN_CORRECTIONS_FOR_OPTIMIZATION})`);
      return;
    }

    // 2. Get current active model
    const activeModel = await ctx.runQuery(
      _internal.functions.dspyModelVersions.getActiveModel,
      { platform: args.platform }
    );

    // 3. Call optimize_model on DSPy Lambda
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
        toolName: "optimize_model",
        businessId: "_system",
        args: {
          platform: args.platform,
          corrections,
          currentModelS3Key: activeModel?.s3Key ?? null,
          optimizerType: "miprov2",
        },
      });

      if (!result) {
        console.error(`[DSPy] Optimization returned null for ${args.platform}`);
        return;
      }

      // 4. Record result in Convex
      if (result.success && result.newModelS3Key) {
        await ctx.runMutation(
          _internal.functions.dspyModelVersions.recordTrainingResult,
          {
            platform: args.platform,
            s3Key: result.newModelS3Key,
            accuracy: result.afterAccuracy ?? 0,
            trainingExamples: result.trainingExamples,
            optimizerType: "miprov2",
            beforeAccuracy: result.beforeAccuracy,
          }
        );

        // 5. Mark corrections as consumed (prevents re-optimizing same data)
        await ctx.runMutation(
          _internal.functions.dspyOptimization.markOptimizationConsumed,
          {
            platform: args.platform,
            lastCorrectionId: args.latestCorrectionId,
          }
        );

        console.log(`[DSPy] Optimization completed for ${args.platform}: ${result.beforeAccuracy} → ${result.afterAccuracy} (${result.durationMs}ms, consumed up to ${args.latestCorrectionId})`);
      } else {
        console.warn(`[DSPy] Optimization did not improve for ${args.platform}: ${result.errorMessage}`);
      }
    } catch (error) {
      console.error(`[DSPy] Optimization failed for ${args.platform}:`, error);
    }
  },
});

/**
 * Weekly optimization runner — called by cron.
 * Checks safeguards (volume, diversity, new data) before optimizing.
 */
export const weeklyOptimization = internalAction({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const platforms = await ctx.runQuery(
      _internal.functions.dspyOptimization.getPlatformsReadyForOptimization as any,
      { force: args.force ?? false }
    );

    console.log(`[DSPy] Weekly optimization: ${platforms.length} platforms ready`);

    for (const pinfo of platforms as Array<{ platform: string; latestCorrectionId: string; reason: string }>) {
      console.log(`[DSPy] Optimizing ${pinfo.platform}: ${pinfo.reason}`);
      try {
        await ctx.runAction(
          _internal.functions.dspyOptimization.triggerOptimization as any,
          { platform: pinfo.platform, latestCorrectionId: pinfo.latestCorrectionId }
        );
      } catch (error) {
        console.error(`[DSPy] Failed to optimize ${pinfo.platform}:`, error);
      }
    }
  },
});
