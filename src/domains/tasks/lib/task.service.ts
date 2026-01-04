/**
 * Task Service Layer
 * Business logic for background task status tracking and document processing queries
 *
 * Migrated to Convex from Supabase
 */

import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

// Type Definitions

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

/**
 * Get task status by checking document processing status
 * Maps document processing status to task status for frontend polling
 */
export async function getTaskStatus(taskId: string, userId: string): Promise<TaskStatusResult> {
  if (!taskId) {
    throw new Error('Task ID is required')
  }

  // Get Convex client
  const { client: convexClient } = await getAuthenticatedConvex()
  if (!convexClient) {
    throw new Error('Failed to get Convex client')
  }

  // Query invoices by task ID using Convex query
  const document = await convexClient.query(api.functions.invoices.getByTaskId, {
    taskId
  })

  if (!document) {
    throw new Error('Document not found for this task')
  }

  // Map document processing status to task status
  // Convex status: pending | uploading | classifying | extracting | processing | completed | failed | cancelled | paid | overdue | classification_failed
  const isComplete = ['completed', 'failed', 'classification_failed'].includes(document.status)
  const isSuccess = document.status === 'completed'
  const requiresReview = document.requiresReview === true

  const result: TaskStatusResult = {
    task_id: taskId,
    status: document.status === 'failed' || document.status === 'classification_failed' ? 'failed' :
            ['pending', 'uploading', 'classifying', 'extracting', 'processing'].includes(document.status) ? 'running' : 'completed',
    processing_complete: isComplete,
    is_success: isSuccess,
    updated_at: document.updatedAt ? new Date(document.updatedAt).toISOString() : new Date(document._creationTime).toISOString()
  }

  // Include extraction result if completed successfully
  if (isSuccess && document.extractedData) {
    result.extraction_result = document.extractedData
    result.confidence_score = document.confidenceScore
    result.requires_validation = requiresReview
    result.document_id = document._id
    const processingMetadata = document.processingMetadata as Record<string, any> | undefined
    result.processing_time_ms = processingMetadata?.processing_time_ms || 0
  }

  // Include error information if failed
  if (document.status === 'failed' || document.status === 'classification_failed') {
    const errorMsg = document.errorMessage
    result.error = typeof errorMsg === 'string' ? errorMsg :
                   typeof errorMsg === 'object' && errorMsg?.message ? errorMsg.message :
                   'Processing failed without specific error'
  }

  return result
}
