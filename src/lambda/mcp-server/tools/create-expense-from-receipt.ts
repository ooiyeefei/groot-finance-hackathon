/**
 * create_expense_from_receipt MCP Tool Implementation
 *
 * Processes receipt images to create draft expense claims.
 * This is a WRITE operation, so it uses the proposal pattern:
 * creates a proposal that requires human confirmation before executing.
 *
 * Part of 032-mcp-first migration.
 */

import type { AuthContext } from '../lib/auth.js';
import type {
  CreateExpenseFromReceiptInput,
  CreateExpenseFromReceiptOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';
import { createProposal } from './create-proposal.js';

/**
 * Execute create_expense_from_receipt tool
 *
 * Since this is a write operation (creates expense claims), it delegates
 * to the proposal system. The agent creates a proposal with the receipt
 * data, and the user must confirm before the claim is actually created.
 */
export async function createExpenseFromReceipt(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<CreateExpenseFromReceiptOutput | MCPErrorResponse> {
  const input = args as CreateExpenseFromReceiptInput;

  if (!authContext?.businessId) {
    return {
      error: true,
      code: 'UNAUTHORIZED',
      message: 'API key authentication required for expense claim creation',
    };
  }

  // Validate attachments
  if (!input.attachments || !Array.isArray(input.attachments) || input.attachments.length === 0) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: 'At least one receipt attachment is required',
    };
  }

  for (const att of input.attachments) {
    if (!att.s3Path || !att.mimeType || !att.filename) {
      return {
        error: true,
        code: 'INVALID_INPUT',
        message: 'Each attachment must have s3Path, mimeType, and filename',
      };
    }
  }

  try {
    logger.info('create_expense_from_receipt_start', {
      businessId: authContext.businessId,
      attachmentCount: input.attachments.length,
    });

    // Delegate to the proposal system for human approval
    const proposalResult = await createProposal(
      {
        action_type: 'create_expense_claim' as const,
        target_id: `receipt-${Date.now()}`,
        parameters: {
          attachments: input.attachments,
          businessPurpose: input.businessPurpose,
          // Include user context so the executor can create claims for the right user
          userId: authContext.userId,
          userName: authContext.userName,
        },
        summary: `Create expense claim from ${input.attachments.length} receipt(s)${input.businessPurpose ? `: ${input.businessPurpose}` : ''}`,
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
      attachment_count: input.attachments.length,
      message: `Receipt expense claim proposal created. ${proposal.message}`,
    };
  } catch (error) {
    logger.info('create_expense_from_receipt_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
