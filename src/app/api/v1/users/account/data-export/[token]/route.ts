/**
 * Account Deletion Data Export Download
 * GET /api/v1/users/account/data-export/[token]
 *
 * Validates the download token, checks expiry, and redirects to a presigned S3 URL.
 * No authentication required — the token IS the authentication.
 * Token is single-use-aware (tracks downloads) but allows multiple downloads within expiry.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { getPresignedDownloadUrl } from '@/lib/aws-s3'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!token || token.length < 16) {
      return NextResponse.json(
        { success: false, error: 'Invalid download token' },
        { status: 400 }
      )
    }

    // Look up the export record
    const exportRecord = await convex.query(
      api.functions.users.getDeletionDataExport,
      { downloadToken: token }
    )

    if (!exportRecord) {
      return NextResponse.json(
        { success: false, error: 'Download link not found or has been removed' },
        { status: 404 }
      )
    }

    // Check expiry
    if (Date.now() > exportRecord.expiresAt) {
      return NextResponse.json(
        {
          success: false,
          error: 'This download link has expired. Please contact support with your Business ID to request the data.',
        },
        { status: 410 }
      )
    }

    // Mark as downloaded (fire-and-forget)
    convex.mutation(
      api.functions.users.markDeletionExportDownloaded,
      { downloadToken: token }
    ).catch(() => {
      // Non-critical — don't block the download
    })

    // Generate a fresh presigned URL (1 hour) and redirect
    const presignedUrl = await getPresignedDownloadUrl(
      'account_deletions',
      exportRecord.s3Key.replace('account-deletions/', ''),
      3600
    )

    return NextResponse.redirect(presignedUrl)
  } catch (error) {
    console.error('Error in GET /api/v1/users/account/data-export/[token]:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process download request' },
      { status: 500 }
    )
  }
}
