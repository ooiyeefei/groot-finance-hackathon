/**
 * AI Discovery Module
 *
 * Calls convex/functions/actionCenterJobs.ts:runAIDiscovery
 * via Convex HTTP API.
 */

import { convexAction } from '../lib/convex-client';
import { JobResult } from '../lib/types';

export async function runAiDiscovery(): Promise<Omit<JobResult, 'durationMs'>> {
  console.log('[AIDiscovery] Calling Convex action...');

  try {
    const result = await convexAction<{
      businessesAnalyzed: number;
      insightsCreated: number;
      durationMs: number;
    }>('functions/actionCenterJobs:runAIDiscovery', {});

    console.log(
      `[AIDiscovery] Complete: ${result.businessesAnalyzed} businesses, ${result.insightsCreated} insights`
    );

    return {
      module: 'ai-discovery',
      status: 'success',
      documentsRead: result.businessesAnalyzed,
      documentsWritten: result.insightsCreated,
    };
  } catch (error) {
    console.error('[AIDiscovery] Error:', error);
    return {
      module: 'ai-discovery',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
