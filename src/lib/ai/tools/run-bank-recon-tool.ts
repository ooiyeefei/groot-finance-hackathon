/**
 * Run Bank Reconciliation Tool — Chat agent wrapper for MCP run_bank_reconciliation endpoint
 *
 * Triggers Tier 1 + Tier 2 bank reconciliation for a specific bank account.
 * IMPORTANT: Always ask which bank account before calling this tool.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'

export class RunBankReconTool extends BaseTool {
  getToolName(modelType?: ModelType): string {
    return 'run_bank_reconciliation'
  }

  getDescription(modelType?: ModelType): string {
    return `Trigger bank reconciliation for a specific bank account. Uses rule-based matching (Tier 1) and AI matching (Tier 2) to process unmatched transactions.

IMPORTANT: Always ask the user which bank account to reconcile BEFORE calling this tool, even if the business has only one account. List available accounts first.

Returns a summary of matched/pending/unmatched counts and detailed match cards for transactions needing review. Users can then accept or reject matches using accept_recon_match.`
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
              description: "The bank account ID to reconcile"
            }
          },
          required: ["bank_account_id"]
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    if (!parameters.bank_account_id) {
      return { valid: false, error: 'bank_account_id is required. Ask the user which bank account to reconcile.' }
    }
    return { valid: true }
  }

  protected formatResultData(data: any[]): string {
    return data.map((d: any) => `- ${d.description}: ${d.amount} (${d.status})`).join('\n')
  }

  protected async executeInternal(
    parameters: ToolParameters,
    userContext: UserContext,
  ): Promise<ToolResult> {
    if (!this.convex || !userContext.businessId) {
      return { success: false, error: 'Missing authenticated Convex client or business context' }
    }

    try {
      // List bank accounts so the agent can ask which one
      if (!parameters.bank_account_id) {
        const accounts = await this.convex.query(
          (this.convexApi as any).functions.bankAccounts.list,
          { businessId: userContext.businessId }
        )
        const active = (accounts || []).filter((a: any) => a.status === 'active')
        if (active.length === 0) {
          return { success: true, data: 'No bank accounts found. Please import a bank statement first.' }
        }
        const list = active.map((a: any) => `• ${a.accountName || a.bankName} (ID: ${a._id})`).join('\n')
        return { success: true, data: `Please select which bank account to reconcile:\n\n${list}` }
      }

      // Trigger reconciliation matching
      const result = await this.convex.action(
        (this.convexApi as any).functions.reconciliationMatches.runMatching,
        { businessId: userContext.businessId, bankAccountId: parameters.bank_account_id }
      )

      return {
        success: true,
        data: `Reconciliation complete: ${result.matched} transactions matched, ${result.unmatched} unmatched.`,
        metadata: result
      }
    } catch (error) {
      console.error('[RunBankReconTool] Error:', error)
      return { success: false, error: `Bank reconciliation failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }
}
