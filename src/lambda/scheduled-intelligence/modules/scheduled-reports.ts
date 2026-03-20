/**
 * Scheduled Reports Module
 *
 * Calls convex/functions/scheduledReportJobs.ts:runScheduledReports
 * via Convex HTTP API.
 *
 * Generates and delivers user-configured scheduled reports (daily/weekly/monthly).
 */

import { convexAction } from '../lib/convex-client';
import { JobResult } from '../lib/types';

export async function runScheduledReports(): Promise<Omit<JobResult, 'durationMs'>> {
  console.log('[ScheduledReports] Calling Convex action...');

  try {
    const result = await convexAction<{
      reportsGenerated: number;
      reportsDelivered: number;
      durationMs: number;
    }>('functions/scheduledReportJobs:runScheduledReports', {});

    console.log(
      `[ScheduledReports] Complete: ${result.reportsGenerated} generated, ${result.reportsDelivered} delivered`
    );

    return {
      module: 'scheduled-reports',
      status: 'success',
      documentsRead: result.reportsGenerated,
      documentsWritten: result.reportsDelivered,
    };
  } catch (error) {
    console.error('[ScheduledReports] Error:', error);
    return {
      module: 'scheduled-reports',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
