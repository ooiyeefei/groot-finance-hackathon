/**
 * create_proposal MCP Tool Implementation
 *
 * Creates a proposal for a write operation that requires human approval.
 * Implements the proposal pattern for safe AI-assisted financial operations.
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  CreateProposalInput,
  CreateProposalOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';

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
 * Execute create_proposal tool
 *
 * @param args - Tool arguments
 * @param authContext - Authentication context from API key
 */
export async function createProposal(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<CreateProposalOutput | MCPErrorResponse> {
  const input = args as CreateProposalInput;

  // Require auth context for proposals (they're business-scoped)
  if (!authContext?.businessId) {
    return {
      error: true,
      code: 'UNAUTHORIZED',
      message: 'API key authentication required for proposals',
    };
  }

  // Validate required fields
  if (!input.action_type) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: 'action_type is required',
    };
  }

  if (!input.target_id) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: 'target_id is required',
    };
  }

  if (!input.summary || input.summary.length < 10) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: 'summary is required (minimum 10 characters)',
    };
  }

  try {
    const convex = getConvexClient();

    // Only pass createdByApiKeyId if it's a valid Convex ID (not a test ID)
    const isValidConvexId = authContext.apiKeyId && authContext.apiKeyId.length > 20;

    const result = await convex.mutation(api.functions.mcpProposals.createProposal, {
      businessId: authContext.businessId,
      actionType: input.action_type,
      targetId: input.target_id,
      parameters: input.parameters || {},
      summary: input.summary,
      ...(isValidConvexId ? { createdByApiKeyId: authContext.apiKeyId as any } : {}),
    });

    return {
      proposal_id: result.proposalId,
      expires_at: result.expiresAt,
      expires_in_seconds: result.expiresInSeconds,
      confirmation_required: true,
      message: `Proposal created. Use confirm_proposal with proposal_id "${result.proposalId}" after human approval. Expires in ${result.expiresInSeconds} seconds.`,
    };
  } catch (error) {
    console.error('[create_proposal] Error:', error);

    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
