/**
 * GET /api/v1/invoices/[invoiceId]/image-url - Generate signed URLs for invoice images
 * Migrated from POST /api/invoices/image-url to follow RESTful conventions
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/db/supabase-server'
import { getUserData } from '@/lib/db/supabase-server'

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

    // Get user data with business context
    const userData = await getUserData(userId)
    const supabase = createServiceSupabaseClient()

    // Verify invoice ownership and get document details
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, user_id, storage_path, converted_image_path, file_name, file_type')
      .eq('id', invoiceId)
      .eq('user_id', userData.id)
      .is('deleted_at', null)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found or access denied' },
        { status: 404 }
      )
    }

    // Determine the actual storage path to use
    let actualStoragePath = storagePath || invoice.storage_path

    if (!actualStoragePath) {
      return NextResponse.json(
        { success: false, error: 'No storage path available for this invoice' },
        { status: 400 }
      )
    }

    if (useRawFile) {
      // For raw files: use the exact storagePath
      console.log(`[Invoice Image URL] Using raw file path: ${actualStoragePath}`)

      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from('invoices')
        .createSignedUrl(actualStoragePath, 3600) // 1 hour expiry

      if (urlError) {
        console.error('[Invoice Image URL] Failed to generate signed URL for raw file:', urlError)
        return NextResponse.json(
          { success: false, error: `Failed to generate signed URL: ${urlError.message}` },
          { status: 500 }
        )
      }

      if (!signedUrlData?.signedUrl) {
        return NextResponse.json(
          { success: false, error: 'No signed URL returned' },
          { status: 500 }
        )
      }

      // Extract filename from storage path
      const filename = actualStoragePath.split('/').pop() || 'invoice'
      console.log(`[Invoice Image URL] Generated signed URL successfully for raw file: ${filename}`)

      return NextResponse.json({
        success: true,
        data: {
          imageUrl: signedUrlData.signedUrl,
          filename: filename,
          storagePath: actualStoragePath,
          // Raw files are single page
          currentPage: 1,
          totalPages: 1,
          availablePages: [{ pageNumber: 1, filename: filename }]
        }
      })
    } else {
      // For converted images: prioritize converted_image_path (folder with multiple pages)
      const convertedPath = invoice.converted_image_path || actualStoragePath
      console.log(`[Invoice Image URL] Using ${invoice.converted_image_path ? 'converted' : 'raw'} image path: ${convertedPath}`)

      // If we have a converted_image_path, it's likely a folder - go straight to directory listing
      // If no converted path, try direct file access first for raw files
      if (!invoice.converted_image_path && convertedPath) {
        console.log(`[Invoice Image URL] No converted image found, trying direct file access for: ${convertedPath}`)

        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from('invoices')
          .createSignedUrl(convertedPath, 3600) // 1 hour expiry

        if (!urlError && signedUrlData?.signedUrl) {
          console.log(`[Invoice Image URL] Direct file access successful for: ${convertedPath}`)
          return NextResponse.json({
            success: true,
            data: {
              imageUrl: signedUrlData.signedUrl,
              filename: convertedPath.split('/').pop() || 'invoice',
              storagePath: convertedPath,
              // Single direct file
              currentPage: 1,
              totalPages: 1,
              availablePages: [{ pageNumber: 1, filename: convertedPath.split('/').pop() || 'invoice' }]
            }
          })
        } else {
          console.log(`[Invoice Image URL] Direct file access failed, falling back to directory listing:`, urlError)
        }
      }

      // Fallback: Use directory listing architecture to find actual image files
      console.log(`[Invoice Image URL] Using directory list() to discover converted files`)

      // For converted images, the path might be a directory (like '1759860188642') rather than a full file path
      // Check if this looks like a directory path (no file extension)
      const hasFileExtension = /\.(png|jpg|jpeg|pdf)$/i.test(convertedPath)

      let directoryPath, fileName

      if (!hasFileExtension) {
        // This is likely a directory path, use it directly
        directoryPath = convertedPath
        fileName = null // We'll search for any image file
        console.log(`[Invoice Image URL] Path appears to be a directory: ${directoryPath}`)
      } else {
        // This is a file path, extract directory and filename
        const pathParts = convertedPath.split('/')
        fileName = pathParts.pop()
        directoryPath = pathParts.join('/')
        console.log(`[Invoice Image URL] Path appears to be a file. Directory: ${directoryPath}, File: ${fileName}`)
      }

      console.log(`[Invoice Image URL] Listing directory: ${directoryPath}${fileName ? `, looking for file: ${fileName}` : ', searching for any image file'}`)

      const { data: fileList, error: listError } = await supabase.storage
        .from('invoices')
        .list(directoryPath, {
          limit: 100,
          sortBy: { column: 'name', order: 'asc' }
        })

      if (listError) {
        console.error('[Invoice Image URL] Failed to list files at storage path:', listError)
        return NextResponse.json(
          { success: false, error: `Failed to list files: ${listError.message}` },
          { status: 500 }
        )
      }

      if (!fileList || fileList.length === 0) {
        console.error(`[Invoice Image URL] No files found in directory: ${directoryPath}`)
        return NextResponse.json(
          { success: false, error: 'No files found in directory' },
          { status: 404 }
        )
      }

      // Filter and sort image files
      const imageFiles = fileList
        .filter(file =>
          file.name.toLowerCase().endsWith('.png') ||
          file.name.toLowerCase().endsWith('.jpg') ||
          file.name.toLowerCase().endsWith('.jpeg')
        )
        .sort((a, b) => {
          // Sort by page number if present in filename
          const pageA = a.name.match(/page_?(\d+)/i)?.[1] || a.name.match(/_(\d+)\./)?.[1]
          const pageB = b.name.match(/page_?(\d+)/i)?.[1] || b.name.match(/_(\d+)\./)?.[1]

          if (pageA && pageB) {
            return parseInt(pageA) - parseInt(pageB)
          }

          // Fallback to alphabetical sort
          return a.name.localeCompare(b.name)
        })

      console.log(`[Invoice Image URL] Found ${imageFiles.length} image file(s): ${imageFiles.map(f => f.name).join(', ')}`)

      if (imageFiles.length === 0) {
        console.error(`[Invoice Image URL] No image files found. Available files: ${fileList.map(f => f.name).join(', ')}`)
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

      // Generate signed URL for the specific image file
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from('invoices')
        .createSignedUrl(fullImagePath, 3600) // 1 hour expiry

      if (urlError) {
        console.error('[Invoice Image URL] Failed to generate signed URL:', urlError)
        return NextResponse.json(
          { success: false, error: `Failed to generate signed URL: ${urlError.message}` },
          { status: 500 }
        )
      }

      if (!signedUrlData?.signedUrl) {
        return NextResponse.json(
          { success: false, error: 'No signed URL returned' },
          { status: 500 }
        )
      }

      console.log(`[Invoice Image URL] Generated signed URL successfully for: ${selectedImageFile.name}`)

      // Return enhanced response with page information
      return NextResponse.json({
        success: true,
        data: {
          imageUrl: signedUrlData.signedUrl,
          filename: selectedImageFile.name,
          storagePath: fullImagePath,
          // Page information
          currentPage: requestedPageIndex + 1,
          totalPages: imageFiles.length,
          availablePages: imageFiles.map((file, index) => ({
            pageNumber: index + 1,
            filename: file.name
          }))
        }
      })
    }

  } catch (error) {
    console.error('[Invoice Image URL] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}