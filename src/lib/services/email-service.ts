/**
 * Email Service using AWS SES
 * Handles business invitation emails and other transactional emails
 *
 * Migrated from Resend to SES for unified email delivery.
 *
 * Authentication:
 * - Vercel Deployment: Uses Vercel OIDC to assume IAM role (AWS_ROLE_ARN required)
 * - Local Development: Uses AWS default credential chain (env vars or ~/.aws/credentials)
 */

import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'
import { fromWebToken } from '@aws-sdk/credential-providers'
import type { AwsCredentialIdentityProvider } from '@smithy/types'

// Configuration from environment
const AWS_REGION = process.env.AWS_REGION || 'us-west-2'
const AWS_ROLE_ARN = process.env.AWS_ROLE_ARN // Set in Vercel for OIDC

interface InvitationEmailData {
  email: string
  businessName: string
  inviterName: string
  role: string
  invitationToken: string
  invitationUrl: string
}

interface FeedbackNotificationData {
  recipientEmail: string
  feedbackType: 'bug' | 'feature' | 'general'
  feedbackMessage: string
  submitterEmail?: string
  pageUrl?: string
  githubIssueUrl?: string
  isAnonymous: boolean
}

interface EmailServiceConfig {
  fromEmail: string
  appUrl: string
  configurationSet: string
}

// ============================================
// CREDENTIAL PROVIDER (Vercel OIDC)
// ============================================

/**
 * Create Vercel OIDC credential provider
 *
 * Fetches fresh OIDC token from Vercel for each credential request.
 * This handles token refresh automatically since tokens expire.
 */
function createVercelOidcCredentialProvider(
  roleArn: string
): AwsCredentialIdentityProvider {
  return async () => {
    // Dynamic import to avoid bundling issues when not on Vercel
    const { getVercelOidcToken } = await import('@vercel/oidc')

    // Get fresh token for each credential request
    const token = await getVercelOidcToken()

    // Use fromWebToken to assume the IAM role with the OIDC token
    const provider = fromWebToken({
      roleArn,
      webIdentityToken: token,
      roleSessionName: `finanseal-ses-${Date.now()}`,
      durationSeconds: 3600, // 1 hour session
    })

    return provider()
  }
}

// ============================================
// EMAIL SERVICE CLASS
// ============================================

class EmailService {
  private ses?: SESClient
  private config?: EmailServiceConfig

  private initialize() {
    if (this.ses && this.config) {
      return
    }

    this.config = {
      fromEmail: process.env.SES_FROM_EMAIL || 'noreply@notifications.hellogroot.com',
      appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://finance.hellogroot.com',
      configurationSet: process.env.SES_CONFIGURATION_SET || 'finanseal-transactional'
    }

    const clientConfig: ConstructorParameters<typeof SESClient>[0] = {
      region: AWS_REGION,
    }

    // Use Vercel OIDC if AWS_ROLE_ARN is configured
    if (AWS_ROLE_ARN) {
      console.log('[EmailService] Using Vercel OIDC federation')
      clientConfig.credentials = createVercelOidcCredentialProvider(AWS_ROLE_ARN)
    } else {
      console.log('[EmailService] Using default credential provider chain')
      // No credentials specified = uses default credential provider chain
      // This includes AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY env vars
    }

    this.ses = new SESClient(clientConfig)
    console.log(`[EmailService] Initialized for region: ${AWS_REGION}`)
  }

  /**
   * Build raw MIME message for SES
   */
  private buildRawEmail(params: {
    from: string
    to: string
    subject: string
    htmlBody: string
    textBody: string
  }): string {
    const { from, to, subject, htmlBody, textBody } = params

    const boundary = `----=_Part_${Date.now().toString(36)}`
    const lines: string[] = []

    // Required headers
    lines.push(`From: FinanSEAL <${from}>`)
    lines.push(`To: ${to}`)
    lines.push(`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`)
    lines.push('MIME-Version: 1.0')

    // Content type
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
    lines.push('')

    // Plain text part
    lines.push(`--${boundary}`)
    lines.push('Content-Type: text/plain; charset=UTF-8')
    lines.push('Content-Transfer-Encoding: quoted-printable')
    lines.push('')
    lines.push(textBody)
    lines.push('')

    // HTML part
    lines.push(`--${boundary}`)
    lines.push('Content-Type: text/html; charset=UTF-8')
    lines.push('Content-Transfer-Encoding: base64')
    lines.push('')
    lines.push(Buffer.from(htmlBody).toString('base64').replace(/(.{76})/g, '$1\r\n'))
    lines.push('')

    // End boundary
    lines.push(`--${boundary}--`)

    return lines.join('\r\n')
  }

  /**
   * Send business invitation email via AWS SES
   */
  async sendInvitation(data: InvitationEmailData): Promise<{ success: boolean; error?: string; messageId?: string }> {
    try {
      this.initialize()

      const { email, businessName } = data

      const htmlBody = this.generateInvitationHTML(data)
      const textBody = this.generateInvitationText(data)

      const rawMessage = this.buildRawEmail({
        from: this.config!.fromEmail,
        to: email,
        subject: `Invitation to join ${businessName} on FinanSEAL`,
        htmlBody,
        textBody
      })

      const command = new SendRawEmailCommand({
        RawMessage: {
          Data: Buffer.from(rawMessage)
        },
        ConfigurationSetName: this.config!.configurationSet
      })

      const response = await this.ses!.send(command)

      if (!response.MessageId) {
        console.error('[EmailService] SES did not return a MessageId')
        return { success: false, error: 'SES did not return a MessageId' }
      }

      console.log(`[EmailService] Invitation sent via SES to ${email}, MessageId: ${response.MessageId}`)
      return { success: true, messageId: response.MessageId }

    } catch (error) {
      console.error('[EmailService] Failed to send invitation via SES:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown email error'
      }
    }
  }

  /**
   * Generate HTML email template for invitation
   */
  private generateInvitationHTML(data: InvitationEmailData): string {
    const { businessName, inviterName, role, invitationUrl } = data

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Join ${businessName} on FinanSEAL</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          color: white;
          padding: 30px;
          text-align: center;
          border-radius: 8px 8px 0 0;
        }
        .content {
          background: #ffffff;
          padding: 30px;
          border: 1px solid #e5e7eb;
          border-top: none;
        }
        .cta-button {
          display: inline-block;
          background: #3b82f6 !important;
          color: #ffffff !important;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          margin: 20px 0;
          border: none;
        }
        .footer {
          background: #f9fafb;
          padding: 20px;
          text-align: center;
          font-size: 14px;
          color: #6b7280;
          border-radius: 0 0 8px 8px;
          border: 1px solid #e5e7eb;
          border-top: none;
        }
        .role-badge {
          background: #dbeafe;
          color: #1d4ed8;
          padding: 4px 12px;
          border-radius: 16px;
          font-size: 14px;
          font-weight: 500;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>You're invited to join FinanSEAL!</h1>
        <p>Your team is waiting for you</p>
      </div>

      <div class="content">
        <h2>Hi there!</h2>

        <p><strong>${inviterName}</strong> has invited you to join <strong>${businessName}</strong> on FinanSEAL as a <span class="role-badge">${role}</span>.</p>

        <p>FinanSEAL is a financial co-pilot that helps Southeast Asian SMEs manage expenses, process receipts, and track financial performance with AI-powered insights.</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${invitationUrl}" class="cta-button">Accept Invitation</a>
        </div>

        <p><strong>What you'll get access to:</strong></p>
        <ul>
          <li>AI-powered receipt processing and expense tracking</li>
          <li>Multi-currency transaction management</li>
          <li>Real-time financial analytics and insights</li>
          <li>Conversational AI assistant for financial queries</li>
          <li>Collaborative expense approval workflows</li>
        </ul>

        <p>This invitation will expire in <strong>7 days</strong>. Click the button above to get started!</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">

        <p style="font-size: 14px; color: #6b7280;">
          If you're having trouble with the button above, copy and paste this URL into your browser:<br>
          <a href="${invitationUrl}" style="color: #3b82f6; word-break: break-all;">${invitationUrl}</a>
        </p>
      </div>

      <div class="footer">
        <p>
          This invitation was sent by ${inviterName} from ${businessName}<br>
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
        <p style="margin-top: 20px;">
          <a href="https://finance.hellogroot.com" style="color: #3b82f6;">FinanSEAL</a> -
          Financial Co-Pilot for Southeast Asian SMEs
        </p>
      </div>
    </body>
    </html>
    `
  }

  /**
   * Generate plain text version of invitation email
   */
  private generateInvitationText(data: InvitationEmailData): string {
    const { businessName, inviterName, role, invitationUrl } = data

    return `
You're invited to join ${businessName} on FinanSEAL!

Hi there!

${inviterName} has invited you to join ${businessName} on FinanSEAL as a ${role}.

FinanSEAL is a financial co-pilot that helps Southeast Asian SMEs manage expenses, process receipts, and track financial performance with AI-powered insights.

Accept your invitation: ${invitationUrl}

What you'll get access to:
- AI-powered receipt processing and expense tracking
- Multi-currency transaction management
- Real-time financial analytics and insights
- Conversational AI assistant for financial queries
- Collaborative expense approval workflows

This invitation will expire in 7 days.

If you didn't expect this invitation, you can safely ignore this email.

---
FinanSEAL - Financial Co-Pilot for Southeast Asian SMEs
https://finance.hellogroot.com
    `
  }

  /**
   * Send feedback notification email to team members
   */
  async sendFeedbackNotification(data: FeedbackNotificationData): Promise<{ success: boolean; error?: string; messageId?: string }> {
    try {
      this.initialize()

      const { recipientEmail, feedbackType } = data

      const typeLabels = {
        bug: 'Bug Report',
        feature: 'Feature Request',
        general: 'General Feedback'
      }

      const htmlBody = this.generateFeedbackNotificationHTML(data)
      const textBody = this.generateFeedbackNotificationText(data)

      const rawMessage = this.buildRawEmail({
        from: this.config!.fromEmail,
        to: recipientEmail,
        subject: `New ${typeLabels[feedbackType]} from FinanSEAL`,
        htmlBody,
        textBody
      })

      const command = new SendRawEmailCommand({
        RawMessage: {
          Data: Buffer.from(rawMessage)
        },
        ConfigurationSetName: this.config!.configurationSet
      })

      const response = await this.ses!.send(command)

      if (!response.MessageId) {
        console.error('[EmailService] SES did not return a MessageId')
        return { success: false, error: 'SES did not return a MessageId' }
      }

      console.log(`[EmailService] Feedback notification sent via SES to ${recipientEmail}, MessageId: ${response.MessageId}`)
      return { success: true, messageId: response.MessageId }

    } catch (error) {
      console.error('[EmailService] Failed to send feedback notification via SES:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown email error'
      }
    }
  }

  /**
   * Generate HTML email template for feedback notification
   */
  private generateFeedbackNotificationHTML(data: FeedbackNotificationData): string {
    const { feedbackType, feedbackMessage, submitterEmail, pageUrl, githubIssueUrl, isAnonymous } = data

    const typeLabels = {
      bug: 'Bug Report',
      feature: 'Feature Request',
      general: 'General Feedback'
    }

    const typeColors = {
      bug: '#ef4444',
      feature: '#3b82f6',
      general: '#6b7280'
    }

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New ${typeLabels[feedbackType]}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: ${typeColors[feedbackType]};
          color: white;
          padding: 20px;
          text-align: center;
          border-radius: 8px 8px 0 0;
        }
        .content {
          background: #ffffff;
          padding: 20px;
          border: 1px solid #e5e7eb;
          border-top: none;
        }
        .message-box {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 16px;
          margin: 16px 0;
          white-space: pre-wrap;
        }
        .meta {
          font-size: 14px;
          color: #6b7280;
          margin-top: 16px;
        }
        .cta-button {
          display: inline-block;
          background: #3b82f6;
          color: #ffffff !important;
          padding: 10px 20px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          margin: 8px 4px 8px 0;
        }
        .footer {
          background: #f9fafb;
          padding: 16px;
          text-align: center;
          font-size: 14px;
          color: #6b7280;
          border-radius: 0 0 8px 8px;
          border: 1px solid #e5e7eb;
          border-top: none;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>New ${typeLabels[feedbackType]}</h1>
      </div>

      <div class="content">
        <p>A new ${typeLabels[feedbackType].toLowerCase()} has been submitted:</p>

        <div class="message-box">${feedbackMessage}</div>

        <div class="meta">
          <p><strong>Submitted by:</strong> ${isAnonymous ? 'Anonymous' : submitterEmail || 'Unknown'}</p>
          ${pageUrl ? `<p><strong>Page URL:</strong> ${pageUrl}</p>` : ''}
        </div>

        <div style="margin-top: 20px;">
          <a href="${this.config!.appUrl}/en/admin/feedback" class="cta-button">View in Dashboard</a>
          ${githubIssueUrl ? `<a href="${githubIssueUrl}" class="cta-button">View GitHub Issue</a>` : ''}
        </div>
      </div>

      <div class="footer">
        <p>This notification was sent from FinanSEAL Feedback System</p>
      </div>
    </body>
    </html>
    `
  }

  /**
   * Generate plain text version of feedback notification email
   */
  private generateFeedbackNotificationText(data: FeedbackNotificationData): string {
    const { feedbackType, feedbackMessage, submitterEmail, pageUrl, githubIssueUrl, isAnonymous } = data

    const typeLabels = {
      bug: 'Bug Report',
      feature: 'Feature Request',
      general: 'General Feedback'
    }

    return `
New ${typeLabels[feedbackType]} from FinanSEAL

A new ${typeLabels[feedbackType].toLowerCase()} has been submitted:

---
${feedbackMessage}
---

Submitted by: ${isAnonymous ? 'Anonymous' : submitterEmail || 'Unknown'}
${pageUrl ? `Page URL: ${pageUrl}` : ''}
${githubIssueUrl ? `GitHub Issue: ${githubIssueUrl}` : ''}

View in Dashboard: ${this.config!.appUrl}/en/admin/feedback

---
FinanSEAL Feedback System
    `
  }

  /**
   * Test email configuration
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      this.initialize()
      console.log('[EmailService] SES email service configured successfully')
      return { success: true }
    } catch (error) {
      console.error('[EmailService] Configuration test failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Email configuration error'
      }
    }
  }
}

// Export singleton instance
export const emailService = new EmailService()
export default EmailService
