/**
 * Individual Statement Generation API
 *
 * POST /api/v1/reports/generate-statements
 *
 * Generates individual debtor statement PDFs for all customers with
 * outstanding AR invoices, uploads to S3, creates tracking records.
 *
 * Part of 035-aging-payable-receivable-report feature.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { uploadFile } from '@/lib/aws-s3'
import { generateDebtorStatement } from '@/lib/reports/report-generator'

export async function POST(req: NextRequest) {
  const { client, userId } = await getAuthenticatedConvex()
  if (!client || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { businessId, asOfDate, hasWarnings = false } = body as {
    businessId: string
    asOfDate: string
    hasWarnings?: boolean
  }

  if (!businessId || !asOfDate) {
    return NextResponse.json(
      { error: 'Missing required fields: businessId, asOfDate' },
      { status: 400 }
    )
  }

  try {
    const business = await client.query(api.functions.businesses.getById, {
      id: businessId,
    })
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const currency = business.homeCurrency || 'MYR'
    const businessName = business.invoiceSettings?.companyName || business.name || 'Business'
    const businessEmail = business.invoiceSettings?.companyEmail || ''
    const periodMonth = asOfDate.substring(0, 7)
    const reportSettings = business.reportSettings ?? {}
    const autoSendDebtors = reportSettings.autoSendDebtors ?? []

    // Fetch debtors with aging breakdown
    const agingReport = await client.query(api.functions.payments.getAgingReport, {
      businessId: businessId as Id<"businesses">,
      asOfDate,
    })

    const debtors = agingReport?.debtors ?? []
    if (debtors.length === 0) {
      return NextResponse.json({ success: true, statementCount: 0, reportIds: [] })
    }

    // Fetch outstanding sales invoices for invoice-level detail
    // salesInvoices.list returns { invoices, nextCursor, totalCount, summary }
    const sentResult = await client.query(api.functions.salesInvoices.list, {
      businessId,
      status: 'sent',
    })
    const partialResult = await client.query(api.functions.salesInvoices.list, {
      businessId,
      status: 'partially_paid',
    })
    const overdueResult = await client.query(api.functions.salesInvoices.list, {
      businessId,
      status: 'overdue',
    })

    // Combine and deduplicate
    const allInvoiceMap = new Map<string, any>()
    for (const inv of [
      ...(sentResult?.invoices ?? []),
      ...(partialResult?.invoices ?? []),
      ...(overdueResult?.invoices ?? []),
    ]) {
      if (inv.balanceDue > 0) {
        allInvoiceMap.set(inv._id, inv)
      }
    }
    const allInvoices = Array.from(allInvoiceMap.values())

    const reportIds: string[] = []
    let generated = 0

    for (const debtor of debtors) {
      // Build invoice detail rows for this debtor
      const debtorInvoices = allInvoices
        .filter((inv: any) =>
          inv.customerSnapshot?.businessName === debtor.customerName
        )
        .map((inv: any) => {
          const dueDate = inv.dueDate || asOfDate
          const daysOverdue = Math.max(
            0,
            Math.floor(
              (new Date(asOfDate + 'T00:00:00Z').getTime() -
                new Date(dueDate + 'T00:00:00Z').getTime()) /
                (1000 * 60 * 60 * 24)
            )
          )
          return {
            invoiceNumber: inv.invoiceNumber || 'N/A',
            invoiceDate: inv.invoiceDate || new Date(inv._creationTime).toISOString().split('T')[0],
            dueDate,
            originalAmount: inv.totalAmount ?? inv.balanceDue,
            paidAmount: Math.max(0, (inv.totalAmount ?? 0) - inv.balanceDue),
            outstandingBalance: inv.balanceDue,
            daysOverdue,
          }
        })

      // Resolve customer email (billing/AP first, then primary)
      let customerEmail: string | undefined
      let contactPerson: string | undefined

      if (debtor.customerId) {
        try {
          const customer = await client.query(api.functions.customers.getById, {
            id: debtor.customerId as Id<"customers">,
            businessId: businessId as Id<"businesses">,
          })
          customerEmail = customer?.email || customer?.email2 || undefined
          contactPerson = customer?.contactPerson || undefined
        } catch {
          // Customer lookup failed — continue without email
        }
      }

      const statementData = {
        businessName,
        businessEmail,
        currency,
        asOfDate,
        generatedAt: new Date().toLocaleString(),
        customer: {
          name: debtor.customerName,
          email: customerEmail,
          contactPerson,
        },
        invoices: debtorInvoices,
        agingTotals: {
          current: debtor.current ?? 0,
          days1to30: debtor.days1to30 ?? 0,
          days31to60: debtor.days31to60 ?? 0,
          days61to90: debtor.days61to90 ?? 0,
          days90plus: debtor.days90plus ?? 0,
        },
        grandTotal: debtor.total ?? 0,
        hasDisclaimer: hasWarnings,
      }

      // Generate PDF
      const pdfBuffer = await generateDebtorStatement(statementData)

      // Upload to S3
      const safeName = debtor.customerName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)
      const s3Path = `${businessId}/aging/${periodMonth}/statement-${safeName}-${Date.now()}.pdf`
      const uploadResult = await uploadFile('reports', s3Path, pdfBuffer, 'application/pdf')

      if (!uploadResult.success) {
        console.error(`Failed to upload statement for ${debtor.customerName}:`, uploadResult.error)
        continue
      }

      // Create report record
      const reportId = await client.mutation(api.functions.reports.createReportPublic, {
        businessId,
        reportType: 'ar_aging',
        reportScope: 'debtor_statement',
        asOfDate,
        periodMonth,
        generationMethod: 'manual',
        generatedBy: userId,
        s3Key: uploadResult.key,
        s3Bucket: 'finanseal-bucket',
        fileSizeBytes: pdfBuffer.length,
        entityId: debtor.customerId?.toString(),
        entityName: debtor.customerName,
        totalOutstanding: debtor.total ?? 0,
        currency,
        hasWarnings,
      })

      // Determine send status — auto-send only if debtor is in auto-send list
      // AND has been sent to before (new debtors always require manual review per FR-014)
      const isInAutoSendList = autoSendDebtors.includes(debtor.customerId?.toString() || '')
      let sendStatus: 'pending' | 'no_email' | 'auto_sent' = !customerEmail ? 'no_email' : 'pending'

      // Check if this debtor has ever received a statement before
      if (isInAutoSendList && customerEmail) {
        const previousSends = await client.query(api.functions.reports.listStatementSends, {
          businessId,
          periodMonth: '', // empty to get all
          sendStatus: 'sent',
        })
        const hasPreviousSend = previousSends?.some(
          (s: any) => s.customerId === (debtor.customerId?.toString() || debtor.customerName) &&
            (s.sendStatus === 'sent' || s.sendStatus === 'auto_sent')
        )
        if (hasPreviousSend) {
          sendStatus = 'auto_sent'
          // TODO: Actually send via SES here for auto-sent statements
        }
      }

      await client.mutation(api.functions.reports.createStatementSendPublic, {
        businessId,
        reportId: reportId.toString(),
        customerId: debtor.customerId?.toString() || debtor.customerName,
        customerName: debtor.customerName,
        customerEmail,
        totalOutstanding: debtor.total ?? 0,
        invoiceCount: debtorInvoices.length,
        sendStatus: sendStatus as any,
        periodMonth,
        hasDisclaimer: hasWarnings,
        autoSendEnabled: isInAutoSendList,
      })

      reportIds.push(reportId.toString())
      generated++
    }

    return NextResponse.json({
      success: true,
      statementCount: generated,
      reportIds,
    })
  } catch (error: any) {
    console.error('Statement generation failed:', error)
    return NextResponse.json(
      { error: 'Statement generation failed: ' + error.message },
      { status: 500 }
    )
  }
}
