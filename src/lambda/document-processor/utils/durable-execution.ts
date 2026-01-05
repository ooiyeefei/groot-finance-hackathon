/**
 * Durable Execution Wrapper
 *
 * Provides a simple wrapper that simulates durable execution behavior.
 * In production, this would be replaced with AWS Step Functions or
 * a proper durable execution SDK.
 *
 * For now, this provides:
 * - Step-based execution tracking
 * - Error handling with step context
 * - Idempotency key extraction
 */

import type { Context as LambdaContext } from 'aws-lambda';

/**
 * Durable execution context passed to the handler
 */
export interface DurableContext {
  /**
   * Execute a named step with automatic tracking.
   * Steps are executed sequentially and their results are logged.
   */
  step: <T>(name: string, fn: () => Promise<T>) => Promise<T>;

  /**
   * Get the workflow execution ID
   */
  executionId: string;
}

/**
 * Options for durable execution wrapper
 */
export interface DurableExecutionOptions<TEvent> {
  /**
   * Function to extract workflow ID from event.
   * Used for idempotency and tracking.
   */
  workflowId: (event: TEvent) => string;
}

/**
 * Wrap a handler function with durable execution capabilities.
 *
 * @param handler - The handler function to wrap
 * @param options - Configuration options
 * @returns Wrapped handler function
 */
export function withDurableExecution<TEvent, TResult>(
  handler: (
    event: TEvent,
    lambdaContext: LambdaContext,
    durableContext: DurableContext
  ) => Promise<TResult>,
  options: DurableExecutionOptions<TEvent>
): (event: TEvent, context: LambdaContext) => Promise<TResult> {
  return async (event: TEvent, lambdaContext: LambdaContext): Promise<TResult> => {
    const workflowId = options.workflowId(event);
    const executionId = `${workflowId}-${Date.now()}`;

    console.log(`[DurableExecution] Starting workflow: ${workflowId}`);
    console.log(`[DurableExecution] Execution ID: ${executionId}`);

    const durableContext: DurableContext = {
      executionId,
      step: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
        const stepStart = Date.now();
        console.log(`[DurableExecution] Step "${name}" starting`);

        try {
          const result = await fn();
          const duration = Date.now() - stepStart;
          console.log(`[DurableExecution] Step "${name}" completed in ${duration}ms`);
          return result;
        } catch (error) {
          const duration = Date.now() - stepStart;
          console.error(`[DurableExecution] Step "${name}" failed after ${duration}ms:`, error);
          throw error;
        }
      },
    };

    try {
      const result = await handler(event, lambdaContext, durableContext);
      console.log(`[DurableExecution] Workflow ${workflowId} completed successfully`);
      return result;
    } catch (error) {
      console.error(`[DurableExecution] Workflow ${workflowId} failed:`, error);
      throw error;
    }
  };
}
