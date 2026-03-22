/**
 * Team Comparison Tool
 *
 * Compares spending across team members with outlier detection.
 * Shows per-employee spending breakdown with employees spending significantly
 * above average highlighted.
 * Used for queries like: "Compare team spending" or "Who is spending the most?"
 *
 * Authorization: manager, finance_admin, owner
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { resolveDateRange } from '@/lib/ai/utils/date-range-resolver'
import { callMCPToolFromAgent } from './mcp-tool-wrapper'

interface TeamComparisonParameters {
  period?: string
  group_by?: 'employee' | 'category'
}

interface EmployeeSpending {
  employeeId: string
  employeeName: string
  totalSpend: number
  claimCount: number
  percentage: number
  isOutlier: boolean
  topCategories: Array<{ name: string; amount: number }>
}

export class TeamComparisonTool extends BaseTool {
  getToolName(_modelType: ModelType = 'openai'): string {
    return 'compare_team_spending'
  }

  getDescription(_modelType: ModelType = 'openai'): string {
    return "Compare spending across team members with outlier detection. Shows per-employee spending breakdown with employees spending significantly above average highlighted. Use when a manager asks 'Compare team spending' or 'Who is spending the most?'"
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
            period: {
              type: "string",
              description: "Natural language or YYYY-MM date expression (e.g., 'this month', 'last quarter', '2026-03'). Defaults to current month if not specified."
            },
            group_by: {
              type: "string",
              enum: ["employee", "category"],
              description: "How to group the comparison. 'employee' compares spending per person (default), 'category' compares category spending across the team."
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as TeamComparisonParameters

    if (params.group_by && !['employee', 'category'].includes(params.group_by)) {
      return { valid: false, error: 'group_by must be one of: employee, category' }
    }

    return { valid: true }
  }

  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    const allowedRoles = ['manager', 'finance_admin', 'owner']
    if (!userContext.role || !allowedRoles.includes(userContext.role)) {
      console.warn(`[TeamComparisonTool] Insufficient role: ${userContext.role}`)
      return false
    }
    return super.checkUserPermissions(userContext)
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as TeamComparisonParameters

    // Resolve date range before delegating to MCP
    let startDate: string | undefined
    let endDate: string | undefined

    if (params.period) {
      // Handle YYYY-MM format directly
      if (/^\d{4}-\d{2}$/.test(params.period)) {
        const [year, month] = params.period.split('-').map(Number)
        startDate = `${params.period}-01`
        const lastDay = new Date(year, month, 0).getDate()
        endDate = `${params.period}-${String(lastDay).padStart(2, '0')}`
      } else {
        const dateResult = resolveDateRange(params.period)
        startDate = dateResult.startDate
        endDate = dateResult.endDate
      }
    }

    return callMCPToolFromAgent('compare_team_spending', {
      start_date: startDate,
      end_date: endDate,
      group_by: params.group_by,
    }, userContext)
  }

  /**
   * Render a simple proportional bar for ranking display
   */
  private renderBar(percentage: number): string {
    const totalBlocks = 15
    const filledBlocks = Math.min(totalBlocks, Math.round((percentage / 100) * totalBlocks))
    return '|' + '='.repeat(filledBlocks) + ' '.repeat(totalBlocks - filledBlocks) + '|'
  }

  protected formatResultData(data: any[]): string {
    return data.map((item, index) => {
      const outlierTag = item.isOutlier ? ' [OUTLIER]' : ''
      return `${index + 1}. ${item.name}: ${item.totalAmount.toFixed(2)} (${item.percentage}%)${outlierTag}`
    }).join('\n')
  }
}
