/**
 * E-Invoice DSPy Digest Module
 *
 * Calls convex/functions/einvoiceDspyJobs.ts:runWeeklyDigest
 * via Convex HTTP API.
 *
 * Generates weekly e-invoice processing insights and patterns for DSPy optimization.
 */

import { convexAction } from '../lib/convex-client';
import { JobResult } from '../lib/types';

export async function runEinvoiceDspyDigest(): Promise<Omit<JobResult, 'durationMs'>> {
  console.log('[EinvoiceDspyDigest] Calling Convex action...');

  try {
    const result = await convexAction<{
      businessesAnalyzed: number;
      patternsFound: number;
      durationMs: number;
    }>('functions/einvoiceDspyJobs:runWeeklyDigest', {});

    console.log(
      `[EinvoiceDspyDigest] Complete: ${result.businessesAnalyzed} businesses, ${result.patternsFound} patterns`
    );

    return {
      module: 'einvoice-dspy-digest',
      status: 'success',
      documentsRead: result.businessesAnalyzed,
      documentsWritten: result.patternsFound,
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
