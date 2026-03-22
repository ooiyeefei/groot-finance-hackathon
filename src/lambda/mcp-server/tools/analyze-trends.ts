/**
 * analyze_trends MCP Tool Implementation
 *
 * Analyzes financial trends: period comparison, multi-period time series,
 * and growth rate calculations. Read-only query via Convex action.
 *
 * Part of 032-mcp-first migration.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  AnalyzeTrendsInput,
  AnalyzeTrendsOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

/**
 * Execute analyze_trends tool
 */
export async function analyzeTrends(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<AnalyzeTrendsOutput | MCPErrorResponse> {
  const input = args as AnalyzeTrendsInput;

  const businessId = authContext?.businessId;
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  // Validate mode
  const validModes = ['compare', 'trend', 'growth'];
  if (!input.mode || !validModes.includes(input.mode)) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: `Invalid mode '${input.mode}'. Must be one of: ${validModes.join(', ')}`,
    };
  }

  // Validate metric
  const validMetrics = ['revenue', 'expenses', 'profit', 'cash_flow'];
  if (!input.metric || !validMetrics.includes(input.metric)) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: `Invalid metric '${input.metric}'. Must be one of: ${validMetrics.join(', ')}`,
    };
  }

  if (input.mode === 'compare' && (!input.period_a || !input.period_b)) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: 'Compare mode requires both period_a and period_b',
    };
  }

  if (input.mode === 'trend' && !input.date_range && !input.period_a) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: 'Trend mode requires date_range or period_a',
    };
  }

  try {
    const convex = getConvexClient();

    logger.info('analyze_trends_start', {
      businessId,
      mode: input.mode,
      metric: input.metric,
    });

    // Call the Convex trendAnalysis action which handles date resolution
    // and journal entry aggregation server-side
    const result = await convex.action<Record<string, unknown>>(
      'functions/trendAnalysis:analyzeTrends',
      {
        businessId,
        mode: input.mode,
        metric: input.metric,
        periodA: input.period_a,
        periodB: input.period_b,
        dateRange: input.date_range,
        granularity: input.granularity || 'monthly',
        displayCurrency: input.display_currency,
      }
    );

    if (!result || ('error' in result && result.error)) {
      return {
        error: true,
        code: 'INSUFFICIENT_DATA',
        message: (result?.error as string) || 'Trend analysis returned no data',
      };
    }

    logger.info('analyze_trends_complete', {
      businessId,
      mode: input.mode,
      metric: input.metric,
    });

    return {
      mode: input.mode,
      metric: input.metric,
      result,
    };
  } catch (error) {
    logger.info('analyze_trends_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }

    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
