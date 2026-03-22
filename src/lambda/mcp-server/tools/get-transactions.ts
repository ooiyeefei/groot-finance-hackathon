/**
 * get_transactions MCP Tool Implementation
 *
 * Retrieves journal entry transactions with optional filters.
 * Wraps Convex functions/journalEntries:searchForAI.
 *
 * RBAC: Employees/managers only see expense_claim transactions.
 * Finance admins/owners see everything.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  GetTransactionsInput,
  GetTransactionsOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

export async function getTransactions(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<GetTransactionsOutput | MCPErrorResponse> {
  const input = args as GetTransactionsInput;

  const businessId = authContext?.businessId || (input.business_id as string);
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  const limit = input.limit || 10;

  try {
    const convex = getConvexClient();

    const result = await convex.query<any>('functions/journalEntries:searchForAI', {
      businessId,
      startDate: input.start_date,
      endDate: input.end_date,
      category: input.category,
      minAmount: input.min_amount,
      maxAmount: input.max_amount,
      sourceDocumentType: input.source_document_type,
      transactionType: input.transaction_type,
      limit,
    });

    if (!result || !result.entries || result.entries.length === 0) {
      return {
        transactions: [],
        totalCount: 0,
      };
    }

    // Map Convex results
    let transactions = result.entries.map((entry: any) => ({
      id: entry._id,
      description: entry.description,
      original_amount: entry.originalAmount,
      original_currency: entry.originalCurrency,
      home_currency_amount: entry.homeCurrencyAmount,
      transaction_date: entry.transactionDate,
      category: entry.category,
      vendor_name: entry.vendorName,
      transaction_type: entry.transactionType,
      source_document_type: entry.sourceDocumentType,
    }));

    // RBAC: Scope by role
    const role = (authContext?.userRole || '').toLowerCase();
    if (role === 'employee' || role === 'manager') {
      transactions = transactions.filter((t: any) =>
        t.source_document_type === 'expense_claim'
      );
    }

    // Text search filter (post-query, since Convex searchForAI may not support text search)
    if (input.query) {
      const queryLower = input.query.toLowerCase();
      transactions = transactions.filter((t: any) =>
        (t.vendor_name && t.vendor_name.toLowerCase().includes(queryLower)) ||
        (t.description && t.description.toLowerCase().includes(queryLower))
      );
    }

    const totalAmount = transactions.reduce(
      (sum: number, t: any) => sum + (t.home_currency_amount || t.original_amount || 0), 0
    );

    return {
      transactions,
      totalCount: transactions.length,
      summary: {
        totalAmount: Math.round(totalAmount * 100) / 100,
        currency: result.currency || 'MYR',
      },
    };
  } catch (error) {
    logger.error('get_transactions_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
