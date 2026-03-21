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
    if (!this.convex || !userContext.businessId) {
      return { success: false, error: 'Missing authenticated Convex client or business context' }
    }

    try {
      // Get bank accounts for the business
      const accounts = await this.convex.query(
        (this.convexApi as any).functions.bankAccounts.list,
        { businessId: userContext.businessId }
      )

      if (!accounts || accounts.length === 0) {
        return { success: true, data: 'No bank accounts found. Import a bank statement first to set up bank reconciliation.' }
      }

      const lines: string[] = []
      for (const account of accounts.filter((a: any) => a.status === 'active')) {
        const summary = await this.convex.query(
          (this.convexApi as any).functions.bankTransactions.getReconciliationSummary,
          { bankAccountId: account._id }
        )

        if (summary) {
          lines.push(
            `**${account.accountName || account.bankName}**: ${summary.totalTransactions} transactions — ${summary.reconciled || 0} reconciled, ${summary.suggested || 0} pending review, ${summary.unmatched || 0} unmatched`
          )
        }
      }

      return {
        success: true,
        data: lines.length > 0
          ? `Bank Reconciliation Status:\n\n${lines.join('\n')}`
          : 'No bank transactions found for reconciliation.'
      }
    } catch (error) {
      console.error('[ShowReconStatusTool] Error:', error)
      return { success: false, error: `Failed to get reconciliation status: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }
}
