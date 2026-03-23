/**
 * generate_pnl MCP Tool Implementation
 *
 * Generates a Profit & Loss statement for a date range.
 * Optionally generates a comparison report against the immediately prior
 * period of the same length.
 *
 * Part of fin-statements-gen.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type { MCPErrorResponse } from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

interface GeneratePnlInput {
  business_id?: string;
  date_from: string; // YYYY-MM-DD
  date_to: string;   // YYYY-MM-DD
  comparison?: boolean;
}

/**
 * Calculate the comparison period: same length, immediately prior.
 * E.g. if date_from=2026-01-01, date_to=2026-03-31 (90 days),
 * comparison period = 2025-10-03 to 2025-12-31.
 */
function getComparisonPeriod(dateFrom: string, dateTo: string): { dateFrom: string; dateTo: string } {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const durationMs = to.getTime() - from.getTime();

  const compTo = new Date(from.getTime() - 1); // day before current period start
  const compFrom = new Date(compTo.getTime() - durationMs);

  const toISO = (d: Date) => d.toISOString().split('T')[0];
  return { dateFrom: toISO(compFrom), dateTo: toISO(compTo) };
}

/**
 * Execute generate_pnl tool
 */
export async function generatePnl(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<Record<string, unknown> | MCPErrorResponse> {
  const input = args as GeneratePnlInput;

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

  const comparison = input.comparison ?? false;

  try {
    const convex = getConvexClient();

    logger.info('generate_pnl_start', {
      businessId,
      tool: 'generate_pnl',
      comparison,
    });

    let result: Record<string, unknown>;

    if (comparison) {
      const compPeriod = getComparisonPeriod(input.date_from, input.date_to);

      result = await convex.action<Record<string, unknown>>(
        'functions/financialStatements:getProfitLossComparison',
        {
          businessId,
          dateFrom: input.date_from,
          dateTo: input.date_to,
          comparisonDateFrom: compPeriod.dateFrom,
          comparisonDateTo: compPeriod.dateTo,
        }
      );
    } else {
      result = await convex.action<Record<string, unknown>>(
        'functions/financialStatements:getProfitLoss',
        {
          businessId,
          dateFrom: input.date_from,
          dateTo: input.date_to,
        }
      );
    }

    if (!result || ('error' in result && result.error)) {
      return {
        error: true,
        code: 'PROCESSING_ERROR',
        message: (result?.error as string) || 'P&L generation returned no data',
      };
    }

    logger.info('generate_pnl_complete', {
      businessId,
      tool: 'generate_pnl',
      comparison,
    });

    return result;
  } catch (error) {
    logger.info('generate_pnl_error', {
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
