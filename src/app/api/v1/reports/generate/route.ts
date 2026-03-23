/**
 * Report Generation API
 *
 * POST /api/v1/reports/generate
 *
 * Generates aging report PDFs (AP or AR), uploads to S3,
 * creates metadata records in Convex, and returns download URL.
 *
 * Also supports generating individual debtor/vendor statements.
 *
 * Part of 035-aging-payable-receivable-report feature.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { uploadFile, getPresignedDownloadUrl } from '@/lib/aws-s3'
import { generateAgingInsights } from '@/lib/reports/ai-insights-generator'
import { generateReport, generateDebtorStatement, generateVendorStatement } from '@/lib/reports/report-generator'
import type { ArAgingReportData } from '@/lib/reports/templates/ar-aging-template'
import type { ApAgingReportData } from '@/lib/reports/templates/ap-aging-template'
import type { DebtorStatementData } from '@/lib/reports/templates/debtor-statement-template'

export async function POST(req: NextRequest) {
  const { client, userId } = await getAuthenticatedConvex()
  if (!client || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { businessId, reportType, asOfDate } = body as {
    businessId: string
    reportType: 'ap_aging' | 'ar_aging'
    asOfDate: string // YYYY-MM-DD
  }

  if (!businessId || !reportType || !asOfDate) {
    return NextResponse.json(
      { error: 'Missing required fields: businessId, reportType, asOfDate' },
      { status: 400 }
    )
  }

  try {
    // Fetch business info
    const business = await client.query(api.functions.businesses.getById, {
      id: businessId,
    })
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const currency = business.homeCurrency || 'MYR'
    const businessName = business.invoiceSettings?.companyName || business.name || 'Business'
    const periodMonth = asOfDate.substring(0, 7) // YYYY-MM

    // Fetch aging data based on report type
    let reportData: ArAgingReportData | ApAgingReportData

    if (reportType === 'ar_aging') {
      const arData = await client.query(api.functions.financialIntelligence.getARSummary, {
        businessId,
      })

      // Transform to template format
      const customers = (arData?.agingBuckets || []).map((bucket: any) => ({
        customerName: bucket.label || 'Unknown',
        current: bucket.current || 0,
        days30: bucket.days30 || 0,
        days60: bucket.days60 || 0,
        days90: bucket.days90 || 0,
        days120plus: bucket.days90plus || 0,
        total: bucket.total || 0,
      }))

      // Also get per-customer breakdown from payments query
      const agingReport = await client.query(api.functions.payments.getAgingReport, {
        businessId: businessId as Id<"businesses">,
        asOfDate,
      })

      const debtors = agingReport?.debtors || []
      const customerRows = debtors.map((d: any) => ({
        customerName: d.customerName || 'Unknown',
        current: d.buckets?.current || 0,
        days30: d.buckets?.days1to30 || 0,
        days60: d.buckets?.days31to60 || 0,
        days90: d.buckets?.days61to90 || 0,
        days120plus: d.buckets?.days90plus || 0,
        total: d.totalOutstanding || 0,
      }))

      const totals = customerRows.reduce(
        (acc: any, c: any) => ({
          current: acc.current + c.current,
          days30: acc.days30 + c.days30,
          days60: acc.days60 + c.days60,
          days90: acc.days90 + c.days90,
          days120plus: acc.days120plus + c.days120plus,
          total: acc.total + c.total,
        }),
        { current: 0, days30: 0, days60: 0, days90: 0, days120plus: 0, total: 0 }
      )

      reportData = {
        businessName,
        currency,
        periodEnd: asOfDate,
        generatedAt: new Date().toLocaleString(),
        customers: customerRows,
        totals,
      } as ArAgingReportData
    } else {
      // AP Aging
      const apData = await client.query(api.functions.financialIntelligence.getAPAging, {
        businessId,
      })

      const vendorBreakdown = apData?.vendorBreakdown || []
      const vendors = vendorBreakdown.map((v: any) => ({
        vendorName: v.vendorName || 'Unknown',
        current: v.current || 0,
        days30: v.days30 || 0,
        days60: v.days60 || 0,
        days90: v.days90 || 0,
        days120plus: v.days90plus || 0,
        total: v.total || 0,
      }))

      const totals = vendors.reduce(
        (acc: any, v: any) => ({
          current: acc.current + v.current,
          days30: acc.days30 + v.days30,
          days60: acc.days60 + v.days60,
          days90: acc.days90 + v.days90,
          days120plus: acc.days120plus + v.days120plus,
          total: acc.total + v.total,
        }),
        { current: 0, days30: 0, days60: 0, days90: 0, days120plus: 0, total: 0 }
      )

      reportData = {
        businessName,
        currency,
        periodEnd: asOfDate,
        generatedAt: new Date().toLocaleString(),
        vendors,
        totals,
      } as ApAgingReportData
    }

    // Generate PDF
    const result = await generateReport(
      {
        reportType,
        businessId,
        businessName,
        currency,
        periodStart: periodMonth + '-01',
        periodEnd: asOfDate,
      },
      reportData
    )

    // Upload to S3
    const s3Path = `${businessId}/aging/${periodMonth}/${reportType}-consolidated-${Date.now()}.pdf`
    const uploadResult = await uploadFile(
      'reports',
      s3Path,
      result.pdfBuffer,
      'application/pdf',
      { reportType, asOfDate, businessId }
    )

    if (!uploadResult.success) {
      return NextResponse.json(
        { error: 'Failed to upload report: ' + uploadResult.error },
        { status: 500 }
      )
    }

    // FR-018: Generate AI insights (optional — fails gracefully)
    let aiInsightsSummary: string | undefined
    try {
      if (reportType === 'ar_aging') {
        const arData = reportData as ArAgingReportData
        const insightDebtors = arData.customers.map((c) => ({
          customerName: c.customerName,
          current: c.current,
          days1to30: c.days30,
          days31to60: c.days60,
          days61to90: c.days90,
          days90plus: c.days120plus,
          total: c.total,
        }))
        const insights = await generateAgingInsights({
          reportType: 'ar_aging',
          businessName,
          currency,
          asOfDate,
          debtors: insightDebtors,
          totals: {
            current: arData.totals.current,
            days1to30: arData.totals.days30,
            days31to60: arData.totals.days60,
            days61to90: arData.totals.days90,
            days90plus: arData.totals.days120plus,
            total: arData.totals.total,
          },
        })
        if (insights) aiInsightsSummary = insights
      } else {
        const apData = reportData as ApAgingReportData
        const insightVendors = apData.vendors.map((v) => ({
          customerName: v.vendorName,
          current: v.current,
          days1to30: v.days30,
          days31to60: v.days60,
          days61to90: v.days90,
          days90plus: v.days120plus,
          total: v.total,
        }))
        const insights = await generateAgingInsights({
          reportType: 'ap_aging',
          businessName,
          currency,
          asOfDate,
          debtors: insightVendors,
          totals: {
            current: apData.totals.current,
            days1to30: apData.totals.days30,
            days31to60: apData.totals.days60,
            days61to90: apData.totals.days90,
            days90plus: apData.totals.days120plus,
            total: apData.totals.total,
          },
        })
        if (insights) aiInsightsSummary = insights
      }
    } catch (err) {
      console.warn('[Report Generate] AI insights generation failed, continuing without:', err)
    }

    // Create report record in Convex
    const reportId = await client.mutation(api.functions.reports.createReportPublic, {
      businessId,
      reportType,
      reportScope: 'consolidated',
      asOfDate,
      periodMonth,
      generationMethod: 'manual',
      generatedBy: userId,
      s3Key: uploadResult.key,
      s3Bucket: 'finanseal-bucket',
      fileSizeBytes: result.pdfBuffer.length,
      totalOutstanding: reportType === 'ar_aging'
        ? (reportData as ArAgingReportData).totals.total
        : (reportData as ApAgingReportData).totals.total,
      currency,
      hasWarnings: false,
      aiInsightsSummary,
    })

    // Get download URL — extract path from full key
    const downloadPath = uploadResult.key.replace(/^reports\//, '')
    const downloadUrl = await getPresignedDownloadUrl('reports', downloadPath)

    return NextResponse.json({
      success: true,
      reportId,
      downloadUrl,
      metadata: result.metadata,
    })
  } catch (error: any) {
    console.error('Report generation failed:', error)
    return NextResponse.json(
      { error: 'Report generation failed: ' + error.message },
      { status: 500 }
    )
  }
}
