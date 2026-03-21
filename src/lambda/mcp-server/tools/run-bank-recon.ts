/**
 * run_bank_reconciliation MCP Tool Implementation
 *
 * Triggers Tier 1 (rule-based) + Tier 2 (DSPy) bank reconciliation
 * for a specific bank account. Returns match results for chat display.
 *
 * Calls existing Convex functions:
 * - reconciliationMatches:runMatching (action — runs Tier 1+2 matching)
 * - reconciliationMatches:getReconciliationSummary (query — counts)
 * - reconciliationMatches:getCandidates (query — pending matches)
 * - bankAccounts:getById (query — account name)
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

interface PendingMatch {
  matchId: string;
  bankTransaction: {
    id: string;
    date: string;
    amount: number;
    description: string;
  };
  matchedItems: Array<{
    type: string;
    id: string;
    reference: string;
    amount: number;
    vendor?: string;
  }>;
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
    // Concurrency guard — create run record (returns error if already running)
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

    // Get bank account name
    const bankAccount = await convex.query<{ accountName?: string; bankName?: string } | null>(
      'functions/bankAccounts:getById',
      { bankAccountId: input.bankAccountId }
    );
    const accountName = bankAccount?.accountName || bankAccount?.bankName || 'Bank Account';

    // Trigger existing matching engine (reconciliationMatches:runMatching)
    // This runs Tier 1 rules + Tier 2 DSPy candidate matching
    const matchResult = await convex.mutation<{ matched: number; unmatched: number }>(
      'functions/reconciliationMatches:runMatching',
      { businessId, bankAccountId: input.bankAccountId }
    );

    // Get updated reconciliation summary
    const summary = await convex.query<{
      totalTransactions: number;
      reconciled: number;
      suggested: number;
      unmatched: number;
    } | null>('functions/reconciliationMatches:getReconciliationSummary', {
      businessId,
      bankAccountId: input.bankAccountId,
    });

    const matchedCount = matchResult.matched;
    const pendingReviewCount = summary?.suggested ?? 0;
    const unmatchedCount = summary?.unmatched ?? matchResult.unmatched;

    // Update run record with results
    await convex.mutation('functions/bankReconRuns:updateStatus', {
      runId,
      status: 'complete',
      matchedCount,
      pendingReviewCount,
      unmatchedCount,
    });

    // Get pending match candidates for chat display
    const candidates = await convex.query<Array<{
      _id: string;
      bankTransactionId: string;
      matchType?: string;
      confidenceScore?: number;
      confidenceLevel?: string;
      matchReason?: string;
      status?: string;
    }>>('functions/reconciliationMatches:getCandidates', {
      businessId,
      bankAccountId: input.bankAccountId,
      status: 'suggested',
    });

    // Enrich with bank transaction details
    const pendingMatches: PendingMatch[] = [];
    for (const c of (candidates || []).slice(0, 20)) {
      const txn = await convex.query<{
        _id: string;
        transactionDate?: string;
        amount: number;
        description?: string;
        narrative?: string;
      } | null>('functions/bankTransactions:getById', {
        bankTransactionId: c.bankTransactionId,
      });

      if (txn) {
        pendingMatches.push({
          matchId: c._id,
          bankTransaction: {
            id: c.bankTransactionId,
            date: txn.transactionDate || '',
            amount: txn.amount,
            description: txn.description || txn.narrative || '',
          },
          matchedItems: [{
            type: 'journal_entry',
            id: '', // JE ID from the match
            reference: c.matchReason || '',
            amount: Math.abs(txn.amount),
          }],
          confidence: c.confidenceScore || 0,
          matchType: c.matchType || 'fuzzy',
        });
      }
    }

    const total = (summary?.totalTransactions ?? matchedCount + unmatchedCount);

    return {
      runId,
      bankAccountName: accountName,
      status: 'complete',
      summary: {
        totalProcessed: total,
        matched: matchedCount,
        pendingReview: pendingReviewCount,
        unmatched: unmatchedCount,
      },
      pendingMatches,
      message: `Reconciled ${total} transactions in ${accountName}: ${matchedCount} matched, ${pendingReviewCount} need review, ${unmatchedCount} unmatched.`,
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
