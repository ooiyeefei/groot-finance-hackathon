/**
 * Individual Application API Routes
 * GET - Fetch single application with slot status
 * PUT - Update application details
 * DELETE - Delete draft application (documents preserved and disassociated)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAuthenticatedSupabaseClient, getUserData } from '@/lib/supabase-server'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/applications/[id] - Fetch single application with slot details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    console.log(`[Applications API GET] User ${userId} accessing application ${id}`)

    // Get user data for explicit security filtering
    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Fetch application with related data and EXPLICIT user filtering
    const { data: application, error } = await supabase
      .from('applications')
      .select(`
        *,
        application_types!inner (
          type_code,
          display_name,
          description,
          required_documents
        ),
        documents (
          id,
          document_slot,
          slot_position,
          file_name,
          storage_path,
          converted_image_path,
          processing_status,
          document_type,
          document_classification_confidence,
          error_message,
          extracted_data,
          created_at,
          updated_at
        )
      `)
      .eq('id', id)
      .eq('user_id', userData.id) // 🛡️ EXPLICIT USER ISOLATION
      .is('documents.deleted_at', null)
      .single()

    if (error) {
      console.error('[Applications API GET] Error fetching application:', error)
      return NextResponse.json(
        { success: false, error: 'Application not found or access denied' },
        { status: 404 }
      )
    }

    // Transform data to include detailed slot status
    const requiredDocuments = Array.isArray(application.application_types.required_documents)
      ? application.application_types.required_documents
      : []

    // Create detailed slot information
    const slotDetails = requiredDocuments.map((reqDoc: any) => {
      // Handle grouped documents (like payslips)
      if (reqDoc.group_slots && Array.isArray(reqDoc.group_slots)) {
        // Find all documents in this group
        const groupDocuments = reqDoc.group_slots
          .map((slot: string) => application.documents.find((doc: any) => doc.document_slot === slot))
          .filter(Boolean)

        // Determine group status based on all documents
        let groupStatus = 'empty'
        if (groupDocuments.length > 0) {
          const allCompleted = groupDocuments.every((doc: any) => doc.processing_status === 'completed')
          const anyProcessing = groupDocuments.some((doc: any) =>
            ['pending', 'classifying', 'pending_extraction', 'extracting'].includes(doc.processing_status)
          )
          const anyFailed = groupDocuments.some((doc: any) =>
            ['failed', 'classification_failed'].includes(doc.processing_status)
          )

          if (allCompleted && groupDocuments.length === reqDoc.group_slots.length) {
            groupStatus = 'completed'
          } else if (anyProcessing) {
            groupStatus = 'processing'
          } else if (anyFailed) {
            groupStatus = 'error'
          } else {
            groupStatus = 'partial'
          }
        }

        return {
          slot: reqDoc.slot,
          display_name: reqDoc.display_name,
          description: reqDoc.description,
          is_critical: reqDoc.is_critical,
          document_type: reqDoc.document_type,
          status: groupStatus,
          group_slots: reqDoc.group_slots,
          group_documents: groupDocuments.map((doc: any) => ({
            id: doc.id,
            file_name: doc.file_name,
            storage_path: doc.storage_path,
            converted_image_path: doc.converted_image_path,
            processing_status: doc.processing_status,
            document_type: doc.document_type,
            classification_confidence: doc.document_classification_confidence,
            error_message: doc.error_message,
            extracted_data: doc.extracted_data,
            uploaded_at: doc.created_at,
            updated_at: doc.updated_at
          })),
          document: null // For group documents, we don't have a single document
        }
      }

      // Handle individual documents
      const document = application.documents.find((doc: any) => doc.document_slot === reqDoc.slot)

      let slotStatus = 'empty'
      if (document) {
        switch (document.processing_status) {
          case 'pending':
          case 'classifying':
          case 'pending_extraction':
          case 'extracting':
            slotStatus = 'processing'
            break
          case 'completed':
            slotStatus = 'completed'
            break
          case 'failed':
          case 'classification_failed':
            slotStatus = 'error'
            break
          default:
            slotStatus = document.processing_status || 'empty'
        }
      }

      return {
        slot: reqDoc.slot,
        display_name: reqDoc.display_name,
        description: reqDoc.description,
        is_critical: reqDoc.is_critical,
        document_type: reqDoc.document_type,
        status: slotStatus,
        document: document ? {
          id: document.id,
          file_name: document.file_name,
          storage_path: document.storage_path,
          converted_image_path: document.converted_image_path,
          processing_status: document.processing_status,
          document_type: document.document_type,
          classification_confidence: document.document_classification_confidence,
          error_message: document.error_message,
          extracted_data: document.extracted_data,
          uploaded_at: document.created_at,
          updated_at: document.updated_at
        } : null
      }
    })

    // Calculate progress statistics
    const completedSlots = slotDetails.filter((slot: any) => slot.status === 'completed').length
    const criticalSlots = slotDetails.filter((slot: any) => slot.is_critical)
    const completedCriticalSlots = criticalSlots.filter((slot: any) => slot.status === 'completed').length
    const canSubmit = completedCriticalSlots === criticalSlots.length

    const enrichedApplication = {
      ...application,
      slot_details: slotDetails,
      progress_stats: {
        total_slots: slotDetails.length,
        completed_slots: completedSlots,
        critical_slots: criticalSlots.length,
        completed_critical_slots: completedCriticalSlots,
        can_submit: canSubmit,
        progress_percentage: Math.round((completedSlots / slotDetails.length) * 100)
      }
    }

    return NextResponse.json({
      success: true,
      data: enrichedApplication
    })

  } catch (error) {
    console.error('[Applications API GET] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/applications/[id] - Update application details
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await request.json()

    console.log(`[Applications API PUT] User ${userId} updating application ${id}`)

    // Get user data for explicit security filtering
    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Check if application exists and is accessible with EXPLICIT user filtering
    const { data: existingApp, error: fetchError } = await supabase
      .from('applications')
      .select('id, status, user_id')
      .eq('id', id)
      .eq('user_id', userData.id) // 🛡️ EXPLICIT USER ISOLATION
      .single()

    if (fetchError || !existingApp) {
      return NextResponse.json(
        { success: false, error: 'Application not found or access denied' },
        { status: 404 }
      )
    }

    // Only allow editing draft applications
    if (existingApp.status !== 'draft') {
      return NextResponse.json(
        { success: false, error: 'Cannot edit submitted applications' },
        { status: 400 }
      )
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (body.title) updateData.title = body.title
    if (body.description !== undefined) updateData.description = body.description

    // Update the application
    const { data: updatedApp, error: updateError } = await supabase
      .from('applications')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        application_types!inner (
          type_code,
          display_name,
          description,
          required_documents
        )
      `)
      .single()

    if (updateError) {
      console.error('[Applications API PUT] Error updating application:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update application' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: updatedApp,
      message: 'Application updated successfully'
    })

  } catch (error) {
    console.error('[Applications API PUT] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/applications/[id] - Delete draft application
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    console.log(`[Applications API DELETE] User ${userId} deleting application ${id}`)

    // Get user data for explicit security filtering
    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Check if application exists and is accessible with EXPLICIT user filtering
    const { data: existingApp, error: fetchError } = await supabase
      .from('applications')
      .select('id, status, user_id')
      .eq('id', id)
      .eq('user_id', userData.id) // 🛡️ EXPLICIT USER ISOLATION
      .single()

    if (fetchError || !existingApp) {
      return NextResponse.json(
        { success: false, error: 'Application not found or access denied' },
        { status: 404 }
      )
    }

    // Only allow deleting draft applications
    if (existingApp.status !== 'draft') {
      return NextResponse.json(
        { success: false, error: 'Only draft applications can be deleted' },
        { status: 400 }
      )
    }

    // Disassociate documents from application (preserve documents, clear application_id)
    const { error: documentsError } = await supabase
      .from('application_documents')  // ✅ PHASE 4G: Fixed DELETE endpoint
      .update({
        application_id: null,
        document_slot: null,
        updated_at: new Date().toISOString()
      })
      .eq('application_id', id)

    if (documentsError) {
      console.error('[Applications API DELETE] Error disassociating documents:', documentsError)
      // Continue with application deletion even if document disassociation fails
    } else {
      console.log(`[Applications API DELETE] Successfully disassociated documents from application ${id}`)
    }

    // Delete the application
    const { error: deleteError } = await supabase
      .from('applications')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('[Applications API DELETE] Error deleting application:', deleteError)
      return NextResponse.json(
        { success: false, error: 'Failed to delete application' },
        { status: 500 }
      )
    }

    console.log(`[Applications API DELETE] Successfully deleted application ${id} and disassociated documents`)

    return NextResponse.json({
      success: true,
      message: 'Application deleted successfully (documents preserved)'
    })

  } catch (error) {
    console.error('[Applications API DELETE] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}