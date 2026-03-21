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

interface TeamComparisonParameters {
  period?: string
  group_by?: 'employee' | 'category'
}

interface EmployeeSpending {
  name: string
  totalAmount: number
  transactionCount: number
  percentage: number
  isOutlier: boolean
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

    try {
      if (!userContext.businessId || !userContext.convexUserId) {
        return { success: false, error: 'Missing business context. Please ensure you are logged into a business account.' }
      }

      // Step 1: Resolve date range
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
        console.log(`[TeamComparisonTool] Date range resolved: ${params.period} -> ${startDate} to ${endDate}`)
      } else {
        // Default to current month
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        startDate = `${year}-${month}-01`
        const lastDay = new Date(year, now.getMonth() + 1, 0).getDate()
        endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`
      }

      const groupBy = params.group_by || 'employee'

      console.log(`[TeamComparisonTool] Querying team summary grouped by: ${groupBy}`)

      // Step 2: Query team expense summary
      const result = await this.convex!.query(
        this.convexApi.functions.financialIntelligence.getTeamExpenseSummary,
        {
          businessId: userContext.businessId as any,
          requestingUserId: userContext.convexUserId as any,
          filters: {
            startDate,
            endDate,
            groupBy: 'employee',
          },
        }
      )

      if (!result.authorized) {
        if (result.error === 'Employees cannot access team data') {
          return {
            success: true,
            data: "Per your organization's access policy, team spending comparison is only available to Managers, Finance Admins, and Business Owners.",
            metadata: { authorized: false }
          }
        }
        return {
          success: true,
          data: result.error || "You don't have any direct reports assigned.",
          metadata: { authorized: false }
        }
      }

      if (!result.breakdown || result.breakdown.length === 0) {
        return {
          success: true,
          data: `No spending data found for the period ${startDate} to ${endDate}. Your team has ${result.summary.employeeCount} employee(s) but no transactions in this period.`,
          metadata: { resultsCount: 0, period: { startDate, endDate } }
        }
      }

      // Step 3: Calculate team average and detect outliers
      const totalAmount = result.summary.totalAmount
      const employeeCount = result.breakdown.length
      const teamAverage = employeeCount > 0 ? totalAmount / employeeCount : 0
      const outlierThreshold = teamAverage * 1.5
      const currency = result.summary.currency

      const employees: EmployeeSpending[] = result.breakdown
        .map((b: any) => ({
          name: b.groupKey,
          totalAmount: b.totalAmount,
          transactionCount: b.recordCount,
          percentage: b.percentage,
          isOutlier: b.totalAmount > outlierThreshold,
        }))
        .sort((a: EmployeeSpending, b: EmployeeSpending) => b.totalAmount - a.totalAmount)

      const outliers = employees.filter(e => e.isOutlier)

      // Step 4: Format text response
      let dataText = `Team Spending Comparison (${startDate} to ${endDate}):\n\n`
      dataText += `Total: ${totalAmount.toFixed(2)} ${currency} across ${employeeCount} employee(s)\n`
      dataText += `Team Average: ${teamAverage.toFixed(2)} ${currency}/person\n`
      dataText += `Outlier threshold (>1.5x average): ${outlierThreshold.toFixed(2)} ${currency}\n\n`

      dataText += `Ranking:\n`
      employees.forEach((emp, i) => {
        const outlierFlag = emp.isOutlier ? ' ** ABOVE AVERAGE **' : ''
        const bar = this.renderBar(emp.percentage)
        dataText += `${i + 1}. ${emp.name}${outlierFlag}\n`
        dataText += `   ${bar} ${emp.totalAmount.toFixed(2)} ${currency} (${emp.percentage}%)`
        dataText += ` — ${emp.transactionCount} transaction(s)\n`
      })

      if (outliers.length > 0) {
        dataText += `\nOutliers (spending >1.5x team average):\n`
        outliers.forEach(o => {
          const ratio = teamAverage > 0 ? (o.totalAmount / teamAverage).toFixed(1) : 'N/A'
          dataText += `  - ${o.name}: ${o.totalAmount.toFixed(2)} ${currency} (${ratio}x average)\n`
        })
      } else {
        dataText += `\nNo spending outliers detected — all employees are within 1.5x of the team average.\n`
      }

      // Include top categories if available
      if (result.topCategories && result.topCategories.length > 0) {
        dataText += `\nTop Categories:\n`
        result.topCategories.forEach((c: any, i: number) => {
          dataText += `${i + 1}. ${c.categoryName}: ${c.totalAmount.toFixed(2)} ${currency} (${c.percentage}%)\n`
        })
      }

      // Audit log
      console.log(JSON.stringify({
        event: 'team_comparison',
        userId: userContext.convexUserId,
        toolName: 'compare_team_spending',
        period: { startDate, endDate },
        groupBy,
        employeeCount,
        outlierCount: outliers.length,
        timestamp: new Date().toISOString(),
      }))

      return {
        success: true,
        data: dataText,
        metadata: {
          structured: {
            period: { startDate, endDate },
            currency,
            totalAmount,
            teamAverage,
            outlierThreshold,
            employeeCount,
            employees,
            outliers: outliers.map(o => ({
              name: o.name,
              totalAmount: o.totalAmount,
              ratio: teamAverage > 0 ? parseFloat((o.totalAmount / teamAverage).toFixed(1)) : 0,
            })),
            topCategories: result.topCategories || [],
          },
          resultsCount: employeeCount,
        }
      }

    } catch (error) {
      console.error('[TeamComparisonTool] Execution error:', error)
      return {
        success: false,
        error: `Team comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
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
