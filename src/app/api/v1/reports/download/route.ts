/**
 * Report Download API
 *
 * GET /api/v1/reports/download?reportId=xxx
 *
 * Returns a presigned S3 download URL for a generated report.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { getPresignedDownloadUrl } from '@/lib/aws-s3'

export async function GET(req: NextRequest) {
  const { client, userId } = await getAuthenticatedConvex()
  if (!client || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const reportId = req.nextUrl.searchParams.get('reportId')
  if (!reportId) {
    return NextResponse.json({ error: 'Missing reportId' }, { status: 400 })
  }

  try {
    // Fetch report record to get s3Key
    const reports = await client.query(api.functions.reports.getReportById, {
      reportId,
    })

    if (!reports) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // s3Key is stored as "reports/{path}" — extract path after prefix
    const s3Path = reports.s3Key.replace(/^reports\//, '')
    const downloadUrl = await getPresignedDownloadUrl('reports', s3Path)

    return NextResponse.json({ downloadUrl })
  } catch (error: any) {
    console.error('Report download failed:', error)
    return NextResponse.json(
      { error: 'Failed to get download URL: ' + error.message },
      { status: 500 }
    )
  }
}
