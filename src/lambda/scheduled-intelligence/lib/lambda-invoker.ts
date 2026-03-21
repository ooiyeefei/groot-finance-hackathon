/**
 * Lambda invoker for calling Python DSPy optimizer
 *
 * Used by DSPy optimization jobs to invoke the existing
 * groot-finance-dspy-optimizer Lambda function.
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const DSPY_OPTIMIZER_FUNCTION = process.env.DSPY_OPTIMIZER_FUNCTION_NAME || 'groot-finance-dspy-optimizer';

/**
 * Invoke Python DSPy optimizer Lambda
 *
 * @param module - DSPy module type ('fee', 'bank-recon', 'po-match', 'ar-match', 'chat-agent')
 * @returns DSPy optimization result
 */
export async function invokeDspyOptimizer(
  module: string
): Promise<{
  troubleshooter?: { optimized: boolean; reason: string };
  recon?: { optimized: boolean; reason: string };
  evaluation?: Record<string, unknown>;
  durationMs?: number;
  error?: string;
}> {
  const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-west-2' });

  const command = new InvokeCommand({
    FunctionName: DSPY_OPTIMIZER_FUNCTION,
    InvocationType: 'RequestResponse', // Synchronous invocation
    Payload: JSON.stringify({
      source: 'scheduled-intelligence',
      module,
    }),
  });

  try {
    const response = await lambda.send(command);

    if (response.FunctionError) {
      const errorPayload = response.Payload
        ? JSON.parse(Buffer.from(response.Payload).toString())
        : { error: 'Unknown Lambda error' };
      throw new Error(`DSPy optimizer failed: ${JSON.stringify(errorPayload)}`);
    }

    if (!response.Payload) {
      throw new Error('DSPy optimizer returned no payload');
    }

    const result = JSON.parse(Buffer.from(response.Payload).toString());
    return result;
  } catch (error) {
    console.error(`[Lambda Invoker] DSPy optimizer invocation failed for module ${module}:`, error);
    throw error;
  }
}
