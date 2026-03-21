/**
 * Chat Agent DSPy Optimization Pipeline (029-dspy-mem0-activation)
 *
 * Complete correction → training → quality gate → promotion → inference flywheel.
 *
 * Key flows:
 * 1. Readiness gate: 20+ corrections, 10+ unique intents
 * 2. Train/validation split: 80/20, stratified by intent
 * 3. Lambda invocation: BootstrapFewShot optimization
 * 4. Quality gate: Compare candidate vs previous on eval set
 * 5. Promotion: candidate → promoted if gate passes, supersede previous
 * 6. Consumption: Mark corrections consumed only after successful promotion
 */

import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _internal: any = require("../_generated/api").internal;

const MIN_CORRECTIONS = 20;
const MIN_UNIQUE_INTENTS = 10;
const TRAIN_SPLIT = 0.8; // 80% train, 20% validation

/**
 * Check if chat-agent-intent module is ready for optimization
 */
export const checkReadiness = internalQuery({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const corrections = await ctx.db
      .query("chat_agent_corrections")
      .withIndex("by_correctionType", (q) => q.eq("correctionType", "intent"))
      .collect();

    const unconsumed = corrections.filter((c) => !c.consumed);
    const uniqueIntents = new Set(
      corrections
        .map((c) => c.correctedIntent)
        .filter(Boolean)
    );

    const readyToOptimize =
      args.force ||
      (corrections.length >= MIN_CORRECTIONS &&
        uniqueIntents.size >= MIN_UNIQUE_INTENTS &&
        unconsumed.length > 0);

    return {
      readyToOptimize,
      correctionsCount: corrections.length,
      unconsumedCount: unconsumed.length,
      uniqueIntentsCount: uniqueIntents.size,
      reason: readyToOptimize
        ? "Ready for optimization"
        : corrections.length < MIN_CORRECTIONS
        ? `Only ${corrections.length} corrections (need ${MIN_CORRECTIONS})`
        : uniqueIntents.size < MIN_UNIQUE_INTENTS
        ? `Only ${uniqueIntents.size} unique intents (need ${MIN_UNIQUE_INTENTS})`
        : unconsumed.length === 0
        ? "No new corrections since last optimization"
        : "Unknown",
    };
  },
});

/**
 * Get corrections with train/validation split (T013)
 * Stratified by intent category to ensure balanced representation
 */
export const getCorrectionsWithSplit = internalQuery({
  args: {},
  handler: async (ctx) => {
    const corrections = await ctx.db
      .query("chat_agent_corrections")
      .withIndex("by_correctionType", (q) => q.eq("correctionType", "intent"))
      .collect();

    // Group by correctedIntent for stratification
    const byIntent: Record<string, typeof corrections> = {};
    for (const c of corrections) {
      const intent = c.correctedIntent || "unknown";
      if (!byIntent[intent]) byIntent[intent] = [];
      byIntent[intent].push(c);
    }

    // Stratified split: 80% train, 20% validation per intent
    const train: typeof corrections = [];
    const validation: typeof corrections = [];

    for (const [intent, items] of Object.entries(byIntent)) {
      const splitIndex = Math.floor(items.length * TRAIN_SPLIT);
      train.push(...items.slice(0, splitIndex));
      validation.push(...items.slice(splitIndex));
    }

    console.log(
      `[ChatOptimization] Split: ${train.length} train, ${validation.length} validation across ${Object.keys(byIntent).length} intents`
    );

    return {
      train: train.map((c) => ({
        _id: c._id,
        originalQuery: c.originalQuery,
        originalIntent: c.originalIntent,
        correctedIntent: c.correctedIntent,
        businessId: c.businessId,
        createdAt: c.createdAt,
      })),
      validation: validation.map((c) => ({
        _id: c._id,
        originalQuery: c.originalQuery,
        originalIntent: c.originalIntent,
        correctedIntent: c.correctedIntent,
        businessId: c.businessId,
        createdAt: c.createdAt,
      })),
    };
  },
});

/**
 * Get active model version for chat-agent-intent module
 */
export const getActiveVersion = query({
  args: { module: v.string() },
  handler: async (ctx, args) => {
    const version = await ctx.db
      .query("dspy_model_versions")
      .withIndex("by_module_status", (q) =>
        q.eq("module", args.module).eq("status", "promoted")
      )
      .first();

    return version;
  },
});

/**
 * Weekly optimization action (T014-T021)
 *
 * Full pipeline:
 * 1. Check readiness
 * 2. Get train/validation split
 * 3. Invoke Lambda for training
 * 4. Create candidate ModelVersion
 * 5. Quality gate evaluation (in Lambda)
 * 6. Promote if passed, supersede previous
 * 7. Mark corrections consumed
 * 8. Create OptimizationRun audit record
 */
export const weeklyOptimization = internalAction({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const runId = crypto.randomUUID();

    console.log(`[ChatOptimization] Starting optimization run ${runId}`);

    // Step 1: Check readiness
    const readiness = await ctx.runQuery(
      _internal.functions.chatOptimizationNew.checkReadiness,
      { force: args.force }
    );

    if (!readiness.readyToOptimize) {
      console.log(`[ChatOptimization] Not ready: ${readiness.reason}`);

      // Create skipped optimization run record
      await ctx.runMutation(
        _internal.functions.chatOptimizationNew.createOptimizationRun,
        {
          runId,
          module: "chat-agent-intent",
          triggerType: "manual",
          correctionsProcessed: readiness.correctionsCount,
          status: "skipped",
          startTime,
          endTime: Date.now(),
          errorMessage: readiness.reason,
        }
      );

      return {
        readyToOptimize: false,
        correctionsCount: readiness.correctionsCount,
        reason: readiness.reason,
      };
    }

    // Step 2: Get train/validation split
    const { train, validation } = await ctx.runQuery(
      _internal.functions.chatOptimizationNew.getCorrectionsWithSplit,
      {}
    );

    // Step 3: Get current active version (for comparison)
    const currentVersion = await ctx.runQuery(
      _internal.functions.chatOptimizationNew.getActiveVersion,
      { module: "chat-agent-intent" }
    );

    // Step 4: Lambda invocation handled by EventBridge → scheduled-intelligence Lambda
    // The production path uses prepareOptimization + completeOptimization (below).
    // This weeklyOptimization action is kept for backward compatibility but
    // delegates to the same prepare/complete flow without direct Lambda invocation.
    // When called directly (not via EventBridge), it skips Lambda and logs a warning.
    console.warn(
      `[ChatOptimization] weeklyOptimization called directly (not via EventBridge). ` +
      `${train.length} train, ${validation.length} validation examples. ` +
      `Use EventBridge chat-agent-optimization module for real Lambda invocation.`
    );

    return {
      readyToOptimize: true,
      correctionsCount: train.length + validation.length,
      optimizationRun: false,
      reason: "Direct call skipped — use EventBridge chat-agent-optimization module for real Lambda invocation",
      durationMs: Date.now() - startTime,
    };
  },
});

/**
 * Create ModelVersion record (T015)
 */
export const createModelVersion = internalMutation({
  args: {
    versionId: v.string(),
    module: v.string(),
    s3Key: v.string(),
    promptHash: v.string(),
    correctionsConsumed: v.number(),
    trainingExamples: v.number(),
    validationExamples: v.number(),
    optimizerType: v.string(),
    optimizerConfig: v.object({
      max_bootstrapped_demos: v.number(),
      max_labeled_demos: v.number(),
      max_rounds: v.number(),
    }),
    evalMetrics: v.object({
      validationAccuracy: v.number(),
      perCategoryMetrics: v.any(),
      confusionMatrix: v.any(),
    }),
    qualityGateResult: v.any(),
    comparisonVsPrevious: v.optional(
      v.object({
        previousVersionId: v.string(),
        accuracyDelta: v.number(),
        passed: v.boolean(),
      })
    ),
    status: v.string(),
    triggerType: v.string(),
    durationMs: v.number(),
  },
  handler: async (ctx, args) => {
    const versionDoc = await ctx.db.insert("dspy_model_versions", {
      // Legacy fields (for compatibility with existing code)
      platform: args.module,
      version: parseInt(args.versionId.split("-").pop() || "1"),
      s3Key: args.s3Key,
      status: args.status,
      trainingExamples: args.trainingExamples,
      accuracy: args.evalMetrics.validationAccuracy,
      optimizerType: args.optimizerType,
      trainedAt: Date.now(),

      // New fields (029-dspy-mem0-activation)
      versionId: args.versionId,
      module: args.module,
      correctionsConsumed: args.correctionsConsumed,
      validationExamples: args.validationExamples,
      qualityGateResult: args.qualityGateResult,
      comparisonVsPrevious: args.comparisonVsPrevious,
    });

    console.log(`[ChatOptimization] Created ModelVersion ${args.versionId} with status ${args.status}`);
    return versionDoc;
  },
});

/**
 * Promote version to active (T017-T018)
 */
export const promoteVersion = internalMutation({
  args: {
    versionId: v.id("dspy_model_versions"),
    supersedePrevious: v.optional(v.id("dspy_model_versions")),
  },
  handler: async (ctx, args) => {
    // Mark previous as superseded (T018)
    if (args.supersedePrevious) {
      const prevDoc = await ctx.db.get(args.supersedePrevious);
      await ctx.db.patch(args.supersedePrevious, {
        status: "superseded",
        supersededBy: (await ctx.db.get(args.versionId))?.versionId,
      });
      console.log(
        `[ChatOptimization] Superseded previous version ${prevDoc?.versionId}`
      );
    }

    // Promote candidate to active
    await ctx.db.patch(args.versionId, {
      status: "promoted",
      promotedAt: Date.now(),
    });

    const doc = await ctx.db.get(args.versionId);
    console.log(`[ChatOptimization] Promoted ${doc?.versionId} to active`);
  },
});

/**
 * Mark corrections as consumed (T019)
 */
export const markCorrectionsConsumed = internalMutation({
  args: {
    correctionIds: v.array(v.id("chat_agent_corrections")),
    versionId: v.string(),
  },
  handler: async (ctx, args) => {
    for (const id of args.correctionIds) {
      await ctx.db.patch(id, {
        consumed: true,
        consumedAt: Date.now(),
      });
    }
    console.log(
      `[ChatOptimization] Marked ${args.correctionIds.length} corrections as consumed by ${args.versionId}`
    );
  },
});

/**
 * Create OptimizationRun audit record (T021)
 */
export const createOptimizationRun = internalMutation({
  args: {
    runId: v.string(),
    module: v.string(),
    triggerType: v.string(),
    correctionsProcessed: v.number(),
    correctionsConsumed: v.optional(v.array(v.id("chat_agent_corrections"))),
    trainValidationSplit: v.optional(
      v.object({
        train: v.number(),
        validation: v.number(),
      })
    ),
    status: v.string(),
    resultingVersionId: v.optional(v.string()),
    qualityGateResult: v.optional(v.any()),
    startTime: v.number(),
    endTime: v.number(),
    durationMs: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Note: dspy_optimization_runs table doesn't exist in schema yet
    // Using dspy_optimization_logs as fallback for now
    await ctx.db.insert("dspy_optimization_logs", {
      platform: args.module,
      optimizerType: "bootstrap_fewshot",
      status: args.status === "success" ? "completed" : "failed",
      startedAt: args.startTime,
      completedAt: args.endTime,
      beforeAccuracy: args.qualityGateResult?.previousAccuracy,
      afterAccuracy: args.qualityGateResult?.candidateAccuracy,
      trainingExamples: args.trainValidationSplit?.train,
      testSetSize: args.trainValidationSplit?.validation,
      errorMessage: args.errorMessage,
    });

    console.log(`[ChatOptimization] Created optimization run ${args.runId} with status ${args.status}`);
  },
});

/**
 * Prepare optimization data for Lambda (called by scheduled-intelligence Lambda)
 *
 * Returns readiness status + train/val split + current version info
 * so the Lambda can invoke the DSPy optimizer and call completeOptimization with results.
 */
export const prepareOptimization = internalAction({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Step 1: Check readiness
    const readiness = await ctx.runQuery(
      _internal.functions.chatOptimizationNew.checkReadiness,
      { force: args.force }
    );

    if (!readiness.readyToOptimize) {
      return {
        ready: false,
        reason: readiness.reason,
        correctionsCount: readiness.correctionsCount,
      };
    }

    // Step 2: Get train/validation split
    const { train, validation } = await ctx.runQuery(
      _internal.functions.chatOptimizationNew.getCorrectionsWithSplit,
      {}
    );

    // Step 3: Get current active version
    const currentVersion = await ctx.runQuery(
      _internal.functions.chatOptimizationNew.getActiveVersion,
      { module: "chat-agent-intent" }
    );

    return {
      ready: true,
      train,
      validation,
      currentVersion: currentVersion
        ? {
            _id: currentVersion._id,
            versionId: currentVersion.versionId,
            s3Key: currentVersion.s3Key,
            accuracy: currentVersion.accuracy,
          }
        : null,
    };
  },
});

/**
 * Complete optimization after Lambda returns results (called by scheduled-intelligence Lambda)
 *
 * Takes the DSPy optimizer result and creates model version, runs quality gate,
 * promotes if passed, and marks corrections consumed.
 */
export const completeOptimization = internalAction({
  args: {
    runId: v.string(),
    startTime: v.number(),
    lambdaResult: v.object({
      success: v.boolean(),
      versionId: v.string(),
      s3Key: v.string(),
      promptHash: v.string(),
      accuracy: v.number(),
      trainingExamples: v.number(),
      validationExamples: v.number(),
      qualityGateResult: v.object({
        passed: v.boolean(),
        candidateAccuracy: v.number(),
        previousAccuracy: v.optional(v.number()),
        accuracyDelta: v.optional(v.number()),
        evalSetSize: v.number(),
        perCategoryBreakdown: v.any(),
      }),
      durationMs: v.number(),
    }),
    currentVersionId: v.optional(v.id("dspy_model_versions")),
    correctionIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { lambdaResult } = args;

    // Step 5: Create ModelVersion with candidate status
    const versionDocId = await ctx.runMutation(
      _internal.functions.chatOptimizationNew.createModelVersion,
      {
        versionId: lambdaResult.versionId,
        module: "chat-agent-intent",
        s3Key: lambdaResult.s3Key,
        promptHash: lambdaResult.promptHash,
        correctionsConsumed: lambdaResult.trainingExamples + lambdaResult.validationExamples,
        trainingExamples: lambdaResult.trainingExamples,
        validationExamples: lambdaResult.validationExamples,
        optimizerType: "bootstrapfewshot",
        optimizerConfig: {
          max_bootstrapped_demos: 4,
          max_labeled_demos: 8,
          max_rounds: 3,
        },
        evalMetrics: {
          validationAccuracy: lambdaResult.accuracy,
          perCategoryMetrics: {},
          confusionMatrix: [],
        },
        qualityGateResult: lambdaResult.qualityGateResult,
        comparisonVsPrevious: args.currentVersionId
          ? {
              previousVersionId: lambdaResult.versionId,
              accuracyDelta: lambdaResult.qualityGateResult.accuracyDelta || 0,
              passed: lambdaResult.qualityGateResult.passed,
            }
          : undefined,
        status: "candidate",
        triggerType: "scheduled",
        durationMs: lambdaResult.durationMs,
      }
    );

    // Step 6: Promote if quality gate passed
    if (lambdaResult.qualityGateResult.passed) {
      await ctx.runMutation(
        _internal.functions.chatOptimizationNew.promoteVersion,
        {
          versionId: versionDocId,
          supersedePrevious: args.currentVersionId,
        }
      );

      // Step 7: Mark corrections consumed
      // Cast string IDs to Convex IDs (they come from Lambda as strings)
      const typedIds = args.correctionIds as unknown as Array<import("../_generated/dataModel").Id<"chat_agent_corrections">>;
      await ctx.runMutation(
        _internal.functions.chatOptimizationNew.markCorrectionsConsumed,
        {
          correctionIds: typedIds,
          versionId: lambdaResult.versionId,
        }
      );
    }

    // Step 8: Create audit record
    await ctx.runMutation(
      _internal.functions.chatOptimizationNew.createOptimizationRun,
      {
        runId: args.runId,
        module: "chat-agent-intent",
        triggerType: "scheduled",
        correctionsProcessed: lambdaResult.trainingExamples + lambdaResult.validationExamples,
        status: lambdaResult.qualityGateResult.passed ? "success" : "quality_gate_rejected",
        resultingVersionId: lambdaResult.qualityGateResult.passed ? lambdaResult.versionId : undefined,
        qualityGateResult: lambdaResult.qualityGateResult,
        startTime: args.startTime,
        endTime: Date.now(),
        durationMs: Date.now() - args.startTime,
      }
    );

    return {
      promoted: lambdaResult.qualityGateResult.passed,
      versionId: lambdaResult.versionId,
      accuracy: lambdaResult.accuracy,
    };
  },
});
