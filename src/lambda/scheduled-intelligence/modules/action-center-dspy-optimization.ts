/**
 * Action Center DSPy Optimization Module (033-ai-action-center-dspy)
 *
 * Delegates to Convex internalAction which handles:
 * - Looping through all active businesses
 * - Running per-business optimization (readiness → training → quality gate → promote)
 *
 * Pattern follows proactive-analysis.ts: Lambda is just a scheduler trigger,
 * all business logic stays in Convex.
 */

import { convexAction } from '../lib/convex-client';
import { JobResult } from '../lib/types';

export async function runActionCenterDspyOptimization(): Promise<Omit<JobResult, 'durationMs'>> {
  console.log('[ActionCenterDspyOptimization] Calling Convex action...');

  try {
    const result = await convexAction<{
      totalProcessed: number;
      totalPromoted: number;
      totalSkipped: number;
      totalFailed: number;
    }>('functions/actionCenterOptimization:runForAllBusinesses', {});

    console.log(
      `[ActionCenterDspyOptimization] Complete: ${result.totalProcessed} businesses, ` +
      `${result.totalPromoted} promoted, ${result.totalSkipped} skipped, ${result.totalFailed} failed`
    );

    return {
      module: 'action-center-dspy-optimization',
      status: result.totalFailed > 0 ? 'error' : 'success',
      documentsRead: result.totalProcessed,
      documentsWritten: result.totalPromoted,
    };
  } catch (error) {
    console.error('[ActionCenterDspyOptimization] Error:', error);
    return {
      module: 'action-center-dspy-optimization',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
