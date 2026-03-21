/**
 * Schedule Report Tool — Chat agent wrapper for MCP schedule_report endpoint
 *
 * Allows users to create, list, modify, and cancel recurring report schedules
 * via natural-language chat commands.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'

export class ScheduleReportTool extends BaseTool {
  getToolName(modelType?: ModelType): string {
    return 'schedule_report'
  }

  getDescription(modelType?: ModelType): string {
    return `Create, modify, cancel, or list recurring financial report schedules. Reports are emailed on schedule with an HTML summary and PDF attachment.

Supported report types: pnl (Profit & Loss), cash_flow (Cash Flow), ar_aging (AR Aging), ap_aging (AP Aging), expense_summary (Expense Summary).
Frequencies: daily, weekly (specify day_of_week 0-6), monthly (specify day_of_month 1-28).

RBAC: Admin and manager can schedule all report types. Employees can only schedule expense_summary for themselves.

For CREATE: ask for report_type, frequency, and optionally day_of_week/day_of_month and recipients.
For LIST: no parameters needed — returns all active schedules.
For MODIFY: need schedule_id and the fields to change.
For CANCEL: need schedule_id.`
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
              enum: ["create", "modify", "cancel", "list"],
              description: "Action to perform"
            },
            schedule_id: {
              type: "string",
              description: "Schedule ID (required for modify/cancel)"
            },
            report_type: {
              type: "string",
              enum: ["pnl", "cash_flow", "ar_aging", "ap_aging", "expense_summary"],
              description: "Report type (required for create)"
            },
            frequency: {
              type: "string",
              enum: ["daily", "weekly", "monthly"],
              description: "Delivery frequency"
            },
            day_of_week: {
              type: "number",
              description: "Day of week for weekly: 0=Sun, 1=Mon, ..., 6=Sat"
            },
            day_of_month: {
              type: "number",
              description: "Day of month for monthly (1-28)"
            },
            recipients: {
              type: "array",
              items: { type: "string" },
              description: "Email addresses (defaults to requesting user)"
            }
          },
          required: ["action"]
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters, userContext?: UserContext): Promise<{ valid: boolean; error?: string }> {
    if (!parameters.action) {
      return { valid: false, error: 'action is required' }
    }
    if (parameters.action === 'create' && (!parameters.report_type || !parameters.frequency)) {
      return { valid: false, error: 'report_type and frequency are required for create' }
    }

    // RBAC: employees can only schedule expense_summary
    if (parameters.action === 'create' && userContext?.role) {
      const financialReportTypes = ['pnl', 'cash_flow', 'ar_aging', 'ap_aging']
      const isEmployee = !['owner', 'finance_admin', 'manager'].includes(userContext.role)
      if (isEmployee && financialReportTypes.includes(parameters.report_type as string)) {
        return {
          valid: false,
          error: `Only managers and admins can schedule ${parameters.report_type} reports. You can schedule expense_summary reports.`
        }
      }
    }

    return { valid: true }
  }

  protected formatResultData(data: any[]): string {
    return data.map((d: any) => `- ${d.reportType}: ${d.frequency} (next: ${d.nextRunDate})`).join('\n')
  }

  protected async executeInternal(
    parameters: ToolParameters,
    userContext: UserContext,
  ): Promise<ToolResult> {
    return {
      success: true,
      data: { message: 'Tool executed via MCP endpoint' },
    }
  }
}
