/**
 * Document API Endpoints
 * Handles GET and DELETE operations for documents
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
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

    const resolvedParams = await params
    const documentId = resolvedParams.documentId
    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Document ID required' },
        { status: 400 }
      )
    }

    console.log(`[API] Fetching document ${documentId} for user ${userId}`)

    // Create Supabase client with service role
    const supabase = createServiceSupabaseClient()

    // Get document record and verify ownership
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select(`
        id,
        file_name,
        file_type,
        file_size,
        storage_path,
        converted_image_path,
        converted_image_width,
        converted_image_height,
        processing_status,
        created_at,
        processed_at,
        error_message,
        extracted_data,
        confidence_score,
        annotated_image_path
      `)
      .eq('id', documentId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !document) {
      console.error(`[API] Document fetch error:`, fetchError)
      return NextResponse.json(
        { success: false, error: 'Document not found or access denied' },
        { status: 404 }
      )
    }

    console.log(`[API] Successfully fetched document ${documentId}`)

    return NextResponse.json({
      success: true,
      data: document
    })

  } catch (error) {
    console.error('[API] Get document operation failed:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error while fetching document'
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
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

    const resolvedParams = await params
    const documentId = resolvedParams.documentId
    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Document ID required' },
        { status: 400 }
      )
    }

    console.log(`[API] Deleting document ${documentId} for user ${userId}`)

    // Create Supabase client with service role
    const supabase = createServiceSupabaseClient()

    // Get document record and verify ownership
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !document) {
      return NextResponse.json(
        { success: false, error: 'Document not found or access denied' },
        { status: 404 }
      )
    }

    // Delete files from Supabase Storage
    try {
      const filesToDelete = [document.storage_path]
      
      // Also delete converted image if it exists
      if (document.converted_image_path) {
        filesToDelete.push(document.converted_image_path)
        console.log(`[API] Will also delete converted image: ${document.converted_image_path}`)
      }
      
      // Also delete annotated image if it exists
      if (document.annotated_image_path) {
        filesToDelete.push(document.annotated_image_path)
        console.log(`[API] Will also delete annotated image: ${document.annotated_image_path}`)
      }

      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove(filesToDelete)

      if (storageError) {
        console.warn(`[API] Failed to delete files from storage: ${storageError.message}`)
        // Continue with database deletion even if storage deletion fails
      } else {
        console.log(`[API] Successfully deleted ${filesToDelete.length} files from storage`)
      }
    } catch (storageError) {
      console.warn(`[API] Storage deletion error:`, storageError)
      // Continue with database deletion
    }

    // Delete document record from database
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId)
      .eq('user_id', userId)

    if (deleteError) {
      console.error('[API] Database deletion failed:', deleteError)
      return NextResponse.json(
        { success: false, error: 'Failed to delete document from database' },
        { status: 500 }
      )
    }

    // TODO: Also delete from Qdrant vector database if implemented
    try {
      // This would require implementing vector deletion in the AI services
      // For now, we'll log this as a future enhancement
      console.log(`[API] TODO: Delete vector embedding for document ${documentId}`)
    } catch (vectorError) {
      console.warn(`[API] Vector deletion warning:`, vectorError)
      // Don't fail the deletion if vector cleanup fails
    }

    console.log(`[API] Successfully deleted document ${documentId}`)

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully'
    })

  } catch (error) {
    console.error('[API] Delete operation failed:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error during deletion'
      },
      { status: 500 }
    )
  }
}