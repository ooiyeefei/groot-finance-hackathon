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
import { callMCPToolFromAgent } from './mcp-tool-wrapper'
import { z } from 'zod'

interface TeamSummaryParameters {
  date_range?: string
  start_date?: string
  end_date?: string
  category?: string
  vendor?: string
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
            vendor: {
              type: "string",
              description: "Optional vendor/merchant name filter (e.g., 'Starbucks', 'Grab'). Case-insensitive partial match."
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

    // Resolve date range before delegating to MCP
    let startDate = params.start_date
    let endDate = params.end_date
    if (params.date_range && !startDate && !endDate) {
      const dateResult = resolveDateRange(params.date_range)
      startDate = dateResult.startDate
      endDate = dateResult.endDate
    }

    // Map category if provided
    let categoryId: string | undefined
    if (params.category) {
      const categoryMatch = mapCategoryTerm(params.category)
      categoryId = categoryMatch ? categoryMatch.categoryId : params.category
    }

    return callMCPToolFromAgent('get_team_summary', {
      start_date: startDate,
      end_date: endDate,
      category: categoryId,
      vendor: params.vendor,
      group_by: params.group_by,
    }, userContext)
  }

  protected formatResultData(data: any[]): string {
    return data.map((item, index) => {
      return `${index + 1}. ${item.group_key}: ${item.total_amount} (${item.percentage}%)`
    }).join('\n')
  }
}
