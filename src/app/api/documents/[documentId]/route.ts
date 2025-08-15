/**
 * Document DELETE API Endpoint
 * Handles deletion of documents and their associated data
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'

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

    // Delete file from Supabase Storage
    try {
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([document.storage_path])

      if (storageError) {
        console.warn(`[API] Failed to delete file from storage: ${storageError.message}`)
        // Continue with database deletion even if storage deletion fails
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