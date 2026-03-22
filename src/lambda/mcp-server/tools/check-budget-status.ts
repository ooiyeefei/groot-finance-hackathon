/**
 * check_budget_status MCP Tool Implementation
 *
 * Checks budget utilization across expense categories.
 * Read-only query — no proposal pattern needed.
 *
 * Part of 032-mcp-first migration.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  CheckBudgetStatusInput,
  CheckBudgetStatusOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

interface BudgetCategory {
  categoryId: string;
  categoryName: string;
  budgetLimit: number;
  currentSpend: number;
  remaining: number;
  percentUsed: number;
  status: 'on_track' | 'warning' | 'overspent';
}

interface BudgetStatusResult {
  categories: BudgetCategory[];
  currency: string;
  overallStatus: string;
}

/**
 * Execute check_budget_status tool
 */
export async function checkBudgetStatus(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<CheckBudgetStatusOutput | MCPErrorResponse> {
  const input = args as CheckBudgetStatusInput;

  const businessId = authContext?.businessId;
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  // Validate period format if provided
  if (input.period && !/^\d{4}-\d{2}$/.test(input.period)) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: 'period must be in YYYY-MM format (e.g., 2026-03)',
    };
  }

  try {
    const convex = getConvexClient();
    const period = input.period || new Date().toISOString().slice(0, 7);

    logger.info('check_budget_status_start', {
      businessId,
      period,
      category: input.category || 'all',
    });

    const result = await convex.action<BudgetStatusResult | null>(
      'functions/budgetTracking:getBudgetStatus',
      {
        businessId,
        category: input.category,
        period,
      }
    );

    if (!result || !result.categories || result.categories.length === 0) {
      let noDataMessage = 'No budgeted expense categories found.';
      if (input.category) {
        noDataMessage = `No budget found for category "${input.category}".`;
      }
      noDataMessage += ' You can set budgets using the set_budget command (e.g., "Set Travel budget to RM 5000").';

      return {
        period,
        currency: result?.currency || 'MYR',
        categories: [],
        totalBudget: 0,
        totalSpend: 0,
        overallUtilization: 0,
        overallStatus: 'no_budgets',
        overBudgetCategories: [],
        warningCategories: [],
        message: noDataMessage,
      };
    }

    // Calculate totals
    let totalBudget = 0;
    let totalSpend = 0;

    const categories = result.categories.map((cat) => {
      totalBudget += cat.budgetLimit;
      totalSpend += cat.currentSpend;

      return {
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        budgetLimit: cat.budgetLimit,
        currentSpend: cat.currentSpend,
        remaining: cat.remaining,
        percentUsed: cat.percentUsed,
        status: cat.status,
      };
    });

    const overallUtilization = totalBudget > 0
      ? Math.round((totalSpend / totalBudget) * 100)
      : 0;

    const overBudgetCategories = categories
      .filter(c => c.percentUsed >= 100)
      .map(c => c.categoryName);

    const warningCategories = categories
      .filter(c => c.percentUsed >= 80 && c.percentUsed < 100)
      .map(c => c.categoryName);

    logger.info('check_budget_status_complete', {
      businessId,
      period,
      categoriesCount: categories.length,
      overBudgetCount: overBudgetCategories.length,
    });

    return {
      period,
      currency: result.currency,
      categories,
      totalBudget,
      totalSpend,
      overallUtilization,
      overallStatus: result.overallStatus,
      overBudgetCategories,
      warningCategories,
    };
  } catch (error) {
    logger.info('check_budget_status_error', {
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
