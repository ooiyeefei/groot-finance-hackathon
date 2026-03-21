/**
 * send_email_report MCP Tool Implementation (031-chat-cross-biz-voice)
 *
 * Sends formatted financial reports via email. Two-phase confirmation:
 * 1. confirmed=false → returns preview for user approval
 * 2. confirmed=true → validates rate limit, sends email, logs to audit
 *
 * RBAC: finance_admin or owner only.
 * Rate limit: 50 emails per business per day.
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api.js';
import { Id } from '../../../../convex/_generated/dataModel.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  SendEmailReportInput,
  SendEmailReportOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { sendReportEmail, renderReportTemplate } from '../lib/email-sender.js';
import { logger } from '../lib/logger.js';

const DAILY_LIMIT = 50;

const REPORT_TYPE_LABELS: Record<string, string> = {
  ap_aging: 'AP Aging Report',
  ar_aging: 'AR Aging Report',
  cash_flow: 'Cash Flow Report',
  pnl: 'Profit & Loss Statement',
  expense_summary: 'Expense Summary',
};

let convexClient: ConvexHttpClient | null = null;

function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) throw new Error('NEXT_PUBLIC_CONVEX_URL is required');
    convexClient = new ConvexHttpClient(url);
  }
  return convexClient;
}

export async function sendEmailReport(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<SendEmailReportOutput | MCPErrorResponse> {
  const input = args as SendEmailReportInput;

  // RBAC check
  if (!authContext) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Authentication required' };
  }

  // Extract user context from args._userContext (LangGraph adapter) or authContext fields
  const userCtx = (args._userContext as { userId?: string; businessId?: string; role?: string }) || {};
  const userRole = authContext.userRole || userCtx.role || 'employee';
  const userId = authContext.userId || userCtx.userId || 'unknown';
  const userName = authContext.userName || (args._userName as string) || 'Finance Team';

  if (!['finance_admin', 'owner'].includes(userRole)) {
    return {
      error: true,
      code: 'UNAUTHORIZED',
      message: 'Only finance admins and business owners can send financial reports via email.',
    };
  }

  const businessId = authContext.businessId || userCtx.businessId;
  if (!businessId) {
    return { error: true, code: 'INVALID_INPUT', message: 'Business context required' };
  }

  const reportLabel = REPORT_TYPE_LABELS[input.report_type] || input.report_type;

  // Phase 1: Preview (no send)
  if (!input.confirmed) {
    const recipientList = input.recipients.join(', ');
    return {
      preview: true,
      confirmation_message: `Ready to send "${reportLabel}" to ${recipientList}. Please confirm to proceed.`,
      recipients: input.recipients,
      report_type: input.report_type,
    };
  }

  // Phase 2: Confirmed — check rate limit, send, log
  const convex = getConvexClient();

  // Rate limit check
  const todayCount = await convex.query(
    api.functions.emailSendLogs.countTodayByBusiness,
    { businessId: businessId as Id<"businesses"> }
  );

  if (todayCount >= DAILY_LIMIT) {
    return {
      error: true,
      code: 'RATE_LIMITED',
      message: `Daily email limit reached (${DAILY_LIMIT}/day). Please try again tomorrow.`,
    };
  }

  // Validate email addresses
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalidEmails = input.recipients.filter((e) => !emailRegex.test(e));
  if (invalidEmails.length > 0) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: `Invalid email addresses: ${invalidEmails.join(', ')}`,
    };
  }

  // Build report HTML from report_data
  const reportData = input.report_data;
  let reportHtml = '';

  if (Array.isArray(reportData.rows) && Array.isArray(reportData.headers)) {
    // Table format: { headers: string[], rows: unknown[][] }
    const headers = reportData.headers as string[];
    const rows = reportData.rows as unknown[][];
    reportHtml = '<table>';
    reportHtml += '<tr>' + headers.map((h) => `<th>${h}</th>`).join('') + '</tr>';
    for (const row of rows) {
      reportHtml += '<tr>' + row.map((cell) => `<td>${cell ?? ''}</td>`).join('') + '</tr>';
    }
    reportHtml += '</table>';
  } else if (typeof reportData.summary === 'string') {
    reportHtml = `<p>${reportData.summary}</p>`;
  } else {
    // Fallback: render as formatted JSON
    reportHtml = `<pre style="font-size:13px;background:#f8fafc;padding:16px;border-radius:8px;overflow-x:auto;">${JSON.stringify(reportData, null, 2)}</pre>`;
  }

  // Send to each recipient
  const messageIds: string[] = [];
  const recipientsSent: string[] = [];
  const recipientsFailed: string[] = [];

  const subject = input.subject || `${reportLabel} — ${authContext.businessName || 'Your Business'}`;

  // Render the HTML template once (same for all recipients)
  const htmlBody = renderReportTemplate({
    businessName: authContext.businessName || 'Your Business',
    reportTitle: reportLabel,
    reportPeriod: input.period || 'Current Period',
    reportData: reportHtml,
    senderName: userName,
    sentDate: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  });

  for (const recipient of input.recipients) {
    try {
      const result = await sendReportEmail({
        to: recipient,
        subject,
        htmlBody,
      });

      messageIds.push(result.messageId);
      recipientsSent.push(recipient);
    } catch (error) {
      logger.warn('email_send_failed', {
        recipient,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      recipientsFailed.push(recipient);
    }
  }

  // Log to audit trail
  try {
    await convex.mutation(api.functions.emailSendLogs.create, {
      businessId: businessId as Id<"businesses">,
      userId,
      userRole,
      reportType: input.report_type,
      recipients: input.recipients,
      subject,
      status: recipientsFailed.length === 0 ? 'sent' : 'partial',
      sesMessageId: messageIds[0] || undefined,
      sentAt: Date.now(),
    });
  } catch (error) {
    logger.warn('audit_log_failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  const remaining = DAILY_LIMIT - todayCount - recipientsSent.length;

  return {
    success: recipientsSent.length > 0,
    message_ids: messageIds,
    recipients_sent: recipientsSent,
    recipients_failed: recipientsFailed,
    daily_sends_remaining: Math.max(0, remaining),
  };
}
