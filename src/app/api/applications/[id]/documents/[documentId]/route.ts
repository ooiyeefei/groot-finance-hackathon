/**
 * Application Document Management API
 * DELETE - Disassociate document from application while preserving file in storage
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'

export async function DELETE(
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

    const resolvedParams = await params
    const { id: applicationId, documentId } = resolvedParams

    if (!applicationId || !documentId) {
      return NextResponse.json(
        { success: false, error: 'Application ID and Document ID required' },
        { status: 400 }
      )
    }

    console.log(`[API] Disassociating document ${documentId} from application ${applicationId} for user ${userId}`)

    // Use service client for reliable access (API-level security)
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

    // First verify the document belongs to this user and application
    // Include soft-deleted documents since disassociation should work on them too
    const { data: document, error: fetchError } = await supabase
      .from('application_documents')  // ✅ PHASE 4E: Routed to application_documents
      .select('id, file_name, application_id, user_id, storage_path, business_id, deleted_at')
      .eq('id', documentId)
      .eq('application_id', applicationId)
      .single()

    // API-level security: Verify ownership
    if (fetchError || !document) {
      console.error(`[API] Document fetch failed:`, fetchError, `for document ${documentId} and application ${applicationId}`)
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    console.log(`[API] Document found: ${document.id}, user_id: ${document.user_id}, business_id: ${document.business_id}, deleted_at: ${document.deleted_at}`)

    if (document.deleted_at) {
      console.log(`[API] Document is deleted but proceeding with disassociation`)
    }

    // Check if user owns the document directly OR has business access
    let hasAccess = false

    if (document.user_id === supabaseUserId) {
      console.log(`[API] Direct document ownership verified for user ${supabaseUserId}`)
      hasAccess = true
    } else if (document.business_id) {
      // Check business membership if document belongs to a business
      const { data: membership, error: memberError } = await supabase
        .from('business_memberships')
        .select('business_id')
        .eq('user_id', supabaseUserId)
        .eq('business_id', document.business_id)
        .eq('status', 'active')
        .single()

      console.log(`[API] Business membership check:`, { membership, memberError, supabaseUserId, businessId: document.business_id })

      if (membership && !memberError) {
        console.log(`[API] Business access verified for user ${supabaseUserId} in business ${document.business_id}`)
        hasAccess = true
      } else {
        console.error(`[API] Business membership failed - user ${supabaseUserId} has no active membership in business ${document.business_id}:`, memberError)
      }
    }

    if (!hasAccess) {
      console.error(`[API] Access denied - user ${supabaseUserId} cannot access document ${documentId}`)
      return NextResponse.json(
        { success: false, error: 'Document not found or access denied' },
        { status: 404 }
      )
    }

    console.log(`[API] Document verified: ${document.file_name}`)

    // ✅ PHASE 4K: Proper soft delete - only set deleted_at timestamp
    // Keep application_id and document_slot intact for audit trail
    // The file in storage is preserved (we're not deleting from storage bucket)
    const { error: softDeleteError } = await supabase
      .from('application_documents')  // ✅ PHASE 4E: Routed to application_documents
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId)
      .eq('user_id', supabaseUserId)

    if (softDeleteError) {
      console.error('[API] Document soft delete failed:', softDeleteError)
      return NextResponse.json(
        { success: false, error: 'Failed to remove document from application' },
        { status: 500 }
      )
    }

    console.log(`[API] Successfully soft deleted document ${documentId} (application_id and document_slot preserved for audit trail)`)
    console.log(`[API] Document file preserved in storage at: ${document.storage_path}`)

    return NextResponse.json({
      success: true,
      message: 'Document removed from application successfully',
      preserved_file: document.storage_path
    })

  } catch (error) {
    console.error('[API] Application document disassociation failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error during document removal'
      },
      { status: 500 }
    )
  }
}