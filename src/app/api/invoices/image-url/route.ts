/**
 * Document Image URL API Endpoint
 * Generates signed URLs for document images stored in Supabase
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

// ✅ PHASE 4J: Domain-to-bucket mapping for multi-bucket architecture
const DOMAIN_BUCKET_MAP: Record<string, string> = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims',
  'applications': 'application_documents',
  'application_documents': 'application_documents'  // Support both formats
};

// ✅ PHASE 4J: Bucket-to-table mapping for document verification
const BUCKET_TABLE_MAP: Record<string, string> = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims',
  'application_documents': 'application_documents'
};

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { storagePath, documentId, useRawFile = false, bucketName: requestedBucket, pageNumber = 1 } = body

    if (!storagePath || !documentId) {
      return NextResponse.json(
        { success: false, error: 'Storage path and document ID required' },
        { status: 400 }
      )
    }

    // ✅ PHASE 4J: Route to correct bucket (default to 'invoices' for backward compatibility)
    const bucketName = requestedBucket ? DOMAIN_BUCKET_MAP[requestedBucket] || 'invoices' : 'invoices'

    console.log(`[ImageURL] Generating signed URL for: ${storagePath} (useRawFile: ${useRawFile}, bucket: ${bucketName})`)

    // Create service Supabase client for user lookup and document access
    const supabase = createServiceSupabaseClient()

    // Convert Clerk user ID to Supabase UUID for document ownership verification
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !user) {
      console.error(`[ImageURL API] User lookup failed for clerk_user_id ${userId}:`, userError)
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const supabaseUserId = user.id

    // ✅ PHASE 4J: Route to correct table based on bucket for document verification
    const tableName = BUCKET_TABLE_MAP[bucketName] || 'invoices'
    console.log(`[ImageURL] Verifying document ownership in table: ${tableName}`)

    // Verify document ownership with correct user_id
    const { data: document, error: docError } = await supabase
      .from(tableName)  // ✅ PHASE 4J: Dynamic table routing based on bucket
      .select('id, user_id, converted_image_path')
      .eq('id', documentId)
      .eq('user_id', supabaseUserId)
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { success: false, error: 'Document not found or access denied' },
        { status: 404 }
      )
    }

    if (useRawFile) {
      // For raw files: use the exact storagePath sent from frontend
      console.log(`[ImageURL] Using raw file path: ${storagePath}`)

      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from(bucketName)  // ✅ PHASE 4J: Route to correct bucket dynamically
        .createSignedUrl(storagePath, 3600) // 1 hour expiry

      if (urlError) {
        console.error('[ImageURL] Failed to generate signed URL for raw file:', urlError)
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
      const filename = storagePath.split('/').pop() || 'document'
      console.log(`[ImageURL] Generated signed URL successfully for raw file: ${filename}`)

      return NextResponse.json({
        success: true,
        imageUrl: signedUrlData.signedUrl,
        filename: filename,
        storagePath: storagePath,
        // Raw files are single page
        currentPage: 1,
        totalPages: 1,
        availablePages: [{ pageNumber: 1, filename: filename }]
      })
    } else {
      // For converted images: check if we have a converted path, otherwise use raw file
      const actualStoragePath = document.converted_image_path || storagePath
      console.log(`[ImageURL] Using ${document.converted_image_path ? 'converted' : 'raw'} image path: ${actualStoragePath}`)

      // If there's no converted image path, try direct file access first
      if (!document.converted_image_path && actualStoragePath) {
        console.log(`[ImageURL] No converted image found, trying direct file access for: ${actualStoragePath}`)

        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(actualStoragePath, 3600) // 1 hour expiry

        if (!urlError && signedUrlData?.signedUrl) {
          console.log(`[ImageURL] Direct file access successful for: ${actualStoragePath}`)
          return NextResponse.json({
            success: true,
            imageUrl: signedUrlData.signedUrl,
            filename: actualStoragePath.split('/').pop() || 'document',
            storagePath: actualStoragePath,
            // Single direct file
            currentPage: 1,
            totalPages: 1,
            availablePages: [{ pageNumber: 1, filename: actualStoragePath.split('/').pop() || 'document' }]
          })
        } else {
          console.log(`[ImageURL] Direct file access failed, falling back to directory listing:`, urlError)
        }
      }

      // Fallback: Use unified bucket list() architecture to find actual image files
      console.log(`[ImageURL] Using unified bucket list() architecture to discover converted files`)

      // For converted images, the path might be a directory (like '1759860188642') rather than a full file path
      // Check if this looks like a directory path (no file extension)
      const hasFileExtension = /\.(png|jpg|jpeg|pdf)$/i.test(actualStoragePath)

      let directoryPath, fileName

      if (!hasFileExtension) {
        // This is likely a directory path, use it directly
        directoryPath = actualStoragePath
        fileName = null // We'll search for any image file
        console.log(`[ImageURL] Path appears to be a directory: ${directoryPath}`)
      } else {
        // This is a file path, extract directory and filename
        const pathParts = actualStoragePath.split('/')
        fileName = pathParts.pop()
        directoryPath = pathParts.join('/')
        console.log(`[ImageURL] Path appears to be a file. Directory: ${directoryPath}, File: ${fileName}`)
      }

      console.log(`[ImageURL] Listing directory: ${directoryPath}${fileName ? `, looking for file: ${fileName}` : ', searching for any image file'}`)

      const { data: fileList, error: listError } = await supabase.storage
        .from(bucketName)  // ✅ PHASE 4J: Route to correct bucket dynamically
        .list(directoryPath, {
          limit: 100,
          sortBy: { column: 'name', order: 'asc' }
        })

      if (listError) {
        console.error('[ImageURL] Failed to list files at storage path:', listError)
        return NextResponse.json(
          { success: false, error: `Failed to list files: ${listError.message}` },
          { status: 500 }
        )
      }

      if (!fileList || fileList.length === 0) {
        console.error(`[ImageURL] No files found in directory: ${directoryPath}`)
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

      console.log(`[ImageURL] Found ${imageFiles.length} image file(s): ${imageFiles.map(f => f.name).join(', ')}`)

      if (imageFiles.length === 0) {
        console.error(`[ImageURL] No image files found. Available files: ${fileList.map(f => f.name).join(', ')}`)
        return NextResponse.json(
          { success: false, error: `No image files found at ${actualStoragePath}` },
          { status: 404 }
        )
      }

      // Select the requested page (1-indexed)
      const requestedPageIndex = Math.max(0, Math.min(pageNumber - 1, imageFiles.length - 1))
      const selectedImageFile = imageFiles[requestedPageIndex]

      console.log(`[ImageURL] Selected page ${pageNumber} (index ${requestedPageIndex}): ${selectedImageFile.name}`)

      // Create full path for the selected image file
      const fullImagePath = `${directoryPath}/${selectedImageFile.name}`
      console.log(`[ImageURL] Creating signed URL for file: ${fullImagePath}`)

      // Generate signed URL for the specific image file
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from(bucketName)  // ✅ PHASE 4J: Route to correct bucket dynamically
        .createSignedUrl(fullImagePath, 3600) // 1 hour expiry

      if (urlError) {
        console.error('[ImageURL] Failed to generate signed URL:', urlError)
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

      console.log(`[ImageURL] Generated signed URL successfully for: ${selectedImageFile.name}`)

      // Return enhanced response with page information
      return NextResponse.json({
        success: true,
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
      })
    }

  } catch (error) {
    console.error('[ImageURL] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}