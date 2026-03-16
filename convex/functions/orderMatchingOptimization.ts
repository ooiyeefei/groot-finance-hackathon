/**
 * Order Matching DSPy Optimization — weekly batch optimization via MIPROv2
 *
 * Triggered by cron job. For each business with enough corrections,
 * runs MIPROv2 optimization on the DSPy Lambda and records results.
 *
 * Safeguards:
 * 1. Minimum volume: ≥100 total corrections
 * 2. Minimum diversity: ≥15 unique customer names
 * 3. New data only: skips if no new corrections since last optimization
 */

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _internal: any = require("../_generated/api").internal;
import { callMCPTool } from "../lib/mcpClient";

const MIN_CORRECTIONS_FOR_OPTIMIZATION = 100;
const MIN_UNIQUE_CUSTOMERS = 15;

/**
 * Get businesses ready for AR matching optimization.
 */
export const getBusinessesReadyForOptimization = internalQuery({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const allCorrections = await ctx.db
      .query("order_matching_corrections")
      .collect();

    // Group by businessId
    const businessData = new Map<string, {
      businessId: string;
      count: number;
      uniqueCustomers: Set<string>;
      latestCorrectionId: string;
    }>();

    for (const c of allCorrections) {
      const bizId = c.businessId as string;
      const existing = businessData.get(bizId) ?? {
        businessId: bizId,
        count: 0,
        uniqueCustomers: new Set<string>(),
        latestCorrectionId: "",
      };
      existing.count++;
      existing.uniqueCustomers.add(c.orderCustomerName.toLowerCase().trim());
      if (c._id > existing.latestCorrectionId) {
        existing.latestCorrectionId = c._id;
      }
      businessData.set(bizId, existing);
    }

    const readyBusinesses: Array<{
      businessId: string;
      totalCorrections: number;
      uniqueCustomers: number;
      latestCorrectionId: string;
      reason: string;
    }> = [];

    for (const [bizId, data] of businessData) {
      if (data.count < MIN_CORRECTIONS_FOR_OPTIMIZATION && !args.force) continue;
      if (data.uniqueCustomers.size < MIN_UNIQUE_CUSTOMERS && !args.force) continue;

      const platformKey = `ar_match_${bizId}`;
      const activeModel = await ctx.db
        .query("dspy_model_versions")
        .withIndex("by_platform_status", (q) =>
          q.eq("platform", platformKey).eq("status", "active")
        )
        .first();

      if (activeModel?.lastCorrectionId && activeModel.lastCorrectionId >= data.latestCorrectionId && !args.force) {
        continue;
      }

      readyBusinesses.push({
        businessId: bizId,
        totalCorrections: data.count,
        uniqueCustomers: data.uniqueCustomers.size,
        latestCorrectionId: data.latestCorrectionId,
        reason: `${data.count} corrections, ${data.uniqueCustomers.size} unique customers`,
      });
    }

    return readyBusinesses;
  },
});

/**
 * Get all corrections for a business (training data).
 */
export const getAllCorrectionsForBusiness = internalQuery({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const corrections = await ctx.db
      .query("order_matching_corrections")
      .collect();

    return corrections
      .filter((c) => (c.businessId as string) === args.businessId)
      .map((c) => ({
        _id: c._id,
        orderCustomerName: c.orderCustomerName,
        orderAmount: c.orderAmount,
        orderDate: c.orderDate,
        correctedInvoiceCustomerName: c.correctedInvoiceCustomerName,
        correctedInvoiceAmount: c.correctedInvoiceAmount,
        correctionType: c.correctionType,
      }));
  },
});

/**
 * Mark optimization consumed for a business.
 */
export const markOptimizationConsumed = internalMutation({
  args: {
    businessId: v.string(),
    lastCorrectionId: v.string(),
  },
  handler: async (ctx, args) => {
    const platformKey = `ar_match_${args.businessId}`;
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
    const corrections = await ctx.runQuery(
      _internal.functions.orderMatchingOptimization.getAllCorrectionsForBusiness,
      { businessId: args.businessId }
    );

    if (corrections.length < MIN_CORRECTIONS_FOR_OPTIMIZATION) {
      console.log(`[AR Match DSPy] Skipping business ${args.businessId}: only ${corrections.length} corrections`);
      return;
    }

    const activeModel = await ctx.runQuery(
      _internal.functions.dspyModelVersions.getActiveModel,
      { platform: `ar_match_${args.businessId}` }
    );

    interface OptimizeResult {
      success: boolean;
      newModelS3Key?: string;
      beforeAccuracy: number;
      afterAccuracy?: number;
      trainingExamples: number;
      testSetSize: number;
      improved: boolean;
      errorMessage?: string;
    }

    try {
      const result = await callMCPTool<OptimizeResult>({
        toolName: "optimize_ar_match_model",
        businessId: args.businessId,
        args: {
          corrections,
          currentModelS3Key: activeModel?.s3Key ?? null,
        },
      });

      if (!result) {
        console.error(`[AR Match DSPy] Optimization returned null for business ${args.businessId}`);
        return;
      }

      if (result.success && result.newModelS3Key) {
        await ctx.runMutation(
          _internal.functions.dspyModelVersions.recordTrainingResult,
          {
            platform: `ar_match_${args.businessId}`,
            s3Key: result.newModelS3Key,
            accuracy: result.afterAccuracy ?? 0,
            trainingExamples: result.trainingExamples,
            optimizerType: "miprov2",
            beforeAccuracy: result.beforeAccuracy,
          }
        );

        await ctx.runMutation(
          _internal.functions.orderMatchingOptimization.markOptimizationConsumed,
          {
            businessId: args.businessId,
            lastCorrectionId: args.latestCorrectionId,
          }
        );

        console.log(`[AR Match DSPy] Optimization completed for business ${args.businessId}: ${result.beforeAccuracy} -> ${result.afterAccuracy}`);
      }
    } catch (error) {
      console.error(`[AR Match DSPy] Optimization failed for business ${args.businessId}:`, error);
    }
  },
});

/**
 * Weekly optimization runner — called by cron.
 */
export const weeklyOptimization = internalAction({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const businesses = await ctx.runQuery(
      _internal.functions.orderMatchingOptimization.getBusinessesReadyForOptimization as any,
      { force: args.force ?? false }
    );

    console.log(`[AR Match DSPy] Weekly optimization: ${(businesses as any[]).length} businesses ready`);

    for (const biz of businesses as Array<{ businessId: string; latestCorrectionId: string }>) {
      try {
        await ctx.runAction(
          _internal.functions.orderMatchingOptimization.triggerOptimization as any,
          { businessId: biz.businessId, latestCorrectionId: biz.latestCorrectionId }
        );
      } catch (error) {
        console.error(`[AR Match DSPy] Failed to optimize business ${biz.businessId}:`, error);
      }
    }
  },
});
