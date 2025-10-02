/**
 * Utility to reset stuck documents for testing
 * Use this to reset documents that are stuck in 'classifying' or other intermediate states
 */

import { supabase } from './db-helpers';

export async function resetStuckDocument(documentId: string): Promise<void> {
  console.log(`[Reset] Resetting stuck document: ${documentId}`);

  const updateData = {
    processing_status: 'pending',
    error_message: null,
    processed_at: null,
    failed_at: null,
    processing_started_at: null,
    document_type: null,
    document_classification_confidence: null,
    classification_method: null,
    classification_task_id: null,
    extraction_task_id: null
  };

  const { error } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', documentId);

  if (error) {
    throw new Error(`Failed to reset document: ${error.message}`);
  }

  console.log(`[Reset] Successfully reset document ${documentId} to pending state`);
}

export async function resetAllStuckDocuments(): Promise<string[]> {
  console.log('[Reset] Finding all stuck documents...');

  // Find documents stuck in intermediate states
  const { data: stuckDocuments, error: fetchError } = await supabase
    .from('documents')
    .select('id, processing_status, created_at')
    .in('processing_status', ['classifying', 'pending_extraction', 'extracting', 'processing'])
    .lt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // Older than 5 minutes

  if (fetchError) {
    throw new Error(`Failed to fetch stuck documents: ${fetchError.message}`);
  }

  if (!stuckDocuments || stuckDocuments.length === 0) {
    console.log('[Reset] No stuck documents found');
    return [];
  }

  console.log(`[Reset] Found ${stuckDocuments.length} stuck documents:`,
    stuckDocuments.map(d => `${d.id} (${d.processing_status})`));

  // Reset all stuck documents
  const resetIds = stuckDocuments.map(d => d.id);

  const updateData = {
    processing_status: 'pending',
    error_message: 'Reset due to stuck state',
    processed_at: null,
    failed_at: null,
    processing_started_at: null,
    document_type: null,
    document_classification_confidence: null,
    classification_method: null,
    classification_task_id: null,
    extraction_task_id: null
  };

  const { error: resetError } = await supabase
    .from('documents')
    .update(updateData)
    .in('id', resetIds);

  if (resetError) {
    throw new Error(`Failed to reset stuck documents: ${resetError.message}`);
  }

  console.log(`[Reset] Successfully reset ${resetIds.length} stuck documents`);
  return resetIds;
}

// Quick helper for your specific stuck document
export async function resetDocument6729(): Promise<void> {
  await resetStuckDocument('6729d6bd-faf7-4aa7-8740-e0392770acb5');
}