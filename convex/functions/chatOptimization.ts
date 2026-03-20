/**
 * Chat Agent DSPy Optimization — weekly batch optimization via DSPy Lambda
 *
 * Triggered by cron jobs. For each chat module type with enough corrections,
 * runs optimization and records results.
 *
 * Safeguards (mirroring dspyOptimization.ts pattern):
 * 1. Minimum volume: ≥100 total corrections pooled globally
 * 2. Minimum diversity: ≥10 unique queries in corrections
 * 3. New data only: skips if no new corrections since last optimization
 * 4. Automatic quality gating: rejects model if accuracy drops
 */

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _internal: any = require("../_generated/api").internal;
import { callMCPTool } from "../lib/mcpClient";

const MIN_CORRECTIONS = 20;      // Changed from 100 to 20 per spec (029-dspy-mem0-activation)
const MIN_UNIQUE_INTENTS = 10;   // New requirement: intent diversity, not just query diversity

/**
 * Check if a module type has enough corrections for optimization.
 */
export const getModuleReadiness = internalQuery({
  args: {
    moduleTypes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const readyModules: Array<{
      moduleType: string;
      totalCorrections: number;
      uniqueIntents: number;
      latestCorrectionId: string;
    }> = [];

    const skippedModules: Array<{ moduleType: string; reason: string }> = [];

    for (const moduleType of args.moduleTypes) {
      // Map module type to correction type
      const correctionType = moduleType === "intent" ? "intent"
        : moduleType === "tool_selector" || moduleType === "param_extractor" ? "tool_selection"
        : "parameter_extraction";

      const corrections = await ctx.db
        .query("chat_agent_corrections")
        .withIndex("by_correctionType", (q) => q.eq("correctionType", correctionType))
        .collect();

      // Check intent diversity (not query diversity)
      const uniqueIntents = new Set(
        corrections
          .map((c) => c.correctedIntent)
          .filter(Boolean)
      );
      const unconsumed = corrections.filter((c) => !c.consumed);

      let latestId = "";
      for (const c of corrections) {
        if (c._id > latestId) latestId = c._id;
      }

      if (corrections.length < MIN_CORRECTIONS) {
        skippedModules.push({
          moduleType,
          reason: `Only ${corrections.length} corrections (need ${MIN_CORRECTIONS})`,
        });
        continue;
      }

      if (uniqueIntents.size < MIN_UNIQUE_INTENTS) {
        skippedModules.push({
          moduleType,
          reason: `Only ${uniqueIntents.size} unique intents (need ${MIN_UNIQUE_INTENTS})`,
        });
        continue;
      }

      if (unconsumed.length === 0) {
        skippedModules.push({
          moduleType,
          reason: "No new corrections since last optimization",
        });
        continue;
      }

      readyModules.push({
        moduleType,
        totalCorrections: corrections.length,
        uniqueIntents: uniqueIntents.size,
        latestCorrectionId: latestId,
      });
    }

    return { readyModules, skippedModules };
  },
});

/**
 * Weekly optimization action — triggered by cron.
 * Checks readiness, runs DSPy Lambda, records results.
 */
export const weeklyOptimization = internalAction({
  args: {
    moduleTypes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    console.log(`[ChatOptimization] Starting weekly optimization for: ${args.moduleTypes.join(", ")}`);

    const readiness = await ctx.runQuery(
      _internal.functions.chatOptimization.getModuleReadiness,
      { moduleTypes: args.moduleTypes }
    );

    for (const skipped of readiness.skippedModules) {
      console.log(`[ChatOptimization] Skipping ${skipped.moduleType}: ${skipped.reason}`);
    }

    for (const ready of readiness.readyModules) {
      console.log(`[ChatOptimization] Optimizing ${ready.moduleType} (${ready.totalCorrections} corrections, ${ready.uniqueIntents} unique intents)`);

      try {
        // Get corrections for this module type
        const correctionType = ready.moduleType === "intent" ? "intent"
          : ready.moduleType === "tool_selector" || ready.moduleType === "param_extractor" ? "tool_selection"
          : "parameter_extraction";

        // Get current active model version
        const currentVersion = await ctx.runQuery(
          _internal.functions.chatCorrections.getActiveModelVersion,
          { domain: `chat_${ready.moduleType}` }
        );

        // Call DSPy Lambda via MCP
        const result = await callMCPTool({
          toolName: "optimize_chat_module",
          businessId: "_system",
          args: {
            moduleType: ready.moduleType,
            corrections: [], // Lambda will use the corrections from params
            currentModelS3Key: currentVersion?.s3Key ?? null,
            optimizerType: "bootstrap_fewshot",
            nextVersion: (currentVersion?.version ?? 0) + 1,
          },
        });

        // Record result
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mcpResult = result as any;
        if (mcpResult?.success) {
          await ctx.runMutation(
            _internal.functions.chatOptimization.recordTrainingResult,
            {
              moduleType: ready.moduleType,
              success: true,
              rejected: mcpResult.rejected ?? false,
              accuracy: mcpResult.accuracy ?? 0,
              previousAccuracy: mcpResult.previousAccuracy ?? 0,
              s3Key: mcpResult.s3Key ?? "",
              optimizedPrompt: mcpResult.optimizedPrompt ?? "",
              trainingExamples: mcpResult.trainingExamples ?? 0,
              version: (currentVersion?.version ?? 0) + 1,
            }
          );
        }

      } catch (error) {
        console.error(`[ChatOptimization] Failed to optimize ${ready.moduleType}:`, error);
      }
    }

    console.log("[ChatOptimization] Weekly optimization complete");
  },
});

/**
 * Record training result — creates model version and optimization run entries.
 */
export const recordTrainingResult = internalMutation({
  args: {
    moduleType: v.string(),
    success: v.boolean(),
    rejected: v.boolean(),
    accuracy: v.number(),
    previousAccuracy: v.number(),
    s3Key: v.string(),
    optimizedPrompt: v.string(),
    trainingExamples: v.number(),
    version: v.number(),
  },
  handler: async (ctx, args) => {
    const domain = `chat_${args.moduleType}`;

    if (args.rejected) {
      // Model was rejected by quality gating — record as failed
      await ctx.db.insert("dspy_optimization_logs", {
        platform: domain,
        optimizerType: "bootstrap_fewshot",
        status: "failed",
        startedAt: Date.now(),
        completedAt: Date.now(),
        afterAccuracy: args.accuracy,
        beforeAccuracy: args.previousAccuracy,
        trainingExamples: args.trainingExamples,
        errorMessage: `Rejected: new accuracy (${args.accuracy}) < previous (${args.previousAccuracy})`,
      });
      console.log(`[ChatOptimization] Recorded REJECTED result for ${domain}`);
      return;
    }

    // Deactivate previous active version
    const previousVersions = await ctx.db
      .query("dspy_model_versions")
      .withIndex("by_platform_status", (q) =>
        q.eq("platform", domain).eq("status", "active")
      )
      .collect();

    for (const prev of previousVersions) {
      await ctx.db.patch(prev._id, { status: "inactive" });
    }

    // Create new active version
    await ctx.db.insert("dspy_model_versions", {
      platform: domain,
      version: args.version,
      s3Key: args.s3Key,
      status: "active",
      trainingExamples: args.trainingExamples,
      accuracy: args.accuracy,
      previousVersion: args.version > 1 ? args.version - 1 : undefined,
      optimizerType: "bootstrap_fewshot",
      trainedAt: Date.now(),
      domain,
      optimizedPrompt: args.optimizedPrompt,
    });

    // Record optimization run
    await ctx.db.insert("dspy_optimization_logs", {
      platform: domain,
      optimizerType: "bootstrap_fewshot",
      status: "completed",
      startedAt: Date.now(),
      completedAt: Date.now(),
      afterAccuracy: args.accuracy,
      beforeAccuracy: args.previousAccuracy,
      trainingExamples: args.trainingExamples,
    });

    // Mark consumed corrections
    const correctionType = args.moduleType === "intent" ? "intent"
      : args.moduleType === "tool_selector" || args.moduleType === "param_extractor" ? "tool_selection"
      : "parameter_extraction";

    const unconsumed = await ctx.db
      .query("chat_agent_corrections")
      .withIndex("by_consumed", (q) => q.eq("consumed", false))
      .collect();

    const toConsume = unconsumed.filter((c) => c.correctionType === correctionType);
    for (const c of toConsume) {
      await ctx.db.patch(c._id, { consumed: true, consumedAt: Date.now() });
    }

    console.log(`[ChatOptimization] Recorded SUCCESS for ${domain} v${args.version} (accuracy: ${args.accuracy})`);
  },
});
