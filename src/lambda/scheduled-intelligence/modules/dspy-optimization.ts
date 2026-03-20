/**
 * DSPy Optimization Module
 *
 * Handles all DSPy weekly optimization jobs:
 * - dspy-fee: Fee classification (Tier 2 banking fees)
 * - dspy-bank-recon: Bank transaction matching
 * - dspy-po-match: PO-Invoice line matching
 * - dspy-ar-match: AR order matching
 *
 * Calls existing Convex actions via HTTP API, which then
 * invoke the finanseal-dspy-optimizer Lambda for actual training.
 */

import { convexAction } from '../lib/convex-client';
import { JobResult, JobModule } from '../lib/types';

export async function runDspyOptimization(
  module: Extract<JobModule, 'dspy-fee' | 'dspy-bank-recon' | 'dspy-po-match' | 'dspy-ar-match'>
): Promise<Omit<JobResult, 'durationMs'>> {
  console.log(`[DspyOptimization] Running ${module} optimization...`);

  try {
    let convexFunction: string;

    switch (module) {
      case 'dspy-fee':
        convexFunction = 'functions/dspyOptimization:weeklyOptimization';
        break;
      case 'dspy-bank-recon':
        convexFunction = 'functions/bankReconOptimization:weeklyOptimization';
        break;
      case 'dspy-po-match':
        convexFunction = 'functions/poMatchOptimization:weeklyOptimization';
        break;
      case 'dspy-ar-match':
        convexFunction = 'functions/orderMatchingOptimization:weeklyOptimization';
        break;
    }

    const result = await convexAction<{
      readyToOptimize: boolean;
      correctionsCount?: number;
      optimizationRun?: boolean;
      reason?: string;
      durationMs?: number;
    }>(convexFunction, { force: false });

    console.log(
      `[DspyOptimization] ${module} complete: ${result.readyToOptimize ? 'optimized' : 'skipped'} (${result.reason || 'success'})`
    );

    return {
      module,
      status: result.optimizationRun ? 'success' : 'skipped',
      documentsRead: result.correctionsCount || 0,
      documentsWritten: result.optimizationRun ? 1 : 0, // 1 model version written if optimized
    };
  } catch (error) {
    console.error(`[DspyOptimization] ${module} error:`, error);
    return {
      module,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
