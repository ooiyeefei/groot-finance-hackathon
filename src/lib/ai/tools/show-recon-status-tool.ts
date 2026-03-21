/**
 * Show Recon Status Tool — Chat agent wrapper for MCP show_recon_status endpoint
 *
 * Returns reconciliation status: matched/pending/unmatched counts per bank account.
 * Supports querying specific transactions.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'

export class ShowReconStatusTool extends BaseTool {
  getToolName(modelType?: ModelType): string {
    return 'show_recon_status'
  }

  getDescription(modelType?: ModelType): string {
    return `Show current bank reconciliation status: matched, pending review, and unmatched transaction counts per bank account.

Can also:
- List up to 10 unmatched transactions with details
- Search for a specific transaction by description (e.g., "the $500 payment from Acme")
- Filter by a specific bank account

Use when users ask about reconciliation status, unmatched transactions, or specific transaction status.`
  }

  getToolSchema(modelType?: ModelType): OpenAIToolSchema {
    return {
      type: "function",
      function: {
        name: this.getToolName(modelType),
        description: this.getDescription(modelType),
        parameters: {
          type: "object",
          properties: {
            bank_account_id: {
              type: "string",
              description: "Bank account ID to check (omit for all accounts)"
            },
            query: {
              type: "string",
              description: "Natural language query about a specific transaction"
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    return { valid: true }
  }

  protected formatResultData(data: any[]): string {
    return data.map((d: any) => `- ${d.bankAccountName}: ${d.matched} matched, ${d.unmatched} unmatched`).join('\n')
  }

  protected async executeInternal(
    parameters: ToolParameters,
    userContext: UserContext,
  ): Promise<ToolResult> {
    return {
      success: true,
      data: { message: 'Tool executed via MCP endpoint' },
    }
  }
}
