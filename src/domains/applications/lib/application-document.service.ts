/**
 * Application Document Service Layer
 * Business logic for document operations within applications
 */

import type {
  ApplicationDocument,
  UploadDocumentResponse
} from '../types/application.types'

// ============================================================================
// List Documents
// ============================================================================

/**
 * Retrieves all documents for a specific application
 *
 * @param applicationId - UUID of the application
 * @returns Promise with array of documents
 */
export async function listDocuments(
  applicationId: string
): Promise<ApplicationDocument[]> {
  // TODO: Implement in Step 9
  // - Validate application ID
  // - Check user access to application
  // - Fetch documents with RLS filtering
  // - Filter out soft-deleted documents
  // - Order by slot_position

  throw new Error('Not implemented yet')
}

// ============================================================================
// Upload Document
// ============================================================================

/**
 * Uploads a document to a specific application slot
 *
 * @param applicationId - UUID of the application
 * @param file - File to upload
 * @param slot - Document slot identifier
 * @returns Promise with upload response including document ID
 */
export async function uploadDocument(
  applicationId: string,
  file: File,
  slot: string
): Promise<UploadDocumentResponse> {
  // TODO: Implement in Step 8
  // - Validate inputs
  // - Check application ownership and status (must be draft)
  // - Check if slot exists in application type
  // - Handle replacement if slot already filled
  // - Generate storage path
  // - Upload to Supabase Storage
  // - Create/update document record
  // - Trigger Trigger.dev processing pipeline
  // - Return upload response

  throw new Error('Not implemented yet')
}

// ============================================================================
// Delete Document
// ============================================================================

/**
 * Soft deletes a document from an application
 *
 * @param applicationId - UUID of the application
 * @param documentId - UUID of the document
 * @returns Promise<void>
 */
export async function deleteDocument(
  applicationId: string,
  documentId: string
): Promise<void> {
  // TODO: Implement in Step 10
  // - Validate IDs
  // - Check user access
  // - Check if application is in draft status
  // - Soft delete document (set deleted_at timestamp)
  // - Preserve file in storage

  throw new Error('Not implemented yet')
}

// ============================================================================
// Reprocess Document
// ============================================================================

/**
 * Triggers reprocessing of a document through the AI pipeline
 *
 * @param applicationId - UUID of the application
 * @param documentId - UUID of the document
 * @returns Promise<void>
 */
export async function reprocessDocument(
  applicationId: string,
  documentId: string
): Promise<void> {
  // TODO: Implement in Step 11
  // - Validate IDs
  // - Check user access
  // - Fetch document metadata
  // - Reset processing status to 'pending'
  // - Trigger appropriate Trigger.dev task based on file type
  // - Update document with new task ID

  throw new Error('Not implemented yet')
}
