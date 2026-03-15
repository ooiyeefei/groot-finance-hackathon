/**
 * GET /api/v1/invoices/[invoiceId]/image-url - Generate signed URLs for invoice images
 * Using Convex (database) + CloudFront CDN (primary) / AWS S3 (fallback)
 *
 * CloudFront benefits:
 * - Edge caching (faster loads from nearest location)
 * - No AWS API call for URL generation (instant)
 * - Better security (S3 bucket not directly exposed)
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { getPresignedDownloadUrl, listFiles, fileExists, URL_EXPIRY } from '@/lib/aws-s3'
import {
  isCloudFrontConfigured,
  getInvoiceImageUrl,
  CLOUDFRONT_URL_EXPIRY,
} from '@/lib/cloudfront-signer'

/**
 * Generate signed URL using CloudFront (if configured) or S3 (fallback)
 */
async function generateSignedUrl(storagePath: string): Promise<string> {
  // Try CloudFront first (faster, no AWS API call)
  if (isCloudFrontConfigured()) {
    return getInvoiceImageUrl(storagePath, CLOUDFRONT_URL_EXPIRY.download)
  }

  // Fallback to S3 presigned URL
  return getPresignedDownloadUrl('invoices', storagePath, URL_EXPIRY.download)
}

/** Helper to attach cache headers to a successful response */
function cachedJson(data: Record<string, unknown>): NextResponse {
  const response = NextResponse.json(data)
  // Cache signed URL response for 30 min (URLs valid for 1 hour)
  response.headers.set('Cache-Control', 'private, max-age=1800')
  return response
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { invoiceId } = await params

    // Get query parameters for optional settings
    const { searchParams } = new URL(request.url)
    const useRawFile = searchParams.get('useRawFile') === 'true'
    const pageNumber = parseInt(searchParams.get('pageNumber') || '1')
    const storagePath = searchParams.get('storagePath') // Optional override

    console.log(`[Invoice Image URL] Generating signed URL for invoice: ${invoiceId} (useRawFile: ${useRawFile}, page: ${pageNumber})`)

    // Get Convex client and verify invoice ownership
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Failed to authenticate' },
        { status: 401 }
      )
    }

    // Get invoice details from Convex
    const invoice = await client.query(api.functions.invoices.getById, {
      id: invoiceId
    })

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found or access denied' },
        { status: 404 }
      )
    }

    // Determine the actual storage path to use
    const actualStoragePath = storagePath || invoice.storagePath

    if (!actualStoragePath) {
      return NextResponse.json(
        { success: false, error: 'No storage path available for this invoice' },
        { status: 400 }
      )
    }

    if (useRawFile) {
      // For raw files: use the exact storagePath — skip S3 HEAD check since
      // storagePath comes from our own DB and CloudFront returns 403 if missing
      console.log(`[Invoice Image URL] Using raw file path: ${actualStoragePath}`)

      try {
        const signedUrl = await generateSignedUrl(actualStoragePath)
        const filename = actualStoragePath.split('/').pop() || 'invoice'
        console.log(`[Invoice Image URL] Generated signed URL successfully for raw file: ${filename}`)

        return cachedJson({
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
      } catch (error) {
        console.error('[Invoice Image URL] Failed to generate signed URL for raw file:', error)
        return NextResponse.json(
          { success: false, error: `Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}` },
          { status: 500 }
        )
      }
    } else {
      // For converted images: prioritize converted_image_path (folder with multiple pages)
      const convertedPath = invoice.convertedImagePath || actualStoragePath
      console.log(`[Invoice Image URL] Using ${invoice.convertedImagePath ? 'converted' : 'raw'} image path: ${convertedPath}`)

      // If no converted path, try direct file access (with existence check)
      // Skip direct access for PDFs — img tags can't render PDFs, need converted images
      const isPdf = /\.pdf$/i.test(convertedPath)
      if (!invoice.convertedImagePath && convertedPath && !isPdf) {
        console.log(`[Invoice Image URL] No converted image found, trying direct access for: ${convertedPath}`)

        const exists = await fileExists('invoices', convertedPath)
        if (exists) {
          try {
            const signedUrl = await generateSignedUrl(convertedPath)
            console.log(`[Invoice Image URL] Direct file access successful for: ${convertedPath}`)
            return cachedJson({
              success: true,
              data: {
                imageUrl: signedUrl,
                filename: convertedPath.split('/').pop() || 'invoice',
                storagePath: convertedPath,
                currentPage: 1,
                totalPages: 1,
                availablePages: [{ pageNumber: 1, filename: convertedPath.split('/').pop() || 'invoice' }]
              }
            })
          } catch (error) {
            console.log(`[Invoice Image URL] Direct file access failed, falling back to directory listing:`, error)
          }
        }
      }

      // Fallback: Use directory listing to find actual image files
      console.log(`[Invoice Image URL] Using directory listing to discover converted files`)

      // Check if path has file extension
      const hasFileExtension = /\.(png|jpg|jpeg|pdf)$/i.test(convertedPath)

      let directoryPath: string
      let fileName: string | null

      if (!hasFileExtension) {
        directoryPath = convertedPath
        fileName = null
        console.log(`[Invoice Image URL] Path appears to be a directory: ${directoryPath}`)
      } else {
        const pathParts = convertedPath.split('/')
        fileName = pathParts.pop() || null
        directoryPath = pathParts.join('/')
        console.log(`[Invoice Image URL] Path appears to be a file. Directory: ${directoryPath}, File: ${fileName}`)
      }

      console.log(`[Invoice Image URL] Listing directory: ${directoryPath}${fileName ? `, looking for file: ${fileName}` : ', searching for any image file'}`)

      const { files: fileList } = await listFiles('invoices', directoryPath, { maxKeys: 100 })

      if (fileList.length === 0) {
        console.error(`[Invoice Image URL] No files found in directory: ${directoryPath}`)
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

      console.log(`[Invoice Image URL] Found ${imageFiles.length} image file(s): ${imageFiles.map(f => f.name).join(', ')}`)

      if (imageFiles.length === 0) {
        console.error(`[Invoice Image URL] No image files found. Available files: ${fileList.map(f => f.key).join(', ')}`)
        return NextResponse.json(
          { success: false, error: `No image files found at ${convertedPath}` },
          { status: 404 }
        )
      }

      // Select the requested page (1-indexed)
      const requestedPageIndex = Math.max(0, Math.min(pageNumber - 1, imageFiles.length - 1))
      const selectedImageFile = imageFiles[requestedPageIndex]

      console.log(`[Invoice Image URL] Selected page ${pageNumber} (index ${requestedPageIndex}): ${selectedImageFile.name}`)

      // Create full path for the selected image file
      const fullImagePath = `${directoryPath}/${selectedImageFile.name}`
      console.log(`[Invoice Image URL] Creating signed URL for file: ${fullImagePath}`)

      try {
        const signedUrl = await generateSignedUrl(fullImagePath)

        console.log(`[Invoice Image URL] Generated signed URL successfully for: ${selectedImageFile.name}`)

        return cachedJson({
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
      } catch (error) {
        console.error('[Invoice Image URL] Failed to generate signed URL:', error)
        return NextResponse.json(
          { success: false, error: `Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}` },
          { status: 500 }
        )
      }
    }

  } catch (error) {
    console.error('[Invoice Image URL] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
