/**
 * Budget Status Tool
 *
 * Checks budget utilization status across expense categories.
 * Shows spending vs budget limits with visual status indicators.
 * Used for queries like: "What is our budget status?" or "How is Travel spending?"
 *
 * Authorization: manager, finance_admin, owner
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'

interface BudgetStatusParameters {
  category?: string
  period?: string
}

export class BudgetStatusTool extends BaseTool {
  getToolName(_modelType: ModelType = 'openai'): string {
    return 'check_budget_status'
  }

  getDescription(_modelType: ModelType = 'openai'): string {
    return "Check budget utilization status across expense categories. Shows spending vs budget limits with visual status indicators. Use when a manager asks 'What is our budget status?' or 'How is Travel spending?'"
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
            category: {
              type: "string",
              description: "Optional: filter to a specific expense category name (e.g., 'Travel', 'Meals'). Case-insensitive. If omitted, returns all budgeted categories."
            },
            period: {
              type: "string",
              description: "Budget period in YYYY-MM format (e.g., '2026-03'). Defaults to the current month if not specified."
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as BudgetStatusParameters

    if (params.period && !/^\d{4}-\d{2}$/.test(params.period)) {
      return { valid: false, error: 'period must be in YYYY-MM format (e.g., 2026-03)' }
    }

    return { valid: true }
  }

  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    const allowedRoles = ['manager', 'finance_admin', 'owner']
    if (!userContext.role || !allowedRoles.includes(userContext.role)) {
      console.warn(`[BudgetStatusTool] Insufficient role: ${userContext.role}`)
      return false
    }
    return super.checkUserPermissions(userContext)
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as BudgetStatusParameters

    try {
      if (!userContext.businessId || !userContext.convexUserId) {
        return { success: false, error: 'Missing business context. Please ensure you are logged into a business account.' }
      }

      // Default period to current month
      const period = params.period || new Date().toISOString().slice(0, 7)

      console.log(`[BudgetStatusTool] Checking budget status for period: ${period}, category: ${params.category || 'all'}`)

      // Query Convex for budget status
      const result = await this.convex!.action(
        this.convexApi.functions.budgetTracking.getBudgetStatus,
        {
          businessId: userContext.businessId as any,
          category: params.category,
          period,
        }
      )

      if (!result || !result.categories || result.categories.length === 0) {
        let noDataMessage = 'No budgeted expense categories found.'
        if (params.category) {
          noDataMessage = `No budget found for category "${params.category}".`
        }
        noDataMessage += ' You can set budgets using the set_budget command (e.g., "Set Travel budget to RM 5000").'

        return {
          success: true,
          data: noDataMessage,
          metadata: { resultsCount: 0, period }
        }
      }

      // Format text response with category-by-category breakdown
      let dataText = `Budget Status for ${period}:\n\n`

      let totalBudget = 0
      let totalSpent = 0

      const categoryBreakdown = result.categories.map((cat: any) => {
        totalBudget += cat.budgetLimit
        totalSpent += cat.currentSpend

        return {
          categoryId: cat.categoryId,
          categoryName: cat.categoryName,
          budgetLimit: cat.budgetLimit,
          currentSpend: cat.currentSpend,
          remaining: cat.remaining,
          percentUsed: cat.percentUsed,
          status: cat.status, // 'on_track' | 'warning' | 'overspent'
        }
      })

      // Overall summary
      const overallUtilization = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0
      dataText += `Overall: ${totalSpent.toFixed(2)} / ${totalBudget.toFixed(2)} ${result.currency} (${overallUtilization}% utilized)\n\n`

      // Per-category breakdown
      categoryBreakdown.forEach((cat: any, i: number) => {
        const bar = this.renderUtilizationBar(cat.percentUsed)
        const statusLabel = cat.status === 'overspent' ? 'OVER BUDGET' : cat.status === 'warning' ? 'WARNING' : 'ON TRACK'
        dataText += `${i + 1}. ${cat.categoryName} [${statusLabel}]\n`
        dataText += `   ${bar} ${cat.percentUsed}%\n`
        dataText += `   Spent: ${cat.currentSpend.toFixed(2)} / ${cat.budgetLimit.toFixed(2)} ${result.currency}`
        dataText += ` | Remaining: ${cat.remaining.toFixed(2)} ${result.currency}`
        dataText += '\n\n'
      })

      // Highlight over-budget categories
      const overBudget = categoryBreakdown.filter((c: any) => c.percentUsed >= 100)
      const warnings = categoryBreakdown.filter((c: any) => c.percentUsed >= 80 && c.percentUsed < 100)

      if (overBudget.length > 0) {
        dataText += `Attention: ${overBudget.length} category/categories over budget: ${overBudget.map((c: any) => c.categoryName).join(', ')}\n`
      }
      if (warnings.length > 0) {
        dataText += `Warning: ${warnings.length} category/categories nearing budget (>80%): ${warnings.map((c: any) => c.categoryName).join(', ')}\n`
      }

      // Audit log
      console.log(JSON.stringify({
        event: 'budget_status_check',
        userId: userContext.convexUserId,
        toolName: 'check_budget_status',
        period,
        categoryFilter: params.category || 'all',
        categoriesReturned: categoryBreakdown.length,
        overBudgetCount: overBudget.length,
        timestamp: new Date().toISOString(),
      }))

      return {
        success: true,
        data: dataText,
        metadata: {
          structured: {
            period,
            currency: result.currency,
            totalBudget,
            totalSpend: totalSpent,
            overallStatus: result.overallStatus,
            categories: categoryBreakdown,
          },
          resultsCount: categoryBreakdown.length,
        }
      }

    } catch (error) {
      console.error('[BudgetStatusTool] Execution error:', error)
      return {
        success: false,
        error: `Budget status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  /**
   * Render a simple text-based utilization bar
   */
  private renderUtilizationBar(utilization: number): string {
    const totalBlocks = 10
    const filledBlocks = Math.min(totalBlocks, Math.round((utilization / 100) * totalBlocks))
    const emptyBlocks = totalBlocks - filledBlocks
    return '[' + '='.repeat(filledBlocks) + '-'.repeat(emptyBlocks) + ']'
  }

  protected formatResultData(data: any[]): string {
    return data.map((item, index) => {
      return `${index + 1}. ${item.categoryName}: ${item.spent.toFixed(2)} / ${item.budgetLimit.toFixed(2)} (${item.utilization}%) [${item.status}]`
    }).join('\n')
  }
}
