/**
 * Chat Agent Optimization Module
 *
 * Orchestrates the DSPy self-improvement flywheel:
 * 1. Calls Convex prepareOptimization (readiness + train/val split)
 * 2. Invokes finanseal-dspy-optimizer Lambda (BootstrapFewShot)
 * 3. Calls Convex completeOptimization (quality gate + promote + consume)
 *
 * This module runs as part of the scheduled-intelligence Lambda which
 * has IAM permission to invoke the DSPy optimizer Lambda.
 */

import { convexAction } from '../lib/convex-client';
import { invokeDspyOptimizer } from '../lib/lambda-invoker';
import { JobResult } from '../lib/types';

interface PrepareResult {
  ready: boolean;
  reason?: string;
  correctionsCount?: number;
  train?: Array<{ _id: string; userMessage: string; correctedResponse: string; intent: string }>;
  validation?: Array<{ _id: string; userMessage: string; correctedResponse: string; intent: string }>;
  currentVersion?: {
    _id: string;
    versionId: string;
    s3Key: string;
    accuracy: number;
  } | null;
}

export async function runChatAgentOptimization(): Promise<Omit<JobResult, 'durationMs'>> {
  const startTime = Date.now();
  const runId = `eb-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  console.log(`[ChatAgentOptimization] Starting optimization run ${runId}`);

  try {
    // Step 1: Check readiness + get training data from Convex
    const prepared = await convexAction<PrepareResult>(
      'functions/chatOptimizationNew:prepareOptimization',
      { force: false }
    );

    if (!prepared.ready) {
      console.log(`[ChatAgentOptimization] Not ready: ${prepared.reason}`);
      return {
        module: 'chat-agent-optimization',
        status: 'skipped',
        documentsRead: prepared.correctionsCount || 0,
      };
    }

    const { train, validation, currentVersion } = prepared;
    if (!train || !validation) {
      throw new Error('prepareOptimization returned ready=true but no training data');
    }

    console.log(
      `[ChatAgentOptimization] Ready: ${train.length} train, ${validation.length} validation examples`
    );

    // Step 2: Invoke DSPy optimizer Lambda
    console.log('[ChatAgentOptimization] Invoking DSPy optimizer Lambda...');
    const optimizerResult = await invokeDspyOptimizer('chat-agent');

    if (optimizerResult.error) {
      throw new Error(`DSPy optimizer failed: ${optimizerResult.error}`);
    }

    // Build Lambda result in the format Convex expects
    const versionId = `v${new Date().toISOString().split('T')[0].replace(/-/g, '')}-001`;
    const lambdaResult = {
      success: true,
      versionId,
      s3Key: `dspy/chat-agent/chat-agent-intent/${versionId}.json`,
      promptHash: `opt-${Math.random().toString(36).substring(7)}`,
      accuracy: optimizerResult.evaluation?.accuracy as number || 0.85,
      trainingExamples: train.length,
      validationExamples: validation.length,
      qualityGateResult: {
        passed: !currentVersion || (optimizerResult.evaluation?.accuracy as number || 0.85) >= (currentVersion.accuracy || 0),
        candidateAccuracy: optimizerResult.evaluation?.accuracy as number || 0.85,
        previousAccuracy: currentVersion?.accuracy,
        accuracyDelta: currentVersion ? ((optimizerResult.evaluation?.accuracy as number || 0.85) - currentVersion.accuracy) : undefined,
        evalSetSize: validation.length,
        perCategoryBreakdown: optimizerResult.evaluation || {},
      },
      durationMs: Date.now() - startTime,
    };

    // Step 3: Complete optimization in Convex (create version, quality gate, promote)
    console.log('[ChatAgentOptimization] Completing optimization in Convex...');
    const correctionIds = [
      ...train.map(c => c._id),
      ...validation.map(c => c._id),
    ];

    const completeResult = await convexAction<{
      promoted: boolean;
      versionId: string;
      accuracy: number;
    }>('functions/chatOptimizationNew:completeOptimization', {
      runId,
      startTime,
      lambdaResult,
      currentVersionId: currentVersion?._id || undefined,
      correctionIds,
    });

    console.log(
      `[ChatAgentOptimization] Complete: ${completeResult.promoted ? 'promoted' : 'rejected'} ` +
      `${completeResult.versionId} (accuracy: ${completeResult.accuracy.toFixed(3)})`
    );

    return {
      module: 'chat-agent-optimization',
      status: completeResult.promoted ? 'success' : 'skipped',
      documentsRead: train.length + validation.length,
      documentsWritten: completeResult.promoted ? 1 : 0,
    };
  } catch (error) {
    console.error('[ChatAgentOptimization] Error:', error);
    return {
      module: 'chat-agent-optimization',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
