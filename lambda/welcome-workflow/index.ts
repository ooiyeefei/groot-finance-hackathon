/**
 * Welcome Email Workflow - Lambda Durable Function
 *
 * Uses AWS Lambda Durable Functions SDK for:
 * - Long-running workflow orchestration (up to 1 year)
 * - Automatic checkpointing via context.step()
 * - Built-in delays via context.wait()
 *
 * Workflow stages:
 * 1. started - Workflow initiated
 * 2. welcome_sent - Welcome email sent
 * 3. completed - Workflow finished
 *
 * Future Phase 2 stages (multi-day drip):
 * - day1_sent, day3_sent, day7_sent
 */

import {
  DurableContext,
  withDurableExecution,
} from '@aws/durable-execution-sdk-js';
import { sendWelcomeEmail } from './steps/send-welcome';
import { checkpoint } from './steps/checkpoint';

export interface WelcomeWorkflowPayload {
  userId: string;
  clerkUserId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  executionId: string; // Svix webhook ID for idempotency
  isTeamMember: boolean; // true if invited, false if new signup
  businessId?: string;
  invitedBy?: string;
}

export interface WelcomeWorkflowResult {
  workflowId: string;
  userId: string;
  status: 'completed' | 'failed';
  stages: string[];
  error?: string;
}

/**
 * Lambda Durable Function Handler
 *
 * Wrapped with withDurableExecution for automatic checkpointing.
 * Each context.step() call creates a checkpoint - if the function
 * is interrupted, it resumes from the last successful step.
 */
export const handler = withDurableExecution(
  async (
    event: WelcomeWorkflowPayload,
    context: DurableContext
  ): Promise<WelcomeWorkflowResult> => {
    context.logger.info('Welcome workflow started', {
      userId: event.userId,
      executionId: event.executionId,
      isTeamMember: event.isTeamMember,
    });

    const completedStages: string[] = ['started'];

    try {
      // Step 1: Send welcome email (checkpointed)
      // If this succeeds and function is interrupted later,
      // replay will skip this step and use cached result
      const welcomeResult = await context.step(
        'send-welcome-email',
        async () => {
          context.logger.info('Sending welcome email', { email: event.email });
          return await sendWelcomeEmail({
            email: event.email,
            firstName: event.firstName,
            isTeamMember: event.isTeamMember,
            invitedBy: event.invitedBy,
            userId: event.userId, // Pass userId for unsubscribe token generation
          });
        }
      );

      if (!welcomeResult.success) {
        throw new Error(`Failed to send welcome email: ${welcomeResult.error}`);
      }

      completedStages.push('welcome_sent');

      // Step 2: Checkpoint workflow progress to Convex
      await context.step('checkpoint-welcome-sent', async () => {
        context.logger.info('Checkpointing welcome_sent stage');
        return await checkpoint({
          userId: event.userId,
          executionId: event.executionId,
          stage: 'welcome_sent',
          metadata: {
            sesMessageId: welcomeResult.messageId,
            timestamp: Date.now(),
          },
        });
      });

      // ─────────────────────────────────────────────
      // Phase 2: Multi-day Drip Sequence (uncomment when ready)
      // ─────────────────────────────────────────────

      // // Wait 1 day before sending Day 1 tips
      // await context.wait('day-1-delay', { seconds: 86400 });
      //
      // const day1Result = await context.step('send-day-1-tips', async () => {
      //   context.logger.info('Sending Day 1 tips email');
      //   return await sendDay1TipsEmail({
      //     email: event.email,
      //     firstName: event.firstName,
      //   });
      // });
      // completedStages.push('day1_sent');
      //
      // // Wait 2 more days before Day 3 tips
      // await context.wait('day-3-delay', { seconds: 172800 });
      //
      // const day3Result = await context.step('send-day-3-tips', async () => {
      //   context.logger.info('Sending Day 3 tips email');
      //   return await sendDay3TipsEmail({
      //     email: event.email,
      //     firstName: event.firstName,
      //   });
      // });
      // completedStages.push('day3_sent');

      // ─────────────────────────────────────────────

      completedStages.push('completed');

      // Final checkpoint
      await context.step('checkpoint-completed', async () => {
        context.logger.info('Workflow completed successfully');
        return await checkpoint({
          userId: event.userId,
          executionId: event.executionId,
          stage: 'completed',
          metadata: {
            completedAt: Date.now(),
            stages: completedStages,
          },
        });
      });

      context.logger.info('Welcome workflow completed', {
        userId: event.userId,
        executionId: event.executionId,
        stages: completedStages,
      });

      return {
        workflowId: event.executionId,
        userId: event.userId,
        status: 'completed',
        stages: completedStages,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      context.logger.error('Welcome workflow failed', {
        userId: event.userId,
        executionId: event.executionId,
        error: errorMessage,
      });

      return {
        workflowId: event.executionId,
        userId: event.userId,
        status: 'failed',
        stages: completedStages,
        error: errorMessage,
      };
    }
  }
);
