/**
 * GET /api/v1/signed-url - Lightweight signed URL generation
 *
 * Generates CloudFront signed URLs without redundant Convex queries.
 * The caller already loaded the document from Convex with proper auth,
 * so we only need Clerk auth + path validation here.
 *
 * Supports single and batch mode:
 *   Single: ?path=expense_claims/user123/doc/raw/image.jpg
 *   Batch:  POST with { paths: ["expense_claims/...", "invoices/..."] }
 *
 * ~50ms vs ~400ms per URL compared to the per-document routes.
 */

import { auth } from '@/lib/demo-server-auth'
import { NextRequest, NextResponse } from 'next/server'
import {
  isCloudFrontConfigured,
  getCloudFrontSignedUrl,
  CLOUDFRONT_URL_EXPIRY,
} from '@/lib/cloudfront-signer'
import { getPresignedDownloadUrl, URL_EXPIRY } from '@/lib/aws-s3'

// Only allow signing paths under known prefixes
const ALLOWED_PREFIXES = ['expense_claims/', 'invoices/']

function isAllowedPath(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))
}

async function generateSignedUrl(s3Key: string): Promise<string> {
  if (isCloudFrontConfigured()) {
    return getCloudFrontSignedUrl(s3Key, CLOUDFRONT_URL_EXPIRY.download)
  }
  // Determine prefix for S3 fallback
  const prefix = s3Key.startsWith('invoices/') ? 'invoices' : 'expense_claims'
  const relativePath = s3Key.replace(`${prefix}/`, '')
  return getPresignedDownloadUrl(prefix, relativePath, URL_EXPIRY.download)
}

/**
 * GET /api/v1/signed-url?path=expense_claims/user123/doc/raw/image.jpg
 * Single URL generation — fastest path
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const path = request.nextUrl.searchParams.get('path')
    if (!path || !isAllowedPath(path)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing path parameter' },
        { status: 400 }
      )
    }

    const signedUrl = await generateSignedUrl(path)

    const response = NextResponse.json({
      success: true,
      data: { imageUrl: signedUrl, path }
    })
    response.headers.set('Cache-Control', 'private, max-age=1800')
    return response
  } catch (error) {
    console.error('[Signed URL] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate signed URL' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/v1/signed-url
 * Batch URL generation — for list views loading many images at once
 * Body: { paths: ["expense_claims/...", "invoices/..."] }
 * Max 50 paths per request
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const paths: string[] = body.paths

    if (!Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json(
        { success: false, error: 'paths must be a non-empty array' },
        { status: 400 }
      )
    }

    if (paths.length > 50) {
      return NextResponse.json(
        { success: false, error: 'Maximum 50 paths per batch request' },
        { status: 400 }
      )
    }

    // Validate all paths before signing any
    const invalidPaths = paths.filter((p) => !isAllowedPath(p))
    if (invalidPaths.length > 0) {
      return NextResponse.json(
        { success: false, error: `Invalid paths: ${invalidPaths.join(', ')}` },
        { status: 400 }
      )
    }

    // Sign all URLs in parallel
    const results = await Promise.all(
      paths.map(async (path) => {
        try {
          const signedUrl = await generateSignedUrl(path)
          return { path, imageUrl: signedUrl }
        } catch {
          return { path, imageUrl: null, error: 'Failed to sign' }
        }
      })
    )

    // Return as a map for easy lookup
    const urlMap: Record<string, string | null> = {}
    for (const r of results) {
      urlMap[r.path] = r.imageUrl
    }

    const response = NextResponse.json({
      success: true,
      data: { urls: urlMap }
    })
    response.headers.set('Cache-Control', 'private, max-age=1800')
    return response
  } catch (error) {
    console.error('[Signed URL Batch] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate signed URLs' },
      { status: 500 }
    )
  }
}
