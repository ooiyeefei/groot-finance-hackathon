/**
 * get_employee_expenses MCP Tool Implementation
 *
 * Enables managers to query a specific employee's approved expense transactions.
 * Wraps Convex memberships:resolveEmployeeByName + financialIntelligence:getEmployeeExpensesForManager.
 *
 * Authorization: manager (direct reports only), finance_admin/owner (any employee)
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  GetEmployeeExpensesInput,
  GetEmployeeExpensesOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

export async function getEmployeeExpenses(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<GetEmployeeExpensesOutput | MCPErrorResponse> {
  const input = args as GetEmployeeExpensesInput;

  const businessId = authContext?.businessId || (input as any).business_id;
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  const requestingUserId = authContext?.userId || (input as any).requesting_user_id;
  if (!requestingUserId) {
    return { error: true, code: 'INVALID_INPUT', message: 'Requesting user ID is required for authorization' };
  }

  if (!input.employee_name || typeof input.employee_name !== 'string' || input.employee_name.trim().length === 0) {
    return { error: true, code: 'INVALID_INPUT', message: 'employee_name is required and must be a non-empty string' };
  }

  try {
    const convex = getConvexClient();

    // Step 1: Resolve employee name to user ID
    const nameResult = await convex.query<any>(
      'functions/memberships:resolveEmployeeByName',
      {
        businessId,
        requestingUserId,
        nameQuery: input.employee_name.trim(),
      }
    );

    if (!nameResult.matches || nameResult.matches.length === 0) {
      return {
        employee: { name: input.employee_name, id: '' },
        summary: { total_amount: 0, currency: 'MYR', record_count: 0, date_range: { start: input.start_date || 'all time', end: input.end_date || 'present' } },
        items: [],
        truncated: false,
        truncated_count: 0,
        message: `No employee named "${input.employee_name}" found in your team. You have ${nameResult.totalDirectReports || 0} direct report(s).`,
      };
    }

    // Check for ambiguous match
    if (nameResult.matches.length > 1 && nameResult.matches[0].confidence !== 'exact') {
      const matchList = nameResult.matches
        .map((m: any) => `${m.fullName} (${m.email})`)
        .join(', ');
      return {
        employee: { name: input.employee_name, id: '' },
        summary: { total_amount: 0, currency: 'MYR', record_count: 0, date_range: { start: input.start_date || 'all time', end: input.end_date || 'present' } },
        items: [],
        truncated: false,
        truncated_count: 0,
        message: `Multiple matches found for "${input.employee_name}": ${matchList}. Please specify which employee.`,
      };
    }

    const targetEmployee = nameResult.matches[0];

    // Step 2: Query employee expenses
    const result = await convex.query<any>(
      'functions/financialIntelligence:getEmployeeExpensesForManager',
      {
        businessId,
        requestingUserId,
        targetEmployeeId: targetEmployee.userId,
        filters: {
          vendorName: input.vendor,
          category: input.category,
          startDate: input.start_date,
          endDate: input.end_date,
          transactionType: input.transaction_type,
          limit: input.limit || 50,
        },
      }
    );

    if (!result.authorized) {
      return {
        error: true,
        code: 'UNAUTHORIZED',
        message: result.error || 'You can only view data for your direct reports.',
      };
    }

    const items = (result.entries || []).map((e: any) => ({
      date: e.transactionDate || '',
      description: e.description || '',
      vendor_name: e.vendorName || 'Unknown',
      amount: e.homeCurrencyAmount || 0,
      currency: e.homeCurrency || result.currency || 'MYR',
      category: e.category || 'Uncategorized',
      transaction_type: e.transactionType || 'Expense',
    }));

    return {
      employee: {
        name: result.employeeName || targetEmployee.fullName,
        id: targetEmployee.userId,
      },
      summary: {
        total_amount: result.totalAmount || 0,
        currency: result.currency || 'MYR',
        record_count: result.totalCount || 0,
        date_range: {
          start: input.start_date || 'all time',
          end: input.end_date || 'present',
        },
      },
      items,
      truncated: (result.totalCount || 0) > items.length,
      truncated_count: Math.max(0, (result.totalCount || 0) - items.length),
    };
  } catch (error) {
    logger.error('get_employee_expenses_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
