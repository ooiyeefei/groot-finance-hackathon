/**
 * Weekly Email Digest Module
 *
 * Calls convex/functions/emailDigestJobs.ts:runWeeklyDigest
 * via Convex HTTP API.
 *
 * Generates and sends weekly summary emails to business owners and managers.
 */

import { convexAction } from '../lib/convex-client';
import { JobResult } from '../lib/types';

export async function runWeeklyEmailDigest(): Promise<Omit<JobResult, 'durationMs'>> {
  console.log('[WeeklyEmailDigest] Calling Convex action...');

  try {
    const result = await convexAction<{
      businessesProcessed: number;
      emailsSent: number;
      durationMs: number;
    }>('functions/emailDigestJobs:runWeeklyDigest', {});

    console.log(
      `[WeeklyEmailDigest] Complete: ${result.businessesProcessed} businesses, ${result.emailsSent} emails sent`
    );

    return {
      module: 'weekly-email-digest',
      status: 'success',
      documentsRead: result.businessesProcessed,
      documentsWritten: result.emailsSent,
    };
  } catch (error) {
    console.error('[WeeklyEmailDigest] Error:', error);
    return {
      module: 'weekly-email-digest',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
