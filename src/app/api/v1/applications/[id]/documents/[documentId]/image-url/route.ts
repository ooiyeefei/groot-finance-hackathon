/**
 * GET /api/v1/applications/[id]/documents/[documentId]/image-url
 * Generate signed URLs for application document images
 * Domain-specific endpoint for applications, separate from invoices domain
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/db/supabase-server'
import { getUserData } from '@/lib/db/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: applicationId, documentId } = await params

    // Get query parameters for optional settings
    const { searchParams } = new URL(request.url)
    const useRawFile = searchParams.get('useRawFile') === 'true'
    const pageNumber = parseInt(searchParams.get('pageNumber') || '1')
    const storagePath = searchParams.get('storagePath') // Optional override

    console.log(
      `[Application Document Image URL] Generating signed URL for application: ${applicationId}, document: ${documentId} (useRawFile: ${useRawFile}, page: ${pageNumber})`
    )

    // Get user data with business context
    const userData = await getUserData(userId)
    const supabase = createServiceSupabaseClient()

    // First verify application ownership and get application details
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, user_id')
      .eq('id', applicationId)
      .eq('user_id', userData.id)
      .single()

    if (appError || !application) {
      return NextResponse.json(
        { success: false, error: 'Application not found or access denied' },
        { status: 404 }
      )
    }

    // Verify document ownership and get document details
    const { data: document, error: documentError } = await supabase
      .from('application_documents')
      .select('id, user_id, storage_path, converted_image_path, file_name, file_type')
      .eq('id', documentId)
      .eq('user_id', userData.id)
      .eq('application_id', applicationId)
      .single()

    if (documentError || !document) {
      return NextResponse.json(
        { success: false, error: 'Document not found or access denied' },
        { status: 404 }
      )
    }

    // Determine the actual storage path to use
    let actualStoragePath = storagePath || document.storage_path

    if (!actualStoragePath) {
      return NextResponse.json(
        { success: false, error: 'No storage path available for this document' },
        { status: 400 }
      )
    }

    if (useRawFile) {
      // For raw files: use the exact storagePath
      console.log(`[Application Document Image URL] Using raw file path: ${actualStoragePath}`)

      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from('application_documents')
        .createSignedUrl(actualStoragePath, 3600) // 1 hour expiry

      if (urlError) {
        console.error('[Application Document Image URL] Failed to generate signed URL for raw file:', urlError)
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
      const filename = actualStoragePath.split('/').pop() || 'document'
      console.log(`[Application Document Image URL] Generated signed URL successfully for raw file: ${filename}`)

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
      const convertedPath = document.converted_image_path || actualStoragePath
      console.log(`[Application Document Image URL] Using ${document.converted_image_path ? 'converted' : 'raw'} image path: ${convertedPath}`)

      // If we have a converted_image_path, it's likely a folder - go straight to directory listing
      // If no converted path, try direct file access first for raw files
      if (!document.converted_image_path && convertedPath) {
        console.log(`[Application Document Image URL] No converted image found, trying direct file access for: ${convertedPath}`)

        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from('application_documents')
          .createSignedUrl(convertedPath, 3600) // 1 hour expiry

        if (!urlError && signedUrlData?.signedUrl) {
          console.log(`[Application Document Image URL] Direct file access successful for: ${convertedPath}`)
          return NextResponse.json({
            success: true,
            data: {
              imageUrl: signedUrlData.signedUrl,
              filename: convertedPath.split('/').pop() || 'document',
              storagePath: convertedPath,
              // Single direct file
              currentPage: 1,
              totalPages: 1,
              availablePages: [{ pageNumber: 1, filename: convertedPath.split('/').pop() || 'document' }]
            }
          })
        } else {
          console.log(`[Application Document Image URL] Direct file access failed, falling back to directory listing:`, urlError)
        }
      }

      // Fallback: Use directory listing architecture to find actual image files
      console.log(`[Application Document Image URL] Using directory list() to discover converted files`)

      // For converted images, the path might be a directory (like '1759860188642') rather than a full file path
      // Check if this looks like a directory path (no file extension)
      const hasFileExtension = /\.(png|jpg|jpeg|pdf)$/i.test(convertedPath)

      let directoryPath, fileName

      if (!hasFileExtension) {
        // This is likely a directory path, use it directly
        directoryPath = convertedPath
        fileName = null // We'll search for any image file
        console.log(`[Application Document Image URL] Path appears to be a directory: ${directoryPath}`)
      } else {
        // This is a file path, extract directory and filename
        const pathParts = convertedPath.split('/')
        fileName = pathParts.pop()
        directoryPath = pathParts.join('/')
        console.log(`[Application Document Image URL] Path appears to be a file. Directory: ${directoryPath}, File: ${fileName}`)
      }

      console.log(`[Application Document Image URL] Listing directory: ${directoryPath}${fileName ? `, looking for file: ${fileName}` : ', searching for any image file'}`)

      const { data: fileList, error: listError } = await supabase.storage
        .from('application_documents')
        .list(directoryPath, {
          limit: 100,
          sortBy: { column: 'name', order: 'asc' }
        })

      if (listError) {
        console.error('[Application Document Image URL] Failed to list files at storage path:', listError)
        return NextResponse.json(
          { success: false, error: `Failed to list files: ${listError.message}` },
          { status: 500 }
        )
      }

      if (!fileList || fileList.length === 0) {
        console.error(`[Application Document Image URL] No files found in directory: ${directoryPath}`)
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

      console.log(`[Application Document Image URL] Found ${imageFiles.length} image file(s): ${imageFiles.map(f => f.name).join(', ')}`)

      if (imageFiles.length === 0) {
        console.error(`[Application Document Image URL] No image files found. Available files: ${fileList.map(f => f.name).join(', ')}`)
        return NextResponse.json(
          { success: false, error: `No image files found at ${convertedPath}` },
          { status: 404 }
        )
      }

      // Select the requested page (1-indexed)
      const requestedPageIndex = Math.max(0, Math.min(pageNumber - 1, imageFiles.length - 1))
      const selectedImageFile = imageFiles[requestedPageIndex]

      console.log(`[Application Document Image URL] Selected page ${pageNumber} (index ${requestedPageIndex}): ${selectedImageFile.name}`)

      // Create full path for the selected image file
      const fullImagePath = `${directoryPath}/${selectedImageFile.name}`
      console.log(`[Application Document Image URL] Creating signed URL for file: ${fullImagePath}`)

      // Generate signed URL for the specific image file
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from('application_documents')
        .createSignedUrl(fullImagePath, 3600) // 1 hour expiry

      if (urlError) {
        console.error('[Application Document Image URL] Failed to generate signed URL:', urlError)
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

      console.log(`[Application Document Image URL] Generated signed URL successfully for: ${selectedImageFile.name}`)

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
    console.error('[Application Document Image URL] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}