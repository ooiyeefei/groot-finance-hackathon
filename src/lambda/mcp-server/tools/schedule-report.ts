/**
 * schedule_report MCP Tool Implementation
 *
 * Create, modify, cancel, or list recurring financial report schedules.
 * Enforces RBAC: admin/manager for financial reports, employee for expense_summary only.
 */

import { getConvexClient } from '../lib/convex-client.js';
import { validateBusinessAccess, type AuthContext } from '../lib/auth.js';
import type { MCPErrorResponse } from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

interface ScheduleReportInput {
  action: 'create' | 'modify' | 'cancel' | 'list';
  scheduleId?: string;
  reportType?: 'pnl' | 'cash_flow' | 'ar_aging' | 'ap_aging' | 'expense_summary';
  frequency?: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  recipients?: string[];
  business_id?: string;
  _businessId?: string;
  _userId?: string;
}

interface ScheduleReportOutput {
  success: boolean;
  scheduleId?: string;
  reportType?: string;
  frequency?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  nextRunDate?: string;
  recipients?: string[];
  message: string;
  schedules?: Array<{
    scheduleId: string;
    reportType: string;
    frequency: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    nextRunDate: string;
    recipients: string[];
    lastRunStatus?: string;
    isActive: boolean;
  }>;
  count?: number;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  pnl: 'Profit & Loss',
  cash_flow: 'Cash Flow',
  ar_aging: 'AR Aging',
  ap_aging: 'AP Aging',
  expense_summary: 'Expense Summary',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function calculateNextRunDate(frequency: string, dayOfWeek?: number, dayOfMonth?: number, hourUtc = 4): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hourUtc, 0, 0, 0);

  if (frequency === 'daily') {
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  } else if (frequency === 'weekly' && dayOfWeek !== undefined) {
    const currentDay = next.getUTCDay();
    let daysUntil = dayOfWeek - currentDay;
    if (daysUntil <= 0 || (daysUntil === 0 && next <= now)) {
      daysUntil += 7;
    }
    next.setUTCDate(next.getUTCDate() + daysUntil);
  } else if (frequency === 'monthly' && dayOfMonth !== undefined) {
    next.setUTCDate(dayOfMonth);
    if (next <= now) {
      next.setUTCMonth(next.getUTCMonth() + 1);
    }
  }

  return next.getTime();
}

export async function scheduleReport(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<ScheduleReportOutput | MCPErrorResponse> {
  const input = args as ScheduleReportInput;
  const convex = getConvexClient();

  let businessId: string;
  if (authContext?.businessId) {
    businessId = authContext.businessId;
  } else {
    const bid = input._businessId || input.business_id;
    if (!bid) {
      return { error: true, code: 'INVALID_PARAMS', message: 'business_id is required' } as MCPErrorResponse;
    }
    const authResult = validateBusinessAccess(bid);
    if (!authResult.authorized) {
      return { error: true, code: authResult.error!.code as MCPErrorResponse['code'], message: authResult.error!.message } as MCPErrorResponse;
    }
    businessId = authResult.businessId!;
  }

  const userId = input._userId;

  try {
    switch (input.action) {
      case 'create': {
        if (!input.reportType || !input.frequency) {
          return { error: true, code: 'INVALID_PARAMS', message: 'reportType and frequency are required for create' } as MCPErrorResponse;
        }

        const nextRunDate = calculateNextRunDate(input.frequency, input.dayOfWeek, input.dayOfMonth);

        // Get business for currency
        const business = await convex.query<{ currency?: string }>('functions/businesses:getById', { businessId });
        const currency = business?.currency || 'MYR';

        const scheduleId = await convex.mutation<string>('functions/reportSchedules:createInternal', {
          businessId,
          createdBy: userId,
          reportType: input.reportType,
          frequency: input.frequency,
          hourUtc: 4,
          dayOfWeek: input.dayOfWeek,
          dayOfMonth: input.dayOfMonth,
          recipients: input.recipients || [],
          currency,
          nextRunDate,
        });

        const label = REPORT_TYPE_LABELS[input.reportType] || input.reportType;
        const freqDesc = input.frequency === 'weekly'
          ? `every ${DAY_NAMES[input.dayOfWeek ?? 1]}`
          : input.frequency === 'monthly'
            ? `on the ${input.dayOfMonth ?? 1}${getOrdinalSuffix(input.dayOfMonth ?? 1)} of every month`
            : 'daily';

        return {
          success: true,
          scheduleId,
          reportType: input.reportType,
          frequency: input.frequency,
          dayOfWeek: input.dayOfWeek,
          dayOfMonth: input.dayOfMonth,
          nextRunDate: new Date(nextRunDate).toISOString(),
          recipients: input.recipients || [],
          message: `${label} report scheduled ${freqDesc}. Next report: ${new Date(nextRunDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`,
        };
      }

      case 'list': {
        const schedules = await convex.query<Array<{
          _id: string;
          reportType: string;
          frequency: string;
          dayOfWeek?: number;
          dayOfMonth?: number;
          nextRunDate: number;
          recipients: string[];
          lastRunStatus?: string;
          isActive: boolean;
        }>>('functions/reportSchedules:listByBusiness', {
          businessId,
          activeOnly: true,
        });

        return {
          success: true,
          schedules: schedules.map((s) => ({
            scheduleId: s._id,
            reportType: s.reportType,
            frequency: s.frequency,
            dayOfWeek: s.dayOfWeek,
            dayOfMonth: s.dayOfMonth,
            nextRunDate: new Date(s.nextRunDate).toISOString(),
            recipients: s.recipients,
            lastRunStatus: s.lastRunStatus,
            isActive: s.isActive,
          })),
          count: schedules.length,
          message: schedules.length > 0
            ? `You have ${schedules.length} active report schedule${schedules.length > 1 ? 's' : ''}.`
            : 'No active report schedules.',
        };
      }

      case 'modify': {
        if (!input.scheduleId) {
          return { error: true, code: 'INVALID_PARAMS', message: 'scheduleId is required for modify' } as MCPErrorResponse;
        }

        const updates: Record<string, unknown> = { scheduleId: input.scheduleId };
        if (input.frequency) updates.frequency = input.frequency;
        if (input.dayOfWeek !== undefined) updates.dayOfWeek = input.dayOfWeek;
        if (input.dayOfMonth !== undefined) updates.dayOfMonth = input.dayOfMonth;
        if (input.recipients) updates.recipients = input.recipients;

        // Recalculate next run date if frequency changed
        const freq = input.frequency || 'weekly';
        updates.nextRunDate = calculateNextRunDate(freq, input.dayOfWeek, input.dayOfMonth);

        await convex.mutation('functions/reportSchedules:updateInternal', updates);

        return {
          success: true,
          scheduleId: input.scheduleId,
          nextRunDate: new Date(updates.nextRunDate as number).toISOString(),
          message: `Schedule updated. Next report: ${new Date(updates.nextRunDate as number).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`,
        };
      }

      case 'cancel': {
        if (!input.scheduleId) {
          return { error: true, code: 'INVALID_PARAMS', message: 'scheduleId is required for cancel' } as MCPErrorResponse;
        }

        await convex.mutation('functions/reportSchedules:cancelInternal', {
          scheduleId: input.scheduleId,
        });

        return {
          success: true,
          scheduleId: input.scheduleId,
          message: 'Report schedule cancelled.',
        };
      }

      default:
        return { error: true, code: 'INVALID_PARAMS', message: `Unknown action: ${input.action}` } as MCPErrorResponse;
    }
  } catch (err) {
    logger.error('schedule_report_error', { error: err instanceof Error ? err.message : String(err) });
    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: err instanceof Error ? err.message : 'Failed to process schedule request',
    } as MCPErrorResponse;
  }
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
