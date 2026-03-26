/**
 * Action Center DSPy Optimization Pipeline (033-ai-action-center-dspy)
 *
 * 5-component self-improvement loop:
 * 1. Corrections capture (in actionCenterInsights.updateStatus)
 * 2. Readiness gate (checkReadiness)
 * 3. Training data preparation (getTrainingData)
 * 4. Quality gate + promotion (prepareAndRun)
 * 5. Model loading (getActiveModel)
 */
import { v } from "convex/values";
import { query, internalQuery, internalMutation, internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";

const MIN_CORRECTIONS = 20;
const MIN_UNIQUE_CONTEXTS = 10;
const TRAIN_SPLIT_RATIO = 0.8;
const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const MODULE_NAME = "action-center-relevance";
const PLATFORM_NAME = "action_center";

/**
 * Check if a business has enough corrections for optimization.
 */
export const checkReadiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - SIX_MONTHS_MS;

    // Get all corrections for this business in the last 6 months
    const corrections = await ctx.db
      .query("action_center_corrections")
      .withIndex("by_business", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Filter to 6-month window
    const recentCorrections = corrections.filter((c) => c.createdAt >= cutoff);
    const unconsumed = recentCorrections.filter((c) => !c.consumed);

    // Count unique contexts (category + insightType combos)
    const uniqueContexts = new Set(
      recentCorrections.map((c) => `${c.category}:${c.insightType}`)
    );

    // Per-category stats
    const categoryStats: Record<string, {
      totalCorrections: number;
      unconsumedCorrections: number;
      uniqueContexts: number;
      readyToOptimize: boolean;
    }> = {};

    for (const c of recentCorrections) {
      if (!categoryStats[c.category]) {
        categoryStats[c.category] = {
          totalCorrections: 0,
          unconsumedCorrections: 0,
          uniqueContexts: 0,
          readyToOptimize: false,
        };
      }
      categoryStats[c.category].totalCorrections++;
      if (!c.consumed) categoryStats[c.category].unconsumedCorrections++;
    }

    // Count unique insightTypes per category
    for (const cat of Object.keys(categoryStats)) {
      const catCorrections = recentCorrections.filter((c) => c.category === cat);
      const catContexts = new Set(catCorrections.map((c) => c.insightType));
      categoryStats[cat].uniqueContexts = catContexts.size;
    }

    // Overall readiness: enough total corrections + unique contexts + some unconsumed
    const readyToOptimize =
      recentCorrections.length >= MIN_CORRECTIONS &&
      uniqueContexts.size >= MIN_UNIQUE_CONTEXTS &&
      unconsumed.length > 0;

    return {
      readyToOptimize,
      totalCorrections: recentCorrections.length,
      unconsumedCorrections: unconsumed.length,
      uniqueContexts: uniqueContexts.size,
      stats: categoryStats,
    };
  },
});

/**
 * Get training and validation data with stratified split.
 */
export const getTrainingData = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - SIX_MONTHS_MS;

    const corrections = await ctx.db
      .query("action_center_corrections")
      .withIndex("by_business_consumed", (q) =>
        q.eq("businessId", args.businessId).eq("consumed", false)
      )
      .collect();

    // Filter to 6-month window
    const recent = corrections.filter((c) => c.createdAt >= cutoff);

    // Stratified split by category
    const byCategory: Record<string, typeof recent> = {};
    for (const c of recent) {
      if (!byCategory[c.category]) byCategory[c.category] = [];
      byCategory[c.category].push(c);
    }

    const train: typeof recent = [];
    const validation: typeof recent = [];
    const categorySplit: Record<string, { train: number; validation: number }> = {};

    for (const [cat, items] of Object.entries(byCategory)) {
      const splitIndex = Math.floor(items.length * TRAIN_SPLIT_RATIO);
      const catTrain = items.slice(0, splitIndex);
      const catVal = items.slice(splitIndex);
      train.push(...catTrain);
      validation.push(...catVal);
      categorySplit[cat] = { train: catTrain.length, validation: catVal.length };
    }

    return {
      train: train.map((c) => ({
        _id: c._id,
        insightType: c.insightType,
        category: c.category,
        priority: c.priority,
        isUseful: c.isUseful,
        feedbackText: c.feedbackText,
        originalContext: c.originalContext,
      })),
      validation: validation.map((c) => ({
        _id: c._id,
        insightType: c.insightType,
        category: c.category,
        priority: c.priority,
        isUseful: c.isUseful,
        feedbackText: c.feedbackText,
        originalContext: c.originalContext,
      })),
      totalCorrections: recent.length,
      categorySplit,
      correctionIds: recent.map((c) => c._id),
    };
  },
});

/**
 * Get the active promoted model for a business.
 * Public query (no auth) — returns non-sensitive model metadata only.
 * Needed by model-version-loader.ts which uses ConvexHttpClient.query().
 */
export const getActiveModel = query({
  args: {
    businessId: v.string(),
    module: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const moduleName = args.module || MODULE_NAME;

    const version = await ctx.db
      .query("dspy_model_versions")
      .withIndex("by_module_business_status", (q) =>
        q.eq("module", moduleName).eq("businessId", args.businessId).eq("status", "promoted")
      )
      .first();

    if (!version) {
      return { hasModel: false as const };
    }

    return {
      hasModel: true as const,
      version: {
        _id: version._id,
        versionId: version.versionId || `v${version.version}`,
        s3Key: version.s3Key,
        accuracy: version.accuracy,
        promotedAt: version.promotedAt || version.trainedAt,
        optimizedPrompt: version.optimizedPrompt,
      },
    };
  },
});

/**
 * Mark corrections as consumed after successful model promotion.
 */
export const markCorrectionsConsumed = internalMutation({
  args: {
    correctionIds: v.array(v.id("action_center_corrections")),
    versionId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.correctionIds) {
      await ctx.db.patch(id, {
        consumed: true,
        consumedAt: now,
        consumedByVersion: args.versionId,
      });
    }
    console.log(`[ActionCenterOptimization] Marked ${args.correctionIds.length} corrections consumed by ${args.versionId}`);
  },
});

/**
 * Run the full optimization pipeline for a single business.
 * Called by the EventBridge → scheduled-intelligence Lambda.
 */
export const prepareAndRun = internalAction({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();

    // Step 1: Check readiness
    const readiness = await ctx.runQuery(internal.functions.actionCenterOptimization.checkReadiness, {
      businessId: args.businessId,
    });

    if (!readiness.readyToOptimize) {
      console.log(`[ActionCenterOptimization] Business ${args.businessId} not ready: ${readiness.totalCorrections} corrections, ${readiness.uniqueContexts} unique contexts`);

      // Log the skip
      await ctx.runMutation(internal.functions.actionCenterOptimization.logOptimizationRun, {
        businessId: args.businessId,
        status: "skipped",
        startedAt: startTime,
        completedAt: Date.now(),
        correctionsProcessed: 0,
        reason: `Not ready: ${readiness.totalCorrections}/${MIN_CORRECTIONS} corrections, ${readiness.uniqueContexts}/${MIN_UNIQUE_CONTEXTS} unique contexts`,
      });

      return { status: "skipped" as const };
    }

    // Step 2: Get training data
    const trainingData = await ctx.runQuery(internal.functions.actionCenterOptimization.getTrainingData, {
      businessId: args.businessId,
    });

    // Step 3: Get previous active model (for quality gate comparison)
    const previousModel = await ctx.runQuery(api.functions.actionCenterOptimization.getActiveModel, {
      businessId: args.businessId as string,
    });

    // Step 4: Invoke DSPy optimizer Lambda
    let lambdaResult: any;
    try {
      const lambdaPayload = {
        method: "tools/call",
        params: {
          name: "optimize_action_center_model",
          arguments: {
            module: MODULE_NAME,
            businessId: args.businessId,
            train: trainingData.train,
            validation: trainingData.validation,
            previousS3Key: previousModel.hasModel ? previousModel.version?.s3Key : undefined,
            previousAccuracy: previousModel.hasModel ? previousModel.version?.accuracy : undefined,
          },
        },
      };

      // Call DSPy optimizer Lambda via HTTP
      const convexUrl = process.env.CONVEX_CLOUD_URL || "https://kindhearted-lynx-129.convex.cloud";
      const lambdaUrl = process.env.DSPY_OPTIMIZER_URL;

      if (!lambdaUrl) {
        throw new Error("DSPY_OPTIMIZER_URL not configured");
      }

      const response = await fetch(lambdaUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Key": process.env.MCP_INTERNAL_SERVICE_KEY || "",
        },
        body: JSON.stringify(lambdaPayload),
      });

      if (!response.ok) {
        throw new Error(`Lambda returned ${response.status}: ${await response.text()}`);
      }

      lambdaResult = await response.json();

      if (lambdaResult.error) {
        throw new Error(lambdaResult.error.message || "Lambda error");
      }

      lambdaResult = lambdaResult.result?.content?.[0]?.text
        ? JSON.parse(lambdaResult.result.content[0].text)
        : lambdaResult.result;
    } catch (error: any) {
      console.error(`[ActionCenterOptimization] Lambda error:`, error.message);

      await ctx.runMutation(internal.functions.actionCenterOptimization.logOptimizationRun, {
        businessId: args.businessId,
        status: "failed",
        startedAt: startTime,
        completedAt: Date.now(),
        correctionsProcessed: trainingData.totalCorrections,
        reason: error.message,
      });

      return { status: "failed" as const, errorMessage: error.message };
    }

    // Step 5: Create model version + quality gate
    const versionId = `v${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now() % 10000}`;
    const qualityGateResult = lambdaResult.qualityGateResult || {
      passed: previousModel.hasModel
        ? lambdaResult.accuracy > (previousModel.version?.accuracy || 0)
        : true, // Auto-pass first run
      candidateAccuracy: lambdaResult.accuracy,
      previousAccuracy: previousModel.hasModel ? previousModel.version?.accuracy : undefined,
      accuracyDelta: previousModel.hasModel
        ? lambdaResult.accuracy - (previousModel.version?.accuracy || 0)
        : undefined,
      evalSetSize: trainingData.validation.length,
    };

    // Create candidate version
    const modelVersionId = await ctx.runMutation(internal.functions.actionCenterOptimization.createModelVersion, {
      platform: PLATFORM_NAME,
      module: MODULE_NAME,
      businessId: args.businessId,
      versionId,
      s3Key: lambdaResult.s3Key || `dspy-models/${MODULE_NAME}/${args.businessId}/${versionId}.json`,
      accuracy: lambdaResult.accuracy,
      trainingExamples: trainingData.train.length,
      validationExamples: trainingData.validation.length,
      optimizerType: "bootstrapfewshot",
      qualityGateResult,
      optimizedPrompt: lambdaResult.optimizedPrompt,
      status: qualityGateResult.passed ? "promoted" : "rejected",
    });

    // Step 6: If promoted, supersede previous + mark corrections consumed
    if (qualityGateResult.passed) {
      if (previousModel.hasModel && previousModel.version?._id) {
        await ctx.runMutation(internal.functions.actionCenterOptimization.supersedePreviousVersion, {
          previousVersionId: previousModel.version._id,
          supersededBy: versionId,
        });
      }

      await ctx.runMutation(internal.functions.actionCenterOptimization.markCorrectionsConsumed, {
        correctionIds: trainingData.correctionIds,
        versionId,
      });
    }

    // Step 7: Log optimization run
    await ctx.runMutation(internal.functions.actionCenterOptimization.logOptimizationRun, {
      businessId: args.businessId,
      status: qualityGateResult.passed ? "promoted" : "rejected",
      startedAt: startTime,
      completedAt: Date.now(),
      correctionsProcessed: trainingData.totalCorrections,
      accuracy: lambdaResult.accuracy,
      previousAccuracy: previousModel.hasModel ? previousModel.version?.accuracy : undefined,
      reason: qualityGateResult.passed
        ? `Promoted: ${lambdaResult.accuracy.toFixed(3)} > ${previousModel.version?.accuracy?.toFixed(3) || "N/A"}`
        : `Rejected: ${lambdaResult.accuracy.toFixed(3)} <= ${previousModel.version?.accuracy?.toFixed(3) || "N/A"}`,
      modelVersionId,
    });

    console.log(`[ActionCenterOptimization] Business ${args.businessId}: ${qualityGateResult.passed ? "PROMOTED" : "REJECTED"} (accuracy: ${lambdaResult.accuracy.toFixed(3)})`);

    return {
      status: qualityGateResult.passed ? "promoted" as const : "rejected" as const,
      accuracy: lambdaResult.accuracy,
      previousAccuracy: previousModel.hasModel ? previousModel.version?.accuracy : undefined,
      correctionsProcessed: trainingData.totalCorrections,
    };
  },
});

/**
 * Create a new model version record.
 */
export const createModelVersion = internalMutation({
  args: {
    platform: v.string(),
    module: v.string(),
    businessId: v.string(),
    versionId: v.string(),
    s3Key: v.string(),
    accuracy: v.number(),
    trainingExamples: v.number(),
    validationExamples: v.optional(v.number()),
    optimizerType: v.string(),
    qualityGateResult: v.any(),
    optimizedPrompt: v.optional(v.string()),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get next version number for this platform
    const existing = await ctx.db
      .query("dspy_model_versions")
      .withIndex("by_platform_status", (q) => q.eq("platform", args.platform))
      .collect();
    const maxVersion = existing.reduce((max, v) => Math.max(max, v.version), 0);

    return await ctx.db.insert("dspy_model_versions", {
      platform: args.platform,
      module: args.module,
      businessId: args.businessId,
      version: maxVersion + 1,
      versionId: args.versionId,
      s3Key: args.s3Key,
      status: args.status,
      accuracy: args.accuracy,
      trainingExamples: args.trainingExamples,
      validationExamples: args.validationExamples,
      correctionsConsumed: args.trainingExamples,
      optimizerType: args.optimizerType,
      trainedAt: now,
      qualityGateResult: args.qualityGateResult,
      optimizedPrompt: args.optimizedPrompt,
      promotedAt: args.status === "promoted" ? now : undefined,
    });
  },
});

/**
 * Supersede a previous model version.
 */
export const supersedePreviousVersion = internalMutation({
  args: {
    previousVersionId: v.id("dspy_model_versions"),
    supersededBy: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.previousVersionId, {
      status: "superseded",
      supersededBy: args.supersededBy,
    });
  },
});

/**
 * Log an optimization run to the audit table.
 */
export const logOptimizationRun = internalMutation({
  args: {
    businessId: v.string(),
    status: v.string(),
    startedAt: v.number(),
    completedAt: v.number(),
    correctionsProcessed: v.number(),
    accuracy: v.optional(v.number()),
    previousAccuracy: v.optional(v.number()),
    reason: v.optional(v.string()),
    modelVersionId: v.optional(v.id("dspy_model_versions")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("dspy_optimization_logs", {
      platform: `${PLATFORM_NAME}:${args.businessId}`,
      optimizerType: "bootstrapfewshot",
      startedAt: args.startedAt,
      completedAt: args.completedAt,
      status: args.status === "promoted" ? "completed" : args.status,
      beforeAccuracy: args.previousAccuracy,
      afterAccuracy: args.accuracy,
      trainingExamples: args.correctionsProcessed,
      errorMessage: args.status === "failed" ? args.reason : undefined,
      modelVersionId: args.modelVersionId,
    });
  },
});
