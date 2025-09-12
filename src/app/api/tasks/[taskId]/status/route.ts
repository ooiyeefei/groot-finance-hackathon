import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'

/**
 * Task Status API - Checks document processing status
 * Used by frontend to check DSPy extraction progress
 * Uses document status from database rather than Trigger.dev API
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { taskId } = await params
    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'Task ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Check if this is a document ID (for DSPy processing, we track by task ID in processing_metadata)
    // Since Trigger.dev task IDs are not UUIDs, we only search by processing_metadata
    const { data: documents, error: searchError } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .eq('processing_metadata->>task_id', taskId)

    if (searchError) {
      console.error('[Task Status API] Database error:', searchError)
      return NextResponse.json(
        { success: false, error: 'Failed to check task status' },
        { status: 500 }
      )
    }

    const document = documents?.[0]
    if (!document) {
      return NextResponse.json(
        { success: false, error: 'Document not found for this task' },
        { status: 404 }
      )
    }

    // Map document processing status to task status
    const isComplete = ['completed', 'failed', 'requires_validation'].includes(document.processing_status)
    const isSuccess = ['completed', 'requires_validation'].includes(document.processing_status)
    
    const response: any = {
      success: true,
      data: {
        task_id: taskId,
        status: document.processing_status === 'failed' ? 'failed' : 
               document.processing_status === 'processing' ? 'running' : 'completed',
        processing_complete: isComplete,
        is_success: isSuccess,
        updated_at: document.updated_at
      }
    }

    // If completed successfully, include the extraction result
    if (isSuccess && document.extracted_data) {
      response.data.extraction_result = document.extracted_data
      response.data.confidence_score = document.confidence_score
      response.data.requires_validation = document.processing_status === 'requires_validation'
      response.data.document_id = document.id
      response.data.processing_time_ms = document.processing_metadata?.processing_time_ms || 0
    }

    // If failed, include error information
    if (document.processing_status === 'failed') {
      response.data.error = document.error_message || 'Processing failed without specific error'
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('[Task Status API] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get task status' 
      },
      { status: 500 }
    )
  }
}