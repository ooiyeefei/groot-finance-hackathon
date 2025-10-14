/**
 * Task Service Layer
 *
 * Business logic for background task status tracking:
 * - Trigger.dev task status polling
 * - Document processing status queries
 * - AI extraction progress tracking
 *
 * North Star Architecture:
 * - All business logic centralized in service layer
 * - API routes are thin wrappers handling HTTP concerns
 *
 * Use Case:
 * - Frontend polls for background job completion
 * - Links to DSPy extraction, PDF conversion, OCR processing
 */

import { createAuthenticatedSupabaseClient } from '@/lib/db/supabase-server'

// ===== TYPE DEFINITIONS =====

export interface TaskStatusResult {
  task_id: string
  status: 'running' | 'completed' | 'failed'
  processing_complete: boolean
  is_success: boolean
  updated_at: string
  extraction_result?: any
  confidence_score?: number
  requires_validation?: boolean
  document_id?: string
  processing_time_ms?: number
  error?: string
}

// ===== CORE SERVICE FUNCTIONS =====

/**
 * Get Task Status
 *
 * Checks document processing status by task ID.
 * Maps document processing status to task status for frontend polling.
 *
 * @param taskId - Trigger.dev task ID stored in document processing_metadata
 * @param userId - Clerk user ID for authentication
 * @returns Task status with processing details
 * @throws Error if task not found or database query fails
 */
export async function getTaskStatus(taskId: string, userId: string): Promise<TaskStatusResult> {
  if (!taskId) {
    throw new Error('Task ID is required')
  }

  const supabase = await createAuthenticatedSupabaseClient(userId)

  // Query documents by task ID in processing_metadata
  const { data: documents, error: searchError } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .eq('processing_metadata->>task_id', taskId)

  if (searchError) {
    console.error('[Task Service] Database error:', searchError)
    throw new Error('Failed to check task status')
  }

  const document = documents?.[0]
  if (!document) {
    throw new Error('Document not found for this task')
  }

  // Map document processing status to task status
  const isComplete = ['completed', 'failed', 'requires_validation'].includes(document.processing_status)
  const isSuccess = ['completed', 'requires_validation'].includes(document.processing_status)

  const result: TaskStatusResult = {
    task_id: taskId,
    status: document.processing_status === 'failed' ? 'failed' :
            document.processing_status === 'processing' ? 'running' : 'completed',
    processing_complete: isComplete,
    is_success: isSuccess,
    updated_at: document.updated_at
  }

  // Include extraction result if completed successfully
  if (isSuccess && document.extracted_data) {
    result.extraction_result = document.extracted_data
    result.confidence_score = document.confidence_score
    result.requires_validation = document.processing_status === 'requires_validation'
    result.document_id = document.id
    result.processing_time_ms = document.processing_metadata?.processing_time_ms || 0
  }

  // Include error information if failed
  if (document.processing_status === 'failed') {
    result.error = document.error_message || 'Processing failed without specific error'
  }

  return result
}
