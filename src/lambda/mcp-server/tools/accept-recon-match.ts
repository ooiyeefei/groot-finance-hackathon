/**
 * accept_recon_match MCP Tool Implementation
 *
 * Accept, reject, or bulk-accept reconciliation matches.
 *
 * Calls existing Convex functions:
 * - reconciliationMatches:confirmMatch (accept single match)
 * - reconciliationMatches:rejectMatch (reject single match)
 * - reconciliationMatches:getCandidates (for bulk — filter by confidence)
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
  bankAccountId?: string;
  business_id?: string;
  _businessId?: string;
  _userId?: string;
}

interface AcceptReconMatchOutput {
  success: boolean;
  matchId?: string;
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

        // Call existing confirmMatch mutation
        await convex.mutation('functions/reconciliationMatches:confirmMatch', {
          matchId: input.matchId,
        });

        return {
          success: true,
          matchId: input.matchId,
          message: 'Match accepted and transaction reconciled.',
        };
      }

      case 'reject': {
        if (!input.matchId) {
          return { error: true, code: 'INVALID_PARAMS', message: 'matchId is required for reject' } as MCPErrorResponse;
        }

        // Call existing rejectMatch mutation
        await convex.mutation('functions/reconciliationMatches:rejectMatch', {
          matchId: input.matchId,
        });

        return {
          success: true,
          matchId: input.matchId,
          message: 'Match rejected.',
        };
      }

      case 'bulk_accept': {
        const minConfidence = input.minConfidence ?? 0.9;

        // Get all suggested matches for the business, filter by confidence
        const candidates = await convex.query<Array<{
          _id: string;
          confidenceScore?: number;
          status?: string;
          bankAccountId?: string;
        }>>('functions/reconciliationMatches:getCandidates', {
          businessId,
          bankAccountId: input.bankAccountId,
          status: 'suggested',
        });

        const eligible = (candidates || []).filter(
          (c) => (c.confidenceScore ?? 0) >= minConfidence
        );

        let acceptedCount = 0;
        for (const match of eligible) {
          try {
            await convex.mutation('functions/reconciliationMatches:confirmMatch', {
              matchId: match._id,
            });
            acceptedCount++;
          } catch (err) {
            logger.warn('bulk_accept_single_fail', { matchId: match._id, error: String(err) });
          }
        }

        return {
          success: true,
          acceptedCount,
          journalEntriesCreated: acceptedCount,
          message: `${acceptedCount} matches above ${Math.round(minConfidence * 100)}% confidence accepted.`,
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
