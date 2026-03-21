/**
 * Lightweight SES email sender for MCP server Lambda (031-chat-cross-biz-voice)
 *
 * Duplicates core logic from lambda/shared/email-service.ts because the MCP
 * server is bundled separately by esbuild and can't import from lambda/shared/.
 *
 * Uses @aws-sdk/client-ses from the Lambda runtime (marked as external in CDK).
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({
  region: process.env.AWS_REGION || 'us-west-2',
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@notifications.hellogroot.com';
const CONFIGURATION_SET = process.env.SES_CONFIGURATION_SET || 'finanseal-transactional';

export interface SendReportEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
}

export interface SendReportEmailResult {
  messageId: string;
}

/**
 * Send an HTML email via SES.
 * Simplified version without List-Unsubscribe headers (reports are transactional, not marketing).
 */
export async function sendReportEmail(params: SendReportEmailParams): Promise<SendReportEmailResult> {
  const { to, subject, htmlBody } = params;

  const command = new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: htmlBody, Charset: 'UTF-8' },
      },
    },
    ConfigurationSetName: CONFIGURATION_SET,
  });

  const result = await ses.send(command);

  return {
    messageId: result.MessageId || 'unknown',
  };
}

// Financial report HTML template (inlined to avoid cross-boundary imports)
const FINANCIAL_REPORT_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{reportTitle}} — {{businessName}}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; background-color: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 700px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); }
    .logo { text-align: center; margin-bottom: 24px; }
    .logo-text { font-size: 20px; font-weight: 700; color: #0066cc; }
    h1 { font-size: 24px; font-weight: 600; margin: 0 0 8px; color: #1a1a1a; }
    .meta { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
    th { background: #f8fafc; text-align: left; padding: 10px 12px; border-bottom: 2px solid #e2e8f0; font-weight: 600; color: #374151; }
    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #4a4a4a; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo"><span class="logo-text">Groot Finance</span></div>
      <h1>{{reportTitle}}</h1>
      <div class="meta">
        <strong>Business:</strong> {{businessName}}<br>
        <strong>Period:</strong> {{reportPeriod}}<br>
        <strong>Sent by:</strong> {{senderName}} on {{sentDate}}
      </div>
      {{reportData}}
      <div class="footer">
        <p>This report was generated and sent via Groot Finance AI assistant.</p>
        <p>&copy; 2026 Groot Finance. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

/**
 * Render the financial report template with data.
 */
export function renderReportTemplate(data: Record<string, string>): string {
  let html = FINANCIAL_REPORT_TEMPLATE;
  for (const [key, value] of Object.entries(data)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  }
  // Remove unreplaced placeholders
  html = html.replace(/\{\{[^}]+\}\}/g, '');
  return html;
}
