/**
 * Benchmarking Aggregation Module (031-chat-cross-biz-voice)
 *
 * Weekly EventBridge trigger: computes industry benchmark aggregates
 * across all opted-in businesses. Calls Convex action which handles
 * the metric computation and storage.
 *
 * Schedule: Sunday 3am UTC (cron(0 3 ? * SUN *))
 */

import { convexAction } from '../lib/convex-client';
import { JobResult } from '../lib/types';

export async function runBenchmarkingAggregation(): Promise<Omit<JobResult, 'durationMs'>> {
  console.log('[BenchmarkingAggregation] Starting weekly aggregation...');

  try {
    const result = await convexAction<{
      industriesProcessed: number;
      metricsComputed: number;
      period: string;
    }>('functions/benchmarking:runAggregation', {});

    console.log(
      `[BenchmarkingAggregation] Complete: ${result.industriesProcessed} industries, ${result.metricsComputed} metrics computed for ${result.period}`
    );

    return {
      module: 'benchmarking-aggregation',
      status: 'success',
      documentsRead: result.industriesProcessed,
      documentsWritten: result.metricsComputed,
    };
  } catch (error) {
    console.error('[BenchmarkingAggregation] Error:', error);
    return {
      module: 'benchmarking-aggregation',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
