/**
 * E-Invoice DSPy Digest Module
 *
 * Calls convex/functions/einvoiceDspyDigest.ts:sendWeeklyDigest
 * via Convex HTTP API.
 *
 * Generates weekly e-invoice processing insights and patterns for DSPy optimization.
 */

import { convexAction } from '../lib/convex-client';
import { JobResult } from '../lib/types';

export async function runEinvoiceDspyDigest(): Promise<Omit<JobResult, 'durationMs'>> {
  console.log('[EinvoiceDspyDigest] Calling Convex action...');

  try {
    // Note: sendWeeklyDigest returns void (no return value)
    await convexAction<void>('functions/einvoiceDspyDigest:sendWeeklyDigest', {});

    console.log('[EinvoiceDspyDigest] Complete: weekly digest sent');

    return {
      module: 'einvoice-dspy-digest',
      status: 'success',
      documentsRead: 0, // Function doesn't return counts
      documentsWritten: 0,
    };
  } catch (error) {
    console.error('[EinvoiceDspyDigest] Error:', error);
    return {
      module: 'einvoice-dspy-digest',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
