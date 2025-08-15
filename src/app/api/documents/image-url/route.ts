/**
 * Document Image URL API Endpoint
 * Generates signed URLs for document images stored in Supabase
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'

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
    const { storagePath, documentId } = body

    if (!storagePath || !documentId) {
      return NextResponse.json(
        { success: false, error: 'Storage path and document ID required' },
        { status: 400 }
      )
    }

    console.log(`[ImageURL] Generating signed URL for: ${storagePath}`)

    // Create Supabase client with service role
    const supabase = createServiceSupabaseClient()

    // Verify document ownership
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, user_id')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { success: false, error: 'Document not found or access denied' },
        { status: 404 }
      )
    }

    // Generate signed URL for the image
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 3600) // 1 hour expiry

    if (urlError) {
      console.error('[ImageURL] Failed to generate signed URL:', urlError)
      return NextResponse.json(
        { success: false, error: 'Failed to generate image URL' },
        { status: 500 }
      )
    }

    if (!signedUrlData?.signedUrl) {
      return NextResponse.json(
        { success: false, error: 'No signed URL returned' },
        { status: 500 }
      )
    }

    console.log(`[ImageURL] Generated signed URL successfully`)

    return NextResponse.json({
      success: true,
      imageUrl: signedUrlData.signedUrl
    })

  } catch (error) {
    console.error('[ImageURL] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}