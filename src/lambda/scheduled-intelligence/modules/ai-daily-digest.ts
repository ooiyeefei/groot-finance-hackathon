/**
 * AI Daily Digest Module
 *
 * Calls convex/functions/aiDigest.ts:dailyDigest
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
    // Note: dailyDigest returns void (no return value)
    await convexAction<void>('functions/aiDigest:dailyDigest', {});

    console.log('[AIDailyDigest] Complete: digest job finished');

    return {
      module: 'ai-daily-digest',
      status: 'success',
      documentsRead: 0, // Function doesn't return counts
      documentsWritten: 0,
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
