/**
 * get_late_approvals MCP Tool Implementation
 *
 * Finds expense submissions that have been waiting for approval beyond a threshold.
 * Calculates business days (Mon-Fri) to determine overdue status.
 * Wraps Convex expenseSubmissions:getPendingApprovals.
 *
 * Authorization: manager, finance_admin, owner
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  GetLateApprovalsInput,
  GetLateApprovalsOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

/**
 * Count business days (Mon-Fri) between two dates, excluding both endpoints.
 */
function countBusinessDays(from: Date, to: Date): number {
  let count = 0;
  const current = new Date(from);
  current.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  while (current < end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export async function getLateApprovals(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<GetLateApprovalsOutput | MCPErrorResponse> {
  const input = args as GetLateApprovalsInput;

  const businessId = authContext?.businessId || (input as any).business_id;
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  const thresholdDays = input.threshold_days || 3;

  try {
    const convex = getConvexClient();
    const now = new Date();

    // Query pending submissions
    const submissions = await convex.query<any[]>(
      'functions/expenseSubmissions:getPendingApprovals',
      { businessId }
    );

    if (!submissions || submissions.length === 0) {
      return {
        late_submissions: [],
        summary: {
          total_pending: 0,
          total_late: 0,
          oldest_waiting_days: 0,
          total_overdue_amount: 0,
          currency: 'MYR',
          critical_count: 0,
          threshold_days: thresholdDays,
        },
      };
    }

    // Filter submissions that exceed the threshold
    const lateSubmissions = submissions
      .map((sub: any) => {
        const submittedAt = new Date(sub.submittedAt);
        const waitingDays = countBusinessDays(submittedAt, now);

        const totals = sub.totalsByCurrency || [];
        const totalAmount = totals.reduce((sum: number, t: any) => sum + (t.total || 0), 0);
        const currency = totals.length > 0 ? totals[0].currency : 'MYR';

        return {
          submission_id: sub._id,
          submitter_name: sub.submitterName || 'Unknown',
          title: sub.title || 'Expense Submission',
          submitted_at: submittedAt.toISOString().split('T')[0],
          waiting_days: waitingDays,
          total_amount: totalAmount,
          currency,
          claim_count: sub.claimCount || 0,
          urgency: waitingDays >= thresholdDays * 2 ? 'critical' as const : 'overdue' as const,
        };
      })
      .filter((sub) => sub.waiting_days > thresholdDays)
      .sort((a, b) => b.waiting_days - a.waiting_days);

    const totalOverdueAmount = lateSubmissions.reduce((sum, s) => sum + s.total_amount, 0);
    const criticalCount = lateSubmissions.filter(s => s.urgency === 'critical').length;
    const currency = lateSubmissions.length > 0 ? lateSubmissions[0].currency : 'MYR';

    return {
      late_submissions: lateSubmissions,
      summary: {
        total_pending: submissions.length,
        total_late: lateSubmissions.length,
        oldest_waiting_days: lateSubmissions.length > 0 ? lateSubmissions[0].waiting_days : 0,
        total_overdue_amount: Math.round(totalOverdueAmount * 100) / 100,
        currency,
        critical_count: criticalCount,
        threshold_days: thresholdDays,
      },
    };
  } catch (error) {
    logger.error('get_late_approvals_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
