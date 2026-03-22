/**
 * get_team_summary MCP Tool Implementation
 *
 * Provides aggregate spending summary across a manager's direct reports.
 * Wraps Convex financialIntelligence:getTeamExpenseSummary.
 *
 * Authorization: manager (direct reports only), finance_admin/owner (all employees)
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  GetTeamSummaryInput,
  GetTeamSummaryOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

export async function getTeamSummary(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<GetTeamSummaryOutput | MCPErrorResponse> {
  const input = args as GetTeamSummaryInput;

  const businessId = authContext?.businessId || (input as any).business_id;
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  const requestingUserId = authContext?.userId || (input as any).requesting_user_id;
  if (!requestingUserId) {
    return { error: true, code: 'INVALID_INPUT', message: 'Requesting user ID is required for authorization' };
  }

  try {
    const convex = getConvexClient();

    const result = await convex.query<any>(
      'functions/financialIntelligence:getTeamExpenseSummary',
      {
        businessId,
        requestingUserId,
        filters: {
          startDate: input.start_date,
          endDate: input.end_date,
          category: input.category,
          vendorName: input.vendor,
          groupBy: input.group_by || 'employee',
        },
      }
    );

    if (!result.authorized) {
      return {
        error: true,
        code: 'UNAUTHORIZED',
        message: result.error || "You don't have permission to access team data.",
      };
    }

    const breakdown = (result.breakdown || []).map((b: any) => ({
      group_key: b.groupKey || '',
      total_amount: b.totalAmount || 0,
      record_count: b.recordCount || 0,
      percentage: b.percentage || 0,
    }));

    const topCategories = (result.topCategories || []).map((c: any) => ({
      category: c.categoryName || c.category || '',
      total_amount: c.totalAmount || 0,
      percentage: c.percentage || 0,
    }));

    return {
      summary: {
        total_amount: result.summary?.totalAmount || 0,
        currency: result.summary?.currency || 'MYR',
        employee_count: result.summary?.employeeCount || 0,
        record_count: result.summary?.recordCount || 0,
        date_range: {
          start: input.start_date || 'all time',
          end: input.end_date || 'present',
        },
      },
      breakdown,
      top_categories: topCategories,
    };
  } catch (error) {
    logger.error('get_team_summary_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
