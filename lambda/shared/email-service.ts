/**
 * SES Email Service
 *
 * Wrapper for Amazon SES email sending with:
 * - Template rendering
 * - Configuration set tracking
 * - Unsubscribe header injection (RFC 8058)
 *
 * Replaces Resend for unified email delivery.
 */

import {
  SESClient,
  SendRawEmailCommand,
} from '@aws-sdk/client-ses';
import { getTemplate } from './templates';

const ses = new SESClient({
  region: process.env.AWS_REGION || 'us-west-2',
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@notifications.hellogroot.com';
const CONFIGURATION_SET = process.env.SES_CONFIGURATION_SET || 'finanseal-transactional';

export interface SendEmailParams {
  to: string;
  subject: string;
  templateType: string;
  templateData: Record<string, unknown>;
  replyTo?: string;
  unsubscribeToken?: string;
}

export interface SendEmailResult {
  messageId: string;
}

/**
 * Build raw MIME message for SES
 *
 * Uses SendRawEmailCommand to include RFC 8058 List-Unsubscribe headers.
 */
function buildRawEmail(params: {
  from: string;
  to: string;
  subject: string;
  htmlBody: string;
  replyTo?: string;
  unsubscribeUrl?: string;
  oneClickUrl?: string;
}): string {
  const { from, to, subject, htmlBody, replyTo, unsubscribeUrl, oneClickUrl } = params;

  const boundary = `----=_Part_${Date.now().toString(36)}`;
  const lines: string[] = [];

  // Required headers
  lines.push(`From: ${from}`);
  lines.push(`To: ${to}`);
  lines.push(`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`);
  lines.push('MIME-Version: 1.0');

  // Optional headers
  if (replyTo) {
    lines.push(`Reply-To: ${replyTo}`);
  }

  // RFC 8058 List-Unsubscribe headers (enables one-click unsubscribe in Gmail/Yahoo)
  if (unsubscribeUrl && oneClickUrl) {
    lines.push(`List-Unsubscribe: <${unsubscribeUrl}>`);
    lines.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  }

  // Content type
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  lines.push('');

  // Plain text part (fallback)
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: quoted-printable');
  lines.push('');
  lines.push('Please view this email in an HTML-capable email client.');
  lines.push('');

  // HTML part
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(Buffer.from(htmlBody).toString('base64').replace(/(.{76})/g, '$1\r\n'));
  lines.push('');

  // End boundary
  lines.push(`--${boundary}--`);

  return lines.join('\r\n');
}

/**
 * Send an email using Amazon SES with RFC 8058 List-Unsubscribe headers
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { to, subject, templateType, templateData, replyTo, unsubscribeToken } = params;

  // Get rendered HTML template
  const htmlBody = await getTemplate(templateType, templateData);

  // Build unsubscribe URLs if token provided
  let unsubscribeUrl: string | undefined;
  let oneClickUrl: string | undefined;

  if (unsubscribeToken) {
    const baseUrl = process.env.APP_URL || 'https://finance.hellogroot.com/en';
    unsubscribeUrl = `${baseUrl}/api/v1/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
    oneClickUrl = `${baseUrl}/api/v1/unsubscribe/one-click?token=${encodeURIComponent(unsubscribeToken)}`;
  }

  // Build raw MIME message with List-Unsubscribe headers
  const rawMessage = buildRawEmail({
    from: FROM_EMAIL,
    to,
    subject,
    htmlBody,
    replyTo,
    unsubscribeUrl,
    oneClickUrl,
  });

  // Send via SES
  const command = new SendRawEmailCommand({
    RawMessage: {
      Data: Buffer.from(rawMessage),
    },
    ConfigurationSetName: CONFIGURATION_SET,
  });

  const response = await ses.send(command);

  if (!response.MessageId) {
    throw new Error('SES did not return a MessageId');
  }

  console.log('Email sent successfully:', {
    messageId: response.MessageId,
    to,
    templateType,
    hasUnsubscribe: !!unsubscribeToken,
  });

  return {
    messageId: response.MessageId,
  };
}

// NOTE: Email suppressions are handled natively by AWS SES Account-Level Suppression List.
// No need for a custom isEmailSuppressed check - SES will automatically reject sends to
// addresses on the suppression list and return an appropriate error.

/**
 * Check user email preferences before sending non-transactional emails
 *
 * @param userId - Convex user ID
 * @param emailType - Type of email being sent
 * @param convexUrl - Convex deployment URL
 * @returns true if user has opted out of this email type
 */
export async function isEmailTypeDisabled(
  userId: string,
  emailType: 'marketing' | 'onboarding' | 'product_updates',
  convexUrl?: string
): Promise<boolean> {
  const url = convexUrl || process.env.CONVEX_URL;

  if (!url) {
    console.warn('[Email Service] CONVEX_URL not configured, skipping preference check');
    return false;
  }

  try {
    const response = await fetch(`${url}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: 'functions/emails:getEmailPreferences',
        args: { userId },
      }),
    });

    if (!response.ok) {
      console.error('[Email Service] Preference check failed:', response.status);
      return false;
    }

    const result = await response.json();
    const prefs = result.value;

    if (!prefs) {
      return false;
    }

    // Check global unsubscribe first
    if (prefs.globalUnsubscribe) {
      return true;
    }

    // Check specific email type preference
    switch (emailType) {
      case 'marketing':
        return !prefs.marketingEnabled;
      case 'onboarding':
        return !prefs.onboardingTipsEnabled;
      case 'product_updates':
        return !prefs.productUpdatesEnabled;
      default:
        return false;
    }
  } catch (error) {
    console.error('[Email Service] Preference check error:', error);
    return false;
  }
}
