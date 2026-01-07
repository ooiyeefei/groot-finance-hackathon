/**
 * Convex Database Helpers for Trigger.dev Tasks
 *
 * Uses ConvexHttpClient to call Convex system functions.
 * These functions don't require Clerk auth - document IDs provide implicit authorization.
 *
 * REQUIRED ENVIRONMENT VARIABLE (set in Trigger.dev Dashboard):
 * - NEXT_PUBLIC_CONVEX_URL: Your Convex deployment URL
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';

// Validate environment variables
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error('Missing required NEXT_PUBLIC_CONVEX_URL environment variable');
}

// Singleton Convex client for Trigger.dev tasks
let convexClient: ConvexHttpClient | null = null;

function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    convexClient = new ConvexHttpClient(convexUrl!);
    console.log('[Convex-Trigger] Client initialized for Trigger.dev tasks');
  }
  return convexClient;
}

export interface ExtractionResult {
  success: boolean;
  document_type?: string;
  extracted_data?: unknown;
  confidence_score?: number;
  extraction_method?: string;
  model_used?: string;
  metadata?: unknown;
  error?: string;
  error_type?: string;
}

/**
 * Update document/invoice status in Convex
 */
export async function updateDocumentStatus(
  documentId: string,
  status: string,
  errorMessage?: string | { message: string; suggestions?: string[]; error_type?: string },
  tableName: string = 'invoices'
): Promise<void> {
  const client = getConvexClient();

  console.log(`[Convex] Updating ${tableName}.${documentId} status to: ${status}`);

  try {
    if (tableName === 'invoices') {
      await client.mutation(api.functions.system.updateInvoiceStatus, {
        id: documentId,
        status: status,
        errorMessage: errorMessage ? JSON.stringify(errorMessage) : undefined,
      });
    } else if (tableName === 'expense_claims') {
      await client.mutation(api.functions.system.updateExpenseClaimStatus, {
        id: documentId,
        status: status,
        errorMessage: errorMessage ? JSON.stringify(errorMessage) : undefined,
      });
    } else {
      throw new Error(`Unknown table: ${tableName}`);
    }

    console.log(`[Convex] Successfully updated ${tableName}.${documentId} status to: ${status}`);
  } catch (error) {
    console.error(`[Convex] Failed to update document status:`, error);
    throw error;
  }
}

/**
 * Update extraction results in Convex
 */
export async function updateExtractionResults(
  documentId: string,
  result: ExtractionResult,
  tableName: string = 'invoices'
): Promise<void> {
  const client = getConvexClient();

  console.log(`[Convex] Updating ${tableName}.${documentId} extraction results`);

  // DEBUG: Log extracted_data being sent to Convex
  console.log(`[Convex Debug] extracted_data keys:`, Object.keys(result.extracted_data || {}));
  console.log(`[Convex Debug] suggested_category:`, (result.extracted_data as any)?.suggested_category);
  console.log(`[Convex Debug] accounting_category:`, (result.extracted_data as any)?.accounting_category);

  try {
    if (tableName === 'invoices') {
      await client.mutation(api.functions.system.updateInvoiceExtraction, {
        id: documentId,
        extractedData: result.extracted_data,
        confidenceScore: result.confidence_score,
        extractionMethod: result.extraction_method,
        modelUsed: result.model_used,
      });
    } else if (tableName === 'expense_claims') {
      // Extract specific fields from extraction result for expense claims
      const extractedData = result.extracted_data as Record<string, unknown> | undefined;

      await client.mutation(api.functions.system.updateExpenseClaimExtraction, {
        id: documentId,
        extractedData: result.extracted_data,
        confidenceScore: result.confidence_score,
        extractionMethod: result.extraction_method,
        vendorName: extractedData?.vendor_name as string | undefined,
        totalAmount: extractedData?.total_amount as number | undefined,
        currency: extractedData?.currency as string | undefined,
        transactionDate: extractedData?.transaction_date as string | undefined,
        // Additional expense claim fields
        expenseCategory: extractedData?.expense_category as string | undefined,
        businessPurpose: extractedData?.business_purpose as string | undefined,
        description: extractedData?.description as string | undefined,
        referenceNumber: extractedData?.reference_number as string | undefined,
        homeCurrency: extractedData?.home_currency as string | undefined,
        homeCurrencyAmount: extractedData?.home_currency_amount as number | undefined,
        exchangeRate: extractedData?.exchange_rate as number | undefined,
      });
    } else {
      throw new Error(`Unknown table: ${tableName}`);
    }

    console.log(`[Convex] Successfully updated ${tableName}.${documentId} extraction results`);
  } catch (error) {
    console.error(`[Convex] Failed to update extraction results:`, error);
    throw error;
  }
}

/**
 * Document details returned from Convex
 */
export interface ConvexDocument {
  storage_path: string;
  file_type: string;
  converted_image_path?: string;
  file_name?: string;
  file_size?: number;
  user_id?: string;
  business_id?: string;
  // Invoice specific fields (populated when tableName = 'invoices')
  document_metadata?: unknown;
  // Expense claim specific fields (populated when tableName = 'expense_claims')
  processing_metadata?: unknown;
  vendor_name?: string;
  total_amount?: number;
  status?: string;
}

/**
 * Fetch document details from Convex
 */
export async function fetchDocument(
  documentId: string,
  tableName: string = 'invoices'
): Promise<ConvexDocument> {
  const client = getConvexClient();

  console.log(`[Convex] Fetching ${tableName}.${documentId}`);

  try {
    if (tableName === 'invoices') {
      const doc = await client.query(api.functions.system.getInvoiceById, {
        id: documentId,
      });

      if (!doc) {
        throw new Error(`Document not found: ${documentId}`);
      }

      return {
        storage_path: doc.storagePath,
        file_type: doc.fileType,
        converted_image_path: doc.convertedImagePath,
        file_name: doc.fileName,
        file_size: doc.fileSize,
        user_id: doc.userId,
        business_id: doc.businessId,
        // Invoice specific fields
        document_metadata: doc.documentMetadata,
      };
    } else if (tableName === 'expense_claims') {
      const doc = await client.query(api.functions.system.getExpenseClaimById, {
        id: documentId,
      });

      if (!doc) {
        throw new Error(`Expense claim not found: ${documentId}`);
      }

      if (!doc.storagePath || !doc.fileType) {
        throw new Error(`Expense claim ${documentId} is missing storage path or file type`);
      }

      return {
        storage_path: doc.storagePath,
        file_type: doc.fileType,
        converted_image_path: doc.convertedImagePath,
        file_name: doc.fileName,
        file_size: doc.fileSize,
        user_id: doc.userId,
        business_id: doc.businessId,
        // Expense claim specific fields for extract-receipt-data
        processing_metadata: doc.processingMetadata,
        vendor_name: doc.vendorName,
        total_amount: doc.totalAmount,
        status: doc.status,
      };
    }

    throw new Error(`Unknown table: ${tableName}`);
  } catch (error) {
    console.error(`[Convex] Failed to fetch document:`, error);
    throw error;
  }
}

/**
 * Update extraction task ID in Convex
 * Used to track which extraction task is processing the document
 */
export async function updateExtractionTaskId(
  documentId: string,
  extractionTaskId: string,
  tableName: string = 'invoices'
): Promise<void> {
  const client = getConvexClient();

  console.log(`[Convex] Updating ${tableName}.${documentId} extraction task ID: ${extractionTaskId}`);

  try {
    if (tableName === 'invoices') {
      await client.mutation(api.functions.system.updateInvoiceExtractionTaskId, {
        id: documentId,
        extractionTaskId: extractionTaskId,
      });
    } else if (tableName === 'expense_claims') {
      await client.mutation(api.functions.system.updateExpenseClaimExtractionTaskId, {
        id: documentId,
        extractionTaskId: extractionTaskId,
      });
    } else {
      throw new Error(`Unknown table: ${tableName}`);
    }

    console.log(`[Convex] Successfully updated ${tableName}.${documentId} extraction task ID`);
  } catch (error) {
    console.error(`[Convex] Failed to update extraction task ID:`, error);
    throw error;
  }
}

/**
 * Business categories returned from Convex
 * Note: Categories use 'id' (Convex document ID) for identification
 */
export interface BusinessCategories {
  customExpenseCategories: Array<{
    id: string;
    category_name: string;
    description?: string;
    vendor_patterns?: string[];
    ai_keywords?: string[];
    is_active?: boolean;
    sort_order?: number;
  }>;
  customCogsCategories: Array<{
    id: string;
    category_name: string;
    description?: string;
    cost_type?: string;
    vendor_patterns?: string[];
    ai_keywords?: string[];
    is_active?: boolean;
    sort_order?: number;
  }>;
  homeCurrency?: string;
}

/**
 * Fetch business categories from Convex
 * Returns both expense categories and COGS categories for AI categorization
 */
export async function fetchBusinessCategories(
  businessId: string
): Promise<BusinessCategories | null> {
  const client = getConvexClient();

  console.log(`[Convex] Fetching business categories for: ${businessId}`);

  try {
    const result = await client.query(api.functions.system.getBusinessCategories, {
      businessId: businessId,
    });

    if (!result) {
      console.log(`[Convex] No business found or no categories: ${businessId}`);
      return null;
    }

    console.log(`[Convex] Found ${result.customExpenseCategories?.length || 0} expense categories and ${result.customCogsCategories?.length || 0} COGS categories`);

    return {
      customExpenseCategories: result.customExpenseCategories || [],
      customCogsCategories: result.customCogsCategories || [],
      homeCurrency: result.homeCurrency,
    };
  } catch (error) {
    console.error(`[Convex] Failed to fetch business categories:`, error);
    return null;
  }
}

/**
 * Update converted image path in Convex
 * Used by convert-pdf-to-image after PDF to image conversion
 */
export async function updateConvertedImagePath(
  documentId: string,
  convertedImagePath: string,
  pageMetadata: Array<{
    page_number: number;
    path: string;
    width: number;
    height: number;
  }>,
  tableName: string = 'invoices'
): Promise<void> {
  const client = getConvexClient();

  console.log(`[Convex] Updating ${tableName}.${documentId} converted image path: ${convertedImagePath}`);

  try {
    const firstPage = pageMetadata[0];

    if (tableName === 'invoices') {
      await client.mutation(api.functions.system.updateInvoiceConvertedImage, {
        id: documentId,
        convertedImagePath: convertedImagePath,
        convertedImageWidth: firstPage?.width,
        convertedImageHeight: firstPage?.height,
        pageMetadata: pageMetadata,
        totalPages: pageMetadata.length,
      });
    } else if (tableName === 'expense_claims') {
      await client.mutation(api.functions.system.updateExpenseClaimConvertedImage, {
        id: documentId,
        convertedImagePath: convertedImagePath,
        convertedImageWidth: firstPage?.width,
        convertedImageHeight: firstPage?.height,
        pageMetadata: pageMetadata,
        totalPages: pageMetadata.length,
      });
    } else {
      throw new Error(`Unknown table: ${tableName}`);
    }

    console.log(`[Convex] Successfully updated ${tableName}.${documentId} converted image path`);
  } catch (error) {
    console.error(`[Convex] Failed to update converted image path:`, error);
    throw error;
  }
}

/**
 * Update document classification in Convex
 */
export async function updateDocumentClassification(
  documentId: string,
  classification: {
    is_supported: boolean;
    document_type?: string;
    confidence_score?: number;
    classification_method?: string;
    model_used?: string;
    reasoning?: string;
    detected_elements?: unknown;
    user_message?: string;
  },
  taskId: string,
  tableName: string = 'invoices'
): Promise<void> {
  const client = getConvexClient();

  console.log(`[Convex] Updating ${tableName}.${documentId} classification`);

  try {
    if (tableName === 'invoices') {
      await client.mutation(api.functions.system.updateInvoiceClassification, {
        id: documentId,
        classification: {
          isSupported: classification.is_supported,
          documentType: classification.document_type,
          confidenceScore: classification.confidence_score,
          classificationMethod: classification.classification_method,
          modelUsed: classification.model_used,
          reasoning: classification.reasoning,
          detectedElements: classification.detected_elements,
          userMessage: classification.user_message,
        },
        taskId,
      });
    } else if (tableName === 'expense_claims') {
      await client.mutation(api.functions.system.updateExpenseClaimClassification, {
        id: documentId,
        classification: {
          isSupported: classification.is_supported,
          documentType: classification.document_type,
          confidenceScore: classification.confidence_score,
          classificationMethod: classification.classification_method,
          reasoning: classification.reasoning,
        },
        taskId,
      });
    } else {
      throw new Error(`Unknown table: ${tableName}`);
    }

    console.log(`[Convex] Successfully updated ${tableName}.${documentId} classification`);
  } catch (error) {
    console.error(`[Convex] Failed to update classification:`, error);
    throw error;
  }
}

// ============================================
// OCR USAGE TRACKING
// ============================================

/**
 * Token usage data from AI processing
 */
export interface TokenUsageData {
  has_usage_data?: boolean;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  model?: string;
  image_count?: number;
}

/**
 * Result from recording OCR usage
 */
export interface UsageRecordResult {
  success: boolean;
  skipped?: boolean;
  newUsage: number;
  error?: string;
}

/**
 * Record OCR usage for billing (via Convex)
 *
 * BILLING FAIRNESS LOGIC:
 * - Only charges if API tokens were actually consumed (has_usage_data === true && total_tokens > 0)
 * - System errors (network failures, timeouts before API call) = no charge
 * - User errors (bad image, wrong doc type) that reach the API = charges apply
 *
 * @param businessId - UUID of the business consuming OCR credits
 * @param documentId - Optional UUID of the document being processed
 * @param tokenUsage - Token usage data from AI processing
 * @param credits - Number of credits to charge (default: 1)
 */
export async function recordOcrUsage(
  businessId: string,
  documentId?: string | null,
  tokenUsage?: TokenUsageData | null,
  credits: number = 1
): Promise<UsageRecordResult> {
  const client = getConvexClient();

  try {
    const result = await client.mutation(api.functions.system.recordOcrUsage, {
      businessId: businessId,
      documentId: documentId || undefined,
      tokenUsage: tokenUsage ? {
        hasUsageData: tokenUsage.has_usage_data,
        totalTokens: tokenUsage.total_tokens,
        promptTokens: tokenUsage.prompt_tokens,
        completionTokens: tokenUsage.completion_tokens,
        model: tokenUsage.model,
      } : undefined,
      credits: credits,
    });

    if (result.skipped) {
      console.log(`[Convex OCR Usage] Skipped billing - no API tokens consumed`);
    } else {
      console.log(`[Convex OCR Usage] Recorded ${credits} credit(s) for business ${businessId}`);
    }

    return {
      success: result.success,
      skipped: result.skipped,
      newUsage: result.newUsage,
      error: result.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Convex OCR Usage] Error recording usage:`, message);
    return {
      success: false,
      newUsage: 0,
      error: message,
    };
  }
}
