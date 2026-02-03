/**
 * confirm_proposal MCP Tool Implementation
 *
 * Confirms and executes a pending proposal after human approval.
 * This is the critical human-in-the-loop step for write operations.
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  ConfirmProposalInput,
  ConfirmProposalOutput,
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
 * Execute confirm_proposal tool
 *
 * @param args - Tool arguments
 * @param authContext - Authentication context from API key
 */
export async function confirmProposal(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<ConfirmProposalOutput | MCPErrorResponse> {
  const input = args as ConfirmProposalInput;

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
        message: `Proposal cannot be confirmed - current status: ${proposalResult.proposal!.status}`,
        details: { currentStatus: proposalResult.proposal!.status },
      };
    }

    // Confirm and execute
    const result = await convex.mutation(api.functions.mcpProposals.confirmProposal, {
      proposalId: input.proposal_id as Id<"mcp_proposals">,
    });

    if (!result.success) {
      return {
        error: true,
        code: 'INTERNAL_ERROR',
        message: result.error || 'Failed to confirm proposal',
        details: result.message ? { message: result.message } : undefined,
      };
    }

    return {
      success: true,
      action_executed: proposalResult.proposal!.actionType,
      result: result.result || {},
      message: `Proposal confirmed and executed successfully. Action: ${proposalResult.proposal!.actionType}`,
    };
  } catch (error) {
    console.error('[confirm_proposal] Error:', error);

    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
