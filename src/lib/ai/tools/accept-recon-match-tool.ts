/**
 * Accept Recon Match Tool — Chat agent wrapper for MCP accept_recon_match endpoint
 *
 * Accept, reject, or bulk-accept bank reconciliation matches.
 * Accepting creates journal entries.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'

export class AcceptReconMatchTool extends BaseTool {
  getToolName(modelType?: ModelType): string {
    return 'accept_recon_match'
  }

  getDescription(modelType?: ModelType): string {
    return `Accept or reject a bank reconciliation match. Accepting creates a double-entry journal entry.

Supports:
- accept: Accept a single match (requires match_id)
- reject: Reject a single match (requires match_id)
- bulk_accept: Accept all matches above a confidence threshold (requires run_id and min_confidence)

For bulk_accept: ALWAYS confirm the count of matches to be accepted with the user before executing. Example: "This will accept 8 matches above 90% confidence. Proceed?"`
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
            action: {
              type: "string",
              enum: ["accept", "reject", "bulk_accept"],
              description: "Action to perform"
            },
            match_id: {
              type: "string",
              description: "Match ID (required for accept/reject)"
            },
            run_id: {
              type: "string",
              description: "Reconciliation run ID (required for bulk_accept)"
            },
            min_confidence: {
              type: "number",
              description: "Minimum confidence for bulk_accept (0-1, default 0.9)"
            }
          },
          required: ["action"]
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    if (!parameters.action) {
      return { valid: false, error: 'action is required' }
    }
    if ((parameters.action === 'accept' || parameters.action === 'reject') && !parameters.match_id) {
      return { valid: false, error: 'match_id is required for accept/reject' }
    }
    if (parameters.action === 'bulk_accept' && !parameters.run_id) {
      return { valid: false, error: 'run_id is required for bulk_accept' }
    }
    return { valid: true }
  }

  protected formatResultData(data: any[]): string {
    return data.map((d: any) => `- Match ${d.matchId}: ${d.action} (${d.status})`).join('\n')
  }

  protected async executeInternal(
    parameters: ToolParameters,
    userContext: UserContext,
  ): Promise<ToolResult> {
    if (!this.convex) {
      return { success: false, error: 'Missing authenticated Convex client' }
    }

    try {
      if (parameters.action === 'accept' && parameters.match_id) {
        await this.convex.mutation(
          (this.convexApi as any).functions.reconciliationMatches.confirmMatch,
          { matchId: parameters.match_id }
        )
        return { success: true, data: 'Match accepted and transaction reconciled.' }
      }

      if (parameters.action === 'reject' && parameters.match_id) {
        await this.convex.mutation(
          (this.convexApi as any).functions.reconciliationMatches.rejectMatch,
          { matchId: parameters.match_id }
        )
        return { success: true, data: 'Match rejected.' }
      }

      if (parameters.action === 'bulk_accept') {
        return { success: true, data: 'Bulk accept requires the MCP endpoint. Please use the action card buttons to accept individual matches, or try again when the MCP server is deployed.' }
      }

      return { success: false, error: `Unknown action: ${parameters.action}` }
    } catch (error) {
      console.error('[AcceptReconMatchTool] Error:', error)
      return { success: false, error: `Match action failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }
}
