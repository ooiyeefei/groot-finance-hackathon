/**
 * Team Summary Tool
 *
 * Provides aggregate spending summary across a manager's direct reports.
 * Used for queries like: "What is the total team spending this month?"
 *                        "Who spent the most on travel?"
 *
 * Authorization: manager (direct reports only), finance_admin/owner (all employees)
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { resolveDateRange } from '@/lib/ai/utils/date-range-resolver'
import { mapCategoryTerm } from '@/lib/ai/utils/category-mapper'
import { z } from 'zod'

interface TeamSummaryParameters {
  date_range?: string
  start_date?: string
  end_date?: string
  category?: string
  group_by?: 'employee' | 'category' | 'vendor'
}

// Zod output schema for structured response validation
const TeamSummaryResponseSchema = z.object({
  summary: z.object({
    total_amount: z.number(),
    currency: z.string(),
    employee_count: z.number(),
    record_count: z.number(),
    date_range: z.object({
      start: z.string(),
      end: z.string(),
    }),
  }),
  breakdown: z.array(z.object({
    group_key: z.string(),
    total_amount: z.number(),
    record_count: z.number(),
    percentage: z.number(),
  })),
  top_categories: z.array(z.object({
    category: z.string(),
    total_amount: z.number(),
    percentage: z.number(),
  })),
})

export class TeamSummaryTool extends BaseTool {
  getToolName(_modelType: ModelType = 'openai'): string {
    return 'get_team_summary'
  }

  getDescription(_modelType: ModelType = 'openai'): string {
    return "Get aggregate spending summary across your team (all direct reports). Use this tool when a manager asks about total team spending, spending rankings, or comparisons across employees (e.g., 'What is the total team spending this month?', 'Who spent the most on travel?'). Returns per-employee breakdown and top categories."
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
            date_range: {
              type: "string",
              description: "Natural language date expression (e.g., 'this month', 'last quarter', 'January 2026'). Converted to exact dates deterministically."
            },
            start_date: {
              type: "string",
              description: "Explicit start date in YYYY-MM-DD format."
            },
            end_date: {
              type: "string",
              description: "Explicit end date in YYYY-MM-DD format."
            },
            category: {
              type: "string",
              description: "Optional category filter in natural language (e.g., 'travel', 'meals')."
            },
            group_by: {
              type: "string",
              enum: ["employee", "category", "vendor"],
              description: "How to group the summary breakdown. Default: employee."
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as TeamSummaryParameters

    if (params.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(params.start_date)) {
      return { valid: false, error: 'start_date must be in YYYY-MM-DD format' }
    }

    if (params.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(params.end_date)) {
      return { valid: false, error: 'end_date must be in YYYY-MM-DD format' }
    }

    if (params.group_by && !['employee', 'category', 'vendor'].includes(params.group_by)) {
      return { valid: false, error: 'group_by must be one of: employee, category, vendor' }
    }

    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as TeamSummaryParameters

    try {
      if (!userContext.businessId || !userContext.convexUserId) {
        return { success: false, error: 'Missing business context. Please ensure you are logged into a business account.' }
      }

      // Step 1: Resolve date range
      let startDate = params.start_date
      let endDate = params.end_date

      if (params.date_range && !startDate && !endDate) {
        const dateResult = resolveDateRange(params.date_range)
        startDate = dateResult.startDate
        endDate = dateResult.endDate
        console.log(`[TeamSummaryTool] Date range resolved: ${params.date_range} → ${startDate} to ${endDate}`)
      }

      // Step 2: Map category if provided
      let categoryId: string | undefined
      let categoryNote: string | undefined
      if (params.category) {
        const categoryMatch = mapCategoryTerm(params.category)
        if (categoryMatch) {
          categoryId = categoryMatch.categoryId
          categoryNote = `Category "${params.category}" mapped to "${categoryMatch.categoryName}" (${categoryMatch.confidence} match)`
          console.log(`[TeamSummaryTool] ${categoryNote}`)
        } else {
          categoryId = params.category
        }
      }

      // Step 3: Query Convex for team summary
      const result = await this.convex!.query(
        this.convexApi.functions.financialIntelligence.getTeamExpenseSummary,
        {
          businessId: userContext.businessId,
          requestingUserId: userContext.convexUserId,
          filters: {
            startDate,
            endDate,
            category: categoryId,
            groupBy: params.group_by || 'employee',
          },
        }
      )

      if (!result.authorized) {
        if (result.error === 'Employees cannot access team data') {
          return {
            success: true,
            data: "You don't have permission to view team spending data. This tool is available for managers, finance admins, and owners.",
            metadata: { authorized: false }
          }
        }
        return {
          success: true,
          data: result.error || "You don't have any direct reports assigned. Please contact your administrator.",
          metadata: { authorized: false }
        }
      }

      // Step 4: Format structured response
      const response = {
        summary: {
          total_amount: result.summary.totalAmount,
          currency: result.summary.currency,
          employee_count: result.summary.employeeCount,
          record_count: result.summary.recordCount,
          date_range: {
            start: startDate || 'all time',
            end: endDate || 'present',
          },
        },
        breakdown: result.breakdown.map((b: any) => ({
          group_key: b.groupKey,
          total_amount: b.totalAmount,
          record_count: b.recordCount,
          percentage: b.percentage,
        })),
        top_categories: result.topCategories.map((c: any) => ({
          category: c.categoryName,
          total_amount: c.totalAmount,
          percentage: c.percentage,
        })),
      }

      // Validate output against Zod schema
      const parsed = TeamSummaryResponseSchema.safeParse(response)
      if (!parsed.success) {
        console.warn(`[TeamSummaryTool] Output schema validation warning:`, parsed.error.issues)
      }

      // Format for LLM consumption
      const groupByLabel = params.group_by || 'employee'
      let dataText = `Team Spending Summary:\n\n`
      dataText += `Total: ${result.summary.totalAmount.toFixed(2)} ${result.summary.currency}`
      dataText += ` | ${result.summary.employeeCount} employee(s) | ${result.summary.recordCount} transaction(s)`
      if (startDate && endDate) {
        dataText += `\nPeriod: ${startDate} to ${endDate}`
      }
      if (categoryNote) {
        dataText += `\nNote: ${categoryNote}`
      }
      dataText += '\n'

      if (result.breakdown.length > 0) {
        dataText += `\nBreakdown by ${groupByLabel}:\n`
        result.breakdown.forEach((b: any, i: number) => {
          dataText += `${i + 1}. ${b.groupKey}: ${b.totalAmount.toFixed(2)} ${result.summary.currency} (${b.percentage}%) - ${b.recordCount} transaction(s)\n`
        })
      }

      if (result.topCategories.length > 0) {
        dataText += `\nTop Categories:\n`
        result.topCategories.forEach((c: any, i: number) => {
          dataText += `${i + 1}. ${c.categoryName}: ${c.totalAmount.toFixed(2)} ${result.summary.currency} (${c.percentage}%)\n`
        })
      }

      if (result.summary.recordCount === 0) {
        dataText = `No team spending data found for the selected period. Your team has ${result.summary.employeeCount} employee(s) but no transactions match the current filters.`
      }

      // Audit log
      console.log(JSON.stringify({
        event: 'cross_employee_query',
        managerId: userContext.convexUserId,
        targetEmployeeId: 'team_aggregate',
        toolName: 'get_team_summary',
        queryParams: { category: categoryId, startDate, endDate, groupBy: params.group_by },
        resultCount: result.summary.recordCount,
        timestamp: new Date().toISOString(),
      }))

      return {
        success: true,
        data: dataText,
        metadata: {
          structured: response,
          resultsCount: result.summary.recordCount,
        }
      }

    } catch (error) {
      console.error('[TeamSummaryTool] Execution error:', error)
      return {
        success: false,
        error: `Team summary lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  protected formatResultData(data: any[]): string {
    return data.map((item, index) => {
      return `${index + 1}. ${item.group_key}: ${item.total_amount} (${item.percentage}%)`
    }).join('\n')
  }
}
