/**
 * Buyer Notification Service
 *
 * Sends email notifications to buyers for e-invoice lifecycle events:
 * - validated: E-invoice has been validated by LHDN
 * - cancelled: E-invoice has been cancelled by the supplier
 * - rejection_confirmed: Buyer's rejection request has been confirmed
 *
 * Uses the existing EmailService (SES + Resend fallback) for delivery.
 */

import { emailService } from './email-service'
import { formatCurrency } from '@/lib/utils/format-number'

// ============================================
// TYPES
// ============================================

export interface BuyerNotificationParams {
  event: 'validated' | 'cancelled' | 'rejection_confirmed'
  buyerEmail: string
  buyerName?: string
  invoiceNumber: string
  businessName: string
  amount: number
  currency: string
  lhdnDocumentUuid: string
  lhdnLongId: string
  reason?: string
  pdfAttachment?: { content: string; filename: string }
}

interface NotificationResult {
  success: boolean
  messageId?: string
  error?: string
}

// ============================================
// CONSTANTS
// ============================================

const LHDN_VERIFICATION_BASE_URL = 'https://myinvois.hasil.gov.my'

// ============================================
// EMAIL CONTENT BUILDERS
// ============================================

function getSubject(params: BuyerNotificationParams): string {
  const { event, invoiceNumber, businessName } = params

  switch (event) {
    case 'validated':
      return `E-Invoice ${invoiceNumber} from ${businessName} — Validated by LHDN`
    case 'cancelled':
      return `E-Invoice ${invoiceNumber} from ${businessName} — Cancelled`
    case 'rejection_confirmed':
      return `E-Invoice ${invoiceNumber} — Your Rejection Confirmed`
    default:
      return `E-Invoice ${invoiceNumber} — Notification from ${businessName}`
  }
}

function getEventHeading(event: BuyerNotificationParams['event']): string {
  switch (event) {
    case 'validated':
      return 'E-Invoice Validated by LHDN'
    case 'cancelled':
      return 'E-Invoice Cancelled'
    case 'rejection_confirmed':
      return 'Rejection Confirmed'
    default:
      return 'E-Invoice Notification'
  }
}

function getEventDescription(params: BuyerNotificationParams): string {
  const { event, invoiceNumber, businessName, reason } = params

  switch (event) {
    case 'validated':
      return `Invoice <strong>${invoiceNumber}</strong> from <strong>${businessName}</strong> has been validated by LHDN (Lembaga Hasil Dalam Negeri). This e-invoice is now a legally recognized tax document.`
    case 'cancelled':
      return `Invoice <strong>${invoiceNumber}</strong> from <strong>${businessName}</strong> has been cancelled.${reason ? ` <br/><br/><strong>Reason:</strong> ${escapeHtml(reason)}` : ''}`
    case 'rejection_confirmed':
      return `Your rejection of invoice <strong>${invoiceNumber}</strong> has been confirmed by LHDN.${reason ? ` <br/><br/><strong>Reason:</strong> ${escapeHtml(reason)}` : ''}`
    default:
      return `A notification regarding invoice <strong>${invoiceNumber}</strong>.`
  }
}

function getEventColor(event: BuyerNotificationParams['event']): string {
  switch (event) {
    case 'validated':
      return '#16a34a' // green
    case 'cancelled':
      return '#dc2626' // red
    case 'rejection_confirmed':
      return '#f59e0b' // amber
    default:
      return '#6b7280' // gray
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildHtmlBody(params: BuyerNotificationParams): string {
  const { buyerName, invoiceNumber, businessName, amount, currency, lhdnDocumentUuid, lhdnLongId, event } = params
  const verificationUrl = `${LHDN_VERIFICATION_BASE_URL}/${lhdnLongId}/share`
  const formattedAmount = formatCurrency(amount, currency)
  const eventColor = getEventColor(event)
  const greeting = buyerName ? `Dear ${escapeHtml(buyerName)},` : 'Dear Customer,'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${getSubject(params)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <!-- Header -->
    <div style="background-color:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
      <div style="padding:24px 24px 0;">
        <!-- Event badge -->
        <div style="display:inline-block;padding:4px 12px;border-radius:4px;background-color:${eventColor}15;color:${eventColor};font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:16px;">
          ${getEventHeading(event)}
        </div>

        <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">
          ${greeting}
        </p>

        <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 20px;">
          ${getEventDescription(params)}
        </p>
      </div>

      <!-- Invoice details table -->
      <div style="padding:0 24px 24px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #f3f4f6;">Invoice Number</td>
            <td style="padding:8px 0;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6;">${escapeHtml(invoiceNumber)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #f3f4f6;">From</td>
            <td style="padding:8px 0;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6;">${escapeHtml(businessName)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #f3f4f6;">Amount</td>
            <td style="padding:8px 0;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6;">${formattedAmount}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;">LHDN Document UUID</td>
            <td style="padding:8px 0;color:#111827;font-size:11px;font-family:monospace;text-align:right;word-break:break-all;">${escapeHtml(lhdnDocumentUuid)}</td>
          </tr>
        </table>
      </div>

      <!-- MyInvois verification link -->
      <div style="padding:16px 24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 8px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
          Verify on MyInvois Portal
        </p>
        <a href="${verificationUrl}" style="color:#2563eb;font-size:13px;word-break:break-all;" target="_blank" rel="noopener noreferrer">
          ${verificationUrl}
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:20px 0;color:#9ca3af;font-size:11px;">
      <p style="margin:0;">
        This is an automated notification from Groot Finance on behalf of ${escapeHtml(businessName)}.
      </p>
    </div>
  </div>
</body>
</html>`
}

function buildTextBody(params: BuyerNotificationParams): string {
  const { buyerName, invoiceNumber, businessName, amount, currency, lhdnDocumentUuid, lhdnLongId, event, reason } = params
  const verificationUrl = `${LHDN_VERIFICATION_BASE_URL}/${lhdnLongId}/share`
  const formattedAmount = formatCurrency(amount, currency)
  const greeting = buyerName ? `Dear ${buyerName},` : 'Dear Customer,'

  let eventText = ''
  switch (event) {
    case 'validated':
      eventText = `Invoice ${invoiceNumber} from ${businessName} has been validated by LHDN. This e-invoice is now a legally recognized tax document.`
      break
    case 'cancelled':
      eventText = `Invoice ${invoiceNumber} from ${businessName} has been cancelled.${reason ? ` Reason: ${reason}` : ''}`
      break
    case 'rejection_confirmed':
      eventText = `Your rejection of invoice ${invoiceNumber} has been confirmed by LHDN.${reason ? ` Reason: ${reason}` : ''}`
      break
  }

  return `${greeting}

${eventText}

Invoice Details:
- Invoice Number: ${invoiceNumber}
- From: ${businessName}
- Amount: ${formattedAmount}
- LHDN Document UUID: ${lhdnDocumentUuid}

Verify on MyInvois Portal:
${verificationUrl}

---
This is an automated notification from Groot Finance on behalf of ${businessName}.`
}

// ============================================
// MAIN SERVICE FUNCTION
// ============================================

/**
 * Send a buyer notification email for e-invoice lifecycle events.
 *
 * Composes event-specific email content and delegates delivery
 * to the existing EmailService (SES + Resend fallback).
 */
export async function sendBuyerNotification(params: BuyerNotificationParams): Promise<NotificationResult> {
  try {
    const subject = getSubject(params)
    const htmlBody = buildHtmlBody(params)
    const textBody = buildTextBody(params)

    const result = await emailService.sendGenericEmail({
      to: params.buyerEmail,
      subject,
      htmlBody,
      textBody,
      attachments: params.pdfAttachment ? [params.pdfAttachment] : undefined,
    })

    return {
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    }
  } catch (error) {
    console.error('[BuyerNotificationService] Failed to send notification:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error sending buyer notification',
    }
  }
}
