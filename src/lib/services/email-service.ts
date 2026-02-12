/**
 * Email Service using AWS SES with Resend fallback
 * Handles business invitation emails and other transactional emails
 *
 * Primary: AWS SES for unified email delivery
 * Fallback: Resend API when SES fails (e.g., sandbox mode limitations)
 *
 * Authentication:
 * - Vercel Deployment: Uses Vercel OIDC to assume IAM role (AWS_ROLE_ARN required)
 * - Local Development: Uses AWS default credential chain (env vars or ~/.aws/credentials)
 */

import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'
import { fromWebToken } from '@aws-sdk/credential-providers'
import type { AwsCredentialIdentityProvider } from '@smithy/types'
import { Resend } from 'resend'

// Configuration from environment
const AWS_REGION = process.env.AWS_REGION || 'us-west-2'
const AWS_ROLE_ARN = process.env.AWS_ROLE_ARN // Set in Vercel for OIDC
const RESEND_API_KEY = process.env.RESEND_API_KEY // Fallback email provider

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

interface LeaveNotificationData {
  recipientEmail: string
  recipientName: string
  notificationType: 'approved' | 'rejected' | 'submitted' | 'cancelled'
  leaveType: string
  startDate: string
  endDate: string
  totalDays: number
  approverName?: string
  reason?: string // For rejection reason or approval notes
  businessName: string
}

interface InvoiceLineItemEmail {
  itemCode?: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

interface EmailAttachment {
  content: string   // base64-encoded file content
  filename: string
}

interface InvoiceEmailData {
  recipientEmail: string
  recipientName: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  totalAmount: number
  currency: string
  balanceDue: number
  subtotal?: number
  totalTax?: number
  paymentInstructions?: string
  businessName: string
  businessAddress?: string
  businessPhone?: string
  businessEmail?: string
  lineItems?: InvoiceLineItemEmail[]
  viewUrl?: string
  pdfAttachment?: EmailAttachment
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
  private resend?: Resend
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
    console.log(`[EmailService] Initialized SES for region: ${AWS_REGION}`)

    // Initialize Resend as fallback if API key is available
    if (RESEND_API_KEY) {
      this.resend = new Resend(RESEND_API_KEY)
      console.log('[EmailService] Resend fallback initialized')
    }
  }

  /**
   * Check if error is due to SES sandbox limitations
   */
  private isSandboxError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      return (
        message.includes('email address is not verified') ||
        message.includes('messagerejected') ||
        message.includes('not authorized to send') ||
        message.includes('sandbox')
      )
    }
    return false
  }

  /**
   * Send email via Resend (fallback provider)
   */
  private async sendViaResend(params: {
    to: string
    subject: string
    htmlBody: string
    textBody: string
    attachments?: EmailAttachment[]
  }): Promise<{ success: boolean; error?: string; messageId?: string }> {
    if (!this.resend) {
      return { success: false, error: 'Resend not configured (RESEND_API_KEY missing)' }
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: `FinanSEAL <${this.config!.fromEmail}>`,
        to: params.to,
        subject: params.subject,
        html: params.htmlBody,
        text: params.textBody,
        ...(params.attachments?.length ? {
          attachments: params.attachments.map(a => ({
            filename: a.filename,
            content: Buffer.from(a.content, 'base64'),
          })),
        } : {}),
      })

      if (error) {
        console.error('[EmailService] Resend error:', error)
        return { success: false, error: error.message }
      }

      console.log(`[EmailService] Email sent via Resend, ID: ${data?.id}`)
      return { success: true, messageId: data?.id }
    } catch (error) {
      console.error('[EmailService] Resend exception:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Resend error'
      }
    }
  }

  /**
   * Build raw MIME message for SES.
   * When attachments are provided, uses multipart/mixed wrapping multipart/alternative.
   */
  private buildRawEmail(params: {
    from: string
    to: string
    subject: string
    htmlBody: string
    textBody: string
    attachments?: EmailAttachment[]
  }): string {
    const { from, to, subject, htmlBody, textBody, attachments } = params

    const altBoundary = `----=_Alt_${Date.now().toString(36)}`
    const lines: string[] = []

    // Required headers
    lines.push(`From: FinanSEAL <${from}>`)
    lines.push(`To: ${to}`)
    lines.push(`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`)
    lines.push('MIME-Version: 1.0')

    if (attachments?.length) {
      // Wrap in multipart/mixed so we can add attachments
      const mixedBoundary = `----=_Mixed_${Date.now().toString(36)}`
      lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`)
      lines.push('')

      // Body part (multipart/alternative)
      lines.push(`--${mixedBoundary}`)
      lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`)
      lines.push('')
      this.appendBodyParts(lines, altBoundary, textBody, htmlBody)

      // Attachment parts
      for (const att of attachments) {
        lines.push(`--${mixedBoundary}`)
        lines.push(`Content-Type: application/pdf; name="${att.filename}"`)
        lines.push('Content-Transfer-Encoding: base64')
        lines.push(`Content-Disposition: attachment; filename="${att.filename}"`)
        lines.push('')
        // Break base64 into 76-char lines per MIME spec
        lines.push(att.content.replace(/(.{76})/g, '$1\r\n'))
        lines.push('')
      }

      lines.push(`--${mixedBoundary}--`)
    } else {
      // Simple alternative (text + html, no attachments)
      lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`)
      lines.push('')
      this.appendBodyParts(lines, altBoundary, textBody, htmlBody)
    }

    return lines.join('\r\n')
  }

  private appendBodyParts(lines: string[], boundary: string, textBody: string, htmlBody: string) {
    lines.push(`--${boundary}`)
    lines.push('Content-Type: text/plain; charset=UTF-8')
    lines.push('Content-Transfer-Encoding: quoted-printable')
    lines.push('')
    lines.push(textBody)
    lines.push('')

    lines.push(`--${boundary}`)
    lines.push('Content-Type: text/html; charset=UTF-8')
    lines.push('Content-Transfer-Encoding: base64')
    lines.push('')
    lines.push(Buffer.from(htmlBody).toString('base64').replace(/(.{76})/g, '$1\r\n'))
    lines.push('')

    lines.push(`--${boundary}--`)
  }

  /**
   * Send business invitation email via AWS SES with Resend fallback
   *
   * Flow:
   * 1. Try SES first
   * 2. If SES fails due to sandbox (unverified recipient), fallback to Resend
   * 3. If both fail, return error
   */
  async sendInvitation(data: InvitationEmailData): Promise<{ success: boolean; error?: string; messageId?: string; provider?: 'ses' | 'resend' }> {
    this.initialize()

    const { email, businessName } = data

    const htmlBody = this.generateInvitationHTML(data)
    const textBody = this.generateInvitationText(data)
    const subject = `Invitation to join ${businessName} on FinanSEAL`

    // Try SES first
    try {
      const rawMessage = this.buildRawEmail({
        from: this.config!.fromEmail,
        to: email,
        subject,
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

      if (response.MessageId) {
        console.log(`[EmailService] Invitation sent via SES to ${email}, MessageId: ${response.MessageId}`)
        return { success: true, messageId: response.MessageId, provider: 'ses' }
      }
    } catch (sesError) {
      console.error('[EmailService] SES failed:', sesError)

      // If SES failed due to sandbox limitations, try Resend
      if (this.isSandboxError(sesError) && this.resend) {
        console.log('[EmailService] SES sandbox error detected, falling back to Resend...')

        const resendResult = await this.sendViaResend({
          to: email,
          subject,
          htmlBody,
          textBody
        })

        if (resendResult.success) {
          return { ...resendResult, provider: 'resend' }
        }

        // Both failed
        return {
          success: false,
          error: `SES sandbox error, Resend fallback also failed: ${resendResult.error}`
        }
      }

      // SES failed for other reasons (not sandbox)
      return {
        success: false,
        error: sesError instanceof Error ? sesError.message : 'Unknown email error'
      }
    }

    return { success: false, error: 'SES did not return a MessageId' }
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
          <p style="font-size: 13px; color: #6b7280; margin-top: 12px;">
            New to FinanSEAL? You'll be prompted to sign up first.<br>
            Already have an account? Just sign in to accept.
          </p>
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

Note: New to FinanSEAL? You'll be prompted to sign up first.
Already have an account? Just sign in to accept.

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
   * Send feedback notification email to team members (with Resend fallback)
   */
  async sendFeedbackNotification(data: FeedbackNotificationData): Promise<{ success: boolean; error?: string; messageId?: string; provider?: 'ses' | 'resend' }> {
    this.initialize()

    const { recipientEmail, feedbackType } = data

    const typeLabels = {
      bug: 'Bug Report',
      feature: 'Feature Request',
      general: 'General Feedback'
    }

    const htmlBody = this.generateFeedbackNotificationHTML(data)
    const textBody = this.generateFeedbackNotificationText(data)
    const subject = `New ${typeLabels[feedbackType]} from FinanSEAL`

    // Try SES first
    try {
      const rawMessage = this.buildRawEmail({
        from: this.config!.fromEmail,
        to: recipientEmail,
        subject,
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

      if (response.MessageId) {
        console.log(`[EmailService] Feedback notification sent via SES to ${recipientEmail}, MessageId: ${response.MessageId}`)
        return { success: true, messageId: response.MessageId, provider: 'ses' }
      }
    } catch (sesError) {
      console.error('[EmailService] SES failed for feedback notification:', sesError)

      // If SES failed due to sandbox limitations, try Resend
      if (this.isSandboxError(sesError) && this.resend) {
        console.log('[EmailService] SES sandbox error, falling back to Resend for feedback notification...')

        const resendResult = await this.sendViaResend({
          to: recipientEmail,
          subject,
          htmlBody,
          textBody
        })

        if (resendResult.success) {
          return { ...resendResult, provider: 'resend' }
        }

        return {
          success: false,
          error: `SES sandbox error, Resend fallback also failed: ${resendResult.error}`
        }
      }

      return {
        success: false,
        error: sesError instanceof Error ? sesError.message : 'Unknown email error'
      }
    }

    return { success: false, error: 'SES did not return a MessageId' }
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
   * Send leave request notification email (with Resend fallback)
   */
  async sendLeaveNotification(data: LeaveNotificationData): Promise<{ success: boolean; error?: string; messageId?: string; provider?: 'ses' | 'resend' }> {
    this.initialize()

    const { recipientEmail, notificationType } = data

    const subjectMap = {
      approved: 'Your Leave Request Has Been Approved',
      rejected: 'Your Leave Request Has Been Rejected',
      submitted: 'New Leave Request Pending Your Approval',
      cancelled: 'Leave Request Cancelled',
    }

    const htmlBody = this.generateLeaveNotificationHTML(data)
    const textBody = this.generateLeaveNotificationText(data)
    const subject = subjectMap[notificationType]

    // Try SES first
    try {
      const rawMessage = this.buildRawEmail({
        from: this.config!.fromEmail,
        to: recipientEmail,
        subject,
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

      if (response.MessageId) {
        console.log(`[EmailService] Leave notification sent via SES to ${recipientEmail}, MessageId: ${response.MessageId}`)
        return { success: true, messageId: response.MessageId, provider: 'ses' }
      }
    } catch (sesError) {
      console.error('[EmailService] SES failed for leave notification:', sesError)

      // If SES failed due to sandbox limitations, try Resend
      if (this.isSandboxError(sesError) && this.resend) {
        console.log('[EmailService] SES sandbox error, falling back to Resend for leave notification...')

        const resendResult = await this.sendViaResend({
          to: recipientEmail,
          subject,
          htmlBody,
          textBody
        })

        if (resendResult.success) {
          return { ...resendResult, provider: 'resend' }
        }

        return {
          success: false,
          error: `SES sandbox error, Resend fallback also failed: ${resendResult.error}`
        }
      }

      return {
        success: false,
        error: sesError instanceof Error ? sesError.message : 'Unknown email error'
      }
    }

    return { success: false, error: 'SES did not return a MessageId' }
  }

  /**
   * Generate HTML email template for leave notification
   */
  private generateLeaveNotificationHTML(data: LeaveNotificationData): string {
    const { recipientName, notificationType, leaveType, startDate, endDate, totalDays, approverName, reason, businessName } = data

    const statusColors = {
      approved: '#059669',
      rejected: '#ef4444',
      submitted: '#f59e0b',
      cancelled: '#6b7280',
    }

    const statusLabels = {
      approved: 'Approved',
      rejected: 'Rejected',
      submitted: 'Pending Approval',
      cancelled: 'Cancelled',
    }

    const getMainMessage = () => {
      switch (notificationType) {
        case 'approved':
          return `Great news! Your ${leaveType} request has been approved${approverName ? ` by ${approverName}` : ''}.`
        case 'rejected':
          return `Unfortunately, your ${leaveType} request has been rejected${approverName ? ` by ${approverName}` : ''}.`
        case 'submitted':
          return `A new ${leaveType} request is waiting for your approval.`
        case 'cancelled':
          return `A ${leaveType} request has been cancelled.`
        default:
          return `Your ${leaveType} request status has been updated.`
      }
    }

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Leave Request ${statusLabels[notificationType]}</title>
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
          background: ${statusColors[notificationType]};
          color: white;
          padding: 24px;
          text-align: center;
          border-radius: 8px 8px 0 0;
        }
        .content {
          background: #ffffff;
          padding: 24px;
          border: 1px solid #e5e7eb;
          border-top: none;
        }
        .status-badge {
          display: inline-block;
          background: ${statusColors[notificationType]}20;
          color: ${statusColors[notificationType]};
          padding: 4px 12px;
          border-radius: 16px;
          font-size: 14px;
          font-weight: 600;
          text-transform: uppercase;
        }
        .details-box {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 16px;
          margin: 20px 0;
        }
        .details-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .details-row:last-child {
          border-bottom: none;
        }
        .details-label {
          color: #6b7280;
          font-size: 14px;
        }
        .details-value {
          font-weight: 500;
        }
        .reason-box {
          background: ${notificationType === 'rejected' ? '#fef2f2' : '#f0fdf4'};
          border: 1px solid ${notificationType === 'rejected' ? '#fecaca' : '#bbf7d0'};
          border-radius: 8px;
          padding: 16px;
          margin: 20px 0;
        }
        .cta-button {
          display: inline-block;
          background: #3b82f6;
          color: #ffffff !important;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          margin: 20px 0;
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
        <h1>Leave Request ${statusLabels[notificationType]}</h1>
      </div>

      <div class="content">
        <p>Hi ${recipientName},</p>

        <p>${getMainMessage()}</p>

        <div class="details-box">
          <div class="details-row">
            <span class="details-label">Leave Type</span>
            <span class="details-value">${leaveType}</span>
          </div>
          <div class="details-row">
            <span class="details-label">Duration</span>
            <span class="details-value">${startDate} to ${endDate}</span>
          </div>
          <div class="details-row">
            <span class="details-label">Total Days</span>
            <span class="details-value">${totalDays} business day${totalDays !== 1 ? 's' : ''}</span>
          </div>
          <div class="details-row">
            <span class="details-label">Status</span>
            <span class="status-badge">${statusLabels[notificationType]}</span>
          </div>
        </div>

        ${reason ? `
        <div class="reason-box">
          <strong>${notificationType === 'rejected' ? 'Reason for rejection:' : 'Notes:'}</strong>
          <p style="margin: 8px 0 0 0;">${reason}</p>
        </div>
        ` : ''}

        <div style="text-align: center;">
          <a href="${this.config!.appUrl}/en/leave" class="cta-button">View in FinanSEAL</a>
        </div>
      </div>

      <div class="footer">
        <p>This notification was sent from ${businessName} via FinanSEAL</p>
        <p style="margin-top: 12px;">
          <a href="${this.config!.appUrl}" style="color: #3b82f6;">FinanSEAL</a> -
          Financial Co-Pilot for Southeast Asian SMEs
        </p>
      </div>
    </body>
    </html>
    `
  }

  /**
   * Generate plain text version of leave notification email
   */
  private generateLeaveNotificationText(data: LeaveNotificationData): string {
    const { recipientName, notificationType, leaveType, startDate, endDate, totalDays, approverName, reason, businessName } = data

    const statusLabels = {
      approved: 'Approved',
      rejected: 'Rejected',
      submitted: 'Pending Approval',
      cancelled: 'Cancelled',
    }

    const getMainMessage = () => {
      switch (notificationType) {
        case 'approved':
          return `Great news! Your ${leaveType} request has been approved${approverName ? ` by ${approverName}` : ''}.`
        case 'rejected':
          return `Unfortunately, your ${leaveType} request has been rejected${approverName ? ` by ${approverName}` : ''}.`
        case 'submitted':
          return `A new ${leaveType} request is waiting for your approval.`
        case 'cancelled':
          return `A ${leaveType} request has been cancelled.`
        default:
          return `Your ${leaveType} request status has been updated.`
      }
    }

    return `
Leave Request ${statusLabels[notificationType]}

Hi ${recipientName},

${getMainMessage()}

Leave Details:
- Leave Type: ${leaveType}
- Duration: ${startDate} to ${endDate}
- Total Days: ${totalDays} business day${totalDays !== 1 ? 's' : ''}
- Status: ${statusLabels[notificationType]}

${reason ? `
${notificationType === 'rejected' ? 'Reason for rejection:' : 'Notes:'}
${reason}
` : ''}

View in FinanSEAL: ${this.config!.appUrl}/en/leave

---
This notification was sent from ${businessName} via FinanSEAL
Financial Co-Pilot for Southeast Asian SMEs
${this.config!.appUrl}
    `
  }

  /**
   * Send invoice email to customer (with Resend fallback)
   */
  async sendInvoiceEmail(data: InvoiceEmailData): Promise<{ success: boolean; error?: string; messageId?: string; provider?: 'ses' | 'resend' }> {
    this.initialize()

    const { recipientEmail, businessName, invoiceNumber, pdfAttachment } = data

    const htmlBody = this.generateInvoiceEmailHTML(data)
    const textBody = this.generateInvoiceEmailText(data)
    const subject = `Invoice ${invoiceNumber} from ${businessName}`
    const attachments = pdfAttachment ? [pdfAttachment] : undefined

    // Try SES first
    try {
      const rawMessage = this.buildRawEmail({
        from: this.config!.fromEmail,
        to: recipientEmail,
        subject,
        htmlBody,
        textBody,
        attachments,
      })

      const command = new SendRawEmailCommand({
        RawMessage: {
          Data: Buffer.from(rawMessage)
        },
        ConfigurationSetName: this.config!.configurationSet
      })

      const response = await this.ses!.send(command)

      if (response.MessageId) {
        console.log(`[EmailService] Invoice email sent via SES to ${recipientEmail}, MessageId: ${response.MessageId}`)
        return { success: true, messageId: response.MessageId, provider: 'ses' }
      }
    } catch (sesError) {
      console.error('[EmailService] SES failed for invoice email:', sesError)

      // Fall back to Resend on any SES failure (credentials, sandbox, etc.)
      if (this.resend) {
        console.log('[EmailService] SES failed, falling back to Resend for invoice email...')

        try {
          const resendResult = await this.sendViaResend({
            to: recipientEmail,
            subject,
            htmlBody,
            textBody,
            attachments,
          })

          if (resendResult.success) {
            return { ...resendResult, provider: 'resend' }
          }

          return {
            success: false,
            error: `SES failed and Resend fallback also failed: ${resendResult.error}`
          }
        } catch (resendError) {
          console.error('[EmailService] Resend fallback also failed:', resendError)
          return {
            success: false,
            error: `SES failed and Resend fallback also failed: ${resendError instanceof Error ? resendError.message : 'Unknown error'}`
          }
        }
      }

      return {
        success: false,
        error: sesError instanceof Error ? sesError.message : 'Unknown email error'
      }
    }

    return { success: false, error: 'SES did not return a MessageId' }
  }

  private generateInvoiceEmailHTML(data: InvoiceEmailData): string {
    const { recipientName, invoiceNumber, invoiceDate, dueDate, totalAmount, currency, balanceDue, subtotal, totalTax, paymentInstructions, businessName, businessAddress, businessPhone, businessEmail, lineItems } = data

    const fmt = (amount: number) => {
      return `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
    }

    const lineItemsHTML = lineItems && lineItems.length > 0 ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 0 0 24px 0;">
          <tr style="background-color: #f8fafc;">
            <td style="padding: 10px 12px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Item Code</td>
            <td style="padding: 10px 12px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Description</td>
            <td style="padding: 10px 12px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; text-align: center;">Qty</td>
            <td style="padding: 10px 12px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; text-align: right;">Unit Price</td>
            <td style="padding: 10px 12px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; text-align: right;">Amount</td>
          </tr>
          ${lineItems.map(item => `
          <tr>
            <td style="padding: 10px 12px; font-size: 14px; color: #64748b; border-bottom: 1px solid #f1f5f9;">${item.itemCode || '-'}</td>
            <td style="padding: 10px 12px; font-size: 14px; color: #1e293b; border-bottom: 1px solid #f1f5f9;">${item.description}</td>
            <td style="padding: 10px 12px; font-size: 14px; color: #475569; border-bottom: 1px solid #f1f5f9; text-align: center;">${item.quantity}</td>
            <td style="padding: 10px 12px; font-size: 14px; color: #475569; border-bottom: 1px solid #f1f5f9; text-align: right;">${fmt(item.unitPrice)}</td>
            <td style="padding: 10px 12px; font-size: 14px; color: #1e293b; font-weight: 500; border-bottom: 1px solid #f1f5f9; text-align: right;">${fmt(item.amount)}</td>
          </tr>
          `).join('')}
        </table>
    ` : ''

    const businessDetailsHTML = [businessAddress, businessPhone, businessEmail].filter(Boolean).length > 0 ? `
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b; line-height: 1.5;">
          ${[businessAddress, businessPhone, businessEmail].filter(Boolean).join(' &middot; ')}
        </p>
    ` : ''

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice ${invoiceNumber}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 32px 16px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <!-- Header -->
              <tr>
                <td style="padding: 32px 32px 24px 32px; border-bottom: 3px solid #1e40af;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <p style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">${businessName}</p>
                        ${businessDetailsHTML}
                      </td>
                      <td align="right" style="vertical-align: top;">
                        <p style="margin: 0; font-size: 28px; font-weight: 800; color: #1e293b; letter-spacing: -0.5px;">INVOICE</p>
                        <p style="margin: 4px 0 0 0; font-size: 14px; color: #64748b;">${invoiceNumber}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Greeting -->
              <tr>
                <td style="padding: 24px 32px 8px 32px;">
                  <p style="margin: 0; font-size: 15px; color: #334155; line-height: 1.6;">
                    Dear ${recipientName},
                  </p>
                  <p style="margin: 8px 0 0 0; font-size: 15px; color: #334155; line-height: 1.6;">
                    Please find your invoice details below.
                  </p>
                </td>
              </tr>

              <!-- Key Details -->
              <tr>
                <td style="padding: 16px 32px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <tr>
                      <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="font-size: 13px; color: #64748b;">Invoice Date</td>
                            <td align="right" style="font-size: 14px; font-weight: 600; color: #0f172a;">${invoiceDate}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="font-size: 13px; color: #64748b;">Due Date</td>
                            <td align="right" style="font-size: 14px; font-weight: 700; color: #dc2626;">${dueDate}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 16px 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="font-size: 13px; color: #64748b;">Currency</td>
                            <td align="right" style="font-size: 14px; font-weight: 600; color: #0f172a;">${currency}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Line Items -->
              ${lineItemsHTML ? `
              <tr>
                <td style="padding: 8px 32px 0 32px;">
                  <p style="margin: 0 0 12px 0; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Items</p>
                  ${lineItemsHTML}
                </td>
              </tr>
              ` : ''}

              <!-- Totals -->
              <tr>
                <td style="padding: 0 32px 8px 32px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="50%"></td>
                      <td width="50%">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          ${subtotal !== undefined ? `
                          <tr>
                            <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Subtotal</td>
                            <td align="right" style="padding: 6px 0; font-size: 14px; color: #334155;">${fmt(subtotal)}</td>
                          </tr>
                          ` : ''}
                          ${totalTax !== undefined ? `
                          <tr>
                            <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Tax</td>
                            <td align="right" style="padding: 6px 0; font-size: 14px; color: #334155;">${fmt(totalTax)}</td>
                          </tr>
                          ` : ''}
                          <tr>
                            <td style="padding: 6px 0; font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px;">Total</td>
                            <td align="right" style="padding: 6px 0; font-size: 14px; font-weight: 600; color: #0f172a; border-top: 1px solid #e2e8f0; padding-top: 10px;">${fmt(totalAmount)}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Amount Due Highlight -->
              <tr>
                <td style="padding: 8px 32px 16px 32px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1e40af; border-radius: 6px;">
                    <tr>
                      <td style="padding: 20px 24px;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="font-size: 14px; color: #bfdbfe; font-weight: 500;">Balance Due</td>
                            <td align="right" style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">${fmt(balanceDue)}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              ${paymentInstructions ? `
              <!-- Payment Instructions -->
              <tr>
                <td style="padding: 0 32px 16px 32px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; border-radius: 6px; border: 1px solid #bbf7d0;">
                    <tr>
                      <td style="padding: 16px 20px;">
                        <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: #15803d; text-transform: uppercase; letter-spacing: 0.5px;">Payment Instructions</p>
                        <p style="margin: 0; font-size: 14px; color: #334155; white-space: pre-wrap; line-height: 1.6;">${paymentInstructions}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              ` : ''}

              <!-- Footer -->
              <tr>
                <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0; font-size: 13px; color: #94a3b8; text-align: center;">
                    If you have any questions about this invoice, please contact us.
                  </p>
                  <p style="margin: 8px 0 0 0; font-size: 12px; color: #cbd5e1; text-align: center;">
                    Sent from ${businessName} via FinanSEAL
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `
  }

  private generateInvoiceEmailText(data: InvoiceEmailData): string {
    const { recipientName, invoiceNumber, invoiceDate, dueDate, totalAmount, currency, balanceDue, subtotal, totalTax, paymentInstructions, businessName, lineItems } = data

    const fmt = (amount: number) => `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`

    const itemsText = lineItems && lineItems.length > 0
      ? `\nItems:\n${lineItems.map(item => `  - ${item.itemCode ? `[${item.itemCode}] ` : ''}${item.description} (x${item.quantity}) — ${fmt(item.amount)}`).join('\n')}\n`
      : ''

    return `
INVOICE ${invoiceNumber}
${businessName}

Dear ${recipientName},

Please find your invoice details below.

Invoice Date: ${invoiceDate}
Due Date: ${dueDate}
Currency: ${currency}
${itemsText}
${subtotal !== undefined ? `Subtotal: ${fmt(subtotal)}` : ''}
${totalTax !== undefined ? `Tax: ${fmt(totalTax)}` : ''}
Total: ${fmt(totalAmount)}
Balance Due: ${fmt(balanceDue)}
${paymentInstructions ? `\nPayment Instructions:\n${paymentInstructions}\n` : ''}
If you have any questions about this invoice, please contact us.

---
Sent from ${businessName} via FinanSEAL
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
