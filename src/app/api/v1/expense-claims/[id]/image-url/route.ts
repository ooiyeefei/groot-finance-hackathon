/**
 * GET /api/v1/expense-claims/[id]/image-url - Generate signed URLs for expense claim receipt images
 * Using Convex (database) + CloudFront CDN (primary) / AWS S3 (fallback)
 *
 * CloudFront benefits:
 * - Edge caching (faster loads from nearest location)
 * - No AWS API call for URL generation (instant)
 * - Better security (S3 bucket not directly exposed)
 */

import { auth } from '@/lib/demo-server-auth'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { getPresignedDownloadUrl, listFiles, fileExists, URL_EXPIRY } from '@/lib/aws-s3'
import {
  isCloudFrontConfigured,
  getExpenseClaimImageUrl,
  CLOUDFRONT_URL_EXPIRY,
} from '@/lib/cloudfront-signer'

/**
 * Generate signed URL using CloudFront (if configured) or S3 (fallback)
 */
async function generateSignedUrl(storagePath: string): Promise<string> {
  // Try CloudFront first (faster, no AWS API call)
  if (isCloudFrontConfigured()) {
    console.log('[Expense Claim Image URL] Using CloudFront CDN')
    return getExpenseClaimImageUrl(storagePath, CLOUDFRONT_URL_EXPIRY.download)
  }

  // Fallback to S3 presigned URL
  console.log('[Expense Claim Image URL] Using S3 presigned URL (CloudFront not configured)')
  return getPresignedDownloadUrl('expense_claims', storagePath, URL_EXPIRY.download)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: claimId } = await params

    // Get query parameters for optional settings
    const { searchParams } = new URL(request.url)
    const useRawFile = searchParams.get('useRawFile') === 'true'
    const pageNumber = parseInt(searchParams.get('pageNumber') || '1')
    const storagePath = searchParams.get('storagePath') // Optional override

    console.log(`[Expense Claim Image URL] Generating signed URL for claim: ${claimId} (useRawFile: ${useRawFile}, page: ${pageNumber})`)

    // Get Convex client and verify expense claim ownership
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Failed to authenticate' },
        { status: 401 }
      )
    }

    // Get expense claim details from Convex
    const expenseClaim = await client.query(api.functions.expenseClaims.getById, {
      id: claimId
    })

    if (!expenseClaim) {
      return NextResponse.json(
        { success: false, error: 'Expense claim not found or access denied' },
        { status: 404 }
      )
    }

    // Determine the actual storage path to use
    let actualStoragePath = storagePath || expenseClaim.storagePath

    // Debug logging to identify path issues
    console.log(`[Expense Claim Image URL] Storage path debug:`, {
      queryParamStoragePath: storagePath,
      expenseClaimStoragePath: expenseClaim.storagePath,
      resolvedStoragePath: actualStoragePath,
      expenseClaimId: claimId
    })

    if (!actualStoragePath) {
      console.error(`[Expense Claim Image URL] No storage path found for expense claim: ${claimId}`)
      return NextResponse.json(
        { success: false, error: 'No storage path available for this expense claim' },
        { status: 400 }
      )
    }

    if (useRawFile) {
      // For raw files: use the exact storagePath — skip S3 HEAD check since
      // storagePath comes from our own DB and CloudFront returns 403 if missing
      console.log(`[Expense Claim Image URL] Using raw file path: ${actualStoragePath}`)

      try {
        const signedUrl = await generateSignedUrl(actualStoragePath)

        // Extract filename from storage path
        const filename = actualStoragePath.split('/').pop() || 'receipt'
        console.log(`[Expense Claim Image URL] Generated signed URL successfully for raw file: ${filename}`)

        const response = NextResponse.json({
          success: true,
          data: {
            imageUrl: signedUrl,
            filename: filename,
            storagePath: actualStoragePath,
            currentPage: 1,
            totalPages: 1,
            availablePages: [{ pageNumber: 1, filename: filename }]
          }
        })
        // Cache signed URL response for 30 min (URLs valid for 1 hour)
        response.headers.set('Cache-Control', 'private, max-age=1800')
        return response
      } catch (error) {
        console.error('[Expense Claim Image URL] Failed to generate signed URL for raw file:', error)
        return NextResponse.json(
          { success: false, error: `Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}` },
          { status: 500 }
        )
      }
    } else {
      // For converted images: prioritize converted_image_path (folder with multiple pages)
      const convertedPath = expenseClaim.convertedImagePath || actualStoragePath
      console.log(`[Expense Claim Image URL] Using ${expenseClaim.convertedImagePath ? 'converted' : 'raw'} image path: ${convertedPath}`)

      // If no converted path, try direct file access first for raw files
      if (!expenseClaim.convertedImagePath && convertedPath) {
        console.log(`[Expense Claim Image URL] No converted image found, trying direct file access for: ${convertedPath}`)

        const exists = await fileExists('expense_claims', convertedPath)
        if (exists) {
          try {
            const signedUrl = await generateSignedUrl(convertedPath)
            console.log(`[Expense Claim Image URL] Direct file access successful for: ${convertedPath}`)
            const resp = NextResponse.json({
              success: true,
              data: {
                imageUrl: signedUrl,
                filename: convertedPath.split('/').pop() || 'receipt',
                storagePath: convertedPath,
                currentPage: 1,
                totalPages: 1,
                availablePages: [{ pageNumber: 1, filename: convertedPath.split('/').pop() || 'receipt' }]
              }
            })
            resp.headers.set('Cache-Control', 'private, max-age=1800')
            return resp
          } catch (error) {
            console.log(`[Expense Claim Image URL] Direct file access failed, falling back to directory listing:`, error)
          }
        }
      }

      // Fallback: Use directory listing to find actual image files
      console.log(`[Expense Claim Image URL] Using directory listing to discover converted files`)

      // Check if path has file extension
      const hasFileExtension = /\.(png|jpg|jpeg|pdf)$/i.test(convertedPath)

      let directoryPath: string
      let fileName: string | null

      if (!hasFileExtension) {
        directoryPath = convertedPath
        fileName = null
        console.log(`[Expense Claim Image URL] Path appears to be a directory: ${directoryPath}`)
      } else {
        const pathParts = convertedPath.split('/')
        fileName = pathParts.pop() || null
        directoryPath = pathParts.join('/')
        console.log(`[Expense Claim Image URL] Path appears to be a file. Directory: ${directoryPath}, File: ${fileName}`)
      }

      console.log(`[Expense Claim Image URL] Listing directory: ${directoryPath}${fileName ? `, looking for file: ${fileName}` : ', searching for any image file'}`)

      const { files: fileList } = await listFiles('expense_claims', directoryPath, { maxKeys: 100 })

      if (fileList.length === 0) {
        console.error(`[Expense Claim Image URL] No files found in directory: ${directoryPath}`)
        return NextResponse.json(
          { success: false, error: 'No files found in directory' },
          { status: 404 }
        )
      }

      // Filter and sort image files
      const imageFiles = fileList
        .filter(file => {
          const name = file.key.split('/').pop()?.toLowerCase() || ''
          return name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')
        })
        .map(file => ({
          name: file.key.split('/').pop() || file.key,
          key: file.key
        }))
        .sort((a, b) => {
          const pageA = a.name.match(/page_?(\d+)/i)?.[1] || a.name.match(/_(\d+)\./)?.[1]
          const pageB = b.name.match(/page_?(\d+)/i)?.[1] || b.name.match(/_(\d+)\./)?.[1]

          if (pageA && pageB) {
            return parseInt(pageA) - parseInt(pageB)
          }
          return a.name.localeCompare(b.name)
        })

      console.log(`[Expense Claim Image URL] Found ${imageFiles.length} image file(s): ${imageFiles.map(f => f.name).join(', ')}`)

      if (imageFiles.length === 0) {
        console.error(`[Expense Claim Image URL] No image files found. Available files: ${fileList.map(f => f.key).join(', ')}`)
        return NextResponse.json(
          { success: false, error: `No image files found at ${convertedPath}` },
          { status: 404 }
        )
      }

      // Select the requested page (1-indexed)
      const requestedPageIndex = Math.max(0, Math.min(pageNumber - 1, imageFiles.length - 1))
      const selectedImageFile = imageFiles[requestedPageIndex]

      console.log(`[Expense Claim Image URL] Selected page ${pageNumber} (index ${requestedPageIndex}): ${selectedImageFile.name}`)

      // Create full path for the selected image file
      const fullImagePath = `${directoryPath}/${selectedImageFile.name}`
      console.log(`[Expense Claim Image URL] Creating signed URL for file: ${fullImagePath}`)

      try {
        const signedUrl = await generateSignedUrl(fullImagePath)

        console.log(`[Expense Claim Image URL] Generated signed URL successfully for: ${selectedImageFile.name}`)

        const resp = NextResponse.json({
          success: true,
          data: {
            imageUrl: signedUrl,
            filename: selectedImageFile.name,
            storagePath: fullImagePath,
            currentPage: requestedPageIndex + 1,
            totalPages: imageFiles.length,
            availablePages: imageFiles.map((file, index) => ({
              pageNumber: index + 1,
              filename: file.name
            }))
          }
        })
        resp.headers.set('Cache-Control', 'private, max-age=1800')
        return resp
      } catch (error) {
        console.error('[Expense Claim Image URL] Failed to generate signed URL:', error)
        return NextResponse.json(
          { success: false, error: `Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}` },
          { status: 500 }
        )
      }
    }

  } catch (error) {
    console.error('[Expense Claim Image URL] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
