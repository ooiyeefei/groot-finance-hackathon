/**
 * Late Approvals Tool
 *
 * Finds expense submissions that have been waiting for approval beyond a threshold.
 * Calculates business days (Mon-Fri) to determine overdue status.
 * Used for queries like: "Any late approvals?" or "What's overdue?"
 *
 * Authorization: manager, finance_admin, owner
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { callMCPToolFromAgent } from './mcp-tool-wrapper'

interface LateApprovalsParameters {
  threshold_days?: number
}

/**
 * Count business days (Mon-Fri) between two dates, excluding both endpoints.
 */
function countBusinessDays(from: Date, to: Date): number {
  let count = 0
  const current = new Date(from)
  current.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)

  while (current < end) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) count++
    current.setDate(current.getDate() + 1)
  }
  return count
}

export class LateApprovalsTool extends BaseTool {
  getToolName(_modelType: ModelType = 'openai'): string {
    return 'get_late_approvals'
  }

  getDescription(_modelType: ModelType = 'openai'): string {
    return "Find expense submissions that have been waiting for approval beyond the threshold. Use when a manager asks 'Any late approvals?' or 'What's overdue?'"
  }

  getToolSchema(_modelType: ModelType = 'openai'): OpenAIToolSchema {
    return {
      type: "function",
      function: {
        name: this.getToolName(_modelType),
        description: this.getDescription(_modelType),
        parameters: {
          type: "object",
          properties: {
            threshold_days: {
              type: "number",
              description: "Number of business days (Mon-Fri) after which a submission is considered late. Default: 3 business days."
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as LateApprovalsParameters

    if (params.threshold_days !== undefined) {
      const threshold = Number(params.threshold_days)
      if (!Number.isInteger(threshold) || threshold < 1 || threshold > 30) {
        return { valid: false, error: 'threshold_days must be an integer between 1 and 30' }
      }
    }

    return { valid: true }
  }

  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    const allowedRoles = ['manager', 'finance_admin', 'owner']
    if (!userContext.role || !allowedRoles.includes(userContext.role)) {
      console.warn(`[LateApprovalsTool] Insufficient role: ${userContext.role}`)
      return false
    }
    return super.checkUserPermissions(userContext)
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as LateApprovalsParameters

    return callMCPToolFromAgent('get_late_approvals', {
      threshold_days: params.threshold_days,
    }, userContext)
  }

  protected formatResultData(data: any[]): string {
    return data.map((item, index) => {
      return `${index + 1}. ${item.employeeName} — ${item.waitingDays} days waiting — ${item.totalAmount.toFixed(2)} ${item.currency}`
    }).join('\n')
  }
}
