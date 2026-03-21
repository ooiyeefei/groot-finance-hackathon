/**
 * show_recon_status MCP Tool Implementation
 *
 * Returns current reconciliation status: matched/pending/unmatched counts
 * per bank account, with optional unmatched transaction listing.
 *
 * Calls existing Convex functions:
 * - bankAccounts:list (query — list bank accounts for business)
 * - reconciliationMatches:getReconciliationSummary (query — counts per account)
 * - bankTransactions:list (query — filtered by reconciliationStatus for unmatched listing)
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
    // Get bank accounts for the business
    const bankAccounts = await convex.query<Array<{
      _id: string;
      accountName?: string;
      bankName?: string;
      status?: string;
    }>>('functions/bankAccounts:list', { businessId });

    const accountsToCheck = input.bankAccountId
      ? (bankAccounts || []).filter((a) => a._id === input.bankAccountId)
      : (bankAccounts || []).filter((a) => a.status === 'active');

    const accounts: AccountStatus[] = [];
    const allUnmatched: UnmatchedTransaction[] = [];

    for (const account of accountsToCheck) {
      // Get reconciliation summary for this account
      const summary = await convex.query<{
        totalTransactions: number;
        reconciled: number;
        suggested: number;
        unmatched: number;
        categorized: number;
      } | null>('functions/reconciliationMatches:getReconciliationSummary', {
        businessId,
        bankAccountId: account._id,
      });

      if (summary) {
        accounts.push({
          bankAccountId: account._id,
          bankAccountName: account.accountName || account.bankName || 'Unknown Account',
          totalTransactions: summary.totalTransactions,
          matched: summary.reconciled,
          pendingReview: summary.suggested,
          unmatched: summary.unmatched,
        });
      }

      // Get unmatched transactions (limit 10 total across all accounts)
      if (allUnmatched.length < 10) {
        const txns = await convex.query<Array<{
          _id: string;
          transactionDate?: string;
          amount: number;
          description?: string;
          narrative?: string;
          reconciliationStatus?: string;
        }>>('functions/bankTransactions:list', {
          bankAccountId: account._id,
          reconciliationStatus: 'unmatched',
          limit: 10 - allUnmatched.length,
        });

        for (const t of (txns || [])) {
          // If there's a natural language query, filter by description match
          if (input.query) {
            const desc = (t.description || t.narrative || '').toLowerCase();
            const queryLower = input.query.toLowerCase();
            // Simple keyword matching — check if query terms appear in description
            const queryTerms = queryLower.split(/\s+/).filter((w) => w.length > 2);
            const matches = queryTerms.some((term) => desc.includes(term));
            if (!matches) continue;
          }

          allUnmatched.push({
            id: t._id,
            date: t.transactionDate || '',
            amount: t.amount,
            description: t.description || t.narrative || '',
            status: t.reconciliationStatus || 'unmatched',
          });
        }
      }
    }

    // Build summary message
    const parts: string[] = [];
    for (const a of accounts) {
      parts.push(
        `${a.bankAccountName}: ${a.totalTransactions} transactions — ${a.matched} matched, ${a.pendingReview} pending review, ${a.unmatched} unmatched.`
      );
    }

    return {
      accounts,
      unmatchedTransactions: allUnmatched,
      message: parts.length > 0 ? parts.join('\n') : 'No bank accounts or transactions found.',
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
