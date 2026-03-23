/**
 * generate_cash_flow MCP Tool Implementation
 *
 * Generates a Cash Flow Statement for a date range, categorised into
 * operating, investing, and financing activities per IFRS 7 / IAS 7.
 *
 * Part of fin-statements-gen.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type { MCPErrorResponse } from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

interface GenerateCashFlowInput {
  business_id?: string;
  date_from: string; // YYYY-MM-DD
  date_to: string;   // YYYY-MM-DD
}

/**
 * Execute generate_cash_flow tool
 */
export async function generateCashFlow(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<Record<string, unknown> | MCPErrorResponse> {
  const input = args as GenerateCashFlowInput;

  const businessId = authContext?.businessId;
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  if (!input.date_from || !input.date_to) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: 'date_from and date_to are required (YYYY-MM-DD format)',
    };
  }

  try {
    const convex = getConvexClient();

    logger.info('generate_cash_flow_start', {
      businessId,
      tool: 'generate_cash_flow',
    });

    const result = await convex.action<Record<string, unknown>>(
      'functions/financialStatements:getCashFlow',
      {
        businessId,
        dateFrom: input.date_from,
        dateTo: input.date_to,
      }
    );

    if (!result || ('error' in result && result.error)) {
      return {
        error: true,
        code: 'PROCESSING_ERROR',
        message: (result?.error as string) || 'Cash flow statement generation returned no data',
      };
    }

    logger.info('generate_cash_flow_complete', {
      businessId,
      tool: 'generate_cash_flow',
    });

    return result;
  } catch (error) {
    logger.info('generate_cash_flow_error', {
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
