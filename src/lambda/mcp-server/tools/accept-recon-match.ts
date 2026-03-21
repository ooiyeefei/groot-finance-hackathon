/**
 * accept_recon_match MCP Tool Implementation
 *
 * Accept, reject, or bulk-accept reconciliation matches.
 * Accepting creates journal entries via bankReconGLPoster.
 */

import { getConvexClient } from '../lib/convex-client.js';
import { validateBusinessAccess, type AuthContext } from '../lib/auth.js';
import type { MCPErrorResponse } from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

interface AcceptReconMatchInput {
  action: 'accept' | 'reject' | 'bulk_accept';
  matchId?: string;
  runId?: string;
  minConfidence?: number;
  business_id?: string;
  _businessId?: string;
  _userId?: string;
}

interface AcceptReconMatchOutput {
  success: boolean;
  matchId?: string;
  journalEntryId?: string;
  acceptedCount?: number;
  journalEntriesCreated?: number;
  message: string;
}

export async function acceptReconMatch(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<AcceptReconMatchOutput | MCPErrorResponse> {
  const input = args as AcceptReconMatchInput;
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
    switch (input.action) {
      case 'accept': {
        if (!input.matchId) {
          return { error: true, code: 'INVALID_PARAMS', message: 'matchId is required for accept' } as MCPErrorResponse;
        }

        const result = await convex.mutation<{
          journalEntryId: string;
          message: string;
        }>('functions/bankTransactions:acceptMatch', {
          matchId: input.matchId,
          businessId,
          acceptedBy: input._userId,
        });

        return {
          success: true,
          matchId: input.matchId,
          journalEntryId: result.journalEntryId,
          message: result.message || 'Match accepted. Journal entry created.',
        };
      }

      case 'reject': {
        if (!input.matchId) {
          return { error: true, code: 'INVALID_PARAMS', message: 'matchId is required for reject' } as MCPErrorResponse;
        }

        await convex.mutation('functions/bankTransactions:rejectMatch', {
          matchId: input.matchId,
          businessId,
        });

        return {
          success: true,
          matchId: input.matchId,
          message: 'Match rejected.',
        };
      }

      case 'bulk_accept': {
        if (!input.runId) {
          return { error: true, code: 'INVALID_PARAMS', message: 'runId is required for bulk_accept' } as MCPErrorResponse;
        }

        const minConfidence = input.minConfidence ?? 0.9;

        const result = await convex.mutation<{
          acceptedCount: number;
          journalEntriesCreated: number;
        }>('functions/bankTransactions:bulkAcceptMatches', {
          runId: input.runId,
          businessId,
          minConfidence,
          acceptedBy: input._userId,
        });

        return {
          success: true,
          acceptedCount: result.acceptedCount,
          journalEntriesCreated: result.journalEntriesCreated,
          message: `${result.acceptedCount} matches above ${Math.round(minConfidence * 100)}% confidence accepted. ${result.journalEntriesCreated} journal entries created.`,
        };
      }

      default:
        return { error: true, code: 'INVALID_PARAMS', message: `Unknown action: ${input.action}` } as MCPErrorResponse;
    }
  } catch (err) {
    logger.error('accept_recon_match_error', { error: err instanceof Error ? err.message : String(err) });
    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: err instanceof Error ? err.message : 'Failed to process match action',
    } as MCPErrorResponse;
  }
}
