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

// ✅ PHASE 4J: Domain-to-bucket mapping for multi-bucket architecture
const DOMAIN_BUCKET_MAP: Record<string, string> = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims',
  'application_documents': 'application_documents',
  'documents': 'documents'  // Fallback for legacy references
};

/**
 * Get storage bucket name from table name
 * @param tableName - The table name (also serves as bucket identifier)
 * @returns Storage bucket name
 */
export function getBucketName(tableName: string = 'documents'): string {
  return DOMAIN_BUCKET_MAP[tableName] || 'documents';
}

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
  errorMessage?: string | { message: string; suggestions?: string[]; error_type?: string; detected_type?: string; confidence?: number },
  tableName: string = 'documents'  // ✅ PHASE 4B-1: Dynamic table routing with safe default
): Promise<void> {
  // Handle different column names: both expense_claims and invoices use 'status', other tables use 'processing_status'
  const usesStatusColumn = tableName === 'expense_claims' || tableName === 'invoices';
  const statusColumn = usesStatusColumn ? 'status' : 'processing_status';
  const isExpenseClaims = tableName === 'expense_claims';

  // Map invalid statuses to valid ones for different table types
  let mappedStatus = status;
  if (isExpenseClaims) {
    // Map legacy status values to valid expense_claims statuses
    // Note: Modern trigger functions use constraint-compliant statuses directly
    const statusMap: { [key: string]: string } = {
      'classification_failed': 'failed',
      'extraction_failed': 'failed',
    };
    mappedStatus = statusMap[status] || status;
  } else if (tableName === 'application_documents') {
    // Map document processing statuses to valid application_documents statuses
    // Allowed: draft, uploading, analyzing, submitted, approved, rejected, failed, classifying, classification_failed, cancelled
    const statusMap: { [key: string]: string } = {
      'pending_extraction': 'analyzing',  // Map pending_extraction to analyzing
      'extracting': 'analyzing',  // Map extracting to analyzing
      'processing': 'analyzing',  // Map processing to analyzing
      'extraction_failed': 'failed',  // Map extraction_failed to failed
      'completed': 'draft'  // Map completed to draft (successfully processed, ready for submission)
    };
    mappedStatus = statusMap[status] || status;
  } else if (tableName === 'invoices') {
    // Map document processing statuses to valid invoices statuses
    const statusMap: { [key: string]: string } = {
      'completed': 'pending',  // For invoices, 'completed' processing maps to 'pending' status
      'pending_extraction': 'analyzing',  // Map pending_extraction to valid analyzing status
      'extracting': 'analyzing',  // Map extracting to analyzing for invoices
      'processing': 'analyzing'  // Map processing to analyzing for invoices
    };
    mappedStatus = statusMap[status] || status;
  }

  const updateData: any = {
    [statusColumn]: mappedStatus
  };

  // Only update processing_started_at for initial status changes
  if (status === 'classifying' || status === 'extracting' || status === 'processing') {
    updateData.processing_started_at = new Date().toISOString();
  }

  // Add error message if provided (handles both legacy strings and new jsonb objects)
  if (errorMessage) {
    updateData.error_message = errorMessage;  // Supabase handles jsonb serialization automatically
  }

  // Set completion/failure timestamps
  // expense_claims uses different timestamp columns
  // Use the mapped status for checking
  if (mappedStatus === 'draft' || mappedStatus === 'failed' || status === 'completed' || status === 'failed' || status === 'classification_failed' || status === 'extraction_failed') {
    if (isExpenseClaims) {
      updateData.processed_at = new Date().toISOString();
      if (mappedStatus === 'failed') {
        updateData.failed_at = new Date().toISOString();
      }
    } else {
      updateData.processed_at = new Date().toISOString();
      if (status === 'failed' || status === 'classification_failed') {
        updateData.failed_at = new Date().toISOString();
      }
    }
  }

  console.log(`[DB] Updating ${tableName}.${documentId} status to: ${mappedStatus}`, updateData);

  const { error } = await supabase
    .from(tableName)  // ✅ PHASE 4B-1: Route to correct table based on domain
    .update(updateData)
    .eq('id', documentId);

  if (error) {
    console.error(`[DB] Failed to update document status in ${tableName}:`, error);
    throw new Error(`Failed to update document status: ${error.message}`);
  }

  console.log(`[DB] Successfully updated ${tableName}.${documentId} status to: ${status}`);
}

export async function updateExtractionResults(
  documentId: string,
  result: ExtractionResult,
  tableName: string = 'documents'  // ✅ PHASE 4B-1: Dynamic table routing with safe default
): Promise<void> {
  // Handle different column names: both expense_claims and invoices use 'status', other tables use 'processing_status'
  const usesStatusColumn = tableName === 'expense_claims' || tableName === 'invoices';
  const statusColumn = usesStatusColumn ? 'status' : 'processing_status';

  // Map final status based on table domain
  let finalStatus: string;
  if (tableName === 'invoices') {
    finalStatus = 'pending'; // invoices use 'pending' for completed extraction
  } else if (tableName === 'expense_claims') {
    finalStatus = 'paid'; // expense_claims use 'paid' for completed extraction
  } else if (tableName === 'application_documents') {
    finalStatus = 'completed'; // ✅ Use 'completed' for proper workflow (was 'draft')
  } else {
    finalStatus = 'completed'; // fallback for other tables
  }

  const updateData: any = {
    [statusColumn]: finalStatus,
    extracted_data: result.extracted_data,
    confidence_score: result.confidence_score,
    processed_at: new Date().toISOString()
  };

  console.log(`[DB] 🔍 DEBUG: updateExtractionResults called for ${tableName}.${documentId}`);
  console.log(`[DB] 🔍 DEBUG: statusColumn: ${statusColumn}, finalStatus: ${finalStatus}`);
  console.log(`[DB] 🔍 DEBUG: updateData:`, JSON.stringify(updateData, null, 2));
  console.log(`[DB] Updating ${tableName}.${documentId} extraction results`);

  const { error } = await supabase
    .from(tableName)  // ✅ PHASE 4B-1: Route to correct table based on domain
    .update(updateData)
    .eq('id', documentId);

  if (error) {
    console.error(`[DB] ❌ Failed to update extraction results in ${tableName}:`, error);
    console.error(`[DB] ❌ Error code: ${error.code}, Message: ${error.message}`);
    throw new Error(`Failed to update extraction results: ${error.message}`);
  }

  console.log(`[DB] ✅ Successfully updated ${tableName}.${documentId} extraction results`);
  console.log(`[DB] ✅ Document should now have status: ${finalStatus}`);
}

export async function fetchDocumentImage(
  documentId: string,
  tableName: string = 'documents'  // ✅ PHASE 4B-1: Dynamic table routing with safe default
): Promise<string> {
  try {
    console.log(`[DB] Fetching image for ${tableName}.${documentId}`);

    const { data: document, error: fetchError } = await supabase
      .from(tableName)  // ✅ PHASE 4B-1: Route to correct table based on domain
      .select('storage_path, file_type, converted_image_path')
      .eq('id', documentId)
      .single();

    if (fetchError || !document) {
      throw new Error(`Document not found in ${tableName}: ${fetchError?.message}`);
    }

    let imagePath = document.storage_path;
    if (document.file_type === 'application/pdf' && document.converted_image_path) {
      imagePath = document.converted_image_path;
    }

    const bucketName = getBucketName(tableName);  // ✅ PHASE 4J: Route to correct bucket
    const { data: imageData, error: downloadError } = await supabase.storage
      .from(bucketName)
      .download(imagePath);

    if (downloadError || !imageData) {
      throw new Error(`Failed to download image: ${downloadError?.message}`);
    }

    const arrayBuffer = await imageData.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    console.log(`[DB] Successfully fetched image for ${tableName}.${documentId}`);
    return base64;
  } catch (error) {
    console.error(`Image fetch failed for ${tableName}.${documentId}:`, error);
    throw error;
  }
}

export async function updateDocumentClassification(
  documentId: string,
  classification: any,
  taskId: string,
  tableName: string = 'documents'  // ✅ PHASE 4B-1: Dynamic table routing with safe default
): Promise<void> {
  // Handle unsupported document types by setting appropriate status
  const status = classification.is_supported === false ? 'classification_failed' : 'pending_extraction';
  const isExpenseClaims = tableName === 'expense_claims';

  const updateData: any = {};

  // Use correct status column based on table
  if (isExpenseClaims) {
    updateData.status = status === 'pending_extraction' ? 'analyzing' : 'failed';

    // For expense_claims, classification info goes into processing_metadata
    updateData.processing_metadata = {
      ...(classification.context_metadata || {}),
      classification: {
        is_supported: classification.is_supported,
        user_message: classification.user_message,
        reasoning: classification.reasoning,
        detected_elements: classification.detected_elements,
        classification_method: classification.classification_method,
        model_used: classification.model_used,
        confidence_score: classification.confidence_score,
        document_type: classification.document_type
      }
    };
    updateData.confidence_score = classification.confidence_score;
  } else {
    // For other tables (invoices, application_documents)
    const usesStatusColumn = tableName === 'invoices';
    const statusColumn = usesStatusColumn ? 'status' : 'processing_status';

    // Map status values to valid ones for invoices and application_documents tables
    let mappedStatus = status;
    if (tableName === 'invoices') {
      mappedStatus = status === 'pending_extraction' ? 'analyzing' :
                    status === 'classification_failed' ? 'classification_failed' : status;
    } else if (tableName === 'application_documents') {
      // Map to valid application_documents statuses
      mappedStatus = status === 'pending_extraction' ? 'analyzing' :
                    status === 'classification_failed' ? 'classification_failed' : status;
    }

    updateData[statusColumn] = mappedStatus;
    updateData.document_classification_confidence = classification.confidence_score;
    updateData.classification_method = classification.classification_method;
    updateData.classification_task_id = taskId;

    // Store rich classification metadata including reasoning and detected_elements
    updateData.document_metadata = {
      ...(classification.context_metadata || {}),
      is_supported: classification.is_supported,
      user_message: classification.user_message,
      reasoning: classification.reasoning,
      detected_elements: classification.detected_elements,
      classification_method: classification.classification_method,
      model_used: classification.model_used,
      confidence_score: classification.confidence_score,
      // Store document_type in metadata for all tables
      document_type: classification.document_type
    };

    // Only include document_type column for tables that have it (not invoices after migration)
    if (tableName === 'application_documents') {
      updateData.document_type = classification.document_type;
    }
    // Note: 'invoices' table no longer has document_type column - it's stored in document_metadata
  }

  console.log(`[DB] Updating ${tableName}.${documentId} classification (type: ${classification.document_type})`);

  const { error } = await supabase
    .from(tableName)  // ✅ PHASE 4B-1: Route to correct table based on domain
    .update(updateData)
    .eq('id', documentId);

  if (error) {
    console.error(`[DB] Failed to update classification in ${tableName}:`, error);
    throw new Error(`Failed to update classification: ${error.message}`);
  }

  console.log(`[DB] Successfully updated ${tableName}.${documentId} classification`);
}