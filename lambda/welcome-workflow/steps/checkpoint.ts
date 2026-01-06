/**
 * Checkpoint Step
 *
 * Records workflow progress to Convex for monitoring and debugging.
 * This enables visibility into customer lifecycle stage without querying AWS directly.
 */

import { ConvexHttpClient } from 'convex/browser';

// Note: In production, this would use the generated API from convex/_generated/api
// For now, using direct mutation call pattern

const convex = new ConvexHttpClient(process.env.CONVEX_URL || '');

export interface CheckpointParams {
  userId: string;
  executionId: string;
  stage: string;
  metadata?: Record<string, unknown>;
}

export async function checkpoint(params: CheckpointParams): Promise<void> {
  const { userId, executionId, stage, metadata } = params;

  try {
    // Update workflow execution status in Convex
    // This mutation will be created in convex/functions/workflows.ts
    await convex.mutation('functions/workflows:updateWorkflowStatus' as any, {
      executionId,
      currentStage: stage,
      status: stage === 'completed' ? 'completed' : 'running',
      metadata,
    });

    console.log('Checkpoint recorded:', {
      userId,
      executionId,
      stage,
    });
  } catch (error) {
    // Checkpoint failures are logged but don't fail the workflow
    // The email was already sent successfully
    console.error('Failed to record checkpoint:', {
      userId,
      executionId,
      stage,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
