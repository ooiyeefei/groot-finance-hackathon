/**
 * Email Service using Resend
 * Handles business invitation emails and other transactional emails
 */

import { Resend } from 'resend'

interface InvitationEmailData {
  email: string
  businessName: string
  inviterName: string
  role: string
  invitationToken: string
  invitationUrl: string
}

interface EmailServiceConfig {
  apiKey: string
  fromEmail: string
  appUrl: string
}

class EmailService {
  private resend?: Resend
  private config?: EmailServiceConfig

  private initialize() {
    if (this.resend && this.config) {
      return
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is required')
    }

    this.config = {
      apiKey,
      fromEmail: process.env.RESEND_FROM_EMAIL || 'noreply@notifications.helloqroot.com',
      appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    }

    this.resend = new Resend(apiKey)
  }

  /**
   * Send business invitation email
   */
  async sendInvitation(data: InvitationEmailData): Promise<{ success: boolean; error?: string }> {
    try {
      this.initialize()
      
      const { email, businessName, inviterName, role, invitationUrl } = data

      const result = await this.resend!.emails.send({
        from: this.config!.fromEmail,
        to: email,
        subject: `Invitation to join ${businessName} on FinanSEAL`,
        html: this.generateInvitationHTML(data),
        text: this.generateInvitationText(data)
      })

      if (result.error) {
        console.error('[EmailService] Resend error:', result.error)
        return { success: false, error: result.error.message }
      }

      console.log(`[EmailService] Invitation sent to ${email}, ID: ${result.data?.id}`)
      return { success: true }

    } catch (error) {
      console.error('[EmailService] Failed to send invitation:', error)
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
          background: #3b82f6;
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          margin: 20px 0;
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
        <h1>🎉 You're invited to join FinanSEAL!</h1>
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
          <li>📄 AI-powered receipt processing and expense tracking</li>
          <li>💰 Multi-currency transaction management</li>
          <li>📊 Real-time financial analytics and insights</li>
          <li>🤖 Conversational AI assistant for financial queries</li>
          <li>👥 Collaborative expense approval workflows</li>
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
          <a href="https://finanseal.com" style="color: #3b82f6;">FinanSEAL</a> - 
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
https://finanseal.com
    `
  }

  /**
   * Test email configuration
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      this.initialize()
      // Resend doesn't have a direct test method, but we can check if API key is valid
      // by attempting to get account info (this might not be available in all Resend plans)
      console.log('[EmailService] Email service configured successfully')
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