/**
 * DSPy Model Versions — tracks trained model state files per platform
 *
 * Enables version tracking, accuracy comparison, and automatic rollback
 * when optimization produces worse results.
 */

import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";

/**
 * Get the currently active model for a platform.
 */
export const getActiveModel = internalQuery({
  args: {
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const model = await ctx.db
      .query("dspy_model_versions")
      .withIndex("by_platform_status", (q) =>
        q.eq("platform", args.platform).eq("status", "active")
      )
      .first();

    if (!model) return null;

    return {
      version: model.version,
      s3Key: model.s3Key,
      accuracy: model.accuracy,
      trainingExamples: model.trainingExamples,
      trainedAt: model.trainedAt,
    };
  },
});

/**
 * Record a training result. If accuracy improves, activate the new model
 * and deactivate the previous one. If accuracy is worse, mark as failed.
 */
export const recordTrainingResult = internalMutation({
  args: {
    platform: v.string(),
    s3Key: v.string(),
    accuracy: v.number(),
    trainingExamples: v.number(),
    optimizerType: v.string(),
    beforeAccuracy: v.number(),
  },
  handler: async (ctx, args) => {
    // Find current active model
    const currentActive = await ctx.db
      .query("dspy_model_versions")
      .withIndex("by_platform_status", (q) =>
        q.eq("platform", args.platform).eq("status", "active")
      )
      .first();

    const nextVersion = currentActive ? currentActive.version + 1 : 1;
    const improved = args.accuracy > args.beforeAccuracy;

    // Insert new model version
    const modelId = await ctx.db.insert("dspy_model_versions", {
      platform: args.platform,
      version: nextVersion,
      s3Key: args.s3Key,
      status: improved ? "active" : "failed",
      trainingExamples: args.trainingExamples,
      accuracy: args.accuracy,
      previousVersion: currentActive?.version ?? undefined,
      optimizerType: args.optimizerType,
      trainedAt: Date.now(),
    });

    // If improved, deactivate the previous model
    if (improved && currentActive) {
      await ctx.db.patch(currentActive._id, { status: "inactive" });
    }

    // Log the optimization
    await ctx.db.insert("dspy_optimization_logs", {
      platform: args.platform,
      optimizerType: args.optimizerType,
      startedAt: Date.now(),
      completedAt: Date.now(),
      status: improved ? "completed" : "failed",
      beforeAccuracy: args.beforeAccuracy,
      afterAccuracy: args.accuracy,
      trainingExamples: args.trainingExamples,
      testSetSize: Math.ceil(args.trainingExamples * 0.2),
      errorMessage: improved ? undefined : "Optimization did not improve accuracy",
      modelVersionId: modelId,
    });

    return {
      modelId,
      version: nextVersion,
      improved,
      accuracy: args.accuracy,
    };
  },
});

/**
 * Rollback to a specific model version for a platform.
 */
export const rollback = internalMutation({
  args: {
    platform: v.string(),
    targetVersion: v.number(),
  },
  handler: async (ctx, args) => {
    // Find target version
    const target = await ctx.db
      .query("dspy_model_versions")
      .withIndex("by_platform_version", (q) =>
        q.eq("platform", args.platform).eq("version", args.targetVersion)
      )
      .first();

    if (!target) {
      throw new Error(`Model version ${args.targetVersion} not found for ${args.platform}`);
    }

    // Find current active
    const currentActive = await ctx.db
      .query("dspy_model_versions")
      .withIndex("by_platform_status", (q) =>
        q.eq("platform", args.platform).eq("status", "active")
      )
      .first();

    // Swap statuses
    if (currentActive) {
      await ctx.db.patch(currentActive._id, { status: "inactive" });
    }
    await ctx.db.patch(target._id, { status: "active" });

    return {
      rolledBackFrom: currentActive?.version,
      rolledBackTo: args.targetVersion,
    };
  },
});
