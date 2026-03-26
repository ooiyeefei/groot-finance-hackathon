/**
 * Action Center DSPy Optimization Orchestrator (033-ai-action-center-dspy)
 *
 * Contains all internalAction functions for the optimization pipeline.
 * Separated from actionCenterOptimization.ts (which has queries/mutations only)
 * to avoid circular type inference when actions reference their own module's queries.
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";

const MIN_CORRECTIONS = 20;
const MIN_UNIQUE_CONTEXTS = 10;
const MODULE_NAME = "action-center-relevance";
const PLATFORM_NAME = "action_center";

/**
 * Top-level orchestrator: run optimization for ALL active businesses.
 * Called by EventBridge → scheduled-intelligence Lambda.
 */
export const runForAllBusinesses = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("[ActionCenterOptimization] Starting weekly optimization for all businesses");

    const businesses = await ctx.runQuery(internal.functions.actionCenterJobs.getActiveBusinesses);

    let totalProcessed = 0;
    let totalPromoted = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const business of businesses) {
      try {
        const result = await ctx.runAction(internal.functions.actionCenterOptimizationOrchestrator.prepareAndRun, {
          businessId: business._id,
        });

        totalProcessed++;
        if (result.status === "promoted") totalPromoted++;
        else if (result.status === "skipped") totalSkipped++;
        else if (result.status === "failed") totalFailed++;
      } catch (error) {
        totalFailed++;
        console.error(`[ActionCenterOptimization] Error for business ${business._id}:`, error);
      }
    }

    console.log(
      `[ActionCenterOptimization] Complete: ${totalProcessed} processed, ${totalPromoted} promoted, ${totalSkipped} skipped, ${totalFailed} failed`
    );

    return { totalProcessed, totalPromoted, totalSkipped, totalFailed };
  },
});

/**
 * Run the full optimization pipeline for a single business.
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
        : true,
      candidateAccuracy: lambdaResult.accuracy,
      previousAccuracy: previousModel.hasModel ? previousModel.version?.accuracy : undefined,
      accuracyDelta: previousModel.hasModel
        ? lambdaResult.accuracy - (previousModel.version?.accuracy || 0)
        : undefined,
      evalSetSize: trainingData.validation.length,
    };

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
