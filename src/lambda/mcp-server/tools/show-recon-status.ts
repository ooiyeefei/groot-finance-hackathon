/**
 * show_recon_status MCP Tool Implementation
 *
 * Returns current reconciliation status: matched/pending/unmatched counts
 * per bank account, with optional unmatched transaction listing.
 */

import { getConvexClient } from '../lib/convex-client.js';
import { validateBusinessAccess, type AuthContext } from '../lib/auth.js';
import type { MCPErrorResponse } from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

interface ShowReconStatusInput {
  bankAccountId?: string;
  query?: string;
  business_id?: string;
  _businessId?: string;
}

interface AccountStatus {
  bankAccountId: string;
  bankAccountName: string;
  totalTransactions: number;
  matched: number;
  pendingReview: number;
  unmatched: number;
  dateRange: { from: string; to: string };
  lastReconDate?: string;
}

interface UnmatchedTransaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  status: string;
}

interface ShowReconStatusOutput {
  accounts: AccountStatus[];
  unmatchedTransactions: UnmatchedTransaction[];
  message: string;
}

export async function showReconStatus(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<ShowReconStatusOutput | MCPErrorResponse> {
  const input = args as ShowReconStatusInput;
  const convex = getConvexClient();

  let businessId: string;
  if (authContext?.businessId) {
    businessId = authContext.businessId;
  } else {
    const bid = input._businessId || input.business_id;
    if (!bid) {
      return { error: true, code: 'INVALID_PARAMS', message: 'business_id is required' } as MCPErrorResponse;
    }
    const authResult = validateBusinessAccess(bid);
    if (!authResult.authorized) {
      return { error: true, code: authResult.error!.code as MCPErrorResponse['code'], message: authResult.error!.message } as MCPErrorResponse;
    }
    businessId = authResult.businessId!;
  }

  try {
    // Get reconciliation status summary
    const statusResult = await convex.query<{
      accounts: Array<{
        bankAccountId: string;
        accountName: string;
        totalTransactions: number;
        matched: number;
        pendingReview: number;
        unmatched: number;
        minDate: string;
        maxDate: string;
        lastReconDate?: string;
      }>;
      unmatchedTransactions: Array<{
        _id: string;
        transactionDate?: string;
        date?: string;
        amount: number;
        description?: string;
        narrative?: string;
        reconciliationStatus?: string;
      }>;
    }>('functions/bankTransactions:getReconciliationStatus', {
      businessId,
      bankAccountId: input.bankAccountId,
      limit: 10,
    });

    const accounts: AccountStatus[] = (statusResult.accounts || []).map((a) => ({
      bankAccountId: a.bankAccountId,
      bankAccountName: a.accountName,
      totalTransactions: a.totalTransactions,
      matched: a.matched,
      pendingReview: a.pendingReview,
      unmatched: a.unmatched,
      dateRange: { from: a.minDate, to: a.maxDate },
      lastReconDate: a.lastReconDate,
    }));

    const unmatchedTransactions: UnmatchedTransaction[] = (statusResult.unmatchedTransactions || []).map((t) => ({
      id: t._id,
      date: t.transactionDate || t.date || '',
      amount: t.amount,
      description: t.description || t.narrative || '',
      status: t.reconciliationStatus || 'unmatched',
    }));

    // Build summary message
    const parts: string[] = [];
    for (const a of accounts) {
      parts.push(
        `${a.bankAccountName}: ${a.totalTransactions} transactions — ${a.matched} matched, ${a.pendingReview} pending review, ${a.unmatched} unmatched.`
      );
    }

    return {
      accounts,
      unmatchedTransactions,
      message: parts.length > 0 ? parts.join('\n') : 'No bank transactions found.',
    };
  } catch (err) {
    logger.error('show_recon_status_error', { error: err instanceof Error ? err.message : String(err) });
    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: err instanceof Error ? err.message : 'Failed to retrieve reconciliation status',
    } as MCPErrorResponse;
  }
}
