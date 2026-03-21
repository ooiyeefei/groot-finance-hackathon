/**
 * run_bank_reconciliation MCP Tool Implementation
 *
 * Triggers Tier 1 (rule-based) + Tier 2 (DSPy) bank reconciliation
 * for a specific bank account. Returns match results for chat display.
 */

import { getConvexClient } from '../lib/convex-client.js';
import { validateBusinessAccess, type AuthContext } from '../lib/auth.js';
import type { MCPErrorResponse } from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

interface RunBankReconInput {
  bankAccountId: string;
  business_id?: string;
  _businessId?: string;
  _userId?: string;
}

interface MatchItem {
  type: string;
  id: string;
  reference: string;
  amount: number;
  vendor?: string;
}

interface PendingMatch {
  matchId: string;
  bankTransaction: {
    id: string;
    date: string;
    amount: number;
    description: string;
  };
  matchedItems: MatchItem[];
  confidence: number;
  matchType: string;
}

interface RunBankReconOutput {
  runId: string;
  bankAccountName: string;
  status: string;
  summary: {
    totalProcessed: number;
    matched: number;
    pendingReview: number;
    unmatched: number;
  };
  pendingMatches: PendingMatch[];
  message: string;
}

interface BankTransaction {
  _id: string;
  date?: string;
  transactionDate?: string;
  amount: number;
  description?: string;
  narrative?: string;
  reconciliationStatus?: string;
  direction?: string;
}

interface BankAccount {
  _id: string;
  accountName?: string;
  bankName?: string;
}

interface ReconMatch {
  _id: string;
  bankTransactionId: string;
  matchType?: string;
  confidenceScore?: number;
  status?: string;
  matchedInvoiceId?: string;
  matchedReference?: string;
  matchedAmount?: number;
  matchedVendor?: string;
}

export async function runBankReconciliation(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<RunBankReconOutput | MCPErrorResponse> {
  const input = args as RunBankReconInput;
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

  if (!input.bankAccountId) {
    return { error: true, code: 'INVALID_PARAMS', message: 'bankAccountId is required' } as MCPErrorResponse;
  }

  try {
    // Check for concurrent run
    const createResult = await convex.mutation<{ runId?: string; error?: string }>('functions/bankReconRuns:create', {
      businessId,
      bankAccountId: input.bankAccountId,
      triggeredBy: input._userId,
    });

    if (createResult.error === 'reconciliation_in_progress') {
      return {
        error: true,
        code: 'CONFLICT',
        message: 'A bank reconciliation is already in progress for this business. Please wait for it to complete.',
      } as MCPErrorResponse;
    }

    const runId = createResult.runId!;

    // Get bank account details
    const bankAccount = await convex.query<BankAccount | null>('functions/bankAccounts:getById', {
      bankAccountId: input.bankAccountId,
    });
    const accountName = bankAccount?.accountName || bankAccount?.bankName || 'Bank Account';

    // Get unmatched transactions for this account
    const unmatchedTxns = await convex.query<BankTransaction[]>('functions/bankTransactions:getUnmatchedByAccount', {
      bankAccountId: input.bankAccountId,
      limit: 500,
    });

    if (!unmatchedTxns || unmatchedTxns.length === 0) {
      await convex.mutation('functions/bankReconRuns:updateStatus', {
        runId,
        status: 'complete',
        matchedCount: 0,
        pendingReviewCount: 0,
        unmatchedCount: 0,
      });

      return {
        runId,
        bankAccountName: accountName,
        status: 'complete',
        summary: { totalProcessed: 0, matched: 0, pendingReview: 0, unmatched: 0 },
        pendingMatches: [],
        message: `All transactions in ${accountName} are already reconciled.`,
      };
    }

    // Trigger existing Tier 1 + Tier 2 classification
    // This calls the existing bankReconClassifier + DSPy pipeline
    const reconResult = await convex.mutation<{
      matchedCount: number;
      pendingReviewCount: number;
      unmatchedCount: number;
      pendingMatches: ReconMatch[];
    }>('functions/bankTransactions:runReconciliation', {
      businessId,
      bankAccountId: input.bankAccountId,
      transactionIds: unmatchedTxns.map((t) => t._id),
    });

    // Update run record
    await convex.mutation('functions/bankReconRuns:updateStatus', {
      runId,
      status: 'complete',
      matchedCount: reconResult.matchedCount,
      pendingReviewCount: reconResult.pendingReviewCount,
      unmatchedCount: reconResult.unmatchedCount,
    });

    // Build pending match cards for chat display
    const pendingMatches: PendingMatch[] = (reconResult.pendingMatches || []).map((m) => {
      const txn = unmatchedTxns.find((t) => t._id === m.bankTransactionId);
      return {
        matchId: m._id,
        bankTransaction: {
          id: m.bankTransactionId,
          date: txn?.transactionDate || txn?.date || '',
          amount: txn?.amount || 0,
          description: txn?.description || txn?.narrative || '',
        },
        matchedItems: [{
          type: 'invoice',
          id: m.matchedInvoiceId || '',
          reference: m.matchedReference || '',
          amount: m.matchedAmount || 0,
          vendor: m.matchedVendor || '',
        }],
        confidence: m.confidenceScore || 0,
        matchType: m.matchType || 'fuzzy',
      };
    });

    const total = reconResult.matchedCount + reconResult.pendingReviewCount + reconResult.unmatchedCount;

    return {
      runId,
      bankAccountName: accountName,
      status: 'complete',
      summary: {
        totalProcessed: total,
        matched: reconResult.matchedCount,
        pendingReview: reconResult.pendingReviewCount,
        unmatched: reconResult.unmatchedCount,
      },
      pendingMatches,
      message: `Reconciled ${total} transactions in ${accountName}: ${reconResult.matchedCount} matched, ${reconResult.pendingReviewCount} need review, ${reconResult.unmatchedCount} unmatched.`,
    };
  } catch (err) {
    logger.error('run_bank_recon_error', { error: err instanceof Error ? err.message : String(err) });
    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: err instanceof Error ? err.message : 'Failed to run bank reconciliation',
    } as MCPErrorResponse;
  }
}
