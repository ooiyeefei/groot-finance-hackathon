/**
 * Proactive Analysis Module
 *
 * Calls convex/functions/actionCenterJobs.ts:runProactiveAnalysis
 * via Convex HTTP API (internalAction).
 *
 * Business logic remains in Convex — Lambda is just a scheduler trigger.
 */

import { convexAction } from '../lib/convex-client';
import { JobResult } from '../lib/types';

export async function runProactiveAnalysis(): Promise<Omit<JobResult, 'durationMs'>> {
  console.log('[ProactiveAnalysis] Calling Convex action...');

  try {
    const result = await convexAction<{
      businessesAnalyzed: number;
      insightsCreated: number;
      durationMs: number;
    }>('functions/actionCenterJobs:runProactiveAnalysis', {});

    console.log(
      `[ProactiveAnalysis] Complete: ${result.businessesAnalyzed} businesses, ${result.insightsCreated} insights`
    );

    return {
      module: 'proactive-analysis',
      status: 'success',
      documentsRead: result.businessesAnalyzed,
      documentsWritten: result.insightsCreated,
    };
  } catch (error) {
    console.error('[ProactiveAnalysis] Error:', error);
    return {
      module: 'proactive-analysis',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
