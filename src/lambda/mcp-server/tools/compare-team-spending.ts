/**
 * compare_team_spending MCP Tool Implementation
 *
 * Compares spending across team members with outlier detection.
 * Shows per-employee spending breakdown with employees spending significantly
 * above average highlighted.
 * Wraps Convex financialIntelligence:getTeamExpenseSummary.
 *
 * Authorization: manager, finance_admin, owner
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  CompareTeamSpendingInput,
  CompareTeamSpendingOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

export async function compareTeamSpending(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<CompareTeamSpendingOutput | MCPErrorResponse> {
  const input = args as CompareTeamSpendingInput;

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

    // Resolve date range from period or default to current month
    let startDate: string | undefined;
    let endDate: string | undefined;

    if (input.start_date && input.end_date) {
      startDate = input.start_date;
      endDate = input.end_date;
    } else {
      // Default to current month
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      startDate = `${year}-${month}-01`;
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    }

    const groupBy = input.group_by || 'employee';

    const result = await convex.query<any>(
      'functions/financialIntelligence:getTeamExpenseSummary',
      {
        businessId,
        requestingUserId,
        filters: {
          startDate,
          endDate,
          groupBy,
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

    if (!result.breakdown || result.breakdown.length === 0) {
      return {
        period: { start: startDate, end: endDate },
        currency: result.summary?.currency || 'MYR',
        team_total: 0,
        team_average: 0,
        outlier_threshold: 0,
        employees: [],
        outliers: [],
        top_categories: [],
      };
    }

    // Calculate team average and detect outliers
    const totalAmount = result.summary?.totalAmount || 0;
    const employeeCount = result.breakdown.length;
    const teamAverage = employeeCount > 0 ? totalAmount / employeeCount : 0;
    const outlierThreshold = teamAverage * 1.5;
    const currency = result.summary?.currency || 'MYR';

    const employees = result.breakdown
      .map((b: any) => ({
        name: b.groupKey || '',
        total_spend: b.totalAmount || 0,
        transaction_count: b.recordCount || 0,
        percentage: b.percentage || 0,
        is_outlier: (b.totalAmount || 0) > outlierThreshold,
      }))
      .sort((a: any, b: any) => b.total_spend - a.total_spend);

    const outliers = employees
      .filter((e: any) => e.is_outlier)
      .map((e: any) => ({
        name: e.name,
        total_spend: e.total_spend,
        ratio_to_average: teamAverage > 0
          ? Math.round((e.total_spend / teamAverage) * 10) / 10
          : 0,
      }));

    const topCategories = (result.topCategories || []).map((c: any) => ({
      category: c.categoryName || c.category || '',
      total_amount: c.totalAmount || 0,
      percentage: c.percentage || 0,
    }));

    return {
      period: { start: startDate, end: endDate },
      currency,
      team_total: Math.round(totalAmount * 100) / 100,
      team_average: Math.round(teamAverage * 100) / 100,
      outlier_threshold: Math.round(outlierThreshold * 100) / 100,
      employees,
      outliers,
      top_categories: topCategories,
    };
  } catch (error) {
    logger.error('compare_team_spending_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
