/**
 * Internal Email Notification Sender
 *
 * POST /api/v1/notifications/send-email
 *
 * Sends transactional emails via the EmailService (SES + Resend fallback).
 * Called by Convex internalActions that need to deliver email notifications.
 *
 * Authentication: x-api-key header (INTERNAL_API_KEY) — not user-facing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { emailService } from '@/lib/services/email-service'

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    // Also accept MCP_INTERNAL_SERVICE_KEY as fallback (pre-existing Convex env var)
    const envKey = process.env.INTERNAL_API_KEY || process.env.MCP_INTERNAL_SERVICE_KEY
    if (!envKey || apiKey !== envKey) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { to, subject, templateType, templateData, unsubscribeToken } = body

    if (!to || !subject) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject' },
        { status: 400 }
      )
    }

    // Build unsubscribe link if token provided
    const baseUrl = process.env.APP_URL || 'https://finance.hellogroot.com'
    const unsubscribeUrl = unsubscribeToken
      ? `${baseUrl}/api/v1/unsubscribe?userId=${unsubscribeToken}`
      : undefined

    // For raw_html template, use pre-built HTML directly (e.g. weekly digest)
    if (templateType === 'raw_html') {
      const htmlBody = templateData?.htmlBody || ''
      const textBody = templateData?.textBody || ''

      const result = await emailService.sendGenericEmail({
        to,
        subject,
        htmlBody,
        textBody: textBody + (unsubscribeUrl ? `\n\nUnsubscribe: ${unsubscribeUrl}` : ''),
      })

      return NextResponse.json({
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      })
    }

    // For plain_text template, use the body directly
    if (templateType === 'plain_text') {
      const textBody = templateData?.body || ''
      const htmlBody = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#374151;padding:24px;">
<pre style="white-space:pre-wrap;font-family:inherit;line-height:1.6;">${textBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
${unsubscribeUrl ? `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"><p style="font-size:11px;color:#9ca3af;"><a href="${unsubscribeUrl}">Unsubscribe</a></p>` : ''}
</body></html>`

      const result = await emailService.sendGenericEmail({
        to,
        subject,
        htmlBody,
        textBody: textBody + (unsubscribeUrl ? `\n\nUnsubscribe: ${unsubscribeUrl}` : ''),
      })

      return NextResponse.json({
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      })
    }

    // For notification templates, build HTML from templateData
    const recipientName = templateData?.recipientName || 'there'
    const notificationBody = templateData?.body || templateData?.message || subject
    const htmlBody = buildNotificationHtml({
      recipientName,
      subject,
      body: notificationBody,
      unsubscribeUrl,
    })
    const textBody = `Hi ${recipientName},\n\n${notificationBody}\n\n---\nGroot Finance\n${unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : ''}`

    const result = await emailService.sendGenericEmail({
      to,
      subject,
      htmlBody,
      textBody,
    })

    return NextResponse.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    })
  } catch (error) {
    console.error('[send-email] Failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}

function buildNotificationHtml(params: {
  recipientName: string
  subject: string
  body: string
  unsubscribeUrl?: string
}): string {
  const { recipientName, subject, body, unsubscribeUrl } = params
  const escapedBody = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background-color:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
      <div style="padding:24px;">
        <p style="color:#374151;font-size:14px;margin:0 0 16px;">Hi ${recipientName.replace(/&/g, '&amp;').replace(/</g, '&lt;')},</p>
        <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 20px;">${escapedBody}</p>
      </div>
      <div style="padding:16px 24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
        <a href="https://finance.hellogroot.com" style="color:#2563eb;font-size:13px;">Open Groot Finance</a>
      </div>
    </div>
    <div style="text-align:center;padding:20px 0;color:#9ca3af;font-size:11px;">
      <p style="margin:0;">Groot Finance — Financial Co-pilot for Southeast Asian SMEs</p>
      ${unsubscribeUrl ? `<p style="margin:8px 0 0;"><a href="${unsubscribeUrl}" style="color:#9ca3af;">Unsubscribe</a></p>` : ''}
    </div>
  </div>
</body>
</html>`
}
