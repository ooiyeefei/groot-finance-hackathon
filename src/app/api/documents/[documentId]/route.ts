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

    console.log(`[API] Fetching document ${documentId} - Clerk ID: ${userId}`)

    // Create Supabase client with service role
    const supabase = createServiceSupabaseClient()

    // Convert Clerk user ID to Supabase UUID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !user) {
      console.error(`[API] User lookup failed for clerk_user_id ${userId}:`, userError)
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const supabaseUserId = user.id
    console.log(`[API] Converted Clerk ID ${userId} to Supabase UUID ${supabaseUserId}`)

    // Get document record and verify ownership (exclude deleted documents)
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
      .eq('user_id', supabaseUserId)
      .is('deleted_at', null)
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

    console.log(`[API] Deleting document ${documentId} - Clerk ID: ${userId}`)

    // Create Supabase client with service role
    const supabase = createServiceSupabaseClient()

    // Convert Clerk user ID to Supabase UUID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !user) {
      console.error(`[API] User lookup failed for clerk_user_id ${userId}:`, userError)
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const supabaseUserId = user.id
    console.log(`[API] Converted Clerk ID ${userId} to Supabase UUID ${supabaseUserId}`)

    // Get document record and verify ownership (exclude deleted documents)
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', supabaseUserId)
      .is('deleted_at', null)
      .single()

    if (fetchError || !document) {
      return NextResponse.json(
        { success: false, error: 'Document not found or access denied' },
        { status: 404 }
      )
    }

    const deletedAt = new Date().toISOString()

    // Soft delete document record from database first
    // Also clear application association when deleting
    // Use the document's actual user_id (could be either Supabase UUID or legacy Clerk ID)
    const { error: deleteError } = await supabase
      .from('documents')
      .update({
        deleted_at: deletedAt,
        updated_at: deletedAt,
        application_id: null,
        document_slot: null,
        slot_position: null
      })
      .eq('id', documentId)
      .eq('user_id', document.user_id)

    if (deleteError) {
      console.error('[API] Database soft deletion failed:', deleteError)
      return NextResponse.json(
        { success: false, error: 'Failed to delete document from database' },
        { status: 500 }
      )
    }

    // Also soft delete any associated transactions
    const { error: transactionDeleteError } = await supabase
      .from('transactions')
      .update({ 
        deleted_at: deletedAt,
        updated_at: deletedAt
      })
      .eq('document_id', documentId)
      .is('deleted_at', null) // Only soft delete non-deleted transactions

    if (transactionDeleteError) {
      console.error('[API] Failed to soft delete associated transactions:', transactionDeleteError)
      // Continue since document was successfully deleted
    }

    // Note: Files are kept in storage for potential recovery
    // TODO: Implement scheduled cleanup job for files of soft-deleted documents older than retention period
    console.log(`[API] Document ${documentId} soft deleted - files preserved for recovery`)

    // Optional: Delete files from Supabase Storage immediately (uncomment if desired)
    /*
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
      } else {
        console.log(`[API] Successfully deleted ${filesToDelete.length} files from storage`)
      }
    } catch (storageError) {
      console.warn(`[API] Storage deletion error:`, storageError)
    }
    */

    // TODO: Also soft delete from Qdrant vector database if implemented
    try {
      // This would require implementing vector soft deletion in the AI services
      // For now, we'll log this as a future enhancement
      console.log(`[API] TODO: Soft delete vector embedding for document ${documentId}`)
    } catch (vectorError) {
      console.warn(`[API] Vector soft deletion warning:`, vectorError)
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