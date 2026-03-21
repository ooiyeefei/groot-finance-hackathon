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

    try {
      if (!userContext.businessId || !userContext.convexUserId) {
        return { success: false, error: 'Missing business context. Please ensure you are logged into a business account.' }
      }

      const thresholdDays = params.threshold_days || 3
      const now = new Date()

      console.log(`[LateApprovalsTool] Checking for submissions overdue by >${thresholdDays} business days`)

      // Query pending submissions
      const submissions = await this.convex!.query(
        this.convexApi.functions.expenseSubmissions.list,
        {
          businessId: userContext.businessId as any,
          status: 'submitted',
        }
      )

      if (!submissions || submissions.length === 0) {
        return {
          success: true,
          data: 'No pending expense submissions found. All submissions have been processed.',
          metadata: { resultsCount: 0, thresholdDays }
        }
      }

      // Filter submissions that exceed the threshold
      const lateSubmissions = submissions
        .map((sub: any) => {
          const submittedAt = new Date(sub.submittedAt || sub._creationTime)
          const waitingDays = countBusinessDays(submittedAt, now)

          return {
            id: sub._id,
            employeeName: sub.employeeName || sub.submittedByName || 'Unknown',
            employeeEmail: sub.employeeEmail || sub.submittedByEmail || '',
            submittedAt: submittedAt.toISOString().split('T')[0],
            waitingDays,
            totalAmount: sub.totalAmount || 0,
            currency: sub.currency || userContext.homeCurrency || 'MYR',
            claimCount: sub.claimCount || sub.items?.length || 0,
            description: sub.description || sub.title || 'Expense Submission',
          }
        })
        .filter((sub: any) => sub.waitingDays > thresholdDays)
        .sort((a: any, b: any) => b.waitingDays - a.waitingDays) // Most overdue first

      if (lateSubmissions.length === 0) {
        const totalPending = submissions.length
        return {
          success: true,
          data: `No late approvals found. There ${totalPending === 1 ? 'is' : 'are'} ${totalPending} pending submission(s), all within the ${thresholdDays}-day threshold.`,
          metadata: {
            resultsCount: 0,
            totalPending,
            thresholdDays,
          }
        }
      }

      // Format text response
      let dataText = `Late Approvals (>${thresholdDays} business days):\n\n`
      dataText += `Found ${lateSubmissions.length} overdue submission(s) out of ${submissions.length} total pending:\n\n`

      lateSubmissions.forEach((sub: any, i: number) => {
        const urgency = sub.waitingDays >= thresholdDays * 2 ? 'CRITICAL' : 'OVERDUE'
        dataText += `${i + 1}. [${urgency}] ${sub.employeeName}\n`
        dataText += `   Submitted: ${sub.submittedAt} (${sub.waitingDays} business days ago)\n`
        dataText += `   Amount: ${sub.totalAmount.toFixed(2)} ${sub.currency}`
        if (sub.claimCount > 0) {
          dataText += ` | ${sub.claimCount} claim(s)`
        }
        dataText += '\n'
        dataText += `   Description: ${sub.description}\n\n`
      })

      // Summary stats
      const totalOverdueAmount = lateSubmissions.reduce((sum: number, s: any) => sum + s.totalAmount, 0)
      const maxWaiting = lateSubmissions[0].waitingDays
      const criticalCount = lateSubmissions.filter((s: any) => s.waitingDays >= thresholdDays * 2).length

      dataText += `Summary: ${totalOverdueAmount.toFixed(2)} ${lateSubmissions[0].currency} in overdue approvals`
      dataText += ` | Longest wait: ${maxWaiting} business days`
      if (criticalCount > 0) {
        dataText += ` | ${criticalCount} critical (>${thresholdDays * 2} days)`
      }

      // Audit log
      console.log(JSON.stringify({
        event: 'late_approvals_check',
        userId: userContext.convexUserId,
        toolName: 'get_late_approvals',
        thresholdDays,
        totalPending: submissions.length,
        lateCount: lateSubmissions.length,
        timestamp: new Date().toISOString(),
      }))

      return {
        success: true,
        data: dataText,
        metadata: {
          structured: {
            thresholdDays,
            totalPending: submissions.length,
            lateSubmissions,
            totalOverdueAmount,
            currency: lateSubmissions[0].currency,
            maxWaitingDays: maxWaiting,
            criticalCount,
          },
          resultsCount: lateSubmissions.length,
        }
      }

    } catch (error) {
      console.error('[LateApprovalsTool] Execution error:', error)
      return {
        success: false,
        error: `Late approvals check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  protected formatResultData(data: any[]): string {
    return data.map((item, index) => {
      return `${index + 1}. ${item.employeeName} — ${item.waitingDays} days waiting — ${item.totalAmount.toFixed(2)} ${item.currency}`
    }).join('\n')
  }
}
