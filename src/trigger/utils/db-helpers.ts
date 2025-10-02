/**
 * Shared Database Helpers for Trigger.dev Tasks
 * Eliminates code duplication across extraction tasks
 */

import { createClient } from '@supabase/supabase-js';

// Validate environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing required Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface ExtractionResult {
  success: boolean;
  document_type?: string;
  extracted_data?: any;
  confidence_score?: number;
  extraction_method?: string;
  model_used?: string;
  metadata?: any;
  error?: string;
  error_type?: string;
}

export async function updateDocumentStatus(
  documentId: string,
  status: string,
  errorMessage?: string
): Promise<void> {
  const updateData: any = {
    processing_status: status
  };

  // Only update processing_started_at for initial status changes
  if (status === 'classifying' || status === 'extracting' || status === 'processing') {
    updateData.processing_started_at = new Date().toISOString();
  }

  // Add error message if provided
  if (errorMessage) {
    updateData.error_message = errorMessage;
  }

  // Set completion/failure timestamps
  if (status === 'completed' || status === 'failed' || status === 'classification_failed') {
    updateData.processed_at = new Date().toISOString();
  }

  // Set failed_at timestamp for failure statuses
  if (status === 'failed' || status === 'classification_failed') {
    updateData.failed_at = new Date().toISOString();
  }

  console.log(`[DB] Updating document ${documentId} status to: ${status}`, updateData);

  const { error } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', documentId);

  if (error) {
    console.error(`[DB] Failed to update document status:`, error);
    throw new Error(`Failed to update document status: ${error.message}`);
  }

  console.log(`[DB] Successfully updated document ${documentId} status to: ${status}`);
}

export async function updateExtractionResults(
  documentId: string,
  result: ExtractionResult
): Promise<void> {
  const updateData: any = {
    processing_status: 'completed',
    extracted_data: result.extracted_data,
    confidence_score: result.confidence_score,
    processed_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', documentId);

  if (error) {
    throw new Error(`Failed to update extraction results: ${error.message}`);
  }
}

export async function fetchDocumentImage(documentId: string): Promise<string> {
  try {
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('storage_path, file_type, converted_image_path')
      .eq('id', documentId)
      .single();

    if (fetchError || !document) {
      throw new Error(`Document not found: ${fetchError?.message}`);
    }

    let imagePath = document.storage_path;
    if (document.file_type === 'application/pdf' && document.converted_image_path) {
      imagePath = document.converted_image_path;
    }

    const { data: imageData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(imagePath);

    if (downloadError || !imageData) {
      throw new Error(`Failed to download image: ${downloadError?.message}`);
    }

    const arrayBuffer = await imageData.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return base64;
  } catch (error) {
    console.error(`Image fetch failed for ${documentId}:`, error);
    throw error;
  }
}

export async function updateDocumentClassification(
  documentId: string,
  classification: any,
  taskId: string
): Promise<void> {
  // Handle unsupported document types by setting appropriate status
  const status = classification.is_supported === false ? 'classification_failed' : 'pending_extraction';

  const updateData: any = {
    processing_status: status,
    document_type: classification.document_type,
    document_classification_confidence: classification.confidence_score,
    classification_method: classification.classification_method,
    classification_task_id: taskId,
    // Store rich classification metadata including reasoning and detected_elements
    document_metadata: {
      ...(classification.context_metadata || {}),
      is_supported: classification.is_supported,
      user_message: classification.user_message,
      reasoning: classification.reasoning,
      detected_elements: classification.detected_elements,
      classification_method: classification.classification_method,
      model_used: classification.model_used,
      confidence_score: classification.confidence_score
    }
  };

  const { error } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', documentId);

  if (error) {
    throw new Error(`Failed to update classification: ${error.message}`);
  }
}