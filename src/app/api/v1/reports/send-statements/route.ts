/**
 * Send Debtor Statements API
 *
 * POST /api/v1/reports/send-statements
 *
 * Downloads statement PDFs from S3 and sends them to debtors via SES.
 * Updates debtor_statement_sends status after sending.
 *
 * Part of 035-aging-payable-receivable-report feature.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { getPresignedDownloadUrl } from '@/lib/aws-s3'
import { sendReportEmail, buildDebtorStatementEmailHtml } from '@/lib/services/report-email-service'

/**
 * Download a PDF from S3 via presigned URL.
 * Uses the existing aws-s3 utility to get a signed URL, then fetches the content.
 */
async function downloadPdfFromS3(s3Key: string): Promise<Buffer> {
  const s3Path = s3Key.replace(/^reports\//, '')
  const url = await getPresignedDownloadUrl('reports', s3Path)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download PDF from S3: ${response.status}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function POST(req: NextRequest) {
  const { client, userId } = await getAuthenticatedConvex()
  if (!client || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { statementIds } = body as { statementIds: string[] }

  if (!statementIds || statementIds.length === 0) {
    return NextResponse.json({ error: 'No statement IDs provided' }, { status: 400 })
  }

  try {
    let sent = 0
    let failed = 0
    const errors: string[] = []

    for (const statementId of statementIds) {
      try {
        // Get statement record
        const statements = await client.query(api.functions.reports.listStatementSends, {
          businessId: '', // Will be filtered by ID below
          periodMonth: '',
        })

        // Look up this specific statement via the report
        const statement = await client.query(api.functions.reports.getStatementById, {
          statementId,
        })

        if (!statement) {
          errors.push(`Statement ${statementId} not found`)
          failed++
          continue
        }

        if (!statement.customerEmail) {
          await client.mutation(api.functions.reports.updateStatementStatus, {
            statementId,
            sendStatus: 'no_email',
          })
          failed++
          continue
        }

        // Get the report record to find the PDF
        const report = await client.query(api.functions.reports.getReportById, {
          reportId: statement.reportId.toString(),
        })

        if (!report) {
          errors.push(`Report for statement ${statementId} not found`)
          failed++
          continue
        }

        // Get business info for reply-to
        const business = await client.query(api.functions.businesses.getById, {
          id: statement.businessId.toString(),
        })

        const businessName = business?.invoiceSettings?.companyName || business?.name || 'Business'
        const replyTo = business?.invoiceSettings?.companyEmail || undefined

        // Download PDF from S3
        const pdfBuffer = await downloadPdfFromS3(report.s3Key)

        // Build and send email using shared report email utility
        const currency = report.currency || 'MYR'
        const periodDisplay = statement.periodMonth.replace('-', ' ')
        const htmlBody = buildDebtorStatementEmailHtml(
          statement.customerName,
          businessName,
          report.asOfDate,
          statement.totalOutstanding,
          currency,
          statement.hasDisclaimer
        )

        const result = await sendReportEmail({
          to: statement.customerEmail,
          replyTo,
          subject: `Statement of Account — ${businessName} — ${periodDisplay}`,
          htmlBody,
          pdfBuffer,
          pdfFilename: `Statement-${businessName}-${statement.periodMonth}.pdf`,
        })

        if (result.success) {
          await client.mutation(api.functions.reports.updateStatementStatus, {
            statementId,
            sendStatus: 'sent',
            sentAt: Date.now(),
            emailDeliveryStatus: 'delivered',
          })
          sent++
        } else {
          await client.mutation(api.functions.reports.updateStatementStatus, {
            statementId,
            sendStatus: 'failed',
            emailDeliveryStatus: result.error || 'unknown error',
          })
          errors.push(`Email to ${statement.customerEmail} failed: ${result.error}`)
          failed++
        }
      } catch (err: any) {
        console.error(`Error sending statement ${statementId}:`, err)
        errors.push(`${statementId}: ${err.message}`)
        failed++
      }
    }

    return NextResponse.json({ sent, failed, errors: errors.length > 0 ? errors : undefined })
  } catch (error: any) {
    console.error('Send statements failed:', error)
    return NextResponse.json(
      { error: 'Failed to send statements: ' + error.message },
      { status: 500 }
    )
  }
}
