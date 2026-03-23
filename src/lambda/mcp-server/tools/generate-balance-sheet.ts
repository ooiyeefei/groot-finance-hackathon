/**
 * generate_balance_sheet MCP Tool Implementation
 *
 * Generates a Balance Sheet (Statement of Financial Position) as of a
 * given date. Assets = Liabilities + Equity per IFRS standards.
 *
 * Part of fin-statements-gen.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type { MCPErrorResponse } from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

interface GenerateBalanceSheetInput {
  business_id?: string;
  as_of_date: string; // YYYY-MM-DD
}

/**
 * Execute generate_balance_sheet tool
 */
export async function generateBalanceSheet(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<Record<string, unknown> | MCPErrorResponse> {
  const input = args as GenerateBalanceSheetInput;

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

    logger.info('generate_balance_sheet_start', {
      businessId,
      tool: 'generate_balance_sheet',
    });

    const result = await convex.action<Record<string, unknown>>(
      'functions/financialStatements:getBalanceSheet',
      {
        businessId,
        asOfDate: input.as_of_date,
      }
    );

    if (!result || ('error' in result && result.error)) {
      return {
        error: true,
        code: 'PROCESSING_ERROR',
        message: (result?.error as string) || 'Balance sheet generation returned no data',
      };
    }

    logger.info('generate_balance_sheet_complete', {
      businessId,
      tool: 'generate_balance_sheet',
    });

    return result;
  } catch (error) {
    logger.info('generate_balance_sheet_error', {
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
