/**
 * cancel_proposal MCP Tool Implementation
 *
 * Cancels a pending proposal when the user decides not to proceed.
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  CancelProposalInput,
  CancelProposalOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { Id } from '../../../../convex/_generated/dataModel.js';

// Convex client - initialized lazily
let convexClient: ConvexHttpClient | null = null;

function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is required');
    }
    convexClient = new ConvexHttpClient(url);
  }
  return convexClient;
}

/**
 * Execute cancel_proposal tool
 *
 * @param args - Tool arguments
 * @param authContext - Authentication context from API key
 */
export async function cancelProposal(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<CancelProposalOutput | MCPErrorResponse> {
  const input = args as CancelProposalInput;

  // Require auth context
  if (!authContext?.businessId) {
    return {
      error: true,
      code: 'UNAUTHORIZED',
      message: 'API key authentication required for proposals',
    };
  }

  if (!input.proposal_id) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: 'proposal_id is required',
    };
  }

  try {
    const convex = getConvexClient();

    // First, get the proposal to verify business ownership
    const proposalResult = await convex.query(api.functions.mcpProposals.getProposal, {
      proposalId: input.proposal_id as Id<"mcp_proposals">,
    });

    if (!proposalResult.found) {
      return {
        error: true,
        code: 'INVALID_INPUT',
        message: 'Proposal not found',
        details: { proposal_id: input.proposal_id },
      };
    }

    // Verify business ownership
    if (proposalResult.proposal!.businessId !== authContext.businessId) {
      return {
        error: true,
        code: 'UNAUTHORIZED',
        message: 'Proposal does not belong to this business',
      };
    }

    // Check proposal status
    if (proposalResult.proposal!.status !== 'pending') {
      return {
        error: true,
        code: 'INVALID_INPUT',
        message: `Proposal cannot be cancelled - current status: ${proposalResult.proposal!.status}`,
        details: { currentStatus: proposalResult.proposal!.status },
      };
    }

    // Cancel the proposal
    const result = await convex.mutation(api.functions.mcpProposals.cancelProposal, {
      proposalId: input.proposal_id as Id<"mcp_proposals">,
      reason: input.reason,
    });

    if (!result.success) {
      return {
        error: true,
        code: 'INTERNAL_ERROR',
        message: result.error || 'Failed to cancel proposal',
      };
    }

    return {
      success: true,
      message: input.reason
        ? `Proposal cancelled: ${input.reason}`
        : 'Proposal cancelled successfully',
    };
  } catch (error) {
    console.error('[cancel_proposal] Error:', error);

    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
