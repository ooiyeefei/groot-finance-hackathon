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
 * Resolve a natural language period to start/end YYYY-MM-DD dates.
 * Supports: "Q1 2026", "January 2026", "2026-01", "last quarter"
 */
function resolvePeriod(period: string): { start: string; end: string } {
  const now = new Date();
  const toISO = (d: Date) => d.toISOString().split('T')[0];

  // Quarter: "Q1 2026"
  const qMatch = period.match(/Q(\d)\s*(\d{4})/i);
  if (qMatch) {
    const q = parseInt(qMatch[1]);
    const y = parseInt(qMatch[2]);
    const startMonth = (q - 1) * 3;
    return {
      start: `${y}-${String(startMonth + 1).padStart(2, '0')}-01`,
      end: toISO(new Date(y, startMonth + 3, 0)),
    };
  }

  // Month name: "January 2026"
  const months = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];
  const mMatch = period.match(new RegExp(`(${months.join('|')})\\s*(\\d{4})`, 'i'));
  if (mMatch) {
    const m = months.indexOf(mMatch[1].toLowerCase());
    const y = parseInt(mMatch[2]);
    return {
      start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
      end: toISO(new Date(y, m + 1, 0)),
    };
  }

  // ISO month: "2026-01"
  const isoMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1]);
    const m = parseInt(isoMatch[2]) - 1;
    return {
      start: `${isoMatch[1]}-${isoMatch[2]}-01`,
      end: toISO(new Date(y, m + 1, 0)),
    };
  }

  // Default: last 3 months
  const start = new Date(now);
  start.setMonth(start.getMonth() - 3);
  return { start: toISO(start), end: toISO(now) };
}

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

    // Resolve natural language dates to YYYY-MM-DD
    // Convex action expects startDateA, endDateA, startDateB, endDateB
    const now = new Date();
    let startDateA: string;
    let endDateA: string;
    let startDateB: string | undefined;
    let endDateB: string | undefined;

    const toISO = (d: Date) => d.toISOString().split('T')[0];
    endDateA = toISO(now);

    if (input.date_range) {
      // Parse "past N months" or default to 6 months
      const monthMatch = input.date_range.match(/(\d+)\s*month/i);
      const months = monthMatch ? parseInt(monthMatch[1]) : 6;
      const start = new Date(now);
      start.setMonth(start.getMonth() - months);
      startDateA = toISO(start);
    } else if (input.period_a) {
      // Parse period like "Q1 2026", "January 2026", "2026-01"
      const resolved = resolvePeriod(input.period_a);
      startDateA = resolved.start;
      endDateA = resolved.end;
    } else {
      // Default: last 6 months
      const start = new Date(now);
      start.setMonth(start.getMonth() - 6);
      startDateA = toISO(start);
    }

    if (input.period_b) {
      const resolved = resolvePeriod(input.period_b);
      startDateB = resolved.start;
      endDateB = resolved.end;
    }

    const result = await convex.action<Record<string, unknown>>(
      'functions/trendAnalysis:analyzeTrends',
      {
        businessId,
        mode: input.mode,
        metric: input.metric,
        startDateA,
        endDateA,
        startDateB,
        endDateB,
        granularity: input.granularity || 'monthly',
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
