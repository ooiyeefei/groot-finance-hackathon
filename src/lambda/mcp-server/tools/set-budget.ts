/**
 * set_budget MCP Tool Implementation
 *
 * Sets, updates, or removes monthly budget limits for expense categories.
 * This is a WRITE operation, so it uses the proposal pattern.
 *
 * Part of 032-mcp-first migration.
 */

import type { AuthContext } from '../lib/auth.js';
import type {
  SetBudgetInput,
  SetBudgetOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';
import { createProposal } from './create-proposal.js';

/**
 * Execute set_budget tool
 *
 * Delegates to the proposal system since this modifies business data.
 */
export async function setBudget(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<SetBudgetOutput | MCPErrorResponse> {
  const input = args as SetBudgetInput;

  if (!authContext?.businessId) {
    return {
      error: true,
      code: 'UNAUTHORIZED',
      message: 'API key authentication required for budget changes',
    };
  }

  // Validate required fields
  if (!input.category_name || typeof input.category_name !== 'string' || input.category_name.trim().length === 0) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: 'category_name is required and must be a non-empty string',
    };
  }

  if (input.monthly_limit === undefined || input.monthly_limit === null || typeof input.monthly_limit !== 'number') {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: 'monthly_limit is required and must be a number',
    };
  }

  if (input.monthly_limit < 0) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: 'monthly_limit must be 0 (to remove) or a positive number (to set/update)',
    };
  }

  if (input.currency && (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency))) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: 'currency must be a valid ISO 4217 currency code (e.g., MYR, SGD, USD)',
    };
  }

  try {
    const isRemoving = input.monthly_limit === 0;
    const action = isRemoving ? 'remove' : 'set';

    logger.info('set_budget_start', {
      businessId: authContext.businessId,
      categoryName: input.category_name,
      action,
      monthlyLimit: input.monthly_limit,
    });

    // Build summary for proposal
    const summary = isRemoving
      ? `Remove budget limit for "${input.category_name}"`
      : `Set budget for "${input.category_name}" to ${input.monthly_limit.toFixed(2)} ${input.currency || 'MYR'}/month`;

    // Delegate to the proposal system for human approval
    const proposalResult = await createProposal(
      {
        action_type: 'update_vendor' as const, // Reuse existing action type for budget updates
        target_id: `budget-${input.category_name.toLowerCase().replace(/\s+/g, '-')}`,
        parameters: {
          category_name: input.category_name,
          monthly_limit: input.monthly_limit,
          currency: input.currency,
          operation: action,
        },
        summary,
      },
      authContext
    );

    // If proposal creation returned an error, pass it through
    if ('error' in proposalResult && proposalResult.error === true) {
      return proposalResult as MCPErrorResponse;
    }

    const proposal = proposalResult as { proposal_id: string; expires_at: number; expires_in_seconds: number; message: string };

    return {
      proposal_id: proposal.proposal_id,
      confirmation_required: true,
      action,
      category_name: input.category_name,
      monthly_limit: isRemoving ? undefined : input.monthly_limit,
      currency: input.currency,
      message: `Budget ${action} proposal created for "${input.category_name}". ${proposal.message}`,
    };
  } catch (error) {
    logger.info('set_budget_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
