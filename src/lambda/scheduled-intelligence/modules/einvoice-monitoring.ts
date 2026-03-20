/**
 * E-Invoice Monitoring Module
 *
 * Calls convex/functions/einvoiceMonitoring.ts:runMonitoringCycle
 * via Convex HTTP API.
 */

import { convexAction } from '../lib/convex-client';
import { JobResult } from '../lib/types';

export async function runEinvoiceMonitoring(): Promise<Omit<JobResult, 'durationMs'>> {
  console.log('[EinvoiceMonitoring] Calling Convex action...');

  try {
    const result = await convexAction<{
      staleRecordsCleaned: number;
      failuresCategorized: number;
      newPatternAlerts: number;
      durationMs: number;
    }>('functions/einvoiceMonitoring:runMonitoringCycle', {});

    console.log(
      `[EinvoiceMonitoring] Complete: ${result.staleRecordsCleaned} cleaned, ${result.failuresCategorized} categorized, ${result.newPatternAlerts} alerts`
    );

    return {
      module: 'einvoice-monitoring',
      status: 'success',
      documentsRead: result.staleRecordsCleaned + result.failuresCategorized,
      documentsWritten: result.newPatternAlerts,
    };
  } catch (error) {
    console.error('[EinvoiceMonitoring] Error:', error);
    return {
      module: 'einvoice-monitoring',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
