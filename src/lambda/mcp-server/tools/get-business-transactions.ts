/**
 * get_business_transactions MCP Tool Implementation
 *
 * Queries ALL business transactions across all employees with employee attribution.
 * Finance admin/owner only.
 * Wraps Convex functions/financialIntelligence:getBusinessTransactions.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  GetBusinessTransactionsInput,
  GetBusinessTransactionsOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

export async function getBusinessTransactions(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<GetBusinessTransactionsOutput | MCPErrorResponse> {
  const input = args as GetBusinessTransactionsInput;

  const businessId = authContext?.businessId || (input.business_id as string);
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  try {
    const convex = getConvexClient();

    const result = await convex.query<any>('functions/financialIntelligence:getBusinessTransactions', {
      businessId,
      query: input.query,
      category: input.category,
      transactionType: input.transaction_type,
      startDate: input.start_date,
      endDate: input.end_date,
      limit: input.limit,
    });

    if ('error' in result && result.error) {
      return { error: true, code: 'CONVEX_ERROR', message: result.error };
    }

    const transactions = (result.transactions || []).map((t: any) => ({
      transactionDate: t.transactionDate,
      vendorName: t.vendorName,
      amount: t.amount,
      currency: t.currency,
      category: t.category || 'Uncategorized',
      description: t.description || '',
      transactionType: t.transactionType,
      employeeName: t.employeeName,
    }));

    return {
      transactions,
      totalCount: result.totalCount || transactions.length,
      totalAmount: result.totalAmount || 0,
      currency: result.currency || 'MYR',
    };
  } catch (error) {
    logger.error('get_business_transactions_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
