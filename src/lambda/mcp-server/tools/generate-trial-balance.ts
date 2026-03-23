/**
 * generate_trial_balance MCP Tool Implementation
 *
 * Generates a trial balance report as of a given date by querying
 * journal entry lines from the Convex backend.
 *
 * Part of fin-statements-gen.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type { MCPErrorResponse } from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

interface GenerateTrialBalanceInput {
  business_id?: string;
  as_of_date: string; // YYYY-MM-DD
}

/**
 * Execute generate_trial_balance tool
 */
export async function generateTrialBalance(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<Record<string, unknown> | MCPErrorResponse> {
  const input = args as GenerateTrialBalanceInput;

  const businessId = authContext?.businessId;
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  if (!input.as_of_date) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: 'as_of_date is required (YYYY-MM-DD format)',
    };
  }

  try {
    const convex = getConvexClient();

    logger.info('generate_trial_balance_start', {
      businessId,
      tool: 'generate_trial_balance',
    });

    const result = await convex.action<Record<string, unknown>>(
      'functions/financialStatements:getTrialBalance',
      {
        businessId,
        asOfDate: input.as_of_date,
      }
    );

    if (!result || ('error' in result && result.error)) {
      return {
        error: true,
        code: 'PROCESSING_ERROR',
        message: (result?.error as string) || 'Trial balance generation returned no data',
      };
    }

    logger.info('generate_trial_balance_complete', {
      businessId,
      tool: 'generate_trial_balance',
    });

    return result;
  } catch (error) {
    logger.info('generate_trial_balance_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }

    return {
      error: true,
      code: 'PROCESSING_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
