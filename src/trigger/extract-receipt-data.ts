/**
 * Trigger.dev Task: Extract Receipt Data
 *
 * AI receipt processing with Gemini 2.5 Flash
 * Node.js handles URLs, Python processes extraction
 */

import { task } from "@trigger.dev/sdk/v3";
import { python } from "@trigger.dev/python";
import { getUserFriendlyErrorMessage, type ErrorContext } from '../lib/shared/error-message-mapper';
import { listFiles, getPresignedDownloadUrl, fileExists, type S3Prefix } from './utils/s3-helpers';
// ✅ CONVEX MIGRATION: Use Convex helpers instead of direct Supabase client
import {
  fetchDocument,
  fetchBusinessCategories,
  updateDocumentStatus,
  updateExtractionResults,
  recordOcrUsage,
  type ExtractionResult
} from './utils/convex-helpers';

// Domain-to-table mapping for multi-domain architecture
const DOMAIN_TABLE_MAP = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims'
} as const;

// ✅ S3 MIGRATION: Domain-to-S3-prefix mapping
const DOMAIN_S3_PREFIX_MAP: Record<string, S3Prefix> = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims'
};

// Security validation functions
function validateImageUrl(url: string): { isValid: boolean; error?: string; sanitizedUrl?: string } {
  try {
    const parsedUrl = new URL(url);

    // Allow only HTTPS URLs
    if (parsedUrl.protocol !== 'https:') {
      return { isValid: false, error: 'Only HTTPS URLs are allowed' };
    }

    // Allow Supabase storage URLs and AWS S3 presigned URLs
    const allowedHosts = [
      process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '').replace('http://', ''),
    ].filter(Boolean);

    const hostname = parsedUrl.hostname;

    // Check for allowed hosts (Supabase, S3)
    const isSupabaseHost = allowedHosts.some(host =>
      hostname === host || hostname.endsWith(`.${host}`) || hostname.endsWith('.supabase.co')
    );

    // ✅ S3 MIGRATION: Allow AWS S3 presigned URLs
    // S3 URL patterns: bucket.s3.region.amazonaws.com or bucket.s3.amazonaws.com
    const isS3Host = hostname.endsWith('.amazonaws.com') && hostname.includes('.s3.');

    const isAllowedHost = isSupabaseHost || isS3Host;

    if (!isAllowedHost) {
      return { isValid: false, error: 'URL host not allowed for security reasons' };
    }

    return { isValid: true, sanitizedUrl: url };
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format' };
  }
}

function sanitizeBusinessCategories(categories: any[]): any[] {
  if (!Array.isArray(categories)) {
    return [];
  }

  return categories.map(cat => ({
    id: sanitizeTextInput(cat?.id || ''),
    category_name: sanitizeTextInput(cat?.category_name || ''),
    vendor_patterns: Array.isArray(cat?.vendor_patterns)
      ? cat.vendor_patterns.map((p: any) => sanitizeTextInput(String(p || ''))).slice(0, 10)
      : [],
    ai_keywords: Array.isArray(cat?.ai_keywords)
      ? cat.ai_keywords.map((k: any) => sanitizeTextInput(String(k || ''))).slice(0, 10)
      : [],
    is_active: Boolean(cat?.is_active)
  })).slice(0, 50); // Limit to 50 categories max
}

function sanitizeTextInput(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes, control characters, and limit length
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .replace(/[`$\\]/g, '') // Remove shell metacharacters
    .trim()
    .substring(0, 1000); // Limit length
}

function sanitizeProcessingMethod(method: string): 'simple' | 'complex' | 'auto' {
  const allowedMethods = ['simple', 'complex', 'auto'];
  return allowedMethods.includes(method) ? method as any : 'auto';
}

function sanitizeUuid(uuid?: string): string | undefined {
  if (!uuid || typeof uuid !== 'string') {
    return undefined;
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid) ? uuid : undefined;
}

function maskSensitiveData(data: string): string {
  if (!data || typeof data !== 'string') {
    return '[REDACTED]';
  }

  // Show only first 3 characters for debugging while protecting sensitive data
  return data.length > 3 ? `${data.substring(0, 3)}***` : '***';
}

// Global error handler to ensure database updates even on system failures
async function handleTaskFailure(
  expenseClaimId: string | undefined,
  error: any,
  context: string
): Promise<void> {
  if (!expenseClaimId) return;

  console.error(`🚨 CRITICAL FAILURE in ${context}:`, error);

  try {
    // Create error context for mapping
    const errorContext: ErrorContext = {
      technicalError: error?.message || error?.toString(),
      processingStage: context,
      domain: 'expense_claims',
      documentType: 'receipt'
    };

    // Determine error category and code for system-level failures
    let errorCode = 'SYSTEM_ERROR';
    let errorCategory = 'system_failure';

    if (error?.code === 'ENOENT' || error?.message?.includes('ENOENT')) {
      errorCode = 'PYTHON_ENV_MISSING';
      errorCategory = 'environment_missing';
    } else if (error?.message?.includes('CONFIGURED_INCORRECTLY')) {
      errorCode = 'CONFIGURATION_ERROR';
      errorCategory = 'configuration_error';
    } else if (error?.message?.includes('timeout') || error?.message?.includes('maxDuration')) {
      errorCode = 'SYSTEM_TIMEOUT';
      errorCategory = 'system_timeout';
    }

    // Update error context with determined values
    errorContext.errorCode = errorCode;
    errorContext.errorCategory = errorCategory;

    // Get user-friendly error message using mapper
    const userFriendlyMapping = getUserFriendlyErrorMessage(errorContext);
    const userFriendlyError = userFriendlyMapping.userMessage;

    const failureMetadata = {
      extraction_method: 'ai',
      extraction_timestamp: new Date().toISOString(),
      ai_processing_status: 'failed',
      processing_status: 'failed', // For ProcessingStep compatibility
      error_category: errorCategory,
      error_code: errorCode,
      error_message: userFriendlyError,
      technical_error: error?.message || error?.toString() || 'Unknown system error',
      failed_at: new Date().toISOString(),
      processing_stage: context,
      failure_level: 'system' // Indicates this was a system-level failure
    };

    // Create JSONB error structure
    const errorJsonb = {
      message: userFriendlyError,
      suggestions: [
        'Ensure your Python environment is properly configured',
        'Contact support if the issue persists',
        'Try uploading a different image format'
      ],
      error_type: errorCategory,
      error_code: errorCode,
      timestamp: new Date().toISOString()
    };

    // ✅ CONVEX MIGRATION: Use Convex helper for status update
    await updateDocumentStatus(expenseClaimId, 'failed', errorJsonb, 'expense_claims');

    console.log(`🚨 Expense claim ${expenseClaimId} marked as failed due to system failure in ${context}`);
  } catch (updateError) {
    console.error('🚨 CRITICAL: Failed to update expense claim with system failure:', updateError);
    // This is the worst case - system failure AND database update failure
    // Log to external service if available (Sentry, etc.)
  }
}

export const extractReceiptData = task({
  id: "extract-receipt-data",
  maxDuration: 180, // 3 minutes - with vLLM fallback system
  retry: {
    maxAttempts: 1, // No retries - we have vLLM fallback internally
  },
  run: async (payload: {
    receiptText?: string;
    receiptImageData?: {
      base64: string;
      mimeType: string;
      filename: string;
    };
    receiptImageUrl?: string;
    documentId?: string;
    expenseClaimId?: string;
    userId?: string;
    imageMetadata?: {
      confidence?: number;
      quality?: 'excellent' | 'good' | 'acceptable' | 'poor';
      textLength?: number;
    };
    forcedProcessingMethod?: 'simple' | 'complex' | 'auto';
    requestId?: string;
    documentDomain?: 'invoices' | 'expense_claims';
  }) => {
    // 🚨 GLOBAL TASK WRAPPER - Catches ALL failures including system failures
    try {
      console.log(`🚀 Starting AI receipt extraction - Claim: ${payload.expenseClaimId}`);

      // Route to correct table based on domain (fallback to 'invoices' for backward compatibility)
      const documentDomain = payload.documentDomain || 'invoices';
      const tableName = DOMAIN_TABLE_MAP[documentDomain];
      // ✅ S3 MIGRATION: Route to correct S3 prefix based on domain
      const s3Prefix = DOMAIN_S3_PREFIX_MAP[documentDomain];
      console.log(`🔍 Using table: ${tableName} for domain: ${documentDomain}, S3 prefix: ${s3Prefix}`);

    // Step 1: Fetch business categories for enhanced categorization (if expense claim provided)
    let businessCategories: any[] = [];
    let expenseClaim: any = null;

    try {

      if (payload.expenseClaimId) {
        console.log(`🏢 Fetching expense claim from Convex: ${payload.expenseClaimId}`);

        // ✅ CONVEX MIGRATION: Use fetchDocument instead of direct Supabase
        try {
          const fetchedExpenseClaim = await fetchDocument(payload.expenseClaimId, 'expense_claims');
          expenseClaim = fetchedExpenseClaim;
          console.log(`✅ Expense claim fetched successfully - storage_path: ${expenseClaim?.storage_path ? 'present' : 'missing'}, business_id: ${expenseClaim?.business_id || 'missing'}`);
        } catch (fetchError) {
          console.error(`❌ Failed to fetch expense claim from Convex:`, fetchError);
          throw fetchError;
        }

        if (expenseClaim?.business_id) {
          console.log(`🏷️ Fetching business expense categories - business_id: ${expenseClaim.business_id}`);

          // ✅ CONVEX MIGRATION: Use fetchBusinessCategories instead of direct Supabase
          let businessCats;
          try {
            businessCats = await fetchBusinessCategories(expenseClaim.business_id);
            console.log(`✅ Business categories fetched: ${businessCats?.customExpenseCategories?.length || 0} expense categories`);
          } catch (catError) {
            console.error(`❌ Failed to fetch business categories:`, catError);
            // Non-fatal - continue without categories
            businessCats = null;
          }

          if (businessCats?.customExpenseCategories && businessCats.customExpenseCategories.length > 0) {
            // Filter for ACTIVE categories only (is_active: true)
            businessCategories = businessCats.customExpenseCategories.filter((cat: any) =>
              cat && cat.category_name && cat.is_active === true
            );
            console.log(`🏷️ Found ${businessCategories.length} active categories`);

            // Log category count without exposing sensitive business data
            if (businessCategories.length > 0) {
              console.log(`🏷️ Categories available for AI categorization: ${businessCategories.length} active categories`);
            }
          } else {
            console.log(`⚠️ No custom expense categories found for business ${expenseClaim.business_id}`);
          }
        }
      }

      // Step 2: Create signed URL for secure image access with validation and timeout handling
      let imageUrl = payload.receiptImageUrl;

      if (!imageUrl && expenseClaim?.storage_path) {
        // Use converted image path for PDFs or original storage path for images
        const imagePath = expenseClaim.converted_image_path || expenseClaim.storage_path;

        console.log(`🔗 Attempting to create signed URL for path: ${imagePath}`);

        try {
          // ✅ S3 MIGRATION: Step 2a - Verify file exists in S3
          console.log(`🔍 Verifying file exists in S3 before creating presigned URL...`);

          const exists = await fileExists(s3Prefix, imagePath);

          if (!exists) {
            console.error(`❌ File not found in S3: ${s3Prefix}/${imagePath}`);
            throw new Error(`Receipt file not found in storage at path: ${imagePath}. The file may not have been uploaded correctly or may have been moved.`);
          }

          console.log(`✅ File verified to exist in S3: ${s3Prefix}/${imagePath}`);

          // ✅ S3 MIGRATION: Step 2b - Create presigned URL
          console.log(`🔗 Creating S3 presigned URL...`);

          imageUrl = await getPresignedDownloadUrl(s3Prefix, imagePath, 600); // 10 minutes
          console.log(`✅ S3 presigned URL created successfully`);

        } catch (storageError) {
          console.error(`❌ Storage access error:`, storageError);

          // Enhanced error handling for storage issues
          let storageErrorMessage = 'Unable to access receipt file in storage.';

          if (storageError instanceof Error) {
            if (storageError.message.includes('timed out')) {
              storageErrorMessage = 'Storage access timed out. Please try again in a few moments.';
            } else if (storageError.message.includes('not found')) {
              storageErrorMessage = 'Receipt file not found. Please re-upload your receipt.';
            } else if (storageError.message.includes('permission') || storageError.message.includes('unauthorized')) {
              storageErrorMessage = 'Permission denied accessing receipt file. Please contact support.';
            } else {
              storageErrorMessage = `Storage error: ${storageError.message}`;
            }
          }

          throw new Error(storageErrorMessage);
        }
      }

      if (!imageUrl && !payload.receiptImageData) {
        throw new Error('No image URL or image data available for processing');
      }

      // Step 3: Input validation and sanitization before Python execution
      console.log("🔒 Validating and sanitizing inputs...");

      // Validate and sanitize image URL for SSRF protection
      if (imageUrl) {
        const urlValidation = validateImageUrl(imageUrl);
        if (!urlValidation.isValid) {
          throw new Error(`Invalid image URL: ${urlValidation.error}`);
        }
        imageUrl = urlValidation.sanitizedUrl;
      }

      // Sanitize text inputs to prevent injection
      const sanitizedParams = {
        imageUrl: imageUrl,
        imageData: payload.receiptImageData,
        businessCategories: sanitizeBusinessCategories(businessCategories),
        receiptText: sanitizeTextInput(payload.receiptText || ''),
        forcedProcessingMethod: sanitizeProcessingMethod(payload.forcedProcessingMethod || 'auto'),
        expenseClaimId: sanitizeUuid(payload.expenseClaimId)
      };

      // Step 4: Run AI extraction using Python script
      console.log("🐍 Running AI extraction...");

      let result: any;

      try {
        const pythonPromise = python.runScript(
          "./src/python/extract_receipt_data.py",
          [JSON.stringify(sanitizedParams)],
          {
            timeout: 180000, // 3 minutes
            env: {
              GEMINI_API_KEY: process.env.GEMINI_API_KEY
            }
          }
        );

        result = await pythonPromise;

        console.log("✅ Python script execution completed");
      } catch (pythonError: any) {
        console.error("❌ Python execution failed:", pythonError);

        // Create error context for mapping
        const errorContext: ErrorContext = {
          technicalError: pythonError.message || pythonError.toString(),
          processingStage: 'python_execution',
          domain: 'expense_claims',
          documentType: 'receipt'
        };

        // Determine error code based on error type
        let errorCode = 'SYSTEM_ERROR';
        let errorCategory = 'execution';

        if (pythonError.code === 'ENOENT') {
          errorCode = 'PYTHON_ENV_MISSING';
          errorCategory = 'environment';
          console.error('❌ Python environment missing - ENOENT error. Virtual environment may not be activated or Python not installed.');
        } else if (pythonError.message?.includes('timeout') || pythonError.message?.includes('AbortError') || pythonError.message?.includes('maxDuration') || pythonError.code === 'ETIMEDOUT') {
          errorCode = 'TIMEOUT_ERROR';
          errorCategory = 'timeout';
          errorContext.timeoutDuration = '180 seconds';
        } else if (pythonError.message?.includes('spawn') || pythonError.message?.includes('python')) {
          errorCode = 'PYTHON_ENV_MISSING';
          errorCategory = 'execution';
        } else if (pythonError.message?.includes('memory') || pythonError.message?.includes('resource')) {
          errorCode = 'SYSTEM_ERROR';
          errorCategory = 'resource';
        }

        // Update error context with determined values
        errorContext.errorCode = errorCode;
        errorContext.errorCategory = errorCategory;

        // Get user-friendly error message using mapper
        const userFriendlyMapping = getUserFriendlyErrorMessage(errorContext);
        const userFriendlyError = userFriendlyMapping.userMessage;

        // Update expense claim with detailed failure information
        if (payload.expenseClaimId) {
          const failureMetadata = {
            extraction_method: 'ai',
            extraction_timestamp: new Date().toISOString(),
            ai_processing_status: 'failed',
            processing_status: 'failed', // ✅ Also set this for ProcessingStep compatibility
            error_category: errorCategory,
            error_code: pythonError.code || (errorCategory === 'timeout' ? 'TIMEOUT_ERROR' : 'UNKNOWN'),
            error_message: userFriendlyError,
            technical_error: pythonError.message || pythonError.toString(),
            failed_at: new Date().toISOString(),
            processing_stage: 'python_execution',
            timeout_duration: errorCategory === 'timeout' ? '180 seconds' : undefined
          };

          // Create JSONB error structure
          const errorJsonb = {
            message: userFriendlyError,
            suggestions: [
              'Try uploading the receipt again',
              'Ensure the image is clear and readable',
              'If the issue persists, contact support'
            ],
            error_type: errorCategory,
            error_code: pythonError.code || (errorCategory === 'timeout' ? 'TIMEOUT_ERROR' : 'UNKNOWN'),
            timestamp: new Date().toISOString()
          };

          // ✅ CONVEX MIGRATION: Use updateDocumentStatus instead of direct Supabase
          await updateDocumentStatus(payload.expenseClaimId, 'failed', errorJsonb, 'expense_claims');

          console.log(`❌ Expense claim ${payload.expenseClaimId} marked as failed due to ${errorCategory} error`);
        }

        throw new Error(userFriendlyError);
      }

      // Step 4: Parse Python script result
      console.log("🔍 Parsing Python extraction result...");

      let pythonResult: any;
      if (result && typeof result === 'object' && 'stdout' in result) {
        try {
          // Parse JSON output from Python script
          const stdout = (result as any).stdout.trim();
          if (!stdout) {
            throw new Error('Empty output from AI processing script');
          }
          pythonResult = JSON.parse(stdout);
        } catch (parseError) {
          console.error(`❌ Failed to parse Python JSON output:`, parseError);
          console.log(`📄 Stdout length: ${(result as any).stdout?.length || 0} characters (content redacted for security)`);

          // Create error context for parsing failure
          const errorContext: ErrorContext = {
            errorCode: 'JSON_PARSE_FAILED',
            errorCategory: 'parsing_error',
            technicalError: parseError instanceof Error ? parseError.message : parseError?.toString(),
            processingStage: 'python_result_parsing',
            domain: 'expense_claims',
            documentType: 'receipt'
          };

          // Get user-friendly error message using mapper
          const userFriendlyMapping = getUserFriendlyErrorMessage(errorContext);

          // Update expense claim with parsing failure
          if (payload.expenseClaimId) {
            const parseFailureMetadata = {
              extraction_method: 'ai',
              extraction_timestamp: new Date().toISOString(),
              ai_processing_status: 'failed',
              error_category: 'parsing_error',
              error_code: 'JSON_PARSE_FAILED',
              error_message: userFriendlyMapping.userMessage,
              technical_error: parseError instanceof Error ? parseError.message : parseError?.toString(),
              failed_at: new Date().toISOString(),
              processing_stage: 'python_result_parsing',
              raw_stdout: (result as any).stdout?.substring(0, 1000) // First 1000 chars for debugging
            };

            // Create JSONB error structure
            const parseErrorJsonb = {
              message: userFriendlyMapping.userMessage,
              suggestions: userFriendlyMapping.actionableSteps || [
                'Try uploading the receipt again',
                'Ensure the receipt image is clear and complete',
                'Contact support if this issue persists'
              ],
              error_type: 'parsing_error',
              error_code: 'JSON_PARSE_FAILED',
              timestamp: new Date().toISOString()
            };

            // ✅ CONVEX MIGRATION: Use updateDocumentStatus instead of direct Supabase
            await updateDocumentStatus(payload.expenseClaimId, 'failed', parseErrorJsonb, 'expense_claims');

            console.log(`❌ Expense claim ${payload.expenseClaimId} marked as failed due to parsing error`);
          }

          throw new Error('AI processing returned invalid data format. Please try uploading the receipt again.');
        }
      } else {
        pythonResult = result;
      }

      // Check if Python script returned an error
      if (pythonResult && pythonResult.success === false && pythonResult.error) {
        let userFriendlyError = 'Unable to extract data from this receipt. ';
        let suggestions: string[] = [];

        // Check if Python script provided user_message and suggestions
        if (pythonResult.data?.user_message) {
          userFriendlyError = pythonResult.data.user_message;
          suggestions = pythonResult.data.suggestions || [];
        } else {
          // Fallback to error categorization
          if (pythonResult.error.includes('API') || pythonResult.error.includes('overload')) {
            userFriendlyError += 'Our processing service is temporarily busy. Please try again in a few moments.';
            suggestions = ['Wait a few moments and try again', 'If the issue persists, contact support'];
          } else if (pythonResult.error.includes('timeout') || pythonResult.error.includes('hang')) {
            userFriendlyError += 'The receipt took too long to process. Please try uploading a clearer image.';
            suggestions = ['Take a clearer photo with better lighting', 'Ensure the entire receipt is visible', 'Try a different camera angle'];
          } else if (pythonResult.error.includes('image') || pythonResult.error.includes('download')) {
            userFriendlyError += 'There was an issue accessing your receipt. Please try uploading it again.';
            suggestions = ['Try uploading the image again', 'Ensure the file is not corrupted', 'Use a different image format (JPG or PNG)'];
          } else {
            userFriendlyError += 'Please try uploading the receipt again or contact support if the issue persists.';
            suggestions = ['Upload a clearer image', 'Ensure all text is readable', 'Contact support if issues continue'];
          }
        }

        // Update expense claim with JSONB error structure
        if (payload.expenseClaimId) {
          const errorJsonb = {
            message: userFriendlyError,
            suggestions: suggestions,
            error_type: 'extraction_failed',
            error_code: pythonResult.error_code || 'PYTHON_EXTRACTION_ERROR',
            timestamp: new Date().toISOString()
          };

          // ✅ CONVEX MIGRATION: Use updateDocumentStatus instead of direct Supabase
          await updateDocumentStatus(payload.expenseClaimId, 'failed', errorJsonb, 'expense_claims');
        }

        console.error(`❌ Technical error details:`, pythonResult.error);
        throw new Error(userFriendlyError);
      }

      // Extract the result data
      const extractionResult = pythonResult.data;
      if (!extractionResult) {
        throw new Error('No extraction data returned from AI processing');
      }

      console.log(`✅ AI extraction successful for claim ${payload.expenseClaimId}`);

      // Log extraction summary without sensitive data
      console.log("📊 Extraction Results Summary:");
      console.log(`🏪 Vendor: ${maskSensitiveData(extractionResult.vendor_name)}`);
      console.log(`💰 Amount: [REDACTED] ${extractionResult.currency}`);
      console.log(`🗓️ Date: ${extractionResult.transaction_date}`);
      console.log(`📄 Receipt #: ${extractionResult.receipt_number ? '[PRESENT]' : 'N/A'}`);
      console.log(`🎯 Confidence: ${(extractionResult.confidence_score * 100).toFixed(1)}%`);
      console.log(`⚡ Processing time: ${pythonResult.processing_time_ms}ms`);
      if (extractionResult.line_items?.length > 0) {
        console.log(`📋 Line items: ${extractionResult.line_items.length} items extracted`);
        // Don't log detailed line item contents to prevent data leakage
      }

      // Step 5: Update expense claim with extracted metadata (NO accounting_entries creation)
      if (payload.expenseClaimId) {
        // Ensure processing status is set to 'analyzing' at start ✅ Unified status
        console.log(`🔄 Ensuring unified status is set to 'analyzing' for claim ${payload.expenseClaimId}`);
        // ✅ CONVEX MIGRATION: Use updateDocumentStatus instead of direct Supabase
        // Note: processingStartedAt is handled by Convex mutation internally
        await updateDocumentStatus(payload.expenseClaimId, 'analyzing', undefined, 'expense_claims');

        console.log(`💰 Updating expense claim ${payload.expenseClaimId} with extraction metadata`);

        if (!expenseClaim) {
          throw new Error(`Expense claim not found - was not fetched in Step 1: ${payload.expenseClaimId}`);
        }

        // Check if LLM provided a user message (for low quality receipts)
        if (extractionResult.user_message) {
          console.log(`⚠️ LLM provided user message: ${extractionResult.user_message}`);
          if (extractionResult.suggestions?.length > 0) {
            console.log(`💡 LLM suggestions: ${extractionResult.suggestions.join(', ')}`);
          }
        }

        // Auto-categorize based on AI suggestion, then vendor patterns
        let autoCategory = null;
        console.log(`🎯 Starting auto-categorization for vendor: ${extractionResult.vendor_name}`);

        if (businessCategories.length > 0) {
          // PRIORITY 1: Use AI suggested category if available
          if (extractionResult.suggested_category) {
            console.log(`🤖 AI suggested category: "${extractionResult.suggested_category}"`);

            const matchedByName = businessCategories.find(cat =>
              cat.category_name?.toLowerCase() === extractionResult.suggested_category.toLowerCase()
            );

            if (matchedByName) {
              autoCategory = matchedByName.id;
              console.log(`✅ Matched AI suggestion "${extractionResult.suggested_category}" to category: ${matchedByName.category_name} (${matchedByName.id})`);
            } else {
              console.log(`⚠️ AI suggestion "${extractionResult.suggested_category}" not found in business categories`);
            }
          }

          // PRIORITY 2: Fallback to vendor/keyword matching
          if (!autoCategory) {
            const vendor_lower = extractionResult.vendor_name.toLowerCase();
            console.log(`🔍 Checking vendor "${vendor_lower}" against ${businessCategories.length} active categories`);

            // Use business-specific vendor patterns and keywords
            for (const category of businessCategories) {
              const vendorPatterns = category.vendor_patterns || [];
              const aiKeywords = category.ai_keywords || [];

              // Check vendor patterns first
              if (vendorPatterns.some((pattern: string) => vendor_lower.includes(pattern.toLowerCase()))) {
                autoCategory = category.id;
                console.log(`✅ Matched vendor pattern to category: ${category.category_name} (${category.id})`);
                break;
              }

              // Check AI keywords
              if (aiKeywords.some((keyword: string) => vendor_lower.includes(keyword.toLowerCase()))) {
                autoCategory = category.id;
                console.log(`✅ Matched AI keyword to category: ${category.category_name} (${category.id})`);
                break;
              }
            }
          }

          if (!autoCategory) {
            console.log(`⚠️ No category match found - will use first active category: ${businessCategories[0]?.id || 'other_business'}`);
          }
        } else {
          console.log(`⚠️ No active business categories available - will use fallback: other_business`);
        }

        // Create extraction metadata for storage
        const extractionMetadata = {
          extraction_method: 'ai',
          extraction_timestamp: new Date().toISOString(),
          confidence_score: extractionResult.confidence_score,
          processing_time_ms: pythonResult.processing_time_ms,
          model_used: extractionResult.model_used || 'gemini-2.0-flash-exp',
          backend_used: extractionResult.backend_used || 'gemini_dspy',

          // LLM-generated user feedback
          user_message: extractionResult.user_message || null,
          suggestions: extractionResult.suggestions || null,

          financial_data: {
            description: extractionResult.vendor_name,
            vendor_name: extractionResult.vendor_name,
            total_amount: extractionResult.total_amount,
            original_currency: extractionResult.currency,
            home_currency: extractionResult.currency,
            home_currency_amount: extractionResult.total_amount,
            exchange_rate: 1.0,
            transaction_date: extractionResult.transaction_date,
            reference_number: extractionResult.receipt_number || null,
            subtotal_amount: extractionResult.subtotal_amount || null,
            tax_amount: extractionResult.tax_amount || null
          },

          line_items: extractionResult.line_items || [],

          raw_extraction: {
            ...extractionResult,
            thinking: pythonResult.thinking || {}
          }
        };

        // Update expense claim with extracted metadata
        console.log(`💾 Final category determined: ${autoCategory || businessCategories[0]?.id || 'other_business'}`);
        console.log(`💾 Updating expense claim ${payload.expenseClaimId} with extraction data`);

        // ✅ CONVEX MIGRATION: Use updateExtractionResults instead of direct Supabase
        // Build extraction result with all expense claim fields
        const expenseExtractionResult: ExtractionResult = {
          success: true,
          extracted_data: {
            ...extractionMetadata,
            // Core fields
            vendor_name: extractionResult.vendor_name,
            total_amount: extractionResult.total_amount,
            currency: extractionResult.currency,
            transaction_date: extractionResult.transaction_date,
            // Expense claim specific fields
            expense_category: autoCategory || businessCategories[0]?.id || 'other_business',
            business_purpose: extractionResult.business_purpose || 'Business expense',
            description: extractionResult.description || extractionResult.vendor_name,
            reference_number: extractionResult.receipt_number || null,
            // Currency fields (no conversion, same as original)
            home_currency: extractionResult.currency,
            home_currency_amount: extractionResult.total_amount,
            exchange_rate: 1.0,
          },
          confidence_score: extractionResult.confidence_score || undefined,
          extraction_method: 'ai',
        };

        await updateExtractionResults(payload.expenseClaimId, expenseExtractionResult, 'expense_claims');

        console.log(`✅ Expense claim ${payload.expenseClaimId} updated successfully`);
      }

      // Record OCR usage for billing (non-blocking - doesn't fail the task)
      // Pass token usage data for fair billing: only charges if API tokens were consumed
      await recordOcrUsage(expenseClaim.business_id, payload.documentId, pythonResult.tokens_used);

      return {
        success: true,
        data: extractionResult,
        processing_method: 'ai',
        confidence_score: extractionResult.confidence_score,
        requires_validation: extractionResult.confidence_score < 0.8 || extractionResult.extraction_quality === 'low',
        document_id: payload.documentId,
        processing_time_ms: pythonResult.processing_time_ms || 0
      };

    } catch (error) {
      console.error("❌ AI extraction task failed:", error);

      // Create error context for comprehensive error mapping
      const errorContext: ErrorContext = {
        technicalError: error instanceof Error ? error.message : error?.toString(),
        processingStage: 'general_execution',
        domain: 'expense_claims',
        documentType: 'receipt'
      };

      // Determine error code and category
      let errorCode = 'GENERAL_ERROR';
      let errorCategory = 'general_failure';

      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();

        // Categorize different types of errors
        if (errorMessage.includes('no image url') || errorMessage.includes('no image data')) {
          errorCode = 'MISSING_IMAGE_DATA';
          errorCategory = 'missing_image';
        } else if (errorMessage.includes('failed to create signed url') || errorMessage.includes('storage')) {
          errorCode = 'STORAGE_ACCESS_ERROR';
          errorCategory = 'storage_access';
        } else if (errorMessage.includes('expense claim not found')) {
          errorCode = 'CLAIM_NOT_FOUND';
          errorCategory = 'data_integrity';
        } else if (errorMessage.includes('failed to update expense claim')) {
          errorCode = 'DATABASE_UPDATE_ERROR';
          errorCategory = 'database_update';
        } else if (errorMessage.includes('no extraction data returned')) {
          errorCode = 'EMPTY_EXTRACTION_RESULT';
          errorCategory = 'empty_result';
        } else if (errorMessage.includes('ai processing returned invalid data format')) {
          errorCode = 'INVALID_DATA_FORMAT';
          errorCategory = 'parsing_error';
        } else if (errorMessage.includes('unable to extract data from this receipt')) {
          errorCode = 'EXTRACTION_FAILED';
          errorCategory = 'extraction_failure';
        }
      }

      // Update error context with determined values
      errorContext.errorCode = errorCode;
      errorContext.errorCategory = errorCategory;

      // Get user-friendly error message using mapper
      const userFriendlyMapping = getUserFriendlyErrorMessage(errorContext);
      const userFriendlyError = userFriendlyMapping.userMessage;

      // Smart failure handling based on processing context
      if (payload.expenseClaimId) {
        // Re-fetch expense claim data if not available (fallback for edge cases)
        if (!expenseClaim) {
          try {
            // ✅ CONVEX MIGRATION: Use fetchDocument instead of direct Supabase
            const fetchedClaim = await fetchDocument(payload.expenseClaimId, 'expense_claims');
            expenseClaim = fetchedClaim;
          } catch (fetchError) {
            console.error('Failed to re-fetch expense claim data:', fetchError);
            // Continue with null expenseClaim
          }
        }

        // Check if this claim has previous successful processing data
        const hasPreviousData = expenseClaim && (
          (expenseClaim.processing_metadata?.extraction_method === 'ai' && expenseClaim.processing_metadata?.extraction_timestamp) ||
          (expenseClaim.vendor_name && expenseClaim.total_amount > 0) ||
          expenseClaim.status === 'draft' // Already had some form data
        );

        console.log(`🔍 Processing failure context - Has previous data: ${hasPreviousData}`);
        console.log(`🔍 Error category: ${errorCategory}, Error code: ${errorCode}`);

        const failureMetadata = {
          extraction_method: 'ai',
          extraction_timestamp: new Date().toISOString(),
          ai_processing_status: 'failed',
          error_category: errorCategory,
          error_code: errorCode,
          error_message: userFriendlyError,
          technical_error: error instanceof Error ? error.message : error?.toString(),
          failed_at: new Date().toISOString(),
          processing_stage: 'general_execution',
          processing_type: hasPreviousData ? 'reprocessing' : 'initial_processing'
        };

        // Smart status determination
        let targetStatus: string;
        let logMessage: string;

        if (hasPreviousData) {
          // Reprocessing scenario: Keep form editable by returning to draft
          targetStatus = 'draft';
          logMessage = `🔄 Expense claim ${payload.expenseClaimId} returned to draft status after reprocessing failure (has previous data)`;
        } else {
          // First-time processing scenario: Mark as failed since no fallback data exists
          targetStatus = 'failed';
          logMessage = `❌ Expense claim ${payload.expenseClaimId} marked as failed after initial processing failure (no previous data)`;
        }

        try {
          // Create JSONB error structure
          const generalErrorJsonb = {
            message: userFriendlyError,
            suggestions: userFriendlyMapping.actionableSteps || [
              'Try uploading a clearer image of the receipt',
              'Ensure all text on the receipt is readable',
              'Check that the file is not corrupted',
              'Contact support if issues persist'
            ],
            error_type: errorCategory,
            error_code: errorCode,
            timestamp: new Date().toISOString()
          };

          // ✅ CONVEX MIGRATION: Use updateDocumentStatus instead of direct Supabase
          await updateDocumentStatus(payload.expenseClaimId, targetStatus, generalErrorJsonb, 'expense_claims');

          console.log(logMessage);
        } catch (updateError) {
          console.error('Failed to update expense claim with failure metadata:', updateError);
          // Continue to throw original error even if update fails
        }
      }

      // Throw user-friendly error for better UI experience
      throw new Error(userFriendlyError || (error instanceof Error ? error.message : 'Unknown error occurred'));
    }

    } catch (systemError) {
      // 🚨 GLOBAL CATCH - System-level failures (ENOENT, CONFIGURED_INCORRECTLY, etc.)
      console.error('🚨 SYSTEM-LEVEL FAILURE detected:', systemError);

      // 🔍 DETAILED ERROR LOGGING for debugging
      if (systemError instanceof Error) {
        console.error('🔍 Error name:', systemError.name);
        console.error('🔍 Error message:', systemError.message);
        console.error('🔍 Error stack:', systemError.stack);
        const errorWithCode = systemError as Error & { code?: string; cause?: unknown };
        if (errorWithCode.code) console.error('🔍 Error code:', errorWithCode.code);
        if (errorWithCode.cause) console.error('🔍 Error cause:', errorWithCode.cause);
      } else {
        console.error('🔍 Error type:', typeof systemError);
        console.error('🔍 Error value:', JSON.stringify(systemError, null, 2));
      }

      // Use the global error handler for system failures
      await handleTaskFailure(payload.expenseClaimId, systemError, 'system_task_execution');

      // Re-throw with user-friendly message
      let finalError = 'A system error occurred during receipt processing. Please try again or contact support if the issue persists.';

      if (systemError instanceof Error) {
        const errorWithCode = systemError as Error & { code?: string }
        if (errorWithCode.code === 'ENOENT' || systemError.message?.includes('ENOENT')) {
          finalError = 'AI processing service is not properly configured. Please contact support to resolve this issue.';
        } else if (systemError.message?.includes('CONFIGURED_INCORRECTLY')) {
          finalError = 'System configuration error. Please contact support to resolve this issue.';
        } else if (systemError.message?.includes('timeout') || systemError.message?.includes('maxDuration')) {
          finalError = 'Receipt processing timed out due to system issues. Please try again in a few moments.';
        }
      }

      throw new Error(finalError);
    }
  },
});