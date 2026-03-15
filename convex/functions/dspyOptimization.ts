/**
 * DSPy Optimization — weekly batch optimization via MIPROv2
 *
 * Triggered by cron job. For each platform with ≥100 corrections,
 * runs MIPROv2 optimization on the DSPy Lambda and records results.
 */

import { v } from "convex/values";
import { internalAction, internalQuery } from "../_generated/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _internal: any = require("../_generated/api").internal;
import { callMCPTool } from "../lib/mcpClient";

const MIN_CORRECTIONS_FOR_OPTIMIZATION = 100;

/**
 * Get all platforms that have enough corrections for optimization.
 */
export const getPlatformsReadyForOptimization = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Get all corrections grouped by platform
    const allCorrections = await ctx.db
      .query("fee_classification_corrections")
      .collect();

    const platformCounts = new Map<string, number>();
    for (const c of allCorrections) {
      platformCounts.set(c.platform, (platformCounts.get(c.platform) ?? 0) + 1);
    }

    // Filter platforms with enough corrections
    const readyPlatforms: string[] = [];
    for (const [platform, count] of platformCounts) {
      if (count >= MIN_CORRECTIONS_FOR_OPTIMIZATION) {
        readyPlatforms.push(platform);
      }
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
        feeName: c.originalFeeName,
        originalAccountCode: c.originalAccountCode,
        correctedAccountCode: c.correctedAccountCode,
        platform: c.platform,
      }));
  },
});

/**
 * Trigger optimization for a single platform.
 */
export const triggerOptimization = internalAction({
  args: {
    platform: v.string(),
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
        console.log(`[DSPy] Optimization completed for ${args.platform}: ${result.beforeAccuracy} → ${result.afterAccuracy} (${result.durationMs}ms)`);
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
 * Optimizes all platforms that have enough corrections.
 */
export const weeklyOptimization = internalAction({
  args: {},
  handler: async (ctx) => {
    const platforms = await ctx.runQuery(
      _internal.functions.dspyOptimization.getPlatformsReadyForOptimization as any,
      {}
    );

    console.log(`[DSPy] Weekly optimization: ${platforms.length} platforms ready`);

    for (const platform of platforms) {
      try {
        await ctx.runAction(
          _internal.functions.dspyOptimization.triggerOptimization as any,
          { platform }
        );
      } catch (error) {
        console.error(`[DSPy] Failed to optimize ${platform}:`, error);
      }
    }
  },
});
