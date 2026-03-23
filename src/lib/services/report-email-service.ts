/**
 * Report Email Service
 *
 * Shared utility for sending report-related emails with PDF attachments.
 * Decoupled from specific report types — can be used for aging reports,
 * P&L, cash flow, expense summaries, or any future report.
 *
 * Uses the existing EmailService (SES primary, Resend fallback).
 *
 * Part of 035-aging-payable-receivable-report feature.
 */

import { emailService } from './email-service'

export interface ReportEmailOptions {
  to: string
  replyTo?: string
  subject: string
  htmlBody: string
  pdfBuffer: Buffer
  pdfFilename: string
  bcc?: string
}

export interface OwnerReportSummary {
  totalOutstanding: number
  overdueAmount: number
  overduePercentage: number
  debtorCount: number
  topDebtors: Array<{
    name: string
    amount: number
  }>
  currency: string
  periodMonth: string
  autoSendStatus?: string
}

/**
 * Send a report email with PDF attachment.
 * Works for any report type — debtor statements, consolidated reports, owner summaries.
 */
export async function sendReportEmail(
  options: ReportEmailOptions
): Promise<{ success: boolean; error?: string; provider?: string }> {
  const { to, replyTo, subject, htmlBody, pdfBuffer, pdfFilename, bcc } = options
  const pdfBase64 = pdfBuffer.toString('base64')

  // Use the invoice email method which supports SES + Resend fallback with attachments
  const result = await emailService.sendInvoiceEmail({
    recipientEmail: to,
    recipientName: '',
    invoiceNumber: pdfFilename.replace('.pdf', ''),
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date().toISOString().split('T')[0],
    totalAmount: 0,
    currency: 'MYR',
    balanceDue: 0,
    businessName: 'Report',
    businessEmail: replyTo,
    pdfAttachment: {
      content: pdfBase64,
      filename: pdfFilename,
    },
    bccEmail: bcc,
    // Override the template — pass custom HTML via the existing service
    customHtmlBody: htmlBody,
    customSubject: subject,
  } as any)

  return {
    success: result.success,
    error: result.error,
    provider: result.provider,
  }
}

/**
 * Build HTML for owner monthly report email.
 */
export function buildOwnerReportEmailHtml(
  businessName: string,
  summary: OwnerReportSummary
): string {
  const { totalOutstanding, overdueAmount, overduePercentage, debtorCount, topDebtors, currency, periodMonth, autoSendStatus } = summary

  const fmt = (amount: number) =>
    new Intl.NumberFormat('en-MY', { style: 'currency', currency }).format(amount)

  const periodDisplay = periodMonth.replace('-', ' ')

  const topDebtorRows = topDebtors
    .slice(0, 5)
    .map(
      (d) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">${d.name}</td><td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee;">${fmt(d.amount)}</td></tr>`
    )
    .join('')

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
      <h2 style="margin-bottom:4px;">Your ${periodDisplay} Aging Report</h2>
      <p style="color:#666;margin-top:0;">${businessName}</p>

      <div style="background:#f8f8f8;border-radius:8px;padding:16px;margin:16px 0;">
        <table style="width:100%;font-size:14px;">
          <tr>
            <td style="padding:4px 0;">Total AR Outstanding</td>
            <td style="text-align:right;font-weight:bold;font-size:18px;">${fmt(totalOutstanding)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;">Overdue (30+ days)</td>
            <td style="text-align:right;color:#dc2626;font-weight:bold;">${fmt(overdueAmount)} (${overduePercentage.toFixed(1)}%)</td>
          </tr>
          <tr>
            <td style="padding:4px 0;">Debtors with Outstanding</td>
            <td style="text-align:right;">${debtorCount}</td>
          </tr>
        </table>
      </div>

      ${topDebtorRows.length > 0 ? `
        <h3 style="font-size:14px;margin-bottom:8px;">Top Debtors by Amount Owed</h3>
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr style="border-bottom:2px solid #000;font-weight:bold;">
            <td style="padding:4px 8px;">Debtor</td>
            <td style="padding:4px 8px;text-align:right;">Outstanding</td>
          </tr>
          ${topDebtorRows}
        </table>
      ` : ''}

      ${autoSendStatus ? `
        <p style="font-size:12px;color:#666;background:#f0f4ff;padding:8px;border-radius:4px;margin-top:16px;">
          ${autoSendStatus}
        </p>
      ` : ''}

      <div style="margin-top:24px;">
        <a href="https://finance.hellogroot.com/en/reports"
           style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">
          Review & Send Statements
        </a>
      </div>

      <p style="color:#999;font-size:11px;margin-top:24px;">
        This email was sent by Groot Finance. Your consolidated aging report is attached.
      </p>
    </div>
  `
}

/**
 * Build HTML for debtor statement email.
 */
export function buildDebtorStatementEmailHtml(
  customerName: string,
  businessName: string,
  asOfDate: string,
  totalOutstanding: number,
  currency: string,
  hasDisclaimer: boolean
): string {
  const fmt = (amount: number) =>
    new Intl.NumberFormat('en-MY', { style: 'currency', currency }).format(amount)

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
      <h2>Statement of Account</h2>
      <p>Dear ${customerName},</p>
      <p>Please find attached your statement of account as of ${asOfDate}.</p>
      <p style="font-size:18px;font-weight:bold;">
        Total Outstanding: ${fmt(totalOutstanding)}
      </p>
      ${hasDisclaimer ? `
        <p style="font-size:12px;color:#b58900;background:#fff8e1;padding:8px;border-radius:4px;">
          If you have recently made a payment, it may not yet be reflected in this statement.
        </p>
      ` : ''}
      <p>If you have any questions regarding this statement, please don't hesitate to contact us.</p>
      <p style="color:#999;font-size:12px;">This statement was generated by ${businessName} via Groot Finance.</p>
    </div>
  `
}
