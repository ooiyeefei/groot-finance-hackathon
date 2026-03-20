/**
 * AI Daily Digest Module
 *
 * Calls convex/functions/actionCenterJobs.ts:runAIDailyDigest
 * via Convex HTTP API.
 *
 * IMPORTANT: This was previously disabled due to bandwidth concerns.
 * Re-enabling via EventBridge significantly reduces bandwidth cost
 * (Lambda processes data locally instead of Convex scanning tables hourly).
 */

import { convexAction } from '../lib/convex-client';
import { JobResult } from '../lib/types';

export async function runAiDailyDigest(): Promise<Omit<JobResult, 'durationMs'>> {
  console.log('[AIDailyDigest] Calling Convex action...');

  try {
    const result = await convexAction<{
      businessesProcessed: number;
      digestsGenerated: number;
      durationMs: number;
    }>('functions/actionCenterJobs:runAIDailyDigest', {});

    console.log(
      `[AIDailyDigest] Complete: ${result.businessesProcessed} businesses, ${result.digestsGenerated} digests`
    );

    return {
      module: 'ai-daily-digest',
      status: 'success',
      documentsRead: result.businessesProcessed,
      documentsWritten: result.digestsGenerated,
    };
  } catch (error) {
    console.error('[AIDailyDigest] Error:', error);
    return {
      module: 'ai-daily-digest',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
