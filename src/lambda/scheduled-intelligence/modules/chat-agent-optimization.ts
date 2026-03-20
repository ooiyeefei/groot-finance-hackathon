/**
 * Chat Agent Optimization Module
 *
 * Calls convex/functions/chatOptimization.ts:weeklyOptimization
 * via Convex HTTP API (internalAction).
 */

import { convexAction } from '../lib/convex-client';
import { JobResult } from '../lib/types';

export async function runChatAgentOptimization(): Promise<Omit<JobResult, 'durationMs'>> {
  console.log('[ChatAgentOptimization] Calling Convex action...');

  try {
    const result = await convexAction<{
      readyToOptimize: boolean;
      correctionsCount?: number;
      optimizationRun?: boolean;
      reason?: string;
      durationMs?: number;
    }>('functions/chatOptimizationNew:weeklyOptimization', { force: false });

    console.log(
      `[ChatAgentOptimization] Complete: ${result.readyToOptimize ? 'optimized' : 'skipped'} (${result.reason || 'success'})`
    );

    return {
      module: 'chat-agent-optimization',
      status: result.optimizationRun ? 'success' : 'skipped',
      documentsRead: result.correctionsCount || 0,
      documentsWritten: result.optimizationRun ? 1 : 0,
    };
  } catch (error) {
    console.error('[ChatAgentOptimization] Error:', error);
    return {
      module: 'chat-agent-optimization',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
